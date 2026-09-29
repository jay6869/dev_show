import { INSTRUMENT_KEYS } from '../content/copy';
import { store } from '../core/Store';
import type { Pointer } from '../core/Pointer';
import type { Frame } from '../core/Ticker';
import { isTypingTarget, on } from '../utils/dom';
import { clamp } from '../utils/math';
import { Bin } from '../utils/dispose';
import type { Sound } from './Sound';
import { STRING_NOTES } from './palette';

const BURST_MIN_INTERVAL = 0.34; // s. Caps visual bursts below 3 per second, always.

/**
 * Movement V's playable instrument. Pointer X chooses a string (quantized, so it's always in key),
 * pointer Y sets brightness, press/tap plucks, keys A-L pluck directly. Works identically when silent:
 * the strings and bursts respond, only the sound is missing.
 */
export class Instrument {
  active = false;
  hover = -1;
  brightness = 0.5;
  private readonly bin = new Bin();
  private lastBurst = 0;
  private time = 0;
  private phrase: { s: number; t: number }[] = [];
  private canonUntil = 0;
  private ghostNext = 0;
  private ghostStep = 0;
  onPluck: ((string: number, velocity: number, x: number, y: number, ghost: boolean) => void) | null = null;
  onBurst: ((x: number, y: number, strength: number) => void) | null = null;

  constructor(
    private readonly pointer: Pointer,
    private readonly sound: Sound,
  ) {
    this.bin.add(
      on(window, 'pointerdown', (e) => {
        if (!this.active || e.button > 0) return;
        const t = e.target as HTMLElement | null;
        if (t?.closest('a, button:not(.keys__key), .nav, .dc, .gate')) return;
        this.pluck(this.stringAt(e.clientX), 0.85, e.clientX, e.clientY, false);
      }),
    );
    this.bin.add(
      on(window, 'keydown', (e) => {
        if (!this.active || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target))
          return;
        const idx = (INSTRUMENT_KEYS as readonly string[]).indexOf(e.key.toLowerCase());
        if (idx < 0) return;
        e.preventDefault();
        const x = this.stringX(idx);
        this.pluck(idx, 0.8, x, window.innerHeight * (0.35 + Math.random() * 0.3), false);
      }),
    );
  }

  /** Nearest string to a screen X. Strings sit at 10%, 20% ... 90% of the width. */
  stringAt(clientX: number): number {
    return clamp(Math.round((clientX / window.innerWidth - 0.1) / 0.1), 0, 8);
  }

  /** Screen X of a string. Mirrors the shader: strings span 80% of the visible half-width. */
  stringX(i: number): number {
    const w = window.innerWidth;
    return w / 2 + ((i / 8) * 2 - 1) * (w / 2) * 0.8;
  }

  pluck(s: number, velocity: number, x: number, y: number, ghost: boolean): void {
    const midi = STRING_NOTES[s] ?? 55;
    const played =
      this.sound.engine && this.sound.enabled
        ? this.sound.engine.playNote(midi, velocity, this.brightness)
        : true;
    if (!played) return;
    this.onPluck?.(s, velocity, this.stringX(s), y, ghost);
    store.emit('note', { string: s, midi, x, y, velocity, ghost });
    if (this.time - this.lastBurst >= BURST_MIN_INTERVAL) {
      this.lastBurst = this.time;
      this.onBurst?.(this.stringX(s), y, velocity * (ghost ? 0.5 : 1));
    }
    if (!ghost) this.track(s);
  }

  /** Canon (V secret): climb six consecutive strings upward and the piece answers an octave up. */
  private track(s: number): void {
    this.phrase.push({ s, t: this.time });
    this.phrase = this.phrase.filter((p) => this.time - p.t < 6).slice(-12);
    const last = this.phrase.slice(-6);
    if (last.length === 6 && last.every((p, i) => i === 0 || p.s === (last[i - 1]?.s ?? -9) + 1)) {
      this.canonUntil = this.time + 4.5;
      this.ghostStep = 0;
      this.ghostNext = this.time + 0.5;
      this.phrase = [];
      store.emit('secret', { movement: 4, name: 'Canon' });
    }
  }

  update(f: Frame): void {
    this.time = f.time;
    if (!this.active) {
      this.hover = -1;
      return;
    }
    this.hover = this.stringAt(this.pointer.x);
    this.brightness = clamp(1 - this.pointer.y / window.innerHeight);

    // Canon: replay the climb, then descend, as a ghost voice.
    if (this.time < this.canonUntil && this.time >= this.ghostNext) {
      const seq = [3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2];
      const s = seq[this.ghostStep % seq.length] ?? 4;
      this.ghostStep++;
      this.ghostNext = this.time + 0.36;
      this.pluck(s, 0.5, this.stringX(s), window.innerHeight * 0.3, true);
    }

    // Idle: the piece plays itself, slowly, following the ghost pointer.
    if (store.state.idle && this.time >= this.ghostNext && this.time >= this.canonUntil) {
      this.ghostNext = this.time + 1.1 + Math.random() * 1.4;
      const s = this.stringAt(this.pointer.x);
      this.pluck(s, 0.4, this.stringX(s), this.pointer.y, true);
    }
  }

  dispose(): void {
    this.bin.dispose();
  }
}
