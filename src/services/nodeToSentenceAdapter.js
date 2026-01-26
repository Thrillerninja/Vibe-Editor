/**
 * @fileoverview Node to Sentence Format Adapter
 * 
 * Converts between nodeMap and sentence format for Claude.
 * Also applies restructuring results back to nodeMap.
 * 
 * @typedef {import('../types/node').Node} Node
 */

import { getContentNodeIdsInDocumentOrder } from '@utils/nodeHelpers';
import {
  isContentNode,
  isGroupNode,
  createGroupNode,
  cloneNode,
} from '../types/node';

function buildEmotionField(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const entries = Object.entries(profile).filter(([, v]) => typeof v === 'number');
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
}

/**
 * Convert nodeMap to sentences array (for Claude processing)
 * 
 * Creates a "pseudo-sentences" array that Claude can work with,
 * plus _hierarchyMeta for context reconstruction.
 * 
 * @param {Map<string, Node>} nodeMap - All nodes
 * @param {string} rootId - Root node ID
 * @param {number} maxDepth - Hierarchy depth
 * @returns {Array<{id: string, content: string, emotions: Object, isDirty: boolean}> & {_hierarchyMeta: Object}}
 * 
 * @example
 * const sentences = nodeMapToSentenceFormat(nodeMap, 'root', 4);
 * // sentences[0] = {id: 's1', content: '...', emotions: {...}, isDirty: false}
 * // sentences._hierarchyMeta = {rootTitle: '...', maxLevel: 3, nodes: [...], ...}
 */
export function nodeMapToSentenceFormat(nodeMap, rootId, maxDepth) {
  console.log('[adapter] Converting nodeMap to sentence format');

  const root = nodeMap.get(rootId);
  if (!root) {
    throw new Error('Root node not found');
  }

  // Extract content nodes in document order
  const contentIds = getContentNodeIdsInDocumentOrder(nodeMap, rootId);
  const contentNodes = contentIds
    .map((id) => nodeMap.get(id))
    .filter(Boolean)
    .filter(isContentNode);

  // Build sentences array
  const sentences = [];
  for (const node of contentNodes) {
    sentences.push({
      id: node.id,
      content: node.content,
      emotions: node.emotion?.profile || {},
      isDirty: node.metadata.isDirty,
    });
  }

  // Build hierarchy metadata for context
  const hierarchyMeta = {
    rootTitle: root.content,
    maxLevel: maxDepth - 1,
    nodes: Array.from(nodeMap.values())
      .filter((n) => n.id !== rootId && isGroupNode(n))
      .map((n) => ({
        id: n.id,
        type: n.type,
        level: n.hierarchy.level,
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

  console.log('[adapter] Converted:', {
    sentences: sentences.length,
    dirtyNodes: hierarchyMeta.dirtyNodeIds.length,
    dirtySentences: hierarchyMeta.dirtySentenceIds.length,
  });

  return sentences;
}

/**
 * Apply restructuring result back to nodeMap
 * 
 * Replaces the root-level hierarchy with new structure.
 * Preserves all content nodes, only updates grouping.
 * 
 * @param {Map<string, Node>} nodeMap - Current state
 * @param {string} rootId - Root node ID
 * @param {Array<{rootNodeId: string, newNodes: Array}>} restructuredSubtrees - From Claude
 * @param {string | null} newRootTitle - Updated root title (optional)
 * @param {Object | null} newRootEmotions - Updated root emotions (optional)
 * @param {number} maxDepth - Max hierarchy depth
 * @returns {Map<string, Node>} - Updated nodeMap
 * 
 * @example
 * const updated = applyClaudeRestructureToNodeMap(
 *   nodeMap,
 *   'root',
 *   [{rootNodeId: 'root', newNodes: [...]}],
 *   null,
 *   {interest: 50, joy: 60, ...},
 *   4
 * );
 */
export function applyClaudeRestructureToNodeMap(
  nodeMap,
  rootId,
  restructuredSubtrees,
  newRootTitle,
  newRootEmotions,
  maxDepth
) {
  const updated = new Map(nodeMap);
  const contentLevel = maxDepth - 1;
  
  // No level conversion needed - Claude now returns app levels!
  
  // 1) Delete old groups, keep root + content
  for (const [id, node] of updated.entries()) {
    if (id !== rootId && node && isGroupNode(node)) {
      updated.delete(id);
    }
  }
  
  // 2) Add new groups directly with app levels
  const rootSubtree = restructuredSubtrees.find(s => s.rootNodeId === rootId) 
    ?? restructuredSubtrees[0];
  
  for (const nodeData of rootSubtree.newNodes) {
    const group = createGroupNode(
      nodeData.id,
      nodeData.title,
      nodeData.level, // Already app level!
      nodeData.level === 1 ? rootId : null, // Will be set below
      [...new Set(nodeData.childIds || [])],
      { metadata: { isDirty: false, createdAt: new Date().toISOString(), version: 1 } }
    );
    
    const ef = buildEmotionField(nodeData.emotions);
    if (ef) group.emotion = ef;
    
    updated.set(nodeData.id, group);
  }
  
  // 3) Fix parent pointers for groups
  const parentMap = new Map();
  for (const nodeData of rootSubtree.newNodes) {
    for (const childId of nodeData.childIds) {
      parentMap.set(childId, nodeData.id);
    }
  }
  
  for (const [id, node] of updated.entries()) {
    if (isGroupNode(node)) {
      const newParentId = parentMap.get(id) || rootId;
      if (node.hierarchy.parentId !== newParentId) {
        const patched = cloneNode(node);
        patched.hierarchy.parentId = newParentId;
        updated.set(id, patched);
      }
    }
  }
  
  // 4) Reparent content nodes to level-1 groups
  const level1Groups = rootSubtree.newNodes.filter(n => n.level === 1);
  for (const group of level1Groups) {
    for (const sentenceId of group.childIds) {
      const content = updated.get(sentenceId);
      if (content && isContentNode(content)) {
        const patched = cloneNode(content);
        patched.hierarchy.parentId = group.id;
        patched.hierarchy.level = contentLevel;
        updated.set(sentenceId, patched);
      }
    }
  }
  
  // 5) Update root
  const root = updated.get(rootId);
  if (root) {
    const patched = cloneNode(root);
    patched.hierarchy.childIds = rootSubtree.newNodes
      .filter(n => n.level === Math.max(...rootSubtree.newNodes.map(x => x.level)))
      .map(n => n.id);
    
    if (newRootTitle) patched.content = newRootTitle;
    if (newRootEmotions) {
      patched.emotion = {
        profile: newRootEmotions,
        dominantEmotion: 'interest',
        source: 'ai',
        timestamp: new Date().toISOString(),
      };
    }
    
    updated.set(rootId, patched);
  }
  
  return updated;
}

/**
 * Apply emotion evaluation to content nodes
 * 
 * Updates all content nodes with their evaluated emotions.
 * Clears old emotions before applying (prevents carryover).
 * 
 * @param {Map<string, Node>} nodeMap
 * @param {Array<{id: string, emotions: Object}>} emotionData - From emotion evaluator
 * @returns {Map<string, Node>} - Updated nodeMap
 */
export function applyEmotionsToNodeMap(nodeMap, emotionData) {
  console.log('[adapter] Applying emotions to nodeMap');

  const updated = new Map(nodeMap);
  const emotionMap = new Map();

  // Build emotion map
  for (const item of emotionData) {
    emotionMap.set(item.id, item.emotions);
  }

  // Apply emotions to nodes
  for (const [id, node] of updated.entries()) {
    if (!isContentNode(node)) continue;

    if (emotionMap.has(id)) {
      const emotions = emotionMap.get(id);
      const updatedNode = cloneNode(node);

      // Find dominant emotion
      const entries = Object.entries(emotions).sort((a, b) => b[1] - a[1]);
      const [dominantKey, dominantValue] = entries[0] || ['interest', 0];

      updatedNode.emotion = {
        profile: emotions,
        dominantEmotion: dominantKey,
        dominantIntensity: dominantValue,
        source: 'ai',
        timestamp: new Date().toISOString(),
      };

      updated.set(id, updatedNode);
    }
  }

  console.log(`[adapter] ✓ Applied emotions to ${emotionData.length} nodes`);
  return updated;
}

export default {
  nodeMapToSentenceFormat,
  applyClaudeRestructureToNodeMap,
  applyEmotionsToNodeMap,
};