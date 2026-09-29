import type { WebGLRenderer } from 'three';
import type { Frame } from '../core/Ticker';
import { el, on } from '../utils/dom';
import { Bin } from '../utils/dispose';

/** Dev-only stats overlay, toggled with the backtick key. Tree-shaken out of production builds. */
export class Stats {
  private readonly node = el('pre', { class: 'stats u-mono', 'aria-hidden': 'true', hidden: '' });
  private readonly bin = new Bin();
  private acc = 0;
  private frames = 0;
  private worst = 0;

  constructor(private readonly gl: WebGLRenderer) {
    document.body.append(this.node);
    this.bin.add(
      on(window, 'keydown', (e) => {
        if (e.key === '`') this.node.hidden = !this.node.hidden;
      }),
    );
  }

  update(f: Frame): void {
    this.acc += f.rawMs;
    this.frames++;
    this.worst = Math.max(this.worst, f.rawMs);
    if (this.acc < 500 || this.node.hidden) return;
    const i = this.gl.info;
    this.node.textContent = [
      `fps     ${((this.frames * 1000) / this.acc).toFixed(1)}`,
      `avg     ${(this.acc / this.frames).toFixed(2)} ms`,
      `worst   ${this.worst.toFixed(2)} ms`,
      `calls   ${i.render.calls}`,
      `tris    ${i.render.triangles}`,
      `points  ${i.render.points}`,
      `geo     ${i.memory.geometries}`,
      `tex     ${i.memory.textures}`,
      `progs   ${i.programs?.length ?? 0}`,
    ].join('\n');
    this.acc = 0;
    this.frames = 0;
    this.worst = 0;
  }

  dispose(): void {
    this.bin.dispose();
    this.node.remove();
  }
}
