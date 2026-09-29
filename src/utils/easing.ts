import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

/**
 * The easing vocabulary of the piece. Each curve has exactly one job; nothing uses a stock ease.
 * The SVG path data is also what the Director's Cut plots, so the documentation is the source.
 */
export const EASE_PATHS = {
  /** Entrances. Fast arrival, long deceleration: things land, they don't stop. */
  enter: 'M0,0 C0.16,1 0.3,1 1,1',
  /** Exits. Slow departure, accelerating out: things are pulled away, never faded. */
  exit: 'M0,0 C0.7,0 0.84,0 1,1',
  /** Movement-to-movement transitions ("mutation" between hexachords). Long hold, decisive turn, long settle. */
  mutate: 'M0,0 C0.3,0 0.35,0.06 0.46,0.3 0.56,0.52 0.6,0.94 1,1',
  /** Magnetic UI snaps. A 6% overshoot so targets feel sprung, not tweened. */
  magnet: 'M0,0 C0.22,1.35 0.36,1 1,1',
  /** Breathing / idle loops. Symmetric, slightly longer at the extremes than a sine. */
  breath: 'M0,0 C0.45,0 0.4,1 1,1',
  /** Instrument strikes. Near-instant attack, long exponential-like tail. */
  strike: 'M0,0 C0.02,0.8 0.12,1 1,1',
  /** Decode / scramble reveals. Stepped start, smooth resolve. */
  decode: 'M0,0 C0.5,0 0.5,0.2 0.62,0.5 0.74,0.82 0.8,1 1,1',
} as const;

export type EaseName = keyof typeof EASE_PATHS;

export const EASE_PURPOSE: Record<EaseName, string> = {
  enter: 'Entrances decelerate',
  exit: 'Exits accelerate',
  mutate: 'Movement transitions',
  magnet: 'Magnetic snaps',
  breath: 'Idle + pulses',
  strike: 'Instrument strikes',
  decode: 'Text decode',
};

for (const [name, path] of Object.entries(EASE_PATHS)) CustomEase.create(`hx.${name}`, path);

/** Named GSAP ease strings, e.g. `ease: EASE.enter`. */
export const EASE: Record<EaseName, string> = {
  enter: 'hx.enter',
  exit: 'hx.exit',
  mutate: 'hx.mutate',
  magnet: 'hx.magnet',
  breath: 'hx.breath',
  strike: 'hx.strike',
  decode: 'hx.decode',
};

/** Callable easing functions for per-frame math (uniform shaping, audio envelopes). */
export const easeFn = (name: EaseName): ((t: number) => number) => gsap.parseEase(EASE[name]);

/** Durations in seconds, mirroring --d-* in tokens.css. */
export const DUR = {
  instant: 0.09,
  fast: 0.18,
  base: 0.36,
  slow: 0.72,
  cinematic: 1.44,
} as const;
