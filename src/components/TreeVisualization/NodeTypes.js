/**
 * @fileoverview Type definitions for sentence nodes
 */

/**
 * @typedef {Object} InlineElement
 * @property {'link'|'email'|'bold'|'italic'|'code'|'strikethrough'|'image'} type
 * @property {number} start - Character offset in content
 * @property {number} end - Character offset in content
 * @property {string} [url] - For links/images
 * @property {string} [alt] - For images
 * @property {string} [title] - Link/image title
 * @property {string} [email] - For email type
 */

/**
 * @typedef {Object} NodeStructure
 * @property {1|2|3|4|5|6} [headingLevel]
 * @property {'ordered'|'unordered'|'task'} [listType]
 * @property {number} [listNumber] - Actual number from markdown (e.g., 5 in "5. Item")
 * @property {string} [listMarker] - Original marker ("1.", "5.", "-", "*", "- [ ]")
 * @property {number} [listIndentLevel] - Nesting depth (0, 1, 2, ...)
 * @property {boolean} [taskChecked] - For task lists
 * @property {string} [codeLanguage] - Language identifier
 * @property {boolean} [isFenced] - ``` vs indented code
 * @property {number} [quoteDepth] - Number of '>' levels
 */

/**
 * @typedef {Object} SentenceNode
 * @property {string} id
 * @property {'sentence'|'heading'|'list-item'|'code-block'|'blockquote'|'horizontal-rule'} type
 * @property {string} content - The actual text content
 * @property {NodeStructure} [structure] - Line-level formatting metadata
 * @property {InlineElement[]} [inlineElements] - Inline formatting
 * @property {'.'|'!'|'?'} [punctuation]
 * @property {'none'|'space'|'newline'|'paragraph'|'list-continuation'} delimiter
 * @property {string} [delimiterContent] - Exact whitespace/newlines
 * @property {string} [emotion]
 * @property {number} [intensity]
 * @property {boolean} [isDirty]
 * @property {boolean} [preserveFormatting]
 * @property {'markdown'|'plain'} [reconstructAs]
 */

/**
 * @typedef {SentenceNode[] & {_hierarchyMeta?: HierarchyMetadata}} Sentences
 */