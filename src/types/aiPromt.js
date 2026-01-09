/**
 * @fileoverview Lightweight representations for AI operations
 * 
 * Strategy: Project full Node objects to minimal representations
 * for specific AI operations. This reduces token usage by 90%+.
 * 
 * EXAMPLES:
 * - Reordering: only need id + content + index
 * - Emotions: only need id + content + current emotions
 * - Hierarchy: only need id + content + level + children
 */

// ==================== PROJECTION TYPES ====================

/**
 * Minimal node for ordering operations
 * Send to Claude to reorder sequences
 * ≈ 30-50 tokens per node
 * 
 * @typedef {Object} NodeForOrdering
 * @property {string} id
 * @property {string} content - Text to reorder
 * @property {number} currentIndex - Current position
 */

/**
 * Minimal node for emotion operations
 * Send to Claude to analyze/change emotions
 * ≈ 60-80 tokens per node
 * 
 * @typedef {Object} NodeForEmotion
 * @property {string} id
 * @property {string} content
 * @property {import('./node.js').EmotionProfile} [currentEmotion] - Current DES profile
 */

/**
 * Minimal node for hierarchy operations
 * Send to Claude to reorganize structure
 * ≈ 40-60 tokens per node
 * 
 * @typedef {Object} NodeForHierarchy
 * @property {string} id
 * @property {string} content
 * @property {number} currentLevel - Current depth in hierarchy
 * @property {string[]} currentChildren - Child IDs (for context)
 */

/**
 * Minimal complete node
 * For complex operations needing context but not all metadata
 * ≈ 100-150 tokens per node
 * 
 * @typedef {Object} NodeMinimal
 * @property {string} id
 * @property {string} type
 * @property {string} content
 * @property {number} level - Hierarchy level
 * @property {string[]} childIds - Children
 * @property {import('./node.js').EmotionProfile} [emotions]
 */

// ==================== SINGLE NODE PROJECTIONS ====================

/**
 * Project node to ordering representation
 * @param {import('./node.js').Node} node
 * @param {number} index
 * @returns {NodeForOrdering}
 * 
 * @example
 * const minimal = projectForOrdering(node, 0);
 * // { id: "...", content: "Hello", currentIndex: 0 }
 */
export function projectForOrdering(node, index) {
  return {
    id: node.id,
    content: node.content,
    currentIndex: index,
  };
}

/**
 * Project node to emotion representation
 * @param {import('./node.js').Node} node
 * @returns {NodeForEmotion}
 */
export function projectForEmotion(node) {
  return {
    id: node.id,
    content: node.content,
    currentEmotion: node.emotion?.profile,
  };
}

/**
 * Project node to hierarchy representation
 * @param {import('./node.js').Node} node
 * @returns {NodeForHierarchy}
 */
export function projectForHierarchy(node) {
  return {
    id: node.id,
    content: node.content,
    currentLevel: node.hierarchy.level,
    currentChildren: node.hierarchy.childIds,
  };
}

/**
 * Project node to minimal representation
 * @param {import('./node.js').Node} node
 * @returns {NodeMinimal}
 */
export function projectToMinimal(node) {
  return {
    id: node.id,
    type: node.type,
    content: node.content,
    level: node.hierarchy.level,
    childIds: node.hierarchy.childIds,
    emotions: node.emotion?.profile,
  };
}

// ==================== ARRAY PROJECTIONS ====================

/**
 * Project array of nodes to ordering representation
 * @param {import('./node.js').Node[]} nodes
 * @returns {NodeForOrdering[]}
 * 
 * @example
 * const minimal = projectArrayForOrdering(sentences);
 * // [{id: "...", content: "...", currentIndex: 0}, ...]
 */
export function projectArrayForOrdering(nodes) {
  return nodes.map((node, idx) => projectForOrdering(node, idx));
}

/**
 * Project array of nodes to emotion representation
 * @param {import('./node.js').Node[]} nodes
 * @returns {NodeForEmotion[]}
 */
export function projectArrayForEmotion(nodes) {
  return nodes.map(projectForEmotion);
}

/**
 * Project array of nodes to hierarchy representation
 * @param {import('./node.js').Node[]} nodes
 * @returns {NodeForHierarchy[]}
 */
export function projectArrayForHierarchy(nodes) {
  return nodes.map(projectForHierarchy);
}

/**
 * Project array to minimal representation
 * @param {import('./node.js').Node[]} nodes
 * @returns {NodeMinimal[]}
 */
export function projectArrayToMinimal(nodes) {
  return nodes.map(projectToMinimal);
}

// ==================== TREE VISUALIZATION ====================

/**
 * Create text tree view for display in prompts
 * Shows hierarchy structure clearly
 * 
 * @param {NodeForHierarchy[]} nodes
 * @param {Map<string, NodeForHierarchy>} nodeMap
 * @param {string} [rootId] - Start from this node
 * @returns {string}
 * 
 * @example
 * const tree = treeViewForPrompt(projected, nodeMap);
 * // "├ Chapter 1\n│ ├ Section A\n│ │ ├ Sentence 1\n│ │ └ Sentence 2\n"
 */
export function treeViewForPrompt(nodes, nodeMap, rootId = null) {
  const lines = [];

  function traverse(nodeId, depth = 0, prefix = '') {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const isLast = depth === 0; // Simplified for now
    const connector = isLast ? '└ ' : '├ ';
    const nextPrefix = depth === 0 ? '' : prefix + (isLast ? '  ' : '│ ');

    // Show first 80 chars of content
    const displayContent = node.content.substring(0, 80).replace(/\n/g, ' ');
    lines.push(prefix + connector + displayContent);

    // Traverse children
    for (const childId of node.currentChildren) {
      traverse(childId, depth + 1, nextPrefix);
    }
  }

  if (rootId) {
    traverse(rootId);
  } else {
    // Find root (no parent)
    for (const node of nodes) {
      if (!nodeMap.get(node.id)?.currentLevel || nodeMap.get(node.id).currentLevel === 0) {
        traverse(node.id);
      }
    }
  }

  return lines.join('\n');
}

// ==================== FORMATTING FOR PROMPTS ====================

/**
 * Format minimal nodes as readable list for Claude
 * @param {NodeForOrdering[] | NodeForEmotion[] | NodeMinimal[]} nodes
 * @param {number} [maxLength=50] - Max content length
 * @returns {string}
 * 
 * @example
 * const text = formatNodesForPrompt(nodes);
 * // "[0] First sentence here...\n[1] Second sentence..."
 */
export function formatNodesForPrompt(nodes, maxLength = 50) {
  return nodes
    .map((node, idx) => {
      const id = node.id.substring(0, 8);
      const content = node.content.substring(0, maxLength).replace(/\n/g, ' ');
      return `[${idx}] (${id}) ${content}`;
    })
    .join('\n');
}

/**
 * Format emotions for display in prompt
 * @param {import('./node.js').EmotionProfile} [emotions]
 * @returns {string}
 */
export function formatEmotionForPrompt(emotions) {
  if (!emotions) return 'No emotion data';

  const AXES = [
    'interest',
    'joy',
    'surprise',
    'sadness',
    'anger',
    'disgust',
    'contempt',
    'fear',
    'shame',
    'guilt',
  ];

  const active = AXES.filter(axis => emotions[axis] > 10)
    .map(axis => `${axis}: ${emotions[axis]}`)
    .join(', ');

  return active || 'Neutral (all < 10)';
}

export default {
  // Single node projections
  projectForOrdering,
  projectForEmotion,
  projectForHierarchy,
  projectToMinimal,

  // Array projections
  projectArrayForOrdering,
  projectArrayForEmotion,
  projectArrayForHierarchy,
  projectArrayToMinimal,

  // Formatting
  treeViewForPrompt,
  formatNodesForPrompt,
  formatEmotionForPrompt,
};