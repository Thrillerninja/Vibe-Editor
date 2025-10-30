import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  useUpdateNodeInternals,
  Handle,
  Position,
  Background,
  Controls,
  useEdgesState,
  useNodesState,
  addEdge,
  MiniMap,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { motion } from 'framer-motion';
import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceY,
  forceX,
} from 'd3-force';

const NODE_WIDTH = 200;
const elk = new ELK();
const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': 180,
  'elk.spacing.nodeNode': 28,
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

function measureLabel(label) {
  const fontSize = 13;
  const maxWidth = NODE_WIDTH - 24;
  const avgChar = fontSize * 0.55;
  const charsPerLine = Math.max(8, Math.floor(maxWidth / avgChar));
  const words = String(label || '').split(/\s+/).filter(Boolean);
  let lines = 1;
  let len = 0;
  for (const w of words) {
    if (len > 0 && len + w.length + 1 > charsPerLine) {
      lines += 1;
      len = w.length;
    } else {
      len += (len ? 1 : 0) + w.length;
    }
  }
  const lineHeight = Math.round(fontSize * 1.5);
  const h = Math.max(56, lines * lineHeight + 20);
  return { width: NODE_WIDTH, height: h };
}

function extractSentences(text) {
    return text.split(/(?<=[.!?\n])\s+/)
}

function parseTextToHierarchy(input) {
  const text = String(input ?? '').trim();
  const rootLabel = (text.split('.')[0] || 'Document').trim() || 'Document';

  if (!text) {
    return { id: 'root', type: 'root', label: 'Document', children: [] };
  }

  const chapters1 = text.trim().split(/(?:\r\n|\n){2,}/);
  const hierarchy = {id: 'root', type: 'root', label: 'Document', children: new Array(chapters1.length)}
  
  for (let i = 0; i < chapters1.length; i++) {
      console.log("CHAPTER"+i+": "+chapters1[i])
      const sections = chapters1[i].trim().split("\n");
      const sections_collected = []
      for (let k=0; k<sections.length; k++) {
        console.log("   Section"+k+": "+sections[k])
        const sentence_strings = sections[k].trim().split(/(?<=[.!?\n])\s+/)
        const sentences_collected = [] 
        for (let j = 0; j<sentence_strings.length; j++) {
                 console.log("       Sentence"+j+": "+sentence_strings[j])
          sentences_collected.push({id: 'sentence-'+i+k+j, type: 'argument', label: sentence_strings[j].trim(), children:[]})
        }
 
        const section = {id: 'chap-'+i+k, type: 'section', label: chapters1[i].trim(), children: sentences_collected}
        sections_collected.push(section)
      }
      

      
      
      

      const chapter = {id: 'chap-'+i, type: 'chapter', label: chapters1[i].trim(), children: sections_collected}
      hierarchy.children[i] = chapter
  }









  const sentences = text
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chapters = sentences.map((s, i) => {
    const clauses = s.split(/[,;:]\s+/).filter(Boolean);
    const sections = clauses.map((c, j) => {
      const phrases = c
        .split(/\s+\band\b\s+|\s+\bor\b\s+|\s+\bbut\b\s+/i)
        .filter(Boolean);
      const argumentsArr = phrases.map((p, k) => ({
        id: `arg-${i}-${j}-${k}`,
        type: 'argument',
        label: p.trim(),
        children: [],
      }));
      return {
        id: `sec-${i}-${j}`,
        type: 'section',
        label: c.trim(),
        children: argumentsArr,
      };
    });
    return {
      id: `chap-${i}`,
      type: 'chapter',
      label: s,
      children: sections,
    };
  });
  return hierarchy
  return {
    id: 'root',
    type: 'root',
    label: rootLabel,
    children: chapters,
  };
  
}

function flattenTree(tree) {
  const nodes = [];
  const edges = [];
  const stack = [tree];

  while (stack.length) {
    const curr = stack.pop();
    nodes.push({
      id: curr.id,
      data: { label: curr.label, type: curr.type },
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH },
      type: 'animatedNode',
    });
    for (const child of curr.children || []) {
      edges.push({
        id: `${curr.id}-${child.id}`,
        source: curr.id,
        target: child.id,
        animated: false,
      });
      stack.push(child);
    }
  }
  return { nodes, edges };
}

async function runElk(nodes, edges) {
  const elkGraph = {
    id: 'root',
    layoutOptions: elkOptions,
    children: nodes.map((n) => {
      const size = measureLabel(n.data.label);
      return { id: n.id, width: size.width, height: size.height };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };
  const res = await elk.layout(elkGraph);
  const pos = new Map();
  (res.children || []).forEach((c) => pos.set(c.id, { x: c.x, y: c.y }));
  return nodes.map((n) => ({
    ...n,
    position: pos.get(n.id) || n.position,
    draggable: true,
  }));
}

function AnimatedNodeComponent({ id, data }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const size = measureLabel(data.label);

  useEffect(() => {
    // Defer to next tick so DOM has applied the size
    const t = setTimeout(() => updateNodeInternals(id), 0);
    return () => clearTimeout(t);
  }, [id, data.label, updateNodeInternals]);

  const bg =
    data.type === 'root'
      ? '#2563eb'
      : data.type === 'chapter'
      ? '#f3f4f6'
      : data.type === 'section'
      ? '#eef2ff'
      : '#ecfeff';

  const border =
    data.type === 'root'
      ? '#1e40af'
      : data.type === 'chapter'
      ? '#d1d5db'
      : data.type === 'section'
      ? '#c7d2fe'
      : '#a5f3fc';

  const color = data.type === 'root' ? 'white' : '#1f2937';

  return (
    <div style={{ position: 'relative' }}>
      {/* Explicit handles so edges know where to connect */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 44 }}
        style={{
          width: 200,
          height: size.height,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          textAlign: 'center',
          fontSize: 13,
          fontWeight: data.type === 'root' ? 600 : 500,
          color,
          lineHeight: 1.45,
          fontFamily:
            '-apple-system, BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif',
          userSelect: 'none',
        }}
      >
        {data.label}
      </motion.div>
    </div>
  );
}

const nodeTypes = { animatedNode: AnimatedNodeComponent };

/* Reparenting helper (must be used under provider) */
function useReparenting() {
  const { setEdges, screenToFlowPosition, getIntersectingNodes, getEdges } =
    useReactFlow();

  const buildParentMap = React.useCallback(() => {
    const parent = new Map();
    getEdges().forEach((e) => parent.set(e.target, e.source));
    return parent;
  }, [getEdges]);

  const isAncestor = React.useCallback((maybeAncestor, node, parentMap) => {
    let p = parentMap.get(node) || null;
    while (p) {
      if (p === maybeAncestor) return true;
      p = parentMap.get(p) || null;
    }
    return false;
  }, []);

  const onDropToReparent = React.useCallback(
    (draggedId, clientX, clientY) => {
      const parentMap = buildParentMap();
      const pos = screenToFlowPosition({ x: clientX, y: clientY });

      const nodesUnder = getIntersectingNodes(
        { x: pos.x - 1, y: pos.y - 1, width: 2, height: 2 },
        false
      ).filter((n) => n.id !== draggedId);

      if (!nodesUnder.length) return;

      nodesUnder.sort(
        (a, b) =>
          (a.position.x - pos.x) ** 2 +
          (a.position.y - pos.y) ** 2 -
          ((b.position.x - pos.x) ** 2 + (b.position.y - pos.y) ** 2)
      );
      const target = nodesUnder[0];

      if (isAncestor(draggedId, target.id, parentMap)) return;

      setEdges((eds) => {
        const withoutOld = eds.filter((e) => e.target !== draggedId);
        return [
          ...withoutOld,
          { id: `${target.id}-${draggedId}`, source: target.id, target: draggedId },
        ];
      });
    },
    [buildParentMap, screenToFlowPosition, getIntersectingNodes, isAncestor, setEdges]
  );

  return { onDropToReparent };
}

/* Physics: local pushing during drag */
function useLocalPhysics() {
  const { getNodes, setNodes } = useReactFlow();
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const neighborhoodIdsRef = useRef(new Set());
  const draggedIdRef = useRef(null);

  const stop = useCallback(() => {
    if (simRef.current) {
      simRef.current.stop();
      simRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    neighborhoodIdsRef.current = new Set();
    draggedIdRef.current = null;
  }, []);

  const start = useCallback((draggedId) => {
    stop();
    draggedIdRef.current = draggedId;

    const rfNodes = getNodes();
    const dragged = rfNodes.find((n) => n.id === draggedId);
    if (!dragged) return;

    // Neighborhood selection
    const LAYER_GAP = 240;
    const RADIUS = 260;
    const layerByX = (x) => Math.round(x / LAYER_GAP);
    const centerLayer = layerByX(dragged.position.x);

    const neighborhood = rfNodes.filter((n) => {
      const dx = n.position.x - dragged.position.x;
      const dy = n.position.y - dragged.position.y;
      const layer = layerByX(n.position.x);
      const close = dx * dx + dy * dy < RADIUS * RADIUS;
      return Math.abs(layer - centerLayer) <= 1 && close;
    });
    neighborhoodIdsRef.current = new Set(neighborhood.map((n) => n.id));

    // Build sim nodes
    const simNodes = neighborhood.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      // Mark dragged as fixed (we'll update fx/fy per drag)
      fx: n.id === draggedId ? n.position.x : null,
      fy: n.id === draggedId ? n.position.y : null,
      r: Math.max(28, measureLabel(n.data.label).height / 2),
      type: n.data.type,
    }));

    // Forces
    const repulsion = -120;
    const collide = 26;
    const kx = 0.15; // neighbors align to their original column center
    const ky = 0.2;

    const originalX = new Map(neighborhood.map((n) => [n.id, n.position.x]));

    const sim = forceSimulation(simNodes)
      .alpha(0.9)
      .alphaDecay(0.06)
      .velocityDecay(0.4)
      .force(
        'charge',
        forceManyBody()
          .strength((d) => (d.id === draggedId ? repulsion * 2 : repulsion))
          .distanceMax(RADIUS)
      )
      .force(
        'collide',
        forceCollide()
          .radius((d) => d.r + collide)
          .iterations(2)
      )
      .force(
        'x',
        forceX((d) =>
          d.id === draggedId ? d.fx ?? d.x : originalX.get(d.id) ?? d.x
        ).strength((d) => (d.id === draggedId ? 1 : kx))
      )
      .force(
        'y',
        forceY((d) => (d.id === draggedId ? d.fy ?? d.y : d.y)).strength((d) =>
          d.id === draggedId ? 1 : ky
        )
      );

    simRef.current = sim;

    const tick = () => {
      if (!simRef.current) return;
      const map = new Map(sim.nodes().map((n) => [n.id, n]));
      setNodes((nds) =>
        nds.map((n) => {
          const s = map.get(n.id);
          if (!s) return n;
          // Write back sim positions only for neighborhood to avoid jitter elsewhere
          if (!neighborhoodIdsRef.current.has(n.id)) return n;
          return {
            ...n,
            position: { x: s.x, y: s.y },
          };
        })
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getNodes, setNodes, stop]);

  // Cursor drives dragged node exactly: set fx/fy to cursor in flow coords
  const updateDraggedPosition = useCallback((x, y) => {
    if (!simRef.current || !draggedIdRef.current) return;
    const id = draggedIdRef.current;
    const node = simRef.current.nodes().find((d) => d.id === id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
    node.vx = 0;
    node.vy = 0;
    simRef.current.alpha(0.35).restart();
  }, []);

  return { start, stop, updateDraggedPosition };
}

/* Inner RF-aware component */
function TreeInner({ text }) {
  const safeText = String(text ?? '');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const rfRef = useRef(null);
  const draggingRef = useRef(null);

  const flat = useMemo(() => {
    const t = parseTextToHierarchy(safeText);
    return flattenTree(t);
  }, [safeText]);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const withData = flat.nodes.map((n) => {
        const existing = nodes.find((x) => x.id === n.id);
        return existing ? { ...n, data: existing.data } : n;
      });
      const laidOut = await runElk(withData, flat.edges);
      if (!cancelled) {
        setNodes(laidOut);
        setEdges(flat.edges);
      }
    };
    apply();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeText]);

  const onInit = useCallback((inst) => {
    rfRef.current = inst;
  }, []);

  const { onDropToReparent } = useReparenting();
  const physics = useLocalPhysics();
  const { screenToFlowPosition } = useReactFlow();

  const onNodeDragStart = useCallback(
    (e, node) => {
      physics.start(node.id);
      // Immediately move the dragged node to the cursor to avoid an initial jump
      const p = screenToFlowPosition({ x: e.clientX - (NODE_WIDTH/2), y: e.clientY });
      physics.updateDraggedPosition(p.x, p.y);
    },
    [physics, screenToFlowPosition]
  );

  const onNodeDrag = useCallback(
    (e) => {
      const p = screenToFlowPosition({ x: e.clientX - (NODE_WIDTH/2), y: e.clientY });
      physics.updateDraggedPosition(p.x, p.y);
    },
    [physics, screenToFlowPosition]
  );

  const onNodeDragStop = useCallback(
    (e, node) => {
      // re-parent if dropped over node
      onDropToReparent(node.id, e.clientX, e.clientY);

      // stop physics and snap to clean ELK layout
      physics.stop();
      setTimeout(async () => {
        const laidOut = await runElk(
          rfRef.current.getNodes(),
          rfRef.current.getEdges()
        );
        setNodes(laidOut);
      }, 0);
    },
    [onDropToReparent, physics, setNodes]
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: false }, eds)),
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

export default function TreeVisualizationAlternate({ text }) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <TreeInner text={text} />
      </ReactFlowProvider>
    </div>
  );
}