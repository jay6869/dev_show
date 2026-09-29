import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MOVEMENTS } from '../content/copy';
import { on, qsa } from '../utils/dom';
import { clamp, damp } from '../utils/math';
import { Bin } from '../utils/dispose';
import { store } from './Store';
import type { Frame } from './Ticker';

gsap.registerPlugin(ScrollTrigger);

export const MOVEMENT_COUNT = MOVEMENTS.length;

/**
 * Native scroll, read not hijacked. Each movement section is the same height and the last one is one
 * viewport taller, so document scroll maps linearly onto a 0..6 "movement position". ScrollTrigger scrubs
 * the master timeline against it; this class adds the smoothed velocity everything else feeds on.
 *
 * Lenis is deliberately not used: native scroll keeps momentum, find-in-page, anchor links, keyboard and
 * assistive tech behaving exactly as the platform intends. Smoothing lives in the scrub and in `damp`.
 */
export class Scroll {
  readonly sections: HTMLElement[];
  /** Movement position, 0..6. Raw (unsmoothed) from scroll. */
  position = 0;
  /** Normalized scroll velocity, viewport-heights per second, damped. Signed. */
  velocity = 0;
  /** |velocity| shaped to 0..1 for uniforms. */
  energy = 0;
  current = 0;
  private lastY = window.scrollY;
  private readonly bin = new Bin();

  constructor() {
    this.sections = qsa('.movement');
    ScrollTrigger.config({ ignoreMobileResize: true });
    this.bin.add(on(window, 'resize', () => ScrollTrigger.refresh()));
  }

  get sectionHeight(): number {
    return this.sections[0]?.offsetHeight ?? window.innerHeight * 3;
  }

  /** Scroll to a movement start. Respects reduced motion by jumping. */
  goTo(index: number, reduced: boolean): void {
    const target = this.sections[clamp(index, 0, MOVEMENT_COUNT - 1)];
    if (!target) return;
    // Land a little past the section top so the entrance timeline has settled.
    const y = target.offsetTop + window.innerHeight * 0.35 * (index === 0 ? 0 : 1);
    window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  }

  update(f: Frame): void {
    const y = window.scrollY;
    const h = this.sectionHeight;
    this.position = clamp(y / h, 0, MOVEMENT_COUNT - 0.001);
    const vh = window.innerHeight || 1;
    const inst = f.dt > 0 ? (y - this.lastY) / vh / f.dt : 0;
    this.lastY = y;
    this.velocity = damp(this.velocity, clamp(inst, -12, 12), 6, f.dt);
    this.energy = clamp(Math.abs(this.velocity) / 3);
    store.state.progress = this.position / MOVEMENT_COUNT;
    store.state.velocity = this.velocity;

    // A movement is "current" once its stage owns most of the viewport.
    const idx = clamp(Math.floor(this.position + 0.5 - 0.15), 0, MOVEMENT_COUNT - 1);
    if (idx !== this.current) {
      const prev = this.current;
      this.current = idx;
      store.state.movement = idx;
      store.emit('movement', { index: idx, prev });
    }
    store.emit('progress', { value: store.state.progress, velocity: this.velocity });
  }

  dispose(): void {
    this.bin.dispose();
    ScrollTrigger.getAll().forEach((t) => t.kill());
  }
}
