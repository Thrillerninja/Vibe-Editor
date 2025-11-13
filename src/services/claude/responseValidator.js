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

        console.log('[Claude Service] ✓ Response validation passed');
        console.log(`[Claude Service] ✓ Validated ${parsed.restructuredSubtrees.length} subtree(s)`);

        return {
            restructuredSubtrees: parsed.restructuredSubtrees,
            newRootTitle: parsed.newRootTitle
        };
    } catch (error) {
        console.error('[Claude Service] ✗ Response validation failed:', error.message);
        console.error('[Claude Service] Response text:', responseText);
        throw new Error(`Invalid Claude response: ${error.message}`);
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

/**
 * Validate a complete subtree
 */
function validateSubtree(subtree, originalSubtree, maxDepth) {
    // Basic structure
    if (!subtree.rootNodeId) {
        throw new Error('Subtree missing "rootNodeId"');
    }
    if (!subtree.newNodes || !Array.isArray(subtree.newNodes)) {
        throw new Error(`Subtree ${subtree.rootNodeId} missing "newNodes" array`);
    }

    const topLevel = originalSubtree.topLevel;
    const originalSentences = originalSubtree.sentences;

    console.log(`[Claude Service] Validating subtree ${subtree.rootNodeId} (topLevel=${topLevel}, ${originalSentences.length} sentences)`);

    // Validate each node's basic structure
    for (const node of subtree.newNodes) {
        validateNodeStructure(node, maxDepth, subtree.rootNodeId);
    }

    // Validate level completeness (all levels 2 to topLevel exist)
    validateLevelCompleteness(subtree, topLevel);

    // Validate proper parent-child relationships
    validateParentChildRelationships(subtree, topLevel);

    // Validate no orphaned nodes
    validateNoOrphanedNodes(subtree, topLevel);

    // Validate all sentences are included exactly once
    validateSentenceCompleteness(subtree, originalSentences);

    // Validate sentence order is preserved
    validateSentenceOrder(subtree, originalSentences);

    // Validate groups only contain contiguous sentences
    validateContiguousGrouping(subtree, originalSentences);

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
function validateParentChildRelationships(subtree, topLevel) {
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));

    for (const node of subtree.newNodes) {
        for (const childId of node.childIds) {
            // If child is a sentence, parent must be level 2
            if (childId.startsWith('sentence-')) {
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
function validateNoOrphanedNodes(subtree, topLevel) {
    const allReferencedIds = new Set();

    // Collect all referenced child IDs
    for (const node of subtree.newNodes) {
        for (const childId of node.childIds) {
            if (!childId.startsWith('sentence-')) {
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
    const foundIds = new Set();

    // Recursively collect all sentence IDs from the hierarchy
    const collectSentenceIds = (nodeIds, nodeMap) => {
        for (const childId of nodeIds) {
            if (childId.startsWith('sentence-')) {
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

    // Extract sentence sequence from the new hierarchy
    const sentenceSequence = [];
    const extractSequence = (nodeIds, nodeMap) => {
        for (const childId of nodeIds) {
            if (childId.startsWith('sentence-')) {
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
                `  - Node "${nodeWithPrev?.id}" contains ${sentenceSequence[i - 1]} (position ${prevIdx})\n` +
                `  - Node "${nodeWithCurr?.id}" contains ${sentenceSequence[i]} (position ${currIdx})\n` +
                `\n` +
                `But ${sentenceSequence[i]} (position ${currIdx}) comes BEFORE ${sentenceSequence[i - 1]} (position ${prevIdx}) in the document!\n` +
                `\n` +
                `Fix: Reorder your newNodes array so groups appear in document order.\n` +
                `The node containing sentence-${currIdx} must come before the node containing sentence-${prevIdx}.`
            );
        }
    }

    console.log(`[Claude Service]   ✓ Sentence order preserved`);
}

/**
 * Validate that level-2 groups only contain contiguous sentences
 * This ensures groups don't skip sentences, which would make ordering impossible
 */
function validateContiguousGrouping(subtree, originalSentences) {
    const originalOrder = new Map(originalSentences.map((s, idx) => [s.id, idx]));
    const nodeMap = new Map(subtree.newNodes.map(n => [n.id, n]));

    // Check all level-2 nodes (which directly contain sentences)
    const level2Nodes = subtree.newNodes.filter(n => n.level === 2);

    for (const node of level2Nodes) {
        // Get indices of all sentences in this group
        const sentenceIndices = node.childIds
            .filter(id => id.startsWith('sentence-'))
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
