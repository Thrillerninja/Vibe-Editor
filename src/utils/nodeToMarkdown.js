/**
 * @fileoverview Convert Node objects back to markdown
 * 
 * Reconstructs full markdown including all structure metadata.
 * This is the inverse of parseTextToContentUnits.
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
        const hashes = '#'.repeat(node.structure.level || 1);
        markdown = `${hashes} ${markdown}`;
        break;
      }

      case 'list-item': {
        const indent = '  '.repeat(node.structure.indentLevel || 0);
        const marker = node.structure.marker || '- ';

        if (node.structure.type === 'task') {
          const checked = node.structure.taskChecked ? 'x' : ' ';
          markdown = `${indent}- [${checked}] ${markdown}`;
        } else {
          markdown = `${indent}${marker} ${markdown}`;
        }
        break;
      }

      case 'blockquote': {
        const depth = node.structure.depth || 1;
        const prefix = '> '.repeat(depth);
        markdown = markdown
          .split('\n')
          .map(line => `${prefix}${line}`)
          .join('\n');
        break;
      }

      case 'code-block': {
        const fence = '```';
        const lang = node.structure.language || '';
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

  return contentNodes
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