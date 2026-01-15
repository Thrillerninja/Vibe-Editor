import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  useReactFlow,
  useEdgesState,
  useNodesState,
  addEdge,
} from 'reactflow';
import posthog from '../../utils/posthog';
import { AnimatedNodeComponent } from './AnimatedNodeComponent';
import { useReparenting } from '../../hooks/useReparenting';
import { useLocalPhysics } from '../../hooks/useLocalPhysics';
import { useReordering } from '../../hooks/useReordering';
import { ReparentIndicator } from './ReparentIndicator';
import { buildTreeFromSentences, flattenTree } from '../../utils/treeParser';
import { pruneEmptyHierarchyBranches } from '../../utils/hierarchyIntegration';
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';
import { useFlowScreenConverters } from '../../utils/coords';
import { applyReordering } from '../../utils/sentenceEditor';
import { editSentence } from '../../utils/sentenceEditor';
import { markSentenceAndAncestorsDirty, removeSentenceFromHierarchy } from '../../utils/dirtyTracking';
import { normalizeEmotionProfile, deriveLegacyFromProfile } from '../../utils/emotionProfiles';
import { mergeTwoSentences } from '../../services/claude/claudeApi';
import { sortNodesByDocumentOrder } from '../../utils/hierarchyIntegration';
import { v4 as uuidv4 } from 'uuid';
// Move nodeTypes outside component to prevent recreation
const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner - Main tree visualization logic
 * Now works with sentences array as SSOT
 */
export function TreeInner({ sentences, onTreeUpdate }) {
  console.log('[TreeInner] Component rendering with', sentences.length, 'sentences');

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const [reparentTarget, setReparentTarget] = useState(null);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [openEmotionNodeId, setOpenEmotionNodeId] = useState(null);
  const [showDebugHitboxes, setShowDebugHitboxes] = useState(false);
  const rfRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const sentencesRef = useRef(sentences);
  const animateNextRef = useRef(false);

  // Keep sentences ref updated
  useEffect(() => {
    sentencesRef.current = sentences;
    console.log('[TreeInner] sentencesRef updated', sentences);
  }, [sentences]);

  // Log component mount/unmount for debugging
  useEffect(() => {
    console.log('[TreeInner] Component MOUNTED');
    return () => {
      console.log('[TreeInner] Component UNMOUNTED');
    };

  }, []);

  // Custom hooks
  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();
  const { onDropToReparent, findReparentTarget } = useReparenting();
  const physics = useLocalPhysics();
  const { checkReorderDrop, reorderNodes, findClosestSibling } = useReordering();
  const { flowToScreenPosition, setCenter, getZoom, zoomIn, zoomOut, fitView } = useReactFlow();

  // Toggle debug mode with 'D' key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F8') {
        setShowDebugHitboxes((prev) => !prev);
        console.log(`${LOG_PREFIX.DRAG} Debug hitboxes: ${!showDebugHitboxes}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebugHitboxes]);

  // Zoom and pan to node + dialog when emotion selector opens
  useEffect(() => {
    if (!openEmotionNodeId || !containerRef.current) return;

    const node = nodes.find(n => n.id === openEmotionNodeId);
    if (!node) return;

    console.log(`[Emotion] Focusing view on node ${openEmotionNodeId}`);

    // Get container dimensions
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = containerRect.width;
    const viewportHeight = containerRect.height;

    // Node dimensions
    const nodeWidth = node.width || 200;
    const nodeHeight = node.height || 60;

    // Dialog dimensions (from EmotionSelector)
    const dialogWidth = 380;
    const dialogHeight = 600; // Approximate height

    // Calculate the bounding box that includes both node and dialog
    // Dialog is positioned below the node (nodeBottom + 12px gap)
    const totalWidth = Math.max(nodeWidth, dialogWidth);
    const totalHeight = nodeHeight + 12 + dialogHeight; // node + gap + dialog

    // Center point between node and dialog area
    const centerX = node.position.x + nodeWidth / 2;
    const centerY = node.position.y + nodeHeight / 2 + (12 + dialogHeight / 2) / 2;

    // Calculate zoom level to fit both node and dialog
    const padding = 100; // Extra padding around the content
    const zoomX = viewportWidth / (totalWidth + padding * 2);
    const zoomY = viewportHeight / (totalHeight + padding * 2);
    const targetZoom = Math.min(zoomX, zoomY, 1.0); // Cap at 1.0 for max zoom

    // Smooth animation to center and zoom
    setTimeout(() => {
      setCenter(centerX, centerY, {
        zoom: targetZoom,
        duration: 400, // Smooth 400ms animation
      });
    }, 50); // Small delay to ensure node is rendered

  }, [openEmotionNodeId, nodes, setCenter]);

  // Build tree structure directly from sentences
  const flat = useMemo(() => {
    console.log(`${LOG_PREFIX.LAYOUT} Building tree from ${sentences.length} sentences`);
    const tree = buildTreeFromSentences(sentences);
    return flattenTree(tree);
  }, [sentences]);

  // Cleanup physics on unmount only - no dependencies to avoid loops
  useEffect(() => {
    return () => {
      console.log(`${LOG_PREFIX.PHYSICS} Component unmounting, cleaning up`);
      physics.stop();
    };
  }, []); // Empty deps - cleanup only on unmount

  // Track previous sentences to prevent unnecessary layout updates
  const prevSentencesRef = useRef(null);

  // Apply ELK layout when sentences actually change
  useEffect(() => {
    // Don't update layout while dragging
    if (isDraggingRef.current) {
      console.log(`${LOG_PREFIX.LAYOUT} Skipping layout update (dragging)`);
      return;
    }

    // Check if sentences actually changed (avoid re-layout on re-renders)
    // Include hierarchy metadata since that affects the tree structure
    const sentencesKey = JSON.stringify({
      sentences: sentences.map(s => ({
        id: s.id,
        content: s.content,
        parentId: s.parentId,
        emotion: s.emotion,
        intensity: s.intensity,
        emotions: s.emotions,
      })),
      hierarchyMeta: sentences._hierarchyMeta ? {
        maxLevel: sentences._hierarchyMeta.maxLevel,
        nodeCount: sentences._hierarchyMeta.nodes?.length || 0,
        dirtyCount: sentences._hierarchyMeta.dirtyNodeIds?.length || 0,
        rootTitle: sentences._hierarchyMeta.rootTitle
      } : null
    });

    if (prevSentencesRef.current === sentencesKey) {
      console.log(`${LOG_PREFIX.LAYOUT} Sentences unchanged, skipping layout`);
      return;
    }

    prevSentencesRef.current = sentencesKey;

    const applyLayout = async () => {
      // Rebuild tree inside effect to avoid stale closure
      const tree = buildTreeFromSentences(sentences);
      const flatStructure = flattenTree(tree);

      console.log(`${LOG_PREFIX.LAYOUT} Applying layout for ${flatStructure.nodes.length} nodes`);

      // Preserve ONLY metadata (emotion, intensity) from existing nodes
      // Always use NEW label/content from flatStructure.nodes
      // Use getNodes() to get current nodes without adding to dependencies
      const currentNodes = rfRef.current?.getNodes() || [];
      const withData = flatStructure.nodes.map((n) => {
        const existing = currentNodes.find((x) => x.id === n.id);
        if (existing && existing.data) {
          return {
            ...n,
            data: {
              ...n.data, // New data (label, content, type, etc.)
              // Preserve only emotion metadata from existing IF not already in new data
              emotion: n.data.emotion || existing.data.emotion,
              emotions: n.data.emotions || existing.data.emotions,
              intensity: n.data.intensity !== undefined ? n.data.intensity : existing.data.intensity,
            },
          };
        }
        return n;
      });

      const laidOut = await runElk(withData, flatStructure.edges);

      // Check if we should apply the layout
      // Apply if: not dragging AND sentences are still the same
      // Don't use cancelled flag - React Strict Mode unmount/remount would block it
      const currentSentencesKey = JSON.stringify({
        sentences: sentencesRef.current.map(s => ({
          id: s.id,
          content: s.content,
          parentId: s.parentId,
          emotion: s.emotion,
          intensity: s.intensity,
          emotions: s.emotions,
        })),
        hierarchyMeta: sentencesRef.current._hierarchyMeta ? {
          maxLevel: sentencesRef.current._hierarchyMeta.maxLevel,
          nodeCount: sentencesRef.current._hierarchyMeta.nodes?.length || 0,
          dirtyCount: sentencesRef.current._hierarchyMeta.dirtyNodeIds?.length || 0,
          rootTitle: sentencesRef.current._hierarchyMeta.rootTitle
        } : null
      });

      const sentencesStillSame = currentSentencesKey === sentencesKey;
      const shouldApply = !isDraggingRef.current && sentencesStillSame;

      if (shouldApply) {
        console.log(`${LOG_PREFIX.LAYOUT} Setting ${laidOut.length} nodes`);
        if (animateNextRef.current && containerRef.current) {
          containerRef.current.classList.add('rf-animate-drop');
        }
        setNodes(laidOut);
        if (animateNextRef.current && containerRef.current) {
          setTimeout(() => {
            containerRef.current?.classList.remove('rf-animate-drop');
            animateNextRef.current = false;
          }, 300);
        }
        setEdges(flatStructure.edges);
      } else {
        console.log(`${LOG_PREFIX.LAYOUT} Layout not applied (dragging: ${isDraggingRef.current}, sentencesChanged: ${!sentencesStillSame})`);
      }
    };

    applyLayout();

    // Cleanup function doesn't need to do anything
    // Layout will only apply if sentences are still valid
  }, [sentences, setNodes, setEdges]);

  /**
   * ReactFlow initialization callback
   */
  const onInit = useCallback((instance) => {
    console.log(`${LOG_PREFIX.DRAG} ReactFlow initialized`);
    rfRef.current = instance;
  }, []);

  /**
   * Node drag start handler
   */
  const onNodeDragStart = useCallback(
    (event, node) => {
      console.log(`${LOG_PREFIX.DRAG} Drag start: ${node.id}`);
      isDraggingRef.current = true;

      // Close emotion modal when dragging ANY node
      setOpenEmotionNodeId(null);

      // Start physics and sync initial position
      physics.start(node.id);
      physics.updateDraggedPosition(node.position.x, node.position.y);
    },
    [physics]
  );

  /**
   * Helper to check if a node is a leaf sentence
   */
  const isSentenceNode = useCallback((node) => {
    return node && node.data && node.data.type === 'sentence';
  }, []);

  /**
   * Helper to check if a node is a group/parent node
   */
  const isGroupNode = useCallback((node) => {
    return node && node.data && node.data.type === 'group';
  }, []);

  /**
   * Find merge target - checks if dragging a node over another node of the same type
   * Supports both sentence-to-sentence and group-to-group merging
   */
  const findMergeTarget = useCallback((draggedId, x, y) => {
    const draggedNode = nodes.find(n => n.id === draggedId);
    if (!draggedNode) return null;

    const isDraggedSentence = isSentenceNode(draggedNode);
    const isDraggedGroup = isGroupNode(draggedNode);

    // Only allow merging for sentences or groups
    if (!isDraggedSentence && !isDraggedGroup) {
      return null;
    }

    // Find if hovering over another node of the same type
    for (const node of nodes) {
      if (node.id === draggedId) continue;
      
      // Check type compatibility: sentence with sentence, or group with group
      const isTargetSentence = isSentenceNode(node);
      const isTargetGroup = isGroupNode(node);
      
      const canMerge = (isDraggedSentence && isTargetSentence) || (isDraggedGroup && isTargetGroup);
      if (!canMerge) continue;

      const nodeWidth = node.width || 200;
      const nodeHeight = node.height || 60;

      // Check if dragged position is within this node's bounds
      if (
        x >= node.position.x &&
        x <= node.position.x + nodeWidth &&
        y >= node.position.y &&
        y <= node.position.y + nodeHeight
      ) {
        return node;
      }
    }

    return null;
  }, [nodes, isSentenceNode, isGroupNode]);

  /**
 * Node drag handler (during drag)
 */
  const onNodeDrag = useCallback(
    (event, node) => {
      // Sync physics simulation
      physics.updateDraggedPosition(node.position.x, node.position.y);

      // Check for merge target first (highest priority for sentences)
      const mergeTargetNode = findMergeTarget(node.id, node.position.x, node.position.y);
      
      if (mergeTargetNode) {
        // Merge takes priority for sentence nodes
        const screenPos = toScreenPoint({ x: mergeTargetNode.position.x, y: mergeTargetNode.position.y });
        const screenSize = toScreenSize({
          width: mergeTargetNode.width || 200,
          height: mergeTargetNode.height || 60,
        });
        
        console.log(
          `${LOG_PREFIX.DRAG} 🟣 MERGE INDICATOR ACTIVE:`,
          `\n  Dragged: ${node.id}`,
          `\n  Target: ${mergeTargetNode.id}`,
          `\n  Target label: "${mergeTargetNode.data.label.substring(0, 30)}..."`,
          `\n  Screen pos: (${screenPos.x.toFixed(1)}, ${screenPos.y.toFixed(1)})`
        );

        setMergeTarget({
          node: mergeTargetNode,
          screenPosition: screenPos,
          screenSize: screenSize,
        });
        setReorderIndicator(null);
        setReparentTarget(null);
        return;
      }

      // Clear merge target if not hovering
      setMergeTarget(null);

      // Check for closest sibling to show reorder indicator
      const closest = findClosestSibling(node.id, node.position.y);

      if (closest) {
        // Sibling reordering takes priority
        const screenPos = toScreenPoint({
          x: closest.node.position.x,
          y: closest.node.position.y,
        });
        const screenSize = toScreenSize({ width: closest.node.width ?? 200, height: closest.node.height ?? 60 });

        console.log(
          `${LOG_PREFIX.DRAG} 🔵 REORDER INDICATOR ACTIVE:`,
          `\n  Target: ${closest.node.id}`,
          `\n  Insert ${closest.insertBefore ? 'BEFORE' : 'AFTER'}`,
          `\n  Screen pos: (${screenPos.x.toFixed(1)}, ${screenPos.y.toFixed(1)})`,
          `\n  Flow pos: (${closest.node.position.x.toFixed(1)}, ${closest.node.position.y.toFixed(1)})`
        );

        setReorderIndicator({
          x: screenPos.x + screenSize.width / 2,
          y: screenPos.y + (closest.insertBefore ? 0 : screenSize.height), // top or bottom edge
          width: screenSize.width, // scale line width with zoom
          isAbove: closest.insertBefore,
        });
        setReparentTarget(null);
      } else {
        // Check for reparenting target
        setReorderIndicator(null);

        const target = findReparentTarget(node.id, node.position.x, node.position.y);
        if (target) {
          const screenPos = toScreenPoint({ x: target.position.x, y: target.position.y });
          const screenSize = toScreenSize({
            width: target.width || 200,
            height: target.height || 60,
          });
          console.log(
            `${LOG_PREFIX.DRAG} 🟢 REPARENT INDICATOR ACTIVE:`,
            `\n  Target: ${target.id}`,
            `\n  Target label: "${target.data.label.substring(0, 30)}..."`,
            `\n  Screen pos: (${screenPos.x.toFixed(1)}, ${screenPos.y.toFixed(1)})`,
            `\n  Flow pos: (${target.position.x.toFixed(1)}, ${target.position.y.toFixed(1)})`,
            `\n  Target size: ${target.width}x${target.height}`
          );

          setReparentTarget({
            node: target,
            screenPosition: screenPos,
            screenSize: screenSize,
          });
        } else {
          setReparentTarget(null);
        }
      }
    },
    [physics, findClosestSibling, findReparentTarget, findMergeTarget, toScreenPoint, toScreenSize, flowToScreenPosition]
  );

  /**
   * Merge two sentence nodes into one
   * Creates immediate merged node, then updates with AI result
   */
  const mergeSentenceNodes = useCallback(
    async (draggedId, targetId) => {
      console.log(`${LOG_PREFIX.DRAG} Merging sentences: ${draggedId} + ${targetId}`);

      const current = sentencesRef.current;
      const draggedSentence = current.find(s => s.id === draggedId);
      const targetSentence = current.find(s => s.id === targetId);

      if (!draggedSentence || !targetSentence) {
        console.error(`${LOG_PREFIX.DRAG} Cannot merge: sentence not found`);
        return;
      }

      // Create immediate merged sentence (concatenated)
      const mergedId = uuidv4();
      const immediateMergedContent = `${draggedSentence.content} ${targetSentence.content}`;
      
      // Use target sentence's emotion profile
      const mergedSentence = {
        id: mergedId,
        type: 'sentence',
        content: immediateMergedContent,
        emotion: targetSentence.emotion,
        intensity: targetSentence.intensity,
        emotions: targetSentence.emotions,
        punctuation: targetSentence.punctuation,
        delimiter: targetSentence.delimiter,
        delimiterContent: targetSentence.delimiterContent,
      };

      console.log(`${LOG_PREFIX.DRAG} Immediate merged content: "${immediateMergedContent}"`);

      // Remove both old sentences and insert merged one at target position
      const targetIndex = current.indexOf(targetSentence);
      const filtered = current.filter(s => s.id !== draggedId && s.id !== targetId);
      filtered.splice(targetIndex, 0, mergedSentence);

      // Update hierarchy metadata
      let updatedSentences = filtered;
      if (current._hierarchyMeta) {
        const meta = { ...current._hierarchyMeta };
        const nodes = meta.nodes ? meta.nodes.map(n => ({ ...n, childIds: [...n.childIds] })) : [];

        // Find parent nodes containing the old sentences
        const draggedParent = nodes.find(n => n.childIds.includes(draggedId));
        const targetParent = nodes.find(n => n.childIds.includes(targetId));

        if (draggedParent && targetParent) {
          // Remove dragged sentence from its parent
          const draggedIdx = draggedParent.childIds.indexOf(draggedId);
          if (draggedIdx !== -1) {
            draggedParent.childIds.splice(draggedIdx, 1);
          }

          // Replace target sentence with merged sentence in target parent
          const targetIdx = targetParent.childIds.indexOf(targetId);
          if (targetIdx !== -1) {
            targetParent.childIds[targetIdx] = mergedId;
          }

          // Mark parents as dirty
          const dirtyNodeIds = new Set(meta.dirtyNodeIds || []);
          const dirtySentenceIds = new Set(meta.dirtySentenceIds || []);
          
          dirtyNodeIds.add(draggedParent.id);
          dirtyNodeIds.add(targetParent.id);
          dirtySentenceIds.add(mergedId);

          // Mark ancestors dirty
          let currentId = targetParent.id;
          while (currentId && currentId !== 'root') {
            const parent = nodes.find(n => n.childIds.includes(currentId));
            if (parent) {
              dirtyNodeIds.add(parent.id);
              currentId = parent.id;
            } else {
              dirtyNodeIds.add('root');
              break;
            }
          }

          meta.nodes = nodes;
          meta.dirtyNodeIds = Array.from(dirtyNodeIds);
          meta.dirtySentenceIds = Array.from(dirtySentenceIds);
        }

        updatedSentences._hierarchyMeta = meta;
      }

      // Update UI immediately with concatenated version
      console.log(`${LOG_PREFIX.DRAG} Updating UI with immediate merged sentence`);
      onTreeUpdate(updatedSentences);

      // Call AI to get intelligent merge (async, don't block UI)
      console.log(`${LOG_PREFIX.DRAG} Starting AI merge in background...`);
      try {
        const aiMergedContent = await mergeTwoSentences(
          draggedSentence.content,
          targetSentence.content,
          targetSentence.emotions || { interest: 50 }
        );

        console.log(`${LOG_PREFIX.DRAG} AI merge complete: "${aiMergedContent}"`);

        // Update the merged sentence with AI result
        const currentSentences = sentencesRef.current;
        const edited = editSentence(mergedId, aiMergedContent, currentSentences);
        const marked = markSentenceAndAncestorsDirty(edited, mergedId);

        console.log(`${LOG_PREFIX.DRAG} Updating UI with AI-merged sentence`);
        onTreeUpdate(marked);
      } catch (error) {
        console.error(`${LOG_PREFIX.DRAG} AI merge failed:`, error);
        // Keep the concatenated version if AI fails
      }
    },
    [onTreeUpdate]
  );

  /**
   * Merge two group nodes into one
   * Combines their children and updates hierarchy metadata
   */
  const mergeGroupNodes = useCallback(
    async (draggedId, targetId) => {
      console.log(`${LOG_PREFIX.DRAG} Merging group nodes: ${draggedId} + ${targetId}`);

      const current = sentencesRef.current;
      if (!current._hierarchyMeta) {
        console.error(`${LOG_PREFIX.DRAG} Cannot merge groups: no hierarchy metadata`);
        return;
      }

      const meta = { ...current._hierarchyMeta };
      const nodes = meta.nodes ? meta.nodes.map(n => ({ ...n, childIds: [...n.childIds] })) : [];

      // Find the dragged and target group nodes
      const draggedNode = nodes.find(n => n.id === draggedId);
      const targetNode = nodes.find(n => n.id === targetId);

      if (!draggedNode || !targetNode) {
        console.error(`${LOG_PREFIX.DRAG} Cannot merge: group node not found`);
        return;
      }

      console.log(`${LOG_PREFIX.DRAG} Dragged node: ${draggedNode.label} (${draggedNode.childIds.length} children)`);
      console.log(`${LOG_PREFIX.DRAG} Target node: ${targetNode.label} (${targetNode.childIds.length} children)`);

      // Create merged group node
      const mergedId = uuidv4();
      const immediateMergedLabel = `${draggedNode.label} & ${targetNode.label}`;
      
      // Combine children from both nodes IN DOCUMENT ORDER
      // We need to sort the children by their minimum sentence position
      const sentenceIds = new Set(current.map(s => s.id));
      const sentencePositions = new Map();
      current.forEach((s, idx) => {
        sentencePositions.set(s.id, idx);
      });

      // Helper to get minimum sentence position for a node (recursively)
      const getMinPosition = (nodeId) => {
        // If it's a sentence, return its position
        if (sentenceIds.has(nodeId)) {
          return sentencePositions.get(nodeId);
        }
        
        // It's a group node - find min position from children
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return Infinity;
        
        let minPos = Infinity;
        for (const childId of node.childIds) {
          const childMinPos = getMinPosition(childId);
          minPos = Math.min(minPos, childMinPos);
        }
        return minPos;
      };

      // Determine which node comes first in document order
      const draggedMinPos = getMinPosition(draggedId);
      const targetMinPos = getMinPosition(targetId);
      
      // Combine children in document order (earlier node's children first)
      const allChildren = draggedMinPos < targetMinPos 
        ? [...draggedNode.childIds, ...targetNode.childIds]
        : [...targetNode.childIds, ...draggedNode.childIds];
      
      // Sort all children by document order to ensure correctness
      const mergedChildren = allChildren.sort((a, b) => {
        const posA = getMinPosition(a);
        const posB = getMinPosition(b);
        return posA - posB;
      });

      console.log(`${LOG_PREFIX.DRAG} Merged ${mergedChildren.length} children in document order`);
      console.log(`${LOG_PREFIX.DRAG} Dragged node min position: ${draggedMinPos}, Target node min position: ${targetMinPos}`);

      const mergedNode = {
        id: mergedId,
        type: 'group',
        level: targetNode.level,
        label: immediateMergedLabel,
        childIds: mergedChildren,
        emotion: targetNode.emotion,
        intensity: targetNode.intensity,
        emotions: targetNode.emotions,
      };

      console.log(`${LOG_PREFIX.DRAG} Merged node will have ${mergedChildren.length} children`);

      // Find parent of target node to insert merged node
      const targetParent = nodes.find(n => n.childIds.includes(targetId));
      const draggedParent = nodes.find(n => n.childIds.includes(draggedId));

      // Remove both old nodes from the nodes array
      let updatedNodes = nodes.filter(n => n.id !== draggedId && n.id !== targetId);

      // Add the merged node
      updatedNodes.push(mergedNode);

      // Update parent references
      if (targetParent) {
        const targetParentNode = updatedNodes.find(n => n.id === targetParent.id);
        if (targetParentNode) {
          // Replace target node with merged node in parent's childIds
          const targetIdx = targetParentNode.childIds.indexOf(targetId);
          if (targetIdx !== -1) {
            targetParentNode.childIds[targetIdx] = mergedId;
          }
        }
      } else {
        // If no parent, this is a top-level node - no parent update needed
        console.log(`${LOG_PREFIX.DRAG} Target node ${targetId} is top-level (no parent)`);
      }

      if (draggedParent && draggedParent.id !== targetParent?.id) {
        const draggedParentNode = updatedNodes.find(n => n.id === draggedParent.id);
        if (draggedParentNode) {
          // Remove dragged node from its parent's childIds
          draggedParentNode.childIds = draggedParentNode.childIds.filter(id => id !== draggedId);
        }
      } else if (draggedParent && draggedParent.id === targetParent?.id) {
        // Both nodes have the same parent - already handled above
        console.log(`${LOG_PREFIX.DRAG} Both nodes share parent ${draggedParent.id}`);
      } else if (!draggedParent) {
        // Dragged node is also top-level
        console.log(`${LOG_PREFIX.DRAG} Dragged node ${draggedId} is top-level (no parent)`);
      }

      // DON'T mark the merged node as dirty - it's a final result, not something to regenerate
      // Also clear dirty flags from all descendants to prevent AI from restructuring them
      const dirtyNodeIds = new Set(meta.dirtyNodeIds || []);
      const dirtySentenceIds = new Set(meta.dirtySentenceIds || []);
      
      // Remove the old nodes from dirty tracking if they were there
      dirtyNodeIds.delete(draggedId);
      dirtyNodeIds.delete(targetId);
      
      // CRITICAL: Remove all descendants from dirty tracking to preserve the merge
      // If any child is marked dirty, AI will restructure and potentially split the merge
      const clearDirtyDescendants = (nodeId) => {
        // If it's a sentence, remove from dirty sentences
        if (sentenceIds.has(nodeId)) {
          dirtySentenceIds.delete(nodeId);
          return;
        }
        
        // If it's a node, remove from dirty nodes and recurse to children
        const node = updatedNodes.find(n => n.id === nodeId);
        if (node) {
          dirtyNodeIds.delete(node.id);
          for (const childId of node.childIds) {
            clearDirtyDescendants(childId);
          }
        }
      };
      
      // Clear dirty flags from all children of the merged node
      for (const childId of mergedChildren) {
        clearDirtyDescendants(childId);
      }
      
      // CRITICAL: Also clear dirty flag from the parent of the merged node
      // If the parent is dirty, AI will restructure the entire parent's subtree,
      // which would undo the merge by regenerating the structure
      if (targetParent) {
        dirtyNodeIds.delete(targetParent.id);
        console.log(`${LOG_PREFIX.DRAG} Cleared dirty flag from parent ${targetParent.id}`);
      }
      if (draggedParent && draggedParent.id !== targetParent?.id) {
        dirtyNodeIds.delete(draggedParent.id);
        console.log(`${LOG_PREFIX.DRAG} Cleared dirty flag from dragged parent ${draggedParent.id}`);
      }
      
      console.log(`${LOG_PREFIX.DRAG} Cleared dirty flags from merged node, all descendants, and parents`);
      
      // Don't mark anything as dirty to preserve the merge

      // CRITICAL: Sort all nodes by document order to ensure hierarchy consistency
      const sortedNodes = sortNodesByDocumentOrder(updatedNodes, current);
      
      meta.nodes = sortedNodes;
      meta.dirtyNodeIds = Array.from(dirtyNodeIds);
      meta.dirtySentenceIds = Array.from(dirtySentenceIds);

      // CRITICAL: Rebuild sentence order from the updated hierarchy
      // This ensures sentences are in the correct document order after the merge
      console.log(`${LOG_PREFIX.DRAG} Rebuilding sentence order from merged hierarchy`);
      const { rebuildSentenceOrderFromHierarchy } = await import('../../utils/sentenceEditor');
      const reorderedSentences = rebuildSentenceOrderFromHierarchy(current, sortedNodes, meta.maxLevel);
      reorderedSentences._hierarchyMeta = meta;

      // Update UI immediately
      console.log(`${LOG_PREFIX.DRAG} Updating UI with merged group node and reordered sentences`);
      onTreeUpdate(reorderedSentences);

      // Call AI to get intelligent merged label (async, don't block UI)
      console.log(`${LOG_PREFIX.DRAG} Starting AI merge for group labels in background...`);
      try {
        const aiMergedLabel = await mergeTwoSentences(
          draggedNode.label,
          targetNode.label,
          targetNode.emotions || { interest: 50 }
        );

        console.log(`${LOG_PREFIX.DRAG} AI merge complete for group: "${aiMergedLabel}"`);

        // Update the merged node's label with AI result
        const currentSentences = sentencesRef.current;
        if (currentSentences._hierarchyMeta) {
          const currentMeta = { ...currentSentences._hierarchyMeta };
          const currentNodes = currentMeta.nodes.map(n => 
            n.id === mergedId ? { ...n, label: aiMergedLabel } : n
          );
          currentMeta.nodes = currentNodes;

          const updated = [...currentSentences];
          updated._hierarchyMeta = currentMeta;

          console.log(`${LOG_PREFIX.DRAG} Updating UI with AI-merged group label`);
          onTreeUpdate(updated);
        }
      } catch (error) {
        console.error(`${LOG_PREFIX.DRAG} AI merge failed for group:`, error);
        // Keep the concatenated version if AI fails
      }
    },
    [onTreeUpdate]
  );

  /**
   * Node drag stop handler
   */
  const onNodeDragStop = useCallback(
    (event, node) => {
      console.log(`${LOG_PREFIX.DRAG} Drag stop: ${node.id}`);
      isDraggingRef.current = false;
      setReorderIndicator(null);
      setReparentTarget(null);
      setMergeTarget(null);
      // Animate the next layout update triggered by this drop
      animateNextRef.current = true;

      // Check for merge first (highest priority)
      if (mergeTarget) {
        const isSentenceMerge = isSentenceNode(node) && isSentenceNode(mergeTarget.node);
        const isGroupMerge = isGroupNode(node) && isGroupNode(mergeTarget.node);

        if (isSentenceMerge) {
          console.log(`${LOG_PREFIX.DRAG} Sentence merge detected: merging sentences`);
          
          // Stop physics
          physics.stop();

          // Perform sentence merge
          mergeSentenceNodes(node.id, mergeTarget.node.id);
          
          // Re-layout will happen automatically via useEffect when sentences change
          return;
        } else if (isGroupMerge) {
          console.log(`${LOG_PREFIX.DRAG} Group merge detected: merging group nodes`);
          
          // Stop physics
          physics.stop();

          // Perform group merge
          mergeGroupNodes(node.id, mergeTarget.node.id);
          
          // Re-layout will happen automatically via useEffect when hierarchy changes
          return;
        }
      }

      // Check for reordering (tighter threshold)
      const reorderInfo = checkReorderDrop(node.id, node.position.y);

      if (reorderInfo) {
        // This is a reorder operation
        console.log(`${LOG_PREFIX.DRAG} Reorder detected: applying to sentences`);

        // Apply reordering to sentences array using ref
        const updatedSentences = applyReordering(
          sentencesRef.current,
          node.id,
          reorderInfo.targetSiblingId,
          reorderInfo.insertBefore
        );

        // Prune empty hierarchy branches (no sentence leaves)
        const pruned = pruneEmptyHierarchyBranches(updatedSentences);

        // Update parent component's state
        if (onTreeUpdate) {
          onTreeUpdate(pruned);
        }

        // Stop physics
        physics.stop();

        // Re-layout will happen automatically via useEffect when sentences change
      } else {
        // Try reparenting (different parent)
        console.log(`${LOG_PREFIX.DRAG} Attempting reparent`);
        onDropToReparent(node.id, node.position.x, node.position.y);

        // Stop physics
        physics.stop();

        // Also prune empty branches after potential reparenting
        const prunedAfterReparent = pruneEmptyHierarchyBranches(sentencesRef.current);
        if (onTreeUpdate && prunedAfterReparent !== sentencesRef.current) {
          onTreeUpdate(prunedAfterReparent);
        }

        // Re-layout after reparent
        setTimeout(async () => {
          if (!isDraggingRef.current) {
            console.log(`${LOG_PREFIX.LAYOUT} Re-layouting after reparent`);
            const laidOut = await runElk(
              rfRef.current.getNodes(),
              rfRef.current.getEdges()
            );
            if (animateNextRef.current && containerRef.current) {
              containerRef.current.classList.add('rf-animate-drop');
            }
            setNodes(laidOut);
            if (animateNextRef.current && containerRef.current) {
              setTimeout(() => {
                containerRef.current?.classList.remove('rf-animate-drop');
                animateNextRef.current = false;
              }, 300);
            }
          }
        }, 50);
      }
    },
    [checkReorderDrop, reorderNodes, onDropToReparent, physics, setNodes, onTreeUpdate, mergeTarget, isSentenceNode, isGroupNode, mergeSentenceNodes, mergeGroupNodes]
  );

  /**
   * Edge connection handler
   */
  const onConnect = useCallback(
    (params) => {
      console.log(`${LOG_PREFIX.REPARENT} Manual connection: ${params.source} → ${params.target}`);
      setEdges((eds) => addEdge({ ...params, animated: false }, eds));
    },
    [setEdges]
  );



  const applyNodeSentenceEdit = useCallback(
    (nodeId, newContent, emotionProfile) => {
      console.log(`[TreeInner] Node ${nodeId} content edit: "${newContent}"`);
      const profile = normalizeEmotionProfile(emotionProfile);
      const legacy = deriveLegacyFromProfile(profile);

      const current = sentencesRef.current;
      const originalSentence = current.find(s => s.id === nodeId);
      const contentChanged = originalSentence && originalSentence.content !== newContent;

      // Update the sentences array with new content
      const edited = editSentence(nodeId, newContent, current);

      // Attach emotion profile to the edited sentence
      const withEmotions = edited.map((s) =>
        s.id === nodeId
          ? { ...s, emotions: profile, emotion: legacy.emotion, intensity: legacy.intensity }
          : s
      );
      // Preserve hierarchy metadata
      if (edited._hierarchyMeta) {
        withEmotions._hierarchyMeta = edited._hierarchyMeta;
      }

      // Only mark as dirty if content actually changed
      const result = contentChanged ? markSentenceAndAncestorsDirty(withEmotions, nodeId) : withEmotions;

      // Use onTreeUpdate to centralize updates and history handling
      onTreeUpdate(result);
    }
  );

  const applyEmotionToNode = useCallback(
    (nodeId, emotion, intensity) => {
      console.log(`[TreeInner] Applying emotion to node ${nodeId}: ${emotion} (${intensity})`);
      // Update node data with emotion
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
              ...n,
              data: {
                ...n.data, 
                emotion,
                intensity,
              }, 
            }
            : n
        )
      );
    });

  // Get all descendant sentence leaf nodes under a given nodeId
  const getSubtreeLeaves = useCallback((nodeId) => {
    const sentences = sentencesRef.current;
    const meta = sentences._hierarchyMeta;
    if (!meta || !Array.isArray(meta.nodes)) {
      // No hierarchy → all sentences are considered leaves under root
      if (nodeId === 'root') return sentences.map(s => ({ id: s.id, content: s.content }));
      // If nodeId is a sentence itself
      const sentence = sentences.find(s => s.id === nodeId);
      return sentence ? [{ id: sentence.id, content: sentence.content }] : [];
    }

    const nodeMap = new Map(meta.nodes.map(n => [n.id, n]));
    const sentenceIds = new Set(sentences.map(s => s.id));
    const resultIds = new Set();
    const queue = [];

    if (nodeId === 'root') {
      const topLevel = meta.nodes.filter(n => n.level === meta.maxLevel);
      queue.push(...topLevel.map(n => n.id));
    } else {
      queue.push(nodeId);
    }

    while (queue.length) {
      const cur = queue.shift();
      const node = nodeMap.get(cur);
      if (!node) {
        // cur might be a sentence ID
        if (sentenceIds.has(cur)) {
          resultIds.add(cur);
        }
        continue;
      }
      for (const cid of node.childIds || []) {
        if (sentenceIds.has(cid)) {
          resultIds.add(cid);
        } else {
          queue.push(cid);
        }
      }
    }

    return sentences
      .filter(s => resultIds.has(s.id))
      .map(s => ({ id: s.id, content: s.content }));
  }, []);

  // Apply subtree changes: set emotion for all descendants and update leaf contents per map
  const applySubtreeChanges = useCallback((nodeId, newProfile, leafEditsMap) => {
    const current = sentencesRef.current;
    const profile = normalizeEmotionProfile(newProfile);
    const legacy = deriveLegacyFromProfile(profile);
    const updated = current.map(s => ({ ...s }));
    const meta = current._hierarchyMeta ? { ...current._hierarchyMeta } : null;
    const nodeMap = meta && Array.isArray(meta.nodes) ? new Map(meta.nodes.map(n => [n.id, { ...n }])) : null;

    // Track if any content actually changed
    let anyContentChanged = false;

    // Collect descendants (groups and sentences)
    const sentenceIds = new Set(updated.map(s => s.id));
    const descendantsSentences = new Set();
    const descendantsGroups = new Set();

    const enqueueChildren = (startId) => {
      if (!nodeMap) {
        // No hierarchy → all sentences under root
        if (startId === 'root') {
          updated.forEach(s => descendantsSentences.add(s.id));
        }
        return;
      }
      const queue = [];
      if (startId === 'root') {
        const topLevel = meta.nodes.filter(n => n.level === meta.maxLevel);
        queue.push(...topLevel.map(n => n.id));
      } else {
        queue.push(startId);
      }
      while (queue.length) {
        const cur = queue.shift();
        const node = nodeMap.get(cur);
        if (!node) {
          if (sentenceIds.has(cur)) descendantsSentences.add(cur);
          continue;
        }
        descendantsGroups.add(cur);
        for (const cid of node.childIds || []) {
          if (sentenceIds.has(cid)) {
            descendantsSentences.add(cid);
          } else {
            queue.push(cid);
          }
        }
      }
    };

    enqueueChildren(nodeId);

    // Apply emotion to sentences and check for content changes
    const editedSentenceIds = [];
    updated.forEach(s => {
      if (descendantsSentences.has(s.id)) {
        s.emotions = profile;
        s.emotion = legacy.emotion;
        s.intensity = legacy.intensity;
        if (leafEditsMap && leafEditsMap[s.id]) {
          if (s.content !== leafEditsMap[s.id]) {
            anyContentChanged = true;
          }
          s.content = leafEditsMap[s.id];
          editedSentenceIds.push(s.id);
        }
      }
    });

    // Apply emotion to group nodes
    if (nodeMap) {
      descendantsGroups.forEach(gid => {
        const node = nodeMap.get(gid);
        if (node) {
          node.emotions = profile;
          node.emotion = legacy.emotion;
          node.intensity = legacy.intensity;
        }
      });
      // Also set on target group itself if present
      const target = nodeMap.get(nodeId);
      if (target) {
        target.emotions = profile;
        target.emotion = legacy.emotion;
        target.intensity = legacy.intensity;
      }
      meta.nodes = Array.from(nodeMap.values());
    }

    // Root emotion update
    if (nodeId === 'root') {
      if (meta) {
        meta.rootEmotions = profile;
        meta.rootEmotion = legacy.emotion;
        meta.rootIntensity = legacy.intensity;
      }
    }

    // Mark current subtree and all ancestors as dirty ONLY if content changed
    if (anyContentChanged && meta) {
      const dirtyNodeIds = new Set(meta.dirtyNodeIds || []);
      const dirtySentenceIds = new Set(meta.dirtySentenceIds || []);

      // Mark all descendant sentences dirty
      descendantsSentences.forEach(sid => dirtySentenceIds.add(sid));
      // Mark all descendant group nodes dirty
      descendantsGroups.forEach(nid => dirtyNodeIds.add(nid));
      // Mark the selected node itself dirty if it's a group node
      if (nodeMap && nodeMap.has(nodeId)) {
        dirtyNodeIds.add(nodeId);
      }
      // If selected is a sentence id, mark it dirty as well
      if (sentenceIds.has(nodeId)) {
        dirtySentenceIds.add(nodeId);
      }

      // Mark ancestors up to root dirty
      const markAncestors = (startId) => {
        if (!nodeMap) {
          // Without hierarchy meta, we cannot traverse; mark root only if editing root
          if (startId === 'root') dirtyNodeIds.add('root');
          return;
        }
        let currentId = startId;
        while (currentId && currentId !== 'root') {
          let parent = null;
          for (const node of nodeMap.values()) {
            if (Array.isArray(node.childIds) && node.childIds.includes(currentId)) {
              parent = node;
              break;
            }
          }
          if (parent) {
            dirtyNodeIds.add(parent.id);
            currentId = parent.id;
          } else {
            // No parent found in hierarchy: mark root
            dirtyNodeIds.add('root');
            break;
          }
        }
        // If the start is root itself, ensure root is marked
        if (startId === 'root') {
          dirtyNodeIds.add('root');
        }
      };

      markAncestors(nodeId);

      meta.dirtyNodeIds = Array.from(dirtyNodeIds);
      meta.dirtySentenceIds = Array.from(dirtySentenceIds);
    }

    const result = updated;
    if (meta) {
      result._hierarchyMeta = meta;
    }

    onTreeUpdate(result);
  }, [onTreeUpdate]);

  // Delete a sentence node and update hierarchy metadata
  const deleteNodeSentence = useCallback((nodeId) => {
    console.log(`[TreeInner] Deleting node ${nodeId}`);
    const current = sentencesRef.current;
    
    // Update hierarchy metadata (removes from parent chains, marks dirty)
    const afterMeta = current._hierarchyMeta
      ? removeSentenceFromHierarchy(current, nodeId)
      : current;

    // Remove the sentence from the list
    const filtered = current.filter(s => s.id !== nodeId);
    if (afterMeta && afterMeta._hierarchyMeta) {
      filtered._hierarchyMeta = afterMeta._hierarchyMeta;
    }

    // Immediately remove the node and related edges from ReactFlow state
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));

    // Push update to parent
    onTreeUpdate(filtered);
  }, [onTreeUpdate, setNodes, setEdges]);
    
  // Pass emotion handler and position to nodes via data
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          applyNodeSentenceEdit: applyNodeSentenceEdit,
          applyEmotionToNode: applyEmotionToNode,
          getSubtreeLeaves: getSubtreeLeaves,
          applySubtreeChanges: applySubtreeChanges,
          deleteNodeSentence: deleteNodeSentence,
          nodePosition: node.position, // Pass position for screen calculation
        },
      })),
    [nodes, openEmotionNodeId]
  );

  const controlButtonStyle = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: 'white',
    color: '#374151',
  };

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <ReactFlow
        nodes={nodesWithHandlers}
        edges={edges}
        onInit={onInit}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
        elevateEdgesOnSelect
        minZoom={0.2}
        maxZoom={1.5}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" color="#e0e3e7ff" gap={40} size={4} />
        <MiniMap pannable zoomable position="bottom-left" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {/* Reorder indicator - blue line between siblings */}
      {reorderIndicator && (
        <div
          style={{
            position: 'fixed',
            left: reorderIndicator.x - reorderIndicator.width / 2,
            top: reorderIndicator.y + (reorderIndicator.isAbove ? -10 : 10),
            width: reorderIndicator.width,
            height: 4,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 10000,
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.7)',
          }}
        >
          {/* Debug label */}
          <div
            style={{
              position: 'absolute',
              top: -25,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Reorder {reorderIndicator.isAbove ? '↑' : '↓'}
          </div>
        </div>
      )}

      {/* Merge indicator - purple highlight on target node */}
      {mergeTarget && (() => {
        const isGroupMerge = mergeTarget.node.data.type === 'group';
        const mergeLabel = isGroupMerge ? 'Drop to merge groups (children will be combined)' : 'Drop to merge sentences';
        
        return (
          <div
            style={{
              position: 'fixed',
              left: mergeTarget.screenPosition.x,
              top: mergeTarget.screenPosition.y,
              width: mergeTarget.screenSize.width || 200,
              height: mergeTarget.screenSize.height || 60,
              border: '3px solid #a855f7',
              borderRadius: 10,
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.6)',
              backgroundColor: 'rgba(168, 85, 247, 0.05)',
            }}
          >
            {/* Label */}
            <div
              style={{
                position: 'absolute',
                top: -28,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#a855f7',
                color: 'white',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(168, 85, 247, 0.4)',
              }}
            >
              {mergeLabel}
            </div>
          </div>
        );
      })()}
      {/* Debug: Show all node hitboxes (press 'D' to toggle) */}
      {showDebugHitboxes && nodes.map((node) => {
        const screenPos = toScreenPoint({
          x: node.position.x,
          y: node.position.y,
        });
        const screenSize = toScreenSize({
          width: node.width || 200,
          height: node.height || 60,
        });

        return (
          <div
            key={`hitbox-${node.id}`}
            style={{
              position: 'fixed',
              left: screenPos.x,
              top: screenPos.y,
              width: screenSize.width,
              height: screenSize.height,
              border: '2px dashed rgba(255, 0, 255, 0.5)',
              backgroundColor: 'rgba(255, 0, 255, 0.05)',
              pointerEvents: 'none',
              zIndex: 8888,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'magenta',
              fontWeight: 'bold',
            }}
          >
            {node.id}
            <br />
            {(node.width).toFixed(0)}x{(node.height).toFixed(0)}
          </div>
        );
      })}
    </div>
  );
}