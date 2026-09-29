import './styles/base.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/rest.css';
import { gsap } from 'gsap';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  Matrix4,
  PerspectiveCamera,
  Points,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import particlesVert from './gl/shaders/scene/particles.vert';
import particlesFrag from './gl/shaders/scene/particles.frag';
import { Renderer } from './core/Renderer';
import { Pointer } from './core/Pointer';
import { ticker, PRIORITY } from './core/Ticker';
import { detectDevice, prefersReducedMotion } from './core/Device';
import { ParticleSim } from './gl/gpgpu/ParticleSim';
import { PostFX } from './gl/postfx/PostFX';
import { fieldTarget, wordTarget } from './gl/gpgpu/targets';
import { PALETTE } from './gl/palette';
import { EASE } from './utils/easing';
import { damp } from './utils/math';

/**
 * 404 as a mini-movement: "Rest". The number is spelled in particles that have wandered off.
 * Hold anywhere to gather them back into 404; let go and they drift again. Same simulation,
 * same post chain, same single ticker as the main piece, at a fraction of the cost.
 */
async function boot(): Promise<void> {
  document.documentElement.classList.add('is-booted');
  const device = detectDevice();
  const reduced = prefersReducedMotion().matches;
  if (!device.webgl2 || !device.floatRT) {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  await document.fonts.load('800 100px Anybody').catch(() => undefined);

  const renderer = new Renderer(document.querySelector<HTMLCanvasElement>('#gl')!);
  renderer.setMaxDpr(1.5);
  const gl = renderer.gl;
  const size = device.initialTier === 'low' ? 128 : 192;
  const sim = new ParticleSim(gl, size, true);
  sim.setTarget(0, fieldTarget(size));
  sim.setTarget(1, wordTarget(size, '404', 'Anybody, sans-serif', 5.2));
  const post = new PostFX(gl, renderer.buffer.x, renderer.buffer.y, 4);
  post.toggles.fluid = false;
  const blank = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
  blank.needsUpdate = true;
  const pointer = new Pointer();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 9);
  const scene = new Scene();

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
      uSize: { value: 1.7 },
      uViewportH: { value: renderer.buffer.y },
      uFocus: { value: 9 },
      uAperture: { value: 0.4 },
      uBass: { value: 0 },
      uEmerge: { value: 1 },
      uAccentAmt: { value: 0.4 },
      uDecay: { value: 0 },
      uWake: { value: 0 },
      uIntensity: { value: 1.1 },
      uInk: { value: new Color(PALETTE.ink) },
      uAccent: { value: new Color(PALETTE.accent) },
    },
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const resize = (): void => {
    mat.uniforms.uViewportH!.value = renderer.buffer.y;
    camera.aspect = renderer.size.x / renderer.size.y;
    camera.fov = camera.aspect < 1 ? 70 : 40;
    camera.updateProjectionMatrix();
    post.setSize(renderer.buffer.x, renderer.buffer.y);
  };
  renderer.onResize(resize);
  resize();

  const state = { gather: 0, fade: 0 };
  gsap.to(state, { fade: 1, duration: 1.2, ease: EASE.enter });
  const pointerW = new Vector3(999, 999, 0);
  const prevW = new Vector3();
  const velW = new Vector3();
  const viewProj = new Matrix4();
  const right = new Vector3(1, 0, 0);
  const up = new Vector3(0, 1, 0);
  const tmp = new Vector3();

  ticker.start();
  ticker.add((f) => {
    renderer.flush();
    pointer.update(f);
    state.gather = damp(state.gather, pointer.down ? 1 : 0, pointer.down ? 1.6 : 0.8, f.dt);
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    tmp.set(pointer.nx, pointer.ny, 0.5).unproject(camera).sub(camera.position).normalize();
    prevW.copy(pointerW);
    pointerW.copy(camera.position).addScaledVector(tmp, -camera.position.z / tmp.z);
    if (prevW.x < 900) velW.subVectors(pointerW, prevW).divideScalar(Math.max(f.dt, 1e-3)).clampLength(0, 20);
    sim.update({
      time: f.time * (reduced ? 0.2 : 1),
      dt: f.dt,
      morph: state.gather,
      spring: 0.6 + state.gather * 4,
      damping: 0.93,
      curlAmp: (1.4 - state.gather) * (reduced ? 0.2 : 1),
      curlFreq: 0.35,
      curlSpeed: 0.06,
      strain: 0,
      emerge: 1,
      bass: 0,
      high: 0,
      implode: 0,
      fluidAmt: 0,
      stringSpan: 4,
      wordScale: Math.min(1, (Math.tan((camera.fov * Math.PI) / 360) * 9 * camera.aspect * 1.7) / 5.2),
      pluck: [],
      recoil: 0,
      shatter: 0,
      vortex: 0,
      pointer: pointerW,
      pointerVel: velW,
      pointerRadius: 1.2,
      pointerStrength: pointer.down ? 0 : 5,
      viewProj,
      camRight: right,
      camUp: up,
      fluid: blank,
    });
    mat.uniforms.tPos!.value = sim.positions;
    mat.uniforms.tVel!.value = sim.velocities;
    gl.setRenderTarget(post.scene);
    gl.clear(true, true, false);
    gl.render(scene, camera);
    post.render(
      post.scene,
      {
        time: f.time,
        exposure: 1,
        bloom: 0.9,
        fluidAmt: 0,
        ca: 0.15,
        lens: 1,
        grain: 1,
        vignette: 0.7,
        fade: state.fade,
        wake: 0,
        high: 0,
        fluid: blank,
      },
      f.dt,
    );
  }, PRIORITY.render);

  document.addEventListener('visibilitychange', () => ticker.setPaused(document.hidden));
}

boot().catch(() => document.documentElement.classList.add('no-webgl'));
