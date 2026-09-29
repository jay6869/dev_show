import * as Tone from 'tone';
import { MOVEMENTS } from '../content/copy';
import { MUTATION_LENGTH, MUTATION_START } from '../core/Timeline';
import { clamp, damp, midiToHz } from '../utils/math';
import type { AudioLevels } from '../gl/scenes/Scene';
import { SOUND } from './palette';

const VOICES = 4;
/** The musical "turn" of each mutation, in movement units after the movement start. */
const TURN = MUTATION_START + MUTATION_LENGTH / 2;

interface PadVoice {
  osc: Tone.FatOscillator;
  gain: Tone.Gain;
}

/**
 * Generative score. Nothing loops: a four-voice pad glides between hexachord chords with voice-leading,
 * the riser is a function of your distance to the next movement, the sub drops exactly where the
 * visual mutation turns, and the instrument is yours.
 *
 * Chain: sources -> [pad filter -> chorus] -> reverb -> master Gain -> Compressor -> Limiter(-1 dB) -> out
 */
export class AudioEngine {
  private readonly master = new Tone.Gain(0);
  private readonly comp = new Tone.Compressor({
    threshold: -20,
    ratio: 3,
    attack: 0.02,
    release: 0.3,
    knee: 12,
  });
  private readonly limiter = new Tone.Limiter(-1);
  private readonly reverb = new Tone.Reverb({ decay: 11, preDelay: 0.04, wet: 1 });
  private readonly reverbSend = new Tone.Gain(0.5);
  private readonly dry = new Tone.Gain(0.55);
  private readonly chorus = new Tone.Chorus({
    frequency: 0.25,
    delayTime: 4.5,
    depth: 0.5,
    spread: 180,
    wet: 0.55,
  });
  private readonly padFilter = new Tone.Filter({ type: 'lowpass', frequency: 520, Q: 0.7, rolloff: -24 });
  private readonly padBus = new Tone.Gain(0.8);
  private readonly voices: PadVoice[] = [];
  private readonly subOsc = new Tone.Oscillator({ type: 'sine', frequency: 55 });
  private readonly subEnv = new Tone.AmplitudeEnvelope({
    attack: 0.012,
    decay: 2.2,
    sustain: 0,
    release: 0.5,
  });
  private readonly subGain = new Tone.Gain(0.55);
  private readonly noise = new Tone.Noise('pink');
  private readonly riserFilter = new Tone.Filter({ type: 'bandpass', frequency: 300, Q: 3 });
  private readonly riserGain = new Tone.Gain(0);
  private readonly instFilter = new Tone.Filter({ type: 'lowpass', frequency: 3200, Q: 0.9, rolloff: -12 });
  private readonly instBus = new Tone.Gain(0.7);
  private readonly plucks: Tone.PluckSynth[] = [];
  private readonly glass: Tone.PolySynth<Tone.FMSynth>;
  private readonly ui = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 },
    volume: -30,
  });
  private readonly fft = new Tone.FFT({ size: 512, smoothing: 0.55, normalRange: false });
  private readonly wave = new Tone.Waveform(256);
  private pluckCursor = 0;
  private chordIndex = -1;
  private lastUi = 0;
  private lastNote = 0;
  private noteTimes: number[] = [];
  private lastParamUpdate = 0;
  private lastPosition = 0;
  private muted = false;
  private readonly levels: AudioLevels = { bass: 0, mid: 0, high: 0, rms: 0 };
  /** Raw (unsmoothed) levels, for the Director's Cut only. */
  readonly raw: AudioLevels = { bass: 0, mid: 0, high: 0, rms: 0 };
  onCaption: ((text: string) => void) | null = null;

  constructor() {
    this.glass = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.004, decay: 1.6, sustain: 0, release: 1.4 },
      modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
      volume: -22,
    });
    this.glass.maxPolyphony = 10;

    this.master.chain(this.comp, this.limiter, Tone.getDestination());
    this.limiter.connect(this.fft);
    this.limiter.connect(this.wave);
    this.reverb.connect(this.master);
    this.reverbSend.connect(this.reverb);
    this.dry.connect(this.master);

    this.padBus.chain(this.padFilter, this.chorus);
    this.chorus.connect(this.reverbSend);
    this.chorus.connect(this.dry);
    const first = MOVEMENTS[0]!.hexachord.chord;
    for (let i = 0; i < VOICES; i++) {
      const osc = new Tone.FatOscillator({
        frequency: midiToHz(first[i] ?? 48),
        type: i === 0 ? 'triangle' : 'sawtooth',
        count: 3,
        spread: 18,
      });
      const gain = new Tone.Gain(i === 0 ? 0.16 : 0.07);
      osc.connect(gain);
      gain.connect(this.padBus);
      this.voices.push({ osc, gain });
    }

    this.subOsc.chain(this.subEnv, this.subGain, this.master);
    this.noise.chain(this.riserFilter, this.riserGain);
    this.riserGain.connect(this.reverbSend);
    this.riserGain.connect(this.dry);

    for (let i = 0; i < 6; i++) {
      const p = new Tone.PluckSynth({
        attackNoise: 1.4,
        dampening: 3600,
        resonance: 0.965,
        release: 1.2,
        volume: -8,
      });
      p.connect(this.instFilter);
      this.plucks.push(p);
    }
    this.glass.connect(this.instFilter);
    this.instFilter.connect(this.instBus);
    this.instBus.connect(this.dry);
    this.instBus.connect(this.reverbSend);
    this.ui.connect(this.dry);
  }

  async start(): Promise<void> {
    await Tone.start();
    await this.reverb.generate();
    const now = Tone.now();
    this.chorus.start();
    for (const v of this.voices) v.osc.start(now);
    this.subOsc.start(now);
    this.noise.start(now);
    this.setMovement(0, 0.01);
  }

  /** Ramp master in or out. Never a hard jump: every gain change in the app goes through a ramp. */
  setEnabled(on: boolean, seconds = 1.6): void {
    this.muted = !on;
    const g = this.master.gain;
    g.cancelScheduledValues(Tone.now());
    g.rampTo(on ? 0.9 : 0, on ? seconds : 0.35);
    if (on) this.swell();
  }

  /** The sound-on moment: a filter bloom and a sub swell, matched to the visual "wake". */
  private swell(): void {
    const now = Tone.now();
    this.padFilter.frequency.cancelScheduledValues(now);
    this.padFilter.frequency.setValueAtTime(140, now);
    this.padFilter.frequency.exponentialRampTo(
      SOUND[this.chordIndex < 0 ? 0 : this.chordIndex]!.cutoff * 2.4,
      1.2,
      now,
    );
    this.padFilter.frequency.exponentialRampTo(
      SOUND[this.chordIndex < 0 ? 0 : this.chordIndex]!.cutoff,
      2.4,
      now + 1.2,
    );
    this.hit(MOVEMENTS[Math.max(0, this.chordIndex)]!.hexachord.root, 0.8);
  }

  async suspend(hidden: boolean): Promise<void> {
    const raw = Tone.getContext().rawContext as unknown as {
      suspend(): Promise<void>;
      resume(): Promise<void>;
    };
    if (hidden) {
      this.master.gain.rampTo(0, 0.25);
      await new Promise((r) => setTimeout(r, 300));
      await raw.suspend();
    } else {
      await raw.resume();
      if (!this.muted) this.master.gain.rampTo(0.9, 0.8);
    }
  }

  /** Voice-leading chord change: each voice glides to the nearest note of the new chord. */
  private setMovement(index: number, glide = 2.6): void {
    if (index === this.chordIndex) return;
    this.chordIndex = index;
    const m = MOVEMENTS[index]!;
    const pal = SOUND[index]!;
    const now = Tone.now();
    const target = [...m.hexachord.chord].sort((a, b) => a - b);
    this.voices.forEach((v, i) => {
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.exponentialRampTo(midiToHz(target[i] ?? 48), glide, now);
      v.osc.spread = pal.spread;
    });
    this.padBus.gain.rampTo(pal.level, glide);
    this.chorus.depth = pal.chorus;
    this.onCaption?.(m.caption);
  }

  /** Sub drop: pitch falls an octave into the root, like a kick that decided to be a note. */
  private hit(root: number, velocity: number): void {
    const now = Tone.now();
    const f = midiToHz(root);
    this.subOsc.frequency.cancelScheduledValues(now);
    this.subOsc.frequency.setValueAtTime(f * 2, now);
    this.subOsc.frequency.exponentialRampTo(f, 0.18, now);
    this.subEnv.triggerAttackRelease(1.6, now, clamp(velocity, 0, 1));
  }

  /**
   * Called every frame by the App with the raw scroll position (0..6) and scroll velocity.
   * Automation is rate-limited to 30 Hz so the Param timelines stay short.
   */
  update(position: number, velocity: number, dt: number, now: number): void {
    // Chord + sub hit at the turn of each mutation, in either scroll direction.
    const idx = clamp(Math.floor(position + 1 - TURN), 0, MOVEMENTS.length - 1);
    if (idx !== this.chordIndex) {
      const crossedForward = position > this.lastPosition;
      this.setMovement(idx);
      if (!this.muted) this.hit(MOVEMENTS[idx]!.hexachord.root, crossedForward ? 0.9 : 0.5);
    }
    this.lastPosition = position;

    this.readLevels(dt);
    if (now - this.lastParamUpdate < 1 / 30) return;
    this.lastParamUpdate = now;

    const pal = SOUND[this.chordIndex] ?? SOUND[0]!;
    const energy = clamp(Math.abs(velocity) / 2.5);
    // Moving opens the filter and dries the reverb slightly; stillness closes and blooms it.
    this.padFilter.frequency.rampTo(pal.cutoff * (1 + energy * 3.2), 0.12);
    this.reverbSend.gain.rampTo(clamp(pal.wet - energy * 0.2 + 0.1, 0.1, 0.9), 0.3);

    // Riser: grows from 0.3 movement-units before the turn, cut sharply just after it.
    const frac = position - Math.floor(position);
    const proximity = frac <= TURN ? clamp(1 - (TURN - frac) / 0.32) : 0;
    const moving = clamp(Math.abs(velocity) * 1.4 + 0.1);
    this.riserGain.gain.rampTo(proximity * proximity * 0.14 * moving, 0.08);
    this.riserFilter.frequency.rampTo(260 * Math.pow(2, proximity * 5.2), 0.08);
  }

  private readLevels(dt: number): void {
    const bins = this.fft.getValue();
    const band = (a: number, b: number): number => {
      let s = 0;
      for (let i = a; i < b; i++) s += clamp(((bins[i] ?? -140) + 100) / 70);
      return s / (b - a);
    };
    this.raw.bass = band(1, 4);
    this.raw.mid = band(4, 30);
    this.raw.high = band(30, 200);
    this.raw.rms = (this.raw.bass + this.raw.mid + this.raw.high) / 3;
    // Symmetric, slow smoothing (time constant ~0.25 s): whatever the music does, the visuals it drives
    // cannot modulate faster than ~1 Hz. This is the photosensitivity guarantee, enforced at the source.
    this.levels.bass = damp(this.levels.bass, this.raw.bass, 4, dt);
    this.levels.mid = damp(this.levels.mid, this.raw.mid, 4, dt);
    this.levels.high = damp(this.levels.high, this.raw.high, 4, dt);
    this.levels.rms = damp(this.levels.rms, this.raw.rms, 4, dt);
  }

  get smoothLevels(): AudioLevels {
    return this.levels;
  }

  get spectrum(): Float32Array {
    return this.fft.getValue();
  }

  get waveform(): Float32Array {
    return this.wave.getValue();
  }

  /**
   * Instrument note. brightness 0..1 comes from pointer Y. Throttled: max 16 notes/s overall and
   * 40 ms between notes, so mashing keys can never stack voices into clipping.
   */
  playNote(midi: number, velocity: number, brightness: number): boolean {
    const now = Tone.now();
    if (now - this.lastNote < 0.04) return false;
    this.noteTimes = this.noteTimes.filter((t) => now - t < 1);
    if (this.noteTimes.length >= 16) return false;
    this.noteTimes.push(now);
    this.lastNote = now;
    const pluck = this.plucks[this.pluckCursor]!;
    this.pluckCursor = (this.pluckCursor + 1) % this.plucks.length;
    pluck.dampening = 900 + brightness * 6200;
    pluck.triggerAttack(midiToHz(midi), now);
    this.instFilter.frequency.rampTo(1400 + brightness * 7000, 0.05);
    this.glass.set({ modulationIndex: 2 + brightness * 10 });
    this.glass.triggerAttackRelease(midiToHz(midi + 12), 0.25, now, clamp(velocity) * 0.8);
    return true;
  }

  /** UI hover/click ticks, pitched to the current scale. Throttled to one per 70 ms. */
  uiTick(kind: 'hover' | 'click'): void {
    if (this.muted) return;
    const now = Tone.now();
    if (now - this.lastUi < 0.07) return;
    this.lastUi = now;
    const notes = MOVEMENTS[Math.max(0, this.chordIndex)]!.hexachord.notes;
    const n = notes[kind === 'click' ? 0 : 4] ?? 60;
    this.ui.triggerAttackRelease(midiToHz(n + 24), 0.05, now, kind === 'click' ? 0.9 : 0.4);
  }

  /** Da capo: a reversed swell back to the first chord. */
  rewind(): void {
    const now = Tone.now();
    this.padFilter.frequency.cancelScheduledValues(now);
    this.padFilter.frequency.exponentialRampTo(3000, 1.4, now);
    this.padFilter.frequency.exponentialRampTo(SOUND[0]!.cutoff, 2.2, now + 1.4);
  }

  dispose(): void {
    this.master.gain.cancelScheduledValues(Tone.now());
    for (const v of this.voices) {
      v.osc.dispose();
      v.gain.dispose();
    }
    for (const p of this.plucks) p.dispose();
    for (const n of [
      this.glass,
      this.ui,
      this.subOsc,
      this.subEnv,
      this.subGain,
      this.noise,
      this.riserFilter,
      this.riserGain,
      this.instFilter,
      this.instBus,
      this.padBus,
      this.padFilter,
      this.chorus,
      this.reverb,
      this.reverbSend,
      this.dry,
      this.fft,
      this.wave,
      this.limiter,
      this.comp,
      this.master,
    ]) {
      n.dispose();
    }
  }
}

/**
 * Factory. Called right after the gesture: Sound has already unlocked the audio output inside the
 * gesture itself (iOS needs that), so Tone's own context may resume under sticky activation.
 */
export async function createAudioEngine(): Promise<AudioEngine> {
  await Tone.start();
  const engine = new AudioEngine();
  await engine.start();
  return engine;
}
