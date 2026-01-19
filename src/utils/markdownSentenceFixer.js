/**
 * Markdown Sentence Fixer
 * Ensures markdown formatting is complete within each sentence
 * by closing and reopening tags at sentence boundaries
 */

/**
 * Tracks open markdown formatting tags
 * Returns object with open tags and modified content
 * Handles combined formatting like *** (bold + italic) and HTML tags like <u>
 * Ignores list markers (* at line start followed by space)
 */
function getOpenMarkdownTags(text) {
    const tags = {
        bold: 0,           // ** or __
        italic: 0,         // * or _
        code: 0,           // `
        strikethrough: 0,  // ~~
        underline: 0,      // <u>
        headline: 0,       // # (number of # at line start)
    };

    let i = 0;
    while (i < text.length) {
        // Check for headline markers (# at line start)
        if (text[i] === '#') {
            const isLineStart = i === 0 || text[i - 1] === '\n';
            if (isLineStart) {
                // Count consecutive # symbols
                let hashCount = 0;
                let j = i;
                while (j < text.length && text[j] === '#') {
                    hashCount++;
                    j++;
                }
                // Check if followed by space (valid headline)
                if (j < text.length && text[j] === ' ') {
                    tags.headline = hashCount; // Store the level (1-6)
                    i = j + 1; // Skip past the headline marker and space
                    continue;
                }
            }
        }

        // Check for underline HTML tags
        if (i < text.length - 2) {
            if (text[i] === '<' && text[i + 1] === 'u' && text[i + 2] === '>') {
                tags.underline++;
                i += 3;
                continue;
            }
        }
        if (i < text.length - 3) {
            if (text[i] === '<' && text[i + 1] === '/' && text[i + 2] === 'u' && text[i + 3] === '>') {
                tags.underline++;
                i += 4;
                continue;
            }
        }

        // Check if asterisk is a list marker (* at line start followed by space)
        if (text[i] === '*') {
            const isLineStart = i === 0 || text[i - 1] === '\n';
            const followedBySpace = i < text.length - 1 && text[i + 1] === ' ';

            if (isLineStart && followedBySpace) {
                // This is a list marker, skip it
                i++;
                continue;
            }
        }

        // Check for combined bold+italic (*** or ***)
        if (i < text.length - 2) {
            if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '*') {
                tags.bold++;
                tags.italic++;
                i += 3;
                continue;
            }
        }

        // Check for bold (** or __)
        if (i < text.length - 1) {
            if (text[i] === '*' && text[i + 1] === '*') {
                tags.bold++;
                i += 2;
                continue;
            }
            if (text[i] === '_' && text[i + 1] === '_') {
                tags.bold++;
                i += 2;
                continue;
            }
            if (text[i] === '~' && text[i + 1] === '~') {
                tags.strikethrough++;
                i += 2;
                continue;
            }
        }

        // Check for italic (* or _) - but not part of bold or combined
        if (text[i] === '*' && (i === 0 || text[i - 1] !== '*') && (i === text.length - 1 || text[i + 1] !== '*')) {
            tags.italic++;
            i++;
            continue;
        }
        if (text[i] === '_' && (i === 0 || text[i - 1] !== '_') && (i === text.length - 1 || text[i + 1] !== '_')) {
            tags.italic++;
            i++;
            continue;
        }

        // Check for code (`)
        if (text[i] === '`') {
            tags.code++;
            i++;
            continue;
        }

        i++;
    }

    return tags;
}

/**
 * Gets closing markdown tags for open tags
 */
function getClosingTags(tags) {
    let closing = '';

    // Close in reverse order of opening: code, strikethrough, bold, italic, underline
    // Note: Headlines don't need explicit closing tags in markdown
    if (tags.code % 2 === 1) closing += '`';
    if (tags.strikethrough % 2 === 1) closing += '~~';
    if (tags.bold % 2 === 1) closing += '**';
    if (tags.italic % 2 === 1) closing += '*';
    if (tags.underline % 2 === 1) closing += '</u>';

    return closing;
}

/**
 * Gets opening markdown tags to reopen formatting
 */
function getOpeningTags(tags) {
    let opening = '';

    // Open in proper order: headline first (must be at line start), then inline formatting
    if (tags.headline > 0) {
        opening += '#'.repeat(tags.headline) + ' ';
    }
    if (tags.underline % 2 === 1) opening += '<u>';
    if (tags.italic % 2 === 1) opening += '*';
    if (tags.bold % 2 === 1) opening += '**';
    if (tags.strikethrough % 2 === 1) opening += '~~';
    if (tags.code % 2 === 1) opening += '`';

    return opening;
}

/**
 * Cleans up redundant or malformed markdown tags
 * Removes empty tags and normalizes excessive markers
 */
function cleanupMarkdownTags(text) {
    let cleaned = text;

    // Remove empty formatting tags
    cleaned = cleaned.replace(/<u><\/u>/g, '');
    cleaned = cleaned.replace(/\*\*\*\*/g, '');  // **** -> empty
    cleaned = cleaned.replace(/\*\*/g, (match, offset, string) => {
        // Check if this ** is immediately followed by another **
        if (string[offset + 2] === '*' && string[offset + 3] === '*') {
            return '';  // Remove redundant **
        }
        return match;
    });
    cleaned = cleaned.replace(/~~~/g, '~');  // ~~~ -> ~
    cleaned = cleaned.replace(/``/g, '');  // `` -> empty

    // Normalize excessive asterisks (more than 3 in a row)
    cleaned = cleaned.replace(/\*{5,}/g, '***');  // ***** or more -> ***
    cleaned = cleaned.replace(/\*{4}/g, '**');  // **** -> **

    // Remove formatting around punctuation that got separated
    cleaned = cleaned.replace(/\*\*\.\*\*/g, '.');  // **.** -> .
    cleaned = cleaned.replace(/\*\.\*/g, '.');  // *.* -> .
    cleaned = cleaned.replace(/<\/u>\.<u>/g, '.');  // </u>.<u> -> .
    cleaned = cleaned.replace(/~~\.~~/g, '.');  // ~~.~~ -> .

    // Remove empty underline tags
    cleaned = cleaned.replace(/<u>\s*<\/u>/g, '');

    // Collapse adjacent identical tags
    cleaned = cleaned.replace(/<\/u><u>/g, '');  // </u><u> -> nothing
    cleaned = cleaned.replace(/\*\*\*\*/g, '');  // **** -> nothing (closing then opening bold)
    cleaned = cleaned.replace(/\*\*/g, (match, offset, string) => {
        // If we have ******, it might be *** (close) + *** (open), keep as nothing or ***
        return match;
    });

    // Fix improperly nested tags: </u>***. should be ***</u>.
    // Move punctuation outside of formatting
    cleaned = cleaned.replace(/([.!?])\*\*/g, '**$1');  // .** -> **.
    cleaned = cleaned.replace(/([.!?])\*/g, '*$1');  // .* -> *.
    cleaned = cleaned.replace(/([.!?])<\/u>/g, '</u>$1');  // .</u> -> </u>.

    return cleaned;
}

/**
 * Fixes markdown formatting across sentence boundaries
 * Ensures each sentence has complete markdown tags
 * 
 * @param {Array} sentences - Array of sentence objects
 * @returns {Array} Updated sentences with fixed markdown
 */
export function fixMarkdownAcrossSentences(sentences) {
    if (!sentences || sentences.length <= 1) {
        return sentences;
    }

    const updatedSentences = [];
    let cumulativeTags = {
        bold: 0,
        italic: 0,
        code: 0,
        strikethrough: 0,
        underline: 0,
        headline: 0,
    };

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        let content = sentence.content;

        // Get opening tags from previous sentences (what's currently open)
        const openingTags = getOpeningTags(cumulativeTags);

        // Add opening tags if needed
        if (openingTags) {
            content = openingTags + content;
        }

        // Count tags in the ORIGINAL sentence content (not including prepended tags)
        const sentenceTags = getOpenMarkdownTags(sentence.content);

        // Update cumulative tags with this sentence's tags
        cumulativeTags.bold += sentenceTags.bold;
        cumulativeTags.italic += sentenceTags.italic;
        cumulativeTags.code += sentenceTags.code;
        cumulativeTags.strikethrough += sentenceTags.strikethrough;
        cumulativeTags.underline += sentenceTags.underline;
        // For headlines, we carry forward the level (not cumulative like other tags)
        if (sentenceTags.headline > 0) {
            cumulativeTags.headline = sentenceTags.headline;
        }

        // Add closing tags if there are open tags and this isn't the last sentence
        const closingTags = getClosingTags(cumulativeTags);
        if (closingTags && i < sentences.length - 1) {
            content = content + closingTags;
        }

        // Clean up any redundant or malformed tags
        content = cleanupMarkdownTags(content);

        updatedSentences.push({
            ...sentence,
            content: content,
        });
    }

    return updatedSentences;
}
