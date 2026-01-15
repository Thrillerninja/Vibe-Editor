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
 * @typedef {import('../types/node.js').TreeNode} TreeNode
 * @typedef {import('../types/node.js').ReactFlowNode} ReactFlowNode
 * @typedef {import('../types/node.js').ReactFlowEdge} ReactFlowEdge
 */

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
 * @param {SentenceNode[]} sentences - Array with _hierarchyMeta
 * @returns {TreeNode} Root node of tree
 */
export function buildTreeFromSentences(sentences) {
  console.log(`${LOG_PREFIX.PARSER} Building tree from ${sentences.length} sentences...`);

  // Use the new hierarchy-aware builder
  return buildTreeWithHierarchy(sentences, buildTextFromSentences);
}