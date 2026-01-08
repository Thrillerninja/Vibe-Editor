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
 * Marks a sentence itself and all its ancestor nodes as dirty
 * Lightweight helper when you only need to flag one sentence and its chain
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {string} sentenceId - ID of the sentence to mark
 * @returns {Array} Updated sentences with dirty flags
 */
export function markSentenceAndAncestorsDirty(sentences, sentenceId) {
    if (!sentences._hierarchyMeta) {
        return sentences;
    }

    console.log(`${LOG_PREFIX.PARSER} Marking sentence and ancestors dirty: ${sentenceId}`);

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n }));

    const dirtyNodeIds = new Set(hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(hierarchyMeta.dirtySentenceIds || []);

    // Mark the sentence itself dirty
    dirtySentenceIds.add(sentenceId);

    // Mark all ancestors (and root if at top level)
    markAncestorsAsDirty(sentenceId, nodes, dirtyNodeIds);

    // Persist metadata
    hierarchyMeta.nodes = nodes;
    hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodeIds);
    hierarchyMeta.dirtySentenceIds = Array.from(dirtySentenceIds);
    updated._hierarchyMeta = hierarchyMeta;

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

    /* delete hierarchyMeta.dirtyNodeIds;
    delete hierarchyMeta.dirtySentenceIds; */
    delete hierarchyMeta.dirtyNodeIds;
    delete hierarchyMeta.dirtySentenceIds;
    delete hierarchyMeta.dirtyLabelNodeIds;


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

    /* const { dirtyNodeIds = [], dirtySentenceIds = [] } = sentences._hierarchyMeta;
    return dirtyNodeIds.length > 0 || dirtySentenceIds.length > 0; */
    const { dirtyNodeIds = [], dirtySentenceIds = [], dirtyLabelNodeIds = [] } = sentences._hierarchyMeta;
    return dirtyNodeIds.length > 0 || dirtySentenceIds.length > 0 || dirtyLabelNodeIds.length > 0;

}

/**
 * Adds a new sentence to the hierarchy with dirty placeholder parents
 * Instead of clearing the hierarchy, preserves existing structure and adds the new sentence
 * with its own placeholder parent chain marked as dirty
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {Object} newSentence - The new sentence to add
 * @param {number} insertIndex - Index where sentence is being inserted
 * @returns {Array} Updated sentences with hierarchy
 */
export function addSentenceToHierarchy(sentences, newSentence, insertIndex) {
    if (!sentences._hierarchyMeta) {
        console.log(`${LOG_PREFIX.PARSER} No hierarchy to add sentence to`);
        return sentences;
    }

    console.log(`${LOG_PREFIX.PARSER} Adding sentence ${newSentence.id} to hierarchy at index ${insertIndex}`);

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n }));
    const dirtyNodeIds = new Set(hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(hierarchyMeta.dirtySentenceIds || []);

    // Mark the new sentence as dirty
    dirtySentenceIds.add(newSentence.id);

    // Always create a new placeholder parent chain for the added sentence
    // This ensures it gets its own structure that can be regenerated by AI
    console.log(`${LOG_PREFIX.PARSER} Creating placeholder parent chain for new sentence`);

    const { v4: uuidv4 } = require('uuid');
    const maxLevel = hierarchyMeta.maxLevel || 2;

    // Create a chain of placeholder nodes from level 2 up to maxLevel
    let currentChildId = newSentence.id;

    for (let level = 2; level <= maxLevel; level++) {
        const placeholderId = uuidv4();

        nodes.push({
            id: placeholderId,
            type: 'group',
            level: level,
            label: `Level ${level} - New content (pending AI)`,
            childIds: [currentChildId],
        });

        dirtyNodeIds.add(placeholderId);
        currentChildId = placeholderId;
    }

    // Mark root as dirty since we have new top-level content
    dirtyNodeIds.add('root');

    console.log(`${LOG_PREFIX.PARSER} Added sentence to hierarchy with placeholder parent chain`);

    // Update metadata
    hierarchyMeta.nodes = nodes;
    hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodeIds);
    hierarchyMeta.dirtySentenceIds = Array.from(dirtySentenceIds);
    updated._hierarchyMeta = hierarchyMeta;

    return updated;
}

/**
 * Removes a sentence from the hierarchy while preserving structure
 * Marks parent as dirty or removes it if it has no other children
 * @param {Array} sentences - Sentences array with hierarchy metadata
 * @param {string} sentenceId - ID of the sentence to remove
 * @returns {Array} Updated sentences with hierarchy
 */
export function removeSentenceFromHierarchy(sentences, sentenceId) {
    if (!sentences._hierarchyMeta) {
        console.log(`${LOG_PREFIX.PARSER} No hierarchy to remove sentence from`);
        return sentences;
    }

    console.log(`${LOG_PREFIX.PARSER} Removing sentence ${sentenceId} from hierarchy`);

    const updated = [...sentences];
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    let nodes = hierarchyMeta.nodes.map(n => ({ ...n }));
    const dirtyNodeIds = new Set(hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(hierarchyMeta.dirtySentenceIds || []);

    // Remove from dirty sentences if present
    dirtySentenceIds.delete(sentenceId);

    // Find the parent node that contains this sentence
    const parentNode = nodes.find(n => n.childIds.includes(sentenceId));

    if (parentNode) {
        // Remove the sentence from parent's childIds
        parentNode.childIds = parentNode.childIds.filter(id => id !== sentenceId);
        console.log(`${LOG_PREFIX.PARSER} Removed sentence from parent ${parentNode.id}`);

        // Check if parent now has no children
        if (parentNode.childIds.length === 0) {
            // Remove the empty parent node and propagate upward
            console.log(`${LOG_PREFIX.PARSER} Parent ${parentNode.id} now empty, removing it`);
            const parentId = parentNode.id;
            nodes = nodes.filter(n => n.id !== parentId);
            dirtyNodeIds.delete(parentId);

            // Recursively remove empty ancestors
            let currentId = parentId;
            let continueRemoving = true;

            while (continueRemoving) {
                const grandparent = nodes.find(n => n.childIds.includes(currentId));

                if (grandparent) {
                    // Remove current node from grandparent
                    grandparent.childIds = grandparent.childIds.filter(id => id !== currentId);

                    if (grandparent.childIds.length === 0) {
                        // Grandparent is now empty too, remove it
                        console.log(`${LOG_PREFIX.PARSER} Ancestor ${grandparent.id} now empty, removing it`);
                        nodes = nodes.filter(n => n.id !== grandparent.id);
                        dirtyNodeIds.delete(grandparent.id);
                        currentId = grandparent.id;
                    } else {
                        // Grandparent still has children, mark it as dirty and stop
                        console.log(`${LOG_PREFIX.PARSER} Ancestor ${grandparent.id} still has children, marking dirty`);
                        dirtyNodeIds.add(grandparent.id);
                        markAncestorsAsDirty(grandparent.id, nodes, dirtyNodeIds);
                        continueRemoving = false;
                    }
                } else {
                    // No grandparent found, mark root as dirty and stop
                    console.log(`${LOG_PREFIX.PARSER} Reached top level, marking root as dirty`);
                    dirtyNodeIds.add('root');
                    continueRemoving = false;
                }
            }
        } else {
            // Parent still has children, just mark it as dirty
            console.log(`${LOG_PREFIX.PARSER} Parent still has ${parentNode.childIds.length} children, marking dirty`);
            dirtyNodeIds.add(parentNode.id);
            markAncestorsAsDirty(parentNode.id, nodes, dirtyNodeIds);
        }
    } else {
        // Sentence not found in any parent - it might be a top-level node
        console.log(`${LOG_PREFIX.PARSER} Sentence not in any parent node, marking root as dirty`);
        dirtyNodeIds.add('root');
    }

    console.log(`${LOG_PREFIX.PARSER} Removed sentence from hierarchy with dirty markers`);

    // Update metadata
    hierarchyMeta.nodes = nodes;
    hierarchyMeta.dirtyNodeIds = Array.from(dirtyNodeIds);
    hierarchyMeta.dirtySentenceIds = Array.from(dirtySentenceIds);
    updated._hierarchyMeta = hierarchyMeta;

    return updated;
}


