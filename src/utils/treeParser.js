/**
 * Text parsing utilities
 * NEW APPROACH: Sentences are the single source of truth (SSOT)
 * - Sentences array is edited directly (see sentenceEditor.js)
 * - Build text from sentence nodes
 * - Build tree from sentence nodes up to root
 * - Support AI-generated hierarchies (see hierarchyIntegration.js)
 */

import { LOGGING_ENABLED, LOG_PREFIX, NODE_WIDTH, DEBUG } from './constants';
import { buildTreeWithHierarchy } from './hierarchyIntegration';
import { getLastNonMarkdownChar } from './sentenceEditor';

/**
 * Builds text from sentence nodes (SSOT → Text)
 * Reconstructs text using each sentence's trailing delimiter
 * Adds punctuation if missing (e.g., after reordering)
 * 
 * @param {Array} sentences - Array of sentence nodes (order is implicit from array position)
 * @returns {string} Reconstructed text
 */
export function buildTextFromSentences(sentences) {
  if (!sentences || sentences.length === 0) {
    return '';
  }

  let result = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const isLast = i === sentences.length - 1;

    // Add sentence content
    result += sentence.content;

    // Add trailing punctuation only if explicitly set (e.g., from reordering)
    // Don't add punctuation while user is typing
    // Use getLastNonMarkdownChar to check for punctuation ignoring markdown tags
    const lastChar = getLastNonMarkdownChar(sentence.content);
    if (!lastChar || !'.!?'.includes(lastChar)) {
      if (sentence.punctuation) {
        result += sentence.punctuation;
      }
    }

    // Add trailing delimiter from delimiterContent (preserves user's exact formatting)
    if (sentence.delimiterContent) {
      if (DEBUG.BUILD) {
        console.log(`${LOG_PREFIX.PARSER} [BUILD] Sentence ${i}: adding delimiterContent`, {
          length: sentence.delimiterContent.length,
          preview: JSON.stringify(sentence.delimiterContent)
        });
      }
      result += sentence.delimiterContent;
    }
  }

  if (DEBUG.BUILD) {
    console.log(`${LOG_PREFIX.PARSER} [BUILD] Final text length: ${result.length}, newline count: ${(result.match(/\n/g) || []).length}`);
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
        content: curr.content,
        // Preserve emotion metadata
        emotion: curr.emotion,
        emotions: curr.emotions,
        intensity: curr.intensity,
        // Preserve dirty flag for visual indicator
        isDirty: curr.isDirty,
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