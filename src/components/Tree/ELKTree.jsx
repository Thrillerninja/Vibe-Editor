/**
 * ELKTree.jsx
 * 
 * Renders tree structure with ELK layout
 * - Only leaf nodes (level 1) are editable
 * - Updates propagate back to parent via setTree callback
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import ReactFlow, { Background, ConnectionMode } from "reactflow";
import { runElk } from "../../utils/layoutEngine";
import TreeNode from "./TreeNode";

import { LEAF_NODE_LEVEL } from "../../utils/constants";

const nodeTypes = { node: TreeNode };

/**
 * Recursively convert tree structure to ELK nodes
 * Marks leaf nodes (level 1) as editable
 */
function treeToElkNodes(node, nodes = []) {
  nodes.push({
    id: node.id,
    type: "node",
    width: 200,
    height: 60,
    data: {
      sentence: node.label || node.content || "Node",
      isLeaf: node.level === LEAF_NODE_LEVEL, // Only leaf nodes are editable
      nodeLevel: node.level,
    },
  });

  if (node.children) {
    node.children.forEach(child => treeToElkNodes(child, nodes));
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
function updateNodeInTree(node, nodeId, newLabel) {
  if (!node) return node;

  // If this is the target node, return a shallow copy with updated label
  if (node.id === nodeId) {
    return { ...node, label: newLabel };
  }

  // If no children, nothing to change; return the same node object
  if (!node.children || node.children.length === 0) {
    return node;
  }

  // Recurse into children, producing updatedChildren array
  const updatedChildren = node.children.map(child => updateNodeInTree(child, nodeId, newLabel));

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
  const handleNodeEdit = useCallback((nodeId, newLabel) => {
    console.log('[ElkTree] Editing node', nodeId, 'to', newLabel);

    const updatedRoot = updateNodeInTree(tree, nodeId, newLabel);

    // If updateNodeInTree returns the same root object, nothing changed
    if (updatedRoot === tree) {
      console.log('[ElkTree] No change detected for node', nodeId);
      return;
    }

    // Otherwise update state with the new tree object
    setTree(updatedRoot);
  }, [tree, setTree]);

  // Layout with ELK
  useEffect(() => {
    if (treeNodes.length === 0) {
      console.log('[ElkTree] No treeNodes, skipping layout');
      return;
    }

    console.log('[ElkTree] Layout effect triggered with', treeNodes.length, 'nodes');

    async function layout() {
      const laidOut = await runElk(treeNodes, treeEdges);
      
      console.log('[ElkTree] runElk returned', laidOut.length, 'nodes:', laidOut);

      const reactFlowNodes = laidOut.map((n) => ({
        ...n,
        type: "node",
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
    }

    layout();
  }, [treeNodes, treeEdges]);

  const onInit = useCallback((inst) => {
    rfRef.current = inst;
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        onInit={onInit}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        connectionMode={ConnectionMode.Loose}
        nodesConnectable={false}
      >
        <Background variant="dots" gap={40} size={4} color="#e0e3e7" />
      </ReactFlow>
    </div>
  );
}