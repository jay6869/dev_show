import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { DIRECTORS_CUT_NOTES, MOVEMENTS } from '../content/copy';
import { store } from '../core/Store';
import type { Frame } from '../core/Ticker';
import type { Quality } from '../core/Quality';
import type { DeviceInfo } from '../core/Device';
import type { World } from '../gl/World';
import type { PostToggles } from '../gl/postfx/PostFX';
import type { AnalyserBridge } from '../audio/AnalyserBridge';
import { PALETTE } from '../gl/palette';
import { EASE_PATHS, EASE_PURPOSE, easeFn, DUR, EASE, type EaseName } from '../utils/easing';
import { contrastRatio } from '../utils/math';
import { el, on, qs } from '../utils/dom';
import { Bin } from '../utils/dispose';

gsap.registerPlugin(CustomEase);

export interface DirectorsDeps {
  world: World;
  quality: Quality;
  device: DeviceInfo;
  bridge: AnalyserBridge;
  found: () => ReadonlySet<string>;
  drawInfo: () => { calls: number; triangles: number; points: number; programs: number; textures: number };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Director's Cut: the piece annotated by its author, over the live piece. It reads the same state the
 * renderer reads, at 10 Hz for text and at frame rate for graphs, so nothing shown here is staged.
 */
export class DirectorsCut {
  private readonly root = qs('#dc-root');
  private readonly panel: HTMLElement;
  private readonly bin = new Bin();
  private readonly frameCanvas: HTMLCanvasElement;
  private readonly fftCanvas: HTMLCanvasElement;
  private readonly readouts = new Map<string, HTMLElement>();
  private readonly playheads: {
    name: EaseName;
    dot: SVGCircleElement;
    line: SVGLineElement;
    fn: (t: number) => void;
  }[] = [];
  private readonly gridOverlay: HTMLElement;
  private readonly baseline: HTMLElement;
  private readonly callout: HTMLElement;
  private readonly rationale: HTMLElement;
  private readonly secretsList: HTMLElement;
  private readonly tierButtons = new Map<string, HTMLButtonElement>();
  private lastText = 0;
  private opener: HTMLElement | null = null;
  open = false;

  constructor(private readonly d: DirectorsDeps) {
    this.panel = el('aside', { class: 'dc', 'aria-labelledby': 'dc-title', hidden: '' });
    const head = el('header', { class: 'dc__head' }, [
      el('h2', { class: 'dc__title u-mono', id: 'dc-title', tabindex: '-1' }, ["Director's cut"]),
      el('span', { class: 'dc__hint u-mono u-dim' }, ['Esc']),
    ]);
    const close = el(
      'button',
      { class: 'dc__close', type: 'button', 'aria-label': "Close director's cut", 'data-magnetic': '' },
      ['×'],
    );
    head.append(close);
    this.bin.add(on(close, 'click', () => this.toggle(false)));

    this.rationale = el('p', { class: 'dc__rationale' });
    this.frameCanvas = el('canvas', {
      class: 'dc__graph',
      width: '360',
      height: '72',
      'aria-hidden': 'true',
    });
    this.fftCanvas = el('canvas', { class: 'dc__graph', width: '360', height: '72', 'aria-hidden': 'true' });
    this.secretsList = el('ul', { class: 'dc__secrets' });

    const body = el('div', { class: 'dc__body' }, [
      this.section('Now playing', [this.rationale]),
      this.section('Frame', [
        this.frameCanvas,
        this.tierControls(),
        this.readoutList(['gpu', 'frame', 'calls'], true),
        this.readoutList(['tier', 'dpr', 'particles']),
      ]),
      this.section('Signal', [this.fftCanvas, this.readoutList(['bass', 'mid', 'high'])]),
      this.section('Uniforms', [
        this.readoutList([
          'cam',
          'morph',
          'strain',
          'liquid',
          'crystal',
          'strings',
          'decay',
          'curl',
          'spring',
          'bloom',
          'exposure',
          'focus',
          'emerge',
          'wake',
        ]),
      ]),
      this.section('Easing', [this.easingPlots()]),
      this.section('Passes', [this.toggles()]),
      this.section('Palette', [this.palette()]),
      this.section('Notes', [this.notes()]),
      this.section('Six secrets', [this.secretsList]),
    ]);
    this.panel.append(head, body);

    this.gridOverlay = el('div', { class: 'dc-grid', 'aria-hidden': 'true', hidden: '' });
    for (let i = 0; i < 12; i++) this.gridOverlay.append(el('span'));
    this.baseline = el('div', { class: 'dc-baseline', 'aria-hidden': 'true', hidden: '' });
    this.callout = el('p', { class: 'dc-callout u-mono', 'aria-hidden': 'true', hidden: '' });
    this.root.append(this.gridOverlay, this.baseline, this.callout, this.panel);

    this.bin.add(
      on(this.panel, 'keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.toggle(false);
        }
      }),
    );
    this.bin.add(store.on('movement', () => this.refreshMovement()));
    this.bin.add(store.on('secret', () => this.renderSecrets()));
    this.bin.add(store.on('quality', () => this.refreshTier()));
    this.refreshMovement();
    this.renderSecrets();
    this.refreshTier();
  }

  private section(title: string, children: Node[]): HTMLElement {
    return el('section', { class: 'dc__sec' }, [
      el('h3', { class: 'dc__h u-mono u-dim' }, [title]),
      ...children,
    ]);
  }

  private readoutList(keys: string[], wide = false): HTMLElement {
    const dl = el('dl', { class: `dc__readouts u-mono${wide ? ' dc__readouts--wide' : ''}` });
    for (const k of keys) {
      const dd = el('dd', {}, ['—']);
      dl.append(el('div', {}, [el('dt', { class: 'u-dim' }, [k]), dd]));
      this.readouts.set(k, dd);
    }
    return dl;
  }

  private tierControls(): HTMLElement {
    const wrap = el('div', { class: 'dc__tiers', role: 'group', 'aria-label': 'Quality tier' });
    for (const t of ['auto', 'high', 'medium', 'low'] as const) {
      const b = el('button', { class: 'dc__chip u-mono', type: 'button', 'aria-pressed': 'false' }, [t]);
      this.bin.add(
        on(b, 'click', () => {
          if (t === 'auto') this.d.quality.set(this.d.quality.tier, 'manual: auto', false);
          else this.d.quality.set(t, 'manual override', true);
          this.refreshTier(t);
        }),
      );
      this.tierButtons.set(t, b);
      wrap.append(b);
    }
    return wrap;
  }

  private refreshTier(manual?: string): void {
    const current = manual ?? this.d.quality.tier;
    for (const [k, b] of this.tierButtons) b.setAttribute('aria-pressed', String(k === current));
  }

  private easingPlots(): HTMLElement {
    const grid = el('div', { class: 'dc__eases' });
    (Object.keys(EASE_PATHS) as EaseName[]).forEach((name) => {
      const s = svg('svg', { viewBox: '-8 -28 116 156', class: 'dc__ease', 'aria-hidden': 'true' });
      s.append(svg('rect', { x: '0', y: '0', width: '100', height: '100', class: 'dc__ease-frame' }));
      const data = CustomEase.getSVGData(EASE[name], { width: 100, height: 100 });
      s.append(svg('path', { d: data, class: 'dc__ease-path' }));
      const line = svg('line', { x1: '0', x2: '0', y1: '-20', y2: '120', class: 'dc__ease-time' });
      const dot = svg('circle', { r: '3.2', class: 'dc__ease-dot' });
      s.append(line, dot);
      const fn = easeFn(name);
      const setDot = (t: number): void => {
        const x = t * 100;
        const y = 100 - fn(t) * 100;
        dot.setAttribute('cx', x.toFixed(2));
        dot.setAttribute('cy', y.toFixed(2));
        line.setAttribute('x1', x.toFixed(2));
        line.setAttribute('x2', x.toFixed(2));
      };
      this.playheads.push({ name, dot, line, fn: setDot });
      grid.append(
        el('figure', { class: 'dc__ease-fig' }, [
          s,
          el('figcaption', { class: 'u-mono' }, [el('b', {}, [name]), ` ${EASE_PURPOSE[name]}`]),
        ]),
      );
    });
    return grid;
  }

  private toggles(): HTMLElement {
    const list = el('div', { class: 'dc__toggles' });
    const add = (label: string, initial: boolean, fn: (v: boolean) => void): void => {
      const input = el('input', { type: 'checkbox' });
      input.checked = initial;
      this.bin.add(on(input, 'change', () => fn(input.checked)));
      list.append(el('label', { class: 'dc__toggle u-mono' }, [input, el('span', {}, [label])]));
    };
    const t = this.d.world.post.toggles;
    for (const k of Object.keys(t) as (keyof PostToggles)[])
      add(k, t[k], (v) => (this.d.world.post.toggles[k] = v));
    add('wireframe', false, (v) => {
      this.d.world.crystal?.setWireframe(v);
      const grid = this.d.world.tension?.material;
      if (grid) grid.wireframe = v;
    });
    add('12-col grid', false, (v) => (this.gridOverlay.hidden = !v));
    add('8pt baseline', false, (v) => (this.baseline.hidden = !v));
    return list;
  }

  private palette(): HTMLElement {
    const ul = el('ul', { class: 'dc__palette u-mono' });
    for (const [name, hex] of Object.entries(PALETTE)) {
      const ratio = contrastRatio(hex, PALETTE.void);
      const grade =
        name === 'void' ? 'base' : ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'UI only' : '—';
      const sw = el('span', { class: 'dc__swatch' });
      sw.style.background = hex;
      ul.append(
        el('li', {}, [
          sw,
          el('span', {}, [name]),
          el('span', { class: 'u-dim' }, [hex]),
          el('span', {}, [name === 'void' ? '' : `${ratio.toFixed(2)}:1 ${grade}`]),
        ]),
      );
    }
    return ul;
  }

  private notes(): HTMLElement {
    const wrap = el('div', { class: 'dc__notes' });
    for (const n of DIRECTORS_CUT_NOTES)
      wrap.append(el('p', {}, [el('b', { class: 'u-mono' }, [n.title]), ` ${n.body}`]));
    return wrap;
  }

  private renderSecrets(): void {
    const found = this.d.found();
    this.secretsList.replaceChildren(
      ...MOVEMENTS.map((m) => {
        const got = found.has(m.secret.name);
        return el('li', { class: got ? 'is-found' : '', tabindex: '0' }, [
          el('span', { class: 'u-mono u-dim' }, [m.numeral]),
          el('span', { class: 'dc__secret-name' }, [got ? m.secret.name : '· · ·']),
          el('span', { class: 'dc__secret-hint u-dim' }, [m.secret.hint]),
        ]);
      }),
    );
  }

  private refreshMovement(): void {
    const m = MOVEMENTS[store.state.movement];
    if (!m) return;
    this.rationale.textContent = `${m.numeral}. ${m.title} — ${m.rationale}`;
    this.callout.textContent = `↳ ${m.rationale}`;
  }

  toggle(open = !this.open): void {
    if (open === this.open) return;
    this.open = open;
    store.state.directors = open;
    store.emit('directors', { open });
    document.documentElement.classList.toggle('is-directors', open);
    if (open) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.panel.hidden = false;
      this.callout.hidden = false;
      const reduced = store.state.reducedMotion;
      gsap.fromTo(
        this.panel,
        // opacity, not autoAlpha: a visibility:hidden panel cannot receive the focus we move into it.
        { xPercent: reduced ? 0 : 8, opacity: 0, visibility: 'visible' },
        { xPercent: 0, opacity: 1, duration: DUR.slow, ease: EASE.enter },
      );
      gsap.fromTo(
        this.panel.querySelectorAll('.dc__sec'),
        { autoAlpha: 0, y: reduced ? 0 : 10 },
        { autoAlpha: 1, y: 0, duration: DUR.slow, ease: EASE.enter, stagger: 0.035 },
      );
      qs('#dc-title', this.panel).focus({ preventScroll: true });
    } else {
      gsap.to(this.panel, {
        autoAlpha: 0,
        xPercent: store.state.reducedMotion ? 0 : 6,
        duration: DUR.base,
        ease: EASE.exit,
        onComplete: () => {
          this.panel.hidden = true;
        },
      });
      this.callout.hidden = true;
      this.opener?.focus({ preventScroll: true });
    }
  }

  private drawFrameGraph(): void {
    const c = this.frameCanvas.getContext('2d');
    if (!c) return;
    const { width: w, height: h } = this.frameCanvas;
    const hist = this.d.quality.history;
    const n = hist.length;
    c.clearRect(0, 0, w, h);
    c.fillStyle = PALETTE.rule;
    const y16 = h - (16.7 / 50) * h;
    const y33 = h - (33.3 / 50) * h;
    c.fillRect(0, Math.round(y16), w, 1);
    c.fillRect(0, Math.round(y33), w, 1);
    const start = this.d.quality.historyIndex;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = hist[(start + i) % n] ?? 0;
      const bh = Math.min(h, (v / 50) * h);
      c.fillStyle = v > 21 ? PALETTE.accent : PALETTE.ink;
      c.globalAlpha = v > 21 ? 1 : 0.55;
      c.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh);
    }
    c.globalAlpha = 1;
  }

  private drawSpectrum(): void {
    const c = this.fftCanvas.getContext('2d');
    if (!c) return;
    const { width: w, height: h } = this.fftCanvas;
    c.clearRect(0, 0, w, h);
    const spec = this.d.bridge.spectrum;
    const wave = this.d.bridge.waveform;
    if (!spec) {
      c.fillStyle = PALETTE.dim;
      c.font = '11px "JetBrains Mono", monospace';
      c.fillText('sound off: synthetic envelope driving uniforms', 8, h / 2 + 4);
      return;
    }
    const bars = 64;
    const bw = w / bars;
    c.fillStyle = PALETTE.ink;
    for (let i = 0; i < bars; i++) {
      // Log-spaced bins: equal width per octave, as the ear hears it.
      const bin = Math.min(spec.length - 1, Math.floor(Math.pow(spec.length, i / bars)));
      const v = Math.max(0, ((spec[bin] ?? -140) + 100) / 70);
      const bh = Math.min(h, v * h);
      c.globalAlpha = i < 6 ? 1 : 0.6;
      c.fillStyle = i < 6 ? PALETTE.accent : PALETTE.ink;
      c.fillRect(i * bw, h - bh, bw - 1, bh);
    }
    c.globalAlpha = 1;
    if (wave) {
      c.strokeStyle = PALETTE.accent;
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = h / 2 - (wave[i] ?? 0) * h * 0.45;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
  }

  private placeCallout(): void {
    const title = document.querySelector<HTMLElement>(`#m${store.state.movement + 1}-title`);
    if (!title) return;
    const r = title.getBoundingClientRect();
    // Never under the panel: the callout lives in the part of the frame the panel leaves visible.
    const free = window.innerWidth - this.panel.offsetWidth;
    const x = Math.min(free - 316, Math.max(16, r.left));
    const y = Math.min(window.innerHeight - 60, Math.max(64, r.bottom + 12));
    this.callout.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  update(f: Frame): void {
    if (!this.open) return;
    this.drawFrameGraph();
    this.drawSpectrum();
    // Playheads loop over each ease's own duration token scale, so you can feel them side by side.
    for (const p of this.playheads) {
      const period = p.name === 'mutate' ? 2.6 : p.name === 'breath' ? 3.2 : 1.6;
      p.fn((f.time % (period + 0.6)) / period > 1 ? 1 : (f.time % (period + 0.6)) / period);
    }
    this.placeCallout();
    if (f.time - this.lastText < 0.1) return;
    this.lastText = f.time;
    const w = this.d.world;
    const s = w.activeState;
    const lv = this.d.bridge.raw ?? w.levels;
    const info = this.d.drawInfo();
    const set = (k: string, v: string): void => {
      const n = this.readouts.get(k);
      if (n && n.textContent !== v) n.textContent = v;
    };
    set('gpu', this.d.device.gpu.replace(/ANGLE \(|\)$/g, '').slice(0, 42));
    set('tier', this.d.quality.tier);
    set(
      'frame',
      `${this.d.quality.average.toFixed(1)} ms · ${(1000 / this.d.quality.average).toFixed(0)} fps`,
    );
    set('particles', w.particleCount.toLocaleString('en-US'));
    set('calls', `${info.calls} calls · ${info.programs} programs`);
    set('dpr', Math.min(window.devicePixelRatio, this.d.quality.settings.dpr).toFixed(2));
    set('bass', lv.bass.toFixed(3));
    set('mid', lv.mid.toFixed(3));
    set('high', lv.high.toFixed(3));
    for (const k of [
      'cam',
      'morph',
      'strain',
      'liquid',
      'crystal',
      'strings',
      'decay',
      'curl',
      'spring',
      'bloom',
      'exposure',
      'focus',
    ] as const) {
      set(k, s[k].toFixed(3));
    }
    set('emerge', w.emerge.value.toFixed(3));
    set('wake', w.fx.wake.toFixed(3));
  }

  dispose(): void {
    this.bin.dispose();
    this.root.replaceChildren();
  }
}
