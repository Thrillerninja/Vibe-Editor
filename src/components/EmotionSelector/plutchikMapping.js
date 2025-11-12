import mixHexOKLab50 from "./mixColor"

// Prettier: width 80
export const PLUTCHIK_ORDER = [
  "joy", //   0°
  "love", // 22.5°
  "trust", // 45°
  "submission", // 67.5°
  "fear", // 90°
  "awe", // 112.5°
  "surprise", // 135°
  "disapproval", // 157.5°
  "sadness", // 180°
  "remorse", // 202.5°
  "disgust", // 225°
  "contempt", // 247.5°
  "anger", // 270°
  "aggressiveness", // 292.5°
  "anticipation", // 315°
  "optimism", // 337.5°
];

// Prettier: width 80
export const PLUTCHIK_COLORS = [
  "#f4ec1f", //   0°
  "#000000", // 22.5°
  "#d0de21", // 45°
  "#000000", // 67.5°
  "#a3cc3c", // 90°
  "#000000", // 112.5°
  "#61c187", // 135°
  "#000000", // 157.5°
  "#3ebeee", // 180°
  "#000000", // 202.5°
  "#973e98", // 225°
  "#000000", // 247.5°
  "#de0482", // 270°
  "#000000", // 292.5°
  "#faa912", // 315°
  "#000000", // 337.5°
  "#f4ec1f", //   0°
];

// Map angle (radians) to nearest 22.5° sector in PLUTCHIK_16
export function angleToPlutchikLabel(angleRad) {
  let deg = (angleRad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  // Snap to nearest multiple of 22.5°
  const sector = Math.round(deg / 22.5) % 16;
  return PLUTCHIK_ORDER[sector];
}

// Map angle (radians) to nearest 22.5° sector in PLUTCHIK_16
export function angleToPlutchikColor(angleRad) {
  let deg = (angleRad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const sector = Math.round(deg / 22.5) % 16;

  const colorAt = (i) => PLUTCHIK_COLORS[(i + PLUTCHIK_COLORS.length) % PLUTCHIK_COLORS.length];

  const base = colorAt(sector);
  if (base !== "#000000") return base;

  // Mix adjacent real colors if placeholder
  const left = colorAt(sector - 1);
  const right = colorAt(sector + 1);
  return mixHexOKLab50(left, right);
}

// Get angle in degrees for a given label (center of sector)
// Returns null for invalid emotions
export function labelToAngleDeg(label) {
  const idx = PLUTCHIK_ORDER.indexOf(label);
  if (idx < 0) return null;
  return idx * 22.5;
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}