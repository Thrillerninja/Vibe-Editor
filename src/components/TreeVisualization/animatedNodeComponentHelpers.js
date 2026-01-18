/**
 * @fileoverview AnimatedNodeComponent Helpers - Emotion colors and utilities
 *
 * Provides pure utility functions for emotion color mapping, profile normalization,
 * and text formatting without any React dependencies.
 * 
 * @module components/TreeVisualization/animatedNodeComponentHelpers
 */

import { EMOTION_AXES, EMOTION_COLORS } from '@utils/constants';
import { normalizeEmotionProfile } from '@utils/emotionProfiles.js';
import '@components/TreeVisualization/TreeNode.css';

// ============================================================================
// TYPE DEFINITIONS & CONSTANTS
// ============================================================================

/**
 * @typedef {Object} LeafEntry
 * @property {string} id - Leaf node ID
 * @property {string} original - Original content
 * @property {string[]} options - Rewrite suggestions
 * @property {number} selectedIdx - Currently selected option index
 * @property {string} editedText - Edited content text
 */

// ============================================================================
// EMOTION COLOR UTILITIES
// ============================================================================


/**
 * Get node background color based on emotion and intensity
 * 
 * Maps emotion profiles to CSS colors using intensity levels:
 * - 0-32: Light variant
 * - 33-65: Medium variant
 * - 66-100: Strong variant
 * 
 * @param {string|null} emotion - Emotion name (e.g., 'joy', 'sadness')
 * @param {number} intensity - Intensity level [0-100]
 * @param {string} type - Node type ('sentence'|'heading'|'root'|'group')
 * @returns {string} CSS hex color value
 * 
 * @example
 * getEmotionColor('joy', 75, 'sentence')
 * // returns '#FFD700' (strong joy color)
 * 
 * getEmotionColor('sadness', 25, 'sentence')
 * // returns '#D1E7F0' (light sadness color)
 * 
 * getEmotionColor(null, 0, 'root')
 * // returns '#ffffff' (neutral white)
 */
export function getEmotionColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  if (!colors) return '#ffffff';

  if (typeof intensity === 'number') {
    if (intensity < 33) return colors.light;
    if (intensity < 66) return colors.medium;
    return colors.strong;
  }

  return colors.medium;
}


/**
 * Get node border color based on emotion
 * 
 * Returns the strong (dark) variant of the emotion color for contrast.
 * 
 * @param {string|null} emotion - Emotion name
 * @param {number} intensity - Intensity [0-100] (unused, for consistency)
 * @param {string} type - Node type
 * @returns {string} CSS hex color value (strong variant)
 * 
 * @example
 * getBorderColor('joy', 50, 'sentence')
 * // returns '#FF6B00' (dark joy color)
 */
export function getBorderColor(emotion, intensity, type) {
  const colors = EMOTION_COLORS[emotion?.toLowerCase?.()];
  return colors?.strong || '#222';
}


/**
 * Extract emotions above threshold from emotion profile
 * 
 * Returns array of significant emotions sorted by intensity descending.
 * Useful for displaying secondary emotion badges on nodes.
 * 
 * @param {Object} profile - Emotion profile object with axes as keys
 * @param {number} [threshold=30] - Minimum intensity to consider significant [0-100]
 * @returns {Array<{emotion: string, intensity: number, color: string}>} Significant emotions sorted by intensity descending
 * 
 * @example
 * const profile = { joy: 80, interest: 45, sadness: 20 };
 * getSignificantEmotions(profile, 30);
 * // returns [
 * //   { emotion: 'joy', intensity: 80, color: '#FFD700' },
 * //   { emotion: 'interest', intensity: 45, color: '#3B82F6' }
 * // ]
 * // Note: sadness (20) is below threshold
 */
export function getSignificantEmotions(profile, threshold = 30) {
  const normalized = normalizeEmotionProfile(profile);
  const significant = [];

  for (const emotion of EMOTION_AXES) {
    const intensity = normalized[emotion] || 0;
    if (intensity >= threshold) {
      const colors = EMOTION_COLORS[emotion];
      // Choose color based on intensity
      const color = colors ?
        (intensity >= 66 ? colors.strong : intensity >= 33 ? colors.medium : colors.light) :
        '#e5e7eb';
      significant.push({ emotion, intensity, color });
    }
  }

  // Sort by intensity descending
  return significant.sort((a, b) => b.intensity - a.intensity);
}

// ============================================================================
// TEXT PARSING UTILITIES
// ============================================================================

/**
 * Parse enumeration pattern from text
 * 
 * Detects and extracts ordered list patterns like "1. item" or "42. text".
 * 
 * @param {string} text - Text to parse
 * @returns {?Object} Parsed enumeration or null if not found
 * 
 * @example
 * parseEnumeration("1. First item")
 * // returns { number: "1", text: "First item" }
 * 
 * parseEnumeration("Not a list")
 * // returns null
 */
export function parseEnumeration(text) {
  const match = text.match(/^(\d+)\.\s+(.*)$/);
  if (match) {
    return {
      number: match[1],
      text: match[2],
    };
  }
  return null;
}

/**
 * Apply inline formatting elements (bold, italic, links, code, etc.)
 * Processes from end to start to avoid index shifting during replacement
 *
 * @param {string} content - Base content text
 * @param {Array<{
 *   type: 'bold'|'italic'|'code'|'strikethrough'|'link'|'email'|'image',
 *   start: number,
 *   end: number,
 *   url?: string,
 *   alt?: string,
 *   title?: string,
 *   email?: string
 * }>} formatting - Array of inline format specifications
 * @returns {string} Markdown-formatted text
 */
export function applyformatting(content, formatting) {
  if (!formatting || formatting.length === 0) {
    return content;
  }

  // Process from end to start to avoid index shifts
  const sorted = [...formatting].sort((a, b) => b.start - a.start);
  let result = content;

  for (const element of sorted) {
    const before = result.substring(0, element.start);
    const text = result.substring(element.start, element.end);
    const after = result.substring(element.end);

    let wrapped = text;

    switch (element.type) {
      case 'bold':
        wrapped = `**${text}**`;
        break;
      case 'italic':
        wrapped = `*${text}*`;
        break;
      case 'code':
        wrapped = `\`${text}\``;
        break;
      case 'strikethrough':
        wrapped = `~~${text}~~`;
        break;
      case 'link': {
        const title = element.title ? ` "${element.title}"` : '';
        wrapped = `[${text}](${element.url}${title})`;
        break;
      }
      case 'email':
        wrapped = `[${text}](mailto:${element.email})`;
        break;
      case 'image': {
        const imgTitle = element.title ? ` "${element.title}"` : '';
        wrapped = `![${element.alt || ''}](${element.url}${imgTitle})`;
        break;
      }
      default:
        wrapped = text;
    }

    result = before + wrapped + after;
  }

  return result;
}

/**
 * Build markdown string from content and structure metadata
 *
 * @param {string} content - Base content text
 * @param {Object} [structure] - Structure metadata
 * @param {number} [structure.level] - H1-H6 level
 * @param {string} [structure.type] - 'ordered'|'unordered'|'task'
 * @param {number} [structure.indentLevel] - Nesting depth
 * @param {string} [structure.marker] - Custom list marker (e.g., "3.")
 * @param {boolean} [structure.taskChecked] - Task checkbox state
 * @param {string} [structure.language] - Language identifier
 * @param {number} [structure.depth] - Blockquote nesting level
 * @param {Array} [formatting] - Inline formatting elements
 * @returns {string} Formatted markdown string
 */
export function buildMarkdownFromStructure(content, structure, formatting) {
  let markdown = applyformatting(content, formatting);

  if (structure) {
    if (structure.level) {
      // Heading
      const hashes = '#'.repeat(structure.level);
      markdown = `${hashes} ${markdown}`;
    } else if (structure.depth) {
      // Blockquote
      const prefix = '> '.repeat(structure.depth);
      markdown = markdown
        .split('\n')
        .map(line => `${prefix}${line}`)
        .join('\n');
    } else if (structure.type) {
      const indent = '  '.repeat(structure.indentLevel || 0);
      let marker =
        structure.marker ||
        (structure.type === 'ordered' ? '1.' : '-');

      if (structure.type === 'task') {
        const checked = structure.taskChecked ? 'x' : ' ';
        markdown = `${indent}- [${checked}] ${markdown}`;
      } else {
        markdown = `${indent}${marker} ${markdown}`;
      }
    } else if (structure.language) {
      const fence = '```';
      markdown = `${fence}${structure.language}\n${markdown}\n${fence}`;
    }
  }

  return markdown;
}
