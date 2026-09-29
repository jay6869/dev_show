import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { UI } from '../content/copy';
import { Sound } from '../audio/Sound';
import { on, qs, qsa } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { Bin } from '../utils/dispose';

gsap.registerPlugin(SplitText);

export type Choice = 'sound' | 'silent';

/**
 * Entry gate. A real modal dialog: focus is trapped, the remembered choice is pre-focused, Esc
 * chooses silence (the safe default). The choice callback runs synchronously inside the gesture,
 * which is what lets audio start on iOS.
 */
export class EntryGate {
  private readonly root = qs('#gate');
  private readonly buttons = qsa<HTMLButtonElement>('.gate__btn', this.root);
  private readonly bin = new Bin();
  private split: SplitText | null = null;

  open(reduced: boolean, onChoose: (c: Choice) => void): Promise<Choice> {
    return new Promise((resolve) => {
      const remembered = Sound.remembered();
      const hint = qs('#gate-hint');
      if (remembered)
        hint.textContent = `${UI.gateRemembered}: ${remembered === 'sound' ? 'sound' : 'silence'}`;
      this.root.hidden = false;
      document.documentElement.classList.add('is-gated');
      const title = qs('.gate__title', this.root);
      const tl = gsap.timeline();
      tl.fromTo(this.root, { autoAlpha: 0 }, { autoAlpha: 1, duration: DUR.slow, ease: EASE.enter });
      if (!reduced) {
        this.split = SplitText.create(title, { type: 'lines,words', mask: 'lines' });
        tl.from(
          this.split.lines,
          { yPercent: 110, duration: DUR.cinematic, ease: EASE.enter, stagger: 0.08 },
          0.1,
        )
          .from(
            '.gate__desc, .gate__index',
            { autoAlpha: 0, y: 12, duration: DUR.slow, ease: EASE.enter, stagger: 0.06 },
            0.4,
          )
          .from(
            this.buttons,
            { autoAlpha: 0, y: 16, duration: DUR.slow, ease: EASE.enter, stagger: 0.08 },
            0.55,
          );
      }
      const preferred =
        this.buttons.find((b) => b.dataset.choice === (remembered ?? 'sound')) ?? this.buttons[0];
      tl.add(() => preferred?.focus({ preventScroll: true }), reduced ? 0 : 0.6);

      const choose = (c: Choice): void => {
        onChoose(c);
        this.bin.dispose();
        this.close(reduced)
          .then(() => resolve(c))
          .catch(() => resolve(c));
      };
      for (const b of this.buttons) {
        this.bin.add(on(b, 'click', () => choose(b.dataset.choice === 'sound' ? 'sound' : 'silent')));
      }
      this.bin.add(
        on(this.root, 'keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            choose('silent');
          } else if (e.key === 'Tab') {
            const first = this.buttons[0];
            const last = this.buttons[this.buttons.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }),
      );
    });
  }

  private async close(reduced: boolean): Promise<void> {
    const tl = gsap.timeline();
    if (!reduced && this.split) {
      tl.to(this.split.lines, { yPercent: -110, duration: DUR.slow, ease: EASE.exit, stagger: 0.05 }, 0);
      tl.to(this.buttons, { autoAlpha: 0, y: -10, duration: DUR.base, ease: EASE.exit, stagger: 0.04 }, 0);
    }
    tl.to(this.root, { autoAlpha: 0, duration: DUR.slow, ease: EASE.exit }, reduced ? 0 : 0.25);
    await tl;
    this.root.hidden = true;
    document.documentElement.classList.remove('is-gated');
    this.split?.revert();
    this.split = null;
  }

  dispose(): void {
    this.bin.dispose();
    this.split?.revert();
  }
}
