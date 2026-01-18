/**
 * @fileoverview Sentence/Node Editor Utilities
 * 
 * UPDATED: Now creates Node objects instead of old SentenceNode format
 * 
 * Key changes:
 * - parseIntoSentences() now returns Node objects
 * - Embeds hierarchy info in each node
 * - Creates root node automatically
 */

import { v4 as uuidv4 } from 'uuid';
import * as NodeTypes from '../types/node.js';
import { LOG_PREFIX } from './constants.js';

// ==================== TEXT → NODES ====================

/**
 * Parse text into Node objects
 * Creates a complete tree with root + content nodes
 * 
 * @param {string} text - Full document text
 * @param {number} maxDepth - maxDepth of the node tree
 * @param {string} [rootId] - Use existing root ID or create new
 * @returns {{root: NodeTypes.Node, nodes: NodeTypes.Node[]}}
 * 
 * STRATEGY:
 * 1. Parse text into content
 * 2. Create Node objects for each sentence
 * 3. Create root node
 * 4. Return both root and flat array
 */
export function parseTextToNodes(text, maxDepth, rootId = null) {
  if (!text || text.trim() === '') {
    const root = NodeTypes.createRootNode(rootId || uuidv4(), 'Untitled Document', []);
    return { root, nodes: [root] };
  }

  const sentenceData = parseIntoSentences(text);
  const rootNodeId = rootId || uuidv4();
  const childIds = [];

  const nodes = sentenceData.map(data => {
    const nodeId = uuidv4();
    childIds.push(nodeId);

    // Create correct node type based on structure
    let options = {
      textRep: {
        punctuation: data.punctuation,
        delimiter: data.delimiter,
        delimiterContent: data.delimiterContent,
      },
    };

    if (data.structure) {
      options.structure = data.structure;
    }

    return NodeTypes.createContentNode(
      nodeId,
      data.type,  // ← Now uses the parsed type!
      data.content,
      rootNodeId,
      maxDepth,
      options
    );
  });

  const root = NodeTypes.createRootNode(rootNodeId, 'Untitled Document', childIds);
  return { root, nodes: [root, ...nodes] };
}

/**
 * Apply text edit and regenerate nodes
 * 
 * @param {NodeTypes.Node[]} existingNodes - Current nodes
 * @param {string} newText - New full text
 * @param {string} rootId - Root node ID
 * @param {number} maxDepth - maxDepth of the node tree
 * @returns {NodeTypes.Node[]} - Updated nodes
 * 
 * STRATEGY:
 * 1. Parse new text into sentences
 * 2. Try to match with existing nodes by content
 * 3. Preserve IDs and metadata for matching nodes
 * 4. Create new nodes for new sentences
 * 5. Mark changed nodes as dirty
 */
export function applySentenceEdit(existingNodes, newText, rootId, maxDepth) {
  console.log(`${LOG_PREFIX.PARSER} Applying edit at cursor position`);

  // Handle empty text
  if (!newText || newText.trim() === '') {
    const root = existingNodes.find(n => n.id === rootId);
    if (root) {
      return [NodeTypes.setNodeLevel(root, 0)];
    }
    return [NodeTypes.createRootNode(rootId, 'Untitled Document', [])];
  }

  // Parse new text
  const sentenceData = parseIntoSentences(newText);

  // Get existing content nodes (not root)
  const existingContent = existingNodes.filter(
    n => n.id !== rootId && n.hierarchy.role === 'content'
  );

  const usedIds = new Set();
  const childIds = [];
  const updatedNodes = [];

  // Try to match with existing nodes
  for (const data of sentenceData) {
    let node;
    const existingMatch = findMatchingNode(existingContent, data.content, usedIds);

    if (existingMatch) {
      // Reuse existing node with updated content
      usedIds.add(existingMatch.id);
      node = {
        ...existingMatch,
        content: data.content,
        textRep: {
          punctuation: data.punctuation,
          delimiter: data.delimiter,
          delimiterContent: data.delimiterContent,
        },
        metadata: {
          ...existingMatch.metadata,
          modifiedAt: new Date().toISOString(),
          modifiedBy: 'user',
          version: (existingMatch.metadata?.version || 0) + 1,
          isDirty: true,
        },
      };
      console.log(`${LOG_PREFIX.PARSER} Reusing node ${existingMatch.id.substring(0, 8)}`);
    } else {
      // Create new node
      node = NodeTypes.createContentNode(
        uuidv4(),
        'sentence',
        data.content,
        rootId,
        maxDepth,
        {
          textRep: {
            punctuation: data.punctuation,
            delimiter: data.delimiter,
            delimiterContent: data.delimiterContent,
          },
        }
      );
      console.log(`${LOG_PREFIX.PARSER} Created new node for: "${data.content.substring(0, 40)}..."`);
    }

    childIds.push(node.id);
    updatedNodes.push(node);
  }

  // Update root with new children
  const root = existingNodes.find(n => n.id === rootId);
  if (!root) {
    throw new Error(`Root node ${rootId} not found`);
  }

  const updatedRoot = {
    ...root,
    hierarchy: {
      ...root.hierarchy,
      childIds,
    },
  };

  console.log(`${LOG_PREFIX.PARSER} Updated from ${existingContent.length} to ${updatedNodes.length} sentences`);

  return [updatedRoot, ...updatedNodes];
}

// ==================== TEXT PARSING ====================

/**
 * Parse text into sentence data objects
 * Returns content, punctuation, and delimiter info
 * 
 * @param {string} text
 * @returns {{content: string, punctuation?: string, delimiter: string, delimiterContent: string}[]}
 * 
 * Separators (priority):
 * 1. Sentence punctuation (.!?) + whitespace/newlines
 * 2. Double newlines (paragraph breaks)
 * 3. Single newlines
 */

function parseIntoSentences(text) {
  const sentences = [];
  const lines = text.split('\n');
  let currentIndex = 0;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines
    if (line.trim() === '') {
      currentIndex += line.length + 1; // +1 for newline
      i++;
      continue;
    }

    // ============ CODE BLOCK ============
    const codeMatch = line.match(/^```(\w*)?/);
    if (codeMatch) {
      const language = codeMatch[1] || '';
      const codeLines = [line.replace(/^```\w*/, '').trim()];
      currentIndex += line.length + 1;
      i++;
      
      // Collect until closing fence
      while (i < lines.length && !lines[i].match(/^```/)) {
        codeLines.push(lines[i]);
        currentIndex += lines[i].length + 1;
        i++;
      }
      
      if (i < lines.length) {
        currentIndex += lines[i].length + 1; // closing fence
        i++;
      }
      
      const content = codeLines.join('\n').trim();
      sentences.push({
        type: 'code-block',
        content,
        structure: { language, isFenced: true },
        delimiter: 'paragraph',
        delimiterContent: '\n\n',
      });
      continue;
    }

    // ============ BLOCKQUOTE ============
    const blockquoteMatch = line.match(/^(>+)\s+(.*)/);
    if (blockquoteMatch) {
      const depth = blockquoteMatch[1].length;
      let quoteContent = blockquoteMatch[2];
      currentIndex += line.length + 1;
      i++;
      
      // Collect continuation lines at same depth
      while (i < lines.length) {
        const nextLine = lines[i];
        if (!nextLine.trim()) {
          i++;
          currentIndex += nextLine.length + 1;
          break; // End quote at blank line
        }
        
        const nextMatch = nextLine.match(/^(>+)\s+(.*)/);
        if (!nextMatch || nextMatch[1].length !== depth) {
          break; // Different depth
        }
        
        quoteContent += '\n' + nextMatch[2];
        currentIndex += nextLine.length + 1;
        i++;
      }
      
      sentences.push({
        type: 'blockquote',
        content: quoteContent.trim(),
        structure: { depth, type: 'blockquote' },
        delimiter: 'paragraph',
        delimiterContent: '\n\n',
      });
      continue;
    }

    // ============ HEADING ============
    const headingMatch = line.match(/^(#+)\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      currentIndex += line.length + 1;
      i++;
      
      sentences.push({
        type: 'heading',
        content,
        structure: { level, type: 'heading' },
        delimiter: 'newline',
        delimiterContent: '\n',
      });
      continue;
    }

    // ============ LIST ITEM ============
    const listMatch = line.match(/^(\s*)(?:[-*+]|\d+\.|\[[ x]\])\s+(.*)/);
    if (listMatch) {
      const indentLevel = Math.floor(listMatch[1].length / 2);
      const content = listMatch[2].trim();
      const markerMatch = line.match(/^(\s*)([-*+]|\d+\.|\[[ x]\])/);
      const marker = markerMatch ? markerMatch[2] : '-';
      const isTask = marker.startsWith('[');
      const taskChecked = isTask && marker === '[x]';
      
      currentIndex += line.length + 1;
      i++;
      
      sentences.push({
        type: 'list-item',
        content,
        structure: {
          type: isTask ? 'task' : (marker.match(/\d+/) ? 'ordered' : 'unordered'),
          marker,
          indentLevel,
          taskChecked,
        },
        delimiter: 'newline',
        delimiterContent: '\n',
      });
      continue;
    }

    // ============ REGULAR SENTENCE ============
    // Split on punctuation for regular text
    let sentenceText = line.trim();
    currentIndex += line.length + 1;
    i++;
    
    if (sentenceText) {
      sentences.push({
        type: 'sentence',
        content: sentenceText,
        structure: undefined,
        delimiter: i < lines.length ? 'newline' : 'none',
        delimiterContent: i < lines.length ? '\n' : '',
      });
    }
  }

  console.log(`${LOG_PREFIX.PARSER} Parsed ${sentences.length} structured items`);
  return sentences;
}

/**
 * Find matching node by content similarity
 * Preserves node IDs across edits
 * 
 * @param {NodeTypes.Node[]} existingNodes
 * @param {string} content
 * @param {Set<string>} usedIds
 * @returns {NodeTypes.Node | null}
 */
function findMatchingNode(existingNodes, content, usedIds) {
  // Exact match first
  for (const node of existingNodes) {
    if (node.content === content && !usedIds.has(node.id)) {
      return node;
    }
  }

  // Fuzzy match (80% similarity)
  for (const node of existingNodes) {
    if (usedIds.has(node.id)) continue;

    const similarity = calculateSimilarity(node.content, content);
    if (similarity > 0.8) {
      return node;
    }
  }

  return null;
}

/**
 * Calculate string similarity (Levenshtein distance)
 * @param {string} str1
 * @param {string} str2
 * @returns {number} 0-1
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(str1, str2);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance calculation
 * @param {string} str1
 * @param {string} str2
 * @returns {number}
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// ==================== NODE → TEXT ====================

/**
 * Rebuild text from nodes
 * Reconstructs from content + punctuation + delimiter
 * 
 * @param {NodeTypes.Node[]} nodes
 * @param {string} rootId
 * @returns {string}
 */
export function buildTextFromNodes(nodes, rootId) {
  const root = nodes.find(n => n.id === rootId);
  if (!root) return '';

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const text = [];

  // Traverse root's children in order
  for (const childId of root.hierarchy.childIds) {
    const node = nodeMap.get(childId);
    if (!node) continue;

    text.push(node.content);

    // Add punctuation if present
    if (node.textRep?.punctuation) {
      text.push(node.textRep.punctuation);
    }

    // Add delimiter if present
    if (node.textRep?.delimiterContent) {
      text.push(node.textRep.delimiterContent);
    } else if (node.textRep?.delimiter && node.textRep.delimiter !== 'none') {
      // Reconstruct delimiter
      switch (node.textRep.delimiter) {
        case 'paragraph':
          text.push('\n\n');
          break;
        case 'newline':
          text.push('\n');
          break;
        case 'space':
          text.push(' ');
          break;
      }
    }
  }

  return text.join('');
}

// ==================== EDITING NODES ====================

/**
 * Edit a single node's content
 * @param {NodeTypes.Node[]} nodes
 * @param {string} nodeId
 * @param {string} newContent
 * @returns {NodeTypes.Node[]}
 */
export function editNode(nodes, nodeId, newContent) {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return NodeTypes.updateNodeContent(node, newContent);
    }
    return node;
  });
}

/**
 * Reorder content nodes (change order of children under root)
 * @param {NodeTypes.Node[]} nodes
 * @param {string} rootId
 * @param {string} nodeId - Node to move
 * @param {number} newIndex - New position among siblings
 * @returns {NodeTypes.Node[]}
 */
export function reorderNode(nodes, rootId, nodeId, newIndex) {
  const root = nodes.find(n => n.id === rootId);
  if (!root) throw new Error(`Root ${rootId} not found`);

  const currentIndex = root.hierarchy.childIds.indexOf(nodeId);
  if (currentIndex === -1) throw new Error(`Node ${nodeId} not in root's children`);
  if (newIndex < 0 || newIndex >= root.hierarchy.childIds.length) {
    throw new Error(`Invalid index ${newIndex}`);
  }

  const newChildIds = [...root.hierarchy.childIds];
  newChildIds.splice(currentIndex, 1);
  newChildIds.splice(newIndex, 0, nodeId);

  const updatedRoot = {
    ...root,
    hierarchy: {
      ...root.hierarchy,
      childIds: newChildIds,
    },
  };

  return nodes.map(n => (n.id === rootId ? updatedRoot : n));
}

export default {
  parseTextToNodes,
  applySentenceEdit,
  buildTextFromNodes,
  editNode,
  reorderNode,
};