import { MOVEMENTS, TITLE } from '../content/copy';
import { store } from '../core/Store';
import type { Frame } from '../core/Ticker';
import type { AudioLevels } from '../gl/scenes/Scene';
import { PALETTE } from '../gl/palette';
import { Bin } from '../utils/dispose';

/**
 * Browser chrome as part of the piece: document.title follows the movement, and the favicon is a
 * six-bar meter (one bar per movement) that breathes with the sound. Drawn at 6 fps, never more.
 */
export class Meta {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d');
  private readonly link: HTMLLinkElement;
  private readonly bin = new Bin();
  private last = 0;
  private readonly heights = [0.4, 0.6, 0.3, 0.8, 0.5, 0.7];

  constructor() {
    this.canvas.width = this.canvas.height = 32;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.append(link);
    }
    this.link = link;
    this.bin.add(
      store.on('movement', ({ index }) => {
        const m = MOVEMENTS[index];
        if (m) document.title = `${m.docTitle} — ${TITLE}`;
      }),
    );
  }

  update(f: Frame, levels: AudioLevels): void {
    if (!this.ctx || f.time - this.last < 1 / 6) return;
    this.last = f.time;
    const c = this.ctx;
    c.fillStyle = PALETTE.void;
    c.fillRect(0, 0, 32, 32);
    const current = store.state.movement;
    for (let i = 0; i < 6; i++) {
      const wobble = Math.sin(f.time * (0.9 + i * 0.23) + i) * 0.12;
      const energy = i === current ? levels.bass * 1.6 : levels.mid * 0.6;
      const h = Math.min(1, Math.max(0.12, (this.heights[i] ?? 0.5) + wobble + energy));
      const bh = Math.round(h * 22);
      c.fillStyle = i === current ? PALETTE.accent : PALETTE.ink;
      c.fillRect(4 + i * 4, 16 - Math.round(bh / 2), 2, bh);
    }
    this.link.type = 'image/png';
    this.link.href = this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.bin.dispose();
  }
}
