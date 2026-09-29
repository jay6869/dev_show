import { TITLE } from '../../content/copy';
import type { Frame } from '../../core/Ticker';
import { fieldTarget, wordTarget, type TargetData } from '../gpgpu/targets';
import type { MovementScene, WorldContext } from './Scene';

/**
 * I. Emergence. Owns two targets: the title in glyph-particles (the one decorative WebGL typography
 * moment; the real h1 is DOM) and the open field it dissolves into. No geometry of its own:
 * the particles are the whole scene.
 */
export class EmergenceScene implements MovementScene {
  readonly index = 0;
  readonly name = 'Emergence';
  readonly targetSlots = [0, 1] as const;

  buildTargets(size: number): TargetData[] {
    return [wordTarget(size, TITLE.toUpperCase(), 'Anybody, sans-serif'), fieldTarget(size)];
  }

  init(): void {}

  update(_f: Frame, _weight: number, _ctx: WorldContext): void {}

  resize(): void {}

  enter(): void {}

  leave(): void {}

  dispose(): void {}
}
