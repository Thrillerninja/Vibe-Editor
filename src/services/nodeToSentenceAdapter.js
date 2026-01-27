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

  const parentChildChanges = {
    nodesToRemove: new Set(),
    movedChildren: new Map(),
    parentsNeedingUpdate: new Set()
  };

  // ===== PROCESS EACH DIRTY SUBTREE =====
  for (const subtree of restructuredSubtrees) {
    const dirtyRootId = subtree.rootNodeId;

    console.log(`[adapter] Processing subtree: ${dirtyRootId}`);

    const dirtyRootNode = updated.get(dirtyRootId);
    if (!dirtyRootNode) {
      console.warn(`[adapter] Warning: dirty root ${dirtyRootId} not found in nodeMap`);
      continue;
    }

    // ===== STEP 1: IDENTIFY ALL DESCENDANTS TO DELETE =====
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

    // ===== STEP 2: MARK OLD NODES FOR DELETION =====
    for (const descendantId of descendantsOfDirtyRoot) {
      const node = updated.get(descendantId);
      if (node && isGroupNode(node)) {
        parentChildChanges.nodesToRemove.add(descendantId);
        console.log(`[adapter]   Marking for deletion: ${descendantId}`);
      }
    }

    // ===== STEP 3: ADD NEW GROUP NODES =====
    const newNodeIds = new Set();
    for (const nodeData of subtree.newNodes) {
      newNodeIds.add(nodeData.id);

      const group = createGroupNode(
        nodeData.id,
        nodeData.title || `Section ${newNodeIds.size}`,
        nodeData.level,
        null,
        [...new Set(nodeData.childIds || [])],
        { metadata: { isDirty: false, createdAt: new Date().toISOString(), version: 1 } }
      );

      const ef = buildEmotionField(nodeData.emotions);
      if (ef) group.emotion = ef;

      updated.set(nodeData.id, group);
      console.log(`[adapter]   Added node: ${nodeData.id.substring(0, 8)} level=${nodeData.level} "${nodeData.title}"`);

      for (const childId of nodeData.childIds || []) {
        const existingChild = updated.get(childId);
        if (existingChild) {
          const oldParentId = existingChild.hierarchy.parentId;
          if (oldParentId && oldParentId !== nodeData.id) {
            parentChildChanges.movedChildren.set(childId, {
              oldParentId,
              newParentId: nodeData.id
            });
            parentChildChanges.parentsNeedingUpdate.add(oldParentId);
          }
        }
      }
    }

    // ===== STEP 4: BUILD PARENT MAP FOR NEW NODES =====
    const parentMap = new Map();
    for (const nodeData of subtree.newNodes) {
      for (const childId of nodeData.childIds || []) {
        parentMap.set(childId, nodeData.id);
      }
    }

    // ===== STEP 5: SET PARENT POINTERS FOR NEW GROUP NODES =====
    for (const nodeData of subtree.newNodes) {
      const node = updated.get(nodeData.id);
      if (node) {
        const parentInSubtree = parentMap.get(nodeData.id);
        const parentId = parentInSubtree || dirtyRootNode.hierarchy.parentId;

        const patched = cloneNode(node);
        patched.hierarchy.parentId = parentId;
        updated.set(nodeData.id, patched);
      }
    }

    // ===== STEP 6: REPARENT CONTENT NODES TO NEW GROUPS =====
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
        const oldParentId = contentNode.hierarchy.parentId;

        const patched = cloneNode(contentNode);
        patched.hierarchy.parentId = groupId;
        patched.hierarchy.level = contentLevel;
        updated.set(sentenceId, patched);

        if (oldParentId && oldParentId !== groupId) {
          parentChildChanges.movedChildren.set(sentenceId, {
            oldParentId,
            newParentId: groupId
          });
          parentChildChanges.parentsNeedingUpdate.add(oldParentId);
        }
      }
    }

    // ===== STEP 7: UPDATE DIRTY ROOT'S PARENT =====
    const topLevelNewNodes = subtree.newNodes.filter(
      n => n.level === Math.max(...subtree.newNodes.map(x => x.level))
    );

    const parentOfDirtyRoot = updated.get(dirtyRootNode.hierarchy.parentId);
    if (parentOfDirtyRoot) {
      const patched = cloneNode(parentOfDirtyRoot);

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
      const root = updated.get(rootId);
      if (root) {
        const patched = cloneNode(root);
        patched.hierarchy.childIds = topLevelNewNodes.map(n => n.id);
        updated.set(rootId, patched);
      }
    }
  } // ← CLOSING BRACE FOR for (const subtree of restructuredSubtrees)

  // ===== PHASE 2: CLEANUP ALL PARENT-CHILD RELATIONSHIPS =====
  console.log('[adapter] ✓ Rebuilding all parent childIds from actual parent-child relationships...');

  const correctChildIds = new Map();

  for (const [nodeId, node] of updated.entries()) {
    if (isGroupNode(node)) {
      correctChildIds.set(nodeId, []);
    }
  }

  // Iterate through ALL nodes and collect their children
  for (const [nodeId, node] of updated.entries()) {
    const parentId = node.hierarchy?.parentId;

    // Root's children have parentId = 'root'
    // Other nodes have parentId pointing to their parent
    if (parentId && updated.has(parentId)) {
      if (!correctChildIds.has(parentId)) {
        correctChildIds.set(parentId, []);
      }
      correctChildIds.get(parentId).push(nodeId);
    } else if (!parentId && nodeId !== rootId) {
      // Node has no parent - add to root
      console.warn(`[adapter] ⚠️ Node ${nodeId} has no parent - adding to root`);
      if (!correctChildIds.has(rootId)) {
        correctChildIds.set(rootId, []);
      }
      correctChildIds.get(rootId).push(nodeId);

      // Fix its parentId
      const orphanNode = updated.get(nodeId);
      if (orphanNode) {
        const patched = cloneNode(orphanNode);
        patched.hierarchy.parentId = rootId;
        updated.set(nodeId, patched);
      }
    }
  }

  let childIdsFixed = 0;
  for (const [parentId, correctChildren] of correctChildIds.entries()) {
    const parent = updated.get(parentId);
    if (!parent) continue;

    const oldChildIds = parent.hierarchy.childIds || [];
    const oldSet = new Set(oldChildIds);
    const newSet = new Set(correctChildren);

    const added = correctChildren.filter(id => !oldSet.has(id));
    const removed = oldChildIds.filter(id => !newSet.has(id));

    if (added.length > 0 || removed.length > 0) {
      console.log(`[adapter]   Fixing ${parentId.substring(0, 8)}: +${added.length} -${removed.length}`);
      if (added.length > 0) {
        console.log(`[adapter]     Added: ${added.map(id => id.substring(0, 8)).join(', ')}`);
      }
      if (removed.length > 0) {
        console.log(`[adapter]     Removed: ${removed.map(id => id.substring(0, 8)).join(', ')}`);
      }

      const patched = cloneNode(parent);
      patched.hierarchy.childIds = correctChildren;
      updated.set(parentId, patched);
      childIdsFixed++;
    }
  }

  console.log(`[adapter]   Fixed childIds for ${childIdsFixed} parent nodes`);

  // ===== DELETE ONLY EXPLICITLY MARKED NODES =====
  console.log('[adapter] Deleting explicitly marked nodes...');

  let deletedCount = 0;
  for (const nodeId of parentChildChanges.nodesToRemove) {
    if (updated.has(nodeId)) {
      updated.delete(nodeId);
      deletedCount++;
      console.log(`[adapter]   Deleted marked node: ${nodeId.substring(0, 8)}`);
    }
  }

  console.log(`[adapter]   Deleted ${deletedCount} marked nodes`);

  // ===== CLEANUP: Remove empty groups (but NOT root) =====
  console.log('[adapter] Removing empty group nodes...');

  let emptyDeleted = true;
  let iterations = 0;
  const maxIterations = 5;

  while (emptyDeleted && iterations < maxIterations) {
    emptyDeleted = false;
    iterations++;

    for (const [nodeId, node] of updated.entries()) {
      if (nodeId === rootId) continue; // Never delete root
      if (!isGroupNode(node)) continue;

      const hasChildren = (node.hierarchy.childIds || []).length > 0;

      if (!hasChildren) {
        console.warn(`[adapter]   Deleting empty group: ${nodeId.substring(0, 8)}`);

        // Remove from parent
        const parent = updated.get(node.hierarchy.parentId);
        if (parent && isGroupNode(parent)) {
          const patched = cloneNode(parent);
          patched.hierarchy.childIds = patched.hierarchy.childIds.filter(id => id !== nodeId);
          updated.set(node.hierarchy.parentId, patched);
        }

        updated.delete(nodeId);
        emptyDeleted = true;
      }
    }
  }

  console.log('[adapter] Empty node cleanup complete');

  // ===== FINAL VALIDATION =====
  console.log('[adapter] Final consistency validation...');

  const validationErrors = [];

  // Check 1: Every non-root node has a parent
  for (const [nodeId, node] of updated.entries()) {
    if (nodeId === rootId) continue;

    const parentId = node.hierarchy?.parentId;
    if (!parentId) {
      validationErrors.push(`Node ${nodeId} has no parentId`);
    } else if (!updated.has(parentId)) {
      validationErrors.push(`Node ${nodeId} references missing parent ${parentId}`);
    }
  }

  // Check 2: Every child is in parent's childIds
  for (const [nodeId, node] of updated.entries()) {
    if (!isGroupNode(node)) continue;

    const childIds = node.hierarchy.childIds || [];
    for (const childId of childIds) {
      const child = updated.get(childId);
      if (!child) {
        validationErrors.push(`Parent ${nodeId} references missing child ${childId}`);
      } else if (child.hierarchy?.parentId !== nodeId) {
        validationErrors.push(`Parent-child mismatch: ${nodeId} → ${childId}, but child's parent is ${child.hierarchy?.parentId}`);
      }
    }
  }

  // Check 3: Every parent reference is reciprocated
  for (const [nodeId, node] of updated.entries()) {
    const parentId = node.hierarchy?.parentId;
    if (!parentId || parentId === rootId) continue;

    const parent = updated.get(parentId);
    if (!parent) {
      validationErrors.push(`Node ${nodeId} references missing parent ${parentId}`);
    } else {
      const parentChildIds = parent.hierarchy.childIds || [];
      if (!parentChildIds.includes(nodeId)) {
        validationErrors.push(`Node ${nodeId} has parentId=${parentId}, but parent's childIds doesn't include ${nodeId}`);
      }
    }
  }

  if (validationErrors.length > 0) {
    console.error('[adapter] ✗ Validation FAILED:');
    validationErrors.slice(0, 10).forEach(e => {
      console.error(`[adapter]   ✗ ${e}`);
    });
    if (validationErrors.length > 10) {
      console.error(`[adapter]   ... and ${validationErrors.length - 10} more errors`);
    }
    throw new Error(`Node hierarchy validation failed: ${validationErrors[0]}`);
  }

  console.log('[adapter] ✓ All parent-child relationships consistent');

  // ===== UPDATE ROOT IF NEEDED =====
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
  console.log('[adapter] Final state:', {
    totalNodes: updated.size,
    groupNodes: Array.from(updated.values()).filter(isGroupNode).length,
    contentNodes: Array.from(updated.values()).filter(isContentNode).length
  });

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