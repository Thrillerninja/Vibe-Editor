/**
 * @fileoverview Text parsing for content units
 * 
 * This module handles the conversion of raw text into normalized
 * ContentUnit objects that can be synced with the nodeMap.
 * 
 * Key responsibilities:
 * - Tab expansion and indent calculation
 * - List item detection and parsing
 * - Sentence splitting on punctuation
 * - Line-based unit aggregation
 */

// ==================== IMPORTS ====================
import {
  cloneNode,
  createContentNode,
  isContentNode,
  isGroupNode,
  isRootNode,
  markDirtyUp,
} from '../types/node';
import { getContentNodeIdsInDocumentOrder } from './nodeHelpers';
import { addChildToNode } from './nodeOperations';

/** @typedef {import('../types/node').Node} Node */

/**
 * @typedef {'none'|'space'|'newline'|'paragraph'} Delimiter
 */

/**
 * A parsed text unit that becomes one content node.
 *
 * @typedef {Object} ContentUnit
 * @property {'sentence'|'list-item'| 'blockquote'} type
 * @property {string} content
 * @property {import('../types/node').TextRepresentation} textRep
 * @property {import('../types/node').SemanticStructure} [structure]
 */

/**
 * Options for parsing and syncing.
 *
 * @typedef {Object} SyncOptions
 * @property {string} rootId
 * @property {number} maxDepth
 * @property {() => string} createId - usually uuidv4
 * @property {() => string} nowIso - () => new Date().toISOString()
 * @property {number} [spacesPerIndent=2] - how many spaces equal one indent level
 */

// ==================== WHITESPACE HANDLING ====================
/**
 * Expand tabs into spaces (so indent math is consistent).
 * @param {string} s
 * @param {number} tabSize
 */
function expandTabs(s, tabSize) {
  return s.replace(/\t/g, ' '.repeat(tabSize));
}

/**
 * Convert a leading whitespace prefix into indent level.
 * @param {string} leadingWhitespace
 * @param {number} spacesPerIndent
 */
function getIndentLevel(leadingWhitespace, spacesPerIndent) {
  const expanded = expandTabs(leadingWhitespace, spacesPerIndent);
  const spaces = expanded.length;
  return Math.floor(spaces / spacesPerIndent);
}

// ==================== LIST PARSING ====================
/**
 * Detect list items on a raw line (line-based, not punctuation-based).
 *
 * Supports:
 * - ordered: "  1. item" / "  a. item"
 * - unordered: "  - item" / "* item" / "+ item" / "• item"
 * - task: "  - [x] item" / "- [ ] item"
 *
 * @param {string} rawLine
 * @param {number} spacesPerIndent
 * @returns {null | { type: 'list-item', content: string, structure: any }}
 */
function parseListLine(rawLine, spacesPerIndent) {
  // Task list: - [x] item
  const taskMatch = rawLine.match(
    /^([ \t]*)([-*+])\s+\[([ xX])\]\s+(.+)$/
  );
  if (taskMatch) {
    const leading = taskMatch[1] || '';
    const bullet = taskMatch[2];
    const checkedChar = taskMatch[3];
    const body = taskMatch[4] || '';

    return {
      type: 'list-item',
      content: body,
      structure: {
        type: 'task',
        marker: `${bullet} [${checkedChar}]`,
        indentLevel: getIndentLevel(leading, spacesPerIndent),
        taskChecked: checkedChar.toLowerCase() === 'x',
      },
    };
  }

  // Ordered: 1. item or a. item
  const orderedMatch = rawLine.match(/^([ \t]*)(\d+|[a-zA-Z])\.\s+(.+)$/);
  if (orderedMatch) {
    const leading = orderedMatch[1] || '';
    const token = orderedMatch[2];
    const body = orderedMatch[3] || '';

    return {
      type: 'list-item',
      content: body,
      structure: {
        type: 'ordered',
        marker: `${token}.`,
        indentLevel: getIndentLevel(leading, spacesPerIndent),
      },
    };
  }

  // Unordered: - item / * item / + item / • item
  const unorderedMatch = rawLine.match(/^([ \t]*)([-*+•])\s+(.+)$/);
  if (unorderedMatch) {
    const leading = unorderedMatch[1] || '';
    const bullet = unorderedMatch[2];
    const body = unorderedMatch[3] || '';

    return {
      type: 'list-item',
      content: body,
      structure: {
        type: 'unordered',
        marker: bullet,
        indentLevel: getIndentLevel(leading, spacesPerIndent),
      },
    };
  }

  return null;
}

// ==================== BLOCKQUOTE PARSING ====================
/**
 * Detect blockquote lines and extract depth
 * 
 * @param {string} rawLine
 * @returns {null | { depth: number, content: string }}
 */
function parseBlockquoteLine(rawLine) {
  const match = rawLine.match(/^[ \t]*(>+)\s+(.*)$/);
  console.log('[parseBlockquoteLine]', { rawLine, match: match ? 'MATCHED' : 'NO MATCH' });
  
  if (match) {
    const depth = match[1].length;
    const content = match[2];
    return { depth, content };
  }
  return null;
}

// ==================== SENTENCE SPLITTING ====================
/**
 * Split a normal (non-list) line into sentence-like units by punctuation.
 * This intentionally keeps your current logic style, but does not run on list
 * lines (to avoid splitting list items into multiple nodes).
 *
 * @param {string} trimmedLine - line trimmed of surrounding whitespace
 * @returns {Array<{content: string, delimiter: Delimiter, delimiterContent: string}>}
 */
function splitLineIntoSentenceParts(trimmedLine) {
  const parts = [];
  let current = '';
  let i = 0;

  while (i < trimmedLine.length) {
    const ch = trimmedLine[i];
    current += ch;

    if (ch === '.' || ch === '!' || ch === '?') {
      let j = i + 1;
      while (j < trimmedLine.length && /\s/.test(trimmedLine[j])) j++;

      // Split only if there is whitespace + more content after
      if (j > i + 1 && j < trimmedLine.length) {
        const curTrimmed = current.trim();
        const isListMarker = /^[0-9]+\.$|^[a-zA-Z]\.$/.test(curTrimmed);

        if (!isListMarker) {
          parts.push({
            content: current.trim(),
            delimiter: /** @type {Delimiter} */ ('space'),
            delimiterContent: ' ',
          });
          current = '';
          i = j - 1;
        }
      }
    }

    i++;
  }

  if (current.trim()) {
    parts.push({
      content: current.trim(),
      delimiter: /** @type {Delimiter} */ ('none'),
      delimiterContent: '',
    });
  }

  return parts;
}

// ==================== MAIN PARSING ====================
/**
 * Parse full text into ContentUnits (line-aware).
 *
 * Important:
 * - List lines become a SINGLE unit (not punctuation split)
 * - Empty lines turn the previous unit delimiter into 'paragraph'
 *
 * @param {string} text
 * @param {number} spacesPerIndent
 * @returns {ContentUnit[]}
 */
export function parseTextToContentUnits(text, spacesPerIndent = 2) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n');
  /** @type {ContentUnit[]} */
  const units = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];

    // Empty line => paragraph break (if we have a previous unit)
    if (!rawLine.trim()) {
      const prev = units[units.length - 1];
      if (prev) {
        prev.textRep.delimiter = 'paragraph';
        prev.textRep.delimiterContent = '\n\n';
      }
      continue;
    }

    // List detection must use raw line (keeps indentation)
    const list = parseListLine(rawLine, spacesPerIndent);
    if (list) {
      units.push({
        type: 'list-item',
        content: list.content,
        structure: list.structure,
        textRep: {
          delimiter: lineIdx < lines.length - 1 ? 'newline' : 'none',
          delimiterContent: lineIdx < lines.length - 1 ? '\n' : '',
        },
      });
      continue;
    }

    // Blockquote detection
    const blockquote = parseBlockquoteLine(rawLine);
    if (blockquote) {
      const trimmedContent = blockquote.content.trim();
      const parts = splitLineIntoSentenceParts(trimmedContent);

      parts.forEach((p, partIdx) => {
        const isLastPartInLine = partIdx === parts.length - 1;
        const isLastLine = lineIdx === lines.length - 1;

        const delimiter = isLastPartInLine
          ? isLastLine
            ? 'none'
            : 'newline'
          : p.delimiter;

        const delimiterContent =
          delimiter === 'space'
            ? ' '
            : delimiter === 'newline'
              ? '\n'
              : delimiter === 'paragraph'
                ? '\n\n'
                : '';

        units.push({
          type: 'blockquote',
          content: p.content,
          structure: {
            depth: blockquote.depth,
          },
          textRep: { delimiter, delimiterContent },
        });
      });
      continue;
    }

    // Normal line: sentence-split on trimmed content
    const trimmedLine = rawLine.trim();
    const parts = splitLineIntoSentenceParts(trimmedLine);

    parts.forEach((p, partIdx) => {
      const isLastPartInLine = partIdx === parts.length - 1;
      const isLastLine = lineIdx === lines.length - 1;

      // For last part in a line, delimiter is newline (unless last line)
      const delimiter = isLastPartInLine
        ? isLastLine
          ? 'none'
          : 'newline'
        : p.delimiter;

      const delimiterContent =
        delimiter === 'space'
          ? ' '
          : delimiter === 'newline'
            ? '\n'
            : delimiter === 'paragraph'
              ? '\n\n'
              : '';

      units.push({
        type: 'sentence',
        content: p.content,
        textRep: { delimiter, delimiterContent },
      });
    });
  }

  // Filter out any accidental empties
  return units.filter((u) => u.content && u.content.length > 0);
}

// ==================== SYNC OPERATIONS ====================
/**
 * Compute existing content node IDs in document order, with fallback.
 *
 * @param {Map<string, Node>} nodeMap
 * @param {string} rootId
 * @returns {string[]}
 */
function getExistingContentIdsOrdered(nodeMap, rootId) {
  let ids = getContentNodeIdsInDocumentOrder(nodeMap, rootId);

  if (!ids || ids.length === 0) {
    ids = Array.from(nodeMap.values())
      .filter(isContentNode)
      .sort((a, b) =>
        String(a.metadata.createdAt).localeCompare(String(b.metadata.createdAt))
      )
      .map((n) => n.id);
  }

  return ids;
}

/**
 * Choose the parent ID under which NEW content nodes should be created.
 * Strategy: use the parent of the last existing content node (if any),
 * otherwise walk down the group chain (fallback).
 *
 * @param {Map<string, Node>} nodeMap
 * @param {string} rootId
 * @param {number} maxDepth
 * @param {string[]} existingContentIdsOrdered
 * @returns {string}
 */
function chooseNewContentParentId(nodeMap, rootId, maxDepth, existingContentIdsOrdered) {
  const targetParentLevel = maxDepth - 2;

  if (targetParentLevel <= 0) return rootId;

  if (existingContentIdsOrdered.length > 0) {
    const lastId = existingContentIdsOrdered[existingContentIdsOrdered.length - 1];
    const last = nodeMap.get(lastId);

    if (last?.hierarchy?.parentId) {
      return last.hierarchy.parentId;
    }
  }

  // Fallback: find any group at target level
  const groupAtLevel = Array.from(nodeMap.values()).find(
    (n) => isGroupNode(n) && n.hierarchy.level === targetParentLevel
  );
  if (groupAtLevel) return groupAtLevel.id;

  // Fallback 2: walk chain from root
  let cur = rootId;
  while (true) {
    const node = nodeMap.get(cur);
    if (!node) break;

    const nextGroup = (node.hierarchy.childIds || [])
      .map((id) => nodeMap.get(id))
      .find(
        (child) => child && isGroupNode(child) && child.hierarchy.level < maxDepth - 1
      );

    if (!nextGroup) return cur;
    if (nextGroup.hierarchy.level === targetParentLevel) return nextGroup.id;

    cur = nextGroup.id;
  }

  return rootId;
}

/**
 * Ensure a parent includes a childId in childIds.
 *
 * @param {Map<string, Node>} nodeMap
 * @param {string} parentId
 * @param {string} childId
 */
function ensureParentHasChild(nodeMap, parentId, childId) {
  const parent = nodeMap.get(parentId);
  if (!parent) return;

  if (!parent.hierarchy.childIds.includes(childId)) {
    const patched = addChildToNode(parent, childId);
    nodeMap.set(parentId, patched);
  }
}

/**
 * Remove a childId from all group/root nodes (defensive cleanup).
 *
 * @param {Map<string, Node>} nodeMap
 * @param {string} childId
 */
function removeChildReferencesEverywhere(nodeMap, childId) {
  for (const [id, node] of nodeMap.entries()) {
    if (!node) continue;
    if (!isGroupNode(node) && !isRootNode(node)) continue;

    if ((node.hierarchy.childIds || []).includes(childId)) {
      const patched = cloneNode(node);
      patched.hierarchy.childIds = (patched.hierarchy.childIds || []).filter(
        (cid) => cid !== childId
      );
      nodeMap.set(id, patched);
    }
  }
}

/**
 * Main: sync NodeMap based on current text.
 *
 * @param {Map<string, Node>} prevNodeMap
 * @param {string} text
 * @param {SyncOptions} options
 * @returns {Map<string, Node>}
 */
export function syncNodeMapWithText(prevNodeMap, text, options) {
  const { rootId, maxDepth, createId, nowIso, spacesPerIndent = 2 } = options;
  const updated = new Map(prevNodeMap);
  const root = updated.get(rootId);

  if (!root) return prevNodeMap;

  const units = parseTextToContentUnits(text, spacesPerIndent);

  // Get all existing groups
  const groupNodes = Array.from(updated.values())
    .filter(isGroupNode)
    .sort((a, b) => a.hierarchy.level - b.hierarchy.level);

  // Instead of computing topGroupIds from root.childIds,
  // find ALL groups that should be under root
  const existingTopGroups = groupNodes.filter(g => 
    g.hierarchy.parentId === rootId || g.hierarchy.level === 1
  );
  const existingTopGroupIds = existingTopGroups.map(g => g.id);

  const existingContentIdsOrdered = getExistingContentIdsOrdered(updated, rootId);

  // If text is empty
  if (units.length === 0) {
    for (const id of existingContentIdsOrdered) updated.delete(id);
    for (const g of groupNodes) updated.delete(g.id);

    const patchedRoot = cloneNode(root);
    patchedRoot.hierarchy.childIds = [];
    patchedRoot.metadata.isDirty = true;
    patchedRoot.metadata.modifiedAt = nowIso();
    updated.set(rootId, patchedRoot);
    return updated;
  }

  const contentLevel = maxDepth - 1;
  const contentParentId = chooseNewContentParentId(
    updated,
    rootId,
    maxDepth,
    existingContentIdsOrdered
  );

  // Create a map of content signature to existing node for matching
  const contentToNodeMap = new Map();
  for (const id of existingContentIdsOrdered) {
    const node = updated.get(id);
    if (node) {
      const signature = `${node.type}:${node.content}:${JSON.stringify(node.structure || null)}`;
      contentToNodeMap.set(signature, id);
    }
  }

  const newContentIds = [];
  const usedNodeIds = new Set();

  // Match units to existing nodes by content, or create new
  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    const signature = `${unit.type}:${unit.content}:${JSON.stringify(unit.structure || null)}`;
    const existingNodeId = contentToNodeMap.get(signature);

    if (existingNodeId && !usedNodeIds.has(existingNodeId)) {
      // Reuse existing node with matching content
      const existingNode = updated.get(existingNodeId);
      usedNodeIds.add(existingNodeId);

      const needsPatch =
        JSON.stringify(existingNode.textRep || null) !== JSON.stringify(unit.textRep || null);

      if (needsPatch) {
        const patched = cloneNode(existingNode);
        patched.textRep = unit.textRep;
        patched.metadata.isDirty = true;
        patched.metadata.modifiedAt = nowIso();
        patched.metadata.version = (patched.metadata.version || 1) + 1;
        updated.set(existingNodeId, patched);
        
        if (patched.hierarchy.parentId) {
          markDirtyUp(updated, patched.hierarchy.parentId);
        }
      }

      newContentIds.push(existingNodeId);
    } else {
      // Create new node
      const nodeId = createId();
      const newNode = createContentNode(
        nodeId,
        unit.type,
        unit.content,
        contentParentId,
        maxDepth,
        {
          metadata: { isDirty: true, createdAt: nowIso(), version: 1 },
          textRep: unit.textRep,
          structure: unit.structure,
        }
      );

      newNode.hierarchy.level = contentLevel;
      updated.set(nodeId, newNode);
      ensureParentHasChild(updated, contentParentId, nodeId);
      
      if (contentParentId) {
        markDirtyUp(updated, contentParentId);
      }

      newContentIds.push(nodeId);
    }
  }

  // Delete unused existing content nodes
  for (const id of existingContentIdsOrdered) {
    if (!usedNodeIds.has(id)) {
      updated.delete(id);
      removeChildReferencesEverywhere(updated, id);
    }
  }

  // If root currently has group children, preserve them
  // Otherwise point directly to content nodes
  const patchedRoot = cloneNode(updated.get(rootId) || root);
  
  const rootHasGroups = (patchedRoot.hierarchy.childIds || [])
    .map(id => updated.get(id))
    .some(n => n && isGroupNode(n));

  if (rootHasGroups && existingTopGroupIds.length > 0) {
    // Keep existing groups, but ensure they're all in childIds
    patchedRoot.hierarchy.childIds = Array.from(new Set([
      ...patchedRoot.hierarchy.childIds,
      ...existingTopGroupIds
    ]));
  } else if (!rootHasGroups) {
    // No groups: point directly to content
    patchedRoot.hierarchy.childIds = newContentIds;
  }
  // else: mixed case - keep what was there

  updated.set(rootId, patchedRoot);
  return updated;
}

export default {
  expandTabs,
  getIndentLevel,
  parseListLine,
  parseBlockquoteLine,
  splitLineIntoSentenceParts,
  parseTextToContentUnits,
  syncNodeMapWithText,
};