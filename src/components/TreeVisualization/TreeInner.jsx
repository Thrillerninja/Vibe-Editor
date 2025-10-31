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
  useViewport,
} from 'reactflow';
import { AnimatedNodeComponent } from './AnimatedNodeComponent';
import { useReparenting } from '../../hooks/useReparenting';
import { useLocalPhysics } from '../../hooks/useLocalPhysics';
import { useReordering } from '../../hooks/useReordering';
import { parseTextToHierarchy, flattenTree } from '../../utils/treeParser';
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';

// Move nodeTypes outside component to prevent recreation
const nodeTypes = { animatedNode: AnimatedNodeComponent };

export function TreeInner({ text, onNodeEmotionChange }) {
  const safeText = String(text ?? '');
  
  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const rfRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Custom hooks
  const { onDropToReparent } = useReparenting();
  const physics = useLocalPhysics();
  const { checkReorderDrop, reorderNodes, findClosestSibling } = useReordering();
  const { x: viewportX, y: viewportY, zoom } = useViewport();

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

      // Check for closest sibling to show indicator
      const closest = findClosestSibling(node.id, node.position.y);
      
      if (closest) {
        // Convert flow coordinates to screen coordinates
        const screenX = closest.node.position.x * zoom + viewportX;
        const screenY = closest.node.position.y * zoom + viewportY;
        
        setReorderIndicator({
          x: screenX,
          y: screenY,
          isAbove: closest.insertBefore,
        });
      } else {
        setReorderIndicator(null);
      }
    },
    [physics, findClosestSibling, zoom, viewportX, viewportY]
  );

  /**
   * Node drag stop handler
   */
  const onNodeDragStop = useCallback(
    (event, node) => {
      console.log(`${LOG_PREFIX.DRAG} Drag stop: ${node.id}`);
      isDraggingRef.current = false;
      setReorderIndicator(null);

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

  // Pass emotion handler to nodes via data
  const nodesWithHandlers = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onEmotionChange: handleEmotionChange,
        },
      })),
    [nodes, handleEmotionChange]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
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
      
      {/* Reorder indicator - positioned in screen space, outside ReactFlow */}
      {reorderIndicator && (
        <div
          style={{
            position: 'absolute',
            left: reorderIndicator.x,
            top: reorderIndicator.y + (reorderIndicator.isAbove ? -10 : 10),
            width: 200,
            height: 4,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.7)',
          }}
        />
      )}
    </div>
  );
}