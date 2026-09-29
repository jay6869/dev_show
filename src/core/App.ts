import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { detectDevice, prefersReducedMotion, type DeviceInfo } from './Device';
import { Loader } from './Loader';
import { Pointer } from './Pointer';
import { Quality } from './Quality';
import { Renderer } from './Renderer';
import { Scroll } from './Scroll';
import { store } from './Store';
import { PRIORITY, ticker } from './Ticker';
import { buildMaster, initialState } from './Timeline';
import { World } from '../gl/World';
import { Sound } from '../audio/Sound';
import { AnalyserBridge } from '../audio/AnalyserBridge';
import { Instrument } from '../audio/Instrument';
import { Preloader } from '../ui/Preloader';
import { EntryGate } from '../ui/EntryGate';
import { Nav } from '../ui/Nav';
import { Cursor } from '../ui/Cursor';
import { Sections } from '../ui/Sections';
import { Captions } from '../ui/Captions';
import { Meta } from '../ui/Meta';
import { Idle } from '../ui/Idle';
import { Secrets } from '../ui/Secrets';
import type { DirectorsCut } from '../ui/DirectorsCut';
import type { Stats } from '../ui/Stats';
import { isTypingTarget, on, qs } from '../utils/dom';
import { DUR, EASE } from '../utils/easing';
import { Bin } from '../utils/dispose';

gsap.registerPlugin(MotionPathPlugin, ScrollTrigger);

/**
 * Composition root. Creates every module once, registers each on the single ticker in a fixed order,
 * and owns the lifecycle from preload to dispose.
 */
export class App {
  private readonly bin = new Bin();
  private device!: DeviceInfo;
  private renderer: Renderer | null = null;
  private quality: Quality | null = null;
  private world: World | null = null;
  private readonly pointer = new Pointer();
  private readonly scroll = new Scroll();
  private readonly sound = new Sound();
  private readonly bridge = new AnalyserBridge(this.sound);
  private readonly instrument = new Instrument(this.pointer, this.sound);
  private readonly captions = new Captions();
  private readonly meta = new Meta();
  private readonly idle = new Idle();
  private readonly sections = new Sections(this.pointer, this.instrument);
  private cursor: Cursor | null = null;
  private nav: Nav | null = null;
  private secrets: Secrets | null = null;
  private dc: DirectorsCut | null = null;
  private stats: Stats | null = null;
  private master: { timeline: gsap.core.Timeline; trigger: ScrollTrigger } | null = null;
  private glLost = false;

  get reduced(): boolean {
    return store.state.reducedMotion;
  }

  async start(): Promise<void> {
    const html = document.documentElement;
    html.classList.add('is-booted');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    this.device = detectDevice();
    const rm = prefersReducedMotion();
    store.state.reducedMotion = rm.matches;
    const onReduced = (): void => {
      store.state.reducedMotion = rm.matches;
      store.emit('reduced-motion', { reduced: rm.matches });
      this.world?.setReduced(rm.matches);
    };
    rm.addEventListener('change', onReduced);
    this.bin.add(() => rm.removeEventListener('change', onReduced));

    ticker.start();
    const loader = new Loader();
    const preloader = new Preloader(this.reduced);
    const removePreloaderTick = ticker.add((f) => preloader.update(f), PRIORITY.ui);
    this.bin.add(preloader);

    const fontTask = loader.add('fonts', 2, 'tuning');
    const glTask = loader.add('gl', 6, 'compiling light');
    const fonts = Promise.all([
      document.fonts.load('800 100px Anybody'),
      document.fonts.load('400 12px "JetBrains Mono"'),
    ])
      .catch(() => undefined)
      .then(() => fontTask(1));

    this.cursor = new Cursor(this.pointer);
    this.nav = new Nav({
      goTo: (i) => this.scroll.goTo(i, this.reduced),
      toggleSound: () => this.toggleSound(),
      toggleDirectors: () => void this.toggleDirectors(),
      hover: () => this.sound.engine?.uiTick('hover'),
    });

    // Fonts first: the particle title is sampled from the real glyphs.
    await fonts;
    if (this.device.webgl2 && this.device.floatRT) {
      try {
        this.renderer = new Renderer(qs<HTMLCanvasElement>('#gl'));
        this.quality = new Quality(this.device.initialTier);
        this.world = new World(this.renderer, this.pointer, this.scroll, this.quality, this.device.floatRT);
        this.world.setReduced(this.reduced);
        glTask(0.2);
        await this.world.init((p) => glTask(0.2 + p * 0.8));
      } catch (err) {
        console.warn('[hexachord] WebGL unavailable, showing the quiet version.', err);
        this.world?.dispose();
        this.renderer?.dispose();
        this.world = null;
        this.renderer = null;
      }
    }
    if (!this.world) {
      html.classList.add('no-webgl');
      glTask(1);
    }

    this.sections.setup(this.reduced);
    this.master = buildMaster(this.world?.state ?? initialState());
    this.sections.iorValues = () => this.world?.crystal?.ior ?? { r: 1.512, g: 1.528, b: 1.549 };
    this.wire();

    await preloader.complete(this.reduced);
    removePreloaderTick();
    if (this.world) gsap.to(this.world.fade, { value: 1, duration: DUR.slow, ease: EASE.enter });

    const gate = new EntryGate();
    this.bin.add(gate);
    const choice = await gate.open(this.reduced, (c) => {
      if (c === 'sound') void this.sound.enableFromGesture();
      else this.sound.chooseSilent();
    });
    this.enter(choice === 'sound');
  }

  private enter(withSound: boolean): void {
    store.state.entered = true;
    store.emit('entered', { sound: withSound });
    this.world?.playIntro(this.reduced);
    this.sections.intro(this.reduced);
    this.nav?.reveal(this.reduced);
    // Hand focus from the closed dialog to the first movement's heading, so keyboard users start in the piece.
    const first = document.querySelector<HTMLElement>('#m1-title');
    if (first) {
      first.tabIndex = -1;
      first.focus({ preventScroll: true });
    }
    this.idle.enabled = true;
    void this.world?.stream();
    ScrollTrigger.refresh();
    const hash = /^#m([1-6])$/.exec(location.hash);
    if (hash) this.scroll.goTo(Number(hash[1]) - 1, true);
  }

  private wire(): void {
    const w = this.world;
    this.sound.onCaption = (t) => this.captions.sound(t);
    this.instrument.onPluck = (s, v) => {
      if (!w) return;
      w.fx.pluck[s] = Math.max(w.fx.pluck[s] ?? 0, v);
    };
    this.instrument.onBurst = (x, y, strength) => w?.burst(x, y, strength);
    if (w) {
      this.secrets = new Secrets(w, this.pointer, {
        rewind: () => this.rewind(),
        sound: (kind) =>
          kind === 'rewind' ? this.sound.engine?.rewind() : this.sound.engine?.uiTick('click'),
      });
    }

    this.bin.add(
      store.on('sound', ({ enabled }) => {
        w?.wake(enabled);
        store.emit('wake', { enabled });
      }),
    );
    this.bin.add(
      store.on('context', ({ lost }) => {
        this.glLost = lost;
        if (lost) this.captions.show('Graphics paused. Restoring…', 4);
        else void w?.restoreContext();
      }),
    );
    this.bin.add(
      on(document, 'visibilitychange', () => {
        ticker.setPaused(document.hidden);
      }),
    );
    this.bin.add(on(window, 'keydown', (e) => this.onKey(e)));

    // One loop, fixed order: input -> state -> audio -> render -> UI -> monitoring.
    this.bin.add(
      ticker.add((f) => {
        this.pointer.update(f);
        this.scroll.update(f);
      }, PRIORITY.input),
    );
    this.bin.add(
      ticker.add((f) => {
        this.idle.update(f);
        const playing = store.state.entered && store.state.movement === 4 && !store.state.directors;
        this.instrument.active = playing;
        if (this.cursor) this.cursor.instrumentActive = playing;
        this.instrument.update(f);
        this.secrets?.update(f);
      }, PRIORITY.state),
    );
    this.bin.add(
      ticker.add((f) => {
        this.sound.engine?.update(this.scroll.position, this.scroll.velocity, f.dt, f.time);
      }, PRIORITY.audio),
    );
    this.bin.add(
      ticker.add((f) => {
        if (!w || this.glLost) return;
        this.renderer!.gl.info.reset();
        w.update(f, this.bridge.levels(f.dt));
      }, PRIORITY.render),
    );
    this.bin.add(
      ticker.add((f) => {
        this.cursor?.update(f);
        this.nav?.update(f);
        this.sections.update(f, w?.activeState ?? initialState(), this.scroll.velocity);
        this.meta.update(f, w?.levels ?? { bass: 0, mid: 0, high: 0, rms: 0 });
        this.dc?.update(f);
      }, PRIORITY.ui),
    );
    this.bin.add(
      ticker.add((f) => {
        this.quality?.update(f);
        this.stats?.update(f);
      }, PRIORITY.stats),
    );

    if (import.meta.env.DEV) Object.assign(window, { __hx: { world: w, quality: this.quality } });
    if (import.meta.env.DEV && this.renderer) {
      const gl = this.renderer.gl;
      void import('../ui/Stats').then(({ Stats }) => {
        this.stats = new Stats(gl);
      });
    }
    if (!w) qs('#btn-dc').hidden = true;
  }

  private onKey(e: KeyboardEvent): void {
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!store.state.entered) return;
    const m = store.state.movement;
    const playing = this.instrument.active;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        this.scroll.goTo(m + 1, this.reduced);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.scroll.goTo(m - 1, this.reduced);
        break;
      case 'd':
      case 'D':
        // In V the D key is a string; Shift+D still opens the Director's Cut there.
        if (playing && !e.shiftKey) return;
        void this.toggleDirectors();
        break;
      case 'm':
      case 'M':
        this.toggleSound();
        break;
      case 'Escape':
        if (this.dc?.open) this.dc.toggle(false);
        break;
      default:
    }
  }

  private toggleSound(): void {
    this.sound.toggleFromGesture();
  }

  private async toggleDirectors(): Promise<void> {
    const w = this.world;
    const q = this.quality;
    const r = this.renderer;
    if (!w || !q || !r) return;
    if (!this.dc) {
      const { DirectorsCut } = await import('../ui/DirectorsCut');
      this.dc = new DirectorsCut({
        world: w,
        quality: q,
        device: this.device,
        bridge: this.bridge,
        found: () => this.secrets?.found ?? new Set<string>(),
        drawInfo: () => ({
          calls: r.gl.info.render.calls,
          triangles: r.gl.info.render.triangles,
          points: r.gl.info.render.points,
          programs: r.gl.info.programs?.length ?? 0,
          textures: r.gl.info.memory.textures,
        }),
      });
    }
    this.dc.toggle();
  }

  /** Da capo: the last light flies back along a path to the first movement, and the piece rewinds. */
  private rewind(): void {
    const from = document.querySelector<HTMLElement>('.last-light');
    const to = document.querySelector<HTMLElement>('.nav__item[data-index="0"]');
    if (from && to && !this.reduced) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'flight';
      dot.setAttribute('aria-hidden', 'true');
      document.body.append(dot);
      const x0 = a.left + a.width / 2;
      const y0 = a.top + a.height / 2;
      const x1 = b.left + b.width / 2;
      const y1 = b.top + b.height / 2;
      gsap.to(dot, {
        duration: 1.6,
        ease: EASE.mutate,
        motionPath: {
          path: [
            { x: x0, y: y0 },
            { x: x0 + (x1 - x0) * 0.2 + 120, y: y0 - (y0 - y1) * 0.45 },
            { x: x1 - 60, y: y1 + 80 },
            { x: x1, y: y1 },
          ],
          curviness: 1.4,
        },
        onComplete: () => {
          gsap.to(dot, {
            scale: 3,
            autoAlpha: 0,
            duration: DUR.slow,
            ease: EASE.exit,
            onComplete: () => dot.remove(),
          });
        },
      });
    }
    window.scrollTo({ top: 0, behavior: this.reduced ? 'auto' : 'smooth' });
  }

  dispose(): void {
    this.bin.dispose();
    this.master?.trigger.kill();
    this.master?.timeline.kill();
    this.dc?.dispose();
    this.stats?.dispose();
    this.secrets?.dispose();
    this.cursor?.dispose();
    this.nav?.dispose();
    this.sections.dispose();
    this.captions.dispose();
    this.meta.dispose();
    this.idle.dispose();
    this.instrument.dispose();
    this.sound.dispose();
    this.scroll.dispose();
    this.pointer.dispose();
    this.world?.dispose();
    this.renderer?.dispose();
    ticker.dispose();
    store.clear();
  }
}
