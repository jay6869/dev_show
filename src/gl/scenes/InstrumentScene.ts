import type { Frame } from '../../core/Ticker';
import { stringsTarget, type TargetData } from '../gpgpu/targets';
import type { MovementScene, WorldContext } from './Scene';

/**
 * V. Instrument. Nine strings of particles. Plucks set an amplitude per string that decays
 * exponentially (like a real string losing energy); the simulation turns it into a standing wave.
 */
export class InstrumentScene implements MovementScene {
  readonly index = 4;
  readonly name = 'Instrument';
  readonly targetSlots = [5] as const;

  buildTargets(size: number): TargetData[] {
    return [stringsTarget(size)];
  }

  init(): void {}

  update(f: Frame, _weight: number, ctx: WorldContext): void {
    const p = ctx.fx.pluck;
    // Lower strings ring longer, as they do on any real instrument.
    for (let i = 0; i < p.length; i++) p[i] = (p[i] ?? 0) * Math.exp(-f.dt * (1.6 + i * 0.12));
  }

  resize(): void {}

  enter(): void {}

  leave(): void {}

  dispose(): void {}
}
