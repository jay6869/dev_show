import {
  Color,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import fullscreenVert from '../shaders/fullscreen.vert';
import liquidFrag from '../shaders/scene/liquid.frag';
import compositeFrag from '../shaders/scene/liquidComposite.frag';
import type { Frame } from '../../core/Ticker';
import { vortexTarget, type TargetData } from '../gpgpu/targets';
import { Fullscreen } from '../postfx/Fullscreen';
import { PALETTE } from '../palette';
import { TAU } from '../../utils/math';
import type { MovementScene, WorldContext } from './Scene';

/**
 * III. Liquid. A raymarched SDF (six metaballs + the pointer) rendered into a low-resolution target,
 * then composited into the HDR scene with a Catmull-Rom upsample so the reduced resolution is invisible.
 */
export class LiquidScene implements MovementScene {
  readonly index = 2;
  readonly name = 'Liquid';
  readonly targetSlots = [3] as const;
  private target: WebGLRenderTarget | null = null;
  private marchMat: ShaderMaterial | null = null;
  private composite: Mesh<PlaneGeometry, ShaderMaterial> | null = null;
  private readonly quad = new Fullscreen();
  private readonly blobs = Array.from({ length: 7 }, () => new Vector4());
  private time = 0;
  private steps = 0;
  private pointerBlob = new Vector3();

  buildTargets(size: number): TargetData[] {
    return [vortexTarget(size)];
  }

  init(ctx: WorldContext): void {
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.buildMarch(ctx.settings.marchSteps);
    const compMat = new ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: compositeFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        tMap: { value: this.target.texture },
        uSize: { value: new Vector2(1, 1) },
        uWeight: { value: 0 },
      },
    });
    this.composite = new Mesh(new PlaneGeometry(2, 2), compMat);
    this.composite.frustumCulled = false;
    this.composite.renderOrder = 1;
    this.composite.visible = false;
    ctx.scene.add(this.composite);
    this.resize(ctx);
  }

  /** STEPS is a compile-time constant so the loop unrolls; rebuilt only when the tier changes. */
  private buildMarch(steps: number): void {
    if (steps === this.steps && this.marchMat) return;
    this.steps = steps;
    this.marchMat?.dispose();
    this.marchMat = new ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: liquidFrag,
      defines: { STEPS: steps },
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCamMatrix: { value: new Matrix4() },
        uInvProj: { value: new Matrix4() },
        uCamPos: { value: new Vector3() },
        uBlobs: { value: this.blobs },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uShadows: { value: 1 },
        uWeight: { value: 0 },
        uInk: { value: new Color(PALETTE.ink) },
        uAccent: { value: new Color(PALETTE.accent) },
      },
    });
  }

  resize(ctx: WorldContext): void {
    if (!this.target || !this.composite) return;
    const s = ctx.settings.marchScale;
    const w = Math.max(2, Math.round(ctx.buffer.x * s));
    const h = Math.max(2, Math.round(ctx.buffer.y * s));
    this.target.setSize(w, h);
    (this.composite.material.uniforms.uSize!.value as Vector2).set(w, h);
    this.buildMarch(ctx.settings.marchSteps);
  }

  update(f: Frame, weight: number, ctx: WorldContext): void {
    if (!this.composite) return;
    this.composite.visible = weight > 0.002;
    if (!this.composite.visible) return;
    const t = f.time * (ctx.reduced ? 0.2 : 1);
    this.time = t;
    const merge = ctx.fx.merge;
    // Six blobs orbit on inclined rings, their radii breathing with the bass.
    for (let i = 0; i < 6; i++) {
      const a = t * (0.21 + i * 0.037) + (i / 6) * TAU;
      const rad = (1.15 + 0.4 * Math.sin(t * 0.4 + i)) * (1 - merge);
      const b = this.blobs[i]!;
      b.set(
        Math.cos(a) * rad,
        Math.sin(a * 1.3 + i) * 0.45 * (1 - merge),
        Math.sin(a) * rad * 0.8,
        (0.56 + 0.12 * Math.sin(t * 0.9 + i * 1.7) + ctx.levels.bass * 0.1) * (1 + merge * 0.75) * weight,
      );
    }
    // The seventh blob is you: it follows the pointer on the focal plane, clamped near the cluster.
    const pw = ctx.pointerWorld;
    const len = Math.min(1, 2.2 / Math.max(0.001, Math.hypot(pw.x, pw.y)));
    this.pointerBlob.set(pw.x * len, pw.y * len * 0.8 + 0.2, 0.9);
    this.blobs[6]!.set(this.pointerBlob.x, this.pointerBlob.y, this.pointerBlob.z, 0.42 * weight);
    this.composite.material.uniforms.uWeight!.value = Math.min(1, weight * 1.4);
  }

  prerender(ctx: WorldContext, weight: number): void {
    if (weight <= 0.002 || !this.marchMat || !this.target) return;
    const u = this.marchMat.uniforms;
    const cam = ctx.camera;
    (u.uCamMatrix!.value as Matrix4).copy(cam.matrixWorld);
    (u.uInvProj!.value as Matrix4).copy(cam.projectionMatrixInverse);
    (u.uCamPos!.value as Vector3).copy(cam.position);
    u.uTime!.value = this.time;
    u.uBass!.value = ctx.levels.bass;
    u.uShadows!.value = ctx.settings.shadows ? 1 : 0;
    u.uWeight!.value = weight;
    ctx.renderer.setClearColor(0x000000, 0);
    this.quad.render(ctx.renderer, this.marchMat, this.target, true);
    ctx.renderer.setClearColor(0x08090b, 1);
  }

  enter(): void {}

  leave(): void {}

  get marchSize(): Vector2 {
    return new Vector2(this.target?.width ?? 0, this.target?.height ?? 0);
  }

  dispose(): void {
    this.target?.dispose();
    this.marchMat?.dispose();
    if (this.composite) {
      this.composite.removeFromParent();
      this.composite.geometry.dispose();
      this.composite.material.dispose();
    }
    this.quad.dispose();
    this.target = null;
    this.composite = null;
    this.marchMat = null;
  }
}
