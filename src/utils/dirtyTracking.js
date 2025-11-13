/**
 * Dirty Node Tracking Utilities
 * Handles marking nodes and their ancestors as dirty when content changes
 */

import { LOGGING_ENABLED, LOG_PREFIX } from './constants';

/**
 * Marks a sentence and all its ancestor nodes as dirty
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {string} sentenceId - ID of the modified sentence
 * @returns {Array} Updated sentences with dirty flags
 */
export function markSentenceAsDirty(sentences, sentenceId) {
    if (!sentences._hierarchyMeta) {
        // No hierarchy, nothing to mark
        return sentences;
    }

    console.log(`${LOG_PREFIX.PARSER} Marking sentence ${sentenceId} and ancestors as dirty`);

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n }));

    // Track which nodes are dirty
    const dirtyNodeIds = new Set(hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(hierarchyMeta.dirtySentenceIds || []);

    // Mark the sentence as dirty
    dirtySentenceIds.add(sentenceId);

    // Find all ancestor nodes and mark them dirty
    const findAncestors = (childId) => {
        let foundParent = false;
        for (const node of nodes) {
            if (node.childIds.includes(childId)) {
                dirtyNodeIds.add(node.id);
                foundParent = true;
                // Recursively mark parent nodes
                findAncestors(node.id);
            }
        }
        // If no parent was found in the hierarchy nodes, this must be a top-level node
        // Mark the root node as dirty
        if (!foundParent && childId !== sentenceId) {
            dirtyNodeIds.add('root');
        }
    };

    findAncestors(sentenceId);

    console.log(`${LOG_PREFIX.PARSER} Marked dirty: ${dirtySentenceIds.size} sentences, ${dirtyNodeIds.size} nodes`);

    // Update metadata
    hierarchyMeta.nodes = nodes;
    hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodeIds);
    hierarchyMeta.dirtySentenceIds = Array.from(dirtySentenceIds);
    updated._hierarchyMeta = hierarchyMeta;

    return updated;
}

/**
 * Marks multiple sentences as dirty (e.g., after reordering)
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {Array} sentenceIds - IDs of modified sentences
 * @returns {Array} Updated sentences with dirty flags
 */
export function markSentencesAsDirty(sentences, sentenceIds) {
    if (!sentences._hierarchyMeta || sentenceIds.length === 0) {
        return sentences;
    }

    let updated = sentences;
    for (const sentenceId of sentenceIds) {
        updated = markSentenceAsDirty(updated, sentenceId);
    }

    return updated;
}

/**
 * Marks a node and all its ancestors as dirty (helper function)
 * @param {string} nodeId - ID of the node to start from
 * @param {Array} nodes - Hierarchy nodes array
 * @param {Set} dirtyNodeIds - Set to add dirty node IDs to
 */
function markAncestorsAsDirty(nodeId, nodes, dirtyNodeIds) {
    let currentId = nodeId;

    while (currentId) {
        // Find the parent of the current node
        let foundParent = false;
        for (const node of nodes) {
            if (node.childIds.includes(currentId)) {
                dirtyNodeIds.add(node.id);
                currentId = node.id; // Move up to parent
                foundParent = true;
                break;
            }
        }

        // If no parent found, we're at the top level - mark root as dirty
        if (!foundParent) {
            dirtyNodeIds.add('root');
            break;
        }
    }
}

/**
 * Marks nodes as dirty after reordering operation
 * This is different from regular dirty marking because:
 * - The reordered node itself is dirty
 * - All ancestors at the ORIGINAL position are dirty
 * - All ancestors at the NEW position are dirty
 * 
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {string} reorderedNodeId - ID of the node that was reordered
 * @param {string} originalParentId - ID of parent at original position (optional, will find if not provided)
 * @param {string} newParentId - ID of parent at new position (optional, will find if not provided)
 * @returns {Array} Updated sentences with dirty flags
 */
export function markReorderAsDirty(sentences, reorderedNodeId, originalParentId = null, newParentId = null) {
    if (!sentences._hierarchyMeta) {
        console.warn(`${LOG_PREFIX.PARSER} No hierarchy metadata, cannot mark reorder as dirty`);
        return sentences;
    }

    console.log(`${LOG_PREFIX.PARSER} Marking reorder as dirty: node ${reorderedNodeId}`);

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n }));

    // Track which nodes are dirty
    const dirtyNodeIds = new Set(hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(hierarchyMeta.dirtySentenceIds || []);

    // Check if the reordered node is a sentence or a hierarchy node
    const isSentence = sentences.some(s => s.id === reorderedNodeId);

    if (isSentence) {
        // Mark the sentence itself as dirty
        dirtySentenceIds.add(reorderedNodeId);
        console.log(`${LOG_PREFIX.PARSER} Marked sentence ${reorderedNodeId} as dirty`);
    } else {
        // Mark the hierarchy node as dirty
        dirtyNodeIds.add(reorderedNodeId);
        console.log(`${LOG_PREFIX.PARSER} Marked node ${reorderedNodeId} as dirty`);
    }

    // Find parent at new position (current state)
    const currentParent = nodes.find(n => n.childIds.includes(reorderedNodeId));
    if (currentParent) {
        console.log(`${LOG_PREFIX.PARSER} Found current parent: ${currentParent.id}`);
        // Mark current parent and all its ancestors as dirty
        markAncestorsAsDirty(reorderedNodeId, nodes, dirtyNodeIds);
    } else {
        // No parent in hierarchy nodes means it's a top-level node
        console.log(`${LOG_PREFIX.PARSER} Node ${reorderedNodeId} is at top level`);
        dirtyNodeIds.add('root');
    }

    // If we have the original parent ID, also mark that branch as dirty
    // This handles the case where the node moved between different parents
    if (originalParentId && originalParentId !== currentParent?.id) {
        console.log(`${LOG_PREFIX.PARSER} Node moved from different parent: ${originalParentId}`);
        dirtyNodeIds.add(originalParentId);
        // Mark all ancestors of the original parent as dirty
        markAncestorsAsDirty(originalParentId, nodes, dirtyNodeIds);
    }

    console.log(`${LOG_PREFIX.PARSER} Marked dirty after reorder: ${dirtySentenceIds.size} sentences, ${dirtyNodeIds.size} nodes`);

    // Update metadata
    hierarchyMeta.nodes = nodes;
    hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodeIds);
    hierarchyMeta.dirtySentenceIds = Array.from(dirtySentenceIds);
    updated._hierarchyMeta = hierarchyMeta;

    return updated;
}

/**
 * Clears all dirty flags from hierarchy
 * @param {Array} sentences - Sentences array
 * @returns {Array} Sentences with clean hierarchy
 */
export function clearDirtyFlags(sentences) {
    if (!sentences._hierarchyMeta) {
        return sentences;
    }

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };

    delete hierarchyMeta.dirtyNodeIds;
    delete hierarchyMeta.dirtySentenceIds;

    updated._hierarchyMeta = hierarchyMeta;

    console.log(`${LOG_PREFIX.PARSER} Cleared all dirty flags`);

    return updated;
}

/**
 * Checks if hierarchy has any dirty nodes
 * @param {Array} sentences - Sentences array
 * @returns {boolean} True if there are dirty nodes
 */
export function hasDirtyNodes(sentences) {
    if (!sentences._hierarchyMeta) {
        return false;
    }

    const { dirtyNodeIds = [], dirtySentenceIds = [] } = sentences._hierarchyMeta;
    return dirtyNodeIds.length > 0 || dirtySentenceIds.length > 0;
}
