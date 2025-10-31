/**
 * TreeInner - ReactFlow-aware tree visualization component
 * Handles layout, drag interactions, and physics
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { parseTextToHierarchy, flattenTree } from '../../utils/treeparser';
import { runElk } from '../../utils/layoutEngine';
import { LOGGING_ENABLED, LOG_PREFIX } from '../../utils/constants';

const nodeTypes = { animatedNode: AnimatedNodeComponent };

/**
 * TreeInner component
 * Must be wrapped in ReactFlowProvider
 * @param {string} text - Input text to visualize
 */
export function TreeInner({ text }) {
  const safeText = String(text ?? '');
  
  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const rfRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Custom hooks
  const { onDropToReparent } = useReparenting();
  const physics = useLocalPhysics();
  const { screenToFlowPosition } = useReactFlow();

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
  }, [safeText, flat.nodes, flat.edges, setNodes, setEdges]);

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
      // React Flow has already updated node.position to follow cursor
      // Just sync the simulation to match
      physics.updateDraggedPosition(node.position.x, node.position.y);
    },
    [physics]
  );

  /**
   * Node drag stop handler
   */
  const onNodeDragStop = useCallback(
    (event, node) => {
      console.log(`${LOG_PREFIX.DRAG} Drag stop: ${node.id}`);
      isDraggingRef.current = false;

      // Attempt reparenting if dropped on another node
      onDropToReparent(node.id, event.clientX, event.clientY);

      // Stop physics
      physics.stop();

      // Re-layout after a delay to ensure RAF has stopped
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
    [onDropToReparent, physics, setNodes]
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

  return (
    <ReactFlow
      nodes={nodes}
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
  );
}