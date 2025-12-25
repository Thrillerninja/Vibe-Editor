/**
 * Deep Clone Utilities
 * Ensures proper snapshotting of sentences array with hierarchy metadata
 */

/**
 * Deep clones a sentences array with all its properties including _hierarchyMeta
 * @param {Array} sentences - Sentences array to clone
 * @returns {Array} Deep cloned sentences array
 */
export function deepCloneSentences(sentences) {
    if (!sentences || !Array.isArray(sentences)) {
        return sentences;
    }

    // Clone the array and all sentence objects with all their properties
    const cloned = sentences.map(sentence => ({
        ...sentence,
        // Deep clone emotion if present (nested object)
        emotion: sentence.emotion ? { ...sentence.emotion } : undefined,
    }));

    // Deep clone hierarchy metadata if present
    if (sentences._hierarchyMeta) {
        const meta = sentences._hierarchyMeta;

        cloned._hierarchyMeta = {
            // Clone root title
            rootTitle: meta.rootTitle,
            maxLevel: meta.maxLevel,
            // Deep clone nodes array with all properties
            nodes: meta.nodes ? meta.nodes.map(node => ({
                id: node.id,
                type: node.type,
                level: node.level,
                label: node.label,
                // Clone childIds array (critical!)
                childIds: [...node.childIds],
            })) : [],
            // Clone dirty tracking arrays
            dirtyNodeIds: meta.dirtyNodeIds ? [...meta.dirtyNodeIds] : undefined,
            dirtySentenceIds: meta.dirtySentenceIds ? [...meta.dirtySentenceIds] : undefined,
        };
    }

    return cloned;
}
