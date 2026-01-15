/**
 * Secondary Emotion Indicators
 * 
 * Shows only positive outliers from an emotion profile as secondary indicators.
 * Uses simple statistical math: emotions with intensity > mean + 0.5 * stddev
 */

import { EMOTION_AXES, EMOTION_LABELS, ALTERNATIVE_EMOTION_COLORS } from './constants';

/**
 * Calculate secondary emotions (positive outliers) from a profile
 * @param {Object} profile - Emotion profile with intensity values (0-100)
 * @returns {Array<{emotion: string, intensity: number}>} Sorted by intensity descending
 */
export function getSecondaryEmotions(profile) {
  if (!profile || typeof profile !== 'object') return [];

  // Get all non-zero emotion values
  const values = EMOTION_AXES
    .map(axis => ({
      emotion: axis,
      intensity: Math.max(0, Math.min(100, profile[axis] || 0))
    }))
    .filter(item => item.intensity > 0);

  if (values.length === 0) return [];

  // Compute mean
  const mean = values.reduce((sum, item) => sum + item.intensity, 0) / values.length;

  // Compute standard deviation
  const variance = values.reduce((sum, item) => sum + Math.pow(item.intensity - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);

  // Identify positive outliers: intensity > mean + 0.25 * stddev
  // The 0.25 factor makes it less strict than 1 stddev, capturing more outliers
  const threshold = mean + 0.25 * stddev;
  const secondary = values
    .filter(item => item.intensity > threshold)
    .sort((a, b) => b.intensity - a.intensity);

  return secondary;
}

/**
 * Get button style for a secondary emotion indicator
 * @param {string} emotion - Emotion key
 * @param {number} intensity - Intensity value (0-100)
 * @param {boolean} isSelected - Whether this emotion is currently selected
 * @returns {Object} CSS style object
 */
export function getSecondaryEmotionButtonStyle(emotion, intensity, isSelected = false) {
  const color = ALTERNATIVE_EMOTION_COLORS[emotion] || '#999';
  
  return {
    padding: '4px 8px',
    borderRadius: '4px',
    backgroundColor: color,
    color: '#ffffff',
    border: isSelected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '500',
    opacity: intensity / 100,
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  };
}

/**
 * Get tooltip for a secondary emotion
 * @param {string} emotion - Emotion key
 * @param {number} intensity - Intensity value (0-100)
 * @returns {string} Tooltip text
 */
export function getSecondaryEmotionTooltip(emotion, intensity) {
  const label = EMOTION_LABELS[emotion] || emotion;
  return `${label} (${Math.round(intensity)}%) - Secondary emotion indicator`;
}
