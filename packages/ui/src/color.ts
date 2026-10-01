/**
 * Colour arithmetic for the theme tokens: sRGB hex, WCAG 2.x relative luminance and contrast
 * ratio, mixing and a lightness search. The same formulas as the design mockup
 * (docs/design/mockups.html), so the tokens match what the owner chose there.
 */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb: readonly number[]): string {
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Relative luminance (WCAG 2.x). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `a` moved towards `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + ((B[i] ?? 0) - v) * t));
}

function toHsl(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function fromHsl([h, s, l]: Rgb): string {
  if (!s) return rgbToHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex([f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => v * 255));
}

/**
 * Moves the lightness of `hex` in direction `dir` (+1 lighter, -1 darker) in 1 % steps until
 * it reaches `target` contrast against `background`.
 */
export function fitContrast(hex: string, background: string, target: number, dir: 1 | -1): string {
  const [h, s, start] = toHsl(hex);
  let l = start;
  let colour = hex;
  for (let i = 0; i < 100 && contrastRatio(colour, background) < target; i++) {
    l = Math.max(0, Math.min(1, l + dir * 0.01));
    colour = fromHsl([h, s, l]);
    if (l === 0 || l === 1) break;
  }
  return colour;
}
