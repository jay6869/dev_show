import { gsap } from 'gsap';
import { MOVEMENTS, UI } from '../content/copy';
import { store } from '../core/Store';
import { qs } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { Bin } from '../utils/dispose';

/**
 * Two channels. The visible caption line describes the sound (for anyone who can't hear it) and
 * notes discovered secrets. The screen-reader announcer states each movement as it arrives.
 */
export class Captions {
  private readonly el = qs('#captions');
  private readonly announcer = qs('#announcer');
  private readonly bin = new Bin();
  private hideCall: gsap.core.Tween | null = null;

  constructor() {
    this.bin.add(
      store.on('movement', ({ index }) => {
        const m = MOVEMENTS[index];
        if (m) this.announcer.textContent = UI.announceMovement(m);
      }),
    );
    this.bin.add(store.on('secret', ({ name }) => this.show(`✦ ${name}`, 3.2)));
  }

  /** Sound caption. Only shown while sound is actually on. */
  sound(text: string): void {
    if (!store.state.sound) return;
    this.show(`♪ ${text}`, 4.5);
  }

  show(text: string, seconds: number): void {
    this.hideCall?.kill();
    gsap.killTweensOf(this.el);
    const reduced = store.state.reducedMotion;
    gsap
      .timeline()
      .to(this.el, { autoAlpha: 0, y: reduced ? 0 : -6, duration: DUR.fast, ease: EASE.exit })
      .add(() => {
        this.el.textContent = text;
      })
      .fromTo(
        this.el,
        { autoAlpha: 0, y: reduced ? 0 : 8 },
        { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.enter },
      );
    this.hideCall = gsap.delayedCall(seconds, () => {
      gsap.to(this.el, { autoAlpha: 0, duration: DUR.slow, ease: EASE.exit });
    });
  }

  dispose(): void {
    this.hideCall?.kill();
    gsap.killTweensOf(this.el);
    this.bin.dispose();
  }
}
