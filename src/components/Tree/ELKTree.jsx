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
function treeToElkNodes(node, nodes = []) {
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
    data: {
      isLeaf: node.level === LEAF_NODE_LEVEL,
      nodeLevel: node.level,
      emotion: node.emotion,
      sentence: sentenceContent,
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

  // Layout with ELK
  useEffect(() => {
    if (treeNodes.length === 0) {
      console.log('[ElkTree] No treeNodes, skipping layout');
      return;
    }

    console.log('[ElkTree] Layout effect triggered with', treeNodes.length, 'nodes');


  }, [treeNodes, treeEdges]);

  const onInit = useCallback((inst) => {
    rfRef.current = inst;
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
  }, [tree]);


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
        nodesDraggable={true}
        minZoom={0.01} 
        onNodesChange={(changes) => {
          setNodes((nds) => {
            const updated = applyNodeChanges(changes, nds);

            // mutate tree nodes without calling setTree
            for (const rfNode of updated) {
              const y = rfNode.position?.y;
              if (y == null) continue;

              const treeNode = findNodeById(tree, rfNode.id);
              if (treeNode) {
                treeNode.y_coord = y;   // DIRECT mutation
              }
            }

            return updated;
          });
          
        }}

      >
        <Background variant="dots" gap={40} size={4} color="#e0e3e7" />
        <Legend />
        <Controls showInteractive={false} position="bottom-right"/>
      </ReactFlow>
    </div>
  );
}