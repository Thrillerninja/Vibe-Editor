// src/utils/analytics.js
import posthog from './posthog';

export const analytics = {
  // Text operations
  textEdit: (delta, newLength) =>
    posthog.capture('text_edit', {
      delta,
      new_length: newLength,
    }),

  // Sentence operations
  sentenceParsed: (count) =>
    posthog.capture('sentence_parsed', { count }),

  // Emotion operations
  emotionSelected: (emotion, intensity, method = 'manual') =>
    posthog.capture('emotion_selected', {
      emotion,
      intensity,
      method, // 'manual' or 'ai'
    }),

  // Tree operations
  nodeCreated: (type) =>
    posthog.capture('node_created', { type }),

  nodeMoved: (type, fromParent, toParent) =>
    posthog.capture('node_moved', {
      type,
      from_parent: fromParent,
      to_parent: toParent,
    }),

  // Feature usage
  featureUsed: (feature, metadata = {}) =>
    posthog.capture('feature_used', {
      feature,
      ...metadata,
    }),

  // Performance
  performanceMetric: (metric, value) =>
    posthog.capture('performance_metric', {
      metric,
      value,
    }),
};