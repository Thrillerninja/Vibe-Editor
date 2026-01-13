/**
 * @fileoverview Helper functions for working with SentenceNode structure
 * 
 * @typedef {import('../types/node').Node} Node
 */

import { LOG_PREFIX } from './constants';
import { isContentNode, isGroupNode, isRootNode } from '../types/node';


/**
 * Gets nodes in Document order
 * @param {Map<string, Node>} nodeMap
 * @param {string} rootId
 */
export function getContentNodeIdsInDocumentOrder(nodeMap, rootId) {
  console.log(
    '[DEBUG getContentNodeIdsInDocumentOrder] Starting traversal from root:',
    rootId
  );

  const root = nodeMap.get(rootId);
  if (!root) {
    console.warn('[DEBUG getContentNodeIdsInDocumentOrder] Root not found');
    return [];
  }

  console.log(
    '[DEBUG getContentNodeIdsInDocumentOrder] Root children:',
    root.hierarchy.childIds
  );

  const out = [];
  const stack = [...(root.hierarchy.childIds || [])].reverse(); // keep order
  const visited = new Set();
  const unreachable = new Set(nodeMap.keys());

  while (stack.length) {
    const id = stack.pop();
    if (!id) {
      console.log(
        `[DEBUG getContentNodeIdsInDocumentOrder] Returning Early`
      );
      return;
    }
    
    if (visited.has(id)) continue;
    visited.add(id);
    unreachable.delete(id);

    const node = nodeMap.get(id);
    if (!node) {
      console.warn(`[WARNING] Node ${id} referenced but not found in nodeMap`);
      continue;
    }

    if (isContentNode(node)) {
      out.push(id);
    }

    if (isGroupNode(node) || isRootNode(node)) {
      const kids = node.hierarchy.childIds || [];
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push(kids[i]);
      }
    }
  }

  console.log(
    `[DEBUG getContentNodeIdsInDocumentOrder] Final order: ${out.length} content nodes`
  );

  // Check for unreachable content nodes
  const unreachableContent = Array.from(unreachable)
    .map(id => nodeMap.get(id))
    .filter(n => isContentNode(n));
  
  if (unreachableContent.length > 0) {
    console.error('[ERROR] Found unreachable content nodes:', unreachableContent.map(n => n.id));
    throw new Error(`Invariant violated: ${unreachableContent.length} content nodes unreachable from root`);
  }

  return out;
}

/**
 * Retrieves content nodes in document order.
 * @param {Map} nodeMap - A map of node IDs to node objects
 * @param {string|number} rootId - The ID of the root node to start traversal from
 * @returns {Array<Object>} An array of content node objects in document order, excluding any null or undefined values
 */
export function getContentNodesInDocumentOrder(nodeMap, rootId) {
  return getContentNodeIdsInDocumentOrder(nodeMap, rootId)
    .map((id) => nodeMap.get(id))
    .filter(Boolean);
}


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
    .filter((/** @type {{ type: string; }} */ el) => el.type === 'link')
    .map((/** @type {{ url: any; alt: any; start: any; end: any; }} */ el) => ({
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