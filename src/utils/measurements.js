/**
 * @fileoverview Node measurement utilities
 * 
 * UPDATED: Works with new Node system
 * 
 * Calculates dimensions for nodes based on:
 * - Label text
 * - Emotion metadata
 * - Structure complexity
 */

import * as NodeTypes from '../types/node.js';
import {
  NODE_WIDTH,
  NODE_MIN_HEIGHT,
  NODE_PADDING,
  FONT_SIZE,
  LINE_HEIGHT_MULTIPLIER,
  AVG_CHAR_WIDTH_MULTIPLIER,
  LOGGING_ENABLED,
  LOG_PREFIX,
} from './constants.js';

/**
 * Calculate dimensions for a node
 * Takes into account content length and structure
 * 
 * @param {NodeTypes.Node} node
 * @returns {{width: number, height: number}}
 */
export function measureNode(node) {
  // Base dimensions
  let width = NODE_WIDTH;
  let height = NODE_MIN_HEIGHT;

  // Measure label text
  const measures = node.size || measureLabel(node.content);
  height = Math.max(height, measures.height);

  // Add space for emotion display if present
  if (node.emotion) {
    height += 18; // Emotion line
  }

  // Add space for metadata
  if (node.metadata) {
    height += 14; // Metadata line
  }

  // Add action buttons space
  if (NodeTypes.isGroupNode(node) || NodeTypes.isContentNode(node)) {
    height += 24; // Action buttons
  }

  // Add padding
  height += NODE_PADDING;

  if (LOGGING_ENABLED) {
    console.log(
      `${LOG_PREFIX.NODE} Measured ${node.type}: ${width}x${height}px`
    );
  }

  return { width, height };
}

/**
 * Measure text label and calculate required height
 * 
 * @param {string} label
 * @returns {{width: number, height: number, lines: number}}
 */
export function measureLabel(label) {
  const maxWidth = NODE_WIDTH - NODE_PADDING;
  const avgCharWidth = FONT_SIZE * AVG_CHAR_WIDTH_MULTIPLIER;
  const charsPerLine = Math.max(8, Math.floor(maxWidth / avgCharWidth));

  const words = String(label || '').split(/\s+/).filter(Boolean);
  let lines = 1;
  let currentLineLength = 0;

  // Word wrap calculation
  for (const word of words) {
    const wordLength = word.length;

    // Check if word fits on current line
    if (currentLineLength + wordLength + 1 <= charsPerLine) {
      // Fits - add to current line
      currentLineLength += wordLength + (currentLineLength > 0 ? 1 : 0);
    } else {
      // Doesn't fit - start new line
      lines += 1;
      currentLineLength = wordLength;
    }
  }

  const lineHeight = Math.round(FONT_SIZE * LINE_HEIGHT_MULTIPLIER);
  const totalHeight = lines * lineHeight + 12; // 12 = vertical padding

  return {
    width: NODE_WIDTH,
    height: totalHeight,
    lines,
  };
}

/**
 * Estimate visual complexity of node
 * Used for rendering optimizations
 * 
 * @param {NodeTypes.Node} node
 * @returns {number} 1-5 (1=simple, 5=complex)
 */
export function estimateNodeComplexity(node) {
  let complexity = 1;

  // Content length
  if (node.content.length > 200) complexity += 1;
  if (node.content.length > 500) complexity += 1;

  // Has emotion
  if (node.emotion) complexity += 1;

  // Has formatting
  if (node.formatting && node.formatting.length > 0) complexity += 1;

  // Many children
  if (node.hierarchy.childIds.length > 10) complexity += 1;

  return Math.min(complexity, 5);
}

/**
 * Get cache key for node measurements
 * Used to avoid re-measuring
 * 
 * @param {NodeTypes.Node} node
 * @returns {string}
 */
export function getNodeMeasureCacheKey(node) {
  return `${node.id}:${node.content.length}:${node.emotion ? 1 : 0}:${node.formatting?.length || 0}`;
}

/**
 * Measure array of nodes efficiently
 * Caches measurements
 * 
 * @param {NodeTypes.Node[]} nodes
 * @param {Map<string, {width: number, height: number}>} [cache]
 * @returns {{measurements: Map<string, {width: number, height: number}>, cache: Map}}
 */
export function measureNodes(nodes, cache = new Map()) {
  const measurements = new Map();

  for (const node of nodes) {
    const cacheKey = getNodeMeasureCacheKey(node);

    if (cache.has(cacheKey)) {
      measurements.set(node.id, cache.get(cacheKey));
    } else {
      const dims = measureNode(node);
      measurements.set(node.id, dims);
      cache.set(cacheKey, dims);
    }
  }

  return { measurements, cache };
}

/**
 * Get recommended grid size for tree layout
 * @param {NodeTypes.Node[]} nodes
 * @returns {{cellWidth: number, cellHeight: number}}
 */
export function getRecommendedGridSize(nodes) {
  if (nodes.length === 0) {
    return { cellWidth: 240, cellHeight: 120 };
  }

  const { measurements } = measureNodes(nodes);
  let maxWidth = NODE_WIDTH;
  let maxHeight = NODE_MIN_HEIGHT;

  for (const dims of measurements.values()) {
    maxWidth = Math.max(maxWidth, dims.width);
    maxHeight = Math.max(maxHeight, dims.height);
  }

  return {
    cellWidth: maxWidth + 40,
    cellHeight: maxHeight + 40,
  };
}

export default {
  measureNode,
  measureLabel,
  estimateNodeComplexity,
  getNodeMeasureCacheKey,
  measureNodes,
  getRecommendedGridSize,
};