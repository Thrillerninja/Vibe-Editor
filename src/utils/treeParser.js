/**
 * Text parsing utilities
 * NEW APPROACH: Sentences are the single source of truth (SSOT)
 * - Sentences array is edited directly (see sentenceEditor.js)
 * - Build text from sentence nodes
 * - Build tree from sentence nodes up to root
 * - Support AI-generated hierarchies (see hierarchyIntegration.js)
 */

import { LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH } from './constants';
import { buildTreeWithHierarchy } from './hierarchyIntegration';

/**
 * Builds text from sentence nodes (SSOT → Text)
 * Reconstructs text using each sentence's trailing delimiter
 * Adds punctuation if missing (e.g., after reordering)
 * 
 * @param {Array} sentences - Array of sentence nodes
 * @returns {string} Reconstructed text
 */
export function buildTextFromSentences(sentences) {
  if (!sentences || sentences.length === 0) {
    return '';
  }

  // Sort by startIdx to ensure correct order (though should already be ordered)
  const sorted = [...sentences].sort((a, b) => a.startIdx - b.startIdx);

  let result = '';

  for (let i = 0; i < sorted.length; i++) {
    const sentence = sorted[i];
    const isLast = i === sorted.length - 1;

    // Add sentence content
    result += sentence.content;

    // Add trailing punctuation only if explicitly set (e.g., from reordering)
    // Don't add punctuation while user is typing
    const lastChar = sentence.content[sentence.content.length - 1];
    if (!'.!?'.includes(lastChar) && sentence.punctuation) {
      result += sentence.punctuation;
    }

    // Add trailing delimiter based on sentence metadata
    // Prefer exact delimiter content if available (preserves user's formatting)
    // Otherwise fall back to semantic delimiter type
    // Note: Use !== undefined check to allow empty string delimiters
    if (sentence.delimiterContent !== undefined) {
      result += sentence.delimiterContent;
    } else {
      const delimiter = sentence.delimiter;
      if (delimiter === 'paragraph') {
        result += '\n\n';
      } else if (delimiter === 'newline') {
        result += '\n';
      } else if (delimiter === 'space') {
        result += ' ';
      }
      // 'none' means no delimiter (last sentence or special case)
    }
  }

  return result;
}

/**
 * Builds hierarchical tree structure from sentence nodes (SSOT → Tree)
 * Supports AI-generated hierarchies if present in sentences._hierarchyMeta
 * Otherwise creates a simple 2-level tree (Root → Sentences)
 * 
 * @param {Array} sentences - Array of sentence nodes
 * @returns {Object} Tree structure with root and children
 */
export function buildTreeFromSentences(sentences) {
  console.log(`${LOG_PREFIX.PARSER} Building tree from ${sentences.length} sentences...`);

  // Use the new hierarchy-aware builder
  return buildTreeWithHierarchy(sentences, buildTextFromSentences);
}

/**
 * Legacy wrapper for compatibility
 * Builds tree from text by first converting to sentences
 * @param {string} text - Full text (unused, kept for compatibility)
 * @returns {Object} Tree structure
 */
export function parseTextToHierarchy(text) {
  // This function is now a compatibility wrapper
  // The actual sentences are managed externally
  console.log(`${LOG_PREFIX.PARSER} parseTextToHierarchy called (compatibility mode)`);
  return {
    id: 'root',
    type: 'root',
    label: 'Document',
    content: text || '',
    children: [],
    startIdx: 0,
  };
}


/**
 * Flattens tree structure into nodes and edges for ReactFlow
 * @param {Object} tree - Hierarchical tree structure
 * @returns {{nodes: Array, edges: Array}} Flattened structure
 */
export function flattenTree(tree) {
  console.log(`${LOG_PREFIX.PARSER} Flattening tree...`);

  const nodes = [];
  const edges = [];
  const stack = [tree];

  while (stack.length) {
    const curr = stack.pop();

    nodes.push({
      id: curr.id,
      data: {
        label: curr.label,
        type: curr.type,
        startIdx: curr.startIdx,
        endIdx: curr.endIdx,
        content: curr.content,
        // Preserve emotion metadata
        emotion: curr.emotion,
        intensity: curr.intensity,
      },
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH },
      type: 'animatedNode',
    });

    for (const child of curr.children || []) {
      edges.push({
        id: `${curr.id}-${child.id}`,
        source: curr.id,
        target: child.id,
      });
      stack.push(child);
    }
  }

  console.log(`${LOG_PREFIX.PARSER} Flattened to ${nodes.length} nodes, ${edges.length} edges`);
  return { nodes, edges };
}

/**
 * Helper: counts total nodes in tree
 */
function countNodes(tree) {
  let count = 1;
  for (const child of tree.children || []) {
    count += countNodes(child);
  }
  return count;
}