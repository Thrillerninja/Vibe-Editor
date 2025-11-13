/**
 * Response Validator
 * Functions for parsing and validating Claude's responses
 */

/**
 * Parse the response from dirty subtree restructure
 * @param {string} responseText - Raw response from Claude
 * @param {number} maxDepth - Maximum hierarchy depth
 * @param {Array} originalSubtrees - Original subtree data for validation
 * @returns {Array} Parsed and validated restructured subtrees
 */
export function parseDirtyRestructureResponse(responseText, maxDepth, originalSubtrees) {
    try {
        // Try to extract JSON if wrapped in markdown code blocks
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```')) {
            const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) {
                jsonText = match[1];
            }
        }

        const parsed = JSON.parse(jsonText);

        if (!parsed.restructuredSubtrees || !Array.isArray(parsed.restructuredSubtrees)) {
            throw new Error('Invalid response format: missing restructuredSubtrees array');
        }

        // Validate each subtree
        for (const subtree of parsed.restructuredSubtrees) {
            validateSubtree(subtree, maxDepth, originalSubtrees);
        }

        console.log('[Claude Service] Parsed', parsed.restructuredSubtrees.length, 'restructured subtrees');

        return parsed.restructuredSubtrees;
    } catch (error) {
        console.error('[Claude Service] Failed to parse dirty restructure response:', error);
        console.error('[Claude Service] Response text:', responseText);
        throw new Error(`Invalid response format: ${error.message}`);
    }
}

/**
 * Validate a single subtree structure
 */
function validateSubtree(subtree, maxDepth, originalSubtrees) {
    if (!subtree.rootNodeId || !subtree.newNodes || !Array.isArray(subtree.newNodes)) {
        throw new Error('Invalid subtree format: missing rootNodeId or newNodes');
    }

    // Find the original subtree to get the sentence order
    const originalSubtree = originalSubtrees.find(s => s.rootNodeId === subtree.rootNodeId);
    if (!originalSubtree) {
        console.warn(`[Claude Service] Could not find original subtree for ${subtree.rootNodeId}`);
    }

    // Validate each node
    for (const node of subtree.newNodes) {
        validateNode(node, maxDepth);
    }

    // Validate node hierarchy (no orphaned nodes)
    validateNodeHierarchy(subtree.newNodes);

    // Validate sentence completeness and order
    if (originalSubtree) {
        validateSentences(subtree, originalSubtree);
    }
}

/**
 * Validate a single node structure
 */
function validateNode(node, maxDepth) {
    if (!node.id || !node.level || !node.title || !node.childIds) {
        throw new Error(`Invalid node format: ${JSON.stringify(node)}`);
    }

    // Validate level
    if (node.level < 2 || node.level >= maxDepth) {
        throw new Error(`Node ${node.id} has invalid level ${node.level} (must be 2 to ${maxDepth - 1})`);
    }

    // Validate childIds is an array
    if (!Array.isArray(node.childIds)) {
        throw new Error(`Node ${node.id} has invalid childIds (must be an array)`);
    }
}

/**
 * Validate that no nodes are orphaned (all nodes are part of the tree)
 */
function validateNodeHierarchy(nodes) {
    // Find the highest level nodes - these should be the direct children of the root
    const maxLevel = Math.max(...nodes.map(n => n.level));

    // Collect all node IDs that are referenced as children
    const referencedNodeIds = new Set();
    for (const node of nodes) {
        for (const childId of node.childIds) {
            if (!childId.startsWith('sentence-')) {
                referencedNodeIds.add(childId);
            }
        }
    }

    // Check if any nodes are orphaned (not referenced by any parent and not top-level)
    for (const node of nodes) {
        const isTopLevel = node.level === maxLevel;
        const isReferenced = referencedNodeIds.has(node.id);

        if (!isTopLevel && !isReferenced) {
            throw new Error(
                `Node ${node.id} (level ${node.level}) is orphaned - not referenced by any parent node. ` +
                `All nodes except those at level ${maxLevel} must be children of a higher-level node.`
            );
        }
    }
}

/**
 * Validate that all sentences are included and in correct order
 */
function validateSentences(subtree, originalSubtree) {
    const originalSentenceIds = originalSubtree.sentences.map(s => s.id);

    // Collect all sentence IDs mentioned in the new nodes
    const mentionedSentences = new Set();
    const collectSentenceIds = (nodeIds, nodes) => {
        for (const childId of nodeIds) {
            if (childId.startsWith('sentence-')) {
                mentionedSentences.add(childId);
            } else {
                // Find the child node and recurse
                const childNode = nodes.find(n => n.id === childId);
                if (childNode) {
                    collectSentenceIds(childNode.childIds, nodes);
                }
            }
        }
    };

    // Collect all sentence IDs from the nodes
    for (const node of subtree.newNodes) {
        collectSentenceIds(node.childIds, subtree.newNodes);
    }

    const mentionedSentenceArray = Array.from(mentionedSentences);

    // Check if all original sentences are included
    for (const sentId of originalSentenceIds) {
        if (!mentionedSentences.has(sentId)) {
            throw new Error(`Sentence ${sentId} was removed from subtree ${subtree.rootNodeId}`);
        }
    }

    // Check if any extra sentences were added
    for (const sentId of mentionedSentenceArray) {
        if (!originalSentenceIds.includes(sentId)) {
            throw new Error(`Sentence ${sentId} was added to subtree ${subtree.rootNodeId} but wasn't in the original`);
        }
    }

    // Validate sentence order is preserved
    validateSentenceOrder(subtree, originalSentenceIds);
}

/**
 * Validate that sentence order is preserved
 */
function validateSentenceOrder(subtree, originalSentenceIds) {
    const originalOrder = new Map(originalSentenceIds.map((id, idx) => [id, idx]));

    // Build a flat list of sentences as they appear in the new structure
    const newSequence = [];
    const extractSentenceSequence = (nodeIds, nodes) => {
        for (const childId of nodeIds) {
            if (childId.startsWith('sentence-')) {
                newSequence.push(childId);
            } else {
                // Find the child node and recurse
                const childNode = nodes.find(n => n.id === childId);
                if (childNode) {
                    extractSentenceSequence(childNode.childIds, nodes);
                }
            }
        }
    };

    // Extract sentences in the order they appear in the new structure
    for (const node of subtree.newNodes) {
        if (node.level === 2) {
            // Only look at leaf-level grouping nodes to avoid duplicates
            extractSentenceSequence(node.childIds, subtree.newNodes);
        }
    }

    // Verify ALL sentences are included (no missing or duplicates)
    const expectedSentences = new Set(subtree.sentences.map(s => s.id));
    const foundSentences = new Set(newSequence);

    const missingSentences = [...expectedSentences].filter(id => !foundSentences.has(id));
    const extraSentences = [...foundSentences].filter(id => !expectedSentences.has(id));

    if (missingSentences.length > 0) {
        throw new Error(
            `Missing sentences in subtree ${subtree.rootNodeId}: ${missingSentences.join(', ')}. ` +
            `ALL sentences must be included in the hierarchy.`
        );
    }

    if (extraSentences.length > 0) {
        throw new Error(
            `Extra/duplicate sentences in subtree ${subtree.rootNodeId}: ${extraSentences.join(', ')}. ` +
            `Each sentence must appear exactly once.`
        );
    }

    // Verify the sequence matches the original order
    for (let i = 0; i < newSequence.length; i++) {
        const sentId = newSequence[i];
        const originalIdx = originalOrder.get(sentId);

        // Check if this sentence comes before any previous sentence in the original order
        for (let j = 0; j < i; j++) {
            const prevSentId = newSequence[j];
            const prevOriginalIdx = originalOrder.get(prevSentId);

            if (originalIdx > prevOriginalIdx) {
                throw new Error(
                    `Sentence order violated in subtree ${subtree.rootNodeId}: ` +
                    `${sentId} (original position ${originalIdx}) appears after ` +
                    `${prevSentId} (original position ${prevOriginalIdx}). ` +
                    `Groups must appear in document order.`
                );
            }
        }
    }

    console.log(`[Claude Service] Validated sentence order for subtree ${subtree.rootNodeId}`);
}
