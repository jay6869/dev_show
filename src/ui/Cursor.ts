import { gsap } from 'gsap';
import { store } from '../core/Store';
import type { Pointer } from '../core/Pointer';
import type { Frame } from '../core/Ticker';
import { on, qs } from '../utils/dom';
import { EASE } from '../utils/easing';
import { midiToName } from '../utils/math';
import { Bin } from '../utils/dispose';

export type CursorState = 'default' | 'hover' | 'press' | 'drag' | 'text' | 'play' | 'hold' | 'hidden';

interface Magnet {
  el: HTMLElement;
  x: gsap.QuickToFunc;
  y: gsap.QuickToFunc;
}

/**
 * Custom cursor. Eight states, a magnetic pull toward [data-magnetic] targets (the target also leans
 * toward the cursor), and it rides the same smoothed pointer that displaces the fluid, so the ink
 * trail and the cursor can never disagree. Fine pointers only; touch never sees it.
 */
export class Cursor {
  private readonly root = qs('#cursor');
  private readonly ring = qs('.cursor__ring', this.root);
  private readonly label = qs('.cursor__label', this.root);
  private readonly holdCircle = this.root.querySelector<SVGCircleElement>('.cursor__hold');
  private readonly bin = new Bin();
  private readonly dotX: (v: number) => void;
  private readonly dotY: (v: number) => void;
  private readonly labelX: gsap.QuickToFunc;
  private readonly labelY: gsap.QuickToFunc;
  private readonly ringX: gsap.QuickToFunc;
  private readonly ringY: gsap.QuickToFunc;
  private readonly ringW: gsap.QuickToFunc;
  private readonly ringH: gsap.QuickToFunc;
  private readonly magnets = new WeakMap<HTMLElement, Magnet>();
  private magnet: Magnet | null = null;
  private state: CursorState = 'default';
  private enabled: boolean;
  instrumentActive = false;

  constructor(private readonly pointer: Pointer) {
    this.enabled = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const dot = qs('.cursor__dot', this.root);
    gsap.set([dot, this.ring, this.label], { xPercent: -50, yPercent: -50 });
    this.dotX = gsap.quickSetter(dot, 'x', 'px') as (v: number) => void;
    this.dotY = gsap.quickSetter(dot, 'y', 'px') as (v: number) => void;
    this.labelX = gsap.quickTo(this.label, 'x', { duration: 0.5, ease: 'power3' });
    this.labelY = gsap.quickTo(this.label, 'y', { duration: 0.5, ease: 'power3' });
    this.ringX = gsap.quickTo(this.ring, 'x', { duration: 0.35, ease: 'power3' });
    this.ringY = gsap.quickTo(this.ring, 'y', { duration: 0.35, ease: 'power3' });
    this.ringW = gsap.quickTo(this.ring, 'width', { duration: 0.45, ease: EASE.magnet });
    this.ringH = gsap.quickTo(this.ring, 'height', { duration: 0.45, ease: EASE.magnet });
    if (!this.enabled) {
      this.root.hidden = true;
      return;
    }
    document.documentElement.classList.add('has-cursor');

    this.bin.add(
      on(document, 'pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const t = e.target as HTMLElement | null;
        const m = t?.closest<HTMLElement>('[data-magnetic]');
        if (m && m !== this.magnet?.el) this.attach(m);
        if (!m && t?.closest('p, h1, h2, dd, .captions')) this.setState('text');
        else if (!m && this.state === 'text') this.setState('default');
      }),
    );
    this.bin.add(
      on(document, 'pointerout', (e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (this.magnet && !(related && this.magnet.el.contains(related))) this.detach();
      }),
    );
    this.bin.add(on(window, 'pointerdown', () => this.setState(this.magnet ? 'hover' : 'press', true)));
    this.bin.add(on(window, 'pointerup', () => this.setState(this.magnet ? 'hover' : 'default')));
    this.bin.add(on(document, 'pointerleave', () => this.root.classList.add('is-out')));
    this.bin.add(on(document, 'pointerenter', () => this.root.classList.remove('is-out')));
    this.bin.add(
      on(window, 'keydown', (e) => {
        if (e.key === 'Tab') this.root.classList.add('is-keyboard');
      }),
    );
    this.bin.add(
      on(window, 'pointermove', () => this.root.classList.remove('is-keyboard'), { passive: true }),
    );
    this.bin.add(
      store.on('hold', ({ progress }) => {
        if (!this.holdCircle) return;
        const visible = progress > 0.18;
        this.root.classList.toggle('is-holding', visible);
        this.holdCircle.style.strokeDashoffset = String(1 - progress);
      }),
    );
    this.bin.add(
      store.on('note', ({ midi, ghost }) => {
        if (ghost || !this.instrumentActive) return;
        this.label.textContent = midiToName(midi);
        gsap.fromTo(
          this.ring,
          { scale: 1.6 },
          { scale: 1, duration: 0.6, ease: EASE.strike, overwrite: 'auto' },
        );
      }),
    );
  }

  private attach(el: HTMLElement): void {
    this.detach();
    let m = this.magnets.get(el);
    if (!m) {
      m = {
        el,
        x: gsap.quickTo(el, 'x', { duration: 0.5, ease: EASE.magnet }),
        y: gsap.quickTo(el, 'y', { duration: 0.5, ease: EASE.magnet }),
      };
      this.magnets.set(el, m);
    }
    this.magnet = m;
    this.setState('hover');
  }

  private detach(): void {
    if (!this.magnet) return;
    this.magnet.x(0);
    this.magnet.y(0);
    this.magnet = null;
    this.setState(this.instrumentActive ? 'play' : 'default');
  }

  setState(s: CursorState, pulse = false): void {
    if (s === this.state && !pulse) return;
    this.state = s;
    this.root.dataset.state = s;
  }

  update(_f: Frame): void {
    if (!this.enabled) return;
    const p = this.pointer;
    // The dot is the truth: raw position, no lag. The ring is the feel: smoothed, magnetic.
    this.dotX(p.rawX);
    this.dotY(p.rawY);
    this.labelX(p.rawX);
    this.labelY(p.rawY + 34);
    if (this.magnet) {
      const r = this.magnet.el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - (Number(gsap.getProperty(this.magnet.el, 'x')) || 0);
      const cy = r.top + r.height / 2 - (Number(gsap.getProperty(this.magnet.el, 'y')) || 0);
      const dx = p.rawX - cx;
      const dy = p.rawY - cy;
      this.magnet.x(dx * 0.22);
      this.magnet.y(dy * 0.3);
      this.ringX(cx + dx * 0.12);
      this.ringY(cy + dy * 0.12);
      this.ringW(Math.max(44, r.width + 18));
      this.ringH(Math.max(44, r.height + 14));
    } else {
      this.ringX(p.x);
      this.ringY(p.y);
      const drag = p.down && p.speed > 600;
      const size = this.state === 'press' ? 22 : this.state === 'play' ? 56 : this.state === 'text' ? 6 : 34;
      const stretch = drag ? Math.min(2.2, 1 + p.speed / 2400) : 1;
      this.ringW(size * stretch);
      this.ringH(size / Math.sqrt(stretch));
      if (drag && this.state !== 'drag') this.setState('drag');
      else if (!drag && this.state === 'drag') this.setState(p.down ? 'press' : 'default');
      if (this.instrumentActive && this.state === 'default') this.setState('play');
      if (!this.instrumentActive && this.state === 'play') this.setState('default');
    }
    this.root.classList.toggle('is-idle', store.state.idle);
  }

  dispose(): void {
    this.bin.dispose();
    document.documentElement.classList.remove('has-cursor');
  }
}
