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
 * Apply restructuring result back to nodeMap - SURGICAL APPROACH
 * 
 * Only modifies nodes within the dirty subtrees.
 * Preserves all other hierarchy structure.
 * 
 * @param {Map<string, Node>} nodeMap - Current state
 * @param {string} rootId - Root node ID
 * @param {Array<{rootNodeId: string, newNodes: Array}>} restructuredSubtrees - From Claude
 * @param {string | null} newRootTitle - Updated root title (optional)
 * @param {Object | null} newRootEmotions - Updated root emotions (optional)
 * @param {number} maxDepth - Max hierarchy depth
 * @returns {Map<string, Node>} - Updated nodeMap
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
  
  console.log('[adapter] Applying Claude restructure (SURGICAL MODE)');
  console.log('[adapter]   Processing', restructuredSubtrees.length, 'dirty subtrees');
  
  // For EACH dirty subtree
  for (const subtree of restructuredSubtrees) {
    const dirtyRootId = subtree.rootNodeId;
    
    console.log(`[adapter] Processing subtree: ${dirtyRootId}`);
    
    // Find the dirty root node in current nodeMap
    const dirtyRootNode = updated.get(dirtyRootId);
    if (!dirtyRootNode) {
      console.warn(`[adapter] Warning: dirty root ${dirtyRootId} not found in nodeMap`);
      continue;
    }
    
    // STEP 1: Find all nodes WITHIN this dirty subtree (descendants of dirtyRoot)
    const descendantsOfDirtyRoot = new Set();
    const collectDescendants = (nodeId) => {
      const node = updated.get(nodeId);
      if (!node) return;
      
      for (const childId of node.hierarchy.childIds || []) {
        if (!descendantsOfDirtyRoot.has(childId)) {
          descendantsOfDirtyRoot.add(childId);
          if (isGroupNode(updated.get(childId))) {
            collectDescendants(childId);
          }
        }
      }
    };
    collectDescendants(dirtyRootId);
    
    console.log(`[adapter]   Found ${descendantsOfDirtyRoot.size} descendants to replace`);
    
    // STEP 2: Delete ONLY nodes within the dirty subtree
    // (Keep content nodes - they'll be reparented below)
    for (const descendantId of descendantsOfDirtyRoot) {
      const node = updated.get(descendantId);
      if (node && isGroupNode(node)) {
        updated.delete(descendantId);
      }
    }
    
    // STEP 3: Add new group nodes from restructure
    const newNodeIds = new Set();
    for (const nodeData of subtree.newNodes) {
      newNodeIds.add(nodeData.id);
      
      const group = createGroupNode(
        nodeData.id,
        nodeData.title || `Section ${newNodeIds.size}`, // Keep or use placeholder
        nodeData.level,
        null, // Will be set below based on hierarchy
        [...new Set(nodeData.childIds || [])],
        { metadata: { isDirty: false, createdAt: new Date().toISOString(), version: 1 } }
      );
      
      const ef = buildEmotionField(nodeData.emotions);
      if (ef) group.emotion = ef;
      
      updated.set(nodeData.id, group);
      console.log(`[adapter]   Added node: ${nodeData.id.substring(0, 8)} level=${nodeData.level} "${nodeData.title}"`);
    }
    
    // STEP 4: Build parent map for new nodes
    const parentMap = new Map();
    for (const nodeData of subtree.newNodes) {
      for (const childId of nodeData.childIds || []) {
        parentMap.set(childId, nodeData.id);
      }
    }
    
    // STEP 5: Fix parent pointers for new group nodes
    for (const nodeData of subtree.newNodes) {
      const node = updated.get(nodeData.id);
      if (node) {
        // Parent is either another node in the subtree, or the dirtyRoot's parent
        const parentInSubtree = parentMap.get(nodeData.id);
        const parentId = parentInSubtree || dirtyRootNode.hierarchy.parentId;
        
        const patched = cloneNode(node);
        patched.hierarchy.parentId = parentId;
        updated.set(nodeData.id, patched);
      }
    }
    
    // STEP 6: Reparent content nodes to new groups
    const level1Groups = subtree.newNodes.filter(n => n.level === 1);
    const sentenceToGroup = new Map();
    for (const group of level1Groups) {
      for (const sentenceId of group.childIds || []) {
        sentenceToGroup.set(sentenceId, group.id);
      }
    }
    
    for (const [sentenceId, groupId] of sentenceToGroup) {
      const contentNode = updated.get(sentenceId);
      if (contentNode && isContentNode(contentNode)) {
        const patched = cloneNode(contentNode);
        patched.hierarchy.parentId = groupId;
        patched.hierarchy.level = contentLevel;
        updated.set(sentenceId, patched);
      }
    }
    
    // STEP 7: Update the dirty root's parent to point to new top-level nodes
    const topLevelNewNodes = subtree.newNodes.filter(
      n => n.level === Math.max(...subtree.newNodes.map(x => x.level))
    );
    
    const parentOfDirtyRoot = updated.get(dirtyRootNode.hierarchy.parentId);
    if (parentOfDirtyRoot) {
      const patched = cloneNode(parentOfDirtyRoot);
      
      // Replace dirtyRootId with new top-level node IDs in parent's childIds
      const idx = patched.hierarchy.childIds.indexOf(dirtyRootId);
      if (idx !== -1) {
        patched.hierarchy.childIds = [
          ...patched.hierarchy.childIds.slice(0, idx),
          ...topLevelNewNodes.map(n => n.id),
          ...patched.hierarchy.childIds.slice(idx + 1)
        ];
        updated.set(parentOfDirtyRoot.id, patched);
        console.log(`[adapter]   Updated parent ${parentOfDirtyRoot.id.substring(0, 8)} to reference new nodes`);
      }
    } else if (dirtyRootId === rootId) {
      // dirtyRoot IS the root - update root's children
      const root = updated.get(rootId);
      if (root) {
        const patched = cloneNode(root);
        patched.hierarchy.childIds = topLevelNewNodes.map(n => n.id);
        updated.set(rootId, patched);
      }
    }
    
    // STEP 8: Fix orphaned content nodes (safety net)
    const orphanedContent = [];
    for (const [id, node] of updated.entries()) {
      if (isContentNode(node)) {
        const parentExists = updated.has(node.hierarchy.parentId);
        if (!parentExists) {
          orphanedContent.push(id);
        }
      }
    }
    
    if (orphanedContent.length > 0) {
      console.warn(`[adapter] Reconnecting ${orphanedContent.length} orphaned content nodes`);
      const fallbackGroup = level1Groups[0];
      if (fallbackGroup) {
        for (const orphanId of orphanedContent) {
          const patched = cloneNode(updated.get(orphanId));
          patched.hierarchy.parentId = fallbackGroup.id;
          patched.hierarchy.level = contentLevel;
          updated.set(orphanId, patched);
          
          if (!fallbackGroup.hierarchy.childIds.includes(orphanId)) {
            fallbackGroup.hierarchy.childIds.push(orphanId);
          }
        }
      }
    }
  }
  
  // Update root if needed
  if (newRootTitle || newRootEmotions) {
    const root = updated.get(rootId);
    if (root) {
      const patched = cloneNode(root);
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
  }
  
  console.log('[adapter] ✓ Surgical restructure complete');
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