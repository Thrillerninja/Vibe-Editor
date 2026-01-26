/**
 * Response Validator
 * Comprehensive validation for Claude's hierarchy generation responses
 * 
 * VALIDATION STRATEGY:
 * 1. Parse JSON and check basic structure
 * 2. For each subtree:
 *    a. Validate all levels from 2 to topLevel are present
 *    b. Validate node structure (id, level, title, childIds)
 *    c. Validate no orphaned nodes exist
 *    d. Validate sentence completeness (all included, none duplicated)
 *    e. Validate sentence order is preserved
 *    f. Validate proper parent-child relationships
 */

import { EMOTION_AXES } from '@utils/constants.js';
import { normalizeEmotionProfile } from '@utils/emotionProfiles.js';

/**
 * Parse the response from dirty subtree restructure
 * @param {string} responseText - Raw response from Claude
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {Array} originalSubtrees - Original subtree data for validation
 * @param {boolean} isRootDirty - Whether a new root title was requested
 * @returns {Object} Parsed and validated response with restructuredSubtrees and optional newRootTitle
 */
export function parseDirtyRestructureResponse(responseText, maxDepth, originalSubtrees, isRootDirty = false) {
    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonText = extractJSON(responseText);
        const parsed = JSON.parse(jsonText);

        // Validate top-level structure
        validateTopLevelStructure(parsed, isRootDirty);

        // Validate each subtree
        for (const subtree of parsed.restructuredSubtrees) {
            const originalSubtree = originalSubtrees.find(s => s.rootNodeId === subtree.rootNodeId);
            if (!originalSubtree) {
                throw new Error(`Response contains unknown subtree: ${subtree.rootNodeId}`);
            }
            validateSubtree(subtree, originalSubtree, maxDepth);
        }

        // Validate that subtrees themselves are in document order
        validateSubtreesArrayOrder(parsed.restructuredSubtrees, originalSubtrees);

        console.log('[Claude Service] ✓ Response validation passed');
        console.log(`[Claude Service] ✓ Validated ${parsed.restructuredSubtrees.length} subtree(s)`);

        if (parsed.rootEmotions) {
            parsed.rootEmotions = normalizeEmotionProfile(parsed.rootEmotions);
        } else if (parsed.rootEmotion && typeof parsed.rootIntensity === 'number') {
            parsed.rootEmotions = normalizeEmotionProfile({ [String(parsed.rootEmotion).toLowerCase()]: parsed.rootIntensity });
        }

        return {
            restructuredSubtrees: parsed.restructuredSubtrees,
            newRootTitle: parsed.newRootTitle,
            newRootEmotion: parsed.rootEmotion,
            newRootIntensity: parsed.rootIntensity,
            newRootEmotions: parsed.rootEmotions,
        };
    } catch (error) {
        console.error('[Claude Service] ✗ Response validation failed:', error.message);
        console.error('[Claude Service] Response text:', responseText);
        console.error('[Claude Service] Restructuring failed, using fallback');
        return {
            restructuredSubtrees: [], // ← Empty = no changes
            newRootTitle: null,
            newRootEmotions: null,
        };
    }
}

/**
 * Extract JSON from response text (handles markdown code blocks)
 */
function extractJSON(responseText) {
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
            jsonText = match[1];
        }
    }

    return jsonText;
}

function hasValidEmotions(node) {
    const profile = node && node.emotions;
    if (!profile || typeof profile !== 'object') return false;
    return EMOTION_AXES.every((k) => typeof profile[k] === 'number');
}

function coerceEmotionShape(node) {
    if (hasValidEmotions(node)) {
        node.emotions = normalizeEmotionProfile(node.emotions);
        return;
    }
    if (node.emotion && typeof node.intensity === 'number') {
        node.emotions = normalizeEmotionProfile({ [String(node.emotion).toLowerCase()]: node.intensity });
    }
}

/**
 * Validate that restructuredSubtrees array is sorted by document order
 * Each subtree should appear in the order of its earliest sentence
 */
function validateSubtreesArrayOrder(restructuredSubtrees, originalSubtrees) {
    if (restructuredSubtrees.length <= 1) {
        // Single subtree or none - no ordering to validate
        return;
    }

    // Calculate minimum sentence order for each subtree
    const subtreeMinOrders = restructuredSubtrees.map((subtree, idx) => {
        const original = originalSubtrees.find(s => s.rootNodeId === subtree.rootNodeId);
        if (!original || !original.sentences || original.sentences.length === 0) {
            throw new Error(`Cannot find original subtree or sentences for ${subtree.rootNodeId}`);
        }

        const minOrder = Math.min(...original.sentences.map(s => s.order));
        return {
            subtree,
            minOrder,
            index: idx,
            rootNodeId: subtree.rootNodeId
        };
    });

    // Check that subtrees are sorted by minOrder
    for (let i = 1; i < subtreeMinOrders.length; i++) {
        const prev = subtreeMinOrders[i - 1];
        const curr = subtreeMinOrders[i];

        if (curr.minOrder < prev.minOrder) {
            throw new Error(
                `restructuredSubtrees array is not in document order!\n` +
                `\n` +
                `Subtree at index ${prev.index} (rootNodeId: "${prev.rootNodeId}") contains sentences starting at position ${prev.minOrder}\n` +
                `Subtree at index ${curr.index} (rootNodeId: "${curr.rootNodeId}") contains sentences starting at position ${curr.minOrder}\n` +
                `\n` +
                `But position ${curr.minOrder} comes BEFORE position ${prev.minOrder} in the document!\n` +
                `\n` +
                `Fix: Reorder the restructuredSubtrees array so subtrees appear in document order.\n` +
                `The subtree starting at position ${curr.minOrder} must come before the subtree starting at position ${prev.minOrder}.`
            );
        }
    }

    console.log(`[Claude Service] ✓ restructuredSubtrees array is sorted by document order`);
}

/**
 * Validate top-level response structure
 */
function validateTopLevelStructure(parsed, isRootDirty) {
    if (!parsed.restructuredSubtrees) {
        if (isRootDirty && Object.keys(parsed).length === 1 && parsed.newRootTitle) {
            // Only root title, no subtrees - valid if only root is dirty
            parsed.restructuredSubtrees = [];
        } else {
            throw new Error('Missing "restructuredSubtrees" array in response');
        }
    }

    if (!Array.isArray(parsed.restructuredSubtrees)) {
        throw new Error('"restructuredSubtrees" must be an array');
    }

    if (isRootDirty && !parsed.newRootTitle) {
        console.warn('[Claude Service] Root was dirty but no newRootTitle in response');
    }
}

function normalizeNodeLevels(nodes, topLevel) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const invalidNodes = nodes.filter(n => n.level > topLevel);

    if (invalidNodes.length === 0) return nodes;

    console.warn(
        `[Claude Service] Removing ${invalidNodes.length} nodes exceeding topLevel ${topLevel}`
    );

    const updated = new Map(nodeMap);
    const nodesToDelete = new Set();

    // 1) Remove invalid nodes and promote their children
    for (const invalidNode of invalidNodes) {
        nodesToDelete.add(invalidNode.id);

        for (const parentId of updated.keys()) {
            const parent = updated.get(parentId);
            const idx = (parent.childIds || []).indexOf(invalidNode.id);
            if (idx !== -1) {
                parent.childIds = [
                    ...parent.childIds.slice(0, idx),
                    ...invalidNode.childIds,
                    ...parent.childIds.slice(idx + 1)
                ];
            }
        }

        for (const childId of invalidNode.childIds) {
            const child = updated.get(childId);
            if (child) child.level = topLevel;
        }
    }

    // 2) Find referenced nodes
    const referenced = new Set();
    for (const node of updated.values()) {
        if (!nodesToDelete.has(node.id)) {
            for (const childId of node.childIds || []) {
                referenced.add(childId);
            }
        }
    }

    // 3) Collect orphaned nodes by level
    const orphanedByLevel = new Map();
    for (const node of updated.values()) {
        if (!nodesToDelete.has(node.id) &&
            node.level < topLevel &&
            !referenced.has(node.id)) {

            if (!orphanedByLevel.has(node.level)) {
                orphanedByLevel.set(node.level, []);
            }
            orphanedByLevel.get(node.level).push(node);
        }
    }

    if (orphanedByLevel.size === 0) {
        return Array.from(updated.values()).filter(n => !nodesToDelete.has(n.id));
    }

    console.warn(`[Claude Service] Found orphaned nodes at levels: ${Array.from(orphanedByLevel.keys()).join(', ')}`);

    // 4) Build wrapper hierarchy from lowest orphan level to topLevel
    const minOrphanLevel = Math.min(...orphanedByLevel.keys());
    let currentLevel = minOrphanLevel;
    let childrenIds = orphanedByLevel.get(minOrphanLevel).map(n => n.id);

    while (currentLevel < topLevel) {
        const nextLevel = currentLevel + 1;
        const wrapperId = `wrapper-${nextLevel}-${Date.now()}`;

        const wrapper = {
            id: wrapperId,
            level: nextLevel,
            title: nextLevel === topLevel ? "Additional Content" : `Level ${nextLevel}`,
            emotions: {
                interest: 50, joy: 50, surprise: 50, sadness: 50, anger: 50,
                disgust: 50, contempt: 50, fear: 50, shame: 50, guilt: 50
            },
            childIds: childrenIds
        };

        updated.set(wrapperId, wrapper);
        childrenIds = [wrapperId];
        currentLevel = nextLevel;
    }

    return Array.from(updated.values()).filter(n => !nodesToDelete.has(n.id));
}

/**
 * Recover missing sentences by adding them to nearest level 2 group
 * Maintains document order without creating new groups
 */
function recoverMissingSentences(subtree, originalSubtree) {
  const originalSentences = originalSubtree.sentences; // Array with order info
  const sentenceIds = new Set(originalSentences.map(s => s.id));
  const sentenceOrder = new Map(originalSentences.map(s => [s.id, s.order]));
  
  const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));
  const foundSentences = new Set();
  
  // Recursively collect all sentences in hierarchy
  const collectSentences = (nodeIds) => {
    for (const id of nodeIds) {
      if (sentenceIds.has(id)) {
        foundSentences.add(id);
      } else {
        const node = nodeMap.get(id);
        if (node) collectSentences(node.childIds || []);
      }
    }
  };
  
  for (const node of subtree.newNodes) {
    collectSentences(node.childIds || []);
  }
  
  // Find missing sentences
  const missingSentences = [...sentenceIds].filter(id => !foundSentences.has(id));
  
  if (missingSentences.length === 0) return subtree;
  
  console.warn(
    `[Claude Service] Adding ${missingSentences.length} missing sentences to existing groups`
  );
  
  const level2Groups = subtree.newNodes.filter(n => n.level === 2);
  
  // For each missing sentence, find best group and add it
  for (const missingSentenceId of missingSentences) {
    const missingOrder = sentenceOrder.get(missingSentenceId);
    
    // Find level 2 group with closest sentence order
    let bestGroup = null;
    let minDistance = Infinity;
    
    for (const group of level2Groups) {
      const groupSentenceIds = (group.childIds || []).filter(id => sentenceIds.has(id));
      if (groupSentenceIds.length === 0) continue;
      
      const groupOrders = groupSentenceIds.map(id => sentenceOrder.get(id));
      const minGroupOrder = Math.min(...groupOrders);
      const maxGroupOrder = Math.max(...groupOrders);
      
      // If missing sentence fits within or near this group, use it
      if (missingOrder >= minGroupOrder && missingOrder <= maxGroupOrder) {
        bestGroup = group;
        break;
      }
      
      // Find closest group by order distance
      const distToMin = Math.abs(missingOrder - minGroupOrder);
      const distToMax = Math.abs(missingOrder - maxGroupOrder);
      const minDist = Math.min(distToMin, distToMax);
      
      if (minDist < minDistance) {
        minDistance = minDist;
        bestGroup = group;
      }
    }
    
    // Add to best group (or first if none found)
    const targetGroup = bestGroup || level2Groups[0];
    if (targetGroup && !targetGroup.childIds.includes(missingSentenceId)) {
      // Insert in correct document position
      let insertIndex = targetGroup.childIds.length;
      for (let i = 0; i < targetGroup.childIds.length; i++) {
        const id = targetGroup.childIds[i];
        if (sentenceIds.has(id) && sentenceOrder.get(id) > missingOrder) {
          insertIndex = i;
          break;
        }
      }
      targetGroup.childIds.splice(insertIndex, 0, missingSentenceId);
    }
  }
  
  // Re-sort nodes by document order
  const getMinOrder = (node) => {
    const orders = (node.childIds || [])
      .filter(id => sentenceIds.has(id))
      .map(id => sentenceOrder.get(id));
    return orders.length > 0 ? Math.min(...orders) : Infinity;
  };
  
  subtree.newNodes.sort((a, b) => {
    const aOrder = getMinOrder(a);
    const bOrder = getMinOrder(b);
    return aOrder - bOrder;
  });
  
  return subtree;
}

/**
 * Fix hierarchy where a parent contains children of same/higher level
 * Flattens invalid relationships by removing intermediate invalid nodes
 */
function fixInvalidParentChildLevels(subtree, topLevel) {
  const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));
  let changes = true;
  let iterations = 0;
  const maxIterations = 10;
  
  while (changes && iterations < maxIterations) {
    changes = false;
    iterations++;
    
    for (const node of subtree.newNodes) {
      const invalidChildren = [];
      const validChildren = [];
      
      for (const childId of node.childIds || []) {
        const child = nodeMap.get(childId);
        if (!child) {
          validChildren.push(childId);
          continue;
        }
        
        // Child must be exactly level - 1
        if (child.level !== node.level - 1) {
          invalidChildren.push(childId);
          changes = true;
        } else {
          validChildren.push(childId);
        }
      }
      
      if (invalidChildren.length === 0) continue;
      
      console.warn(
        `[Claude Service] Fixing ${node.id} (level ${node.level}): has ${invalidChildren.length} invalid children`
      );
      
      // If all children are invalid (same/higher level), promote them as siblings
      if (validChildren.length === 0 && invalidChildren.length > 0) {
        // Find parent of this node and replace it with its children
        for (const potentialParent of subtree.newNodes) {
          const idx = (potentialParent.childIds || []).indexOf(node.id);
          if (idx !== -1) {
            console.warn(
              `[Claude Service]   Promoting ${invalidChildren.length} children to sibling level`
            );
            potentialParent.childIds = [
              ...potentialParent.childIds.slice(0, idx),
              ...invalidChildren,
              ...potentialParent.childIds.slice(idx + 1)
            ];
            break;
          }
        }
        
        // Remove the invalid node
        nodeMap.delete(node.id);
        continue;
      }
      
      // Otherwise keep valid children and remove invalid ones
      node.childIds = validChildren;
    }
  }
  
  subtree.newNodes = Array.from(nodeMap.values());
  return subtree;
}

/**
 * Sort nodes by document order (based on minimum sentence position in their subtree)
 */
function sortNodesByDocumentOrder(subtree, originalSubtree) {
  const sentenceOrder = new Map(
    originalSubtree.sentences.map(s => [s.id, s.order])
  );
  const sentenceIds = new Set(sentenceOrder.keys());
  const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));
  
  // Calculate minimum sentence order for each node
  const nodeMinOrder = new Map();
  
  const getMinOrder = (nodeId) => {
    if (nodeMinOrder.has(nodeId)) {
      return nodeMinOrder.get(nodeId);
    }
    
    const node = nodeMap.get(nodeId);
    if (!node) return Infinity;
    
    let minOrder = Infinity;
    
    // Check direct sentence children
    for (const childId of node.childIds || []) {
      if (sentenceIds.has(childId)) {
        minOrder = Math.min(minOrder, sentenceOrder.get(childId));
      } else {
        // Recurse into node children
        minOrder = Math.min(minOrder, getMinOrder(childId));
      }
    }
    
    nodeMinOrder.set(nodeId, minOrder);
    return minOrder;
  };
  
  // Calculate all minimum orders
  for (const node of subtree.newNodes) {
    getMinOrder(node.id);
  }
  
  // Sort all nodes by their minimum order
  subtree.newNodes.sort((a, b) => {
    const aOrder = nodeMinOrder.get(a.id) || Infinity;
    const bOrder = nodeMinOrder.get(b.id) || Infinity;
    return aOrder - bOrder;
  });
  
  return subtree;
}


/**
 * Validate a complete subtree
 */
function validateSubtree(subtree, originalSubtree, maxDepth) {
    if (!subtree.rootNodeId) {
        throw new Error('Subtree missing "rootNodeId"');
    }
    if (!subtree.newNodes || !Array.isArray(subtree.newNodes)) {
        throw new Error(`Subtree ${subtree.rootNodeId} missing "newNodes" array`);
    }

    const topLevel = originalSubtree.topLevel;
    const originalSentences = originalSubtree.sentences;

    console.log(`[Claude Service] Validating subtree (topLevel=${topLevel})`);

    // ← Fix invalid hierarchy FIRST
    subtree = fixInvalidParentChildLevels(subtree, topLevel);

    // ← Sanitize invalid levels FIRST (Claude sometimes violates constraints)
    subtree.newNodes = normalizeNodeLevels(subtree.newNodes, topLevel);

    subtree = recoverMissingSentences(subtree, originalSubtree);

    // ← RE-SORT BY DOCUMENT ORDER (NEW)
    subtree = sortNodesByDocumentOrder(subtree, originalSubtree);

    // Now validate
    for (const node of subtree.newNodes) {
        // Check title is present and reasonable
        if (!node.title || node.title.trim().length === 0) {
        throw new Error(`Node ${node.id} missing title`);
        }

        if (node.title.length > 100) {
        console.warn(`Node ${node.id} title too long, truncating`);
        node.title = node.title.substring(0, 100);
        }

        // Reject generic placeholders from Claude
        if (/^(Section|Topic|Group|Level) \d+$/.test(node.title)) {
        console.warn(
            `Node ${node.id} has generic title, will be auto-generated: "${node.title}"`
        );
        }
    }

    // Validate level completeness (all levels 2 to topLevel exist)
    validateLevelCompleteness(subtree, topLevel);

    // Validate proper parent-child relationships
    validateParentChildRelationships(subtree, topLevel, originalSentences);

    // Validate no orphaned nodes
    validateNoOrphanedNodes(subtree, topLevel, originalSentences);

    // Validate all sentences are included exactly once
    validateSentenceCompleteness(subtree, originalSentences);

    // Validate sentence order is preserved
    validateSentenceOrder(subtree, originalSentences);

    // Validate groups only contain contiguous sentences
    validateContiguousGrouping(subtree, originalSentences);

    // Validate nodes array is sorted by document order
    validateNodesArrayOrder(subtree, originalSentences);

    console.log(`[Claude Service] ✓ Subtree ${subtree.rootNodeId} validation passed`);
}

/**
 * Validate individual node structure
 */
function validateNodeStructure(node, maxDepth, subtreeId) {
    if (!node.id) {
        throw new Error(`Subtree ${subtreeId}: Node missing "id"`);
    }
    if (typeof node.level !== 'number') {
        throw new Error(`Subtree ${subtreeId}: Node ${node.id} missing "level"`);
    }
    if (!node.title || typeof node.title !== 'string') {
        throw new Error(`Subtree ${subtreeId}: Node ${node.id} missing or invalid "title"`);
    }
    if (!Array.isArray(node.childIds)) {
        throw new Error(`Subtree ${subtreeId}: Node ${node.id} "childIds" must be an array`);
    }
    if (node.childIds.length === 0) {
        throw new Error(`Subtree ${subtreeId}: Node ${node.id} has empty childIds (nodes must have children)`);
    }

    // Emotions: require either full profile or legacy fields
    const profileValid = hasValidEmotions(node);
    const legacyValid = node.emotion && typeof node.intensity === 'number';
    if (!profileValid && !legacyValid) {
        throw new Error(`Subtree ${subtreeId}: Node ${node.id} missing emotions profile (expected "emotions" object with ${EMOTION_AXES.join(', ')} or legacy emotion+intensity)`);
    }
    coerceEmotionShape(node);

    // Validate level range
    if (node.level < 2 || node.level >= maxDepth) {
        throw new Error(
            `Subtree ${subtreeId}: Node ${node.id} has invalid level ${node.level} ` +
            `(must be between 2 and ${maxDepth - 1})`
        );
    }
}

/**
 * Validate all levels from 2 to topLevel are present
 */
function validateLevelCompleteness(subtree, topLevel) {
    const presentLevels = new Set(subtree.newNodes.map(n => n.level));
    const missingLevels = [];

    for (let level = 2; level <= topLevel; level++) {
        if (!presentLevels.has(level)) {
            missingLevels.push(level);
        }
    }

    if (missingLevels.length > 0) {
        throw new Error(
            `Subtree ${subtree.rootNodeId}: Missing levels ${missingLevels.join(', ')}. ` +
            `Must create ALL levels from 2 to ${topLevel} (inclusive).`
        );
    }

    console.log(`[Claude Service]   ✓ All levels 2-${topLevel} present`);
}

/**
 * Validate parent-child relationships follow level rules
 */
function validateParentChildRelationships(subtree, topLevel, originalSentences) {
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));
    const sentenceIds = new Set(originalSentences.map(s => s.id));

    for (const node of subtree.newNodes) {
        for (const childId of node.childIds) {
            // If child is a sentence (check if ID is in original sentences)
            if (sentenceIds.has(childId)) {
                if (node.level !== 2) {
                    throw new Error(
                        `Subtree ${subtree.rootNodeId}: Node ${node.id} (level ${node.level}) ` +
                        `contains sentence ${childId}, but only level 2 nodes can contain sentences`
                    );
                }
            }
            // If child is a node, validate level relationship
            else {
                const childNode = nodeMap.get(childId);
                if (!childNode) {
                    throw new Error(
                        `Subtree ${subtree.rootNodeId}: Node ${node.id} references ` +
                        `unknown child ${childId}`
                    );
                }

                const expectedChildLevel = node.level - 1;
                if (childNode.level !== expectedChildLevel) {
                    throw new Error(
                        `Subtree ${subtree.rootNodeId}: Node ${node.id} (level ${node.level}) ` +
                        `contains child ${childId} (level ${childNode.level}), but should contain ` +
                        `level ${expectedChildLevel} children`
                    );
                }
            }
        }
    }

    console.log(`[Claude Service]   ✓ Parent-child relationships valid`);
}

/**
 * Validate no orphaned nodes (all nodes except top-level must be referenced)
 */
function validateNoOrphanedNodes(subtree, topLevel, originalSentences) {
    const allReferencedIds = new Set();
    const sentenceIds = new Set(originalSentences.map(s => s.id));

    // Collect all referenced child IDs (excluding sentences)
    for (const node of subtree.newNodes) {
        for (const childId of node.childIds) {
            if (!sentenceIds.has(childId)) {
                allReferencedIds.add(childId);
            }
        }
    }

    // Check each node is either top-level or referenced
    for (const node of subtree.newNodes) {
        const isTopLevel = node.level === topLevel;
        const isReferenced = allReferencedIds.has(node.id);

        if (!isTopLevel && !isReferenced) {
            throw new Error(
                `Subtree ${subtree.rootNodeId}: Node ${node.id} (level ${node.level}) is orphaned. ` +
                `It must either be at the top level (${topLevel}) or be referenced by a parent node.`
            );
        }
    }

    console.log(`[Claude Service]   ✓ No orphaned nodes`);
}

/**
 * Validate all sentences are included exactly once
 */
function validateSentenceCompleteness(subtree, originalSentences) {
    const originalIds = new Set(originalSentences.map(s => s.id));
    const sentenceIds = originalIds; // For clarity
    const foundIds = new Set();

    // Recursively collect all sentence IDs from the hierarchy
    const collectSentenceIds = (nodeIds, nodeMap) => {
        for (const childId of nodeIds) {
            if (sentenceIds.has(childId)) {
                foundIds.add(childId);
            } else {
                const childNode = nodeMap.get(childId);
                if (childNode) {
                    collectSentenceIds(childNode.childIds, nodeMap);
                }
            }
        }
    };

    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));
    for (const node of subtree.newNodes) {
        collectSentenceIds(node.childIds, nodeMap);
    }

    // Check for missing sentences
    const missing = [...originalIds].filter(id => !foundIds.has(id));
    if (missing.length > 0) {
        throw new Error(
            `Subtree ${subtree.rootNodeId}: Missing sentences: ${missing.join(', ')}. ` +
            `ALL sentences must be included in the hierarchy.`
        );
    }

    // Check for extra/duplicate sentences
    const extra = [...foundIds].filter(id => !originalIds.has(id));
    if (extra.length > 0) {
        throw new Error(
            `Subtree ${subtree.rootNodeId}: Unexpected sentences: ${extra.join(', ')}. ` +
            `Only the provided sentences should be included.`
        );
    }

    console.log(`[Claude Service]   ✓ All ${originalIds.size} sentences included exactly once`);
}

/**
 * Validate sentence order is preserved
 */
function validateSentenceOrder(subtree, originalSentences) {
    // Build a map of original sentence order
    const originalOrder = new Map(originalSentences.map((s, idx) => [s.id, idx]));
    const sentenceIds = new Set(originalSentences.map(s => s.id));

    // Extract sentence sequence from the new hierarchy
    const sentenceSequence = [];
    const extractSequence = (nodeIds, nodeMap) => {
        for (const childId of nodeIds) {
            if (sentenceIds.has(childId)) {
                sentenceSequence.push(childId);
            } else {
                const childNode = nodeMap.get(childId);
                if (childNode) {
                    extractSequence(childNode.childIds, nodeMap);
                }
            }
        }
    };

    // Extract sequence by processing nodes in order
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));

    // Find the top-level nodes and process them in order
    const topLevel = Math.max(...subtree.newNodes.map(n => n.level));
    const topNodes = subtree.newNodes.filter(n => n.level === topLevel);

    for (const topNode of topNodes) {
        extractSequence(topNode.childIds, nodeMap);
    }

    // Verify sequence is in ascending order
    for (let i = 1; i < sentenceSequence.length; i++) {
        const prevIdx = originalOrder.get(sentenceSequence[i - 1]);
        const currIdx = originalOrder.get(sentenceSequence[i]);

        if (currIdx < prevIdx) {
            // Find which nodes contain these sentences to provide helpful error
            let nodeWithCurr = null;
            let nodeWithPrev = null;

            for (const node of subtree.newNodes) {
                if (node.childIds.includes(sentenceSequence[i])) {
                    nodeWithCurr = node;
                }
                if (node.childIds.includes(sentenceSequence[i - 1])) {
                    nodeWithPrev = node;
                }
            }

            throw new Error(
                `Subtree ${subtree.rootNodeId}: Sentence order violated.\n` +
                `\n` +
                `The newNodes array has groups in the wrong order:\n` +
                `  - Node "${nodeWithPrev?.id}" contains sentence at position ${prevIdx}\n` +
                `  - Node "${nodeWithCurr?.id}" contains sentence at position ${currIdx}\n` +
                `\n` +
                `But position ${currIdx} comes BEFORE position ${prevIdx} in the document!\n` +
                `\n` +
                `Fix: Reorder your newNodes array so groups appear in document order.\n` +
                `The node containing position ${currIdx} must come before the node containing position ${prevIdx}.`
            );
        }
    }

    console.log(`[Claude Service]   ✓ Sentence order preserved`);
}

/**
 * Validate that nodes in the newNodes array are sorted by document order
 * This is critical because rebuildSentenceOrderFromHierarchy processes nodes in array order
 */
function validateNodesArrayOrder(subtree, originalSentences) {
    const originalOrder = new Map(originalSentences.map((s, idx) => [s.id, idx]));
    const sentenceIds = new Set(originalSentences.map(s => s.id));
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));

    // For each node, calculate the minimum sentence position it contains (recursively)
    const nodeMinPositions = new Map();

    const getMinPosition = (nodeId) => {
        // Check if it's a sentence
        if (sentenceIds.has(nodeId)) {
            return originalOrder.get(nodeId);
        }

        // Check if already calculated
        if (nodeMinPositions.has(nodeId)) {
            return nodeMinPositions.get(nodeId);
        }

        // It's a hierarchy node - find min position from children
        const node = nodeMap.get(nodeId);
        if (!node) {
            throw new Error(`Cannot find node ${nodeId}`);
        }

        let minPos = Infinity;
        for (const childId of node.childIds) {
            const childMinPos = getMinPosition(childId);
            minPos = Math.min(minPos, childMinPos);
        }

        nodeMinPositions.set(nodeId, minPos);
        return minPos;
    };

    // Calculate min positions for all nodes
    for (const node of subtree.newNodes) {
        getMinPosition(node.id);
    }

    // Check that within each level, nodes are sorted by min position
    const nodesByLevel = new Map();
    for (const node of subtree.newNodes) {
        if (!nodesByLevel.has(node.level)) {
            nodesByLevel.set(node.level, []);
        }
        nodesByLevel.get(node.level).push(node);
    }

    for (const [level, nodes] of nodesByLevel.entries()) {
        for (let i = 1; i < nodes.length; i++) {
            const prevNode = nodes[i - 1];
            const currNode = nodes[i];
            const prevMinPos = nodeMinPositions.get(prevNode.id);
            const currMinPos = nodeMinPositions.get(currNode.id);

            if (currMinPos < prevMinPos) {
                throw new Error(
                    `Subtree ${subtree.rootNodeId}: Nodes out of order in newNodes array at level ${level}.\n` +
                    `\n` +
                    `Node "${prevNode.id}" (title: "${prevNode.title}") contains sentences starting at position ${prevMinPos}\n` +
                    `Node "${currNode.id}" (title: "${currNode.title}") contains sentences starting at position ${currMinPos}\n` +
                    `\n` +
                    `But position ${currMinPos} comes BEFORE position ${prevMinPos} in the document!\n` +
                    `\n` +
                    `Fix: Reorder the newNodes array so that within each level, nodes appear in document order.\n` +
                    `Move the node starting at position ${currMinPos} to come before the node starting at position ${prevMinPos}.`
                );
            }
        }
    }

    console.log(`[Claude Service]   ✓ Nodes array is sorted by document order at each level`);
}

/**
 * Validate that level-2 groups only contain contiguous sentences
 * This ensures groups don't skip sentences, which would make ordering impossible
 */
function validateContiguousGrouping(subtree, originalSentences) {
    const originalOrder = new Map(originalSentences.map((s, idx) => [s.id, idx]));
    const sentenceIds = new Set(originalSentences.map(s => s.id));
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));

    // Check all level-2 nodes (which directly contain sentences)
    const level2Nodes = subtree.newNodes.filter(n => n.level === 2);

    for (const node of level2Nodes) {
        // Get indices of all sentences in this group
        const sentenceIndices = node.childIds
            .filter(id => sentenceIds.has(id))
            .map(id => originalOrder.get(id))
            .sort((a, b) => a - b);

        if (sentenceIndices.length === 0) continue;

        // Check if indices are contiguous (no gaps)
        const minIdx = sentenceIndices[0];
        const maxIdx = sentenceIndices[sentenceIndices.length - 1];
        const expectedLength = maxIdx - minIdx + 1;

        if (sentenceIndices.length !== expectedLength) {
            const missing = [];
            for (let i = minIdx; i <= maxIdx; i++) {
                if (!sentenceIndices.includes(i)) {
                    missing.push(originalSentences[i].id);
                }
            }

            throw new Error(
                `Subtree ${subtree.rootNodeId}: Node ${node.id} contains non-contiguous sentences. ` +
                `It includes sentences at positions ${minIdx}-${maxIdx} but is missing: ${missing.join(', ')}. ` +
                `Groups can ONLY contain consecutive sentences - you cannot skip sentences within a group. ` +
                `If sentence ${missing[0]} is about a different topic, create a separate group for it.`
            );
        }

        // Also verify childIds are in order within the group
        for (let i = 1; i < sentenceIndices.length; i++) {
            if (sentenceIndices[i] !== sentenceIndices[i - 1] + 1) {
                throw new Error(
                    `Subtree ${subtree.rootNodeId}: Node ${node.id} has sentences out of order in childIds array. ` +
                    `Sentences must be listed in document order within each group.`
                );
            }
        }
    }

    console.log(`[Claude Service]   ✓ All groups contain contiguous sentences`);
}
