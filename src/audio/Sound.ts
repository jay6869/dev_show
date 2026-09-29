import { store } from '../core/Store';
import { on } from '../utils/dom';
import { Bin } from '../utils/dispose';
import type { AudioEngine } from './AudioEngine';

const KEY = 'hexachord:sound';

/**
 * The always-loaded half of the audio system: consent, persistence, lazy loading, mute and
 * visibility. Tone.js itself is only fetched after the visitor chooses sound, inside that gesture.
 */
export class Sound {
  engine: AudioEngine | null = null;
  private loading: Promise<AudioEngine> | null = null;
  private raw: AudioContext | null = null;
  enabled = false;
  private readonly bin = new Bin();
  onCaption: ((text: string) => void) | null = null;

  constructor() {
    this.bin.add(
      on(document, 'visibilitychange', () => {
        if (this.engine) void this.engine.suspend(document.hidden);
      }),
    );
  }

  /** Remembered choice from a previous visit. Only a hint: audio still needs a fresh gesture. */
  static remembered(): 'sound' | 'silent' | null {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'sound' || v === 'silent' ? v : null;
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, this.enabled ? 'sound' : 'silent');
    } catch {
      /* private mode: the choice simply isn't remembered */
    }
  }

  /**
   * Must be called synchronously from a click/keydown handler. Inside the gesture it unlocks audio
   * output with a one-sample silent buffer (the iOS requirement), then streams Tone.js in.
   */
  enableFromGesture(): Promise<void> {
    if (!this.raw) {
      this.raw = new window.AudioContext();
      const src = this.raw.createBufferSource();
      src.buffer = this.raw.createBuffer(1, 1, this.raw.sampleRate);
      src.connect(this.raw.destination);
      src.start();
      void this.raw.resume().then(() => this.raw?.close());
    }
    this.enabled = true;
    store.state.sound = true;
    this.persist();
    store.emit('sound', { enabled: true });
    this.loading ??= import('./AudioEngine').then(async ({ createAudioEngine }) => {
      const engine = await createAudioEngine();
      engine.onCaption = (t) => this.onCaption?.(t);
      this.engine = engine;
      return engine;
    });
    return this.loading.then((e) => {
      if (this.enabled) e.setEnabled(true);
    });
  }

  disable(): void {
    this.enabled = false;
    store.state.sound = false;
    this.persist();
    this.engine?.setEnabled(false);
    store.emit('sound', { enabled: false });
  }

  toggleFromGesture(): void {
    if (this.enabled) this.disable();
    else void this.enableFromGesture();
  }

  /** Silent choice at the gate: persisted, nothing loaded. */
  chooseSilent(): void {
    this.enabled = false;
    store.state.sound = false;
    this.persist();
  }

  dispose(): void {
    this.bin.dispose();
    this.engine?.dispose();
    if (this.raw && this.raw.state !== 'closed') void this.raw.close();
  }
}
