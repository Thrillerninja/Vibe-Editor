/**
 * Dirty Node Finder
 * Functions for finding and analyzing dirty subtrees in the hierarchy
 */

/**
 * Find the highest-level dirty nodes (roots of dirty subtrees)
 * These are dirty nodes whose parents are NOT dirty
 * Note: 'root' is not included as it's not a restructurable node
 */
export function findDirtyRootNodes(dirtyNodeIds, hierarchyMeta) {
    console.log(`[Claude Service] Finding dirty root nodes from ${dirtyNodeIds.length} dirty nodes`);
    console.log(`[Claude Service] Dirty node IDs:`, dirtyNodeIds);

    const dirtySet = new Set(dirtyNodeIds);
    const dirtyRoots = [];

    for (const nodeId of dirtyNodeIds) {
        // Skip the root node - it's not a hierarchy node to restructure
        if (nodeId === 'root') {
            console.log(`[Claude Service]   - Skipping 'root' (not a hierarchy node)`);
            continue;
        }

        const node = hierarchyMeta.nodes.find(n => n.id === nodeId);
        if (!node) {
            console.warn(`[Claude Service]   - Node ${nodeId} not found in hierarchy!`);
            continue;
        }

        // Check if this node's parent is dirty
        const parent = hierarchyMeta.nodes.find(n => n.childIds.includes(nodeId));

        if (!parent) {
            console.log(`[Claude Service]   ✓ ${nodeId} (${node.label}) - no parent (top-level) → dirty root`);
            dirtyRoots.push(node);
        } else if (!dirtySet.has(parent.id)) {
            console.log(`[Claude Service]   ✓ ${nodeId} (${node.label}) - parent ${parent.id} is clean → dirty root`);
            dirtyRoots.push(node);
        } else {
            console.log(`[Claude Service]   - ${nodeId} (${node.label}) - parent ${parent.id} is also dirty → not a root`);
        }
    }

    console.log(`[Claude Service] Found ${dirtyRoots.length} dirty root nodes`);
    return dirtyRoots;
}

/**
 * Find all sentences that belong to a node (recursively through its children)
 */
export function findSentencesInNode(node, hierarchyMeta, sentences) {
    const result = [];

    for (const childId of node.childIds) {
        // Check if child is a sentence
        const sentence = sentences.find(s => s.id === childId);
        if (sentence) {
            result.push(sentence);
        } else {
            // Child is another node, recurse
            const childNode = hierarchyMeta.nodes.find(n => n.id === childId);
            if (childNode) {
                result.push(...findSentencesInNode(childNode, hierarchyMeta, sentences));
            }
        }
    }

    return result;
}

/**
 * Build subtree information for dirty root nodes
 * @param {Array} dirtyRootNodes - Root nodes of dirty subtrees
 * @param {Object} hierarchyMeta - Hierarchy metadata
 * @param {Array} sentences - All sentences
 * @param {Array} dirtySentenceIds - IDs of modified sentences
 * @returns {Array} Array of subtree information objects
 * 
 * HIERARCHY SEMANTICS:
 * - Sentences are NOT nodes - they're just IDs referenced by nodes
 * - contentLevel = maxDepth - 1 (reference point, not a node level)
 * - maxGroupLevel = maxDepth - 2 (highest grouping node level)
 * - topLevel = maxGroupLevel (highest node to create)
 * 
 * Example maxDepth=3:
 *   Root (0) → Level 1 groups → Sentence IDs
 *   topLevel = 1
 * 
 * Example maxDepth=4:
 *   Root (0) → Level 2 groups → Level 1 groups → Sentence IDs
 *   topLevel = 2
 */
export function buildDirtySubtrees(dirtyRootNodes, hierarchyMeta, sentences, dirtySentenceIds) {
    const dirtySubtrees = [];

    console.log(`[Claude Service] Building dirty subtrees for ${dirtyRootNodes.length} root nodes`);
    console.log(`[Claude Service] Total sentences in document: ${sentences.length}`);

    // Calculate hierarchy levels
    const contentLevel = hierarchyMeta.maxLevel; // maxDepth - 1 (reference, not a node level)
    const maxGroupLevel = contentLevel - 1;     // Highest actual grouping node level

    for (const rootNode of dirtyRootNodes) {
        const sentencesInSubtree = findSentencesInNode(rootNode, hierarchyMeta, sentences);

        console.log(`[Claude Service] Subtree ${rootNode.id} contains ${sentencesInSubtree.length} sentences`);
        console.log(`[Claude Service]   Sentence orders: ${sentencesInSubtree.map(s => sentences.indexOf(s)).join(', ')}`);

        if (sentencesInSubtree.length === 0) {
            console.warn(
                `[Claude Service] Skipping dirty root ${rootNode.id} because it contains 0 sentences`
            );
            continue;
        }

        dirtySubtrees.push({
            rootNodeId: rootNode.id,
            // topLevel = highest grouping node level (NOT contentLevel which is just a reference)
            topLevel: maxGroupLevel,
            contentLevel: contentLevel,
            sentences: sentencesInSubtree.map((s, index) => ({
                id: s.id,
                order: sentences.indexOf(s),
                content: s.content,
                isDirty: dirtySentenceIds.includes(s.id)
            }))
        });
    }

    const coveredSentenceIds = new Set(dirtySubtrees.flatMap(st => st.sentences.map(s => s.id)));
    const allSentenceIds = new Set(sentences.map(s => s.id));
    const missingSentenceIds = [...allSentenceIds].filter(id => !coveredSentenceIds.has(id));

    if (missingSentenceIds.length > 0) {
        console.warn(`[Claude Service] ⚠️ WARNING: ${missingSentenceIds.length} sentences are NOT in any dirty subtree!`);
        console.warn(`[Claude Service] Missing sentence IDs:`, missingSentenceIds);
        const missingSentences = sentences.filter(s => missingSentenceIds.includes(s.id));
        console.warn(`[Claude Service] Missing sentences:`, missingSentences.map(s => `[${sentences.indexOf(s)}] "${s.content.substring(0, 50)}..."`));
    }

    return dirtySubtrees;
}
