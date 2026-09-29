import { gsap } from 'gsap';

export interface Frame {
  /** Seconds since start, paused time excluded. Never jumps. */
  time: number;
  /** Clamped delta in seconds (max 1/20 s) so a dropped frame never teleports a simulation. */
  dt: number;
  /** Raw delta in ms, for the quality monitor and graphs. */
  rawMs: number;
  frame: number;
}

type Callback = (f: Frame) => void;

interface Entry {
  fn: Callback;
  priority: number;
}

/** Update order. Lower runs first: input -> simulation -> render -> UI readouts. */
export const PRIORITY = {
  input: 0,
  state: 10,
  audio: 20,
  sim: 30,
  render: 50,
  ui: 70,
  stats: 90,
} as const;

/**
 * The only animation loop in the app. It rides gsap.ticker, so GSAP tweens, ScrollTrigger scrubs and
 * WebGL frames are evaluated in the same requestAnimationFrame, in a deterministic order.
 */
class TickerImpl {
  private entries: Entry[] = [];
  private dirty = false;
  private running = false;
  private paused = false;
  private last = 0;
  readonly frame: Frame = { time: 0, dt: 0, rawMs: 0, frame: 0 };

  private readonly tick = (): void => {
    const now = performance.now();
    const raw = this.last ? now - this.last : 16.67;
    this.last = now;
    if (this.paused) return;
    this.frame.rawMs = raw;
    this.frame.dt = Math.min(raw / 1000, 1 / 20);
    this.frame.time += this.frame.dt;
    this.frame.frame++;
    if (this.dirty) {
      this.entries.sort((a, b) => a.priority - b.priority);
      this.dirty = false;
    }
    for (const e of this.entries) e.fn(this.frame);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    gsap.ticker.lagSmoothing(250, 33);
    gsap.ticker.add(this.tick);
  }

  add(fn: Callback, priority: number = PRIORITY.state): () => void {
    const entry: Entry = { fn, priority };
    this.entries.push(entry);
    this.dirty = true;
    return () => {
      this.entries = this.entries.filter((e) => e !== entry);
    };
  }

  /** Stop updating (tab hidden, context lost). Resume resets the clock so nothing jumps. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.last = 0;
    if (paused) gsap.ticker.sleep();
    else gsap.ticker.wake();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    gsap.ticker.remove(this.tick);
    this.entries = [];
    this.running = false;
  }
}

export const ticker = new TickerImpl();
