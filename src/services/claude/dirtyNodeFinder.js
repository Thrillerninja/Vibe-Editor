/**
 * Dirty Node Finder
 * Functions for finding and analyzing dirty subtrees in the hierarchy
 */

/**
 * Find the highest-level dirty nodes (roots of dirty subtrees)
 * These are dirty nodes whose parents are NOT dirty
 */
export function findDirtyRootNodes(dirtyNodeIds, hierarchyMeta) {
    const dirtySet = new Set(dirtyNodeIds);
    const dirtyRoots = [];

    for (const nodeId of dirtyNodeIds) {
        const node = hierarchyMeta.nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Check if this node's parent is dirty
        const parent = hierarchyMeta.nodes.find(n => n.childIds.includes(nodeId));

        if (!parent || !dirtySet.has(parent.id)) {
            // No parent or parent is not dirty - this is a dirty root
            dirtyRoots.push(node);
        }
    }

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
 */
export function buildDirtySubtrees(dirtyRootNodes, hierarchyMeta, sentences, dirtySentenceIds) {
    // Find the highest existing node ID to suggest starting IDs for new nodes
    const maxNodeId = hierarchyMeta.nodes.reduce((max, n) => {
        const match = n.id.match(/node-(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
    }, -1);
    let suggestedStartId = maxNodeId + 1;

    const dirtySubtrees = [];

    for (const rootNode of dirtyRootNodes) {
        const sentencesInSubtree = findSentencesInNode(rootNode, hierarchyMeta, sentences);

        dirtySubtrees.push({
            rootNodeId: rootNode.id,
            rootLevel: rootNode.level,
            suggestedStartNodeId: suggestedStartId,
            sentences: sentencesInSubtree.map(s => ({
                id: s.id,
                content: s.content,
                isDirty: dirtySentenceIds.includes(s.id)
            }))
        });

        // Increment for next subtree
        suggestedStartId += 20; // Leave room for multiple nodes per subtree
    }

    return dirtySubtrees;
}
