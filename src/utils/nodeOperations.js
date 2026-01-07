/**
 * @fileoverview Node modification and traversal operations
 * 
 * Pure functions that operate on nodes.
 * All functions return new objects (immutable pattern).
 * 
 * USAGE:
 * - Apply ordering changes from AI
 * - Apply emotion changes from AI
 * - Apply hierarchy restructuring from AI
 * - Validate tree structure
 */

import * as NodeTypes from '../types/node.js';

// ==================== HIERARCHY MODIFICATION ====================

/**
 * Add a child to a parent node
 * Returns new parent node with child added
 * 
 * @param {NodeTypes.Node} parentNode
 * @param {string} childId
 * @returns {NodeTypes.Node}
 * 
 * @throws {Error} If child already exists
 * 
 * @example
 * const parent = addChildToNode(groupNode, 'child-id');
 */
export function addChildToNode(parentNode, childId) {
  if (parentNode.hierarchy.childIds.includes(childId)) {
    throw new Error(`Child ${childId} already exists in parent`);
  }

  return {
    ...parentNode,
    hierarchy: {
      ...parentNode.hierarchy,
      childIds: [...parentNode.hierarchy.childIds, childId],
    },
  };
}

/**
 * Remove a child from a parent node
 * @param {NodeTypes.Node} parentNode
 * @param {string} childId
 * @returns {NodeTypes.Node}
 * 
 * @throws {Error} If child doesn't exist
 */
export function removeChildFromNode(parentNode, childId) {
  const index = parentNode.hierarchy.childIds.indexOf(childId);
  if (index === -1) {
    throw new Error(`Child ${childId} not found in parent`);
  }

  const newChildIds = parentNode.hierarchy.childIds.filter(id => id !== childId);
  return {
    ...parentNode,
    hierarchy: {
      ...parentNode.hierarchy,
      childIds: newChildIds,
    },
  };
}

/**
 * Reorder children within a parent
 * @param {NodeTypes.Node} parentNode
 * @param {string} childId - Child to move
 * @param {number} newIndex - New position
 * @returns {NodeTypes.Node}
 * 
 * @throws {Error} If child not found or invalid index
 */
export function reorderChildInNode(parentNode, childId, newIndex) {
  const currentIndex = parentNode.hierarchy.childIds.indexOf(childId);
  if (currentIndex === -1) {
    throw new Error(`Child ${childId} not found`);
  }

  if (newIndex < 0 || newIndex >= parentNode.hierarchy.childIds.length) {
    throw new Error(`Invalid index ${newIndex}`);
  }

  const newChildIds = [...parentNode.hierarchy.childIds];
  newChildIds.splice(currentIndex, 1);
  newChildIds.splice(newIndex, 0, childId);

  return {
    ...parentNode,
    hierarchy: {
      ...parentNode.hierarchy,
      childIds: newChildIds,
    },
  };
}

/**
 * Set a node's parent
 * @param {NodeTypes.Node} node
 * @param {string | null} parentId
 * @returns {NodeTypes.Node}
 */
export function setNodeParent(node, parentId) {
  return {
    ...node,
    hierarchy: {
      ...node.hierarchy,
      parentId,
    },
  };
}

/**
 * Set a node's level
 * @param {NodeTypes.Node} node
 * @param {number} level
 * @returns {NodeTypes.Node}
 * 
 * @throws {Error} If invalid level
 */
export function setNodeLevel(node, level) {
  if (typeof level !== 'number' || level < 0 || level > 6) {
    throw new Error(`Invalid level ${level}, must be 0-6`);
  }

  return {
    ...node,
    hierarchy: {
      ...node.hierarchy,
      level,
    },
  };
}

// ==================== EMOTION MODIFICATION ====================

/**
 * Set node's emotion profile
 * @param {NodeTypes.Node} node
 * @param {NodeTypes.EmotionProfile} profile - DES profile
 * @param {'manual'|'ai'|'aggregated'} [source='manual']
 * @returns {NodeTypes.Node}
 */
export function setNodeEmotion(node, profile, source = 'manual') {
  // Find dominant emotion
  let dominantEmotion = 'interest';
  let dominantIntensity = 0;

  for (const [emotion, intensity] of Object.entries(profile)) {
    if (intensity > dominantIntensity) {
      dominantIntensity = intensity;
      dominantEmotion = emotion;
    }
  }

  return {
    ...node,
    emotion: {
      profile,
      dominantEmotion,
      dominantIntensity,
      source,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Clear node's emotion data
 * @param {NodeTypes.Node} node
 * @returns {NodeTypes.Node}
 */
export function clearNodeEmotion(node) {
  const updated = { ...node };
  delete updated.emotion;
  return updated;
}

// ==================== BATCH OPERATIONS ====================

/**
 * Apply ordering changes from AI to an array of nodes
 * Returns new array with same nodes in new order
 * 
 * @param {NodeTypes.Node[]} nodes
 * @param {{nodeId: string, newIndex: number}[]} ordering - From AI
 * @returns {NodeTypes.Node[]} - Reordered
 * 
 * @throws {Error} If ordering is invalid
 * 
 * @example
 * const reordered = applyOrdering(nodes, [
 *   { nodeId: "id-2", newIndex: 0 },
 *   { nodeId: "id-1", newIndex: 1 }
 * ]);
 */
export function applyOrdering(nodes, ordering) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const reordered = Array(nodes.length);

  // Check all indices are valid
  const indices = ordering.map(o => o.newIndex);
  if (indices.some(idx => idx < 0 || idx >= nodes.length)) {
    throw new Error('Invalid indices in ordering');
  }

  // Place each node at new index
  for (const { nodeId, newIndex } of ordering) {
    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }
    if (reordered[newIndex] !== undefined) {
      throw new Error(`Duplicate index ${newIndex}`);
    }
    reordered[newIndex] = node;
  }

  // Verify no holes
  if (reordered.some(n => n === undefined)) {
    throw new Error('Incomplete ordering (missing indices)');
  }

  return reordered;
}

/**
 * Apply emotion changes from AI to nodes
 * Returns new array with updated emotions
 * 
 * @param {NodeTypes.Node[]} nodes
 * @param {{nodeId: string, emotions: NodeTypes.EmotionProfile}[]} changes
 * @returns {NodeTypes.Node[]}
 */
export function applyEmotions(nodes, changes) {
  const changeMap = new Map(changes.map(c => [c.nodeId, c]));

  return nodes.map(node => {
    const change = changeMap.get(node.id);
    if (!change) return node;

    return setNodeEmotion(node, change.emotions, 'ai');
  });
}

/**
 * Apply hierarchy restructuring from AI
 * Updates parent/level for each node
 * 
 * @param {NodeTypes.Node[]} nodes
 * @param {{nodeId: string, parentId: string | null, level: number}[]} changes
 * @returns {NodeTypes.Node[]}
 */
export function applyHierarchyChanges(nodes, changes) {
  const changeMap = new Map(changes.map(c => [c.nodeId, c]));

  return nodes.map(node => {
    const change = changeMap.get(node.id);
    if (!change) return node;

    let updated = setNodeParent(node, change.parentId);
    updated = setNodeLevel(updated, change.level);
    updated = NodeTypes.markNodeDirty(updated);

    return updated;
  });
}

// ==================== VALIDATION ====================

/**
 * Validate a single node's hierarchy consistency
 * @param {NodeTypes.Node} node
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateNodeHierarchy(node, nodeMap) {
  const errors = [];

  // Check parent exists
  if (node.hierarchy.parentId) {
    const parent = nodeMap.get(node.hierarchy.parentId);
    if (!parent) {
      errors.push(`Parent ${node.hierarchy.parentId} does not exist`);
    } else if (!parent.hierarchy.childIds.includes(node.id)) {
      errors.push(`Parent does not list this node as child`);
    }
  }

  // Check all children exist and point back
  for (const childId of node.hierarchy.childIds) {
    const child = nodeMap.get(childId);
    if (!child) {
      errors.push(`Child ${childId} does not exist`);
    } else if (child.hierarchy.parentId !== node.id) {
      errors.push(`Child ${childId} does not point back to parent`);
    }
  }

  // Check level consistency
  if (node.hierarchy.parentId) {
    const parent = nodeMap.get(node.hierarchy.parentId);
    if (parent && parent.hierarchy.level >= node.hierarchy.level) {
      errors.push(
        `Node level ${node.hierarchy.level} must be > parent level ${parent.hierarchy.level}`
      );
    }
  }

  // Root validation
  if (node.hierarchy.role === 'root') {
    if (node.hierarchy.parentId) {
      errors.push('Root node should not have a parent');
    }
    if (node.hierarchy.level !== 0) {
      errors.push('Root node must be at level 0');
    }
  }

  // Content node validation
  if (node.hierarchy.role === 'content') {
    if (node.hierarchy.level !== 1) {
      errors.push(`Content node must be at level 1, got ${node.hierarchy.level}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate entire tree structure
 * @param {NodeTypes.Node[]} nodes
 * @returns {{valid: boolean, errors: Map<string, string[]>}}
 * 
 * @throws {Error} If multiple roots found
 */
export function validateTreeStructure(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Check for exactly one root
  const roots = nodes.filter(n => n.hierarchy.role === 'root');
  if (roots.length !== 1) {
    throw new Error(`Tree must have exactly 1 root, found ${roots.length}`);
  }

  // Validate each node
  const errorMap = new Map();
  for (const node of nodes) {
    const validation = validateNodeHierarchy(node, nodeMap);
    if (!validation.valid) {
      errorMap.set(node.id, validation.errors);
    }
  }

  return {
    valid: errorMap.size === 0,
    errors: errorMap,
  };
}

// ==================== TREE TRAVERSAL ====================

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
export function findNodes(root, nodeMap, predicate) {
  /**
     * @type {NodeTypes.Node[]}
     */
  const results = [];
  traverseTree(root, nodeMap, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });
  return results;
}

export default {
  // Hierarchy
  addChildToNode,
  removeChildFromNode,
  reorderChildInNode,
  setNodeParent,
  setNodeLevel,

  // Emotions
  setNodeEmotion,
  clearNodeEmotion,

  // Batch operations
  applyOrdering,
  applyEmotions,
  applyHierarchyChanges,

  // Validation
  validateNodeHierarchy,
  validateTreeStructure,

  // Traversal
  traverseTree,
  findNodes,
};