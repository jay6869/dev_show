import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { store } from '../core/Store';
import type { Frame } from '../core/Ticker';
import { qs, qsa } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { damp } from '../utils/math';
import { Bin } from '../utils/dispose';

gsap.registerPlugin(ScrambleTextPlugin);

/**
 * The preloader is the first bar of the piece. Six solmization syllables (ut re mi fa sol la) light
 * as real work completes; at 100 the rule collapses into a single point, and that point is exactly
 * where the particle field is born.
 */
export class Preloader {
  private readonly root = qs('#preloader');
  private readonly fill = qs('.preloader__fill', this.root);
  private readonly count = qs('.preloader__count', this.root);
  private readonly task = qs('.preloader__task', this.root);
  private readonly word = qs('.preloader__word', this.root);
  private readonly point = qs('.preloader__point', this.root);
  private readonly ticks = qsa('.preloader__tick', this.root);
  private readonly bin = new Bin();
  private target = 0;
  private shown = 0;
  private lastTask = '';
  private lit = -1;
  private readonly setFill = gsap.quickSetter(this.fill, 'scaleX') as (v: number) => void;

  constructor(reduced: boolean) {
    this.bin.add(
      store.on('load:progress', ({ value, task }) => {
        this.target = value;
        if (task !== this.lastTask) {
          this.lastTask = task;
          gsap.to(this.task, {
            duration: DUR.slow,
            scrambleText: { text: task, chars: 'lowerCase', speed: 0.6 },
            ease: EASE.decode,
          });
        }
      }),
    );
    if (!reduced) {
      gsap.from(this.word, {
        duration: DUR.cinematic,
        scrambleText: { text: this.word.textContent ?? '', chars: 'upperCase', revealDelay: 0.3, speed: 0.4 },
        ease: EASE.decode,
      });
    }
  }

  update(f: Frame): void {
    // Displayed progress chases real progress; it may lag, it never leads.
    this.shown = Math.min(this.target, damp(this.shown, this.target, 6, f.dt));
    if (this.target >= 1 && this.shown > 0.995) this.shown = 1;
    this.setFill(this.shown);
    const pct = Math.round(this.shown * 100);
    this.count.textContent = String(pct).padStart(3, '0');
    this.root.setAttribute('aria-valuenow', String(pct));
    const lit = Math.floor(this.shown * 6 - 1e-6);
    if (lit !== this.lit) {
      this.ticks.forEach((t, i) => t.classList.toggle('is-lit', i <= lit));
      this.lit = lit;
    }
  }

  get done(): boolean {
    return this.shown >= 1;
  }

  /** Waits for displayed progress to reach 100, then collapses into the birth point. */
  async complete(reduced: boolean): Promise<void> {
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (this.done) {
          gsap.ticker.remove(check);
          resolve();
        }
      };
      gsap.ticker.add(check);
    });
    const tl = gsap.timeline();
    if (reduced) {
      tl.to(this.root, { autoAlpha: 0, duration: DUR.base, ease: EASE.exit });
    } else {
      tl.to(
        [this.word, this.ticks, this.count, this.task],
        { autoAlpha: 0, y: -8, duration: DUR.base, ease: EASE.exit, stagger: 0.03 },
        0.1,
      )
        .to(this.fill, { scaleX: 0, duration: DUR.slow, ease: EASE.mutate, transformOrigin: '50% 50%' }, 0.2)
        .fromTo(
          this.point,
          { scale: 0, autoAlpha: 1 },
          { scale: 1, duration: DUR.base, ease: EASE.magnet },
          0.62,
        )
        .to(this.point, { scale: 3, autoAlpha: 0, duration: DUR.slow, ease: EASE.exit }, 1.0)
        .to(this.root, { autoAlpha: 0, duration: DUR.base, ease: EASE.exit }, 1.05);
    }
    await tl;
    this.root.setAttribute('aria-busy', 'false');
    this.root.hidden = true;
    document.documentElement.classList.remove('is-loading');
  }

  dispose(): void {
    this.bin.dispose();
    gsap.killTweensOf([this.task, this.word, this.fill, this.point, this.root]);
  }
}
