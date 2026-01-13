/**
 * @fileoverview Node validation utilities
 * 
 * Comprehensive validation for Node objects:
 * - Type correctness
 * - Hierarchy consistency
 * - Emotion profile validity
 * - Metadata integrity
 */

import * as NodeTypes from '../types/node.js';
import { EMOTION_AXES } from '../types/node.js';

// ==================== SINGLE NODE VALIDATION ====================

/**
 * Validate complete node structure
 * Checks all aspects of a node
 * 
 * @param {NodeTypes.Node} node
 * @param {Map<string, NodeTypes.Node>} [nodeMap] - For hierarchy checks
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateNode(node, nodeMap = null) {
  const errors = [];
  const warnings = [];

  // Identity checks
  if (!node.id || typeof node.id !== 'string') {
    errors.push('Invalid or missing id');
  }

  if (!node.type || typeof node.type !== 'string') {
    errors.push('Invalid or missing type');
  } else if (
    ![
      'sentence',
      'heading',
      'list-item',
      'code-block',
      'blockquote',
      'horizontal-rule',
      'root',
      'group',
    ].includes(node.type)
  ) {
    errors.push(`Unknown node type: ${node.type}`);
  }

  if (typeof node.content !== 'string') {
    errors.push('Content must be a string');
  }

  if (node.content.length === 0) {
    warnings.push('Node content is empty');
  }

  // Hierarchy checks
  if (!node.hierarchy) {
    errors.push('Missing hierarchy info');
  } else {
    const hier = node.hierarchy;

    if (typeof hier.level !== 'number') {
      errors.push('Hierarchy level must be a number');
    } else if (hier.level < 0 || hier.level > 6) {
      errors.push(`Hierarchy level out of range: ${hier.level}`);
    }

    if (!['content', 'group', 'root'].includes(hier.role)) {
      errors.push(`Invalid hierarchy role: ${hier.role}`);
    }

    if (typeof hier.parentId !== 'string' && hier.parentId !== null) {
      errors.push('Parent ID must be string or null');
    }

    if (!Array.isArray(hier.childIds)) {
      errors.push('Child IDs must be an array');
    }

    // Validate parent-child relationship
    if (nodeMap) {
      if (hier.parentId) {
        const parent = nodeMap.get(hier.parentId);
        if (!parent) {
          errors.push(`Parent ${hier.parentId} does not exist in nodeMap`);
        } else if (!parent.hierarchy.childIds.includes(node.id)) {
          errors.push(`Parent does not list this node as a child`);
        }
      }

      for (const childId of hier.childIds) {
        const child = nodeMap.get(childId);
        if (!child) {
          errors.push(`Child ${childId} does not exist in nodeMap`);
        } else if (child.hierarchy.parentId !== node.id) {
          errors.push(`Child ${childId} does not point back to parent`);
        }
      }
    }
  }

  // Type-specific validation
  const typeValidation = validateNodeTypeConsistency(node);
  errors.push(...typeValidation.errors);
  warnings.push(...typeValidation.warnings);

  // Emotion validation
  if (node.emotion) {
    const emotionValidation = validateEmotionMetadata(node.emotion);
    errors.push(...emotionValidation.errors);
    warnings.push(...emotionValidation.warnings);
  }

  // Metadata validation
  if (!node.metadata) {
    errors.push('Missing metadata');
  } else {
    const metadataValidation = validateOperationalMetadata(node.metadata);
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);
  }

  // Text representation validation
  if (node.textRep) {
    const textRepValidation = validateTextRepresentation(node.textRep);
    errors.push(...textRepValidation.errors);
  }

  // Formatting validation
  if (node.formatting) {
    if (!Array.isArray(node.formatting)) {
      errors.push('Formatting must be an array');
    } else {
      node.formatting.forEach((elem, idx) => {
        const elemValidation = validateInlineElement(elem);
        errors.push(
          ...elemValidation.errors.map(e => `Formatting[${idx}]: ${e}`)
        );
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate node type matches structure
 * Different types require different structure fields
 * 
 * @param {NodeTypes.Node} node
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateNodeTypeConsistency(node) {
  const errors = [];
  const warnings = [];

  switch (node.type) {
    case 'heading': {
      if (!node.structure || !('level' in node.structure)) {
        errors.push('Heading node must have structure.level (1-6)');
      } else if (
        !Number.isInteger(node.structure.level) ||
        node.structure.level < 1 ||
        node.structure.level > 6
      ) {
        errors.push(
          `Heading level invalid: ${node.structure.level} (must be 1-6)`
        );
      }
      break;
    }

    case 'list-item': {
      if (!node.structure || !('type' in node.structure)) {
        errors.push('List-item must have structure.type');
      } else if (!['ordered', 'unordered', 'task'].includes(node.structure.type)) {
        errors.push(`Invalid list type: ${node.structure.type}`);
      }

      if (!node.structure || !('marker' in node.structure)) {
        errors.push('List-item must have structure.marker');
      }

      if (typeof node.structure?.indentLevel !== 'number') {
        errors.push('List-item must have numeric indentLevel');
      }

      if (
        node.structure?.type === 'task' &&
        typeof node.structure.taskChecked !== 'boolean'
      ) {
        errors.push('Task list-item must have taskChecked (boolean)');
      }
      break;
    }

    case 'code-block': {
      if (!node.structure || !('language' in node.structure)) {
        errors.push('Code-block must have structure.language');
      }

      if (typeof node.structure?.isFenced !== 'boolean') {
        errors.push('Code-block must have isFenced (boolean)');
      }
      break;
    }

    case 'blockquote': {
      if (!node.structure || !('depth' in node.structure)) {
        errors.push('Blockquote must have structure.depth');
      } else if (
        !Number.isInteger(node.structure.depth) ||
        node.structure.depth < 1
      ) {
        errors.push(`Invalid quote depth: ${node.structure.depth} (must be >= 1)`);
      }
      break;
    }

    case 'horizontal-rule': {
      if (node.structure && Object.keys(node.structure).length > 0) {
        warnings.push('Horizontal-rule should not have structure');
      }
      break;
    }

    case 'sentence': {
      if (node.structure && Object.keys(node.structure).length > 0) {
        warnings.push('Regular sentence should not have structure');
      }
      break;
    }

    case 'root': {
      if (node.hierarchy?.level !== 0) {
        errors.push('Root node must have hierarchy.level = 0');
      }
      if (node.hierarchy?.parentId) {
        errors.push('Root node must have parentId = null');
      }
      if (node.hierarchy?.role !== 'root') {
        errors.push('Root node must have role = root');
      }
      break;
    }

    case 'group': {
      if (node.hierarchy?.role !== 'group') {
        errors.push('Group node must have role = group');
      }
      if (typeof node.hierarchy?.level !== 'number' || node.hierarchy.level < 1) {
        errors.push('Group node must have level >= 1');
      }
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate emotion metadata
 * @param {NodeTypes.NodeEmotion} emotion
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateEmotionMetadata(emotion) {
  const errors = [];
  const warnings = [];

  if (!emotion.profile) {
    errors.push('Emotion must have profile');
  } else {
    const profileValidation = validateEmotionProfile(emotion.profile);
    errors.push(...profileValidation.errors);
    warnings.push(...profileValidation.warnings);
  }

  if (emotion.dominantEmotion) {
    if (!EMOTION_AXES.includes(emotion.dominantEmotion)) {
      errors.push(`Invalid dominant emotion: ${emotion.dominantEmotion}`);
    }
  }

  if (typeof emotion.dominantIntensity === 'number') {
    if (emotion.dominantIntensity < 0 || emotion.dominantIntensity > 100) {
      errors.push(`Dominant intensity out of range: ${emotion.dominantIntensity}`);
    }
  }

  if (
    emotion.source &&
    !['manual', 'ai', 'aggregated'].includes(emotion.source)
  ) {
    errors.push(`Invalid emotion source: ${emotion.source}`);
  }

  if (emotion.timestamp) {
    try {
      new Date(emotion.timestamp);
    } catch {
      errors.push(`Invalid ISO timestamp: ${emotion.timestamp}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate emotion profile (DES 10-axis)
 * @param {NodeTypes.EmotionProfile} profile
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateEmotionProfile(profile) {
  const errors = [];
  const warnings = [];

  if (!profile || typeof profile !== 'object') {
    errors.push('Profile must be an object');
    return { valid: false, errors, warnings };
  }

  for (const axis of EMOTION_AXES) {
    if (!(axis in profile)) {
      warnings.push(`Missing emotion axis: ${axis}`);
    } else if (typeof profile[axis] !== 'number') {
      errors.push(`${axis} must be a number, got ${typeof profile[axis]}`);
    } else if (profile[axis] < 0 || profile[axis] > 100) {
      errors.push(`${axis} out of range: ${profile[axis]} (must be 0-100)`);
    }
  }

  // Check for unexpected keys
  for (const key of Object.keys(profile)) {
    if (!EMOTION_AXES.includes(key)) {
      warnings.push(`Unknown emotion axis: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate operational metadata
 * @param {NodeTypes.OperationalMetadata} metadata
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateOperationalMetadata(metadata) {
  const errors = [];
  const warnings = [];

  if (typeof metadata.isDirty !== 'boolean') {
    errors.push('isDirty must be boolean');
  }

  if (!metadata.createdAt) {
    errors.push('Missing createdAt timestamp');
  } else {
    try {
      new Date(metadata.createdAt);
    } catch {
      errors.push(`Invalid createdAt timestamp: ${metadata.createdAt}`);
    }
  }

  if (metadata.modifiedAt) {
    try {
      new Date(metadata.modifiedAt);
    } catch {
      errors.push(`Invalid modifiedAt timestamp: ${metadata.modifiedAt}`);
    }
  }

  if (metadata.committedAt) {
    try {
      new Date(metadata.committedAt);
    } catch {
      errors.push(`Invalid committedAt timestamp: ${metadata.committedAt}`);
    }
  }

  if (
    metadata.modifiedBy &&
    !['user', 'ai', 'system'].includes(metadata.modifiedBy)
  ) {
    errors.push(`Invalid modifiedBy: ${metadata.modifiedBy}`);
  }

  if (typeof metadata.version !== 'number' || metadata.version < 1) {
    errors.push(`Invalid version: ${metadata.version}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate text representation
 * @param {NodeTypes.TextRepresentation} textRep
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateTextRepresentation(textRep) {
  const errors = [];

  if (textRep.punctuation) {
    if (!['.',  '!', '?'].includes(textRep.punctuation)) {
      errors.push(`Invalid punctuation: ${textRep.punctuation}`);
    }
  }

  if (
    !['none', 'space', 'newline', 'paragraph'].includes(textRep.delimiter)
  ) {
    errors.push(`Invalid delimiter: ${textRep.delimiter}`);
  }

  if (textRep.delimiterContent && typeof textRep.delimiterContent !== 'string') {
    errors.push('delimiterContent must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate inline element
 * @param {NodeTypes.InlineElement} elem
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateInlineElement(elem) {
  const errors = [];

  if (
    ![
      'link',
      'email',
      'bold',
      'italic',
      'code',
      'strikethrough',
      'image',
    ].includes(elem.type)
  ) {
    errors.push(`Invalid inline element type: ${elem.type}`);
  }

  if (typeof elem.start !== 'number' || elem.start < 0) {
    errors.push(`Invalid start position: ${elem.start}`);
  }

  if (typeof elem.end !== 'number' || elem.end < elem.start) {
    errors.push(`Invalid end position: ${elem.end}`);
  }

  if (elem.url && typeof elem.url !== 'string') {
    errors.push('URL must be a string');
  }

  return { valid: errors.length === 0, errors };
}

// ==================== TREE VALIDATION ====================

/**
 * Validate entire tree structure
 * 
 * @param {NodeTypes.Node[]} nodes
 * @returns {{valid: boolean, errors: Map<string, string[]>, warnings: Map<string, string[]>}}
 */
export function validateTree(nodes) {
  if (!Array.isArray(nodes)) {
    throw new Error('Nodes must be an array');
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const errorMap = new Map();
  const warningMap = new Map();

  // Check for exactly one root
  const roots = nodes.filter(n => n.hierarchy?.role === 'root');
  if (roots.length !== 1) {
    throw new Error(`Tree must have exactly 1 root, found ${roots.length}`);
  }

  // Validate each node
  for (const node of nodes) {
    const validation = validateNode(node, nodeMap);

    if (!validation.valid) {
      errorMap.set(node.id, validation.errors);
    }

    if (validation.warnings.length > 0) {
      warningMap.set(node.id, validation.warnings);
    }
  }

  // Check for orphaned nodes
  const root = roots[0];
  const visited = new Set();

  function markVisited(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node) {
      for (const childId of node.hierarchy.childIds) {
        markVisited(childId);
      }
    }
  }

  markVisited(root.id);

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      const errors = errorMap.get(node.id) || [];
      errors.push('Node is unreachable from root (orphaned)');
      errorMap.set(node.id, errors);
    }
  }

  return {
    valid: errorMap.size === 0,
    errors: errorMap,
    warnings: warningMap,
  };
}

// ==================== BATCH OPERATIONS ====================

/**
 * Validate ordering before applying
 * @param {NodeTypes.Node[]} nodes
 * @param {{nodeId: string, newIndex: number}[]} ordering
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateOrdering(nodes, ordering) {
  const errors = [];

  if (!Array.isArray(ordering)) {
    errors.push('Ordering must be an array');
    return { valid: false, errors };
  }

  // Check all node IDs exist
  const nodeIds = new Set(nodes.map(n => n.id));
  const orderingIds = new Set();

  for (const item of ordering) {
    if (!nodeIds.has(item.nodeId)) {
      errors.push(`Node ${item.nodeId} not found`);
    }
    if (orderingIds.has(item.nodeId)) {
      errors.push(`Duplicate node in ordering: ${item.nodeId}`);
    }
    orderingIds.add(item.nodeId);

    if (typeof item.newIndex !== 'number') {
      errors.push(`Invalid index type for ${item.nodeId}`);
    } else if (item.newIndex < 0 || item.newIndex >= nodes.length) {
      errors.push(`Index ${item.newIndex} out of range`);
    }
  }

  // Check all indices are unique
  const indices = new Set(ordering.map(o => o.newIndex));
  if (indices.size !== ordering.length) {
    errors.push('Duplicate indices in ordering');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate emotion changes before applying
 * @param {NodeTypes.Node[]} nodes
 * @param {{nodeId: string, emotions: NodeTypes.EmotionProfile}[]} changes
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEmotionChanges(nodes, changes) {
  const errors = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const change of changes) {
    if (!nodeIds.has(change.nodeId)) {
      errors.push(`Node ${change.nodeId} not found`);
    }

    const profileValidation = validateEmotionProfile(change.emotions);
    if (!profileValidation.valid) {
      errors.push(
        `${change.nodeId} emotions invalid: ${profileValidation.errors.join(', ')}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export default {
  // Single node
  validateNode,
  validateNodeTypeConsistency,
  validateEmotionMetadata,
  validateEmotionProfile,
  validateOperationalMetadata,
  validateTextRepresentation,
  validateInlineElement,

  // Tree
  validateTree,

  // Batch
  validateOrdering,
  validateEmotionChanges,
};