import { rng, TAU } from '../../utils/math';

/**
 * Particle target shapes. Each returns RGBA float data: xyz = position, w = kind
 * (0 generic, 1..9 = string index + 1, 20 = word glyph). Deterministic: seeded per shape.
 */
export type TargetData = Float32Array;

const alloc = (size: number): Float32Array => new Float32Array(size * size * 4);

function gauss(r: () => number): number {
  // Box-Muller
  const u = Math.max(r(), 1e-7);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
}

/** The title, sampled from real glyph coverage on a 2D canvas. Decorative only; the DOM h1 is the text. */
export function wordTarget(size: number, text: string, font: string, width = 7.4): TargetData {
  const out = alloc(size);
  const r = rng(11);
  const cw = 1600;
  const ch = 360;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fieldTarget(size);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 230;
  ctx.font = `800 ${px}px ${font}`;
  ctx.letterSpacing = '-4px';
  while (ctx.measureText(text).width > cw * 0.94 && px > 40) {
    px -= 6;
    ctx.font = `800 ${px}px ${font}`;
  }
  ctx.fillText(text, cw / 2, ch / 2 + px * 0.04);
  const inkWidth = Math.min(cw, ctx.measureText(text).width);
  const img = ctx.getImageData(0, 0, cw, ch).data;
  const pts: number[] = [];
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const a = img[(y * cw + x) * 4] ?? 0;
      if (a > 140) pts.push(x, y);
    }
  }
  const n = pts.length / 2;
  // Normalise by the text's own width, so "404" and "HEXACHORD" both span `width` world units.
  const scale = width / Math.max(1, inkWidth);
  for (let i = 0; i < size * size; i++) {
    const k = Math.floor(r() * n) * 2;
    const x = (pts[k] ?? cw / 2) + r() - 0.5;
    const y = (pts[k + 1] ?? ch / 2) + r() - 0.5;
    // 8% of particles float off the glyphs as dust, so the word already feels like it is dissolving.
    const dust = r() < 0.08;
    out[i * 4] = (x - cw / 2) * scale + (dust ? gauss(r) * 0.35 : 0);
    out[i * 4 + 1] = -(y - ch / 2) * scale + (dust ? gauss(r) * 0.35 : 0);
    out[i * 4 + 2] = (r() - 0.5) * 0.12 + (dust ? gauss(r) * 0.6 : 0);
    out[i * 4 + 3] = 20;
  }
  canvas.width = canvas.height = 0;
  return out;
}

/** I: an open nebula. A dense core, filamentary shell, and a faint halo. */
export function fieldTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(21);
  for (let i = 0; i < size * size; i++) {
    const u = r();
    let rad: number;
    if (u < 0.25) rad = Math.abs(gauss(r)) * 0.55;
    else if (u < 0.9) rad = 1.4 + Math.pow(r(), 0.7) * 1.8;
    else rad = 3.2 + r() * 2.8;
    const th = TAU * r();
    const ph = Math.acos(2 * r() - 1);
    out[i * 4] = rad * Math.sin(ph) * Math.cos(th) * 1.25;
    out[i * 4 + 1] = rad * Math.cos(ph) * 0.72;
    out[i * 4 + 2] = rad * Math.sin(ph) * Math.sin(th);
    out[i * 4 + 3] = 0;
  }
  return out;
}

/** II: a rigid lattice. Particles live only on grid lines: structure made of the same stuff as chaos. */
export function latticeTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(31);
  const W = 8.4;
  const H = 4.6;
  const cols = 13;
  const rows = 7;
  const layers = [-0.9, 0, 0.9];
  for (let i = 0; i < size * size; i++) {
    const z = layers[Math.floor(r() * layers.length)] ?? 0;
    const horizontal = r() < 0.5;
    const t = r();
    const jitter = gauss(r) * 0.006;
    if (horizontal) {
      const row = Math.floor(r() * rows);
      out[i * 4] = (t - 0.5) * W;
      out[i * 4 + 1] = (row / (rows - 1) - 0.5) * H + jitter;
    } else {
      const col = Math.floor(r() * cols);
      out[i * 4] = (col / (cols - 1) - 0.5) * W + jitter;
      out[i * 4 + 1] = (t - 0.5) * H;
    }
    out[i * 4 + 2] = z + gauss(r) * 0.004;
    out[i * 4 + 3] = 0;
  }
  return out;
}

/** III: a vortex disc around the liquid, like spray caught in orbit. */
export function vortexTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(41);
  const arms = 3;
  for (let i = 0; i < size * size; i++) {
    const rad = 1.9 + Math.pow(r(), 0.65) * 3.6;
    const arm = Math.floor(r() * arms);
    const a = (arm / arms) * TAU + rad * 0.85 + gauss(r) * (0.18 + rad * 0.03);
    out[i * 4] = Math.cos(a) * rad;
    out[i * 4 + 1] = -0.35 + gauss(r) * 0.04 * rad * 0.4;
    out[i * 4 + 2] = Math.sin(a) * rad;
    out[i * 4 + 3] = 0;
  }
  return out;
}

/** IV: the crystal's larger ghost. Particles on the 30 edges of an icosahedron, plus sparse facets. */
export function icosaTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(51);
  const t = (1 + Math.sqrt(5)) / 2;
  const v: [number, number, number][] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const R = 3.1 / Math.hypot(1, t);
  const edges: [number, number][] = [];
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const va = v[a]!;
      const vb = v[b]!;
      if (Math.abs(Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]) - 2) < 1e-3) edges.push([a, b]);
    }
  }
  for (let i = 0; i < size * size; i++) {
    const e = edges[Math.floor(r() * edges.length)]!;
    const a = v[e[0]]!;
    const b = v[e[1]]!;
    const k = r();
    const facet = r() < 0.18;
    const spread = facet ? 0.35 : 0.012;
    out[i * 4] = (a[0] + (b[0] - a[0]) * k) * R + gauss(r) * spread;
    out[i * 4 + 1] = (a[1] + (b[1] - a[1]) * k) * R + gauss(r) * spread;
    out[i * 4 + 2] = (a[2] + (b[2] - a[2]) * k) * R + gauss(r) * spread;
    out[i * 4 + 3] = 0;
  }
  return out;
}

/** V: nine vertical strings. x is resolved in the shader from the live frustum so strings match columns. */
export function stringsTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(61);
  for (let i = 0; i < size * size; i++) {
    const s = Math.floor(r() * 9);
    out[i * 4] = 0;
    out[i * 4 + 1] = (r() - 0.5) * 5.2;
    out[i * 4 + 2] = gauss(r) * 0.01;
    out[i * 4 + 3] = s + 1;
  }
  return out;
}

/** VI: almost everything collapses into an ember; a faint ring remembers the shape. */
export function emberTarget(size: number): TargetData {
  const out = alloc(size);
  const r = rng(71);
  for (let i = 0; i < size * size; i++) {
    const ring = r() < 0.3;
    if (ring) {
      const a = TAU * r();
      const rad = 1.35 + gauss(r) * 0.01;
      out[i * 4] = Math.cos(a) * rad;
      out[i * 4 + 1] = Math.sin(a) * rad;
      out[i * 4 + 2] = gauss(r) * 0.01;
    } else {
      const rad = Math.pow(r(), 1.6) * 0.16;
      const th = TAU * r();
      const ph = Math.acos(2 * r() - 1);
      out[i * 4] = rad * Math.sin(ph) * Math.cos(th);
      out[i * 4 + 1] = rad * Math.cos(ph);
      out[i * 4 + 2] = rad * Math.sin(ph) * Math.sin(th);
    }
    out[i * 4 + 3] = 0;
  }
  return out;
}
