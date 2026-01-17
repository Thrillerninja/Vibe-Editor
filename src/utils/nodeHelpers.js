/**
 * @fileoverview Helper functions for working with Node structure
 * 
 * @typedef {import('../types/node').Node} Node
 * @typedef {import('../types/node').InlineElement} InlineElement
 * @typedef {import('../types/node').HeadingStructure} HeadingStructure
 * @typedef {import('../types/node').ListItemStructure} ListItemStructure
 * @typedef {import('../types/node').BlockquoteStructure} BlockquoteStructure
 */

import { LOG_PREFIX } from './constants';
import { cloneNode, isContentNode, isGroupNode, isRootNode } from '../types/node';


/**
 * Gets nodes in Document order
 * @param {Map<string, Node>} nodeMap
 * @param {string} rootId
 * @returns {string[]} out
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
      return [];
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
 * @param {Map<string, Node>} nodeMap - A map of node IDs to node objects
 * @param {string} rootId - The ID of the root node to start traversal from
 * @returns {Array<Node|undefined>} An array of content node objects in document order, excluding any null or undefined values
 */
export function getContentNodesInDocumentOrder(nodeMap, rootId) {
  return getContentNodeIdsInDocumentOrder(nodeMap, rootId)
    .map((id) => nodeMap.get(id))
    .filter(Boolean);
}


/**
 * Gets the display text for a node
 * @param {Node} node
 * @returns {string}
 */
export function getNodeDisplayText(node) {
  if (node.type === 'heading') {
    const structure = /** @type {HeadingStructure} */ (node.structure);
    return `${'#'.repeat(structure.level || 1)} ${node.content}`;
  }

  if (node.type === 'list-item') {
    const structure = /** @type {ListItemStructure} */ (node.structure);
    const indent = '  '.repeat(structure.indentLevel || 0);
    const marker = structure.marker || '-';
    const taskBox = structure.taskChecked !== undefined
      ? (structure.taskChecked ? '[x]' : '[ ]') + ' '
      : '';
    return `${indent}${marker} ${taskBox}${node.content}`;
  }

  if (node.type === 'blockquote') {
    const structure = /** @type {BlockquoteStructure} */ (node.structure);
    const depth = structure.depth || 1;
    return `${'> '.repeat(depth)}${node.content}`;
  }

  return node.content;
}

/**
 * Checks if a node type can have emotions
 * @param {Node} node
 * @returns {boolean}
 */
export function canHaveEmotion(node) {
  return ['sentence', 'heading', 'list-item', 'blockquote'].includes(node.type);
}

/**
 * Merges inline elements from old and new content
 * @param {Node} oldNode
 * @param {string} newContent
 * @param {InlineElement[]} newFormattingElements
 * @returns {Node}
 */
export function mergeNodeContent(oldNode, newContent, newFormattingElements) {
  return {
    ...oldNode,
    content: newContent,
    formatting: newFormattingElements || oldNode.formatting,
  };
}

/**
 * Gets all inline links from a node
 * @param {Node} node
 * @returns {Array<{url: string | undefined, text: string}>}
 */
export function extractLinks(node) {
  if (!node.formatting) return [];

  return node.formatting
    .filter((/** @type {{ type: string; }} */ el) => el.type === 'link')
    .map( (el) => ({
      url: el.url,
      text: el.alt || node.content.substring(el.start, el.end),
    }));
}

/**
 * Validates a node structure
 * @param {Node} node
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateNode(node) {
  const errors = [];

  if (!node.id) errors.push('Missing id');
  if (!node.type) errors.push('Missing type');
  if (typeof node.content !== 'string') errors.push('Invalid content');

  if (node.type === 'heading' && !(/** @type {HeadingStructure} */ (node.structure))?.level) {
    errors.push('Heading missing level');
  }

  if (node.type === 'list-item' && !(/** @type {ListItemStructure} */ (node.structure))?.marker) {
    errors.push('List item missing marker');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper: Normalize list item marker based on its position in the new parent's children
 * Updates structure.marker if the node is a list item
 * 
 * @param {Node} node - The node being moved
 * @param {Node} newParent - The new parent node
 * @param {Map<string, Node>} nodeMap - For context
 * @returns {Node} Updated node with normalized marker
 */
export function normalizeListItemMarker(node, newParent, nodeMap) {
  // Only normalize list items
  if (node.type !== 'list-item' || !node.structure) {
    return node;
  }

  const patchedNode = cloneNode(node);
  const structure = /** @type {ListItemStructure} */ (patchedNode.structure);
  const newParentChildren = newParent.hierarchy.childIds || [];
  const positionInParent = newParentChildren.indexOf(node.id);

  // Determine new marker based on list type
  if (structure.type === 'ordered') {
    // For ordered lists, use position + 1
    structure.marker = `${positionInParent + 1}.`;
  } else if (structure.type === 'unordered') {
    // Keep the marker from sibling context or default to '-'
    const siblingMarker = newParentChildren
      .slice(0, positionInParent)
      .reverse()
      .find(siblingId => {
        const sibling = nodeMap.get(siblingId);
        return sibling?.type === 'list-item' && (/** @type {ListItemStructure} */ (sibling.structure))?.marker;
      });

    if (siblingMarker) {
      const sibling = nodeMap.get(siblingMarker);
      const siblingStructure = /** @type {ListItemStructure} */ (sibling.structure);
      structure.marker = siblingStructure.marker || '-';
    } else {
      structure.marker = '-';
    }
  } else if (structure.type === 'task') {
    // Keep task format but sync with siblings
    structure.marker = '- ';
  }

  return patchedNode;
}