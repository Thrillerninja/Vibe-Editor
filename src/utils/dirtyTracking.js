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
