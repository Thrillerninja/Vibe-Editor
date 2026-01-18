/**
 * @fileoverview Convert Node objects back to markdown
 * 
 * Reconstructs full markdown including all structure metadata.
 * This is the inverse of parseTextToContentUnits.
 * 
 * @typedef {import('../types/node.js').HeadingStructure} HeadingStructure
 * @typedef {import('../types/node.js').ListItemStructure} ListItemStructure
 * @typedef {import('../types/node.js').BlockquoteStructure} BlockquoteStructure
 * @typedef {import('../types/node.js').CodeBlockStructure} CodeBlockStructure
 * 
 * 
 */
import * as NodeTypes from '../types/node.js';
import { isContentNode } from '../types/node.js';
import { getContentNodesInDocumentOrder } from './nodeHelpers.js';

/**
 * Rebuild full markdown string from a content node
 * Includes all structure metadata (lists, headings, quotes, etc.)
 * 
 * @param {NodeTypes.Node} node - Content node
 * @returns {string} Markdown representation
 */
export function nodeToMarkdown(node) {
  if (!isContentNode(node)) {
    return node.content || '';
  }

  let markdown = node.content;

  // Apply structure-specific formatting
  if (node.structure) {
    switch (node.type) {
      case 'heading': {
        const hashes = '#'.repeat(/** @type {HeadingStructure} */ (node.structure).level || 1);
        markdown = `${hashes} ${markdown}`;
        break;
      }

      case 'list-item': {
        const indent = '  '.repeat(/** @type {ListItemStructure} */ (node.structure).indentLevel || 0);
        const marker = /** @type {ListItemStructure} */ (node.structure).marker || '- ';

        if (/** @type {ListItemStructure} */ (node.structure).type === 'task') {
          const checked = /** @type {ListItemStructure} */ (node.structure).taskChecked ? 'x' : ' ';
          markdown = `${indent}- [${checked}] ${markdown}`;
        } else {
          markdown = `${indent}${marker} ${markdown}`;
        }
        break;
      }

      case 'blockquote': {
        const depth = /** @type {BlockquoteStructure} */ (node.structure).depth || 1;
        const prefix = '> '.repeat(depth);
        markdown = markdown
          .split('\n')
          .map(line => line.trim() === '' ? line : `${prefix}${line}`)  // ← Skip empty lines
          .join('\n');
        break;
      }

      case 'code-block': {
        const fence = '```';
        const lang = /** @type {CodeBlockStructure} */ (node.structure).language || '';
        markdown = `${fence}${lang}\n${markdown}\n${fence}`;
        break;
      }
    }
  }

  return markdown;
}

/**
 * Rebuild full markdown text from nodeMap
 * Preserves all structure and formatting
 * 
 * @param {Map<string, NodeTypes.Node>} nodeMap
 * @param {string} rootId
 * @returns {string} Complete markdown document
 */
export function nodeMapToMarkdown(nodeMap, rootId) {
  
  const contentNodes = getContentNodesInDocumentOrder(nodeMap, rootId);
  if (!contentNodes || contentNodes.length === 0) {
    return '';
  }

  // Combine consecutive blockquotes at same depth
  const mergedNodes = [];
  for (const node of contentNodes) {
    const lastNode = mergedNodes[mergedNodes.length - 1];
    
    if (
      node.type === 'blockquote' &&
      lastNode &&
      lastNode.type === 'blockquote' &&
      node.structure?.depth === lastNode.structure?.depth &&
      (lastNode.textRep?.delimiter === 'space' || lastNode.textRep?.delimiterContent === ' ')
    ) {
      // Merge: add space then content
      lastNode.content += ' ' + node.content;
      // Keep the current node's textRep (so newlines are preserved)
      lastNode.textRep = node.textRep;
    } else {
      mergedNodes.push({ ...node });
    }
  }

  return mergedNodes
    .map((node, idx) => {
      const markdown = nodeToMarkdown(node);

      // Add delimiter after each node
      const isLastNode = idx === contentNodes.length - 1;
      const textRep = node.textRep || {
        delimiter: isLastNode ? 'none' : 'newline',
        delimiterContent: isLastNode ? '' : '\n',
      };
      let delimiter = '';

      if (!isLastNode) {
        if (textRep.delimiterContent) {
          delimiter = textRep.delimiterContent;
        } else if (textRep.delimiter === 'paragraph') {
          delimiter = '\n\n';
        } else if (textRep.delimiter === 'newline') {
          delimiter = '\n';
        } else if (textRep.delimiter === 'space') {
          delimiter = ' ';
        } else if (textRep.delimiterContent) {
          delimiter = textRep.delimiterContent;
        } else {
          delimiter = ' '; // default spacing
        }
      }

      return markdown + delimiter;
    })
    .join('')
    .trim();
}

export default {
  nodeToMarkdown,
  nodeMapToMarkdown,
};