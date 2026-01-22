/**
 * Adapter between node-based system and existing Claude service
 * Converts nodeMap to sentence-like format for Claude integration
 * 
 * @typedef {import('../types/node').Node} Node
 */

import { getContentNodeIdsInDocumentOrder } from '@utils/nodeHelpers';
import { isContentNode, isGroupNode, createGroupNode, cloneNode } from '../types/node';
import { v4 as uuidv4 } from 'uuid';


/**
 * Convert nodeMap to sentences array format for Claude service
 * Creates a pseudo-sentences array with _hierarchyMeta
 *
 * @param {Map<string, Node>} nodeMap - Current node map
 * @param {string} rootId - Root node ID
 * @param {number} maxDepth - Hierarchy depth
 * @returns {Array<string>} Sentences-like array with _hierarchyMeta
 */
export function nodeMapToSentenceFormat(nodeMap, rootId, maxDepth) {
  console.log('[Adapter] Converting nodeMap to sentence format');

  const root = nodeMap.get(rootId);
  if (!root) throw new Error('Root node not found');

  // Convert app level to Claude level
  const toClaudeLevel = (appLevel) => maxDepth - appLevel;

  // Extract content nodes in document order
  const contentIds = getContentNodeIdsInDocumentOrder(nodeMap, rootId);
  const contentNodes = contentIds
    .map((id) => nodeMap.get(id))
    .filter(Boolean)
    .filter(isContentNode);

  const sentences = [];
  contentNodes.forEach((node) => {
    sentences.push({
      id: node.id,
      content: node.content,
      emotion: null,
      intensity: 0,
      emotions: node.emotion?.profile || {},
      isDirty: node.metadata.isDirty,
    });
  });

  // Build hierarchy metadata with CLAUDE levels (converted from app levels)
  const hierarchyMeta = {
    rootTitle: root.content,
    maxLevel: maxDepth - 1,
    nodes: Array.from(nodeMap.values())
      .filter((n) => n.id !== rootId)
      .filter(isGroupNode)
      .map((n) => ({
        id: n.id,
        type: n.type,
        level: toClaudeLevel(n.hierarchy.level), // ← Convert to Claude level
        label: n.content,
        childIds: [...n.hierarchy.childIds],
      })),
    dirtyNodeIds: Array.from(nodeMap.values())
      .filter(isGroupNode)
      .filter((n) => n.metadata.isDirty)
      .map((n) => n.id),
    dirtySentenceIds: contentNodes
      .filter((n) => n.metadata.isDirty)
      .map((n) => n.id),
  };

  sentences._hierarchyMeta = hierarchyMeta;

  console.log('[Adapter] Converted:', {
    sentences: sentences.length,
    dirtyNodes: hierarchyMeta.dirtyNodeIds.length,
    dirtySentences: hierarchyMeta.dirtySentenceIds.length,
  });

  return sentences;
}

/**
 * Convert Claude's response back to nodeMap updates (SAFE PARTIAL SUBTREE REPLACE)
 *
 * Guarantees:
 * - Does NOT delete unrelated groups/content.
 * - Replaces only the subtree rooted at subtree.rootNodeId.
 * - Keeps parent/child pointers consistent (single-parent invariant).
 *
 * @param {Map<string, Node>} nodeMap
 * @param {string} rootId
 * @param {Array<{rootNodeId: string, newNodes: Array}>} restructuredSubtrees
 * @param {string|undefined} newRootTitle
 * @param {Object|undefined} newRootEmotions - EmotionProfile (DES) for root
 * @param {number} maxDepth
 * @returns {Map<string, Node>}
 */
export function applyClaudeRestructureToNodeMap(
  nodeMap,
  rootId,
  restructuredSubtrees,
  newRootTitle,
  newRootEmotions,
  maxDepth
) {
  console.log('[Adapter] Applying Claude restructure to nodeMap');

  const updated = new Map(nodeMap);
  const contentLevel = maxDepth - 1;
  const toAppLevel = (claudeLevel) => maxDepth - claudeLevel;

  const buildEmotionField = (profile) => {
    if (!profile || typeof profile !== 'object') return null;

    const entries = Object.entries(profile).filter(
      ([, v]) => typeof v === 'number'
    );

    let dominantEmotion = 'interest';
    let dominantIntensity = 0;

    for (const [k, v] of entries) {
      if (v > dominantIntensity) {
        dominantEmotion = k;
        dominantIntensity = v;
      }
    }

    return {
      profile,
      dominantEmotion,
      dominantIntensity,
      source: 'ai',
      timestamp: new Date().toISOString(),
    };
  };

  const removeChildFromParent = (parentId, childId) => {
    if (!parentId) return;
    const parent = updated.get(parentId);
    if (!parent) return;

    const patched = cloneNode(parent);
    patched.hierarchy.childIds = (patched.hierarchy.childIds || []).filter(
      (id) => id !== childId
    );
    updated.set(parentId, patched);
  };

  const insertChildrenIntoParent = (parentId, insertAtIndex, childIds) => {
    const parent = updated.get(parentId);
    if (!parent) return;

    const patched = cloneNode(parent);
    const arr = [...(patched.hierarchy.childIds || [])];

    // Remove any occurrences first (avoid duplicates)
    const filtered = arr.filter((id) => !childIds.includes(id));

    const idx =
      insertAtIndex >= 0 && insertAtIndex <= filtered.length
        ? insertAtIndex
        : filtered.length;

    filtered.splice(idx, 0, ...childIds);
    patched.hierarchy.childIds = filtered;

    updated.set(parentId, patched);
  };

  const collectGroupSubtreeIds = (startGroupId) => {
    const out = new Set();
    const queue = [startGroupId];

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || out.has(id)) continue;

      const node = updated.get(id);
      if (!node) continue;
      if (!isGroupNode(node)) continue;

      out.add(id);

      for (const childId of node.hierarchy.childIds || []) {
        const child = updated.get(childId);
        if (child && isGroupNode(child)) {
          queue.push(childId);
        }
      }
    }

    return out;
  };

  if (!restructuredSubtrees || restructuredSubtrees.length === 0) {
    // Still allow root metadata update
    const root = updated.get(rootId);
    if (root) {
      const patchedRoot = cloneNode(root);
      if (newRootTitle) patchedRoot.content = newRootTitle;
      const rootEmotionField = buildEmotionField(newRootEmotions);
      if (rootEmotionField) patchedRoot.emotion = rootEmotionField;
      updated.set(rootId, patchedRoot);
    }
    return updated;
  }

  // Validate Claude references globally (content nodes must exist, group refs must exist in Claude output)
  const allClaudeNodeIds = new Set();
  const nodesByIdFromClaude = new Map();

  for (const subtree of restructuredSubtrees) {
    const nodes = Array.isArray(subtree.newNodes) ? subtree.newNodes : [];
    for (const n of nodes) {
      allClaudeNodeIds.add(n.id);
      nodesByIdFromClaude.set(n.id, n);
    }
  }

  const contentNodeIds = new Set(
    Array.from(updated.values())
      .filter(isContentNode)
      .map((n) => n.id)
  );

  for (const claudeNode of nodesByIdFromClaude.values()) {
    for (const childId of claudeNode.childIds || []) {
      const isClaudeNode = allClaudeNodeIds.has(childId);
      const isContent = contentNodeIds.has(childId);

      if (!isClaudeNode && !isContent) {
        console.error(
          `[Adapter] ❌ INVALID: Claude node ${claudeNode.id} references missing child ${childId}`
        );
        console.error('[Adapter] Aborting restructure, returning original map');
        return new Map(nodeMap);
      }
    }
  }

  // Apply each subtree as an in-place replacement
  for (const subtree of restructuredSubtrees) {
    const nodes = Array.isArray(subtree.newNodes) ? subtree.newNodes : [];
    if (nodes.length === 0) continue;

    const oldRootId = subtree.rootNodeId;
    if (!oldRootId || oldRootId === rootId) {
      console.warn(
        `[Adapter] Skipping subtree with invalid rootNodeId: ${oldRootId}`
      );
      continue;
    }

    const oldRootNode = updated.get(oldRootId);
    const oldParentId = oldRootNode?.hierarchy?.parentId || rootId;
    const oldParent = updated.get(oldParentId);

    const oldIndex = oldParent
      ? (oldParent.hierarchy.childIds || []).indexOf(oldRootId)
      : -1;

    // Determine top-level Claude nodes for this subtree (highest Claude level)
    const subtreeTopClaudeLevel = Math.max(...nodes.map((n) => n.level));
    const topLevelNewIds = nodes
      .filter((n) => n.level === subtreeTopClaudeLevel)
      .map((n) => n.id);

    // Build parentById from Claude nodes (group→group relationships only)
    const idsInThisSubtree = new Set(nodes.map((n) => n.id));
    const parentById = new Map();

    for (const n of nodes) {
      for (const childId of n.childIds || []) {
        if (idsInThisSubtree.has(childId)) {
          parentById.set(childId, n.id);
        }
      }
    }

    // 1) Remove the old subtree root from its parent (if present)
    removeChildFromParent(oldParentId, oldRootId);

    // 2) Delete old subtree groups (only groups, not content)
    const oldGroupIds = collectGroupSubtreeIds(oldRootId);

    // Remove references to old groups from their parents (defensive)
    for (const gid of oldGroupIds) {
      const g = updated.get(gid);
      const pid = g?.hierarchy?.parentId;
      if (pid) removeChildFromParent(pid, gid);
    }

    // Delete the groups
    for (const gid of oldGroupIds) {
      updated.delete(gid);
    }

    // 3) Create/replace the new group nodes for this subtree
    //    Ensure parentId is correct:
    //    - If Claude node has a Claude parent => that parent
    //    - If it's top-level of the subtree => oldParentId
    for (const n of nodes) {
      const appLevel = toAppLevel(n.level);

      const isTopLevel = n.level === subtreeTopClaudeLevel;
      const parentId = isTopLevel ? oldParentId : parentById.get(n.id) || null;

      const childIds = [...new Set(n.childIds || [])];

      const group = createGroupNode(
        n.id,
        n.title,
        appLevel,
        parentId,
        childIds,
        {
          metadata: {
            isDirty: false,
            createdAt: new Date().toISOString(),
            version: 1,
          },
        }
      );

      const emotionField = buildEmotionField(n.emotions);
      if (emotionField) group.emotion = emotionField;

      updated.set(n.id, group);
    }

    // 4) Fix content node parents for Claude level-2 nodes (leaf groups)
    //    Also detach content from its previous parent to prevent multi-parent DAG.
    for (const level2 of nodes.filter((n) => n.level === 2)) {
      for (const sentenceId of level2.childIds || []) {
        const content = updated.get(sentenceId);
        if (!content || !isContentNode(content)) continue;

        // Detach from old parent (if any)
        const prevParentId = content.hierarchy.parentId;
        if (prevParentId && prevParentId !== level2.id) {
          removeChildFromParent(prevParentId, sentenceId);
        }

        const patched = cloneNode(content);
        patched.hierarchy.parentId = level2.id;
        patched.hierarchy.level = contentLevel;

        // mark leaf dirty (so emotion evaluation can refresh) OR keep as-is
        patched.metadata.isDirty = true;
        patched.metadata.modifiedAt = new Date().toISOString();

        updated.set(sentenceId, patched);
      }
    }

    // 5) Splice new top-level ids into oldParent at the old position
    // If oldIndex is unknown, append.
    insertChildrenIntoParent(oldParentId, oldIndex, topLevelNewIds);

    console.log(
      `[Adapter] Subtree ${oldRootId.slice(0, 8)} replaced in parent ${
        oldParentId === rootId ? 'root' : oldParentId.slice(0, 8)
      } with ${topLevelNewIds.length} node(s)`
    );
  }

  // Update root metadata (title/emotion), DO NOT overwrite childIds
  const root = updated.get(rootId);
  if (root) {
    const patchedRoot = cloneNode(root);
    if (newRootTitle) patchedRoot.content = newRootTitle;

    const rootEmotionField = buildEmotionField(newRootEmotions);
    if (rootEmotionField) patchedRoot.emotion = rootEmotionField;

    updated.set(rootId, patchedRoot);
  }

  console.log('[Adapter] Restructure complete, nodeMap now has', updated.size, 'nodes');
  return updated;
}

/**
 * Apply emotion evaluation to nodeMap
 *
 * @param {Map<string, Node>} nodeMap - Current node map
 * @param {Array} emotionData - From Claude evaluateSentenceEmotions
 * @returns {Map<string, Node>} Updated nodeMap with emotions
 */
export function applyEmotionsToNodeMap(nodeMap, emotionData) {
  console.log('[Adapter] Applying emotions to nodeMap');

  const updated = new Map(nodeMap);

  emotionData.forEach(item => {
    const node = updated.get(item.id);
    if (node && isContentNode(node)) {
      const updatedNode = cloneNode(node);

      // Get emotion profile - check both formats
      const emotionProfile = item.emotions || {};

      // Find dominant emotion
      const dominantEntry = Object.entries(emotionProfile).sort(
        (a, b) => b[1] - a[1]
      )[0];

      updatedNode.emotion = {
        profile: emotionProfile,
        dominantEmotion: dominantEntry ? dominantEntry[0] : (item.emotion || 'interest'),
        dominantIntensity: dominantEntry ? dominantEntry[1] : (item.intensity || 0),
        source: 'ai',
        timestamp: new Date().toISOString(),
      };
      updated.set(item.id, updatedNode);
    }
  });

  console.log(`[Adapter] Applied emotions to ${emotionData.length} nodes`);

  return updated;
}