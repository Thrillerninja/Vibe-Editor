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
import { AnimatedNodeComponent } from './AnimatedNodeComponent';
import { useReparenting } from '../../hooks/useReparenting';
import { useLocalPhysics } from '../../hooks/useLocalPhysics';
import { useReordering } from '../../hooks/useReordering';
import { ReparentIndicator } from './ReparentIndicator';
import { parseTextToHierarchy, flattenTree } from '../../utils/treeParser';
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';
import { useFlowScreenConverters } from '../../utils/coords';

// Move nodeTypes outside component to prevent recreation
const nodeTypes = { animatedNode: AnimatedNodeComponent };

export function TreeInner({ text, onNodeEmotionChange }) {
  const safeText = String(text ?? '');
  
  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const [reparentTarget, setReparentTarget] = useState(null);
  const [openEmotionNodeId, setOpenEmotionNodeId] = useState(null);
  const [showDebugHitboxes, setShowDebugHitboxes] = useState(false); // Debugging reparenting/-ordering hitboxes
  const rfRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Custom hooks
  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();
  const { onDropToReparent, findReparentTarget } = useReparenting();
  const physics = useLocalPhysics();
  const { checkReorderDrop, reorderNodes, findClosestSibling } = useReordering();
  const { flowToScreenPosition } = useReactFlow();

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

  // Parse text into flat structure
  const flat = useMemo(() => {
    console.log(`${LOG_PREFIX.LAYOUT} Memoizing flat structure`);
    const tree = parseTextToHierarchy(safeText);
    return flattenTree(tree);
  }, [safeText]);

  // Cleanup physics on unmount
  useEffect(() => {
    return () => {
      console.log(`${LOG_PREFIX.PHYSICS} Component unmounting, cleaning up`);
      physics.stop();
    };
  }, [physics]);

  // Apply ELK layout when text changes
  useEffect(() => {
    // Don't update layout while dragging
    if (isDraggingRef.current) {
      console.log(`${LOG_PREFIX.LAYOUT} Skipping layout update (dragging)`);
      return;
    }

    let cancelled = false;

    const applyLayout = async () => {
      console.log(`${LOG_PREFIX.LAYOUT} Applying layout for new text`);

      // Preserve existing data for matching nodes
      const withData = flat.nodes.map((n) => {
        const existing = nodes.find((x) => x.id === n.id);
        return existing ? { ...n, data: existing.data } : n;
      });

      const laidOut = await runElk(withData, flat.edges);

      if (!cancelled && !isDraggingRef.current) {
        console.log(`${LOG_PREFIX.LAYOUT} Setting ${laidOut.length} nodes`);
        setNodes(laidOut);
        setEdges(flat.edges);
      } else {
        console.log(`${LOG_PREFIX.LAYOUT} Layout cancelled`);
      }
    };

    applyLayout();

    return () => {
      cancelled = true;
    };
  }, [safeText, flat.nodes, flat.edges]);

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
      setOpenEmotionNodeId(null); // Close emotion modal
      
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
        console.log(`${LOG_PREFIX.DRAG} Executing reorder`);
        reorderNodes(
          node.id,
          reorderInfo.targetSiblingId,
          reorderInfo.insertBefore
        );
      } else {
        // Try reparenting (different parent)
        console.log(`${LOG_PREFIX.DRAG} Attempting reparent`);
        onDropToReparent(node.id, node.position.x, node.position.y);
      }

      // Stop physics
      physics.stop();

      // Re-layout after a delay
      setTimeout(async () => {
        if (!isDraggingRef.current) {
          console.log(`${LOG_PREFIX.LAYOUT} Re-layouting after drag`);
          const laidOut = await runElk(
            rfRef.current.getNodes(),
            rfRef.current.getEdges()
          );
          setNodes(laidOut);
        }
      }, 50);
    },
    [checkReorderDrop, reorderNodes, onDropToReparent, physics, setNodes]
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

      // Notify parent component for AI rewriting
      if (onNodeEmotionChange) {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          onNodeEmotionChange(nodeId, node.data.label, emotion, intensity);
        }
      }
    },
    [nodes, onNodeEmotionChange, setNodes]
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
      <Background gap={20} color="#e5e7eb" />
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