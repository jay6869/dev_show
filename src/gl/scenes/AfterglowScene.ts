import type { Frame } from '../../core/Ticker';
import { emberTarget, type TargetData } from '../gpgpu/targets';
import type { MovementScene, WorldContext } from './Scene';

/**
 * VI. Afterglow. Resolution by subtraction: the timeline decays particles, exposure and curl; this
 * scene only owns the ember target. The single quiet detail at the end is DOM: the last light.
 */
export class AfterglowScene implements MovementScene {
  readonly index = 5;
  readonly name = 'Afterglow';
  readonly targetSlots = [6] as const;

  buildTargets(size: number): TargetData[] {
    return [emberTarget(size)];
  }

  init(): void {}

  update(_f: Frame, _weight: number, _ctx: WorldContext): void {}

  resize(): void {}

  enter(): void {}

  leave(): void {}

  dispose(): void {}
}
