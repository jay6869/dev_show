import {
  DataTexture,
  FloatType,
  HalfFloatType,
  Matrix4,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import fullscreenVert from '../shaders/fullscreen.vert';
import velocityFrag from '../shaders/sim/velocity.frag';
import positionFrag from '../shaders/sim/position.frag';
import initFrag from '../shaders/sim/init.frag';
import { Fullscreen } from '../postfx/Fullscreen';
import { rng } from '../../utils/math';
import type { TargetData } from './targets';

export interface SimParams {
  time: number;
  dt: number;
  morph: number;
  spring: number;
  damping: number;
  curlAmp: number;
  curlFreq: number;
  curlSpeed: number;
  strain: number;
  emerge: number;
  bass: number;
  high: number;
  implode: number;
  fluidAmt: number;
  stringSpan: number;
  wordScale: number;
  pluck: readonly number[];
  recoil: number;
  shatter: number;
  vortex: number;
  pointer: Vector3;
  pointerVel: Vector3;
  pointerRadius: number;
  pointerStrength: number;
  viewProj: Matrix4;
  camRight: Vector3;
  camUp: Vector3;
  fluid: Texture;
}

const makeRT = (size: number, float: boolean): WebGLRenderTarget =>
  new WebGLRenderTarget(size, size, {
    type: float ? FloatType : HalfFloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });

/**
 * FBO ping-pong particle simulation. Two state textures (position, velocity), each double-buffered.
 * Targets are float DataTextures; the shader morphs between the two bracketing the current position.
 */
export class ParticleSim {
  readonly size: number;
  readonly count: number;
  private pos: [WebGLRenderTarget, WebGLRenderTarget];
  private vel: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly seed: DataTexture;
  private readonly targets: (DataTexture | null)[] = [];
  private readonly velMat: ShaderMaterial;
  private readonly posMat: ShaderMaterial;
  private readonly initMat: ShaderMaterial;
  private readonly quad = new Fullscreen();
  private readonly pluck = new Float32Array(9);
  private readonly empty: DataTexture;
  private flip = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    size: number,
    float: boolean,
  ) {
    this.size = size;
    this.count = size * size;
    this.pos = [makeRT(size, float), makeRT(size, float)];
    this.vel = [makeRT(size, float), makeRT(size, float)];

    const r = rng(7);
    const seedData = new Float32Array(this.count * 4);
    for (let i = 0; i < seedData.length; i++) seedData[i] = r();
    this.seed = new DataTexture(seedData, size, size, RGBAFormat, FloatType);
    this.seed.needsUpdate = true;
    this.empty = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
    this.empty.needsUpdate = true;

    this.initMat = new ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: initFrag,
      uniforms: { tSeed: { value: this.seed } },
      depthTest: false,
      depthWrite: false,
    });
    this.velMat = new ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: velocityFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        tSeed: { value: this.seed },
        tTargetA: { value: this.empty },
        tTargetB: { value: this.empty },
        tFluid: { value: this.empty },
        uMix: { value: 0 },
        uTime: { value: 0 },
        uDt: { value: 0.016 },
        uSpring: { value: 2 },
        uDamping: { value: 0.94 },
        uCurlAmp: { value: 1 },
        uCurlFreq: { value: 0.35 },
        uCurlSpeed: { value: 0.08 },
        uStrain: { value: 0 },
        uEmerge: { value: 0 },
        uBass: { value: 0 },
        uHigh: { value: 0 },
        uImplode: { value: 0 },
        uFluidAmt: { value: 0 },
        uStringSpan: { value: 4 },
        uWordScale: { value: 1 },
        uPluck: { value: this.pluck },
        uSnap: { value: 0 },
        uShatter: { value: 0 },
        uVortex: { value: 0 },
        uPointer: { value: new Vector3(999, 999, 999) },
        uPointerVel: { value: new Vector3() },
        uPointerRadius: { value: 1 },
        uPointerStrength: { value: 0 },
        uViewProj: { value: new Matrix4() },
        uCamRight: { value: new Vector3(1, 0, 0) },
        uCamUp: { value: new Vector3(0, 1, 0) },
      },
    });
    this.posMat = new ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: positionFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: { tPos: { value: null }, tVel: { value: null }, uDt: { value: 0.016 } },
    });
    this.reset();
  }

  /** Seeds positions at a single point and zeroes velocity. Also used after context restore. */
  reset(): void {
    const prev = this.renderer.getRenderTarget();
    for (const rt of this.pos) this.quad.render(this.renderer, this.initMat, rt);
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of this.vel) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setClearColor(0x08090b, 1);
    this.renderer.setRenderTarget(prev);
  }

  setTarget(index: number, data: TargetData): void {
    this.targets[index]?.dispose();
    const tex = new DataTexture(data, this.size, this.size, RGBAFormat, FloatType);
    tex.needsUpdate = true;
    this.targets[index] = tex;
  }

  hasTarget(index: number): boolean {
    return !!this.targets[index];
  }

  /** Nearest loaded target at or below `index`, so streaming scenes never leave a hole. */
  private targetAt(index: number): DataTexture {
    for (let i = index; i >= 0; i--) {
      const t = this.targets[i];
      if (t) return t;
    }
    return this.empty;
  }

  get positions(): Texture {
    return this.pos[this.flip]!.texture;
  }

  get velocities(): Texture {
    return this.vel[this.flip]!.texture;
  }

  get uniforms(): ShaderMaterial['uniforms'] {
    return this.velMat.uniforms;
  }

  update(p: SimParams): void {
    const u = this.velMat.uniforms;
    const lo = Math.floor(p.morph);
    u.tTargetA!.value = this.targetAt(lo);
    u.tTargetB!.value = this.targetAt(Math.min(lo + 1, this.targets.length - 1));
    u.uMix!.value = p.morph - lo;
    u.uTime!.value = p.time;
    u.uDt!.value = p.dt;
    u.uSpring!.value = p.spring;
    u.uDamping!.value = p.damping;
    u.uCurlAmp!.value = p.curlAmp;
    u.uCurlFreq!.value = p.curlFreq;
    u.uCurlSpeed!.value = p.curlSpeed;
    u.uStrain!.value = p.strain;
    u.uEmerge!.value = p.emerge;
    u.uBass!.value = p.bass;
    u.uHigh!.value = p.high;
    u.uImplode!.value = p.implode;
    u.uFluidAmt!.value = p.fluidAmt;
    u.uStringSpan!.value = p.stringSpan;
    u.uWordScale!.value = p.wordScale;
    for (let i = 0; i < 9; i++) this.pluck[i] = p.pluck[i] ?? 0;
    u.uSnap!.value = p.recoil;
    u.uShatter!.value = p.shatter;
    u.uVortex!.value = p.vortex;
    (u.uPointer!.value as Vector3).copy(p.pointer);
    (u.uPointerVel!.value as Vector3).copy(p.pointerVel);
    u.uPointerRadius!.value = p.pointerRadius;
    u.uPointerStrength!.value = p.pointerStrength;
    (u.uViewProj!.value as Matrix4).copy(p.viewProj);
    (u.uCamRight!.value as Vector3).copy(p.camRight);
    (u.uCamUp!.value as Vector3).copy(p.camUp);
    u.tFluid!.value = p.fluid;

    const read = this.flip;
    const write = 1 - this.flip;
    u.tPos!.value = this.pos[read]!.texture;
    u.tVel!.value = this.vel[read]!.texture;
    this.quad.render(this.renderer, this.velMat, this.vel[write]!);

    const pu = this.posMat.uniforms;
    pu.tPos!.value = this.pos[read]!.texture;
    pu.tVel!.value = this.vel[write]!.texture;
    pu.uDt!.value = p.dt;
    this.quad.render(this.renderer, this.posMat, this.pos[write]!);
    this.flip = write;
  }

  dispose(): void {
    for (const rt of [...this.pos, ...this.vel]) rt.dispose();
    for (const t of this.targets) t?.dispose();
    this.seed.dispose();
    this.empty.dispose();
    this.velMat.dispose();
    this.posMat.dispose();
    this.initMat.dispose();
    this.quad.dispose();
  }
}
