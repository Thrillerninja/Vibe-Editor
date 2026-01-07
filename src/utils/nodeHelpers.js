/**
 * @fileoverview Helper functions for working with SentenceNode structure
 */

import { LOG_PREFIX } from './constants';

/**
 * Gets the display text for a node
 * @param {SentenceNode} node
 * @returns {string}
 */
export function getNodeDisplayText(node) {
  if (node.type === 'heading') {
    return `${'#'.repeat(node.structure?.headingLevel || 1)} ${node.content}`;
  }

  if (node.type === 'list-item') {
    const indent = '  '.repeat(node.structure?.listIndentLevel || 0);
    const marker = node.structure?.listMarker || '-';
    const taskBox = node.structure?.taskChecked !== undefined
      ? (node.structure.taskChecked ? '[x]' : '[ ]') + ' '
      : '';
    return `${indent}${marker} ${taskBox}${node.content}`;
  }

  if (node.type === 'blockquote') {
    const depth = node.structure?.quoteDepth || 1;
    return `${'> '.repeat(depth)}${node.content}`;
  }

  return node.content;
}

/**
 * Checks if a node type can have emotions
 * @param {SentenceNode} node
 * @returns {boolean}
 */
export function canHaveEmotion(node) {
  return ['sentence', 'heading', 'list-item', 'blockquote'].includes(node.type);
}

/**
 * Merges inline elements from old and new content
 * @param {SentenceNode} oldNode
 * @param {string} newContent
 * @param {InlineElement[]} newInlineElements
 * @returns {SentenceNode}
 */
export function mergeNodeContent(oldNode, newContent, newInlineElements) {
  return {
    ...oldNode,
    content: newContent,
    inlineElements: newInlineElements || oldNode.inlineElements,
  };
}

/**
 * Gets all inline links from a node
 * @param {SentenceNode} node
 * @returns {Array<{url: string, text: string}>}
 */
export function extractLinks(node) {
  if (!node.inlineElements) return [];

  return node.inlineElements
    .filter((el) => el.type === 'link')
    .map((el) => ({
      url: el.url,
      text: el.alt || node.content.substring(el.start, el.end),
    }));
}

/**
 * Validates a node structure
 * @param {SentenceNode} node
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateNode(node) {
  const errors = [];

  if (!node.id) errors.push('Missing id');
  if (!node.type) errors.push('Missing type');
  if (typeof node.content !== 'string') errors.push('Invalid content');

  if (node.type === 'heading' && !node.structure?.headingLevel) {
    errors.push('Heading missing headingLevel');
  }

  if (node.type === 'list-item' && !node.structure?.listMarker) {
    errors.push('List item missing listMarker');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}