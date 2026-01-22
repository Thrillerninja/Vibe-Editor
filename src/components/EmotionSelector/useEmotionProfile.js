/**
 * @fileoverview useEmotionProfile - Emotion state management hook
 * 
 * Encapsulates emotion profile state logic with normalization and comparison.
 * Eliminates duplicate emotion setup code across components.
 */

import { useState, useCallback } from 'react';
import { deriveLegacyFromProfile, normalizeEmotionProfile } from '@utils/emotionProfiles.js';

/**
 * @typedef {Object} UseEmotionProfileReturn
 * @property {import('../../types/node.js').NodeEmotion} profile - Current emotion state
 * @property {(nextProfile: Object) => void} updateProfile - Update emotion profile
 * @property {(original: import('../../types/node.js').NodeEmotion) => boolean} hasChanged - Check if changed
 */

/**
 * Hook for managing emotion profile state with automatic normalization
 * 
 * Handles:
 * - Profile normalization (0-100 ranges)
 * - Legacy emotion derivation (dominant emotion + intensity)
 * - Change tracking against original
 * - Timestamp tracking
 * 
 * @param {import('../../types/node.js').NodeEmotion} initialEmotion - Starting emotion state
 * @returns {UseEmotionProfileReturn}
 * 
 * @example
 * const emotion = useEmotionProfile(data.emotion);
 * emotion.updateProfile({ joy: 80, interest: 40 });
 * if (emotion.hasChanged(originalEmotion)) { ... }
 */
export function useEmotionProfile(initialEmotion) {
  const [profile, setProfile] = useState(initialEmotion);

  /**
   * Update emotion profile with normalization
   * @param {Object} nextProfile - Raw emotion profile (keys: emotion names, values: 0-100)
   */
  const updateProfile = useCallback((nextProfile) => {
    const normalized = normalizeEmotionProfile(nextProfile);
    const legacy = deriveLegacyFromProfile(normalized);

    setProfile((prev) => ({
      ...prev,
      profile: normalized,
      dominantEmotion: legacy.emotion,
      dominantIntensity: legacy.intensity,
      source: 'manual',
      timestamp: new Date().toISOString(),
    }));
  }, []);

  /**
   * Check if current profile differs from original
   * @param {import('../../types/node.js').NodeEmotion} original - Original emotion state
   * @returns {boolean} True if profiles differ
   */
  const hasChanged = useCallback(
    (original) => JSON.stringify(profile.profile) !== JSON.stringify(original.profile),
    [profile]
  );

  return { profile, updateProfile, hasChanged };
}

export default useEmotionProfile;