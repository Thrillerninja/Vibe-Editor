/**
 * ELKTree.jsx
 * 
 * Renders tree structure with ELK layout
 * - Only leaf nodes (level 1) are editable
 * - Updates propagate back to parent via setTree callback
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import ReactFlow, { Background, ConnectionMode , Controls,} from "reactflow";
import { runElk } from "../../utils/layoutEngine";
import TreeNode from "./TreeNode";

import { LEAF_NODE_LEVEL } from "../../utils/constants";
import { em } from "framer-motion/client";
import { ALTERNATIVE_EMOTION_COLORS } from "../../utils/constants";
import { applyNodeChanges } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { useReordering } from '../../hooks/useReordering';
import { useFlowScreenConverters } from '../../utils/coords';
import { ReorderIndicator } from '../TreeVisualization/ReorderIndicator';


function findNodeById(node, id) {
  if (node.id === id) return node;
  if (!node.children) return null;

  for (const child of node.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }

  return null;
}




const Legend = () => (
  <div
    style={{
      position: "absolute",
      bottom: 8,
      left: 8,
      background: "rgba(255,255,255,0.9)",
      padding: "8px 12px",
      borderRadius: 8,
      border: "1px solid #ddd",
      fontSize: 12,
      display: "flex",
      flexDirection: "column",
      gap: 4,
      zIndex: 999,
      pointerEvents: "none",
    }}
  >
    {Object.entries(ALTERNATIVE_EMOTION_COLORS).map(([emotion, color]) => (
      <div key={emotion} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            backgroundColor: color,
            border: "1px solid #999",
          }}
        />
        <span>{emotion}</span>
      </div>
    ))}
  </div>
);

function applyCoordsToTree(tree, rfNodes) {
  if (!tree) return tree;

  // Build a lookup map: id → y
  const yMap = new Map();
  rfNodes.forEach((n) => {
    if (n.id && n.position) {
      yMap.set(n.id, n.position.y);
    }
  });

  // Recursive updater
  const update = (node) => {
    const newY = yMap.get(node.id);
    const updatedNode = newY !== undefined
      ? { ...node, y_coord: newY }
      : node;

    if (!node.children) return updatedNode;

    return {
      ...updatedNode,
      isModified: node.isModified,
      children: node.children.map(update)
    };
  };

  return update(tree);
}




const nodeTypes = { node: TreeNode };

/**
 * Recursively convert tree structure to ELK nodes
 * Marks leaf nodes (level 0) as editable
 */
function treeToElkNodes(node, nodes = [], parentId = null) {
  // Determine if this node is a leaf (no children OR type is "leaf")
  const isLeaf = (!node.children || node.children.length === 0) || node.type === "leaf";
  
  // For leaf nodes, use content; for others, use label
  var sentenceContent = isLeaf 
    ? (node.content || node.label || "NodeDefault")
    : (node.label || node.content || "Node");
  sentenceContent = node.content
  nodes.push({
    id: node.id,
    type: "node",
    width: 200,
    height: 60,

    // Do NOT set parentNode for ReactFlow here; ELK returns absolute positions.
    // Using parentNode causes ReactFlow to offset children relative to parents,
    // stretching the tree to the right/down.
    data: {
      isLeaf: node.level === LEAF_NODE_LEVEL,
      nodeLevel: node.level,
      emotion: node.emotion,
      sentence: sentenceContent,
      isModified: node.isModified, 
    },
  });

  if (node.children) {
    node.children.forEach(child => treeToElkNodes(child, nodes, node.id));
  }

  return nodes;
}

/**
 * Recursively convert tree structure to ELK edges
 */
function treeToElkEdges(node, edges = []) {
  if (node.children) {
    node.children.forEach(child => {
      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        target: child.id,
      });
      treeToElkEdges(child, edges);
    });
  }

  return edges;
}

/**
 * Find and update a node in the tree by ID.
 * Returns:
 * - a NEW tree object when a node was changed (new object identity on the path),
 * - the original node object when nothing changed in that subtree.
 */
function updateNodeInTree(node, nodeId, newContent) {
  if (!node) return node;

  // If this is the target node, return a shallow copy with updated label
  if (node.id === nodeId) {
    return {
      ...node,
      content: newContent,
    };
  }

  // If no children, nothing to change; return the same node object
  if (!node.children || node.children.length === 0) {
    return node;
  }

  // Recurse into children, producing updatedChildren array
  const updatedChildren = node.children.map(child => updateNodeInTree(child, nodeId, newContent));

  // Detect whether any child changed identity (immutability check)
  let changed = false;
  for (let i = 0; i < updatedChildren.length; i++) {
    if (updatedChildren[i] !== node.children[i]) {
      changed = true;
      break;
    }
  }

  // If none of the children changed, return original node (no allocation)
  if (!changed) {
    return node;
  }

  // Otherwise return a shallow copy of node with updated children
  return {
    ...node,
    children: updatedChildren,
  };
}

export default function ElkTree({ tree, setTree }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const rfRef = useRef(null);
  const containerRef = useRef(null);

  // Convert tree structure to ELK nodes and edges
  const treeNodes = useMemo(() => {
    console.log('[ElkTree] Converting tree to ELK nodes');
    if (!tree) return [];
    return treeToElkNodes(tree);
  }, [tree]);

  const treeEdges = useMemo(() => {
    if (!tree) return [];
    return treeToElkEdges(tree);
  }, [tree]);

  // Handle node edit - only for leaf nodes
  const handleNodeEdit = useCallback((nodeId, newContent) => {
    console.log('[ElkTree] Editing node', nodeId, 'to', newContent);

    const updatedRoot = updateNodeInTree(tree, nodeId, newContent);
    console.log('[ElkTree] Updated root:', updatedRoot);
    // If updateNodeInTree returns the same root object, nothing changed
    if (updatedRoot === tree) {
      console.log('[ElkTree] No change detected for node', nodeId);
      return;
    }

    // Otherwise update state with the new tree object
    setTree(updatedRoot);
  }, [tree, setTree]);


  const onInit = useCallback((inst) => {
    rfRef.current = inst;
    async function layout() {
      const laidOut = await runElk(treeNodes, treeEdges);
      
      console.log('[ElkTree] runElk returned', laidOut.length, 'nodes:', laidOut);

      const reactFlowNodes = laidOut.map((n) => ({
        ...n,
        type: "node",
        sourcePosition: 'right',
        targetPosition: 'left',
        data: {
          ...n.data,
          setSentence: (newText) => {
            handleNodeEdit(n.id, newText);
          },
        },
      }));

      console.log('[ElkTree] Setting ReactFlow nodes:', reactFlowNodes);
      setNodes(reactFlowNodes);
      setEdges(treeEdges);
      // Ensure edges connect to initial ELK-computed positions
      setTimeout(() => {
        if (rfRef.current?.updateNodeInternals) {
          console.log('[ElkTree] Updating edge internals after initial layout');
          reactFlowNodes.forEach(n => rfRef.current.updateNodeInternals(n.id));
        }
      }, 0);
    }

    layout();
  }, [tree]);

  // Re-layout whenever the incoming tree changes (e.g., parent adds nodes)
  useEffect(() => {
    if (!tree || !rfRef.current) return;

    async function layout() {
      const laidOut = await runElk(treeNodes, treeEdges);

      const reactFlowNodes = laidOut.map((n) => ({
        ...n,
        type: 'node',
        sourcePosition: 'right',
        targetPosition: 'left',
        data: { ...n.data, setSentence: (txt) => handleNodeEdit(n.id, txt) },
      }));

      setNodes(reactFlowNodes);
      setEdges(treeEdges);

      // Ensure edges connect to the fresh positions
      setTimeout(() => {
        if (rfRef.current?.updateNodeInternals) {
          reactFlowNodes.forEach((n) => rfRef.current.updateNodeInternals(n.id));
        }
      }, 0);
    }

    layout();
  }, [tree]);


    //===============================================================
    // Node reordering stuff
    // vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv

  const [draggedId, setDraggedId] = useState(null);
  const [reorderIndicator, setReorderIndicator] = useState(null);
  const [reorderActive, setReorderActive] = useState(false);

  const { findClosestSibling, checkReorderDrop } = useReordering();
  const { toScreenPoint, toScreenSize } = useFlowScreenConverters();
  const { getNodes } = useReactFlow();
  
  // Update edges whenever nodes change position
  useEffect(() => {
    if (nodes.length > 0 && rfRef.current?.updateNodeInternals) {
      console.log('[ElkTree] Updating edge internals for all', nodes.length, 'nodes');
      nodes.forEach(n => {
        rfRef.current.updateNodeInternals(n.id);
      });
    }
  }, [nodes]);

  const onNodeDragStart = useCallback((_, node) => {
    setDraggedId(node.id);
  }, []);

  function reorderTreeChildren(tree, draggedId, targetId, insertBefore) {
    // Support reordering across different parents on the same level
    // 1) Find current parent of dragged and parent of target
    function findParent(curr, childId) {
      if (!curr?.children?.length) return null;
      if (curr.children.some((c) => c.id === childId)) return curr;
      for (const ch of curr.children) {
        const res = findParent(ch, childId);
        if (res) return res;
      }
      return null;
    }

    const draggedParent = findParent(tree, draggedId);
    const targetParent = findParent(tree, targetId);
    if (!draggedParent || !targetParent) return tree;

    // 2) Remove dragged from its current parent's children
    const removeDragged = (curr) => {
      if (!curr?.children?.length) return curr;
      if (curr.id === draggedParent.id) {
        const children = curr.children.filter((c) => c.id !== draggedId);
        return { ...curr, children };
      }
      const newChildren = curr.children.map(removeDragged);
      for (let i = 0; i < newChildren.length; i++) {
        if (newChildren[i] !== curr.children[i]) {
          return { ...curr, children: newChildren };
        }
      }
      return curr;
    };

    const withoutDragged = removeDragged(tree);

    // 3) Insert dragged into targetParent's children at position relative to targetId
    function insertIntoTargetParent(curr, draggedNode) {
      if (!curr?.children?.length) return curr;
      if (curr.id === targetParent.id) {
        const children = [...curr.children];
        const to = children.findIndex((c) => c.id === targetId);
        if (to === -1) return curr;
        const insertIndex = insertBefore ? to : to + 1;
        children.splice(insertIndex, 0, draggedNode);
        return { ...curr, children };
      }
      const newChildren = curr.children.map((c) => insertIntoTargetParent(c, draggedNode));
      for (let i = 0; i < newChildren.length; i++) {
        if (newChildren[i] !== curr.children[i]) {
          return { ...curr, children: newChildren };
        }
      }
      return curr;
    }

    // Find the dragged node object to reinsert
    function findNode(curr, id) {
      if (!curr) return null;
      if (curr.id === id) return curr;
      if (!curr.children) return null;
      for (const ch of curr.children) {
        const res = findNode(ch, id);
        if (res) return res;
      }
      return null;
    }

    const draggedNode = findNode(tree, draggedId);
    if (!draggedNode) return tree;

    return insertIntoTargetParent(withoutDragged, draggedNode);
  }



  const onNodeDrag = useCallback((_, node) => {
    // Compute closest sibling at same level and show separator
    const closest = findClosestSibling(node.id, node.position.y);
    if (closest) {
      const screenPos = toScreenPoint({ x: closest.node.position.x, y: closest.node.position.y });
      const screenSize = toScreenSize({ width: closest.node.width || 200, height: closest.node.height || 60 });
      setReorderIndicator({
        x: screenPos.x,
        y: screenPos.y + (closest.insertBefore ? 0 : screenSize.height),
        width: screenSize.width,
        isAbove: closest.insertBefore,
      });
      setReorderActive(true);
    } else {
      setReorderIndicator(null);
      setReorderActive(false);
    }
    
    // Update edges for the dragged node during drag
    if (rfRef.current?.updateNodeInternals) {
      rfRef.current.updateNodeInternals(node.id);
    }
  }, [findClosestSibling, toScreenPoint, toScreenSize, draggedId]);

  const onNodeDragStop = useCallback((_, node) => {
    const reorder = checkReorderDrop(node.id, node.position.y);
    setReorderIndicator(null);
    setDraggedId(null);
    
    if (!reorder || !reorderActive) {
      // Even if no reorder, update all edges after drag ends
      if (rfRef.current?.updateNodeInternals) {
        console.log('[ElkTree] Drag ended, updating all edge internals');
        nodes.forEach(n => rfRef.current.updateNodeInternals(n.id));
      }
      // If indicator wasn't active, snap node(s) back to ELK-computed positions
      setTimeout(async () => {
        const newNodesArr = treeToElkNodes(tree);
        const newEdgesArr = treeToElkEdges(tree);
        const laidOut = await runElk(newNodesArr, newEdgesArr);
        const reactFlowNodes = laidOut.map((n) => ({
          ...n,
          type: 'node',
          sourcePosition: 'right',
          targetPosition: 'left',
          data: { ...n.data, setSentence: (txt) => handleNodeEdit(n.id, txt) },
        }));
        setNodes(reactFlowNodes);
        setEdges(newEdgesArr);
        // Ensure edges connect to the restored positions
        setTimeout(() => {
          if (rfRef.current?.updateNodeInternals) {
            console.log('[ElkTree] Updating edge internals after snap-back');
            reactFlowNodes.forEach(n => rfRef.current.updateNodeInternals(n.id));
          }
        }, 0);
      }, 0);
      return;
    }

    const newTree = reorderTreeChildren(
      tree,
      node.id,
      reorder.targetSiblingId,
      reorder.insertBefore
    );

    setTree(newTree);
    // Single relayout after drop
    setTimeout(async () => {
      const newNodesArr = treeToElkNodes(newTree);
      const newEdgesArr = treeToElkEdges(newTree);
      const laidOut = await runElk(newNodesArr, newEdgesArr);
      const reactFlowNodes = laidOut.map((n) => ({
        ...n,
        type: 'node',
        sourcePosition: 'right',
        targetPosition: 'left',
        data: { ...n.data, setSentence: (txt) => handleNodeEdit(n.id, txt) },
      }));
      setNodes(reactFlowNodes);
      setEdges(newEdgesArr);
      
      // Force ReactFlow to update edge positions after reordering
      // This ensures edges reconnect properly to the new node positions
      setTimeout(() => {
        if (rfRef.current?.updateNodeInternals) {
          console.log('[ElkTree] Updating edge internals after reorder');
          reactFlowNodes.forEach(n => {
            rfRef.current.updateNodeInternals(n.id);
          });
        }
      }, 0);
    }, 0);
  }, [checkReorderDrop, tree, setTree, handleNodeEdit, nodes]);



  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: 'relative' }}>
      <ReactFlow
        onInit={onInit}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={false}
        nodesDraggable={true}
        minZoom={0.01} 
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={(changes) => {
          // Keep other nodes fixed during drag/reorder; accept only direct node position changes
          setNodes((nds) => applyNodeChanges(changes, nds));
        }}

      >
        <Background variant="dots" gap={40} size={4} color="#e0e3e7" />
        <Legend />
        <Controls showInteractive={false} position="bottom-right"/>
      </ReactFlow>
        {reorderIndicator && (
          (() => {
            const rect = containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 };
            const left = (reorderIndicator.x - rect.left) - (reorderIndicator.width / 2);
            const top = (reorderIndicator.y - rect.top) + (reorderIndicator.isAbove ? -10 : 10);
            return (
              <div
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: reorderIndicator.width,
                  height: 4,
                  backgroundColor: '#3b82f6',
                  borderRadius: 2,
                  pointerEvents: 'none',
                  zIndex: 10000,
                  boxShadow: '0 0 10px rgba(59, 130, 246, 0.7)'
                }}
              />
            );
          })()
        )}
    </div>
  );
}

function getCandidateParentId(pointer, nodes) {
  // Only consider nodes whose level === startLevel - 1 (direct parent level)
  const parentCandidates = nodes.filter(n => n.data.level === startLevel - 1);
  // Compute screen-space rects and choose the closest center within a tolerance
  let best = null, minDist = Infinity;
  for (const p of parentCandidates) {
    const rect = toScreenRect(p);
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const d = Math.hypot(pointer.x - cx, pointer.y - cy);
    if (d < minDist && d < PARENT_PROXIMITY_THRESHOLD) { minDist = d; best = p.id; }
  }
  return best; // may be null → keep original parent on drop
}