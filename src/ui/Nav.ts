import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { UI } from '../content/copy';
import { store } from '../core/Store';
import type { Frame } from '../core/Ticker';
import { on, qs, qsa } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { Bin } from '../utils/dispose';

gsap.registerPlugin(Flip);

export interface NavHandlers {
  goTo(index: number): void;
  toggleSound(): void;
  toggleDirectors(): void;
  hover(): void;
}

/**
 * Header navigation. Movement numerals are real links (they work without JS); the active marker
 * travels between them with Flip, so its motion is measured from layout rather than hard-coded.
 */
export class Nav {
  private readonly root = qs('#nav');
  private readonly items = qsa<HTMLAnchorElement>('.nav__item', this.root);
  private readonly marker = qs('.nav__marker', this.root);
  private readonly progress = qs('.nav__progress', this.root);
  private readonly soundBtn = qs<HTMLButtonElement>('#btn-sound');
  private readonly soundLabel = qs('.nav__btn-label', this.soundBtn);
  private readonly dcBtn = qs<HTMLButtonElement>('#btn-dc');
  private readonly bin = new Bin();
  private readonly setProgress = gsap.quickSetter(this.progress, 'scaleX') as (v: number) => void;
  private current = 0;

  constructor(h: NavHandlers) {
    this.items.forEach((a, i) => {
      this.bin.add(
        on(a, 'click', (e) => {
          e.preventDefault();
          h.goTo(i);
        }),
      );
      this.bin.add(on(a, 'pointerenter', () => h.hover()));
    });
    this.bin.add(on(this.soundBtn, 'click', () => h.toggleSound()));
    this.bin.add(on(this.dcBtn, 'click', () => h.toggleDirectors()));
    this.bin.add(on(this.soundBtn, 'pointerenter', () => h.hover()));
    this.bin.add(on(this.dcBtn, 'pointerenter', () => h.hover()));
    this.bin.add(store.on('movement', ({ index }) => this.setActive(index)));
    this.bin.add(store.on('sound', ({ enabled }) => this.setSound(enabled)));
    this.bin.add(store.on('directors', ({ open }) => this.dcBtn.setAttribute('aria-pressed', String(open))));
    this.placeMarker(0, false);
  }

  reveal(reduced: boolean): void {
    this.root.classList.add('is-visible');
    if (reduced) return;
    gsap.from(this.root.children, {
      autoAlpha: 0,
      y: -12,
      duration: DUR.slow,
      ease: EASE.enter,
      stagger: 0.06,
      delay: 0.4,
    });
  }

  private placeMarker(index: number, animate: boolean): void {
    const target = this.items[index];
    if (!target) return;
    const state = animate ? Flip.getState(this.marker) : null;
    target.parentElement?.appendChild(this.marker);
    if (state) Flip.from(state, { duration: DUR.slow, ease: EASE.magnet });
  }

  private setActive(index: number): void {
    if (index === this.current) return;
    this.items[this.current]?.removeAttribute('aria-current');
    this.items[index]?.setAttribute('aria-current', 'step');
    this.current = index;
    this.placeMarker(index, !store.state.reducedMotion);
  }

  private setSound(enabled: boolean): void {
    this.soundBtn.setAttribute('aria-pressed', String(enabled));
    this.soundBtn.classList.toggle('is-on', enabled);
    this.soundLabel.textContent = enabled ? UI.soundOn : UI.soundOff;
  }

  update(_f: Frame): void {
    this.setProgress(store.state.progress * (6 / 5.999));
  }

  dispose(): void {
    this.bin.dispose();
  }
}
