/**
 * Hierarchy Integration Utilities
 * Handles integration of AI-generated hierarchy into the tree structure
 */

import { LOGGING_ENABLED, LOG_PREFIX } from './constants';

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

    // Build a map of all nodes by ID
    const nodeMap = new Map();

    // Add sentence nodes to map (Level 1 - always at bottom)
    sentences.forEach(sentence => {
        // Use content as-is - don't add punctuation since it's already in the content
        // The sentence.punctuation field is only used during text reconstruction
        const label = sentence.content;

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
        });
    });

    // Add hierarchy nodes to map
    hierarchyNodes.forEach(node => {
        nodeMap.set(node.id, {
            id: node.id,
            type: 'group',
            level: node.level,
            label: node.label,
            content: '', // Groups don't have direct content
            children: [],
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
    };

    console.log(`${LOG_PREFIX.PARSER} Tree built with hierarchy: root + ${nodeMap.size} nodes`);

    return root;
}

/**
 * Builds a simple 2-level tree (root -> sentences) without hierarchy
 */
function buildSimpleTree(sentences, buildTextFromSentences) {
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
