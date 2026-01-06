/**
 * Adapter between node-based system and existing Claude service
 * Converts nodeMap to sentence-like format for Claude integration
 */

import { isContentNode, isGroupNode, createGroupNode, cloneNode } from '../types/node';
import { v4 as uuidv4 } from 'uuid';

function getContentIdsInDocumentOrder(nodeMap, rootId) {
  const root = nodeMap.get(rootId);
  if (!root) return [];

  const out = [];
  const queue = [...root.hierarchy.childIds];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    if (isContentNode(node)) {
      out.push(nodeId);
      continue;
    }

    if (isGroupNode(node)) {
      queue.unshift(...node.hierarchy.childIds);
    }
  }

  return out;
}


/**
 * Convert nodeMap to sentences array format for Claude service
 * Creates a pseudo-sentences array with _hierarchyMeta
 *
 * @param {Map<string, Node>} nodeMap - Current node map
 * @param {string} rootId - Root node ID
 * @param {number} maxDepth - Hierarchy depth
 * @returns {Array} Sentences-like array with _hierarchyMeta
 */
export function nodeMapToSentenceFormat(nodeMap, rootId, maxDepth) {
  console.log('[Adapter] Converting nodeMap to sentence format');

  const root = nodeMap.get(rootId);
  if (!root) throw new Error('Root node not found');

  // Convert app level to Claude level
  const toClaudeLevel = (appLevel) => maxDepth - appLevel;

  // Extract content nodes in document order
  const contentIds = getContentIdsInDocumentOrder(nodeMap, rootId);
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
 * Convert Claude's response back to nodeMap updates
 *
 * @param {Map<string, Node>} nodeMap - Current node map
 * @param {string} rootId - Root node ID
 * @param {Array} restructuredSubtrees - From Claude
 * @param {string} newRootTitle - From Claude
 * @param {Object} newRootEmotions - From Claude
 * @returns {Map<string, Node>} Updated nodeMap
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
    const dominantEntry = entries.sort((a, b) => b[1] - a[1])[0];
    return {
      profile,
      dominantEmotion: dominantEntry ? dominantEntry[0] : 'interest',
      dominantIntensity: dominantEntry ? dominantEntry[1] : 0,
      source: 'ai',
      timestamp: new Date().toISOString(),
    };
  };

  // STEP 0: SAVE OLD CONTENT NODES BEFORE DELETION
  const oldContentNodes = Array.from(updated.values())
    .filter(n => isContentNode(n))
    .map(n => ({ id: n.id, content: n.content, level: n.hierarchy.level }));

  console.log(`[Adapter] Preserving ${oldContentNodes.length} content nodes before restructure`);

  // STEP 1: DELETE OLD GROUPS (but not content!)
  const groupNodesToDelete = Array.from(updated.values())
    .filter((n) => isGroupNode(n))
    .map((n) => n.id);

  groupNodesToDelete.forEach((id) => {
    updated.delete(id);
    console.log(`[Adapter] Deleted group node: ${id.substring(0, 8)}`);
  });

  // STEP 2: VALIDATE CLAUDE OUTPUT
  if (restructuredSubtrees && restructuredSubtrees.length > 0) {
    // First pass: Collect ALL node IDs that Claude created
    const allClaudeNodeIds = new Set();
    const nodesByIdFromClaude = new Map();

    for (const subtree of restructuredSubtrees) {
      const nodes = Array.isArray(subtree.newNodes) ? subtree.newNodes : [];
      nodes.forEach((n) => {
        allClaudeNodeIds.add(n.id);
        nodesByIdFromClaude.set(n.id, n);
      });
    }

    // Validate: Every node's children must exist in Claude's output
    // OR be existing content nodes
    const contentNodeIds = new Set(
      Array.from(updated.values())
        .filter(isContentNode)
        .map((n) => n.id)
    );

    let hasInvalidReferences = false;

    for (const claudeNode of nodesByIdFromClaude.values()) {
      for (const childId of claudeNode.childIds || []) {
        const isClaudeNode = allClaudeNodeIds.has(childId);
        const isContentNode = contentNodeIds.has(childId);

        if (!isClaudeNode && !isContentNode) {
          console.error(
            `[Adapter] ❌ INVALID: Node ${claudeNode.id} references missing child ${childId}`
          );
          hasInvalidReferences = true;
        }
      }
    }

    if (hasInvalidReferences) {
      console.error('[Adapter] Claude output contains invalid references! Aborting restructure.');
      console.log('[Adapter] Keeping old hierarchy intact.');
      return updated;
    }

    // STEP 3: REBUILD HIERARCHY
    const rootChildGroupIds = [];
    const parentById = new Map();

    // Build parent map (only for valid relationships)
    for (const subtree of restructuredSubtrees) {
      const nodes = Array.isArray(subtree.newNodes) ? subtree.newNodes : [];
      const ids = new Set(nodes.map((n) => n.id));

      for (const node of nodes) {
        for (const childId of node.childIds || []) {
          if (ids.has(childId)) {
            parentById.set(childId, node.id);
            console.log(
              `[Adapter] Parent mapping: ${childId.substring(0, 8)} → ${node.id.substring(0, 8)}`
            );
          }
        }
      }
    }

    // Create group nodes with validated parents
    for (const subtree of restructuredSubtrees) {
      const nodes = Array.isArray(subtree.newNodes) ? subtree.newNodes : [];
      if (nodes.length === 0) continue;

      const subtreeTopLevel = Math.max(...nodes.map((n) => n.level));

      // Track which nodes are top-level
      const topLevelNodeIds = [];
      for (const node of nodes) {
        if (node.level === subtreeTopLevel) {
          topLevelNodeIds.push(node.id);
          rootChildGroupIds.push(node.id);
        }
      }

      console.log(
        `[Adapter] Top-level nodes in subtree: ${topLevelNodeIds.map((id) => id.substring(0, 8)).join(', ')}`
      );

      // Create each group node
      for (const node of nodes) {
        const parentId = parentById.get(node.id) ?? rootId;
        const appLevel = toAppLevel(node.level);

        // ✅ VALIDATE parent exists
        if (parentId !== rootId && !allClaudeNodeIds.has(parentId)) {
          console.warn(
            `[Adapter] ⚠️ Parent ${parentId} not in Claude output, using root as fallback`
          );
        }

        console.log(
          `[Adapter] Creating group: ${node.id.substring(0, 8)}, level ${appLevel}, parent ${parentId === rootId ? 'root' : parentId.substring(0, 8)}`
        );

        const group = createGroupNode(
          node.id,
          node.title,
          appLevel,
          parentId,
          [...(node.childIds || [])],
          { metadata: { isDirty: false } }
        );

        const emotionField = buildEmotionField(node.emotions);
        if (emotionField) group.emotion = emotionField;

        updated.set(node.id, group);
      }

      // Update content nodes
      nodes
        .filter((n) => n.level === 2)
        .forEach((level2) => {
          for (const sentenceId of level2.childIds || []) {
            const contentNode = updated.get(sentenceId);
            if (!contentNode || !isContentNode(contentNode)) continue;

            const updatedContent = cloneNode(contentNode);
            updatedContent.hierarchy.parentId = level2.id;
            updatedContent.hierarchy.level = contentLevel;
            updated.set(sentenceId, updatedContent);

            console.log(
              `[Adapter] Updated content node ${sentenceId.substring(0, 8)} parent → ${level2.id.substring(0, 8)}`
            );
          }
        });
    }

    // STEP 4: UPDATE ROOT
    const root = updated.get(rootId);
    if (root) {
      const updatedRoot = cloneNode(root);
      updatedRoot.content = newRootTitle || root.content;
      updatedRoot.hierarchy.childIds = [...new Set(rootChildGroupIds)]; // dedupe

      const rootEmotionField = buildEmotionField(newRootEmotions);
      if (rootEmotionField) updatedRoot.emotion = rootEmotionField;

      updated.set(rootId, updatedRoot);
      console.log(
        `[Adapter] Updated root with ${rootChildGroupIds.length} children`
      );
    }

    // STEP 5: CLEANUP ORPHANS
    const allValidParentIds = new Set([rootId, ...allClaudeNodeIds]);
    const orphanIds = [];

    for (const [nodeId, node] of updated.entries()) {
      if (
        node.hierarchy.parentId &&
        !allValidParentIds.has(node.hierarchy.parentId)
      ) {
        orphanIds.push(nodeId);
        console.error(
          `[Adapter] ❌ Orphaned node detected: ${nodeId} parent: ${node.hierarchy.parentId}`
        );
      }
    }

    if (orphanIds.length > 0) {
      console.error(`[Adapter] Found ${orphanIds.length} orphaned nodes, removing...`);
      orphanIds.forEach((id) => {
        updated.delete(id);
        console.log(`[Adapter] Deleted orphaned node: ${id.substring(0, 8)}`);
      });
    }
  }

  console.log('[Adapter] ✅ Restructure complete, nodeMap now has', updated.size, 'nodes');

  // STEP 5B: EXPLICIT ORPHAN CLEANUP
  const reachableNodeIds = new Set([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = updated.get(nodeId);
    if (!node) continue;

    for (const childId of node.hierarchy.childIds) {
      if (!reachableNodeIds.has(childId)) {
        reachableNodeIds.add(childId);
        queue.push(childId);
      }
    }
  }

  // Remove all unreachable nodes
  const orphanedIds = [];
  for (const [nodeId, node] of updated.entries()) {
    if (!reachableNodeIds.has(nodeId) && nodeId !== rootId) {
      orphanedIds.push(nodeId);
      updated.delete(nodeId);
      console.log(`[Adapter] 🗑️ Deleted orphaned node: ${nodeId.substring(0, 8)}`);
    }
  }

  if (orphanedIds.length > 0) {
    console.warn(`[Adapter] ⚠️ Deleted ${orphanedIds.length} orphaned nodes`);
  }

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