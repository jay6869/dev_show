// III. Liquid: six metaballs (one per note of the hexachord) + the pointer, smooth-unioned.
// Rendered at reduced resolution, bounded by a sphere test, soft-shadowed and AO'd.
precision highp float;
#include ../chunks/sdf.glsl;
#include ../chunks/tonemap.glsl;

uniform mat4 uCamMatrix;
uniform mat4 uInvProj;
uniform vec3 uCamPos;
uniform vec4 uBlobs[7];
uniform float uTime;
uniform float uBass;
uniform float uShadows;
uniform float uWeight;
uniform vec3 uInk;
uniform vec3 uAccent;
varying vec2 vUv;

#ifndef STEPS
#define STEPS 64
#endif

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 7; i++) {
    vec4 b = uBlobs[i];
    d = smin(d, sdSphere(p - b.xyz, b.w), 0.75);
  }
  float rip = sin(p.x * 5.0 + uTime * 1.3) * sin(p.y * 4.3 - uTime * 1.1) * sin(p.z * 5.2 + uTime * 0.7);
  return d + rip * (0.012 + uBass * 0.03);
}

vec3 calcNormal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0015;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}

// Improved soft shadows (Quilez 2018): penumbra estimated from the closest approach geometry.
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  float ph = 1e10;
  for (int i = 0; i < 24; i++) {
    float h = map(ro + rd * t);
    float y = h * h / (2.0 * ph);
    float d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, 10.0 * d / max(0.0, t - y));
    ph = h;
    t += clamp(h, 0.02, 0.25);
    if (res < 0.005 || t > 5.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.13 * float(i);
    float d = map(p + n * h);
    occ += (h - d) * sca;
    sca *= 0.85;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

// A studio in a function: two softbox strips and a floor bounce. Liquid metal is only as good as
// what it reflects, and this is all it ever reflects.
vec3 env(vec3 rd) {
  float top = pow(max(rd.y, 0.0), 6.0) * 1.6;
  float strip1 = smoothstep(0.16, 0.02, abs(rd.x - 0.55)) * smoothstep(-0.2, 0.5, rd.y) * 0.7;
  float strip2 = smoothstep(0.02, 0.0, abs(rd.z + 0.45)) * smoothstep(0.0, 0.6, rd.y) * 0.7;
  float floorBounce = smoothstep(0.0, -0.8, rd.y) * 0.04;
  return uInk * (top + strip1 * 2.6 + strip2 * 1.8 + floorBounce);
}

vec2 sphereHit(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 view = uInvProj * vec4(ndc, 1.0, 1.0);
  view /= view.w;
  vec3 rd = normalize((uCamMatrix * vec4(view.xyz, 0.0)).xyz);
  vec3 ro = uCamPos;

  vec2 bound = sphereHit(ro, rd, 3.9);
  if (bound.y < 0.0 || uWeight < 0.001) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float t = max(bound.x, 0.0);
  float hit = -1.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    if (d < 0.0015 * t) { hit = t; break; }
    t += d * 0.9;
    if (t > bound.y) break;
  }
  if (hit < 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 p = ro + rd * hit;
  vec3 n = calcNormal(p);
  vec3 lightDir = normalize(vec3(0.55, 0.8, 0.35));
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  float sh = uShadows > 0.5 ? softShadow(p + n * 0.01, lightDir) : 1.0;
  float ao = ambientOcclusion(p, n);

  vec3 refl = env(reflect(rd, n));
  float diff = max(dot(n, lightDir), 0.0);
  vec3 col = vec3(0.004, 0.0045, 0.005) + uInk * diff * 0.025 * sh;
  col += refl * mix(0.35, 1.0, fres) * mix(0.25, 1.0, sh) * ao;
  float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 80.0) * sh;
  col += uInk * spec * 3.0;
  // The accent lives only in the thinnest rim, where the surface turns away from you.
  col += uAccent * pow(1.0 - ndv, 4.0) * 0.18 * ao;
  col *= ao;
  gl_FragColor = vec4(col, 1.0);
}
