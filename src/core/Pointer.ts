import { gsap } from 'gsap';
import { on } from '../utils/dom';
import { clamp, damp, TAU } from '../utils/math';
import { EASE } from '../utils/easing';
import { Bin } from '../utils/dispose';
import { store } from './Store';
import type { Frame } from './Ticker';

/**
 * Unified pointer. Raw input is written to targets; everything visible reads the smoothed, possibly
 * "ghosted" (idle-mode) output. quickTo instances are created once, never per event.
 */
export class Pointer {
  /** Raw client pixels. */
  rawX = window.innerWidth / 2;
  rawY = window.innerHeight / 2;
  /** Smoothed client pixels (quickTo). */
  readonly smooth = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  /** Output: what the world uses. Blend of smooth and ghost. Pixels. */
  x = window.innerWidth / 2;
  y = window.innerHeight / 2;
  /** Output in NDC (-1..1, y up). */
  nx = 0;
  ny = 0;
  /** Output velocity in px/s, and its frame delta in px. */
  vx = 0;
  vy = 0;
  dx = 0;
  dy = 0;
  speed = 0;
  down = false;
  type: 'mouse' | 'touch' | 'pen' = 'mouse';
  /** True once any real pointer input has occurred. */
  active = false;
  /** 0 = real, 1 = generative idle gesture. */
  readonly ghost = { weight: 0 };
  private ghostX = 0;
  private ghostY = 0;
  private prevX = this.x;
  private prevY = this.y;
  private readonly bin = new Bin();
  private readonly toX: gsap.QuickToFunc;
  private readonly toY: gsap.QuickToFunc;
  private ghostTween: gsap.core.Tween | null = null;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private holdEmitted = false;

  constructor() {
    this.toX = gsap.quickTo(this.smooth, 'x', { duration: 0.45, ease: 'power3' });
    this.toY = gsap.quickTo(this.smooth, 'y', { duration: 0.45, ease: 'power3' });

    const move = (e: PointerEvent): void => {
      this.type = e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
      this.rawX = e.clientX;
      this.rawY = e.clientY;
      this.active = true;
      this.toX(e.clientX);
      this.toY(e.clientY);
    };
    this.bin.add(on(window, 'pointermove', move, { passive: true }));
    this.bin.add(
      on(
        window,
        'pointerdown',
        (e) => {
          move(e);
          // Touch: snap immediately, there is no hover to smooth from.
          if (this.type === 'touch') {
            this.toX(e.clientX, e.clientX);
            this.toY(e.clientY, e.clientY);
          }
          this.down = true;
          this.downAt = performance.now();
          this.downX = e.clientX;
          this.downY = e.clientY;
          this.holdEmitted = false;
        },
        { passive: true },
      ),
    );
    const up = (): void => {
      this.down = false;
      if (this.holdEmitted) store.emit('hold', { progress: 0, x: this.rawX, y: this.rawY });
      this.holdEmitted = false;
    };
    this.bin.add(on(window, 'pointerup', up, { passive: true }));
    this.bin.add(on(window, 'pointercancel', up, { passive: true }));
    this.bin.add(on(window, 'blur', up));

    this.bin.add(
      store.on('idle', ({ idle }) => {
        this.ghostTween?.kill();
        // Into idle: a slow, breathing hand-off. Out of idle: snap back quickly but not instantly.
        this.ghostTween = gsap.to(this.ghost, {
          weight: idle ? 1 : 0,
          duration: idle ? 3.2 : 0.6,
          ease: idle ? EASE.breath : EASE.enter,
        });
      }),
    );
  }

  /** Long-press progress, 0..1, for the current press (if the pointer stayed put). */
  holdProgress(duration: number): number {
    if (!this.down) return 0;
    if (Math.hypot(this.rawX - this.downX, this.rawY - this.downY) > 14) return 0;
    return clamp((performance.now() - this.downAt) / (duration * 1000));
  }

  update(f: Frame): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Generative idle gesture: a slow Lissajous with a drifting phase, like a hand thinking.
    const t = f.time * 0.23;
    this.ghostX = w * (0.5 + 0.32 * Math.sin(t * 1.0 + Math.sin(t * 0.37) * 1.3));
    this.ghostY = h * (0.5 + 0.24 * Math.sin(t * 1.618 + 0.7) * Math.cos(t * 0.21 * TAU * 0.1));

    const g = this.ghost.weight;
    this.x = this.smooth.x + (this.ghostX - this.smooth.x) * g;
    this.y = this.smooth.y + (this.ghostY - this.smooth.y) * g;
    this.dx = this.x - this.prevX;
    this.dy = this.y - this.prevY;
    this.prevX = this.x;
    this.prevY = this.y;
    const inv = f.dt > 0 ? 1 / f.dt : 0;
    this.vx = damp(this.vx, this.dx * inv, 18, f.dt);
    this.vy = damp(this.vy, this.dy * inv, 18, f.dt);
    this.speed = Math.hypot(this.vx, this.vy);
    this.nx = (this.x / w) * 2 - 1;
    this.ny = -((this.y / h) * 2 - 1);

    if (this.down) {
      const p = this.holdProgress(1.2);
      if (p > 0) {
        this.holdEmitted = true;
        store.emit('hold', { progress: p, x: this.rawX, y: this.rawY });
      } else if (this.holdEmitted) {
        this.holdEmitted = false;
        store.emit('hold', { progress: 0, x: this.rawX, y: this.rawY });
      }
    }
  }

  dispose(): void {
    this.ghostTween?.kill();
    gsap.killTweensOf(this.smooth);
    this.bin.dispose();
  }
}
