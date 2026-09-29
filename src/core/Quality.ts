import { store } from './Store';
import type { Frame } from './Ticker';

export type Tier = 'high' | 'medium' | 'low';

export interface TierSettings {
  /** Max device pixel ratio. Never above 2: beyond that it's fill-rate for nobody. */
  dpr: number;
  /** Particle simulation texture edge. Particles = size^2. */
  particleSize: number;
  /** Raymarch internal resolution as a fraction of the drawing buffer. */
  marchScale: number;
  marchSteps: number;
  fluidSize: number;
  fluidIterations: number;
  bloomLevels: number;
  chromatic: boolean;
  lens: boolean;
  grain: boolean;
  fluid: boolean;
  bloom: boolean;
  shadows: boolean;
}

export const TIERS: Record<Tier, TierSettings> = {
  high: {
    dpr: 2,
    particleSize: 512,
    marchScale: 0.5,
    marchSteps: 96,
    fluidSize: 256,
    fluidIterations: 20,
    bloomLevels: 6,
    chromatic: true,
    lens: true,
    grain: true,
    fluid: true,
    bloom: true,
    shadows: true,
  },
  medium: {
    dpr: 1.5,
    particleSize: 256,
    marchScale: 0.4,
    marchSteps: 64,
    fluidSize: 160,
    fluidIterations: 12,
    bloomLevels: 5,
    chromatic: true,
    lens: true,
    grain: true,
    fluid: true,
    bloom: true,
    shadows: true,
  },
  low: {
    dpr: 1,
    particleSize: 160,
    marchScale: 0.3,
    marchSteps: 40,
    fluidSize: 96,
    fluidIterations: 6,
    bloomLevels: 4,
    chromatic: false,
    lens: false,
    grain: true,
    fluid: true,
    bloom: true,
    shadows: false,
  },
};

const ORDER: readonly Tier[] = ['high', 'medium', 'low'];
const WINDOW = 90;

/**
 * Frame-time monitor. Drops a tier when the rolling average stays above budget for ~1.5 s,
 * and only ever climbs back once, after a long stable stretch, so it never oscillates.
 */
export class Quality {
  tier: Tier;
  private samples = new Float32Array(WINDOW);
  private i = 0;
  private filled = false;
  private cooldown = 3;
  private stableFor = 0;
  private climbed = false;
  private locked = false;
  readonly history = new Float32Array(180);
  private h = 0;

  constructor(initial: Tier) {
    this.tier = initial;
    store.state.tier = initial;
  }

  get settings(): TierSettings {
    return TIERS[this.tier];
  }

  get average(): number {
    const n = this.filled ? WINDOW : this.i;
    if (!n) return 16.7;
    let s = 0;
    for (let k = 0; k < n; k++) s += this.samples[k] ?? 0;
    return s / n;
  }

  /** Lock the tier (Director's Cut manual override). */
  set(tier: Tier, reason: string, lock = false): void {
    this.locked = lock;
    if (tier === this.tier) return;
    this.tier = tier;
    store.state.tier = tier;
    this.reset();
    store.emit('quality', { tier, reason });
  }

  private reset(): void {
    this.i = 0;
    this.filled = false;
    this.cooldown = 2.5;
    this.stableFor = 0;
  }

  update(f: Frame): void {
    this.history[this.h] = f.rawMs;
    this.h = (this.h + 1) % this.history.length;
    if (f.rawMs > 250) return; // tab switch / breakpoint: not a performance signal
    this.samples[this.i] = f.rawMs;
    this.i = (this.i + 1) % WINDOW;
    if (this.i === 0) this.filled = true;
    if (this.cooldown > 0) {
      this.cooldown -= f.dt;
      return;
    }
    if (!this.filled || this.locked) return;
    const avg = this.average;
    const idx = ORDER.indexOf(this.tier);
    if (avg > 21 && idx < ORDER.length - 1) {
      this.set(ORDER[idx + 1] ?? 'low', `avg ${avg.toFixed(1)} ms > 21 ms`);
      return;
    }
    if (avg < 11 && idx > 0 && !this.climbed) {
      this.stableFor += f.dt;
      if (this.stableFor > 8) {
        this.climbed = true;
        this.set(ORDER[idx - 1] ?? 'high', `avg ${avg.toFixed(1)} ms < 11 ms for 8 s`);
      }
    } else this.stableFor = 0;
  }

  get historyIndex(): number {
    return this.h;
  }
}
