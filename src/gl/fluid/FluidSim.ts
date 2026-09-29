import {
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
  type IUniform,
} from 'three';
import baseVert from '../shaders/fluid/base.vert';
import splatFrag from '../shaders/fluid/splat.frag';
import advectFrag from '../shaders/fluid/advect.frag';
import curlFrag from '../shaders/fluid/curl.frag';
import vorticityFrag from '../shaders/fluid/vorticity.frag';
import divergenceFrag from '../shaders/fluid/divergence.frag';
import clearFrag from '../shaders/fluid/clear.frag';
import pressureFrag from '../shaders/fluid/pressure.frag';
import gradientFrag from '../shaders/fluid/gradient.frag';
import { Fullscreen } from '../postfx/Fullscreen';

class DoubleFBO {
  read: WebGLRenderTarget;
  write: WebGLRenderTarget;
  constructor(w: number, h: number, linear: boolean) {
    const make = (): WebGLRenderTarget =>
      new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        format: RGBAFormat,
        minFilter: linear ? LinearFilter : NearestFilter,
        magFilter: linear ? LinearFilter : NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    this.read = make();
    this.write = make();
  }
  swap(): void {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }
  dispose(): void {
    this.read.dispose();
    this.write.dispose();
  }
}

export interface Splat {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
}

type Uniforms = Record<string, IUniform>;

/**
 * Screen-space stable fluids (Stam), velocity only: we never draw dye, we use the velocity field to
 * displace the finished frame and to push particles. Vorticity confinement keeps the curls alive.
 */
export class FluidSim {
  private velocity: DoubleFBO | null = null;
  private pressure: DoubleFBO | null = null;
  private divergence: WebGLRenderTarget | null = null;
  private curl: WebGLRenderTarget | null = null;
  private readonly quad = new Fullscreen();
  private readonly texel = new Vector2();
  private readonly mats: Record<
    'splat' | 'advect' | 'curl' | 'vorticity' | 'divergence' | 'clear' | 'pressure' | 'gradient',
    ShaderMaterial
  >;
  private queue: Splat[] = [];
  iterations: number;
  width = 1;
  height = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private resolution: number,
    iterations: number,
  ) {
    this.iterations = iterations;
    const texelU = { value: this.texel };
    const make = (frag: string, uniforms: Uniforms): ShaderMaterial =>
      new ShaderMaterial({
        vertexShader: baseVert,
        fragmentShader: frag,
        uniforms: { uTexel: texelU, ...uniforms },
        depthTest: false,
        depthWrite: false,
      });
    this.mats = {
      splat: make(splatFrag, {
        tTarget: { value: null },
        uAspect: { value: 1 },
        uPoint: { value: new Vector2() },
        uForce: { value: new Vector3() },
        uRadius: { value: 0.002 },
      }),
      advect: make(advectFrag, {
        tVelocity: { value: null },
        tSource: { value: null },
        uDt: { value: 0.016 },
        uDissipation: { value: 0.9 },
      }),
      curl: make(curlFrag, { tVelocity: { value: null } }),
      vorticity: make(vorticityFrag, {
        tVelocity: { value: null },
        tCurl: { value: null },
        uCurl: { value: 22 },
        uDt: { value: 0.016 },
      }),
      divergence: make(divergenceFrag, { tVelocity: { value: null } }),
      clear: make(clearFrag, { tMap: { value: null }, uValue: { value: 0.8 } }),
      pressure: make(pressureFrag, { tPressure: { value: null }, tDivergence: { value: null } }),
      gradient: make(gradientFrag, { tPressure: { value: null }, tVelocity: { value: null } }),
    };
    this.allocate();
  }

  private dims(): { w: number; h: number } {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const r = this.resolution;
    return aspect >= 1 ? { w: Math.round(r * aspect), h: r } : { w: r, h: Math.round(r / aspect) };
  }

  private allocate(): void {
    const { w, h } = this.dims();
    this.width = w;
    this.height = h;
    this.texel.set(1 / w, 1 / h);
    this.releaseTargets();
    this.velocity = new DoubleFBO(w, h, true);
    this.pressure = new DoubleFBO(w, h, false);
    const single = (): WebGLRenderTarget =>
      new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    this.divergence = single();
    this.curl = single();
    this.clearAll();
  }

  private releaseTargets(): void {
    this.velocity?.dispose();
    this.pressure?.dispose();
    this.divergence?.dispose();
    this.curl?.dispose();
  }

  private clearAll(): void {
    const prev = this.renderer.getRenderTarget();
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of [this.vel.read, this.vel.write, this.prs.read, this.prs.write]) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setClearColor(0x08090b, 1);
    this.renderer.setRenderTarget(prev);
  }

  setResolution(resolution: number, iterations: number): void {
    this.iterations = iterations;
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    this.allocate();
  }

  resize(): void {
    this.allocate();
  }

  /** Queue a splat in normalized screen coords (0..1, y up) with a pixel-space delta. */
  splat(s: Splat): void {
    if (this.queue.length < 8) this.queue.push(s);
  }

  private get vel(): DoubleFBO {
    return this.velocity!;
  }

  private get prs(): DoubleFBO {
    return this.pressure!;
  }

  get texture(): Texture {
    return this.vel.read.texture;
  }

  update(dt: number): void {
    const r = this.renderer;
    const q = this.quad;
    const m = this.mats;
    const aspect = this.width / this.height;

    for (const s of this.queue) {
      m.splat.uniforms.tTarget!.value = this.vel.read.texture;
      m.splat.uniforms.uAspect!.value = aspect;
      (m.splat.uniforms.uPoint!.value as Vector2).set(s.x, s.y);
      (m.splat.uniforms.uForce!.value as Vector3).set(s.dx, s.dy, 0);
      m.splat.uniforms.uRadius!.value = (s.radius / 100) * (aspect > 1 ? aspect : 1);
      q.render(r, m.splat, this.vel.write);
      this.vel.swap();
    }
    this.queue.length = 0;

    m.curl.uniforms.tVelocity!.value = this.vel.read.texture;
    q.render(r, m.curl, this.curl);

    m.vorticity.uniforms.tVelocity!.value = this.vel.read.texture;
    m.vorticity.uniforms.tCurl!.value = this.curl!.texture;
    m.vorticity.uniforms.uDt!.value = dt;
    q.render(r, m.vorticity, this.vel.write);
    this.vel.swap();

    m.divergence.uniforms.tVelocity!.value = this.vel.read.texture;
    q.render(r, m.divergence, this.divergence);

    m.clear.uniforms.tMap!.value = this.prs.read.texture;
    q.render(r, m.clear, this.prs.write);
    this.prs.swap();

    m.pressure.uniforms.tDivergence!.value = this.divergence!.texture;
    for (let i = 0; i < this.iterations; i++) {
      m.pressure.uniforms.tPressure!.value = this.prs.read.texture;
      q.render(r, m.pressure, this.prs.write);
      this.prs.swap();
    }

    m.gradient.uniforms.tPressure!.value = this.prs.read.texture;
    m.gradient.uniforms.tVelocity!.value = this.vel.read.texture;
    q.render(r, m.gradient, this.vel.write);
    this.vel.swap();

    m.advect.uniforms.tVelocity!.value = this.vel.read.texture;
    m.advect.uniforms.tSource!.value = this.vel.read.texture;
    m.advect.uniforms.uDt!.value = dt;
    q.render(r, m.advect, this.vel.write);
    this.vel.swap();
  }

  /** Brief stir, used by the Whirlpool secret. */
  vortex(cx: number, cy: number, strength: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.splat({
        x: cx + Math.cos(a) * 0.08,
        y: cy + Math.sin(a) * 0.08,
        dx: -Math.sin(a) * strength,
        dy: Math.cos(a) * strength,
        radius: 0.35,
      });
    }
  }

  dispose(): void {
    this.releaseTargets();
    for (const mat of Object.values(this.mats)) mat.dispose();
    this.quad.dispose();
  }
}
