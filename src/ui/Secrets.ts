import { gsap } from 'gsap';
import { MOVEMENTS } from '../content/copy';
import { store } from '../core/Store';
import type { Pointer } from '../core/Pointer';
import type { Frame } from '../core/Ticker';
import type { World } from '../gl/World';
import { isTypingTarget, on } from '../utils/dom';
import { EASE } from '../utils/easing';
import { TAU } from '../utils/math';
import { Bin } from '../utils/dispose';

const FOUND_KEY = 'hexachord:secrets';

export interface SecretHooks {
  rewind(): void;
  sound(kind: 'hit' | 'rewind'): void;
}

/**
 * One hidden interaction per movement. Detection is gesture maths on the shared Pointer; the effects
 * are envelopes on World.fx, so every secret composes with everything else rather than interrupting it.
 *   I   Singularity  long-press (1.2 s)            -> the field implodes into your finger, then re-emerges
 *   II  Snap         type "snap"                   -> the lattice releases like a cut cable
 *   III Whirlpool    drag a full circle            -> vortex in the ink, the six blobs merge into one
 *   IV  Shatter      shake the pointer             -> the crystal's facets separate, spectrum spills
 *   V   Canon        pluck six ascending strings   -> the piece answers your phrase (see Instrument)
 *   VI  Da capo      hold the last light (2 s)     -> the whole piece rewinds to the first movement
 */
export class Secrets {
  private readonly bin = new Bin();
  private typed = '';
  private angle = 0;
  private lastAngle: number | null = null;
  private dragStart = 0;
  private cx = 0;
  private cy = 0;
  private reversals: number[] = [];
  private lastDir = 0;
  private time = 0;
  private cooldown = 0;
  private holdStart = -1;
  readonly found = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly pointer: Pointer,
    private readonly hooks: SecretHooks,
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(FOUND_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) for (const s of saved) if (typeof s === 'string') this.found.add(s);
    } catch {
      /* ignore */
    }
    this.bin.add(
      on(window, 'keydown', (e) => {
        if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
        this.typed = (this.typed + e.key.toLowerCase()).slice(-4);
        if (this.typed === 'snap' && store.state.movement === 1) this.snap();
      }),
    );
    this.bin.add(
      on(window, 'pointerdown', (e) => {
        this.cx = e.clientX;
        this.cy = e.clientY;
        this.angle = 0;
        this.lastAngle = null;
        this.dragStart = this.time;
      }),
    );
    this.bin.add(store.on('secret', ({ name }) => this.remember(name)));

    const light = document.querySelector<HTMLElement>('.last-light');
    if (light) {
      this.bin.add(on(light, 'pointerdown', () => (this.holdStart = this.time)));
      const cancel = (): void => {
        this.holdStart = -1;
        light.style.setProperty('--hold', '0');
      };
      this.bin.add(on(light, 'pointerup', cancel));
      this.bin.add(on(light, 'pointerleave', cancel));
      // Keyboard: holding Enter/Space on the focused light works too (keydown repeats while held).
      this.bin.add(
        on(light, 'keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          if (this.holdStart < 0) this.holdStart = this.time;
        }),
      );
      this.bin.add(on(light, 'keyup', cancel));
      this.lightEl = light;
    }
  }

  private lightEl: HTMLElement | null = null;

  private remember(name: string): void {
    this.found.add(name);
    try {
      localStorage.setItem(FOUND_KEY, JSON.stringify([...this.found]));
    } catch {
      /* ignore */
    }
  }

  private emit(movement: number): void {
    const name = MOVEMENTS[movement]?.secret.name ?? '';
    this.cooldown = 2.5;
    store.emit('secret', { movement, name });
    this.hooks.sound('hit');
  }

  private implode(): void {
    const fx = this.world.fx;
    gsap.killTweensOf(fx, 'implode');
    gsap
      .timeline()
      .to(fx, { implode: 2.2, duration: 0.9, ease: EASE.exit })
      .to(fx, { implode: -1.4, duration: 0.18, ease: 'none' })
      .to(fx, { implode: 0, duration: 1.6, ease: EASE.enter });
    this.emit(0);
  }

  private snap(): void {
    const fx = this.world.fx;
    gsap.killTweensOf(fx, 'recoil');
    gsap.fromTo(fx, { recoil: 1 }, { recoil: 0, duration: 2.6, ease: 'elastic.out(1, 0.25)' });
    this.emit(1);
  }

  private whirlpool(): void {
    const fx = this.world.fx;
    gsap.killTweensOf(fx, 'vortex,merge');
    gsap
      .timeline()
      .to(fx, { vortex: 1, merge: 1, duration: 0.8, ease: EASE.enter })
      .to(fx, { vortex: 0, merge: 0, duration: 2.6, ease: EASE.breath }, '+=0.9');
    this.world.fluid.vortex(this.cx / window.innerWidth, 1 - this.cy / window.innerHeight, 900);
    this.emit(2);
  }

  private shatter(): void {
    const fx = this.world.fx;
    gsap.killTweensOf(fx, 'shatter');
    gsap
      .timeline()
      .to(fx, { shatter: 1, duration: 0.45, ease: EASE.enter })
      .to(fx, { shatter: 0, duration: 1.6, ease: EASE.magnet }, '+=1.1');
    this.emit(3);
  }

  private daCapo(): void {
    this.holdStart = -1;
    this.lightEl?.style.setProperty('--hold', '0');
    this.emit(5);
    this.hooks.sound('rewind');
    this.hooks.rewind();
  }

  update(f: Frame): void {
    this.time = f.time;
    if (this.cooldown > 0) {
      this.cooldown -= f.dt;
      return;
    }
    const m = store.state.movement;
    const p = this.pointer;

    if (m === 0 && p.holdProgress(1.2) >= 1) this.implode();

    if (m === 2 && p.down && this.time - this.dragStart < 3) {
      const a = Math.atan2(p.rawY - this.cy, p.rawX - this.cx);
      const r = Math.hypot(p.rawY - this.cy, p.rawX - this.cx);
      if (r > 40) {
        if (this.lastAngle !== null) {
          let d = a - this.lastAngle;
          if (d > Math.PI) d -= TAU;
          if (d < -Math.PI) d += TAU;
          this.angle += d;
        }
        this.lastAngle = a;
        // Re-centre slowly on the drag so a loose, hand-drawn circle still counts.
        this.cx += (p.rawX - this.cx) * 0.02;
        this.cy += (p.rawY - this.cy) * 0.02;
        if (Math.abs(this.angle) > TAU * 0.92) {
          this.angle = 0;
          this.whirlpool();
        }
      }
    }

    if (m === 3 && p.type === 'mouse') {
      const dir = Math.sign(p.vx);
      if (Math.abs(p.vx) > 700 && dir !== 0 && dir !== this.lastDir) {
        this.lastDir = dir;
        this.reversals.push(this.time);
      }
      this.reversals = this.reversals.filter((t) => this.time - t < 0.9);
      if (this.reversals.length >= 5) {
        this.reversals = [];
        this.shatter();
      }
    }
    if (m === 3 && p.type === 'touch') {
      // Touch: a fast two-way swipe counts as a shake.
      const dir = Math.sign(p.vx);
      if (Math.abs(p.vx) > 1100 && dir !== 0 && dir !== this.lastDir) {
        this.lastDir = dir;
        this.reversals.push(this.time);
      }
      this.reversals = this.reversals.filter((t) => this.time - t < 0.9);
      if (this.reversals.length >= 3) {
        this.reversals = [];
        this.shatter();
      }
    }

    if (this.holdStart >= 0 && this.lightEl) {
      const h = Math.min(1, (this.time - this.holdStart) / 2);
      this.lightEl.style.setProperty('--hold', h.toFixed(3));
      if (h >= 1) this.daCapo();
    }
  }

  dispose(): void {
    this.bin.dispose();
    gsap.killTweensOf(this.world.fx);
  }
}
