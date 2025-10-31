/**
 * Shared constants for tree visualization
 */

// Node dimensions
export const NODE_WIDTH = 200;
export const NODE_MIN_HEIGHT = 56;
export const NODE_PADDING = 24;

// Typography
export const FONT_SIZE = 13;
export const LINE_HEIGHT_MULTIPLIER = 1.5;
export const AVG_CHAR_WIDTH_MULTIPLIER = 0.55;

// Layout settings
export const LAYER_GAP = 240;
export const PHYSICS_RADIUS = 260;

// ELK layout options
export const ELK_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': 180,
  'elk.spacing.nodeNode': 28,
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

// Physics parameters
export const PHYSICS_CONFIG = {
  repulsion: -120,
  collide: 26,
  forceX: 0.15,
  forceY: 0.2,
  alpha: 0.9,
  alphaDecay: 0.06,
  velocityDecay: 0.4,
  repulsionMultiplier: 2,
  collideIterations: 2,
};

// Node type colors
export const NODE_STYLES = {
  root: {
    background: '#2563eb',
    border: '#1e40af',
    color: 'white',
  },
  chapter: {
    background: '#f3f4f6',
    border: '#d1d5db',
    color: '#1f2937',
  },
  section: {
    background: '#eef2ff',
    border: '#c7d2fe',
    color: '#1f2937',
  },
  argument: {
    background: '#ecfeff',
    border: '#a5f3fc',
    color: '#1f2937',
  },
};

// Logging configuration
export const LOGGING_ENABLED = true;
export const LOG_PREFIX = {
  PHYSICS: '[Physics]',
  LAYOUT: '[Layout]',
  PARSER: '[Parser]',
  REPARENT: '[Reparent]',
  NODE: '[Node]',
  DRAG: '[Drag]',
};