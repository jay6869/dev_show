import type { PerspectiveCamera, Scene as ThreeScene, Vector2, Vector3, WebGLRenderer } from 'three';
import type { Frame } from '../../core/Ticker';
import type { WorldState } from '../../core/Timeline';
import type { TierSettings } from '../../core/Quality';
import type { PostFX } from '../postfx/PostFX';
import type { TargetData } from '../gpgpu/targets';

export interface AudioLevels {
  bass: number;
  mid: number;
  high: number;
  rms: number;
}

/** Everything a movement scene may touch. Owned by the World; scenes never create renderers or loops. */
export interface WorldContext {
  readonly renderer: WebGLRenderer;
  /** Main 3D scene (particles, grid, liquid composite). */
  readonly scene: ThreeScene;
  /** Drawn after the main scene has been copied: refractive objects that need to see "behind". */
  readonly overlay: ThreeScene;
  readonly camera: PerspectiveCamera;
  readonly post: PostFX;
  readonly settings: TierSettings;
  readonly pointerWorld: Vector3;
  readonly pointerNdc: Vector2;
  readonly buffer: Vector2;
  readonly levels: AudioLevels;
  readonly state: WorldState;
  readonly reduced: boolean;
  readonly fx: WorldFx;
  /** Visible half-extent (world units) at the focal plane. */
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** One-shot effect envelopes, tweened by secrets and the instrument. */
export interface WorldFx {
  implode: number;
  recoil: number;
  vortex: number;
  shatter: number;
  merge: number;
  wake: number;
  pluck: number[];
}

/**
 * One class per movement. Each provides the particle target(s) for its span, may own GPU resources,
 * and is told how "present" it is (weight 0..1) every frame, so transitions are continuous by design.
 */
export interface MovementScene {
  readonly index: number;
  readonly name: string;
  /** Particle target slots this scene fills (0..6). */
  readonly targetSlots: readonly number[];
  buildTargets(size: number): TargetData[];
  init(ctx: WorldContext): void | Promise<void>;
  /** Optional offscreen work before the main scene renders (e.g. the raymarch). */
  prerender?(ctx: WorldContext, weight: number): void;
  update(f: Frame, weight: number, ctx: WorldContext): void;
  resize(ctx: WorldContext): void;
  enter(ctx: WorldContext): void;
  leave(ctx: WorldContext): void;
  dispose(): void;
}
