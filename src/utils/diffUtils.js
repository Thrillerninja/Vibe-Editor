/**
 * Diff Utilities
 * Compares two sentence arrays and generates a git-style diff
 */

/**
 * Computes a diff between two sentence arrays
 * @param {Array} oldSentences - Previous state sentences
 * @param {Array} newSentences - Current state sentences
 * @returns {Array} Diff items with type: 'added', 'removed', 'unchanged', 'skip'
 */
export function computeSentenceDiff(oldSentences, newSentences) {
    const diff = [];
    const maxContextLines = 3; // Show 3 lines of context before/after changes

    // Create a map of sentence content to help match sentences
    const oldMap = new Map(oldSentences.map((s, i) => [s.content, i]));
    const newMap = new Map(newSentences.map((s, i) => [s.content, i]));

    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldSentences.length || newIdx < newSentences.length) {
        const oldSent = oldSentences[oldIdx];
        const newSent = newSentences[newIdx];

        // Both exist and match
        if (oldSent && newSent && oldSent.content === newSent.content) {
            diff.push({
                type: 'unchanged',
                content: oldSent.content,
                oldIndex: oldIdx,
                newIndex: newIdx,
            });
            oldIdx++;
            newIdx++;
        }
        // New sentence exists but not in old (added)
        else if (newSent && !oldMap.has(newSent.content)) {
            diff.push({
                type: 'added',
                content: newSent.content,
                newIndex: newIdx,
            });
            newIdx++;
        }
        // Old sentence exists but not in new (removed)
        else if (oldSent && !newMap.has(oldSent.content)) {
            diff.push({
                type: 'removed',
                content: oldSent.content,
                oldIndex: oldIdx,
            });
            oldIdx++;
        }
        // Both exist but don't match - try to find match ahead
        else {
            // Look ahead to see if we can find a match
            let foundMatch = false;
            const lookAhead = 5;

            for (let i = 1; i <= lookAhead && !foundMatch; i++) {
                if (newIdx + i < newSentences.length && oldSent.content === newSentences[newIdx + i].content) {
                    // Found old in new ahead - mark intermediate as added
                    diff.push({
                        type: 'added',
                        content: newSent.content,
                        newIndex: newIdx,
                    });
                    newIdx++;
                    foundMatch = true;
                }
                else if (oldIdx + i < oldSentences.length && newSent.content === oldSentences[oldIdx + i].content) {
                    // Found new in old ahead - mark intermediate as removed
                    diff.push({
                        type: 'removed',
                        content: oldSent.content,
                        oldIndex: oldIdx,
                    });
                    oldIdx++;
                    foundMatch = true;
                }
            }

            if (!foundMatch) {
                // No match found, treat as both removed and added
                if (oldSent) {
                    diff.push({
                        type: 'removed',
                        content: oldSent.content,
                        oldIndex: oldIdx,
                    });
                    oldIdx++;
                }
                if (newSent) {
                    diff.push({
                        type: 'added',
                        content: newSent.content,
                        newIndex: newIdx,
                    });
                    newIdx++;
                }
            }
        }
    }

    // Compress unchanged blocks (show context around changes only)
    return compressUnchangedBlocks(diff, maxContextLines);
}

/**
 * Compresses large blocks of unchanged content into skip markers
 * Groups consecutive items of the same type together for prose-style display
 * @param {Array} diff - Raw diff array
 * @param {number} contextLines - Number of context lines to keep around changes
 * @returns {Array} Compressed and grouped diff with skip markers
 */
function compressUnchangedBlocks(diff, contextLines) {
    const result = [];
    let i = 0;

    while (i < diff.length) {
        const item = diff[i];

        if (item.type === 'unchanged') {
            // Find the extent of this unchanged block
            let blockStart = i;
            let blockEnd = i;
            while (blockEnd < diff.length && diff[blockEnd].type === 'unchanged') {
                blockEnd++;
            }

            const blockSize = blockEnd - blockStart;
            const isAtStart = blockStart === 0;
            const isAtEnd = blockEnd === diff.length;

            // Determine if we should show full context or compress
            if (blockSize <= contextLines * 2) {
                // Small block, show it all as one grouped item
                const contents = [];
                for (let j = blockStart; j < blockEnd; j++) {
                    contents.push(diff[j].content);
                }
                result.push({
                    type: 'unchanged',
                    content: contents.join(' '),
                    items: contents,
                });
            } else {
                // Large block, show context and add skip marker
                const contextBefore = isAtStart ? 0 : contextLines;
                const contextAfter = isAtEnd ? 0 : contextLines;

                // Add context before
                if (contextBefore > 0) {
                    const contents = [];
                    for (let j = blockStart; j < blockStart + contextBefore; j++) {
                        contents.push(diff[j].content);
                    }
                    result.push({
                        type: 'unchanged',
                        content: contents.join(' '),
                        items: contents,
                    });
                }

                // Add skip marker
                const skippedCount = blockSize - contextBefore - contextAfter;
                if (skippedCount > 0) {
                    result.push({
                        type: 'skip',
                        count: skippedCount,
                    });
                }

                // Add context after
                if (contextAfter > 0) {
                    const contents = [];
                    for (let j = blockEnd - contextAfter; j < blockEnd; j++) {
                        contents.push(diff[j].content);
                    }
                    result.push({
                        type: 'unchanged',
                        content: contents.join(' '),
                        items: contents,
                    });
                }
            }

            i = blockEnd;
        } else {
            // Group consecutive items of the same type (added/removed)
            let blockStart = i;
            let blockEnd = i;
            const currentType = item.type;
            while (blockEnd < diff.length && diff[blockEnd].type === currentType) {
                blockEnd++;
            }

            const contents = [];
            for (let j = blockStart; j < blockEnd; j++) {
                contents.push(diff[j].content);
            }

            result.push({
                type: currentType,
                content: contents.join(' '),
                items: contents,
            });

            i = blockEnd;
        }
    }

    return result;
}

/**
 * Checks if there are any actual changes in the diff
 * @param {Array} diff - Diff array
 * @returns {boolean} True if there are additions or removals
 */
export function hasChanges(diff) {
    return diff.some(item => item.type === 'added' || item.type === 'removed');
}
