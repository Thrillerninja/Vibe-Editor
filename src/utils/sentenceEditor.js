/**
 * Sentence Editor Utilities
 * Handles direct editing of sentence array based on text changes
 */

import { v4 as uuidv4 } from 'uuid';
import { LOGGING_ENABLED, LOG_PREFIX } from './constants';
import { markSentenceAsDirty, markSentencesAsDirty } from './dirtyTracking';

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
 * Handles delimiter and punctuation normalization for moved sentences
 * 
 * @param {Array} sentences - Current sentence array
 * @param {string} draggedId - ID of the dragged sentence
 * @param {string} targetId - ID of the target sibling sentence
 * @param {boolean} insertBefore - Whether to insert before or after target
 * @returns {Array} Reordered sentence array with updated delimiters
 */
export function applyReordering(sentences, draggedId, targetId, insertBefore) {
    console.log(`${LOG_PREFIX.PARSER} Applying reordering: ${draggedId} → ${targetId} (${insertBefore ? 'before' : 'after'})`);

    // Preserve hierarchy metadata
    const hierarchyMeta = sentences._hierarchyMeta;

    const draggedSentence = sentences.find(s => s.id === draggedId);
    const targetSentence = sentences.find(s => s.id === targetId);

    if (!draggedSentence || !targetSentence) {
        console.warn(`${LOG_PREFIX.PARSER} Could not find sentences for reordering`);
        return sentences;
    }

    const newSentences = [...sentences];
    const draggedIndex = newSentences.indexOf(draggedSentence);
    const targetIndex = newSentences.indexOf(targetSentence);

    // Remove from old position
    newSentences.splice(draggedIndex, 1);

    // Calculate new insert position
    const insertIndex = insertBefore
        ? targetIndex > draggedIndex ? targetIndex - 1 : targetIndex
        : targetIndex > draggedIndex ? targetIndex : targetIndex + 1;

    // Insert at new position
    newSentences.splice(insertIndex, 0, draggedSentence);

    console.log(`${LOG_PREFIX.PARSER} Reordered: index ${draggedIndex} → ${insertIndex}`);

    // Normalize delimiters and punctuation for all sentences
    const normalized = newSentences.map((s, i) => {
        const isLast = i === newSentences.length - 1;

        // Determine current delimiter status
        const currentDelimiter = s.delimiter || 'none';
        const hasStructuralDelimiter = currentDelimiter === 'newline' || currentDelimiter === 'paragraph';

        // Check if sentence needs punctuation (KEEP separate from content)
        const lastChar = s.content[s.content.length - 1];
        const hasPunctuation = '.!?'.includes(lastChar);

        // Set punctuation field if needed (don't modify content)
        let punctuation = s.punctuation;
        if (!hasPunctuation && !hasStructuralDelimiter && !isLast) {
            // Needs punctuation but doesn't have it
            punctuation = '.';
        } else if (hasPunctuation) {
            // Already has punctuation in content, clear the separate field
            punctuation = undefined;
        }

        // Determine delimiter for sentence end
        let delimiter = currentDelimiter;
        let delimiterContent = s.delimiterContent;

        if (!isLast && delimiter === 'none') {
            // Sentence moved from last position, needs spacing now
            delimiter = 'space';
            delimiterContent = ' ';
        } else if (isLast && !hasStructuralDelimiter) {
            // Sentence is now last, no trailing delimiter needed
            delimiter = 'none';
            delimiterContent = '';
        } else if (delimiterContent === undefined) {
            // Generate delimiter content if missing
            delimiterContent = delimiter === 'space' ? ' '
                : delimiter === 'newline' ? '\n'
                    : delimiter === 'paragraph' ? '\n\n'
                        : '';
        }

        return {
            ...s,
            punctuation,
            delimiter,
            delimiterContent,
        };
    });

    // Recalculate indices after reordering
    const result = recalculateIndices(normalized);

    // Update hierarchy metadata if it exists
    if (hierarchyMeta) {
        console.log(`${LOG_PREFIX.PARSER} Reordering detected, updating hierarchy metadata`);

        // Clone hierarchy metadata to avoid mutation
        const updatedHierarchyMeta = {
            ...hierarchyMeta,
            nodes: hierarchyMeta.nodes.map(node => ({ ...node, childIds: [...node.childIds] }))
        };

        // Find the parent node that contains both dragged and target sentences
        const parentNode = updatedHierarchyMeta.nodes.find(node =>
            node.childIds.includes(draggedId) && node.childIds.includes(targetId)
        );

        if (parentNode) {
            console.log(`${LOG_PREFIX.PARSER} Found parent node: ${parentNode.id}`);
            console.log(`${LOG_PREFIX.PARSER} Old childIds order:`, parentNode.childIds);

            // Reorder the childIds array to match the new sentence order
            const oldChildIds = [...parentNode.childIds];

            // Remove dragged from old position
            const draggedOldIndex = oldChildIds.indexOf(draggedId);
            oldChildIds.splice(draggedOldIndex, 1);

            // Find new insert position
            const targetOldIndex = oldChildIds.indexOf(targetId);
            const insertIdx = insertBefore ? targetOldIndex : targetOldIndex + 1;

            // Insert at new position
            oldChildIds.splice(insertIdx, 0, draggedId);

            parentNode.childIds = oldChildIds;
            console.log(`${LOG_PREFIX.PARSER} New childIds order:`, parentNode.childIds);
        } else {
            console.warn(`${LOG_PREFIX.PARSER} Could not find parent node for reordering`);
        }

        result._hierarchyMeta = updatedHierarchyMeta;

        // Mark the dragged sentence and its neighbors as dirty
        const affectedIds = [draggedId];
        // Also mark neighbors that might have had delimiter changes
        if (targetIndex > 0) affectedIds.push(result[targetIndex - 1].id);
        if (targetIndex < result.length - 1) affectedIds.push(result[targetIndex + 1].id);
        if (draggedIndex > 0 && draggedIndex !== targetIndex && result[draggedIndex - 1]) {
            affectedIds.push(result[draggedIndex - 1].id);
        }

        return markSentencesAsDirty(result, affectedIds.filter(Boolean));
    }

    return result;
}
