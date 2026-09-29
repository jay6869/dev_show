import { store } from '../core/Store';
import type { Frame } from '../core/Ticker';
import { on } from '../utils/dom';
import { Bin } from '../utils/dispose';

const IDLE_AFTER = 8;

/**
 * After 8 s without input the piece plays itself: the Pointer hands over to a slow generative gesture
 * and the Instrument (in V) plays along. Any input snaps back. Never runs under reduced motion.
 */
export class Idle {
  private lastInput = 0;
  private now = 0;
  private idle = false;
  private readonly bin = new Bin();
  enabled = false;

  constructor() {
    const poke = (): void => {
      this.lastInput = this.now;
      if (this.idle) this.set(false);
    };
    for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const) {
      this.bin.add(on(window, type, poke, { passive: true }));
    }
  }

  private set(v: boolean): void {
    this.idle = v;
    store.state.idle = v;
    store.emit('idle', { idle: v });
  }

  update(f: Frame): void {
    this.now = f.time;
    const allowed = this.enabled && !store.state.reducedMotion && !store.state.directors;
    if (!allowed) {
      if (this.idle) this.set(false);
      this.lastInput = f.time;
      return;
    }
    if (!this.idle && f.time - this.lastInput > IDLE_AFTER) this.set(true);
  }

  dispose(): void {
    this.bin.dispose();
  }
}
