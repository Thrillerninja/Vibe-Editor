/**
 * Hierarchy Integration Utilities
 * Handles integration of AI-generated hierarchy into the tree structure
 */

import { v4 as uuidv4 } from 'uuid';
import { LOGGING_ENABLED, LOG_PREFIX } from './constants';
import { rebuildSentenceOrderFromHierarchy } from './sentenceEditor';
import { em } from 'framer-motion/client';
import { evaluateSentenceEmotions } from '../services/claude/claudeApi.js';
/**
 * Sorts hierarchy nodes by document order
 * Ensures that nodes appear in the order of their first sentence in the document
 * This is critical for rebuildSentenceOrderFromHierarchy to work correctly
 * @param {Array} nodes - Hierarchy nodes to sort
 * @param {Array} sentences - Sentences array
 * @returns {Array} Sorted nodes array
 */
export function sortNodesByDocumentOrder(nodes, sentences) {
    // Create a map for quick sentence lookup
    const sentencePositions = new Map();
    sentences.forEach((s, idx) => {
        sentencePositions.set(s.id, idx);
    });

    // Build node map for recursive lookups
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Calculate minimum sentence position for each node (recursively)
    const nodeMinPositions = new Map();

    const getMinPosition = (nodeId) => {
        // Check if it's a sentence
        if (sentencePositions.has(nodeId)) {
            return sentencePositions.get(nodeId);
        }

        // Check if already calculated
        if (nodeMinPositions.has(nodeId)) {
            return nodeMinPositions.get(nodeId);
        }

        // It's a hierarchy node - find min position from children
        const node = nodeMap.get(nodeId);
        if (!node) {
            console.warn(`${LOG_PREFIX.PARSER} Cannot find node ${nodeId} when sorting`);
            return Infinity;
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
    for (const node of nodes) {
        getMinPosition(node.id);
    }

    // Sort nodes by their minimum position (document order)
    const sorted = [...nodes].sort((a, b) => {
        const posA = nodeMinPositions.get(a.id) ?? Infinity;
        const posB = nodeMinPositions.get(b.id) ?? Infinity;
        return posA - posB;
    });

    console.log(`${LOG_PREFIX.PARSER} Sorted ${sorted.length} nodes by document order`);
    return sorted;
}

/**
 * Apply restructured subtrees to existing hierarchy
 * Replaces dirty portions with new structure while preserving clean parts
 * 
 * INTEGRATION ALGORITHM:
 * 1. Remove the dirty root node and all its descendants
 * 2. Add all new nodes from Claude's response
 * 3. The new top-level nodes (at the dirty root's level) automatically become
 *    children of the dirty root's parent when the tree is built
 * 
 * Example: Replacing placeholder-level-5
 * - Before: root → placeholder-level-5 → ... → sentences
 * - Remove: placeholder-level-5 and everything under it
 * - Add: New level-5, level-4, level-3, level-2 nodes
 * - Result: root → new level-5 nodes → new level-4 nodes → ... → sentences
 * 
 * @param {Array} sentences - Sentences array with existing hierarchy
 * @param {Array} dirtyRootNodeIds - IDs of nodes that were restructured
 * @param {Array} restructuredSubtrees - New structure for each dirty subtree
 * @param {string} newRootTitle - Optional new root title (if root was dirty)
 * @returns {Array} Updated sentences with restructured hierarchy
 */
export function applyDirtySubtreeRestructure(sentences, dirtyRootNodeIds, restructuredSubtrees, newRootTitle = null) {
    console.log(`${LOG_PREFIX.PARSER} Applying ${restructuredSubtrees.length} subtree restructures`);

    if (!sentences._hierarchyMeta) {
        console.warn(`${LOG_PREFIX.PARSER} No hierarchy metadata found`);
        return sentences;
    }

    const updatedSentences = sentences.map(s => ({ ...s }));
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    let nodes = hierarchyMeta.nodes.map(n => ({ ...n }));

    // Build a Set of dirty root node IDs for quick lookup
    const dirtyRootSet = new Set(dirtyRootNodeIds);

    // Remove all descendants of dirty root nodes
    const removeDescendants = (nodeId) => {
        const nodesToRemove = [];
        for (const node of nodes) {
            if (node.childIds.includes(nodeId)) {
                // This is a child, mark for removal and recurse
                nodesToRemove.push(node.id);
                removeDescendants(node.id);
            }
        }
        // Remove the descendants
        for (const idToRemove of nodesToRemove) {
            nodes = nodes.filter(n => n.id !== idToRemove);
        }
    };

    // Remove dirty root nodes and all their descendants
    for (const dirtyRootId of dirtyRootNodeIds) {
        removeDescendants(dirtyRootId);
        nodes = nodes.filter(n => n.id !== dirtyRootId);
        console.log(`${LOG_PREFIX.PARSER} Removed dirty subtree rooted at ${dirtyRootId}`);
    }

    // Add new restructured subtrees
    const newNodesToAdd = [];
    const existingNodeIds = new Set(nodes.map(n => n.id));

    for (const subtree of restructuredSubtrees) {
        console.log(`${LOG_PREFIX.PARSER} Adding ${subtree.newNodes.length} new nodes for subtree ${subtree.rootNodeId}`);

        // Collect all new nodes (Claude provides UUIDs)
        for (const newNode of subtree.newNodes) {
            // CRITICAL: Check for ID collisions with existing clean nodes
            if (existingNodeIds.has(newNode.id)) {
                console.error(`${LOG_PREFIX.PARSER} ⚠️ ERROR: Claude generated node ID ${newNode.id} that already exists!`);
                console.error(`${LOG_PREFIX.PARSER} This would cause duplicate nodes and data loss.`);
                console.error(`${LOG_PREFIX.PARSER} Existing node:`, nodes.find(n => n.id === newNode.id));
                console.error(`${LOG_PREFIX.PARSER} New node from Claude:`, newNode);

                // Generate a fresh UUID to avoid collision
                const freshId = uuidv4();
                console.warn(`${LOG_PREFIX.PARSER} Replacing colliding ID ${newNode.id} with fresh UUID ${freshId}`);

                newNodesToAdd.push({
                    id: freshId, // Use fresh UUID instead of colliding one
                    type: 'group',
                    level: newNode.level,
                    label: newNode.title,
                    childIds: newNode.childIds,
                    emotion: newNode.emotion,
                    intensity: newNode.intensity,
                });
            } else {
                newNodesToAdd.push({
                    id: newNode.id, // Use UUID from Claude
                    type: 'group',
                    level: newNode.level,
                    label: newNode.title,
                    childIds: newNode.childIds,
                    emotion: newNode.emotion,
                    intensity: newNode.intensity,
                });
            }
        }
    }

    // Add new nodes to the existing nodes array
    nodes.push(...newNodesToAdd);

    // CRITICAL: Sort nodes by document order to ensure sentence order is preserved
    // We need to sort nodes so that when rebuildSentenceOrderFromHierarchy processes them,
    // the sentences come out in the correct document order
    console.log(`${LOG_PREFIX.PARSER} Sorting ${nodes.length} nodes by document order`);
    nodes = sortNodesByDocumentOrder(nodes, updatedSentences);

    hierarchyMeta.nodes = nodes;

    // Update root title if provided
    if (newRootTitle) {
        console.log(`${LOG_PREFIX.PARSER} Updating root title: "${hierarchyMeta.rootTitle}" → "${newRootTitle}"`);
        hierarchyMeta.rootTitle = newRootTitle;
    }

    // CRITICAL: Rebuild sentence order from the new hierarchy to ensure document order
    // The nodes array now has the new structure, so we need to reorder sentences to match
    console.log(`${LOG_PREFIX.PARSER} Rebuilding sentence order from updated hierarchy`);
    const reorderedSentences = rebuildSentenceOrderFromHierarchy(updatedSentences, nodes, hierarchyMeta.maxLevel);

    // Reattach hierarchy metadata to the reordered sentences
    reorderedSentences._hierarchyMeta = hierarchyMeta;



    console.log(`${LOG_PREFIX.PARSER} Hierarchy restructured: now ${nodes.length} nodes`);

    console.log("[TEST] Reordered sentences after applying dirty subtree restructure:", reorderedSentences);

    // Ensure evaluation is fully completed before assignment
    return reorderedSentences;
}

/**
 * Apply title updates to dirty nodes in existing hierarchy
 * @param {Array} sentences - Sentences array with existing hierarchy
 * @param {Array} updates - Array of {nodeId, newTitle} objects from Claude
 * @returns {Array} Updated sentences with new titles for dirty nodes
 */
export function applyDirtyNodeUpdates(sentences, updates) {
    console.log(`${LOG_PREFIX.PARSER} Applying ${updates.length} node title updates`);

    if (!sentences._hierarchyMeta) {
        console.warn(`${LOG_PREFIX.PARSER} No hierarchy metadata found`);
        return sentences;
    }

    const updatedSentences = sentences.map(s => ({ ...s }));
    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n }));

    // Apply each update
    for (const update of updates) {
        const node = nodes.find(n => n.id === update.nodeId);
        if (node) {
            console.log(`${LOG_PREFIX.PARSER} Updating ${update.nodeId}: "${node.label}" → "${update.newTitle}"`);
            node.label = update.newTitle;
        } else {
            console.warn(`${LOG_PREFIX.PARSER} Node ${update.nodeId} not found in hierarchy`);
        }
    }

    hierarchyMeta.nodes = nodes;
    updatedSentences._hierarchyMeta = hierarchyMeta;

    return updatedSentences;
}

/**
 * Integrates AI-generated hierarchy with existing sentences
 * @param {Array} sentences - Array of sentence objects (SSOT)
 * @param {Object} hierarchy - AI-generated hierarchy from Claude
 * @param {string} hierarchy.rootTitle - Document title
 * @param {Array} hierarchy.nodes - Array of grouping nodes with levels (2 to maxDepth)
 * @returns {Array} Updated sentences with parent information
 * 
 * Note: Sentences are implicitly at Level 1. The hierarchy.nodes array contains
 * only the grouping nodes at levels 2 and above.
 */
export function integrateHierarchy(sentences, hierarchy) {
    console.log(`${LOG_PREFIX.PARSER} Integrating AI hierarchy...`);
    console.log(`${LOG_PREFIX.PARSER} Root title: ${hierarchy.rootTitle}`);
    console.log(`${LOG_PREFIX.PARSER} Hierarchy nodes: ${hierarchy.nodes.length}`);

    // Create a copy of sentences with parent information
    const updatedSentences = sentences.map(s => ({ ...s }));

    // Validate and store hierarchy nodes separately (they're not sentences)
    const hierarchyNodes = hierarchy.nodes.map(node => {
        // Ensure nodes are at level 2 or above (sentences are level 1)
        if (node.level < 2) {
            console.warn(`${LOG_PREFIX.PARSER} Warning: Node ${node.id} has invalid level ${node.level}, expected >= 2`);
        }

        return {
            id: node.id,
            type: 'group',
            level: node.level,
            label: node.title,
            childIds: node.childIds,
            emotion: node.emotion,
            intensity: node.intensity,
        };
    });

    // Calculate max level from hierarchy nodes
    const maxLevel = Math.max(...hierarchyNodes.map(n => n.level));

    // Attach metadata to sentences array
    // We store hierarchy in a special metadata object
    updatedSentences._hierarchyMeta = {
        rootTitle: hierarchy.rootTitle,
        nodes: hierarchyNodes,
        maxLevel: maxLevel,
    };

    console.log(`${LOG_PREFIX.PARSER} Hierarchy integrated:`);
    console.log(`${LOG_PREFIX.PARSER}   - Sentences (Level 1): ${sentences.length}`);
    console.log(`${LOG_PREFIX.PARSER}   - Grouping nodes (Level 2-${maxLevel}): ${hierarchyNodes.length}`);
    console.log(`${LOG_PREFIX.PARSER}   - Root title (Level ${maxLevel + 1}): "${hierarchy.rootTitle}"`);

    return updatedSentences;
}

/**
 * Builds hierarchical tree from sentences with AI-generated hierarchy
 * @param {Array} sentences - Sentence array with optional hierarchy metadata
 * @param {Function} buildTextFromSentences - Function to build text from sentences
 * @returns {Object} Tree structure
 * 
 * Level Structure:
 * - Level 1: Sentences (always at the bottom)
 * - Level 2 to (maxDepth-1): Grouping nodes
 * - Level maxDepth: Not represented as nodes, but as the root title
 * - Root node: Special node at the top containing level (maxDepth-1) nodes
 */
export function buildTreeWithHierarchy(sentences, buildTextFromSentences) {
    if (!sentences || sentences.length === 0) {
        return {
            id: 'root',
            type: 'root',
            label: 'Document',
            content: '',
            children: [],
            emotion: "NEUTRAL",
            intensity: 0,
        };
    }

    // Check if we have hierarchy metadata
    if (!sentences._hierarchyMeta) {
        console.log(`${LOG_PREFIX.PARSER} No hierarchy metadata, building simple tree`);
        // Fall back to simple 2-level tree
        return buildSimpleTree(sentences, buildTextFromSentences);
    }

    const { rootTitle, nodes: hierarchyNodes, maxLevel } = sentences._hierarchyMeta;

    console.log(`${LOG_PREFIX.PARSER} Building tree with AI hierarchy (max level: ${maxLevel})`);
    console.log(`${LOG_PREFIX.PARSER} Sentences (Level 1): ${sentences.length}`);
    console.log(`${LOG_PREFIX.PARSER} Grouping nodes (Level 2-${maxLevel}): ${hierarchyNodes.length}`);

    // Get dirty node info
    const dirtyNodeIds = new Set(sentences._hierarchyMeta.dirtyNodeIds || []);
    const dirtySentenceIds = new Set(sentences._hierarchyMeta.dirtySentenceIds || []);

    // Build a map of all nodes by ID
    const nodeMap = new Map();

    // Add sentence nodes to map (Level 1 - always at bottom)
    sentences.forEach(sentence => {
        // Use content as-is - don't add punctuation since it's already in the content
        // The sentence.punctuation field is only used during text reconstruction
        const label = sentence.content;
        const isDirty = dirtySentenceIds.has(sentence.id);

        nodeMap.set(sentence.id, {
            id: sentence.id,
            type: 'sentence',
            level: 1, // CRITICAL: Sentences are ALWAYS level 1 (bottom of hierarchy)
            label: label,
            content: sentence.content,
            children: [],
            emotion: sentence.emotion,
            intensity: sentence.intensity,
            isDirty: isDirty,
        });
    });

    // Add hierarchy nodes to map
    hierarchyNodes.forEach(node => {
        const isDirty = dirtyNodeIds.has(node.id);

        nodeMap.set(node.id, {
            id: node.id,
            type: 'group',
            level: node.level,
            label: node.label,
            content: '', // Groups don't have direct content
            children: [],
            isDirty: isDirty,
            emotion: node.emotion,
            intensity: node.intensity,
        });
    });

    // Build parent-child relationships
    hierarchyNodes.forEach(node => {
        const parent = nodeMap.get(node.id);
        node.childIds.forEach(childId => {
            const child = nodeMap.get(childId);
            if (child) {
                parent.children.push(child);
            } else {
                console.warn(`${LOG_PREFIX.PARSER} Child node not found: ${childId}`);
            }
        });
    });

    // Build root node
    const topLevelNodes = Array.from(nodeMap.values()).filter(
        node => node.level === maxLevel
    );

    const root = {
        id: 'root',
        type: 'root',
        label: rootTitle,
        content: buildTextFromSentences(sentences),
        children: topLevelNodes,
        startIdx: 0,
        isDirty: dirtyNodeIds.has('root'),
        emotion: "NEUTRAL",
        intensity: 0,
    };

    console.log(`${LOG_PREFIX.PARSER} Tree built with hierarchy: root + ${nodeMap.size} nodes`);

    return root;
}

/**
 * Builds a simple 2-level tree (root -> sentences) without hierarchy
 */
function buildSimpleTree(sentences, buildTextFromSentences) {
    // Default simple tree (no AI, depth = 2)
    return {
        id: 'root',
        type: 'root',
        label: 'Document',
        content: buildTextFromSentences(sentences),
        children: sentences.map(sentence => {
            // Use content as-is - punctuation is already included in sentence.content
            // The sentence.punctuation field is only used during text reconstruction
            return {
                id: sentence.id,
                type: 'sentence',
                label: sentence.content,
                content: sentence.content,
                children: [],
                emotion: sentence.emotion || "NEUTRAL",
                intensity: sentence.intensity || 0,
            };
        }),
        startIdx: 0,
        emotion: "NEUTRAL",
        intensity: 0,
    };
}

/**
 * Removes hierarchy metadata from sentences
 * Used when user wants to clear the hierarchy
 */
export function clearHierarchy(sentences) {
    const cleaned = sentences.map(s => ({ ...s }));
    delete cleaned._hierarchyMeta;
    return cleaned;
}

/**
 * Creates a minimal placeholder hierarchy structure with all nodes marked as dirty
 * This allows the dirty-update logic to generate the full hierarchy
 * @param {Array} sentences - Sentences array
 * @param {number} maxDepth - Target hierarchy depth
 * @returns {Array} Sentences with placeholder hierarchy metadata (all marked dirty)
 */
export function createPlaceholderHierarchy(sentences, maxDepth) {
    console.log(`${LOG_PREFIX.PARSER} Creating placeholder hierarchy (depth ${maxDepth}) - all nodes marked dirty`);

    const updatedSentences = sentences.map(s => ({ ...s }));

    // Create a chain of placeholder nodes from level 2 up to maxDepth-1
    // Each level contains one placeholder that groups all children from the level below
    // 
    // Example for maxDepth=4:
    // - Level 3 placeholder contains level 2 placeholder
    // - Level 2 placeholder contains all sentences
    // 
    // This creates the minimal structure needed for the dirty-update logic to work
    const placeholderNodes = [];
    const dirtyNodeIds = [];

    // Start from level 2 (first grouping level) up to maxDepth-1 (highest grouping level)
    for (let level = 2; level < maxDepth; level++) {
        const placeholderId = uuidv4(); // Generate UUID for placeholder

        // Determine what this placeholder contains
        let childIds;
        if (level === 2) {
            // Level 2 always contains sentences
            childIds = sentences.map(s => s.id);
        } else {
            // Higher levels contain the placeholder from the level below
            childIds = [placeholderNodes[placeholderNodes.length - 1].id];
        }

        placeholderNodes.push({
            id: placeholderId,
            type: 'group',
            level: level,
            label: `Level ${level} - Awaiting AI generation...`,
            childIds: childIds,
            emotion: "NEUTRAL",
            intensity: 0,
        });

        dirtyNodeIds.push(placeholderId);
    }

    // Mark the root node as dirty so its title will be regenerated
    dirtyNodeIds.push('root');

    // Create hierarchy metadata with all placeholders marked as dirty
    updatedSentences._hierarchyMeta = {
        rootTitle: 'Document - Awaiting AI generation...',
        nodes: placeholderNodes,
        maxLevel: maxDepth - 1,
        dirtyNodeIds: dirtyNodeIds,
        dirtySentenceIds: sentences.map(s => s.id), // All sentences are "new" to the hierarchy
    };

    console.log(`${LOG_PREFIX.PARSER} Placeholder hierarchy created with ${placeholderNodes.length} placeholder nodes (all dirty)`);

    return updatedSentences;
}
