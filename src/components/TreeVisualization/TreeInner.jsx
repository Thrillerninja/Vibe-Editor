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
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';
import { useFlowScreenConverters } from '../../utils/coords';
import { applyReordering } from '../../utils/sentenceEditor';
import { editSentence } from '../../utils/sentenceEditor';
// Move nodeTypes outside component to prevent recreation
const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner - Main tree visualization logic
 * Now works with sentences array as SSOT
 */
export function TreeInner({ sentences, onTreeUpdate, setSentences, setHierarchyState }) {
  console.log('[TreeInner] Component rendering with', sentences.length, 'sentences');

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const [reparentTarget, setReparentTarget] = useState(null);
  const [openEmotionNodeId, setOpenEmotionNodeId] = useState(null);
  const [showDebugHitboxes, setShowDebugHitboxes] = useState(false);
  const rfRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const sentencesRef = useRef(sentences);

  // Keep sentences ref updated
  useEffect(() => {
    sentencesRef.current = sentences;
    console.log('[TreeInner] sentencesRef updated', sentences);
  }, [sentences]);

  // Log component mount/unmount for debugging
  useEffect(() => {
    console.log('[TreeInner] Component MOUNTED', setHierarchyState);
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
  const { flowToScreenPosition, setCenter, getZoom } = useReactFlow();

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
        intensity: s.intensity
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
          intensity: s.intensity
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
        setNodes(laidOut);
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
 * Node drag handler (during drag)
 */
  const onNodeDrag = useCallback(
    (event, node) => {
      // Sync physics simulation
      physics.updateDraggedPosition(node.position.x, node.position.y);

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
    [physics, findClosestSibling, findReparentTarget, flowToScreenPosition]
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

      // Check for reordering first (tighter threshold)
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

        // Update parent component's state
        if (onTreeUpdate) {
          onTreeUpdate(updatedSentences);
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

        // Re-layout after reparent
        setTimeout(async () => {
          if (!isDraggingRef.current) {
            console.log(`${LOG_PREFIX.LAYOUT} Re-layouting after reparent`);
            const laidOut = await runElk(
              rfRef.current.getNodes(),
              rfRef.current.getEdges()
            );
            setNodes(laidOut);
          }
        }, 50);
      }
    },
    [checkReorderDrop, reorderNodes, onDropToReparent, physics, setNodes, onTreeUpdate]
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
    (nodeId, newContent) => {
      console.log(`[TreeInner] Node ${nodeId} content edit: "${newContent}"`);
      console.log('[TreeInner] SetSentences ', setSentences);
      // Update the sentences array with new content
      const edited =  editSentence(nodeId, newContent, sentencesRef.current);

      setSentences(edited);
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
  
  const markNodeModified = useCallback(
    (nodeId) => {
      console.log(`[TreeInner] Marking node ${nodeId} as modified (dirty)`);
      // Update node data to mark as dirty
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
              ...n,
              data: {
                ...n.data, 
                isDirty: true,
              }, 
            }
            : n
        )
      );
      setHierarchyState('has-dirty-nodes');
    });

  // Pass emotion handler and position to nodes via data
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          applyNodeSentenceEdit: applyNodeSentenceEdit,
          applyEmotionToNode: applyEmotionToNode,
          markNodeModified: markNodeModified,
          nodePosition: node.position, // Pass position for screen calculation
        },
      })),
    [nodes, openEmotionNodeId]
  );

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
        {/*<MiniMap pannable zoomable />*/}
        <Controls  showInteractive={false} />
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

      {/* Reparent indicator - green highlight on target parent */}
      {reparentTarget && (
        <div
          style={{
            position: 'fixed', // Changed from absolute to fixed
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
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
            }}
          >
            Drop to attach here
          </div>
        </div>
      )}
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