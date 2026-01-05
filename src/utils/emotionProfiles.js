import { EMOTIONS, EMOTION_AXES } from './constants';

// Empty 5-axis profile with all intensities at 0
export const EMPTY_EMOTION_PROFILE = EMOTION_AXES.reduce((acc, key) => {
  acc[key] = 0;
  return acc;
}, {});

const clampIntensity = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export function normalizeEmotionProfile(profile) {
  const base = { ...EMPTY_EMOTION_PROFILE };
  if (!profile || typeof profile !== 'object') return base;
  for (const key of EMOTION_AXES) {
    base[key] = clampIntensity(profile[key] ?? 0);
  }
  return base;
}

export function profileFromLegacy(emotion, intensity = 0) {
  if (!emotion) return normalizeEmotionProfile();
  const profile = { ...EMPTY_EMOTION_PROFILE, [emotion]: intensity }; // intensity will be clamped by normalize
  return normalizeEmotionProfile(profile);
}

export function deriveLegacyFromProfile(profile) {
  const normalized = normalizeEmotionProfile(profile);
  const ranked = EMOTION_AXES.map((key) => ({ key, value: normalized[key] || 0 }))
    .sort((a, b) => b.value - a.value);
  const top = ranked[0] || { key: EMOTIONS.NEUTRAL, value: 0 };
  return { emotion: top.key, intensity: top.value, profile: normalized };
}

export function mergeEmotionProfile(current, updates) {
  const base = normalizeEmotionProfile(current);
  if (!updates || typeof updates !== 'object') return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(updates)) {
    if (EMOTION_AXES.includes(key)) {
      next[key] = clampIntensity(value);
    }
  }
  return next;
}

export function describeEmotionProfile(profile) {
  const normalized = normalizeEmotionProfile(profile);
  return EMOTION_AXES.map((key) => `${key}: ${normalized[key]}`).join(', ');
}
