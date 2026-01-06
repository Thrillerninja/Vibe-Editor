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
  'elk.spacing.nodeNode': 200,
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

// Emotion colors by intensity (0-100) - DES emotions
export const EMOTION_COLORS = {
  [EMOTIONS.INTEREST]: {
    light: '#dbeafe',    // Light blue - curiosity, engagement
    medium: '#60a5fa',
    strong: '#2563eb',
  },
  [EMOTIONS.JOY]: {
    light: '#fef3c7',    // Yellow/gold - happiness, delight
    medium: '#fbbf24',
    strong: '#f59e0b',
  },
  [EMOTIONS.SURPRISE]: {
    light: '#e0e7ff',    // Indigo - astonishment
    medium: '#a5b4fc',
    strong: '#6366f1',
  },
  [EMOTIONS.SADNESS]: {
    light: '#dbeafe',    // Soft blue - melancholy
    medium: '#93c5fd',
    strong: '#3b82f6',
  },
  [EMOTIONS.ANGER]: {
    light: '#fecaca',    // Red - hostility, rage
    medium: '#f87171',
    strong: '#dc2626',
  },
  [EMOTIONS.DISGUST]: {
    light: '#d1fae5',    // Green - revulsion
    medium: '#6ee7b7',
    strong: '#10b981',
  },
  [EMOTIONS.CONTEMPT]: {
    light: '#f3e8ff',    // Purple - scorn, disdain
    medium: '#c084fc',
    strong: '#9333ea',
  },
  [EMOTIONS.FEAR]: {
    light: '#f3f4f6',    // Gray - anxiety, terror
    medium: '#9ca3af',
    strong: '#4b5563',
  },
  [EMOTIONS.SHAME]: {
    light: '#fed7aa',    // Orange - embarrassment
    medium: '#fb923c',
    strong: '#ea580c',
  },
  [EMOTIONS.GUILT]: {
    light: '#fecdd3',    // Rose - remorse, regret
    medium: '#fb7185',
    strong: '#e11d48',
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