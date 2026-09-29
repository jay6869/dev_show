import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  MathUtils,
  Matrix4,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { gsap } from 'gsap';
import particlesVert from './shaders/scene/particles.vert';
import particlesFrag from './shaders/scene/particles.frag';
import { ParticleSim } from './gpgpu/ParticleSim';
import { FluidSim } from './fluid/FluidSim';
import { PostFX } from './postfx/PostFX';
import { PALETTE } from './palette';
import { EmergenceScene } from './scenes/EmergenceScene';
import type { AudioLevels, MovementScene, WorldContext, WorldFx } from './scenes/Scene';
import type { CrystalScene } from './scenes/CrystalScene';
import type { TensionScene } from './scenes/TensionScene';
import type { Renderer } from '../core/Renderer';
import type { Pointer } from '../core/Pointer';
import type { Scroll } from '../core/Scroll';
import type { Quality, TierSettings } from '../core/Quality';
import type { Frame } from '../core/Ticker';
import { initialState, KEYS, type WorldState } from '../core/Timeline';
import { store } from '../core/Store';
import { EASE } from '../utils/easing';
import { clamp, damp } from '../utils/math';
import { Bin } from '../utils/dispose';

const CAMERA_PATH = [
  new Vector3(0, 0, 9.6),
  new Vector3(0.7, 0.35, 8.8),
  new Vector3(0, 3.8, 7.1),
  new Vector3(4.3, 1.5, 6.1),
  new Vector3(0, 0, 8.4),
  new Vector3(0, -0.2, 11.6),
  new Vector3(0, -0.2, 12.8),
];
const LOOK_PATH = [
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 0),
  new Vector3(0, -0.45, 0),
  new Vector3(0, 0.1, 0),
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 0),
  new Vector3(0, 0, 0),
];

type SceneLoader = () => Promise<MovementScene>;

/** Scenes II-VI are streamed after entry, in order of appearance. Only Emergence ships in the first chunk. */
const STREAMED: readonly SceneLoader[] = [
  () => import('./scenes/TensionScene').then((m) => new m.TensionScene()),
  () => import('./scenes/LiquidScene').then((m) => new m.LiquidScene()),
  () => import('./scenes/CrystalScene').then((m) => new m.CrystalScene()),
  () => import('./scenes/InstrumentScene').then((m) => new m.InstrumentScene()),
  () => import('./scenes/AfterglowScene').then((m) => new m.AfterglowScene()),
];

const REFERENCE_COUNT = 512 * 512;

/**
 * The World owns every GPU resource: camera, scenes, simulation, fluid, post. It reads the master
 * timeline's state and turns it into one frame. Nothing in here schedules its own loop.
 */
export class World {
  readonly camera = new PerspectiveCamera(40, 1, 0.1, 80);
  readonly scene = new Scene();
  readonly overlay = new Scene();
  readonly state: WorldState = initialState();
  readonly fx: WorldFx = {
    implode: 0,
    recoil: 0,
    vortex: 0,
    shatter: 0,
    merge: 0,
    wake: 0,
    pluck: new Array<number>(9).fill(0),
  };
  /** Intro: 0 = everything held in one point, 1 = born. */
  readonly emerge = { value: 0 };
  /** Global fade from/to void. */
  readonly fade = { value: 0 };
  /** Reduced motion: while the frame is dark, springs stiffen so particles are already home at fade-in. */
  private readonly settle = { value: 0 };
  levels: AudioLevels = { bass: 0, mid: 0, high: 0, rms: 0 };
  readonly scenes: (MovementScene | null)[] = [null, null, null, null, null, null];
  sim!: ParticleSim;
  fluid!: FluidSim;
  post!: PostFX;
  points!: Points<BufferGeometry, ShaderMaterial>;
  readonly pointerWorld = new Vector3(999, 999, 0);
  readonly pointerNdc = new Vector2();
  private readonly pointerPrev = new Vector3();
  private readonly pointerVel = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly camPos = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private readonly viewProj = new Matrix4();
  private readonly camRight = new Vector3();
  private readonly camUp = new Vector3();
  private readonly parallax = { x: 0, y: 0 };
  private readonly camCurve = new CatmullRomCurve3(CAMERA_PATH, false, 'centripetal');
  private readonly lookCurve = new CatmullRomCurve3(LOOK_PATH, false, 'centripetal');
  private readonly reducedState: WorldState = initialState();
  private readonly active: boolean[] = [false, false, false, false, false, false];
  private readonly bin = new Bin();
  private settings: TierSettings;
  private halfW = 4;
  private halfH = 2.5;
  private sceneTime = 0;
  private silentPhase = 0;
  private streaming: Promise<void> | null = null;
  readonly ctx: WorldContext;
  reduced = false;
  wireframe = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly pointer: Pointer,
    private readonly scroll: Scroll,
    private readonly quality: Quality,
    private readonly floatRT: boolean,
  ) {
    this.settings = quality.settings;
    renderer.setMaxDpr(this.settings.dpr);
    this.createGpu();
    this.ctx = new Context(this);
    this.bin.add(renderer.onResize(() => this.resize()));
    this.bin.add(store.on('quality', () => this.applyTier(this.quality.settings)));
    this.bin.add(
      store.on('movement', ({ index }) => {
        if (this.reduced) this.reducedTransition(index);
      }),
    );
    this.resize();
  }

  get activeState(): WorldState {
    return this.reduced ? this.reducedState : this.state;
  }

  get particleCount(): number {
    return this.sim.count;
  }

  private createGpu(): void {
    const gl = this.renderer.gl;
    const s = this.settings;
    const { x: w, y: h } = this.renderer.buffer;
    this.sim = new ParticleSim(gl, s.particleSize, this.floatRT);
    this.fluid = new FluidSim(gl, s.fluidSize, s.fluidIterations);
    this.post = new PostFX(gl, Math.max(1, w), Math.max(1, h), s.bloomLevels);
    this.applyToggles(s);
    this.points = this.createPoints(s.particleSize);
    this.scene.add(this.points);
  }

  private createPoints(size: number): Points<BufferGeometry, ShaderMaterial> {
    const count = size * size;
    const ref = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      ref[i * 3] = ((i % size) + 0.5) / size;
      ref[i * 3 + 1] = (Math.floor(i / size) + 0.5) / size;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(ref, 3));
    const mat = new ShaderMaterial({
      vertexShader: particlesVert,
      fragmentShader: particlesFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        uSize: { value: 1 },
        uViewportH: { value: 1 },
        uFocus: { value: 9 },
        uAperture: { value: 0.4 },
        uBass: { value: 0 },
        uEmerge: { value: 0 },
        uAccentAmt: { value: 0.3 },
        uDecay: { value: 0 },
        uWake: { value: 0 },
        uIntensity: { value: 1 },
        uInk: { value: new Color(PALETTE.ink) },
        uAccent: { value: new Color(PALETTE.accent) },
      },
    });
    const pts = new Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    return pts;
  }

  private applyToggles(s: TierSettings): void {
    const t = this.post.toggles;
    t.bloom = s.bloom;
    t.chromatic = s.chromatic && !this.reduced;
    t.lens = s.lens && !this.reduced;
    t.grain = s.grain;
    t.fluid = s.fluid && !this.reduced;
  }

  /** Builds the first movement's targets. Called during preload with real progress reporting. */
  async init(report: (p: number) => void): Promise<void> {
    const first = new EmergenceScene();
    await this.installScene(first);
    report(0.6);
    await this.compile();
    report(1);
  }

  /** Compiles every program currently in the scene graph off the main path (KHR_parallel_shader_compile). */
  async compile(): Promise<void> {
    this.updateCamera(0);
    await this.renderer.gl.compileAsync(this.scene, this.camera);
    // Warm the fullscreen passes by rendering one invisible frame.
    this.render(0.016);
  }

  private async installScene(scene: MovementScene): Promise<void> {
    await scene.init(this.ctx);
    const targets = scene.buildTargets(this.sim.size);
    scene.targetSlots.forEach((slot, i) => {
      const t = targets[i];
      if (t) this.sim.setTarget(slot, t);
    });
    this.scenes[scene.index] = scene;
  }

  /** Stream the remaining movements one by one, yielding between each to keep frames smooth. */
  stream(): Promise<void> {
    this.streaming ??= (async () => {
      for (const load of STREAMED) {
        const scene = await load();
        await new Promise<void>((r) => setTimeout(r, 30));
        await this.installScene(scene);
      }
    })();
    return this.streaming;
  }

  /** Typed handles for the Director's Cut and the DOM readouts. Null until streamed in. */
  get crystal(): CrystalScene | null {
    return (this.scenes[3] as CrystalScene | null) ?? null;
  }

  get tension(): TensionScene | null {
    return (this.scenes[1] as TensionScene | null) ?? null;
  }

  get rendererGl(): Renderer['gl'] {
    return this.renderer.gl;
  }

  get bufferSize(): Vector2 {
    return this.renderer.buffer;
  }

  get halfExtents(): { w: number; h: number } {
    return { w: this.halfW, h: this.halfH };
  }

  get tier(): TierSettings {
    return this.settings;
  }

  /** Intro: the point is born into the title. */
  playIntro(reduced: boolean): gsap.core.Timeline {
    const tl = gsap.timeline();
    tl.to(this.fade, { value: 1, duration: reduced ? 0.4 : 1.1, ease: EASE.enter }, 0);
    tl.to(this.emerge, { value: 1, duration: reduced ? 0.6 : 3.4, ease: EASE.enter }, reduced ? 0 : 0.15);
    return tl;
  }

  /** Visuals "wake up" when sound turns on: a swell of bloom, size and grain, then settle. */
  wake(on: boolean): void {
    gsap.killTweensOf(this.fx, 'wake');
    if (!on) return;
    gsap
      .timeline()
      .to(this.fx, { wake: this.reduced ? 0.25 : 1, duration: 0.9, ease: EASE.enter })
      .to(this.fx, { wake: 0, duration: 2.6, ease: EASE.breath });
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
    this.applyToggles(this.settings);
    if (reduced) this.snapReduced(store.state.movement);
  }

  private snapReduced(index: number): void {
    const k = KEYS[index] ?? KEYS[0]!;
    Object.assign(this.reducedState, k, { cam: index, morph: index === 0 ? 0 : index + 1 });
  }

  /** Reduced motion: transitions become a fade through void, with the camera cut while dark. */
  private reducedTransition(index: number): void {
    gsap.killTweensOf(this.fade);
    gsap
      .timeline()
      .to(this.fade, { value: 0, duration: 0.25, ease: EASE.exit })
      .add(() => this.snapReduced(index))
      .fromTo(this.settle, { value: 1 }, { value: 0, duration: 1.4, ease: 'power2.in' })
      .to(this.fade, { value: 1, duration: 0.45, ease: EASE.enter }, '-=0.5');
  }

  /** Mip count for the bloom chain: never so many that the smallest level is under ~16 px. */
  private bloomLevels(s: TierSettings): number {
    const minDim = Math.min(this.renderer.buffer.x, this.renderer.buffer.y);
    return Math.max(2, Math.min(s.bloomLevels, Math.floor(Math.log2(minDim / 16))));
  }

  private applyTier(s: TierSettings): void {
    const prevSize = this.settings.particleSize;
    this.settings = s;
    this.renderer.setMaxDpr(s.dpr);
    this.fluid.setResolution(s.fluidSize, s.fluidIterations);
    this.post.setLevels(this.bloomLevels(s));
    this.applyToggles(s);
    if (s.particleSize !== prevSize) this.rebuildParticles();
    for (const sc of this.scenes) sc?.resize(this.ctx);
  }

  private rebuildParticles(): void {
    this.sim.dispose();
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.sim = new ParticleSim(this.renderer.gl, this.settings.particleSize, this.floatRT);
    this.points = this.createPoints(this.settings.particleSize);
    this.scene.add(this.points);
    for (const sc of this.scenes) {
      if (!sc) continue;
      const targets = sc.buildTargets(this.sim.size);
      sc.targetSlots.forEach((slot, i) => {
        const t = targets[i];
        if (t) this.sim.setTarget(slot, t);
      });
    }
  }

  /** After a lost context: every GPU object is recreated from CPU-side descriptions. */
  async restoreContext(): Promise<void> {
    const loaded = this.scenes.slice();
    for (const sc of loaded) sc?.dispose();
    this.disposeGpu();
    this.createGpu();
    this.scenes.fill(null);
    for (const sc of loaded) if (sc) await this.installScene(sc);
    this.resize();
    this.fade.value = 0;
    gsap.to(this.fade, { value: 1, duration: 0.8, ease: EASE.enter });
  }

  resize(): void {
    const { x, y } = this.renderer.buffer;
    const aspect = this.renderer.size.x / Math.max(1, this.renderer.size.y);
    this.camera.aspect = aspect;
    // Keep horizontal framing on portrait screens: widen the vertical FOV instead of cropping the piece.
    const hFovRef = 2 * Math.atan(Math.tan(MathUtils.degToRad(20)) * 1.5);
    this.camera.fov =
      aspect < 1.5 ? Math.min(92, MathUtils.radToDeg(2 * Math.atan(Math.tan(hFovRef / 2) / aspect))) : 40;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(Math.max(1, x), Math.max(1, y));
    this.post?.setLevels(this.bloomLevels(this.settings));
    this.fluid?.resize();
    for (const sc of this.scenes) sc?.resize(this.ctx);
  }

  private updateCamera(dt: number): void {
    const s = this.activeState;
    const u = clamp(s.cam / 6, 0, 1);
    this.camCurve.getPoint(u, this.camPos);
    this.lookCurve.getPoint(u, this.lookAt);
    const px = this.reduced ? 0 : this.pointer.nx;
    const py = this.reduced ? 0 : this.pointer.ny;
    this.parallax.x = damp(this.parallax.x, px, 2.2, dt);
    this.parallax.y = damp(this.parallax.y, py, 2.2, dt);
    // Parallax orbits around the look target rather than translating: depth reads, horizon doesn't slide.
    this.tmp.subVectors(this.camPos, this.lookAt);
    const r = this.tmp.length();
    const yaw = this.parallax.x * 0.07;
    const pitch = -this.parallax.y * 0.045;
    this.tmp.applyAxisAngle(this.tmp2.set(0, 1, 0), yaw);
    this.tmp.y += pitch * r;
    this.tmp.setLength(r);
    this.camera.position.copy(this.lookAt).add(this.tmp);
    this.camera.lookAt(this.lookAt);
    this.camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.camRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const dist = r;
    this.halfH = Math.tan(MathUtils.degToRad(this.camera.fov / 2)) * dist;
    this.halfW = this.halfH * this.camera.aspect;
  }

  private updatePointer(dt: number): void {
    const p = this.pointer;
    this.pointerNdc.set(p.nx, p.ny);
    if (!p.active && p.ghost.weight < 0.01) {
      this.pointerWorld.set(999, 999, 0);
      this.pointerVel.set(0, 0, 0);
      return;
    }
    // Ray from the camera through the pointer, intersected with the focal plane through the look target.
    this.tmp.set(p.nx, p.ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    this.tmp2.subVectors(this.lookAt, this.camera.position);
    const n = this.tmp3.copy(this.tmp2).normalize();
    const t = this.tmp2.dot(n) / Math.max(1e-4, this.tmp.dot(n));
    this.pointerPrev.copy(this.pointerWorld);
    this.pointerWorld.copy(this.camera.position).addScaledVector(this.tmp, t);
    if (this.pointerPrev.x > 900 || dt <= 0) return;
    this.tmp.subVectors(this.pointerWorld, this.pointerPrev).divideScalar(dt);
    if (this.tmp.length() > 30) this.tmp.setLength(30);
    this.pointerVel.lerp(this.tmp, 1 - Math.exp(-12 * dt));
  }

  /** Silent mode still breathes: a slow synthetic envelope stands in for the analyser (< 0.3 Hz). */
  private silentLevels(dt: number): AudioLevels {
    this.silentPhase += dt;
    const t = this.silentPhase;
    return {
      bass: 0.05 + 0.04 * Math.sin(t * 1.1) * Math.sin(t * 0.37),
      mid: 0.05,
      high: 0.03 + 0.02 * Math.sin(t * 0.7),
      rms: 0.05,
    };
  }

  update(f: Frame, audio: AudioLevels | null): void {
    this.renderer.flush();
    const dt = f.dt;
    this.sceneTime += dt * (this.reduced ? 0.25 : 1);
    this.levels = audio ?? this.silentLevels(dt);
    if (this.reduced) {
      this.levels = {
        bass: this.levels.bass * 0.2,
        mid: this.levels.mid,
        high: this.levels.high * 0.2,
        rms: this.levels.rms,
      };
    }
    this.updateCamera(dt);
    this.updatePointer(dt);

    const s = this.activeState;
    const p = this.pointer;
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (this.settings.fluid && !this.reduced) {
      if (Math.abs(p.dx) + Math.abs(p.dy) > 0.4) {
        this.fluid.splat({
          x: p.x / w,
          y: 1 - p.y / h,
          dx: (p.dx / w) * 5200,
          dy: (-p.dy / h) * 5200,
          radius: 0.22,
        });
      }
      this.fluid.update(dt);
    }

    const strings = s.strings;
    const repel = (2.4 + clamp(p.speed / 900) * 9) * (1 - strings * 0.75);
    this.sim.update({
      time: this.sceneTime,
      dt,
      morph: s.morph,
      spring: s.spring + this.settle.value * 36,
      damping: s.damping + (0.72 - s.damping) * this.settle.value,
      curlAmp: s.curl * (this.reduced ? 0.25 : 1),
      curlFreq: s.curlFreq,
      curlSpeed: this.reduced ? 0.02 : 0.09,
      strain: s.strain,
      emerge: this.emerge.value,
      bass: this.levels.bass * (1 - strings * 0.6),
      high: this.levels.high,
      implode: this.fx.implode,
      fluidAmt: this.settings.fluid && !this.reduced ? 0.035 : 0,
      stringSpan: this.halfW * 0.8,
      wordScale: Math.min(1, (this.halfW * 1.76) / 7.4),
      pluck: this.fx.pluck,
      recoil: this.fx.recoil,
      shatter: this.fx.shatter,
      vortex: this.fx.vortex,
      pointer: this.pointerWorld,
      pointerVel: this.pointerVel,
      pointerRadius: 1.1 + clamp(p.speed / 1500) * 0.8,
      pointerStrength: p.down && p.type !== 'touch' ? -7 : this.reduced ? repel * 0.3 : repel,
      viewProj: this.viewProj,
      camRight: this.camRight,
      camUp: this.camUp,
      fluid: this.fluid.texture,
    });

    const weights = [1 - s.grid, s.grid, s.liquid, s.crystal, s.strings, s.decay];
    this.scenes.forEach((sc, i) => {
      if (!sc) return;
      const wgt = clamp(weights[i] ?? 0);
      const on = wgt > 0.002;
      if (on !== this.active[i]) {
        this.active[i] = on;
        if (on) sc.enter(this.ctx);
        else sc.leave(this.ctx);
      }
      sc.update(f, wgt, this.ctx);
    });

    const ratio = REFERENCE_COUNT / this.sim.count;
    const u = this.points.material.uniforms;
    u.tPos!.value = this.sim.positions;
    u.tVel!.value = this.sim.velocities;
    u.uSize!.value = s.size * Math.min(2.4, Math.sqrt(ratio));
    u.uViewportH!.value = this.renderer.buffer.y;
    u.uFocus!.value = s.focus;
    u.uAperture!.value = s.aperture * (this.reduced ? 0.4 : 1);
    u.uBass!.value = this.levels.bass;
    u.uEmerge!.value = this.emerge.value;
    u.uAccentAmt!.value = s.accent;
    u.uDecay!.value = s.decay;
    u.uWake!.value = this.fx.wake;
    // The title packs every particle onto the glyphs: 20% less energy until it dissolves into the field.
    const wordK = 0.8 + 0.2 * clamp(s.morph);
    u.uIntensity!.value = 0.42 * Math.min(4, Math.pow(ratio, 0.55)) * wordK;

    this.render(dt, f.time);
  }

  private render(dt: number, time = 0): void {
    const gl = this.renderer.gl;
    const s = this.activeState;
    for (const sc of this.scenes) sc?.prerender?.(this.ctx, clamp(s.liquid));
    gl.setRenderTarget(this.post.scene);
    gl.setClearColor(0x08090b, 1);
    gl.clear(true, true, false);
    gl.render(this.scene, this.camera);
    if (s.crystal > 0.002) {
      this.post.copySceneToB();
      gl.setRenderTarget(this.post.scene);
      gl.render(this.overlay, this.camera);
    }
    const energy = this.scroll.energy;
    this.post.render(
      this.post.scene,
      {
        time,
        exposure: s.exposure * (1 + this.fx.wake * 0.12),
        // Bloom radius is a fixed number of mips, so on small screens it is relatively wider: scale it down.
        bloom:
          s.bloom *
          (1 + this.levels.bass * 0.25) *
          clamp(Math.min(this.renderer.size.x, this.renderer.size.y) / 800, 0.45, 1),
        fluidAmt: 0.00009,
        ca: this.reduced ? 0 : 0.12 + energy * 1.6 + this.fx.recoil * 0.8 + this.fx.shatter * 0.5,
        lens: 1,
        grain: s.grain,
        vignette: s.vignette,
        fade: this.fade.value,
        wake: this.fx.wake,
        high: this.levels.high,
        fluid: this.fluid.texture,
      },
      dt,
    );
  }

  burst(x: number, y: number, strength: number): void {
    if (this.reduced) return;
    this.post.burst(x / window.innerWidth, 1 - y / window.innerHeight, strength);
  }

  private disposeGpu(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.sim.dispose();
    this.fluid.dispose();
    this.post.dispose();
  }

  dispose(): void {
    gsap.killTweensOf([this.fade, this.emerge, this.fx, this.settle]);
    this.bin.dispose();
    for (const sc of this.scenes) sc?.dispose();
    this.scenes.fill(null);
    this.disposeGpu();
  }
}

/** The view of the World that movement scenes receive. Live getters: never a stale snapshot. */
class Context implements WorldContext {
  constructor(private readonly w: World) {}
  get renderer(): WorldContext['renderer'] {
    return this.w.rendererGl;
  }
  get scene(): WorldContext['scene'] {
    return this.w.scene;
  }
  get overlay(): WorldContext['overlay'] {
    return this.w.overlay;
  }
  get camera(): WorldContext['camera'] {
    return this.w.camera;
  }
  get post(): WorldContext['post'] {
    return this.w.post;
  }
  get settings(): WorldContext['settings'] {
    return this.w.tier;
  }
  get pointerWorld(): WorldContext['pointerWorld'] {
    return this.w.pointerWorld;
  }
  get pointerNdc(): WorldContext['pointerNdc'] {
    return this.w.pointerNdc;
  }
  get buffer(): WorldContext['buffer'] {
    return this.w.bufferSize;
  }
  get levels(): WorldContext['levels'] {
    return this.w.levels;
  }
  get state(): WorldContext['state'] {
    return this.w.activeState;
  }
  get reduced(): boolean {
    return this.w.reduced;
  }
  get fx(): WorldContext['fx'] {
    return this.w.fx;
  }
  get halfWidth(): number {
    return this.w.halfExtents.w;
  }
  get halfHeight(): number {
    return this.w.halfExtents.h;
  }
}
