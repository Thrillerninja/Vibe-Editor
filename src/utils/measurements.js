/**
 * Node measurement utilities
 * Calculates dynamic node dimensions based on label text
 */

import {
  NODE_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_PADDING,
  FONT_SIZE,
  LINE_HEIGHT_MULTIPLIER,
  AVG_CHAR_WIDTH_MULTIPLIER,
  LOGGING_ENABLED,
  LOG_PREFIX,
} from './constants';

/**
 * Measures label text and calculates required node dimensions
 * @param {string} label - The text to measure
 * @returns {{width: number, height: number}} Node dimensions
 */
export function measureLabel(label) {
  const maxWidth = NODE_WIDTH - NODE_PADDING;
  const avgChar = FONT_SIZE * AVG_CHAR_WIDTH_MULTIPLIER;
  const charsPerLine = Math.max(8, Math.floor(maxWidth / avgChar));

  const words = String(label || '').split(/\s+/).filter(Boolean);
  let lines = 1;
  let len = 0;

  // Word-wrap calculation
  for (const word of words) {
    if (len > 0 && len + word.length + 1 > charsPerLine) {
      lines += 1;
      len = word.length;
    } else {
      len += (len ? 1 : 0) + word.length;
    }
  }

  const lineHeight = Math.round(FONT_SIZE * LINE_HEIGHT_MULTIPLIER);
  const height = Math.max(NODE_MIN_HEIGHT, lines * lineHeight + 20);

  if (LOGGING_ENABLED) {
    console.log(
      `${LOG_PREFIX.NODE} Measured label: "${label.substring(0, 20)}..." → ${
        lines
      } lines, ${height}px height`
    );
  }

  return { width: NODE_WIDTH, height };
}