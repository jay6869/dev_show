import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import crystalVert from '../shaders/scene/crystal.vert';
import crystalFrag from '../shaders/scene/crystal.frag';
import type { Frame } from '../../core/Ticker';
import { icosaTarget, type TargetData } from '../gpgpu/targets';
import { PALETTE } from '../palette';
import { TAU } from '../../utils/math';
import type { MovementScene, WorldContext } from './Scene';

/** A hexagonal quartz crystal (prism + two pyramidal terminations), non-indexed, flat-shaded, with barycentrics. */
export function quartzGeometry(radius = 0.62, prism = 0.85, tip = 0.8): BufferGeometry {
  const ring = (y: number): Vector3[] =>
    Array.from(
      { length: 6 },
      (_, i) => new Vector3(Math.cos((i / 6) * TAU) * radius, y, Math.sin((i / 6) * TAU) * radius),
    );
  const top = ring(prism);
  const bot = ring(-prism);
  const apexT = new Vector3(0, prism + tip, 0);
  const apexB = new Vector3(0, -prism - tip, 0);
  const tris: Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tris.push(bot[i]!, top[j]!, top[i]!, bot[i]!, bot[j]!, top[j]!);
    tris.push(top[i]!, top[j]!, apexT);
    tris.push(bot[j]!, bot[i]!, apexB);
  }
  const pos = new Float32Array(tris.length * 3);
  const bary = new Float32Array(tris.length * 3);
  tris.forEach((v, k) => {
    pos.set([v.x, v.y, v.z], k * 3);
    bary.set(k % 3 === 0 ? [1, 0, 0] : k % 3 === 1 ? [0, 1, 0] : [0, 0, 1], k * 3);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('bary', new BufferAttribute(bary, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * IV. Crystal. A refractive quartz and six orbiting shards, drawn after the scene is copied so they
 * can sample what is behind them. Particles trace a larger icosahedral ghost around them.
 */
export class CrystalScene implements MovementScene {
  readonly index = 3;
  readonly name = 'Crystal';
  readonly targetSlots = [4] as const;
  private crystal: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  private shards: InstancedMesh<BufferGeometry, ShaderMaterial> | null = null;
  private readonly dummy = new Object3D();
  private readonly viewProj = new Matrix4();
  private readonly q = new Quaternion();
  private readonly axis = new Vector3();
  /** Live IOR readout for the DOM (dispersion breathes with the highs). */
  readonly ior = { r: 1.512, g: 1.528, b: 1.549 };

  buildTargets(size: number): TargetData[] {
    return [icosaTarget(size)];
  }

  init(ctx: WorldContext): void {
    const makeMat = (): ShaderMaterial =>
      new ShaderMaterial({
        vertexShader: crystalVert,
        fragmentShader: crystalFrag,
        transparent: true,
        side: DoubleSide,
        depthWrite: true,
        uniforms: {
          tScene: { value: ctx.post.sceneB.texture },
          uViewProj: { value: this.viewProj },
          uWeight: { value: 0 },
          uIorMin: { value: 1.5 },
          uIorMax: { value: 1.56 },
          uThickness: { value: 0.9 },
          uTime: { value: 0 },
          uHigh: { value: 0 },
          uShatter: { value: 0 },
          uInk: { value: new Color(PALETTE.ink) },
        },
      });
    this.crystal = new Mesh(quartzGeometry(), makeMat());
    this.crystal.frustumCulled = false;
    this.crystal.visible = false;
    this.shards = new InstancedMesh(quartzGeometry(0.16, 0.18, 0.2), makeMat(), 6);
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    ctx.overlay.add(this.crystal, this.shards);
  }

  update(f: Frame, weight: number, ctx: WorldContext): void {
    if (!this.crystal || !this.shards) return;
    const visible = weight > 0.002;
    this.crystal.visible = this.shards.visible = visible;
    if (!visible) return;
    const t = f.time * (ctx.reduced ? 0.15 : 1);
    const e = weight * weight * (3 - 2 * weight);
    this.viewProj.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    // The crystal grows out of the void rather than fading in: scale carries the transition.
    this.crystal.scale.setScalar(0.2 + e * 0.8);
    this.crystal.rotation.set(
      Math.sin(t * 0.21) * 0.35,
      t * 0.18 + ctx.pointerNdc.x * 0.6,
      Math.cos(t * 0.17) * 0.2 - ctx.pointerNdc.y * 0.25,
    );
    this.crystal.updateMatrixWorld();

    for (let i = 0; i < 6; i++) {
      const a = t * 0.35 + (i / 6) * TAU;
      const r = (2.0 + Math.sin(t * 0.5 + i) * 0.2) * (1 + ctx.fx.shatter * 0.8);
      this.dummy.position.set(Math.cos(a) * r, Math.sin(a * 2 + i) * 0.5, Math.sin(a) * r);
      this.q.setFromAxisAngle(this.axis.set(Math.sin(i), 1, Math.cos(i)).normalize(), t * (0.6 + i * 0.1));
      this.dummy.quaternion.copy(this.q);
      this.dummy.scale.setScalar(e);
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;

    const spread = 0.05 + ctx.levels.high * 0.05 + ctx.fx.shatter * 0.08;
    this.ior.r = 1.5;
    this.ior.g = 1.5 + spread * 0.5;
    this.ior.b = 1.5 + spread;
    for (const m of [this.crystal.material, this.shards.material]) {
      const u = m.uniforms;
      u.uWeight!.value = Math.min(1, weight * 1.25);
      u.uTime!.value = t;
      u.uHigh!.value = ctx.levels.high;
      u.uIorMax!.value = this.ior.b;
      u.uShatter!.value = ctx.fx.shatter;
    }
  }

  resize(): void {}

  enter(): void {}

  leave(): void {}

  setWireframe(on: boolean): void {
    if (this.crystal) this.crystal.material.wireframe = on;
    if (this.shards) this.shards.material.wireframe = on;
  }

  dispose(): void {
    for (const m of [this.crystal, this.shards]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    this.shards?.dispose();
    this.crystal = null;
    this.shards = null;
  }
}
