export interface ThemePaletteInput {
  background?: string;
  text?: string;
  primary?: string;
  primaryText?: string;
}

export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  placeholder: string;
  fieldFill: string;
  border: string;
  input: string;
  selected?: string;
  selectedForeground?: string;
}

interface Srgb {
  r: number;
  g: number;
  b: number;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HUE_EPSILON = 1e-8;

export function deriveThemePalette(input: ThemePaletteInput): ThemePalette | null {
  const background = parseHex(input.background);
  const text = parseHex(input.text);
  if (!background || !text) return null;

  const from = toOklch(background);
  const to = toOklch(text);
  const backgroundHex = srgbToHex(background);
  const textHex = srgbToHex(text);

  const fieldFill = mixHex(
    from,
    to,
    walkThenClamp(from, to, background, 1.08, 0.05),
  );
  const fieldFillRgb = parseHex(fieldFill);
  if (!fieldFillRgb) return null;

  const muted = mixHex(from, to, walkThenClamp(from, to, background, 1.1, 0.06));
  const border = mixHex(
    from,
    to,
    walkThenClamp(from, to, background, 1.25, 0.12),
  );
  const placeholder = mixHex(
    from,
    to,
    walkThenClamp(from, to, fieldFillRgb, 3, 0.5),
  );
  const mutedForeground =
    wcagContrast(text, background) < 4.5
      ? textHex
      : mixHex(from, to, walkThenClamp(from, to, background, 4.5, 0.7));

  const palette: ThemePalette = {
    background: backgroundHex,
    foreground: textHex,
    card: muted,
    muted,
    mutedForeground,
    placeholder,
    fieldFill,
    border,
    input: border,
  };

  const primary = parseHex(input.primary);
  if (!primary) return palette;

  const brand = toOklch(primary);
  const selectedT = reduceForTextContrast(
    from,
    brand,
    text,
    walkThenClamp(from, brand, background, 1.12, 0.2),
    4.5,
  );
  palette.selected = mixHex(from, brand, selectedT);
  palette.selectedForeground = textHex;
  return palette;
}

export function contrastRatio(a: string, b: string): number {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return 0;
  return wcagContrast(left, right);
}

function parseHex(value: string | undefined): Srgb | null {
  if (value == null || !HEX_PATTERN.test(value)) return null;
  const body = value.slice(1);
  const hex =
    body.length === 3
      ? `${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
      : body;
  return {
    r: Number.parseInt(hex.slice(0, 2), 16) / 255,
    g: Number.parseInt(hex.slice(2, 4), 16) / 255,
    b: Number.parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function walkThenClamp(
  from: Oklch,
  to: Oklch,
  reference: Srgb,
  target: number,
  clampT: number,
): number {
  const t = smallestContrastT(from, to, reference, target);
  if (quantizedContrast(from, to, t, reference) < target) return clampT;
  return Math.min(t, clampT);
}

function smallestContrastT(
  from: Oklch,
  to: Oklch,
  reference: Srgb,
  target: number,
): number {
  if (quantizedContrast(from, to, 0, reference) >= target) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (quantizedContrast(from, to, mid, reference) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

function reduceForTextContrast(
  from: Oklch,
  to: Oklch,
  text: Srgb,
  maxT: number,
  target: number,
): number {
  if (quantizedContrast(from, to, maxT, text) >= target) return maxT;
  if (quantizedContrast(from, to, 0, text) < target) return 0;
  let lo = 0;
  let hi = maxT;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (quantizedContrast(from, to, mid, text) >= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

function quantizedContrast(
  from: Oklch,
  to: Oklch,
  t: number,
  reference: Srgb,
): number {
  const mixed = parseHex(mixHex(from, to, t));
  if (!mixed) return 0;
  return wcagContrast(mixed, reference);
}

function mixHex(from: Oklch, to: Oklch, t: number): string {
  return srgbToHex(oklchToSrgb(mixOklch(from, to, t)));
}

function mixOklch(from: Oklch, to: Oklch, t: number): Oklch {
  // Hue is undefined at C≈0, so borrow the chromatic sample's hue.
  const fromH = from.c < HUE_EPSILON ? to.h : from.h;
  const toH = to.c < HUE_EPSILON ? from.h : to.h;
  return {
    l: lerp(from.l, to.l, t),
    c: lerp(from.c, to.c, t),
    h: lerpHue(fromH, toH, t),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHue(from: number, to: number, t: number): number {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return ((from + delta * t) % 360 + 360) % 360;
}

function toOklch(rgb: Srgb): Oklch {
  const lab = linearSrgbToOklab(toLinearSrgb(rgb));
  const c = Math.hypot(lab.a, lab.b);
  const h =
    c < HUE_EPSILON ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { l: lab.l, c, h };
}

function oklchToSrgb(color: Oklch): Srgb {
  const radians = (color.h * Math.PI) / 180;
  return toGammaSrgb(
    oklabToLinearSrgb({
      l: color.l,
      a: color.c * Math.cos(radians),
      b: color.c * Math.sin(radians),
    }),
  );
}

function linearSrgbToOklab(rgb: Srgb): { l: number; a: number; b: number } {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinearSrgb(lab: { l: number; a: number; b: number }): Srgb {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function toLinearSrgb(rgb: Srgb): Srgb {
  return {
    r: srgbChannelToLinear(rgb.r),
    g: srgbChannelToLinear(rgb.g),
    b: srgbChannelToLinear(rgb.b),
  };
}

function toGammaSrgb(rgb: Srgb): Srgb {
  return {
    r: linearChannelToSrgb(rgb.r),
    g: linearChannelToSrgb(rgb.g),
    b: linearChannelToSrgb(rgb.b),
  };
}

function srgbChannelToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(channel: number): number {
  if (channel <= 0.0031308) return 12.92 * channel;
  return 1.055 * channel ** (1 / 2.4) - 0.055;
}

function wcagContrast(a: Srgb, b: Srgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb: Srgb): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  );
}

function srgbToHex(rgb: Srgb): string {
  return `#${hexChannel(rgb.r)}${hexChannel(rgb.g)}${hexChannel(rgb.b)}`;
}

function hexChannel(channel: number): string {
  const value = Math.round(clamp01(channel) * 255);
  return value.toString(16).padStart(2, "0");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
