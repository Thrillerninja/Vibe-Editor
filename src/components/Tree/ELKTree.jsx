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
import { ALTERNATIVE_EMOTION_COLORS } from "../../utils/constants";
import { applyNodeChanges } from 'reactflow';
import { useNodeReordering } from './NodeReordering';





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




const nodeTypes = { node: TreeNode };

/**
 * Recursively convert tree structure to ELK nodes
 * Marks leaf nodes (level 0) as editable
 */
function treeToElkNodes(node, nodes = [], parentId = null) {
  // Determine if this node is a leaf (no children OR type is "leaf")
  const isLeaf = (!node.children || node.children.length === 0) || node.type === "leaf";
  
  // For display: leaf nodes use content, non-leaf nodes use label
  const displayLabel = isLeaf 
    ? (node.content || node.label || "NodeDefault")
    : (node.label || node.content || "Node");
  
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
      label: displayLabel,
      content: node.content || "",
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
function updateNodeInTree(node, nodeId, newContent, newEmotion) {
  if (!node) return node;

  // If this is the target node, return a shallow copy with updated label and set isModified
  if (node.id === nodeId) {
    return {
      ...node,
      content: newContent,
      isModified: true,
      emotion: newEmotion,
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
  const handleNodeEdit = useCallback((nodeId, newContent, newEmotion) => {
    console.log('[ElkTree] Editing node', nodeId, 'to', newContent);

    const updatedRoot = updateNodeInTree(tree, nodeId, newContent, newEmotion);
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
          setSentence: (newText, newEmotion) => {
            handleNodeEdit(n.id, newText, newEmotion);
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





  //===============================================================
  // Node reordering using custom hook
  // vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv

  // Helper functions for tree conversion (needed by reordering hook)
  const treeToElkNodesHelper = useCallback((root) => treeToElkNodes(root), []);
  const treeToElkEdgesHelper = useCallback((root) => treeToElkEdges(root), []);

  const {
    draggedId,
    reorderIndicator,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = useNodeReordering(
    tree,
    setTree,
    rfRef,
    nodes,
    setNodes,
    setEdges,
    treeToElkNodesHelper,
    treeToElkEdgesHelper,
    runElk,
    handleNodeEdit
  );



  // Re-layout whenever the incoming tree changes (e.g., parent adds nodes)
  useEffect(() => {
    if (!tree || !rfRef.current) return;
    if (draggedId) return; // 🔑 THIS LINE

    async function layout() {
      const laidOut = await runElk(treeNodes, treeEdges);
      setNodes(laidOut.map(n => ({
        ...n,
        type: 'node',
        sourcePosition: 'right',
        targetPosition: 'left',
        data: { ...n.data, setSentence: (txt, emo) => handleNodeEdit(n.id, txt, emo) },
      })));
      setEdges(treeEdges);
    }

    layout();
  }, [tree, draggedId]);



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