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

// Move nodeTypes outside component to prevent recreation
const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner - Main tree visualization logic
 * Now works with sentences array as SSOT
 */
export function TreeInner({ sentences = [], onTreeUpdate }) {
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
  const layoutVersionRef = useRef(0); // Track layout computation version
  const draggedNodePositionRef = useRef(null); // Preserve dragged node position

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

  // Cleanup physics on unmount
  useEffect(() => {
    return () => {
      console.log(`${LOG_PREFIX.PHYSICS} Component unmounting, cleaning up`);
      physics.stop();
    };
  }, [physics]);

  // Apply ELK layout when sentences change
  useEffect(() => {
    // Don't START new layout while dragging - wait for drag to complete
    if (isDraggingRef.current) {
      console.log(`${LOG_PREFIX.LAYOUT} Skipping layout start (dragging in progress)`);
      return;
    }

    // Increment layout version to invalidate any in-flight layouts
    layoutVersionRef.current += 1;
    const currentVersion = layoutVersionRef.current;
    
    let cancelled = false;

    const applyLayout = async () => {
      console.log(`${LOG_PREFIX.LAYOUT} Starting layout computation v${currentVersion} for ${flat.nodes.length} nodes`);

      // Preserve ONLY metadata (emotion, intensity) from existing nodes
      // Always use NEW label/content from flat.nodes
      const withData = flat.nodes.map((n) => {
        const existing = nodes.find((x) => x.id === n.id);
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

      // Run layout computation (this is async and may take time)
      const laidOut = await runElk(withData, flat.edges);

      // Check multiple conditions before applying layout:
      // 1. Not cancelled (component still mounted, dependencies haven't changed)
      // 2. Not currently dragging (don't interrupt active drag)
      // 3. No newer layout has started (prevent applying stale layouts)
      const isStale = currentVersion !== layoutVersionRef.current;
      
      if (cancelled) {
        console.log(`${LOG_PREFIX.LAYOUT} Layout v${currentVersion} cancelled (effect cleanup)`);
        return;
      }
      
      if (isDraggingRef.current) {
        console.log(`${LOG_PREFIX.LAYOUT} Layout v${currentVersion} skipped (drag in progress)`);
        return;
      }
      
      if (isStale) {
        console.log(`${LOG_PREFIX.LAYOUT} Layout v${currentVersion} stale (current version: v${layoutVersionRef.current})`);
        return;
      }

      // If a node was being dragged recently, preserve its final position
      // This prevents the layout from overwriting the user's drag result
      if (draggedNodePositionRef.current) {
        const { nodeId, position } = draggedNodePositionRef.current;
        const draggedNode = laidOut.find(n => n.id === nodeId);
        
        if (draggedNode) {
          console.log(`${LOG_PREFIX.LAYOUT} Preserving dragged node ${nodeId} position:`, position);
          draggedNode.position = { ...position };
        }
        
        // Clear the preserved position after applying
        draggedNodePositionRef.current = null;
      }

      console.log(`${LOG_PREFIX.LAYOUT} Applying layout v${currentVersion}: ${laidOut.length} nodes`);
      setNodes(laidOut);
      setEdges(flat.edges);
    };

    applyLayout();

    return () => {
      cancelled = true;
    };
  }, [sentences, flat.nodes.length, flat.edges]);

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
      
      // Store the dragged node's starting position
      // This will be updated in onNodeDrag and preserved in onNodeDragStop
      draggedNodePositionRef.current = {
        nodeId: node.id,
        position: { ...node.position }
      };

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
      // Update the stored position continuously during drag
      if (draggedNodePositionRef.current && draggedNodePositionRef.current.nodeId === node.id) {
        draggedNodePositionRef.current.position = { ...node.position };
      }

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
      console.log(`${LOG_PREFIX.DRAG} Drag stop: ${node.id} at position (${node.position.x}, ${node.position.y})`);
      
      // Preserve the final drag position for the next layout computation
      // This ensures that if a layout is in-flight or starts soon after,
      // it won't overwrite the user's drag result
      draggedNodePositionRef.current = {
        nodeId: node.id,
        position: { ...node.position }
      };
      
      // IMPORTANT: Set isDraggingRef to false AFTER storing position
      // This allows any pending layouts to proceed, but they will respect
      // the preserved position
      isDraggingRef.current = false;
      
      setReorderIndicator(null);
      setReparentTarget(null);

      // Check for reordering first (tighter threshold)
      const reorderInfo = checkReorderDrop(node.id, node.position.y);

      if (reorderInfo) {
        // This is a reorder operation
        console.log(`${LOG_PREFIX.DRAG} Reorder detected: applying to sentences`);

        // Apply reordering to sentences array
        const updatedSentences = applyReordering(
          sentences,
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

        // Increment layout version to invalidate any in-flight layouts
        // A new layout will be triggered automatically via useEffect when sentences change
        layoutVersionRef.current += 1;
        console.log(`${LOG_PREFIX.LAYOUT} Invalidated layouts, new version: v${layoutVersionRef.current}`);
      } else {
        // Try reparenting (different parent)
        console.log(`${LOG_PREFIX.DRAG} Attempting reparent`);
        onDropToReparent(node.id, node.position.x, node.position.y);

        // Stop physics
        physics.stop();

        // Invalidate in-flight layouts and trigger new one after reparent
        layoutVersionRef.current += 1;
        
        // Re-layout after reparent with debounce
        setTimeout(async () => {
          if (!isDraggingRef.current) {
            const currentVersion = layoutVersionRef.current;
            console.log(`${LOG_PREFIX.LAYOUT} Re-layouting after reparent (v${currentVersion})`);
            
            const laidOut = await runElk(
              rfRef.current.getNodes(),
              rfRef.current.getEdges()
            );
            
            // Only apply if this is still the latest layout
            if (currentVersion === layoutVersionRef.current && !isDraggingRef.current) {
              setNodes(laidOut);
            } else {
              console.log(`${LOG_PREFIX.LAYOUT} Skipping stale reparent layout v${currentVersion} (current: v${layoutVersionRef.current})`);
            }
          }
        }, 50);
      }
      
      // Clear preserved position after a short delay
      // This gives the layout effect time to capture it
      setTimeout(() => {
        if (draggedNodePositionRef.current?.nodeId === node.id) {
          console.log(`${LOG_PREFIX.DRAG} Clearing preserved position for ${node.id}`);
          draggedNodePositionRef.current = null;
        }
      }, 200);
    },
    [checkReorderDrop, reorderNodes, onDropToReparent, physics, setNodes, sentences, onTreeUpdate]
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

  // Handle emotion change from node
  const handleEmotionChange = useCallback(
    (nodeId, emotion, intensity) => {
      console.log(`[Emotion] Node ${nodeId}: ${emotion} (${intensity})`);
      // Track AI-powered emotion tagging
      posthog.capture('emotion_tagged', {
        node_id: nodeId,
        emotion: emotion,
        intensity: intensity,
        // AI usage tracking
        model: 'plutchik',
        feature: 'emotion_selector',
      });

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

      // Update the sentences array with emotion data
      if (onTreeUpdate) {
        // Find and update the sentence
        const updatedSentences = sentences.map(s =>
          s.id === nodeId
            ? { ...s, emotion, intensity }
            : s
        );
        onTreeUpdate(updatedSentences);
      }
    },
    [nodes, sentences, onTreeUpdate, setNodes]
  );

  // Pass emotion handler and position to nodes via data
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onEmotionChange: handleEmotionChange,
          isEmotionModalOpen: openEmotionNodeId === node.id,
          setIsEmotionModalOpen: (isOpen) =>
            setOpenEmotionNodeId(isOpen ? node.id : null),
          nodePosition: node.position, // Pass position for screen calculation
        },
      })),
    [nodes, handleEmotionChange, openEmotionNodeId]
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
        <MiniMap pannable zoomable />
        <Controls />
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