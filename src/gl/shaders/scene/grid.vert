// II. Tension: a spacetime-like grid. The pointer is a mass; the lattice's strain is a load.
uniform float uTime;
uniform float uStrain;
uniform float uWeight;
uniform float uSnap;
uniform vec3 uPointer;
varying vec2 vUv;
varying float vStress;
varying float vFade;

void main() {
  vUv = uv;
  vec3 p = position;
  vec2 d = p.xy - uPointer.xy;
  float well = exp(-dot(d, d) / 2.4);
  p.z -= well * 1.4;
  float load = uStrain * exp(-dot(p.xy, p.xy) / 22.0);
  p.z -= load * 1.6;
  p.xy *= 1.0 - load * 0.06;
  // Snap: the released cable. A travelling transverse wave, damped away from the centre line.
  p.z += uSnap * sin(p.x * 1.3 - uTime * 16.0) * exp(-abs(p.y) * 0.25) * 0.9;
  // Before it fully arrives the grid is pulled in from infinite depth.
  p.z -= (1.0 - uWeight) * 6.0;
  vStress = well * 0.8 + load;
  vFade = 1.0 - smoothstep(6.0, 10.0, length(p.xy * vec2(0.8, 1.1)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
