import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import gridVert from '../shaders/scene/grid.vert';
import gridFrag from '../shaders/scene/grid.frag';
import type { Frame } from '../../core/Ticker';
import { latticeTarget, type TargetData } from '../gpgpu/targets';
import { PALETTE } from '../palette';
import type { MovementScene, WorldContext } from './Scene';

/** II. Tension. A deformable grid behind a rigid particle lattice. The strain uniform loads both. */
export class TensionScene implements MovementScene {
  readonly index = 1;
  readonly name = 'Tension';
  readonly targetSlots = [2] as const;
  private mesh: Mesh<PlaneGeometry, ShaderMaterial> | null = null;

  buildTargets(size: number): TargetData[] {
    return [latticeTarget(size)];
  }

  init(ctx: WorldContext): void {
    const geo = new PlaneGeometry(24, 14, 192, 112);
    const mat = new ShaderMaterial({
      vertexShader: gridVert,
      fragmentShader: gridFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uStrain: { value: 0 },
        uWeight: { value: 0 },
        uSnap: { value: 0 },
        uPointer: { value: new Vector3() },
        uCells: { value: new Vector2(48, 28) },
        uInk: { value: new Color(PALETTE.ink) },
        uAccent: { value: new Color(PALETTE.accent) },
      },
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.position.z = -2.2;
    this.mesh.renderOrder = 0;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
  }

  update(f: Frame, weight: number, ctx: WorldContext): void {
    if (!this.mesh) return;
    this.mesh.visible = weight > 0.002;
    if (!this.mesh.visible) return;
    const u = this.mesh.material.uniforms;
    u.uTime!.value = f.time;
    u.uStrain!.value = ctx.state.strain;
    u.uWeight!.value = weight;
    u.uSnap!.value = ctx.fx.recoil;
    (u.uPointer!.value as Vector3).copy(ctx.pointerWorld);
  }

  resize(): void {}

  enter(): void {}

  leave(): void {}

  get material(): ShaderMaterial | null {
    return this.mesh?.material ?? null;
  }

  dispose(): void {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }
}
