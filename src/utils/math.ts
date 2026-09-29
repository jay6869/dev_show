export const TAU = Math.PI * 2;

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number, clamped = true): number => {
  const t = invLerp(a0, a1, v);
  return lerp(b0, b1, clamped ? clamp(t) : t);
};
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Frame-rate independent exponential damping. `lambda` is "how fast", in 1/s.
 * Use this instead of `lerp(a, b, 0.1)`, which silently changes feel between 60 and 120 Hz.
 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Distance from `x` to the nearest integer, 0..0.5. Used for "closeness to a movement boundary". */
export const fractDist = (x: number): number => Math.abs(x - Math.round(x));

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const midiToName = (m: number): string =>
  `${NOTE_NAMES[((m % 12) + 12) % 12] ?? '?'}${Math.floor(m / 12) - 1}`;

/** Deterministic PRNG (mulberry32). Seeded so particle layouts are identical on every visit. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. Used live by the Director's Cut palette. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const [r = 0, g = 0, bl = 0] = c.map((x) =>
      x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4),
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
