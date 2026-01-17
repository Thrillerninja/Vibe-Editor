/**
 * @fileoverview Unified Node Type System
 * 
 * This is the new foundation for all document content.
 * Everything about a node is self-contained here.
 * 
 * MIGRATION STRATEGY:
 * - New code uses Node type
 * - Old code can coexist (no breaking changes)
 * - Gradually migrate files one at a time
 * - Use nodeMigration.js to convert as needed
 */

import { EMOTION_AXES } from "@utils/constants";

// ==================== EMOTION PROFILE ====================

/**
 * 10-axis Differential Emotions Scale (Izard 1997)
 * Each emotion is 0-100 intensity
 * 
 * @typedef {Object} EmotionProfile
 * @property {number} [interest] - Curiosity, excitement (0-100)
 * @property {number} [joy] - Happiness, delight (0-100)
 * @property {number} [surprise] - Amazement (0-100)
 * @property {number} [sadness] - Distress, sorrow (0-100)
 * @property {number} [anger] - Hostility, rage (0-100)
 * @property {number} [disgust] - Revulsion (0-100)
 * @property {number} [contempt] - Scorn, disdain (0-100)
 * @property {number} [fear] - Anxiety, terror (0-100)
 * @property {number} [shame] - Embarrassment (0-100)
 * @property {number} [guilt] - Remorse, regret (0-100)
 */

/**
 * Create empty emotion profile (all zeros)
 * @returns {EmotionProfile}
 */
export function createEmptyEmotionProfile() {
  const profile = {};
  EMOTION_AXES.forEach(axis => {
    profile[axis] = 0;
  });
  return profile;
}

// ==================== HIERARCHY INFORMATION ====================

/**
 * Hierarchy positioning - embedded in every node
 * Allows nodes to be self-contained and traversable
 * 
 * @typedef {Object} HierarchyInfo
 * @property {number} level - Depth:
 *   - 0 = root node (single, for entire document)
 *   - 1+ = content nodes (sentences, headings, lists, code blocks)
 *   - n-1 = grouping nodes (chapters, sections created by AI)
 * @property {string | null} parentId - Parent node ID (null only for root)
 * @property {string[]} childIds - IDs of immediate children (empty if leaf)
 */

/**
 * HierarchyState
 * @typedef {'none' | 'generated' | 'needs-full-regen' | 'has-dirty-nodes'} HierarchyState
 */

// ==================== TEXT REPRESENTATION ====================

/**
 * How this node appears in the text stream
 * Only relevant for text reconstruction
 * Separate from semantic content
 * 
 * @typedef {Object} TextRepresentation
 * @property {'.'|'!'|'?'} [punctuation] - Sentence ending (if present)
 * @property {'none'|'space'|'newline'|'paragraph'} delimiter - What follows
 * @property {string} [delimiterContent] - Exact whitespace (preserves user formatting)
 */

// ==================== STRUCTURE ====================

/**
 * Heading structure
 * @typedef {Object} HeadingStructure
 * @property {1|2|3|4|5|6} level
 */

/**
 * List item structure
 * @typedef {Object} ListItemStructure
 * @property {'ordered'|'unordered'|'task'} type
 * @property {string} marker - "1.", "-", "* [ ]", etc.
 * @property {number} indentLevel - Nesting depth (0, 1, 2, ...)
 * @property {boolean} [taskChecked] - Only for task lists
 */

/**
 * Code block structure
 * @typedef {Object} CodeBlockStructure
 * @property {string} language - Language identifier
 * @property {boolean} isFenced - ``` vs indented
 */

/**
 * Blockquote structure
 * @typedef {Object} BlockquoteStructure
 * @property {number} depth - Number of '>' levels
 */

/**
 * Semantic structure (differs by node type)
 * @typedef {HeadingStructure | ListItemStructure | CodeBlockStructure | BlockquoteStructure | undefined} SemanticStructure
 */

// ==================== INLINE FORMATTING ====================

/**
 * Inline element (link, bold, italic, etc.)
 * @typedef {Object} InlineElement
 * @property {'link'|'email'|'bold'|'italic'|'code'|'strikethrough'|'image'} type
 * @property {number} start - Character offset in content
 * @property {number} end - Character offset in content
 * @property {string} [url] - For links/images
 * @property {string} [alt] - For images/alt text
 * @property {string} [title] - For links/images
 * @property {string} [email] - For email type
 */

// ==================== EMOTIONAL METADATA ====================

/**
 * Emotional profile of a node
 * @typedef {Object} NodeEmotion
 * @property {EmotionProfile} profile - DES 10-axis profile
 * @property {string} [dominantEmotion] - Computed dominant emotion name
 * @property {number} [dominantIntensity] - Intensity of dominant (0-100)
 * @property {'manual'|'ai'|'aggregated'} [source] - How it was assigned
 * @property {string} [timestamp] - ISO timestamp when set
 */

// ==================== OPERATIONAL METADATA ====================

/**
 * Operational tracking and management
 * @typedef {Object} OperationalMetadata
 * @property {boolean} isDirty - Needs AI regeneration
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} [modifiedAt] - ISO timestamp of last modification
 * @property {'user'|'ai'|'system'} [modifiedBy] - What modified it
 * @property {string} [committedAt] - ISO timestamp of last commit
 * @property {number} version - Version number (incremented on changes)
 */

// ==================== COMPLETE UNIFIED NODE ====================

/**
 * UNIFIED NODE TYPE
 * 
 * Everything about a content unit in one place:
 * - Identity: who is this?
 * - Hierarchy: where is it?
 * - Structure: what kind is it?
 * - Formatting: how does it look?
 * - Emotion: what tone?
 * - Metadata: what's its status?
 * 
 * @typedef {Object} Node
 * @property {string} id - UUID, globally unique, never changes
 * @property {'sentence'|'heading'|'list-item'|'code-block'|'blockquote'|'horizontal-rule'|'root'|'group'} type
 * @property {string} content - The actual text/content
 * @property {HierarchyInfo} hierarchy - Position in document tree
 * @property {SemanticStructure} [structure] - Type-specific structure
 * @property {InlineElement[]} [formatting] - Links, bold, italic, etc.
 * @property {TextRepresentation} [textRep] - How it appears in text
 * @property {NodeEmotion} [emotion] - Emotional metadata
 * @property {OperationalMetadata} metadata - Status and tracking
 */

/**
 * @typedef {Map<string, Node>} NodeMap
 */

// ==================== NODE CREATION ====================

/**
 * Create a content node (sentence, heading, list item, etc.)
 * 
 * @param {string} id - UUID
 * @param {'sentence'|'heading'|'list-item'|'code-block'|'blockquote'|'horizontal-rule'} type
 * @param {string} content - The text
 * @param {string} parentId - Parent node ID
 * @param {number} maxDepth - maxDepth of the node tree
 * @param {Partial<Node>} [overrides] - Overrides
 * @returns {Node}
 * 
 * @example
 * const node = createContentNode('id-1', 'sentence', 'Hello world', 'group-1', {
 *   textRep: { punctuation: '.', delimiter: 'space' }
 * });
 */
export function createContentNode(id, type, content, parentId, maxDepth, overrides = {}) {
  return {
    id,
    type,
    content,
    hierarchy: {
      level: maxDepth-1,
      parentId,
      childIds: [],
    },
    ...overrides,
    metadata: {
      isDirty: false,
      createdAt: new Date().toISOString(),
      version: 1,
      ...overrides.metadata,
    },
  };
}

/**
 * Create a grouping node (chapter, section, etc.)
 * Created by AI or manual organization
 * 
 * @param {string} id - UUID
 * @param {string} label - Display name (stored in content)
 * @param {number} level - Hierarchy level (1-6 for groups)
 * @param {string | null} parentId - Parent node ID
 * @param {string[]} [childIds=[]] - Initial children
 * @param {Partial<Node>} [overrides] - Overrides
 * @returns {Node}
 */
export function createGroupNode(id, label, level, parentId, childIds = [], overrides = {}) {
  // Allow groups at level 1 for intermediate organization between root and content
  if (level < 1 || level > 6) {
    throw new Error(`Group node level must be 1-6, got ${level}`);
  }

  return {
    id,
    type: 'group',
    content: label,
    hierarchy: {
      level,
      parentId,
      childIds,
    },
    ...overrides,
    metadata: {
      isDirty: false,
      createdAt: new Date().toISOString(),
      version: 1,
      ...overrides.metadata,
    },
  };
}

/**
 * Create root node (one per document)
 * 
 * @param {string} id - UUID
 * @param {string} documentTitle - Document title
 * @param {string[]} [childIds=[]] - Initial children
 * @returns {Node}
 */
export function createRootNode(id, documentTitle, childIds = []) {
  return {
    id,
    type: 'root',
    content: documentTitle,
    hierarchy: {
      level: 0,
      parentId: null,
      childIds,
    },
    metadata: {
      isDirty: false,
      createdAt: new Date().toISOString(),
      version: 1,
    },
  };
}

// ==================== NODE CLONING & MODIFICATION ====================

/**
 * Deep clone a node
 * @param {Node} node
 * @returns {Node}
 */
export function cloneNode(node) {
  return {
    id: node.id,
    type: node.type,
    content: node.content,
    hierarchy: {
      level: node.hierarchy.level,
      parentId: node.hierarchy.parentId,
      childIds: [...node.hierarchy.childIds],
    },
    structure: node.structure ? { ...node.structure } : undefined,
    formatting: node.formatting ? [...node.formatting] : undefined,
    textRep: node.textRep ? { ...node.textRep } : undefined,
    emotion: node.emotion
      ? {
          profile: { ...node.emotion.profile },
          dominantEmotion: node.emotion.dominantEmotion,
          dominantIntensity: node.emotion.dominantIntensity,
          source: node.emotion.source,
          timestamp: node.emotion.timestamp,
        }
      : undefined,
    metadata: {
      isDirty: node.metadata.isDirty,
      createdAt: node.metadata.createdAt,
      modifiedAt: node.metadata.modifiedAt,
      modifiedBy: node.metadata.modifiedBy,
      committedAt: node.metadata.committedAt,
      version: node.metadata.version,
    },
  };
}

/**
 * Update node content and bump version
 * @param {Node} node
 * @param {string} newContent
 * @returns {Node}
 */
export function updateNodeContent(node, newContent) {
  const updated = cloneNode(node);
  updated.content = newContent;
  updated.metadata.modifiedAt = new Date().toISOString();
  updated.metadata.version += 1;
  updated.metadata.isDirty = true;
  return updated;
}

/**
 * Mark node as dirty (needs AI regeneration)
 * @param {Node} node
 * @returns {Node}
 */
export function markNodeDirty(node) {
  const updated = cloneNode(node);
  updated.metadata.isDirty = true;
  updated.metadata.modifiedAt = new Date().toISOString();
  return updated;
}

/**
 * Mark node as clean (regenerated by AI)
 * @param {Node} node
 * @returns {Node}
 */
export function markNodeClean(node) {
  const updated = cloneNode(node);
  updated.metadata.isDirty = false;
  updated.metadata.modifiedAt = new Date().toISOString();
  updated.metadata.committedAt = new Date().toISOString();
  return updated;
}

// ==================== HIERARCHY NAVIGATION ====================

/**
 * Get immediate children of a node
 * @param {Node} node
 * @param {Map<string, Node>} nodeMap - Map of id → Node
 * @returns {Node[]}
 */
export function getChildren(node, nodeMap) {
  return node.hierarchy.childIds
    .map(id => nodeMap.get(id))
    .filter(Boolean);
}

/**
 * Get parent of a node
 * @param {Node} node
 * @param {Map<string, Node>} nodeMap
 * @returns {Node | null}
 */
export function getParent(node, nodeMap) {
  if (!node.hierarchy.parentId) return null;
  return nodeMap.get(node.hierarchy.parentId) || null;
}

/**
 * Get all siblings (same parent)
 * @param {Node} node
 * @param {Map<string, Node>} nodeMap
 * @returns {Node[]}
 */
export function getSiblings(node, nodeMap) {
  const parent = getParent(node, nodeMap);
  if (!parent) return [];

  return parent.hierarchy.childIds
    .map(id => nodeMap.get(id))
    .filter(n => n && n.id !== node.id);
}

/**
 * Get all ancestors up to root
 * @param {Node} node
 * @param {Map<string, Node>} nodeMap
 * @returns {Node[]}
 */
export function getAncestorChain(node, nodeMap) {
  const ancestors = [];
  let current = node;

  while (current.hierarchy.parentId) {
    const parent = nodeMap.get(current.hierarchy.parentId);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

/**
 * Get all descendants (recursive)
 * @param {Node} node
 * @param {Map<string, Node>} nodeMap
 * @returns {Node[]}
 */
export function getDescendants(node, nodeMap) {
  const descendants = [];
  const queue = [...node.hierarchy.childIds];

  while (queue.length > 0) {
    const childId = queue.shift();
    const child = nodeMap.get(childId);
    if (child) {
      descendants.push(child);
      queue.push(...child.hierarchy.childIds);
    }
  }

  return descendants;
}

// =============== HIERARCY MODIFICATION ===============

export function removeChildId(map, parentId, childId) {
  const parent = map.get(parentId);
  if (!parent) return;
  const patched = cloneNode(parent);
  patched.hierarchy.childIds = patched.hierarchy.childIds.filter((id) => id !== childId);
  map.set(parentId, patched);
}

export function insertChildId(map, parentId, childId, index) {
  const parent = map.get(parentId);
  if (!parent) return false;
  const patched = cloneNode(parent);
  const arr = [...patched.hierarchy.childIds].filter((id) => id !== childId);
  const idx = Math.max(0, Math.min(arr.length, index));
  arr.splice(idx, 0, childId);
  patched.hierarchy.childIds = arr;
  map.set(parentId, patched);
  return true;
}

export function markDirtyUp(map, startId) {
  let curId = startId;
  const visited = new Set();
  while (curId && !visited.has(curId)) {
    visited.add(curId);
    const n = map.get(curId);
    if (!n) break;

    if (!n.metadata.isDirty) {
      const patched = cloneNode(n);
      patched.metadata.isDirty = true;
      patched.metadata.modifiedAt = new Date().toISOString();
      map.set(curId, patched);
    }

    curId = n.hierarchy.parentId;
  }
}

/**
 * If a group becomes empty, delete it and remove from its parent.
 * Cascade upward (but never delete root).
 */
export function pruneEmptyGroupsUp(map, startGroupId, rootId) {
  let curId = startGroupId;

  while (curId && curId !== rootId) {
    const node = map.get(curId);
    if (!node) break;
    if (!isGroupNode(node)) break;
    if ((node.hierarchy.childIds || []).length > 0) break;

    const parentId = node.hierarchy.parentId;
    // remove this group from parent, then delete it
    if (parentId) removeChildId(map, parentId, curId);
    map.delete(curId);

    curId = parentId;
  }
}

/**
 * Reparent a node (move it under a new parent) and optionally reorder.
 * Keeps parent/child links consistent and fixes levels for the moved subtree.
 *
 * @param {NodeMap} nodeMap
 * @param {string} nodeId
 * @param {string} newParentId
 * @returns {boolean}
 */
export function reparentNode(nodeMap, nodeId, newParentId) {
  const node = nodeMap.get(nodeId);
  const newParent = nodeMap.get(newParentId);

  if (!node) {
    console.error(`[TreeInner] Cannot reparent: node ${nodeId} not found`);
    return false;
  }

  if (!newParent) {
    console.error(
      `[TreeInner] Cannot reparent: parent ${newParentId} not found`
    );
    return false;
  }

  if (nodeId === newParentId) {
    console.warn('[TreeInner] Cannot reparent node to itself');
    return false;
  }

  // Remove from old parent
  if (node.hierarchy.parentId) {
    const oldParent = nodeMap.get(node.hierarchy.parentId);
    if (oldParent) {
      const oldParentClone = cloneNode(oldParent);
      oldParentClone.hierarchy.childIds =
        oldParentClone.hierarchy.childIds.filter((id) => id !== nodeId);
      nodeMap.set(oldParent.id, oldParentClone);
    }
  }

  // Update node
  const nodeClone = cloneNode(node);
  nodeClone.hierarchy.parentId = newParentId;
  nodeClone.hierarchy.level = newParent.hierarchy.level + 1;
  nodeClone.metadata.isDirty = true;
  nodeClone.metadata.modifiedAt = new Date().toISOString();
  nodeMap.set(nodeId, nodeClone);

  // Add to new parent
  const newParentClone = cloneNode(newParent);
  if (!newParentClone.hierarchy.childIds.includes(nodeId)) {
    newParentClone.hierarchy.childIds.push(nodeId);
  }
  nodeMap.set(newParentId, newParentClone);

  return true;
}

// ==================== TYPE GUARDS ====================

/**
 * Check if node is a heading
 * @param {Node} node
 * @returns {node is Node & {structure: HeadingStructure}}
 */
export function isHeadingNode(node) {
  return node.type === 'heading' && node.structure && 'level' in node.structure;
}

/**
 * Check if node is a list item
 * @param {Node} node
 * @returns {node is Node & {structure: ListItemStructure}}
 */
export function isListItemNode(node) {
  return node.type === 'list-item' && node.structure && 'type' in node.structure;
}

/**
 * Check if node is a code block
 * @param {Node} node
 * @returns {node is Node & {structure: CodeBlockStructure}}
 */
export function isCodeBlockNode(node) {
  return node.type === 'code-block' && node.structure && 'language' in node.structure;
}

/**
 * Check if node is a blockquote
 * @param {Node} node
 * @returns {node is Node & {structure: BlockquoteStructure}}
 */
export function isBlockquoteNode(node) {
  return node.type === 'blockquote' && node.structure && 'depth' in node.structure;
}

/**
 * Check if node is a group/organizational node
 * @param {Node} node
 * @returns {boolean}
 */
export function isGroupNode(node) {
  return node.type === 'group';
}

/**
 * Check if node is a content node (leaf)
 * @param {Node} node
 * @returns {boolean}
 */
export function isContentNode(node) {
  return ['sentence', 'heading', 'list-item', 'code-block', 'blockquote', 'horizontal-rule'].includes(node.type);
}

/**
 * Check if node is the root
 * @param {Node} node
 * @returns {boolean}
 */
export function isRootNode(node) {
  return node.type === 'root';
}

// ==================== UTILITY ====================

/**
 * Get visual representation of node
 * @param {Node} node
 * @returns {string}
 */
export function nodeToString(node) {
  switch (node.type) {
    case 'heading':
      return `${'#'.repeat(/** @type {HeadingStructure} */ (node.structure)?.level || 1)} ${node.content}`;
    case 'list-item':
      return `${'  '.repeat(/** @type {ListItemStructure} */ (node.structure)?.indentLevel || 0)}${/** @type {ListItemStructure} */ (node.structure)?.marker || '-'} ${node.content}`;
    case 'code-block':
      return `\`\`\`${/** @type {CodeBlockStructure} */ (node.structure)?.language || ''}\n${node.content}\n\`\`\``;
    case 'blockquote':
      return `${'> '.repeat(/** @type {BlockquoteStructure} */ (node.structure)?.depth || 1)}${node.content}`;
    case 'root':
      return `📄 ${node.content}`;
    case 'group':
      return `📁 ${node.content}`;
    default:
      return node.content;
  }
}

export default {
  // Constants
  EMOTION_AXES,

  // Creation
  createContentNode,
  createGroupNode,
  createRootNode,
  createEmptyEmotionProfile,

  // Modification
  cloneNode,
  updateNodeContent,
  markNodeDirty,
  markNodeClean,

  // Navigation
  getChildren,
  getParent,
  getSiblings,
  getAncestorChain,
  getDescendants,

  // Type guards
  isHeadingNode,
  isListItemNode,
  isCodeBlockNode,
  isBlockquoteNode,
  isGroupNode,
  isContentNode,
  isRootNode,

  // Utility
  nodeToString,
};