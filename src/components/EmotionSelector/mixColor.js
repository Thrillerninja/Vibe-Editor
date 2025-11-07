// Prettier: printWidth 80

export default function mixHexOKLab50(hex1, hex2) {
  const c1 = hexToSRGB(hex1);
  const c2 = hexToSRGB(hex2);

  const o1 = oklabFromSRGB(c1);
  const o2 = oklabFromSRGB(c2);

  // 50/50 mix in OKLab
  const mixed = {
    L: 0.5 * (o1.L + o2.L),
    a: 0.5 * (o1.a + o2.a),
    b: 0.5 * (o1.b + o2.b),
  };

  const srgb = sRGBFromOKLab(mixed);
  return srgbToHex(srgb);
}

// ----------------------- Conversions -----------------------

function hexToSRGB(hex) {
  const h = String(hex).trim().replace(/^#/, "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

function srgbToHex({ r, g, b }) {
  const toHex = (v) => {
    const clamped = Math.max(0, Math.min(255, Math.round(v)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function srgbToLinear(c) {
  // c in 0..255 sRGB -> 0..1 linear
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  // c in 0..1 linear -> 0..255 sRGB
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v * 255;
}

function oklabFromSRGB(rgb) {
  // sRGB -> linear RGB
  const lr = srgbToLinear(rgb.r);
  const lg = srgbToLinear(rgb.g);
  const lb = srgbToLinear(rgb.b);

  // linRGB -> LMS
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function sRGBFromOKLab(ok) {
  // OKLab -> LMS'
  const l_ = ok.L + 0.3963377774 * ok.a + 0.2158037573 * ok.b;
  const m_ = ok.L - 0.1055613458 * ok.a - 0.0638541728 * ok.b;
  const s_ = ok.L - 0.0894841775 * ok.a - 1.291485548 * ok.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS -> linear RGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  // Clamp to [0,1] before gamma
  const lrC = clamp01(lr);
  const lgC = clamp01(lg);
  const lbC = clamp01(lb);

  return {
    r: linearToSrgb(lrC),
    g: linearToSrgb(lgC),
    b: linearToSrgb(lbC),
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}