/**
 * Hierarchy Integration Utilities
 * Handles integration of AI-generated hierarchy into the tree structure
 */

import { LOGGING_ENABLED, LOG_PREFIX } from './constants';

/**
 * Apply restructured subtrees to existing hierarchy
 * Replaces dirty portions with new structure while preserving clean parts
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

    // Find the highest existing node ID to generate new IDs if needed
    const maxNodeId = nodes.reduce((max, n) => {
        const match = n.id.match(/node-(\d+)/);
        return match ? Math.max(max, parseInt(match[1])) : max;
    }, -1);
    let nextNodeId = maxNodeId + 1;

    // Add new restructured subtrees
    for (const subtree of restructuredSubtrees) {
        console.log(`${LOG_PREFIX.PARSER} Adding ${subtree.newNodes.length} new nodes for subtree ${subtree.rootNodeId}`);

        // Add all new nodes, ensuring unique IDs
        for (const newNode of subtree.newNodes) {
            // Check if node ID already exists, if so generate a new one
            let nodeId = newNode.id;
            if (nodes.some(n => n.id === nodeId)) {
                nodeId = `node-${nextNodeId++}`;
                console.log(`${LOG_PREFIX.PARSER} Generated new ID ${nodeId} for duplicate ${newNode.id}`);
            }

            nodes.push({
                id: nodeId,
                type: 'group',
                level: newNode.level,
                label: newNode.title,
                childIds: newNode.childIds,
            });
        }
    }

    hierarchyMeta.nodes = nodes;

    // Update root title if provided
    if (newRootTitle) {
        console.log(`${LOG_PREFIX.PARSER} Updating root title: "${hierarchyMeta.rootTitle}" → "${newRootTitle}"`);
        hierarchyMeta.rootTitle = newRootTitle;
    }

    updatedSentences._hierarchyMeta = hierarchyMeta;

    console.log(`${LOG_PREFIX.PARSER} Hierarchy restructured: now ${nodes.length} nodes`);

    return updatedSentences;
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
            startIdx: 0,
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
            startIdx: sentence.startIdx,
            endIdx: sentence.endIdx,
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
                startIdx: sentence.startIdx,
                endIdx: sentence.endIdx,
                children: [],
                emotion: sentence.emotion,
                intensity: sentence.intensity,
            };
        }),
        startIdx: 0,
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
        const placeholderId = `placeholder-level-${level}`;

        // Determine what this placeholder contains
        let childIds;
        if (level === 2) {
            // Level 2 always contains sentences
            childIds = sentences.map(s => s.id);
        } else {
            // Higher levels contain the placeholder from the level below
            childIds = [`placeholder-level-${level - 1}`];
        }

        placeholderNodes.push({
            id: placeholderId,
            type: 'group',
            level: level,
            label: `Level ${level} - Awaiting AI generation...`,
            childIds: childIds,
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
