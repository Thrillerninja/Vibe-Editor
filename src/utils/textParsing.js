/**
 * @fileoverview Tree building and visualization
 * 
 * UPDATED: Works with new Node system
 * 
 * Key changes:
 * - Works directly with Node hierarchy info
 * - No separate HierarchyMetadata needed
 * - Builds ReactFlow nodes from Node tree
 */

import { LOG_PREFIX, NODE_WIDTH } from './constants.js';
import * as NodeTypes from '../types/node.js';

// ==================== TREE BUILDING ====================

/**
 * Build hierarchical tree from flat node array
 * Uses hierarchy info embedded in nodes
 * 
 * @param {NodeTypes.Node[]} nodes
 * @returns {{root: NodeTypes.Node, nodeMap: Map<string, NodeTypes.Node>, valid: boolean}}
 */
export function buildTree(nodes) {
  console.log(`${LOG_PREFIX.PARSER} Building tree from ${nodes.length} nodes`);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Find root
  const root = nodes.find(n => n.hierarchy.role === 'root');
  if (!root) {
    throw new Error('No root node found');
  }

  // Validate structure
  const validation = validateTreeStructure(nodes);
  if (!validation.valid) {
    console.warn(`${LOG_PREFIX.PARSER} Tree validation issues:`, validation.errors);
  }

  return {
    root,
    nodeMap,
    valid: validation.valid,
  };
}

/**
 * Flatten tree to ReactFlow nodes and edges
 * 
 * @param {NodeTypes.Node} root
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @returns {{nodes: import('../types/node.js').ReactFlowNode[], edges: any[]}}
 */
export function flattenTree(root, nodeMap) {
  console.log(`${LOG_PREFIX.PARSER} Flattening tree for ReactFlow`);

  const nodes = [];
  const edges = [];
  const visited = new Set();

  function traverse(node) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Create ReactFlow node
    const rfNode = {
      id: node.id,
      data: {
        label: node.content,
        type: node.type,
        content: node.content,
        emotion: node.emotion?.dominantEmotion,
        intensity: node.emotion?.dominantIntensity,
        emotions: node.emotion?.profile,
        isDirty: node.metadata.isDirty,
      },
      position: { x: 0, y: 0 },
      type: 'animatedNode',
      style: { width: NODE_WIDTH },
    };

    nodes.push(rfNode);

    // Create edges for children
    for (const childId of node.hierarchy.childIds) {
      const child = nodeMap.get(childId);
      if (child) {
        edges.push({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
        });
        traverse(child);
      }
    }
  }

  traverse(root);

  console.log(`${LOG_PREFIX.PARSER} Flattened to ${nodes.length} nodes, ${edges.length} edges`);

  return { nodes, edges };
}

// ==================== VALIDATION ====================

/**
 * Validate entire tree structure
 * Checks consistency of parent/child relationships
 * 
 * @param {NodeTypes.Node[]} nodes
 * @returns {{valid: boolean, errors: Map<string, string[]>}}
 */
export function validateTreeStructure(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const errorMap = new Map();

  // Check for exactly one root
  const roots = nodes.filter(n => n.hierarchy.role === 'root');
  if (roots.length !== 1) {
    throw new Error(`Tree must have 1 root, found ${roots.length}`);
  }

  // Validate each node
  for (const node of nodes) {
    const errors = [];

    // Parent validation
    if (node.hierarchy.parentId) {
      const parent = nodeMap.get(node.hierarchy.parentId);
      if (!parent) {
        errors.push(`Parent ${node.hierarchy.parentId} not found`);
      } else if (!parent.hierarchy.childIds.includes(node.id)) {
        errors.push(`Parent does not list this as child`);
      }
    }

    // Children validation
    for (const childId of node.hierarchy.childIds) {
      const child = nodeMap.get(childId);
      if (!child) {
        errors.push(`Child ${childId} not found`);
      } else if (child.hierarchy.parentId !== node.id) {
        errors.push(`Child does not point back to parent`);
      }
    }

    if (errors.length > 0) {
      errorMap.set(node.id, errors);
    }
  }

  return {
    valid: errorMap.size === 0,
    errors: errorMap,
  };
}

// ==================== TRAVERSAL ====================

/**
 * Traverse tree depth-first
 * @param {NodeTypes.Node} node
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @param {(node: NodeTypes.Node, depth: number) => void} callback
 * @param {number} [depth=0]
 */
export function traverseTree(node, nodeMap, callback, depth = 0) {
  callback(node, depth);

  for (const childId of node.hierarchy.childIds) {
    const child = nodeMap.get(childId);
    if (child) {
      traverseTree(child, nodeMap, callback, depth + 1);
    }
  }
}

/**
 * Find all nodes matching predicate
 * @param {NodeTypes.Node} root
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @param {(node: NodeTypes.Node) => boolean} predicate
 * @returns {NodeTypes.Node[]}
 */
export function findNodesInTree(root, nodeMap, predicate) {
  const results = [];
  traverseTree(root, nodeMap, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });
  return results;
}

/**
 * Find all dirty nodes
 * @param {NodeTypes.Node} root
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @returns {NodeTypes.Node[]}
 */
export function findDirtyNodes(root, nodeMap) {
  return findNodesInTree(root, nodeMap, n => n.metadata.isDirty);
}

/**
 * Count nodes by type
 * @param {NodeTypes.Node[]} nodes
 * @returns {Object}
 */
export function countNodeTypes(nodes) {
  const counts = {};
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] || 0) + 1;
  }
  return counts;
}

export default {
  buildTree,
  flattenTree,
  validateTreeStructure,
  traverseTree,
  findNodesInTree,
  findDirtyNodes,
  countNodeTypes,
};