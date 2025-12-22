/**
 * Sentence Editor Utilities
 * Handles direct editing of sentence array based on text changes
 */

import { v4 as uuidv4 } from 'uuid';
import { LOGGING_ENABLED, LOG_PREFIX } from './constants';
import { markSentenceAsDirty, markSentencesAsDirty, markReorderAsDirty } from './dirtyTracking';

/**
 * Finds which sentence contains a given text position
 * @param {Array} sentences - Array of sentence objects
 * @param {number} position - Position in the full text
 * @returns {Object|null} {sentence, index} or null if not found
 */
export function findSentenceAtPosition(sentences, position) {
    let currentPos = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const sentenceLength = sentence.content.length;

        // Calculate actual delimiter length (can be newline, paragraph break, or space)
        let delimiterLength = 0;
        if (i < sentences.length - 1) {
            if (sentence.delimiterContent !== undefined) {
                delimiterLength = sentence.delimiterContent.length;
            } else if (sentence.delimiter === 'paragraph') {
                delimiterLength = 2; // \n\n
            } else if (sentence.delimiter === 'newline') {
                delimiterLength = 1; // \n
            } else if (sentence.delimiter === 'space') {
                delimiterLength = 1; // space
            }
        }

        // Check if position is within this sentence
        if (position >= currentPos && position <= currentPos + sentenceLength) {
            return {
                sentence,
                index: i,
                localPosition: position - currentPos,
                startPos: currentPos,
                endPos: currentPos + sentenceLength,
            };
        }

        // Move to next sentence (including delimiter)
        currentPos += sentenceLength + delimiterLength;
    }

    // Position is at the very end
    if (sentences.length > 0 && position >= currentPos) {
        const lastIndex = sentences.length - 1;
        const lastSentence = sentences[lastIndex];
        return {
            sentence: lastSentence,
            index: lastIndex,
            localPosition: lastSentence.content.length,
            startPos: currentPos - lastSentence.content.length,
            endPos: currentPos,
        };
    }

    return null;
}

/**
 * Applies a text edit to the sentence array
 * Handles insertion, deletion, and replacement
 * Automatically splits sentences on punctuation
 * PRESERVES hierarchy metadata from AI generation
 * 
 * @param {Array} sentences - Current sentence array
 * @param {string} newText - The new full text after edit
 * @param {number} cursorPosition - Where the cursor is after the edit
 * @returns {Array} Updated sentence array
 */
export function applySentenceEdit(sentences, newText, cursorPosition) {
    console.log(`${LOG_PREFIX.PARSER} Applying edit at cursor position ${cursorPosition}`);

    // Handle empty text
    if (!newText || newText.trim() === '') {
        console.log(`${LOG_PREFIX.PARSER} Text is empty, clearing sentences`);
        return [];
    }

    // Preserve hierarchy metadata if present
    const hierarchyMeta = sentences._hierarchyMeta;

    // Split the new text into sentences
    const newSentences = parseIntoSentences(newText);

    // Track which old sentences have been matched to avoid reusing the same ID
    const usedSentences = new Set();

    // Preserve emotion metadata and IDs when possible
    const updatedSentences = newSentences.map((newSent, index) => {
        // Try to match with existing sentence by content similarity
        const matchingSentence = findMatchingSentence(sentences, newSent.content, usedSentences);

        if (matchingSentence) {
            // Mark this sentence as used
            usedSentences.add(matchingSentence.id);

            // Preserve ID and metadata from matching sentence
            // This prevents ReactFlow from seeing them as new nodes
            return {
                ...newSent,
                id: matchingSentence.id, // CRITICAL: Preserve ID to prevent re-animation
                emotion: matchingSentence.emotion,
                intensity: matchingSentence.intensity,
                // Trust the parsed delimiter/punctuation from text (user's input)
                // Defaults only apply during graph operations (reordering)
            };
        }

        return newSent;
    });

    // Handle hierarchy metadata based on what changed
    if (hierarchyMeta) {
        if (usedSentences.size === sentences.length && updatedSentences.length === sentences.length) {
            // No sentences added/removed - preserve hierarchy and mark changed sentences as dirty
            updatedSentences._hierarchyMeta = hierarchyMeta;

            // Find which sentences changed content
            const changedSentenceIds = [];
            for (const newSent of updatedSentences) {
                const oldSent = sentences.find(s => s.id === newSent.id);
                if (oldSent && oldSent.content !== newSent.content) {
                    changedSentenceIds.push(newSent.id);
                }
            }

            if (changedSentenceIds.length > 0) {
                console.log(`${LOG_PREFIX.PARSER} ${changedSentenceIds.length} sentences modified, marking as dirty`);
                return markSentencesAsDirty(updatedSentences, changedSentenceIds);
            }

            console.log(`${LOG_PREFIX.PARSER} Preserved hierarchy metadata (no content changes)`);
        } else {
            // Sentences added/removed - clear hierarchy completely
            console.log(`${LOG_PREFIX.PARSER} Structure changed (${sentences.length} → ${updatedSentences.length}), clearing hierarchy`);
        }
    }

    console.log(`${LOG_PREFIX.PARSER} Updated from ${sentences.length} to ${updatedSentences.length} sentences`);
    return updatedSentences;
}

/**
 * Parses text into sentence objects with proper indices
 * Separators (in order of priority):
 * 1. Sentence-ending punctuation (.!?) optionally followed by whitespace/newlines
 * 2. Single or multiple newlines (paragraph/line breaks)
 * 
 * Each sentence stores its TRAILING delimiter (what comes after it)
 * Each sentence gets a UUID (order is implicit from array position)
 * 
 * @param {string} text - Full text to parse
 * @returns {Array} Array of sentence objects
 */
function parseIntoSentences(text) {
    const sentences = [];
    let currentIndex = 0;

    // Split by:
    // - Sentence-ending punctuation (.!?) followed by any whitespace/newlines
    // - OR double newlines (paragraph breaks) 
    // - OR single newlines (even without punctuation)
    // The regex captures the delimiter so we can track position
    // Note: The lookbehind (?<=[.!?]) is optional to allow splitting on bare newlines
    const parts = text.split(/((?<=[.!?])[\s\n]+|\n\n+|\n(?!\s*$))/);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (part === '') {
            continue;
        }

        // Check if this is a delimiter
        // Delimiters can be:
        // - Whitespace/newlines after punctuation
        // - Standalone newlines (single or multiple)
        const isDelimiter = /^([\s\n]+|\n\n+|\n)$/.test(part);

        if (isDelimiter) {
            currentIndex += part.length;
            continue;
        }

        // Skip whitespace-only parts
        if (part.trim() === '') {
            currentIndex += part.length;
            continue;
        }

        const startIdx = currentIndex;
        const endIdx = startIdx + part.length; // Use original length for tracking

        // Look ahead to find the delimiter that comes AFTER this sentence
        let trailingDelimiter = '';
        if (i + 1 < parts.length) {
            const nextPart = parts[i + 1];
            // Check if next part is a delimiter (spaces/newlines)
            // Note: no lookbehind here since we're testing the isolated part
            if (/^([\s\n]+|\n\n+|\n)$/.test(nextPart)) {
                trailingDelimiter = nextPart;
            }
        }

        // Process sentence content based on whether it has a trailing delimiter
        let sentenceText;
        if (trailingDelimiter) {
            // Has delimiter after: safe to trim since spacing is handled by delimiter
            sentenceText = part.trim();
        } else {
            // No delimiter (last sentence): only trim leading space, preserve trailing
            sentenceText = part.trimStart();
        }

        // Skip if empty after trimming
        if (!sentenceText) {
            currentIndex += part.length;
            continue;
        }

        // Determine delimiter type for this sentence's END
        let delimiterType = 'none'; // Last sentence has no trailing delimiter
        let punctuation = undefined; // Only set if sentence actually has punctuation

        if (trailingDelimiter) {
            // Check if sentence already ends with punctuation
            const lastChar = sentenceText[sentenceText.length - 1];
            if ('.!?'.includes(lastChar)) {
                punctuation = lastChar;
            }

            // Determine spacing after punctuation
            if (trailingDelimiter.includes('\n\n') || /\n\n+/.test(trailingDelimiter)) {
                delimiterType = 'paragraph'; // double newline or more
            } else if (trailingDelimiter.includes('\n')) {
                delimiterType = 'newline'; // single newline
            } else {
                delimiterType = 'space'; // just space
            }
        } else {
            // No trailing delimiter - check if sentence ends with punctuation
            const lastChar = sentenceText[sentenceText.length - 1];
            if ('.!?'.includes(lastChar)) {
                punctuation = lastChar;
            }
            delimiterType = 'none'; // Nothing after this sentence
        }

        sentences.push({
            id: uuidv4(),
            type: 'sentence',
            content: sentenceText,
            emotion: 'NEUTRAL',
            intensity: 0,
            startIdx: startIdx,
            endIdx: endIdx,
            punctuation: punctuation, // What punctuation mark to use
            delimiter: delimiterType, // What comes after the punctuation (semantic type)
            delimiterContent: trailingDelimiter, // Actual delimiter string (preserves exact formatting)
        });

        currentIndex = endIdx;
    }

    console.log(`${LOG_PREFIX.PARSER} Parsed ${sentences.length} sentences from text`);
    return sentences;
}

/**
 * Finds a matching sentence based on content similarity
 * Uses simple string matching for now
 * @param {Array} sentences - Existing sentences
 * @param {string} content - Content to match
 * @param {Set} usedSentences - Set of sentence IDs that have already been matched
 * @returns {Object|null} Matching sentence or null
 */
function findMatchingSentence(sentences, content, usedSentences) {
    // Exact match - skip already used sentences
    for (const sentence of sentences) {
        if (sentence.content === content && !usedSentences.has(sentence.id)) {
            return sentence;
        }
    }

    // Fuzzy match: check if content is very similar (80% similarity) - skip already used
    for (const sentence of sentences) {
        if (usedSentences.has(sentence.id)) continue;

        const similarity = calculateSimilarity(sentence.content, content);
        if (similarity > 0.8) {
            return sentence;
        }
    }

    return null;
}

/**
 * Calculates simple similarity score between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score 0-1
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
        return 1.0;
    }

    // Simple approach: Levenshtein distance
    const distance = levenshteinDistance(str1, str2);
    return (longer.length - distance) / longer.length;
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
}

/**
 * Recalculates startIdx and endIdx for all sentences
 * Call this after reordering or structural changes
 * @param {Array} sentences - Sentence array to update
 * @returns {Array} Updated sentence array with correct indices
 */
export function recalculateIndices(sentences) {
    let currentIndex = 0;

    return sentences.map((sentence, i) => {
        const startIdx = currentIndex;
        const endIdx = startIdx + sentence.content.length;

        currentIndex = endIdx;
        if (i < sentences.length - 1) {
            currentIndex += 1; // Space between sentences
        }

        return {
            ...sentence,
            startIdx,
            endIdx,
        };
    });
}

/**
 * Applies reordering to sentence array after drag-and-drop in tree
 * Handles both sentence-level and hierarchy-level reordering
 * Supports cross-parent moves (nodes can be reordered across different parents on the same level)
 *
 * @param {Array} sentences - Current sentence array
 * @param {string} draggedId - ID of the dragged node
 * @param {string} targetId - ID of the target sibling node
 * @param {boolean} insertBefore - Whether to insert before or after target
 * @returns {Array} Reordered sentence array with dirty flags set
 */
export function applyReordering(sentences, draggedId, targetId, insertBefore) {
    console.log(`${LOG_PREFIX.PARSER} Applying reordering: ${draggedId} → ${insertBefore ? 'before' : 'after'} ${targetId}`);

    // Check if we have hierarchy metadata
    const hasHierarchy = !!sentences._hierarchyMeta;

    // Check if dragged node is a sentence
    const isSentence = sentences.some(s => s.id === draggedId);

    if (isSentence) {
        // Sentence-level reordering (Level 1)
        return reorderSentence(sentences, draggedId, targetId, insertBefore);
    } else if (hasHierarchy) {
        // Hierarchy node reordering (Level 2+)
        return reorderHierarchyNode(sentences, draggedId, targetId, insertBefore);
    } else {
        console.warn(`${LOG_PREFIX.PARSER} Cannot reorder: node ${draggedId} not found`);
        return sentences;
    }
}

/**
 * Reorders a sentence in the sentences array
 * Preserves hierarchy metadata and updates parent node's childIds
 * @param {Array} sentences - Current sentence array
 * @param {string} draggedId - ID of the dragged sentence
 * @param {string} targetId - ID of the target sibling sentence
 * @param {boolean} insertBefore - Whether to insert before or after target
 * @returns {Array} Reordered sentence array
 */
function reorderSentence(sentences, draggedId, targetId, insertBefore) {
    console.log(`${LOG_PREFIX.PARSER} Reordering sentence ${draggedId} ${insertBefore ? 'before' : 'after'} ${targetId}`);

    // Preserve hierarchy metadata if it exists
    let oldParentId = null;
    let newParentId = null;

    if (sentences._hierarchyMeta) {
        console.log(`${LOG_PREFIX.PARSER} Hierarchy exists - updating childIds and rebuilding sentence order`);

        const hierarchyMeta = { ...sentences._hierarchyMeta };
        const nodes = hierarchyMeta.nodes.map(n => ({ ...n, childIds: [...n.childIds] }));

        // Find which parent node(s) contain these sentences
        const draggedParent = nodes.find(n => n.childIds.includes(draggedId));
        const targetParent = nodes.find(n => n.childIds.includes(targetId));

        if (draggedParent && targetParent) {
            oldParentId = draggedParent.id;
            newParentId = targetParent.id;

            if (draggedParent.id === targetParent.id) {
                // Same parent - reorder within parent's childIds
                console.log(`${LOG_PREFIX.PARSER} Reordering within same parent: ${draggedParent.id}`);

                const parent = draggedParent;
                const draggedIdx = parent.childIds.indexOf(draggedId);
                const targetIdx = parent.childIds.indexOf(targetId);

                // Remove from old position
                parent.childIds.splice(draggedIdx, 1);

                // Calculate new position
                const newTargetIdx = parent.childIds.indexOf(targetId);
                const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;

                // Insert at new position
                parent.childIds.splice(insertIdx, 0, draggedId);

                console.log(`${LOG_PREFIX.PARSER} Updated parent childIds: ${parent.childIds.join(', ')}`);
            } else {
                // Different parents - move sentence to new parent
                console.log(`${LOG_PREFIX.PARSER} Moving sentence from parent ${draggedParent.id} to ${targetParent.id}`);

                // Remove from old parent
                const draggedIdx = draggedParent.childIds.indexOf(draggedId);
                draggedParent.childIds.splice(draggedIdx, 1);

                // Add to new parent
                const targetIdx = targetParent.childIds.indexOf(targetId);
                const insertIdx = insertBefore ? targetIdx : targetIdx + 1;
                targetParent.childIds.splice(insertIdx, 0, draggedId);

                console.log(`${LOG_PREFIX.PARSER} Old parent childIds: ${draggedParent.childIds.join(', ')}`);
                console.log(`${LOG_PREFIX.PARSER} New parent childIds: ${targetParent.childIds.join(', ')}`);
            }
        } else {
            console.log(`${LOG_PREFIX.PARSER} Sentences not in hierarchy nodes (may be top-level)`);
        }

        // Update hierarchy metadata
        hierarchyMeta.nodes = nodes;

        // Rebuild sentences array from hierarchy to ensure order consistency
        const reorderedSentences = rebuildSentenceOrderFromHierarchy(sentences, nodes, hierarchyMeta.maxLevel);
        reorderedSentences._hierarchyMeta = hierarchyMeta;

        console.log(`${LOG_PREFIX.PARSER} Rebuilt sentence order from hierarchy`);

        // Mark the reordered sentence and its parents as dirty
        const result = markReorderAsDirty(reorderedSentences, draggedId, oldParentId, newParentId);

        return result;
    } else {
        // No hierarchy - simple array reordering
        console.log(`${LOG_PREFIX.PARSER} No hierarchy - performing simple sentence reordering`);

        const updated = [...sentences];

        // Find indices
        const draggedIndex = updated.findIndex(s => s.id === draggedId);
        const targetIndex = updated.findIndex(s => s.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            console.warn(`${LOG_PREFIX.PARSER} Cannot reorder: sentence not found`);
            return sentences;
        }

        // Remove dragged sentence
        const [draggedSentence] = updated.splice(draggedIndex, 1);

        // Calculate new insertion index
        // Need to recalculate target index after removal
        const newTargetIndex = updated.findIndex(s => s.id === targetId);
        const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;

        // Insert at new position
        updated.splice(insertIndex, 0, draggedSentence);

        console.log(`${LOG_PREFIX.PARSER} Sentence moved from index ${draggedIndex} to ${insertIndex}`);

        // Mark the reordered sentence as dirty (no hierarchy to update)
        const result = markReorderAsDirty(updated, draggedId);

        return result;
    }
}

/**
 * Collects all descendant sentence IDs from a hierarchy node (recursively)
 * @param {string} nodeId - ID of the hierarchy node
 * @param {Array} hierarchyNodes - Array of hierarchy nodes
 * @param {Array} sentences - Array of sentences
 * @param {number} depth - Current recursion depth (for logging)
 * @returns {Array} Array of sentence IDs
 */
function collectDescendantSentences(nodeId, hierarchyNodes, sentences, depth = 0) {
    const indent = '  '.repeat(depth);
    const node = hierarchyNodes.find(n => n.id === nodeId);

    if (!node) {
        // Check if it's a sentence ID
        if (sentences.some(s => s.id === nodeId)) {
            console.log(`${LOG_PREFIX.PARSER}${indent}  → Sentence: ${nodeId}`);
            return [nodeId];
        }
        console.log(`${LOG_PREFIX.PARSER}${indent}  → Not found: ${nodeId}`);
        return [];
    }

    console.log(`${LOG_PREFIX.PARSER}${indent}Node ${nodeId} (${node.label}) has ${node.childIds.length} children`);

    const result = [];
    for (let i = 0; i < node.childIds.length; i++) {
        const childId = node.childIds[i];
        console.log(`${LOG_PREFIX.PARSER}${indent}  [${i}] Processing child: ${childId}`);

        // Check if child is a sentence or another hierarchy node
        const isSentence = sentences.some(s => s.id === childId);
        if (isSentence) {
            const sentence = sentences.find(s => s.id === childId);
            console.log(`${LOG_PREFIX.PARSER}${indent}    → Sentence: "${sentence.content.substring(0, 30)}..."`);
            result.push(childId);
        } else {
            // Recursively collect from child node
            console.log(`${LOG_PREFIX.PARSER}${indent}    → Descending into child node...`);
            const childSentences = collectDescendantSentences(childId, hierarchyNodes, sentences, depth + 1);
            result.push(...childSentences);
        }
    }

    console.log(`${LOG_PREFIX.PARSER}${indent}Node ${nodeId} collected ${result.length} total sentences`);
    return result;
}

/**
 * Rebuilds the sentences array to match the hierarchy order
 * @param {Array} sentences - Current sentence array
 * @param {Array} hierarchyNodes - Updated hierarchy nodes
 * @param {number} maxLevel - Maximum level in the hierarchy
 * @returns {Array} Reordered sentence array
 */
export function rebuildSentenceOrderFromHierarchy(sentences, hierarchyNodes, maxLevel) {
    console.log(`${LOG_PREFIX.PARSER} Rebuilding sentence order from hierarchy (maxLevel: ${maxLevel})`);

    // Find top-level nodes by level (these are direct children of root)
    const topLevelNodes = hierarchyNodes.filter(n => n.level === maxLevel);

    console.log(`${LOG_PREFIX.PARSER} Found ${topLevelNodes.length} top-level nodes at level ${maxLevel}`);
    console.log(`${LOG_PREFIX.PARSER} Top-level node IDs: ${topLevelNodes.map(n => n.id).join(', ')}`);

    // Collect sentence IDs in the new hierarchy order
    // Process nodes in the order they appear in the array (which reflects reordering)
    const orderedSentenceIds = [];
    for (const topLevelNode of topLevelNodes) {
        console.log(`${LOG_PREFIX.PARSER} Collecting sentences from node ${topLevelNode.id} (${topLevelNode.label})`);
        const descendantIds = collectDescendantSentences(topLevelNode.id, hierarchyNodes, sentences);
        console.log(`${LOG_PREFIX.PARSER}   Found ${descendantIds.length} sentences: ${descendantIds.join(', ')}`);
        orderedSentenceIds.push(...descendantIds);
    }

    console.log(`${LOG_PREFIX.PARSER} Collected ${orderedSentenceIds.length} sentences in new order`);
    console.log(`${LOG_PREFIX.PARSER} Order: ${orderedSentenceIds.join(', ')}`);

    // Create a map of sentences by ID for quick lookup
    const sentenceMap = new Map(sentences.map(s => [s.id, s]));

    // Build new sentences array in the correct order
    const reordered = orderedSentenceIds.map(id => sentenceMap.get(id)).filter(Boolean);

    console.log(`${LOG_PREFIX.PARSER} Reordered ${reordered.length} sentences to match hierarchy`);

    return reordered;
}

/**
 * Reorders a hierarchy node by updating parent's childIds
 * Supports cross-parent moves (moving between different parents on the same level)
 * Also reorders the sentences array to match the new hierarchy order
 * @param {Array} sentences - Current sentence array with hierarchy
 * @param {string} draggedId - ID of the dragged hierarchy node
 * @param {string} targetId - ID of the target sibling node
 * @param {boolean} insertBefore - Whether to insert before or after target
 * @returns {Array} Updated sentence array with modified hierarchy
 */
function reorderHierarchyNode(sentences, draggedId, targetId, insertBefore) {
    console.log(`${LOG_PREFIX.PARSER} Reordering hierarchy node ${draggedId} ${insertBefore ? 'before' : 'after'} ${targetId}`);

    const hierarchyMeta = { ...sentences._hierarchyMeta };
    const nodes = hierarchyMeta.nodes.map(n => ({ ...n, childIds: [...n.childIds] }));

    // Find the dragged node
    const draggedNode = nodes.find(n => n.id === draggedId);
    if (!draggedNode) {
        console.warn(`${LOG_PREFIX.PARSER} Dragged node ${draggedId} not found in hierarchy`);
        return sentences;
    }

    // Find current parent of dragged node
    const oldParent = nodes.find(n => n.childIds.includes(draggedId));
    const oldParentId = oldParent?.id || 'root';

    // Find the parent of target node (this will be the new parent)
    const newParent = nodes.find(n => n.childIds.includes(targetId));
    const newParentId = newParent?.id || 'root';

    console.log(`${LOG_PREFIX.PARSER} Moving from parent ${oldParentId} to parent ${newParentId}`);

    // Remove dragged node from old parent's childIds
    if (oldParent) {
        const draggedIndex = oldParent.childIds.indexOf(draggedId);
        if (draggedIndex !== -1) {
            oldParent.childIds.splice(draggedIndex, 1);
            console.log(`${LOG_PREFIX.PARSER} Removed ${draggedId} from old parent ${oldParentId}`);
        }
    } else {
        // The node is at the top level (direct child of root)
        // We don't have a direct representation of root's children in the nodes array
        // Top-level nodes are those that aren't in any other node's childIds
        console.log(`${LOG_PREFIX.PARSER} Node ${draggedId} is at top level (root's child)`);
    }

    // Add dragged node to new parent's childIds at the correct position
    if (newParent) {
        const targetIndex = newParent.childIds.indexOf(targetId);
        const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
        newParent.childIds.splice(insertIndex, 0, draggedId);
        console.log(`${LOG_PREFIX.PARSER} Inserted ${draggedId} into new parent ${newParentId} at index ${insertIndex}`);
    } else {
        // Target is also at top level
        // For top-level reordering, we need to identify all top-level nodes and reorder them
        console.log(`${LOG_PREFIX.PARSER} Target ${targetId} is also at top level`);

        // Find all top-level nodes (not in any childIds array)
        const allChildIds = new Set(nodes.flatMap(n => n.childIds));
        const topLevelNodes = nodes.filter(n => !allChildIds.has(n.id));

        // Find positions of dragged and target in top-level nodes
        const draggedIdx = topLevelNodes.findIndex(n => n.id === draggedId);
        const targetIdx = topLevelNodes.findIndex(n => n.id === targetId);

        if (draggedIdx !== -1 && targetIdx !== -1) {
            // Reorder by adjusting the level field or a custom order field
            // Since we don't have an explicit ordering mechanism for top-level nodes,
            // we'll rely on the nodes array order
            const nodesCopy = [...nodes];
            const draggedNodeIndex = nodesCopy.findIndex(n => n.id === draggedId);
            const targetNodeIndex = nodesCopy.findIndex(n => n.id === targetId);

            if (draggedNodeIndex !== -1 && targetNodeIndex !== -1) {
                const [removed] = nodesCopy.splice(draggedNodeIndex, 1);
                const newTargetIndex = nodesCopy.findIndex(n => n.id === targetId);
                const insertIdx = insertBefore ? newTargetIndex : newTargetIndex + 1;
                nodesCopy.splice(insertIdx, 0, removed);

                // Update nodes array with new order
                hierarchyMeta.nodes = nodesCopy;

                // Rebuild sentences array to match new hierarchy order
                const reorderedSentences = rebuildSentenceOrderFromHierarchy(sentences, nodesCopy, hierarchyMeta.maxLevel);
                reorderedSentences._hierarchyMeta = hierarchyMeta;

                console.log(`${LOG_PREFIX.PARSER} Reordered top-level nodes in array`);

                // Mark as dirty
                const result = markReorderAsDirty(reorderedSentences, draggedId, oldParentId, newParentId);
                return result;
            }
        }
    }

    // Update hierarchy metadata
    hierarchyMeta.nodes = nodes;

    // Rebuild sentences array to match new hierarchy order
    const reorderedSentences = rebuildSentenceOrderFromHierarchy(sentences, nodes, hierarchyMeta.maxLevel);
    reorderedSentences._hierarchyMeta = hierarchyMeta;

    // Mark the reordered node and both parents as dirty
    const result = markReorderAsDirty(reorderedSentences, draggedId, oldParentId, newParentId);

    console.log(`${LOG_PREFIX.PARSER} Hierarchy node reordered successfully`);

    return result;
}
