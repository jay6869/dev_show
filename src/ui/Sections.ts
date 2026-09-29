import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { store } from '../core/Store';
import type { Pointer } from '../core/Pointer';
import type { Frame } from '../core/Ticker';
import type { WorldState } from '../core/Timeline';
import { on, qs, qsa } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { clamp, damp, midiToName } from '../utils/math';
import { Bin } from '../utils/dispose';
import type { Instrument } from '../audio/Instrument';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

interface Title {
  section: HTMLElement;
  stage: HTMLElement;
  chars: HTMLElement[];
  centers: number[];
  weight: ((v: number) => void)[];
  stretch: ((v: number) => void)[];
  lift: ((v: number) => void)[];
  skew: (v: number) => void;
}

/**
 * DOM choreography for the six movements. Every title is split into masked characters; entrances
 * and exits are scrubbed by scroll; each movement then gets its own live typographic behaviour:
 *   II strains the width axis, III lets letters float on the liquid, IV reads out refraction,
 *   V highlights strings and names notes. All of it is real, selectable, accessible text.
 */
export class Sections {
  private readonly sections = qsa('.movement');
  private readonly titles: Title[] = [];
  private readonly splits: SplitText[] = [];
  private readonly bin = new Bin();
  private readonly triggers: ScrollTrigger[] = [];
  private skew = 0;
  private lastReadout = 0;
  private readonly keys = qsa<HTMLButtonElement>('.keys__key');
  private readonly noteName = document.querySelector<HTMLElement>('.instrument-note__name');
  private readonly iorEls = qsa('[data-ior]');
  private hoverKey = -1;
  private reduced = false;
  private dirtyCenters = true;

  constructor(
    private readonly pointer: Pointer,
    private readonly instrument: Instrument,
  ) {
    this.bin.add(on(window, 'resize', () => (this.dirtyCenters = true)));
    this.bin.add(
      store.on('movement', ({ prev }) => {
        this.dirtyCenters = true;
        this.relax(prev);
      }),
    );
    this.bin.add(
      store.on('note', ({ string, midi }) => {
        const key = this.keys[string];
        if (key) {
          key.classList.remove('is-struck');
          key.getBoundingClientRect(); // reflow, so the strike animation restarts
          key.classList.add('is-struck');
        }
        if (this.noteName) this.noteName.textContent = midiToName(midi);
      }),
    );
    this.keys.forEach((k, i) => {
      // Keyboard activation (Enter/Space) arrives as a click with detail 0: pluck that exact string.
      this.bin.add(
        on(k, 'click', (e) => {
          if (e.detail === 0)
            this.instrument.pluck(i, 0.8, this.instrument.stringX(i), window.innerHeight * 0.5, false);
        }),
      );
    });
  }

  setup(reduced: boolean): void {
    this.reduced = reduced;
    this.sections.forEach((section, i) => {
      const stage = qs('.movement__stage', section);
      const titleEl = qs('.movement__title', section);
      const lineEl = qs('.movement__line', section);
      const indexEl = qs('.movement__index', section);
      const split = SplitText.create(titleEl, { type: 'chars', mask: 'chars', charsClass: 'char' });
      this.splits.push(split);
      const chars = split.chars as HTMLElement[];
      this.titles.push({
        section,
        stage,
        chars,
        centers: chars.map(() => 0),
        weight: chars.map((c) => gsap.quickSetter(c, '--wp') as (v: number) => void),
        stretch: chars.map((c) => gsap.quickSetter(c, '--wd') as (v: number) => void),
        lift: chars.map((c) => gsap.quickSetter(c, '--lift') as (v: number) => void),
        skew: gsap.quickSetter(
          stage.querySelectorAll('.movement__title, .movement__line'),
          'skewY',
          'deg',
        ) as (v: number) => void,
      });

      if (reduced) return;

      const lineSplit = SplitText.create(lineEl, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'line',
        autoSplit: true,
        // SplitText's documented contract is to return the animation; tweens are thenable, hence the rule.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSplit: (self) => {
          if (i === 0) return undefined;
          return gsap.fromTo(
            self.lines,
            { yPercent: 105 },
            {
              yPercent: 0,
              ease: EASE.enter,
              stagger: 0.1,
              scrollTrigger: { trigger: section, start: 'top 70%', end: 'top 5%', scrub: 0.6 },
            },
          );
        },
      });
      this.splits.push(lineSplit);

      if (i > 0) {
        const tlIn = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'top 85%', end: 'top 2%', scrub: 0.6 },
        });
        tlIn
          .fromTo(
            chars,
            { yPercent: 118, '--w': 120 },
            { yPercent: 0, '--w': 620, ease: EASE.enter, stagger: 0.05, duration: 1 },
            0,
          )
          .fromTo(
            indexEl,
            { autoAlpha: 0, x: -16 },
            { autoAlpha: 1, x: 0, ease: EASE.enter, duration: 0.6 },
            0.2,
          );
        if (tlIn.scrollTrigger) this.triggers.push(tlIn.scrollTrigger);
      }
      if (i < this.sections.length - 1) {
        const tlOut = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'bottom 140%', end: 'bottom 100%', scrub: 0.5 },
        });
        tlOut
          // Exits drive `y` (px) while entrances drive `yPercent`: two scrubbed timelines never own the
          // same property, so a fast jump across movements cannot leave a title stranded on screen.
          .fromTo(
            chars,
            { y: 0 },
            {
              y: (_i: number, el: HTMLElement) => -el.offsetHeight * 1.2,
              ease: EASE.exit,
              stagger: 0.035,
              immediateRender: false,
            },
            0,
          )
          .fromTo(
            [lineEl, indexEl],
            { autoAlpha: 1 },
            { autoAlpha: 0, ease: EASE.exit, duration: 0.5, immediateRender: false },
            0,
          );
        if (tlOut.scrollTrigger) this.triggers.push(tlOut.scrollTrigger);
      }
      // Each movement's numeral decodes as it arrives: a label being read off an instrument.
      const numeral = qs('.movement__numeral', section);
      const scale = qs('.movement__scale', section);
      const st = ScrollTrigger.create({
        trigger: section,
        start: 'top 40%',
        onEnter: () => {
          gsap.to(numeral, {
            duration: DUR.slow,
            scrambleText: { text: numeral.textContent ?? '', chars: 'IVX', speed: 0.5 },
            ease: EASE.decode,
          });
          gsap.to(scale, {
            duration: DUR.cinematic,
            scrambleText: { text: scale.textContent ?? '', chars: '·ABCDEFG#', speed: 0.4 },
            ease: EASE.decode,
          });
        },
      });
      this.triggers.push(st);
    });
    this.bin.add(store.on('reduced-motion', ({ reduced: r }) => (this.reduced = r)));
  }

  /** Movement I's arrival, played once after the gate: title decode, then the movement heading rises. */
  intro(reduced: boolean): gsap.core.Timeline {
    const first = this.titles[0];
    const tl = gsap.timeline();
    const word = document.querySelector<HTMLElement>('.title__word');
    const rest = qsa(
      '.title__sub, .movement--emergence .movement__index, .movement--emergence .movement__line, .scroll-cue',
    );
    if (reduced || !first) {
      tl.fromTo(
        [word, ...rest, this.sections[0]],
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: DUR.slow, ease: EASE.enter },
      );
      return tl;
    }
    tl.set(this.sections[0]!, { autoAlpha: 1 });
    if (word) {
      tl.fromTo(
        word,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 2.2,
          scrambleText: { text: word.textContent ?? '', chars: 'upperCase', revealDelay: 0.6, speed: 0.35 },
          ease: EASE.decode,
        },
        0.8,
      );
    }
    tl.fromTo(
      first.chars,
      { yPercent: 118, '--w': 120 },
      { yPercent: 0, '--w': 620, duration: DUR.cinematic, ease: EASE.enter, stagger: 0.06 },
      1.6,
    );
    tl.fromTo(
      rest,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.enter, stagger: 0.12 },
      2.1,
    );
    return tl;
  }

  /** Returns a title that has lost focus to its resting typography. */
  private relax(index: number): void {
    const t = this.titles[index];
    if (!t) return;
    for (const c of t.chars) {
      gsap.to(c, {
        '--wp': 0,
        '--wd': 100,
        '--lift': 0,
        duration: DUR.slow,
        ease: EASE.enter,
        overwrite: 'auto',
      });
    }
  }

  private measure(): void {
    this.dirtyCenters = false;
    const t = this.titles[store.state.movement];
    if (!t) return;
    t.chars.forEach((c, k) => {
      const r = c.getBoundingClientRect();
      t.centers[k] = r.left + r.width / 2;
    });
  }

  update(f: Frame, state: WorldState, velocity: number): void {
    const idx = store.state.movement;
    const t = this.titles[idx];
    if (!t) return;
    if (this.dirtyCenters) this.measure();

    // Scroll velocity leans the type, like a slide-rule being pushed. Smoothed; zero under reduced motion.
    this.skew = damp(this.skew, this.reduced ? 0 : clamp(-velocity * 2.4, -7, 7), 8, f.dt);
    t.skew(this.skew);

    if (this.reduced) return;
    const px = this.pointer.x;
    const fine = this.pointer.type === 'mouse' || store.state.idle;
    const n = t.chars.length;
    for (let k = 0; k < n; k++) {
      const d = fine ? Math.abs(px - (t.centers[k] ?? 0)) : 9999;
      const near = Math.exp(-(d * d) / (2 * 90 * 90));
      // Weight rises under the pointer: letters "lean into" your attention.
      t.weight[k]?.(near * 260);
      if (idx === 1) {
        // Tension: the whole word widens under load; the letters nearest the pointer are crushed.
        t.stretch[k]?.(100 + state.strain * 38 - near * 55 * (0.4 + state.strain));
      } else {
        t.stretch[k]?.(100);
      }
      if (idx === 2) {
        t.lift[k]?.(Math.sin(f.time * 1.3 + k * 0.7) * 7 * state.liquid - near * 10);
      } else {
        t.lift[k]?.(0);
      }
    }

    if (idx === 3 && f.time - this.lastReadout > 0.12) {
      this.lastReadout = f.time;
      const ior = this.iorValues?.();
      if (ior) {
        this.iorEls.forEach((el) => {
          const ch = el.dataset.ior;
          el.textContent = (ch === '0' ? ior.r : ch === '1' ? ior.g : ior.b).toFixed(3);
        });
      }
    }

    if (idx === 4) {
      const h = this.instrument.hover;
      if (h !== this.hoverKey) {
        this.keys[this.hoverKey]?.classList.remove('is-hover');
        this.keys[h]?.classList.add('is-hover');
        this.hoverKey = h;
      }
    }
  }

  iorValues: (() => { r: number; g: number; b: number }) | null = null;

  dispose(): void {
    this.bin.dispose();
    for (const t of this.triggers) t.kill();
    for (const s of this.splits) s.revert();
  }
}
