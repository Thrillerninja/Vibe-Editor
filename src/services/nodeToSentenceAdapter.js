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
 * Apply restructuring where rootNodeId is 'root' (full hierarchy rebuild)
 * This happens when Claude/system rebuilds the entire structure
 */
function applyRootLevelRestructure(
  nodeMap,
  rootId,
  newNodes,
  maxDepth
) {
  console.log('[Adapter] Applying root-level restructure (rebuilding full hierarchy)');

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

  // Step 1: Delete all existing group nodes (keep content nodes)
  const nodesToDelete = new Set();
  for (const [id, node] of updated.entries()) {
    if (isGroupNode(node) && id !== rootId) {
      nodesToDelete.add(id);
    }
  }

  console.log(`[Adapter] Deleting ${nodesToDelete.size} old group nodes`);
  for (const id of nodesToDelete) {
    updated.delete(id);
  }

  // Step 2: Create new group nodes from restructuring output
  const nodeMap_new = new Map();
  const sentenceIds = new Set(
    Array.from(updated.values())
      .filter(isContentNode)
      .map(n => n.id)
  );

  for (const n of newNodes) {
    const appLevel = toAppLevel(n.level);
    const childIds = [...new Set(n.childIds || [])];

    const group = createGroupNode(
      n.id,
      n.title,
      appLevel,
      null, // parentId will be set below
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

    nodeMap_new.set(n.id, group);
  }

  // Step 3: Fix parent references and build parent map
  const topLevelNodes = newNodes.filter(n => !newNodes.map(x => x.id).includes(n.childIds?.[0] ? 
    newNodes.find(x => x.childIds?.includes(n.id))?.id : null)).filter(n => n);
  
  // Actually, simpler: find nodes whose parents aren't in the new hierarchy
  const topLevel = Math.max(...newNodes.map(n => n.level));
  const topLevelNewIds = newNodes
    .filter(n => n.level === topLevel)
    .map(n => n.id);

  // Build parent references for new hierarchy
  for (const n of newNodes) {
    const parentNode = newNodes.find(parent => parent.childIds?.includes(n.id));
    if (parentNode) {
      const nodeRecord = nodeMap_new.get(n.id);
      if (nodeRecord) {
        nodeRecord.hierarchy.parentId = parentNode.id;
      }
    } else if (n.level === topLevel) {
      // Top-level nodes: parent is root
      const nodeRecord = nodeMap_new.get(n.id);
      if (nodeRecord) {
        nodeRecord.hierarchy.parentId = rootId;
      }
    }
  }

  // Add new group nodes to updated map
  for (const [id, node] of nodeMap_new.entries()) {
    updated.set(id, node);
  }

  // Step 4: Fix content node parents (attach to correct level-2 groups)
  const level2Groups = newNodes.filter(n => n.level === 2);

  for (const level2 of level2Groups) {
    for (const sentenceId of level2.childIds || []) {
      const content = updated.get(sentenceId);
      if (!content || !isContentNode(content)) continue;

      // Detach from old parent
      const prevParentId = content.hierarchy.parentId;
      if (prevParentId && prevParentId !== level2.id) {
        const prevParent = updated.get(prevParentId);
        if (prevParent && (prevParent.hierarchy.childIds || []).includes(sentenceId)) {
          const patched = cloneNode(prevParent);
          patched.hierarchy.childIds = (patched.hierarchy.childIds || []).filter(
            (id) => id !== sentenceId
          );
          updated.set(prevParentId, patched);
        }
      }

      const patched = cloneNode(content);
      patched.hierarchy.parentId = level2.id;
      patched.hierarchy.level = contentLevel;
      patched.metadata.isDirty = false;
      patched.metadata.modifiedAt = new Date().toISOString();
      updated.set(sentenceId, patched);
    }
  }

  // Step 5: Update root to point to top-level groups
  const root = updated.get(rootId);
  if (root) {
    const patchedRoot = cloneNode(root);
    patchedRoot.hierarchy.childIds = topLevelNewIds;
    updated.set(rootId, patchedRoot);
  }

  console.log(
    `[Adapter] Root-level restructure complete: ${newNodes.length} groups created`
  );
  return updated;
}

/**
 * Main function - updated to handle root-level restructuring
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

  // Special case: root-level restructuring (new two-phase approach)
  if (
    restructuredSubtrees.length === 1 &&
    restructuredSubtrees[0].rootNodeId === rootId
  ) {
    const result = applyRootLevelRestructure(
      nodeMap,
      rootId,
      restructuredSubtrees[0].newNodes,
      maxDepth
    );

    // Apply root metadata
    const root = result.get(rootId);
    if (root) {
      const patchedRoot = cloneNode(root);
      if (newRootTitle) patchedRoot.content = newRootTitle;
      if (newRootEmotions) patchedRoot.emotion = buildEmotionField(newRootEmotions);
      result.set(rootId, patchedRoot);
    }

    return result;
  }

  // Original code for subtree-level restructuring continues below...
  const updated = new Map(nodeMap);
  // ... rest of original applyClaudeRestructureToNodeMap code ...
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