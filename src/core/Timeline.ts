import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EASE } from '../utils/easing';
import { MOVEMENT_COUNT } from './Scroll';

gsap.registerPlugin(ScrollTrigger);

/** The world's tweenable state. The master timeline writes it; the World reads it every frame. */
export interface WorldState {
  cam: number;
  morph: number;
  grid: number;
  strain: number;
  liquid: number;
  crystal: number;
  strings: number;
  decay: number;
  curl: number;
  curlFreq: number;
  spring: number;
  damping: number;
  bloom: number;
  exposure: number;
  accent: number;
  focus: number;
  aperture: number;
  size: number;
  grain: number;
  vignette: number;
}

type Key = Omit<WorldState, 'cam' | 'morph'>;

const base: Key = {
  grid: 0,
  strain: 0,
  liquid: 0,
  crystal: 0,
  strings: 0,
  decay: 0,
  curl: 0.9,
  curlFreq: 0.32,
  spring: 2.2,
  damping: 0.93,
  bloom: 0.85,
  exposure: 1,
  accent: 0.35,
  focus: 9,
  aperture: 0.35,
  size: 1,
  grain: 1,
  vignette: 0.65,
};

/**
 * Per-movement "rest" values. Index = movement (0..5). Movement I starts on the word (morph 0) and
 * dissolves to its field (morph 1) inside its own span; every later movement rests at morph = index + 1.
 */
export const KEYS: readonly Key[] = [
  // I at rest is the title: stiff springs, almost no turbulence, sharp focus on the glyphs.
  // Every particle sits on the glyphs here, so points are smaller and bloom lower than anywhere else.
  {
    ...base,
    curl: 0.16,
    spring: 7,
    damping: 0.86,
    bloom: 0.65,
    accent: 0.2,
    focus: 9.6,
    aperture: 0.18,
    size: 0.85,
  },
  {
    ...base,
    grid: 1,
    curl: 0.12,
    curlFreq: 0.5,
    spring: 9,
    damping: 0.86,
    bloom: 0.6,
    accent: 0.8,
    focus: 8.8,
    aperture: 0.2,
    size: 0.85,
  },
  {
    ...base,
    liquid: 1,
    curl: 0.8,
    spring: 2,
    bloom: 0.75,
    accent: 0.3,
    focus: 7.6,
    aperture: 0.6,
    vignette: 0.8,
  },
  { ...base, crystal: 1, curl: 0.45, spring: 3.4, bloom: 1.05, accent: 0.2, focus: 7.4, aperture: 0.45 },
  {
    ...base,
    strings: 1,
    curl: 0.05,
    curlFreq: 0.6,
    spring: 8,
    damping: 0.86,
    bloom: 0.9,
    accent: 1,
    focus: 8.4,
    aperture: 0.15,
    size: 0.9,
  },
  {
    ...base,
    decay: 0.2,
    curl: 0.25,
    spring: 2.4,
    bloom: 1.25,
    exposure: 0.85,
    accent: 0.5,
    focus: 11.5,
    aperture: 0.8,
    grain: 1.3,
    vignette: 0.95,
  },
];

/** Movement I after the title has dissolved: the open, turbulent field. */
const FIELD: Partial<Key> = {
  curl: 1.1,
  spring: 1.4,
  damping: 0.93,
  focus: 9.2,
  aperture: 0.5,
  bloom: 0.9,
  size: 1,
};

export function initialState(): WorldState {
  return { cam: 0, morph: 0, ...KEYS[0]! };
}

/** Where each movement's transition starts (in movement units) and how long it lasts. */
export const MUTATION_START = 0.56;
export const MUTATION_LENGTH = 0.52;
const HOLD_OFFSET = MUTATION_START + MUTATION_LENGTH - 1;

/**
 * Transition factory: "mutation" from movement `from` to `from + 1`.
 * Outgoing layers exit with an accelerating curve slightly early; incoming layers enter decelerating,
 * slightly late; the particle morph and camera use the one signature `mutate` curve, so every
 * transition in the piece shares a rhythm.
 */
export function mutation(state: WorldState, from: number): gsap.core.Timeline {
  const to = from + 1;
  const k = KEYS[to]!;
  const prev = KEYS[from]!;
  const tl = gsap.timeline({ defaults: { duration: MUTATION_LENGTH } });
  const layerOut: Partial<Key> = {};
  const layerIn: Partial<Key> = {};
  for (const name of ['grid', 'liquid', 'crystal', 'strings'] as const) {
    if (prev[name] > k[name]) layerOut[name] = k[name];
    else if (k[name] > prev[name]) layerIn[name] = k[name];
  }
  tl.to(state, { morph: to + 1, cam: to, ease: EASE.mutate }, 0);
  tl.to(state, { ...layerOut, ease: EASE.exit, duration: MUTATION_LENGTH * 0.6 }, 0);
  tl.to(state, { ...layerIn, ease: EASE.enter, duration: MUTATION_LENGTH * 0.7 }, MUTATION_LENGTH * 0.3);
  tl.to(
    state,
    {
      curl: k.curl,
      curlFreq: k.curlFreq,
      spring: k.spring,
      damping: k.damping,
      bloom: k.bloom,
      exposure: k.exposure,
      accent: k.accent,
      focus: k.focus,
      aperture: k.aperture,
      size: k.size,
      grain: k.grain,
      vignette: k.vignette,
      decay: k.decay,
      strain: k.strain,
      ease: EASE.mutate,
    },
    0,
  );
  return tl;
}

/** Per-movement evolution while "holding" a movement: the piece never sits still. */
export function hold(state: WorldState, index: number): gsap.core.Timeline {
  const tl = gsap.timeline();
  // Holds begin once the incoming mutation has fully landed, so no two tweens fight over a property.
  const span = MUTATION_START - (index === 0 ? 0 : HOLD_OFFSET);
  switch (index) {
    case 0:
      // The title dissolves into the field as you begin to scroll.
      tl.to(state, { morph: 1, ...FIELD, duration: 0.42, ease: EASE.mutate }, 0.06);
      tl.to(state, { cam: 0.1, duration: span, ease: 'none' }, 0);
      break;
    case 1:
      // Load builds on the lattice until something has to give.
      tl.to(state, { strain: 1, duration: span, ease: 'power2.in' }, 0);
      tl.to(state, { cam: index + 0.08, duration: span, ease: 'none' }, 0);
      break;
    case 5:
      // Afterglow: everything decays on the way to the end.
      tl.to(
        state,
        { decay: 1, exposure: 0.6, bloom: 1.5, curl: 0.08, duration: 0.9, ease: 'power1.inOut' },
        0.02,
      );
      tl.to(state, { cam: index + 0.9, duration: 1 - HOLD_OFFSET, ease: 'none' }, 0);
      break;
    default:
      tl.to(state, { cam: index + 0.08, duration: span, ease: 'none' }, 0);
  }
  return tl;
}

/**
 * The master timeline: one label per movement, holds and mutations composed from factories.
 * Its duration is exactly MOVEMENT_COUNT units, and ScrollTrigger maps the document onto it 1:1.
 */
export function buildMaster(state: WorldState): { timeline: gsap.core.Timeline; trigger: ScrollTrigger } {
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  for (let i = 0; i < MOVEMENT_COUNT; i++) {
    tl.addLabel(`m${i}`, i);
    tl.add(hold(state, i), i === 0 ? 0 : i + HOLD_OFFSET);
    if (i < MOVEMENT_COUNT - 1) tl.add(mutation(state, i), i + MUTATION_START);
  }
  tl.set({}, {}, MOVEMENT_COUNT);
  const trigger = ScrollTrigger.create({
    trigger: '#main',
    start: 'top top',
    end: 'bottom bottom',
    animation: tl,
    // Smoothing lives here: the timeline trails the scrollbar by ~0.9 s of catch-up.
    scrub: 0.9,
  });
  return { timeline: tl, trigger };
}
