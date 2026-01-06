/**
 * @fileoverview TreeInner - Main tree visualization logic with Lexical integration
 *
 * Manages ReactFlow visualization, drag-and-drop, layout, and node editing.
 * Works directly with Node map as SSOT.
 *
 * @typedef {import('../types/node').Node} Node
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';
import { useFlowScreenConverters } from '../../utils/coords';
import {
  cloneNode,
  markNodeDirty,
  getDescendants,
  isGroupNode,
  isContentNode,
} from '../../types/node';

/** Move nodeTypes outside component to prevent recreation */
const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner - Main tree visualization logic
 * Works with node map as SSOT
 *
 * @param {Object} props
 * @param {Map<string, Node>} props.nodeMap - Map of all nodes
 * @param {string} props.rootId - Root node ID
 * @param {(nodeMap: Map<string, Node>) => void} props.onTreeUpdate
 * @returns {React.ReactElement}
 */
export function TreeInner({ rootId, nodeMap, onTreeUpdate }) {
  console.log('[TreeInner] Component rendering with', nodeMap.size, 'nodes');

  // ReactFlow state
  /** @type {[Array, Function, Function]} */
  const [nodes, setNodes, onNodesChange] = useNodesState([]);

  /** @type {[Array, Function, Function]} */
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  /** @type {[Object | null, Function]} */
  const [reorderIndicator, setReorderIndicator] = useState(null);

  /** @type {[Object | null, Function]} */
  const [reparentTarget, setReparentTarget] = useState(null);

  /** @type {[string | null, Function]} */
  const [openEmotionNodeId, setOpenEmotionNodeId] = useState(null);

  /** @type {[boolean, Function]} */
  const [showDebugHitboxes, setShowDebugHitboxes] = useState(false);

  /** @type {React.MutableRefObject<any>} */
  const rfRef = useRef(null);

  /** @type {React.MutableRefObject<HTMLDivElement>} */
  const containerRef = useRef(null);

  /** @type {React.MutableRefObject<boolean>} */
  const isDraggingRef = useRef(false);

  /** @type {React.MutableRefObject<Map<string, Node>>} */
  const nodeMapRef = useRef(nodeMap);

  /** @type {React.MutableRefObject<boolean>} */
  const animateNextRef = useRef(false);

  // Track what changed during drag for relayout
  const prevNodeMapRef = useRef(nodeMap);/**

  * Store original node positions before drag for snap-back
  */
  const originalNodePositionsRef = useRef({});

  // Keep track of which node was dragged and if tree changed
  const draggedNodeIdRef = useRef(null);
  const treeChangedRef = useRef(false);

  // Keep nodeMap ref updated
  useEffect(() => {
    nodeMapRef.current = nodeMap;
    console.log('[TreeInner] nodeMapRef updated, size:', nodeMap.size);
  }, [nodeMap]);

  // Custom hooks
  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();
  const { onDropToReparent, findReparentTarget } = useReparenting();
  const physics = useLocalPhysics();
  const { checkReorderDrop, findClosestSibling } = useReordering();
  const {
    flowToScreenPosition,
    setCenter,
    getZoom,
    zoomIn,
    zoomOut,
    fitView,
  } = useReactFlow();

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  // Log component mount/unmount
  useEffect(() => {
    console.log('[TreeInner] Component MOUNTED');
    return () => {
      console.log('[TreeInner] Component UNMOUNTED');
    };
  }, []);

  // Toggle debug hitboxes with F8
  useEffect(() => {
    /**
     * @param {KeyboardEvent} e
     */
    const handleKeyDown = e => {
      if (e.key === 'F8') {
        setShowDebugHitboxes(prev => !prev);
        console.log(
          `${LOG_PREFIX.DRAG} Debug hitboxes: ${!showDebugHitboxes}`
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDebugHitboxes]);

  // Cleanup physics on unmount
  useEffect(() => {
    return () => {
      console.log(`${LOG_PREFIX.PHYSICS} Component unmounting, cleaning up`);
      physics.stop();
    };
  }, []);

  // =========================================================================
  // NODE MODIFICATION HELPERS
  // =========================================================================

  /**
   * Reparent a node under a new parent
   *
   * @param {string} nodeId - Node to reparent
   * @param {string} newParentId - New parent node ID
   */
  const reparentNode = useCallback(
    (nodeId, newParentId) => {
      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);
      const newParent = updated.get(newParentId);

      // Validate both nodes exist
      if (!node) {
        console.error(`[TreeInner] Cannot reparent: node ${nodeId} not found`);
        return;
      }

      if (!newParent) {
        console.error(
          `[TreeInner] Cannot reparent: new parent ${newParentId} not found`
        );
        return;
      }

      // Prevent self-parenting
      if (nodeId === newParentId) {
        console.warn('[TreeInner] Cannot reparent node to itself');
        return;
      }

      // Remove from old parent
      if (node.hierarchy.parentId) {
        const oldParent = updated.get(node.hierarchy.parentId);
        if (oldParent) {
          const oldParentClone = cloneNode(oldParent);
          oldParentClone.hierarchy.childIds =
            oldParentClone.hierarchy.childIds.filter(id => id !== nodeId);
          updated.set(oldParent.id, oldParentClone);
        }
      }

      // Update node's parent
      const nodeClone = cloneNode(node);
      nodeClone.hierarchy.parentId = newParentId;
      nodeClone.hierarchy.level = newParent.hierarchy.level + 1;
      nodeClone.metadata.isDirty = true;
      nodeClone.metadata.modifiedAt = new Date().toISOString();
      updated.set(nodeId, nodeClone);

      // Add to new parent
      const newParentClone = cloneNode(newParent);
      if (!newParentClone.hierarchy.childIds.includes(nodeId)) {
        newParentClone.hierarchy.childIds.push(nodeId);
      }
      updated.set(newParentId, newParentClone);

      console.log(
        `[TreeInner] Reparented ${nodeId} to ${newParentId} (level ${nodeClone.hierarchy.level})`
      );

      treeChangedRef.current = true;
      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
  * Reorder a node relative to a sibling(same parent)
  *
  * @param { string } nodeId - Node to reorder
  * @param { string } targetSiblingId - Target sibling node
  * @param { boolean } insertBefore - Insert before or after
  */
  const reorderNode = useCallback(
    (nodeId, targetSiblingId, insertBefore) => {
      console.log(
        `[TreeInner] Reorder: ${nodeId} ${insertBefore ? 'BEFORE' : 'AFTER'
        } ${targetSiblingId}`
      );

      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);
      const sibling = updated.get(targetSiblingId);

      if (!node || !sibling) {
        console.error('[TreeInner] Reorder: Node or sibling not found');
        return;
      }

      // Verify same parent
      if (node.hierarchy.parentId !== sibling.hierarchy.parentId) {
        console.error(
          `[TreeInner] Reorder: Different parents: ${node.hierarchy.parentId} vs ${sibling.hierarchy.parentId}`
        );
        return;
      }

      const parentId = node.hierarchy.parentId;
      const parent = updated.get(parentId);

      if (!parent) {
        console.error(`[TreeInner] Reorder: Parent not found: ${parentId}`);
        return;
      }

      // Reorder children
      const parentClone = cloneNode(parent);
      const childIds = [...parentClone.hierarchy.childIds];

      // Remove node from current position
      const nodeIndex = childIds.indexOf(nodeId);
      if (nodeIndex === -1) {
        console.error(`[TreeInner] Reorder: Node not in parent's children`);
        return;
      }

      childIds.splice(nodeIndex, 1);

      // Find target position
      const siblingIndex = childIds.indexOf(targetSiblingId);
      if (siblingIndex === -1) {
        console.error(
          `[TreeInner] Reorder: Target sibling not in parent's children`
        );
        return;
      }

      const insertIndex = insertBefore ? siblingIndex : siblingIndex + 1;

      // Insert at new position
      childIds.splice(insertIndex, 0, nodeId);

      parentClone.hierarchy.childIds = childIds;
      updated.set(parentId, parentClone);

      // Mark as dirty
      const nodeClone = cloneNode(node);
      nodeClone.metadata.isDirty = true;
      nodeClone.metadata.modifiedAt = new Date().toISOString();
      updated.set(nodeId, nodeClone);

      console.log(
        `[TreeInner] ✅ Reorder applied: new order = [${childIds.join(', ')}]`
      );

      treeChangedRef.current = true;
      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  // =========================================================================
  // TREE BUILDING & LAYOUT
  // =========================================================================

  /**
   * Build ReactFlow nodes and edges from node map
   * Validates that all edges reference existing nodes
   *
   * @returns {{nodes: Array, edges: Array}}
   */
  const buildFlowStructure = useCallback(() => {
    console.log('[TreeInner] Building flow structure from', nodeMap.size, 'nodes');

    const flowNodes = [];
    const flowEdges = [];

    // Create flow nodes from each node in map
    nodeMap.forEach((node) => {
      flowNodes.push({
        id: node.id,
        data: {
          label: node.content,
          content: node.content,
          type: node.type,
          level: node.hierarchy.level,
          emotion: node.emotion,
          metadata: node.metadata,
          isDirty: node.metadata.isDirty,
        },
        position: { x: 0, y: 0 },
        type: 'animatedNode',
        style: {
          width: 'auto',
          height: 'auto',
        },
      });
    });

    // Create set of valid node IDs for edge validation
    const validNodeIds = new Set(nodeMap.keys());

    // Create edges from hierarchy - VALIDATE both nodes exist
    nodeMap.forEach((node) => {
      if (node.hierarchy.parentId) {
        // Only create edge if parent exists in nodeMap
        if (validNodeIds.has(node.hierarchy.parentId)) {
          flowEdges.push({
            id: `${node.hierarchy.parentId}-${node.id}`,
            source: node.hierarchy.parentId,
            target: node.id,
            animated: false,
          });
        } else {
          // Orphaned node - log warning
          console.warn(
            `[TreeInner] Node ${node.id} references missing parent ${node.hierarchy.parentId}`
          );
        }
      }
    });

    console.log(
      `[TreeInner] Built ${flowNodes.length} flow nodes and ${flowEdges.length} edges`
    );

    return { nodes: flowNodes, edges: flowEdges };
  }, [nodeMap]);

  /**
 * Track previous nodeMap structure to avoid redundant layouts
 */
  const prevNodeMapKeyRef = useRef(null);

  /**
   * Check if nodeMap structure has meaningfully changed
   *
   * @returns {boolean}
   */
  const hasNodeMapStructureChanged = useCallback(() => {
    if (!prevNodeMapKeyRef.current) return true;

    // Create a structure key based on node IDs and parent relationships
    const structureKey = Array.from(nodeMap.entries())
      .map(([id, node]) => `${id}:${node.hierarchy.parentId}`)
      .sort()
      .join('|');

    const changed = structureKey !== prevNodeMapKeyRef.current;
    prevNodeMapKeyRef.current = structureKey;

    return changed;
  }, [nodeMap]);

  /**
   * Build structure and apply layout when tree structure changes
   */
  const applyLayout = useCallback(async () => {
    if (isDraggingRef.current) {
      console.log('[TreeInner] Skipping layout update (dragging)');
      return;
    }

    if (!hasNodeMapStructureChanged()) {
      console.log('[TreeInner] Node map structure unchanged, skipping layout');
      return;
    }

    try {
      const { nodes: flowNodes, edges: flowEdges } = buildFlowStructure();

      if (flowNodes.length === 0) {
        console.warn('[TreeInner] No nodes to layout');
        return;
      }

      console.log(
        `[TreeInner] Applying ELK layout to ${flowNodes.length} nodes and ${flowEdges.length} edges`
      );

      const laidOut = await runElk(flowNodes, flowEdges);

      // Only apply if not dragging
      if (!isDraggingRef.current) {
        if (animateNextRef.current && containerRef.current) {
          containerRef.current.classList.add('rf-animate-drop');
        }

        setNodes(laidOut);
        setEdges(flowEdges);

        if (animateNextRef.current && containerRef.current) {
          setTimeout(() => {
            containerRef.current?.classList.remove('rf-animate-drop');
            animateNextRef.current = false;
          }, 300);
        }

        console.log('[TreeInner] Layout applied successfully');
      }
    } catch (err) {
      console.error('[TreeInner] Layout error:', err);
      // Don't crash - just keep previous layout
    }
  }, [nodeMap, buildFlowStructure, hasNodeMapStructureChanged, setNodes, setEdges]);

  // Apply layout when nodeMap structure changes
  useEffect(() => {
    applyLayout();
  }, [applyLayout]);

  // =========================================================================
  // EMOTION PANEL FOCUS
  // =========================================================================

  /**
   * Focus view on node when emotion panel opens
   */
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
    const dialogHeight = 600;

    // Calculate the bounding box that includes both node and dialog
    // Dialog is positioned below the node (nodeBottom + 12px gap)
    const totalWidth = Math.max(nodeWidth, dialogWidth);
    const totalHeight = nodeHeight + 12 + dialogHeight; // node + gap + dialog

    // Center point between node and dialog area
    const centerX = node.position.x + nodeWidth / 2;
    const centerY =
      node.position.y +
      nodeHeight / 2 +
      (12 + dialogHeight / 2) / 2;

    // Calculate zoom level to fit both node and dialog
    const padding = 100; // Extra padding around the content
    const zoomX = viewportWidth / (totalWidth + padding * 2);
    const zoomY = viewportHeight / (totalHeight + padding * 2);
    const targetZoom = Math.min(zoomX, zoomY, 1.0); // Cap at 1.0 for max zoom

    // Smooth animation to center and zoom
    setTimeout(() => {
      setCenter(centerX, centerY, {
        zoom: targetZoom,
        duration: 400,
      });
    }, 50); // Small delay to ensure node is rendered

  }, [openEmotionNodeId, nodes, setCenter]);

  // =========================================================================
  // REACTFLOW HANDLERS
  // =========================================================================

  /**
   * ReactFlow initialization callback
   * @param {Object} instance
   * @returns {void}
   */
  const onInit = useCallback(instance => {
    console.log('[TreeInner] ReactFlow initialized');
    rfRef.current = instance;
  }, []);

  /**
   * Node drag start handler
   * @param {React.DragEvent} event
   * @param {Object} rfNode - ReactFlow node
   * @returns {void}
   */
  const onNodeDragStart = useCallback(
    (event, rfNode) => {
      console.log(`[TreeInner] Drag start: ${rfNode.id}`);
      isDraggingRef.current = true;
      draggedNodeIdRef.current = rfNode.id;
      treeChangedRef.current = false;
      setOpenEmotionNodeId(null);

      // Store original position for snap-back
      originalNodePositionsRef.current[rfNode.id] = {
        x: rfNode.position.x,
        y: rfNode.position.y,
      };

      physics.start(rfNode.id);
      physics.updateDraggedPosition(rfNode.position.x, rfNode.position.y);
    },
    [physics]
  );

  /**
   * Node drag handler (during drag)
   * @param {React.DragEvent} event
   * @param {Object} rfNode - ReactFlow node
   * @returns {void}
   */
  const onNodeDrag = useCallback(
    (event, rfNode) => {
      physics.updateDraggedPosition(rfNode.position.x, rfNode.position.y);

      console.log(
        `${LOG_PREFIX.DRAG} onNodeDrag: ${rfNode.id} at (${rfNode.position.x.toFixed(
          1
        )}, ${rfNode.position.y.toFixed(1)})`
      );

      // Check for reorder (same parent)
      const closest = findClosestSibling(
        rfNode.id,
        rfNode.position.y,
        nodeMapRef.current
      );

      if (closest) {
        console.log(
          `${LOG_PREFIX.DRAG} 🔵 Showing reorder indicator for ${closest.node.id}`
        );

        const screenPos = toScreenPoint({
          x: closest.node.position.x,
          y: closest.node.position.y,
        });
        const screenSize = toScreenSize({
          width: closest.node.width ?? 200,
          height: closest.node.height ?? 60,
        });

        setReorderIndicator({
          x: screenPos.x + screenSize.width / 2,
          y: screenPos.y + (closest.insertBefore ? 0 : screenSize.height),
          width: screenSize.width,
          isAbove: closest.insertBefore,
        });
        setReparentTarget(null);
      } else {
        // Check for reparent (different parent)
        setReorderIndicator(null);

        const target = findReparentTarget(
          rfNode.id,
          rfNode.position.x,
          rfNode.position.y,
          nodeMapRef.current
        );

        if (target) {
          console.log(
            `${LOG_PREFIX.DRAG} 🟢 Showing reparent indicator for ${target.id}`
          );

          const screenPos = toScreenPoint({
            x: target.position.x,
            y: target.position.y,
          });
          const screenSize = toScreenSize({
            width: target.width || 200,
            height: target.height || 60,
          });

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
    [
      physics,
      findClosestSibling,
      findReparentTarget,
      toScreenPoint,
      toScreenSize,
    ]
  );

  /**
 * Node drag stop handler with snap-back logic
 * @param {React.DragEvent} event
 * @param {Object} rfNode - ReactFlow node
 * @returns {void}
 */
  const onNodeDragStop = useCallback(
    (event, rfNode) => {
      console.log(`${LOG_PREFIX.DRAG} onNodeDragStop: ${rfNode.id}`);
      isDraggingRef.current = false;
      setReorderIndicator(null);
      setReparentTarget(null);
      animateNextRef.current = true;

      let actionTaken = false;

      // Check for reorder first (same parent, tighter threshold)
      const reorderInfo = checkReorderDrop(
        rfNode.id,
        rfNode.position.y,
        nodeMapRef.current
      );

      if (reorderInfo) {
        console.log(
          `${LOG_PREFIX.DRAG} ✅ REORDER ACTION: ${rfNode.id} ${reorderInfo.insertBefore ? 'before' : 'after'
          } ${reorderInfo.targetSiblingId}`
        );

        reorderNode(
          rfNode.id,
          reorderInfo.targetSiblingId,
          reorderInfo.insertBefore
        );
        actionTaken = true;
      } else {
        // Try reparenting (different parent)
        const target = findReparentTarget(
          rfNode.id,
          rfNode.position.x,
          rfNode.position.y,
          nodeMapRef.current
        );

        if (target) {
          console.log(`${LOG_PREFIX.DRAG} ✅ REPARENT ACTION: ${rfNode.id} → ${target.id}`);
          reparentNode(rfNode.id, target.id);
          actionTaken = true;
        }
      }

      physics.stop();

      // Snap back if no action taken
      if (!actionTaken) {
        const originalPos = originalNodePositionsRef.current[rfNode.id];
        if (originalPos) {
          console.log(
            `${LOG_PREFIX.DRAG} ⬅️ SNAP BACK: ${rfNode.id} to (${originalPos.x.toFixed(
              1
            )}, ${originalPos.y.toFixed(1)})`
          );

          setNodes(nds =>
            nds.map(n =>
              n.id === rfNode.id
                ? {
                  ...n,
                  position: originalPos,
                }
                : n
            )
          );
        }
      }

      delete originalNodePositionsRef.current[rfNode.id];
    },
    [
      checkReorderDrop,
      findReparentTarget,
      reorderNode,
      reparentNode,
      physics,
      setNodes,
    ]
  );

  // =========================================================================
  // LAYOUT RELAYOUT AFTER MODIFICATIONS
  // =========================================================================

  // Re-apply layout when tree actually changes
  useEffect(() => {
    if (treeChangedRef.current && !isDraggingRef.current) {
      console.log('[TreeInner] Tree changed, re-applying layout');
      applyLayout();
      treeChangedRef.current = false;
    }
  }, [nodeMap, applyLayout]);

  const getDescendantLeaves = useCallback((nodeId) => {
    const node = nodeMapRef.current.get(nodeId);
    if (!node) return [];

    const leaves = [];
    const queue = [node];

    while (queue.length) {
      const current = queue.shift();

      // Check if leaf (no children)
      if (!current.hierarchy.childIds || current.hierarchy.childIds.length === 0) {
        leaves.push(current);
      } else {
        // Add children to queue
        current.hierarchy.childIds.forEach(childId => {
          const child = nodeMapRef.current.get(childId);
          if (child) queue.push(child);
        });
      }
    }

    return leaves;
  }, []);

  /**
   * Edge connection handler
   * @param {Object} params
   * @returns {void}
   */
  const onConnect = useCallback(
    params => {
      console.log(
        `[TreeInner] Manual connection: ${params.source} → ${params.target}`
      );
      setEdges(eds => addEdge({ ...params, animated: false }, eds));
    },
    [setEdges]
  );

  // =========================================================================
  // NODE EDITING & UPDATES
  // =========================================================================

  /**
   * Edit node content
   * @param {string} nodeId
   * @param {string} newContent
   * @param {Object} emotionProfile
   * @returns {void}
   */
  const applyNodeEdit = useCallback(
    (nodeId, newContent, emotionProfile) => {
      console.log(`[TreeInner] Editing node ${nodeId}: "${newContent}"`);

      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) {
        console.warn(`[TreeInner] Node ${nodeId} not found`);
        return;
      }

      // Update content
      const editedNode = cloneNode(node);
      const contentChanged = editedNode.content !== newContent;
      editedNode.content = newContent;

      // Update emotion if provided
      if (emotionProfile) {
        editedNode.emotion = {
          profile: emotionProfile,
          dominantEmotion: emotionProfile.dominantEmotion,
          dominantIntensity: emotionProfile.dominantIntensity,
          source: 'manual',
          timestamp: new Date().toISOString(),
        };
      }

      // Mark as dirty if content changed
      if (contentChanged) {
        editedNode.metadata.isDirty = true;
        editedNode.metadata.modifiedAt = new Date().toISOString();
        editedNode.metadata.version += 1;
      }

      updated.set(nodeId, editedNode);

      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Apply emotion to node and descendants
   * @param {string} nodeId
   * @param {Object} emotionProfile
   * @returns {void}
   */
  const applyEmotionToSubtree = useCallback(
    (nodeId, emotionProfile) => {
      console.log(`[TreeInner] Applying emotion to subtree ${nodeId}`);

      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) return;

      // Update node
      const updatedNode = cloneNode(node);
      updatedNode.emotion = {
        profile: emotionProfile,
        dominantEmotion: emotionProfile.dominantEmotion,
        dominantIntensity: emotionProfile.dominantIntensity,
        source: 'manual',
        timestamp: new Date().toISOString(),
      };
      updated.set(nodeId, updatedNode);

      // Update all descendants
      const descendants = getDescendants(node, nodeMapRef.current);
      descendants.forEach(descendant => {
        const cloned = cloneNode(descendant);
        cloned.emotion = updatedNode.emotion;
        updated.set(descendant.id, cloned);
      });

      onTreeUpdate(updated);
    },
    [onTreeUpdate]
  );

  /**
   * Delete a node and update hierarchy
   * @param {string} nodeId
   * @returns {void}
   */
  const deleteNode = useCallback(
    nodeId => {
      console.log(`[TreeInner] Deleting node ${nodeId}`);

      const updated = new Map(nodeMapRef.current);
      const node = updated.get(nodeId);

      if (!node) return;

      // Remove from parent's childIds
      if (node.hierarchy.parentId) {
        const parent = updated.get(node.hierarchy.parentId);
        if (parent) {
          const parentClone = cloneNode(parent);
          parentClone.hierarchy.childIds = parentClone.hierarchy.childIds.filter(
            id => id !== nodeId
          );
          updated.set(node.hierarchy.parentId, parentClone);
        }
      }

      // Remove the node
      updated.delete(nodeId);

      // Remove from ReactFlow
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds =>
        eds.filter(e => e.source !== nodeId && e.target !== nodeId)
      );

      onTreeUpdate(updated);
    },
    [onTreeUpdate, setNodes, setEdges]
  );

  // =========================================================================
  // NODE DATA WITH HANDLERS
  // =========================================================================

  /**
   * Attach handlers and utilities to all nodes
   */
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map(rfNode => ({
        ...rfNode,
        data: {
          ...rfNode.data,
          applyNodeEdit,
          applyEmotionToSubtree,
          deleteNode,
          setOpenEmotionNodeId,
          getDescendantLeaves,
        },
      })),
    [
      nodes,
      applyNodeEdit,
      applyEmotionToSubtree,
      deleteNode,
      getDescendantLeaves,
    ]
  );

  // =========================================================================
  // RENDER
  // =========================================================================

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

      {/* Reorder Indicator */}
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

      {/* Reparent Indicator */}
      {reparentTarget && (
        <div
          style={{
            position: 'fixed',
            left: reparentTarget.screenPosition.x,
            top: reparentTarget.screenPosition.y,
            width: reparentTarget.screenSize.width || 200,
            height: reparentTarget.screenSize.height || 60,
            border: '3px solid #10b981',
            borderRadius: 10,
            pointerEvents: 'none',
            zIndex: 9999,
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.6)',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
          }}
        >
          {/* Corner indicators */}
          <div style={{ position: 'absolute', top: -8, left: -8, width: 16, height: 16, backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)' }} />
          <div style={{ position: 'absolute', top: -8, right: -8, width: 16, height: 16, backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)' }} />
          <div style={{ position: 'absolute', bottom: -8, left: -8, width: 16, height: 16, backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)' }} />
          <div style={{ position: 'absolute', bottom: -8, right: -8, width: 16, height: 16, backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)' }} />

          {/* Label */}
          <div
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#10b981',
              color: 'white',
              padding: '4px 12px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Drop to attach here
          </div>
        </div>
      )}

      {/* Debug Hitboxes */}
      {showDebugHitboxes &&
        nodes.map(rfNode => {
          const screenPos = toScreenPoint({
            x: rfNode.position.x,
            y: rfNode.position.y,
          });
          const screenSize = toScreenSize({
            width: rfNode.width || 200,
            height: rfNode.height || 60,
          });

          return (
            <div
              key={`hitbox-${rfNode.id}`}
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
              {rfNode.id}
              <br />
              {rfNode.width?.toFixed(0)}x{rfNode.height?.toFixed(0)}
            </div>
          );
        })}
    </div>
  );
}