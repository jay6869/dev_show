import {
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import fullscreenVert from '../shaders/fullscreen.vert';
import copyFrag from '../shaders/copy.frag';
import prefilterFrag from '../shaders/post/prefilter.frag';
import downFrag from '../shaders/post/kawaseDown.frag';
import upFrag from '../shaders/post/kawaseUp.frag';
import finalFrag from '../shaders/post/final.frag';
import { Fullscreen } from './Fullscreen';

export interface PostToggles {
  bloom: boolean;
  chromatic: boolean;
  lens: boolean;
  grain: boolean;
  fluid: boolean;
  vignette: boolean;
}

export interface PostParams {
  time: number;
  exposure: number;
  bloom: number;
  fluidAmt: number;
  ca: number;
  lens: number;
  grain: number;
  vignette: number;
  fade: number;
  wake: number;
  high: number;
  fluid: Texture;
}

const hdrTarget = (w: number, h: number, depth = false): WebGLRenderTarget =>
  new WebGLRenderTarget(w, h, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: depth,
    stencilBuffer: false,
    generateMipmaps: false,
  });

/**
 * Hand-written post pipeline. No EffectComposer: we know exactly which passes run, in which order,
 * at what resolution, and each can be switched off per tier or from the Director's Cut.
 *   scene (HDR, half float) -> [crystal refraction composite] -> bloom chain -> final composite -> canvas
 */
export class PostFX {
  /** The main HDR scene target. Has depth, for the 3D scene. */
  scene: WebGLRenderTarget;
  /** Second HDR target: refraction composite for IV (the crystal samples `scene`). */
  sceneB: WebGLRenderTarget;
  private down: WebGLRenderTarget[] = [];
  private up: WebGLRenderTarget[] = [];
  private readonly quad = new Fullscreen();
  private readonly copyMat: ShaderMaterial;
  private readonly prefilterMat: ShaderMaterial;
  private readonly downMat: ShaderMaterial;
  private readonly upMat: ShaderMaterial;
  readonly finalMat: ShaderMaterial;
  readonly bursts: Vector4[] = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
  private burstCursor = 0;
  levels: number;
  readonly toggles: PostToggles = {
    bloom: true,
    chromatic: true,
    lens: true,
    grain: true,
    fluid: true,
    vignette: true,
  };

  constructor(
    private readonly renderer: WebGLRenderer,
    private width: number,
    private height: number,
    levels: number,
  ) {
    this.levels = levels;
    this.scene = hdrTarget(width, height, true);
    this.sceneB = hdrTarget(width, height, true);
    const base = { vertexShader: fullscreenVert, depthTest: false, depthWrite: false };
    this.copyMat = new ShaderMaterial({
      ...base,
      fragmentShader: copyFrag,
      uniforms: { tMap: { value: null } },
    });
    this.prefilterMat = new ShaderMaterial({
      ...base,
      fragmentShader: prefilterFrag,
      uniforms: {
        tMap: { value: null },
        uTexel: { value: new Vector2() },
        uThreshold: { value: 0.55 },
        uKnee: { value: 0.35 },
      },
    });
    this.downMat = new ShaderMaterial({
      ...base,
      fragmentShader: downFrag,
      uniforms: { tMap: { value: null }, uTexel: { value: new Vector2() } },
    });
    this.upMat = new ShaderMaterial({
      ...base,
      fragmentShader: upFrag,
      uniforms: {
        tMap: { value: null },
        tPrev: { value: null },
        uTexel: { value: new Vector2() },
        uBlend: { value: 1 },
      },
    });
    this.finalMat = new ShaderMaterial({
      ...base,
      fragmentShader: finalFrag,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tFluid: { value: null },
        uResolution: { value: new Vector2(width, height) },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uBloom: { value: 0.8 },
        uFluidAmt: { value: 0 },
        uCA: { value: 0 },
        uLens: { value: 1 },
        uGrain: { value: 1 },
        uVignette: { value: 0.6 },
        uFade: { value: 0 },
        uWake: { value: 0 },
        uHigh: { value: 0 },
        uBursts: { value: this.bursts },
      },
    });
    this.allocateBloom();
  }

  private allocateBloom(): void {
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    this.down = [];
    this.up = [];
    let w = Math.max(1, Math.floor(this.width / 2));
    let h = Math.max(1, Math.floor(this.height / 2));
    for (let i = 0; i < this.levels; i++) {
      this.down.push(hdrTarget(w, h));
      this.up.push(hdrTarget(w, h));
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scene.setSize(width, height);
    this.sceneB.setSize(width, height);
    (this.finalMat.uniforms.uResolution!.value as Vector2).set(width, height);
    this.allocateBloom();
  }

  setLevels(levels: number): void {
    if (levels === this.levels) return;
    this.levels = levels;
    this.allocateBloom();
  }

  /** Register an instrument burst ring at a normalized screen point. Round-robin, 4 slots. */
  burst(x: number, y: number, strength: number): void {
    const b = this.bursts[this.burstCursor]!;
    b.set(x, y, 0, strength);
    this.burstCursor = (this.burstCursor + 1) % this.bursts.length;
  }

  private updateBursts(dt: number): void {
    for (const b of this.bursts) {
      if (b.w <= 0) continue;
      b.z += dt * 0.9;
      if (b.z >= 1) b.set(0, 0, 0, 0);
    }
  }

  /** Copies `scene` into `sceneB` so the crystal can sample the frame behind it. */
  copySceneToB(): void {
    this.copyMat.uniforms.tMap!.value = this.scene.texture;
    this.quad.render(this.renderer, this.copyMat, this.sceneB);
  }

  private runBloom(source: Texture): Texture {
    const first = this.down[0]!;
    this.prefilterMat.uniforms.tMap!.value = source;
    (this.prefilterMat.uniforms.uTexel!.value as Vector2).set(1 / this.width, 1 / this.height);
    this.quad.render(this.renderer, this.prefilterMat, first);
    for (let i = 1; i < this.down.length; i++) {
      const src = this.down[i - 1]!;
      this.downMat.uniforms.tMap!.value = src.texture;
      (this.downMat.uniforms.uTexel!.value as Vector2).set(1 / src.width, 1 / src.height);
      this.quad.render(this.renderer, this.downMat, this.down[i]!);
    }
    let current = this.down[this.down.length - 1]!;
    for (let i = this.down.length - 2; i >= 0; i--) {
      this.upMat.uniforms.tMap!.value = current.texture;
      this.upMat.uniforms.tPrev!.value = this.down[i]!.texture;
      (this.upMat.uniforms.uTexel!.value as Vector2).set(1 / current.width, 1 / current.height);
      this.quad.render(this.renderer, this.upMat, this.up[i]!);
      current = this.up[i]!;
    }
    return current.texture;
  }

  render(source: WebGLRenderTarget, p: PostParams, dt: number): void {
    this.updateBursts(dt);
    const t = this.toggles;
    const u = this.finalMat.uniforms;
    u.tScene!.value = source.texture;
    u.tBloom!.value = t.bloom && this.levels > 0 ? this.runBloom(source.texture) : source.texture;
    u.tFluid!.value = p.fluid;
    u.uTime!.value = p.time;
    u.uExposure!.value = p.exposure;
    u.uBloom!.value = t.bloom ? p.bloom : 0;
    u.uFluidAmt!.value = t.fluid ? p.fluidAmt : 0;
    u.uCA!.value = t.chromatic ? p.ca : 0;
    u.uLens!.value = t.lens ? p.lens : 0;
    u.uGrain!.value = t.grain ? p.grain : 0;
    u.uVignette!.value = t.vignette ? p.vignette : 0;
    u.uFade!.value = p.fade;
    u.uWake!.value = p.wake;
    u.uHigh!.value = p.high;
    this.quad.render(this.renderer, this.finalMat, null);
  }

  dispose(): void {
    for (const rt of [this.scene, this.sceneB, ...this.down, ...this.up]) rt.dispose();
    this.copyMat.dispose();
    this.prefilterMat.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.finalMat.dispose();
    this.quad.dispose();
  }
}
