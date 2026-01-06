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
  'elk.layered.spacing.nodeNodeBetweenLayers': 150,
  'elk.spacing.nodeNode': 100,
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

// Emotion configuration based on Differential Emotions Scale (DES) by Izard (1997)
// The DES measures 10 fundamental emotions that are theoretically and empirically distinct
export const EMOTIONS = {
  INTEREST: 'interest',      // Interest, excitement, curiosity
  JOY: 'joy',                // Enjoyment, happiness, delight
  SURPRISE: 'surprise',      // Surprise, amazement, astonishment
  SADNESS: 'sadness',        // Sadness, distress, downheartedness
  ANGER: 'anger',            // Anger, hostility, rage
  DISGUST: 'disgust',        // Disgust, revulsion, repugnance
  CONTEMPT: 'contempt',      // Contempt, scorn, disdain
  FEAR: 'fear',              // Fear, anxiety, terror
  SHAME: 'shame',            // Shame, embarrassment, humiliation
  GUILT: 'guilt',            // Guilt, remorse, regret
};

// Fixed list of axes for multi-emotion profiles (DES emotions)
export const EMOTION_AXES = [
  EMOTIONS.INTEREST,
  EMOTIONS.JOY,
  EMOTIONS.SURPRISE,
  EMOTIONS.SADNESS,
  EMOTIONS.ANGER,
  EMOTIONS.DISGUST,
  EMOTIONS.CONTEMPT,
  EMOTIONS.FEAR,
  EMOTIONS.SHAME,
  EMOTIONS.GUILT,
];

export const EMOTION_LABELS = {
  [EMOTIONS.INTEREST]: 'Interest',
  [EMOTIONS.JOY]: 'Joy',
  [EMOTIONS.SURPRISE]: 'Surprise',
  [EMOTIONS.SADNESS]: 'Sadness',
  [EMOTIONS.ANGER]: 'Anger',
  [EMOTIONS.DISGUST]: 'Disgust',
  [EMOTIONS.CONTEMPT]: 'Contempt',
  [EMOTIONS.FEAR]: 'Fear',
  [EMOTIONS.SHAME]: 'Shame',
  [EMOTIONS.GUILT]: 'Guilt',
};

// Emotion colors by intensity (0-100) - Rainbow spectrum with proper gradients
export const EMOTION_COLORS = {
  [EMOTIONS.INTEREST]: {
    light: '#ffcccb',    // Light red
    medium: '#ff6b6b',   // Medium red
    strong: '#e60000',   // Strong red
  },
  [EMOTIONS.JOY]: {
    light: '#ffe4cc',    // Light orange
    medium: '#ff9d5c',   // Medium orange
    strong: '#ff6600',   // Strong orange
  },
  [EMOTIONS.SURPRISE]: {
    light: '#fff9cc',    // Light yellow
    medium: '#ffeb3b',   // Medium yellow
    strong: '#ffd700',   // Strong yellow (gold)
  },
  [EMOTIONS.SADNESS]: {
    light: '#e6f7cc',    // Light lime
    medium: '#b5e550',   // Medium lime
    strong: '#7cb342',   // Strong lime
  },
  [EMOTIONS.ANGER]: {
    light: '#ccf5cc',    // Light green
    medium: '#66cc66',   // Medium green
    strong: '#00a651',   // Strong green
  },
  [EMOTIONS.DISGUST]: {
    light: '#ccf5f5',    // Light cyan
    medium: '#4dd0e1',   // Medium cyan
    strong: '#00bcd4',   // Strong cyan
  },
  [EMOTIONS.CONTEMPT]: {
    light: '#cce0ff',    // Light blue
    medium: '#64b5f6',   // Medium blue
    strong: '#1976d2',   // Strong blue
  },
  [EMOTIONS.FEAR]: {
    light: '#d6ccff',    // Light indigo
    medium: '#7c4dff',   // Medium indigo
    strong: '#4527a0',   // Strong indigo
  },
  [EMOTIONS.SHAME]: {
    light: '#f3ccff',    // Light purple
    medium: '#ba68c8',   // Medium purple
    strong: '#7b1fa2',   // Strong purple
  },
  [EMOTIONS.GUILT]: {
    light: '#ffcce6',    // Light magenta
    medium: '#ec407a',   // Medium magenta
    strong: '#c2185b',   // Strong magenta
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