import type { AudioLevels } from '../gl/scenes/Scene';
import { damp } from '../utils/math';
import type { Sound } from './Sound';

/**
 * Analyser -> uniform bridge. Hands the World smoothed band levels (bass -> particle pulse and bloom,
 * highs -> shimmer, grain and dispersion). When sound is off it returns null and the World breathes
 * on its own synthetic envelope. A cross-fade hides the switch in either direction.
 */
export class AnalyserBridge {
  private mix = 0;
  private readonly out: AudioLevels = { bass: 0, mid: 0, high: 0, rms: 0 };

  constructor(private readonly sound: Sound) {}

  levels(dt: number): AudioLevels | null {
    const engine = this.sound.engine;
    this.mix = damp(this.mix, engine && this.sound.enabled ? 1 : 0, 2, dt);
    if (!engine || this.mix < 0.001) return null;
    const l = engine.smoothLevels;
    this.out.bass = l.bass * this.mix;
    this.out.mid = l.mid * this.mix;
    this.out.high = l.high * this.mix;
    this.out.rms = l.rms * this.mix;
    return this.out;
  }

  get spectrum(): Float32Array | null {
    return this.sound.engine?.spectrum ?? null;
  }

  get waveform(): Float32Array | null {
    return this.sound.engine?.waveform ?? null;
  }

  get raw(): AudioLevels | null {
    return this.sound.engine?.raw ?? null;
  }
}
