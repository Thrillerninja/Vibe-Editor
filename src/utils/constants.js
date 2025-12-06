/**
 * Shared constants for tree visualization
 */

// Node dimensions
export const NODE_WIDTH = 200;
export const NODE_MIN_HEIGHT = 56;
export const NODE_PADDING = 24;


export const LEAF_NODE_LEVEL = 0;

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
  'elk.spacing.nodeNode': 69,
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
  sentence: {
    background: '#ecfeff',
    border: '#a5f3fc',
    color: '#1f2937',
  },
  argument: {
    background: '#ecfeff',
    border: '#a5f3fc',
    color: '#1f2937',
  },
};

// Emotion configuration
export const EMOTIONS = {
  NEUTRAL: 'neutral',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  UNCERTAIN: 'uncertain',
  EMPHASIS: 'emphasis',
};

export const EMOTION_LABELS = {
  [EMOTIONS.NEUTRAL]: 'Neutral',
  [EMOTIONS.POSITIVE]: 'Positive',
  [EMOTIONS.NEGATIVE]: 'Negative',
  [EMOTIONS.UNCERTAIN]: 'Uncertain',
  [EMOTIONS.EMPHASIS]: 'Strong Emphasis',
};

export const ALTERNATIVE_EMOTION_COLORS ={
  NEUTRAL:'#C7CEDB',
  POSITIVE:'#6ee7b7',
  NEGATIVE:'#f87171',
  UNCERTAIN:'#fbbf24',
  EMPHASIS:'#a78bfa',
};

// Emotion colors by intensity (0-100)
export const EMOTION_COLORS = {
  [EMOTIONS.NEUTRAL]: {
    light: '#f3f4f6',
    medium: '#e5e7eb',
    strong: '#d1d5db',
  },
  [EMOTIONS.POSITIVE]: {
    light: '#d1fae5',
    medium: '#6ee7b7',
    strong: '#10b981',
  },
  [EMOTIONS.NEGATIVE]: {
    light: '#fecaca',
    medium: '#f87171',
    strong: '#dc2626',
  },
  [EMOTIONS.UNCERTAIN]: {
    light: '#fef3c7',
    medium: '#fbbf24',
    strong: '#f59e0b',
  },
  [EMOTIONS.EMPHASIS]: {
    light: '#fafafaff',
    medium: '#a78bfa',
    strong: '#7c3aed',
  },
};

// Logging configuration
export const LOGGING_ENABLED = false;
export const LOG_PREFIX = {
  PHYSICS: '[Physics]',
  LAYOUT: '[Layout]',
  PARSER: '[Parser]',
  REPARENT: '[Reparent]',
  NODE: '[Node]',
  DRAG: '[Drag]',
};