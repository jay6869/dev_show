// GPGPU velocity integration. One texel = one particle.
// Forces: target spring (with per-particle staggered morph), curl field, pointer, fluid, audio, secrets.
precision highp float;

#include ../chunks/noise.glsl;
#include ../chunks/curl.glsl;

uniform sampler2D tPos;
uniform sampler2D tVel;
uniform sampler2D tSeed;
uniform sampler2D tTargetA;
uniform sampler2D tTargetB;
uniform sampler2D tFluid;

uniform float uMix;
uniform float uTime;
uniform float uDt;
uniform float uSpring;
uniform float uDamping;
uniform float uCurlAmp;
uniform float uCurlFreq;
uniform float uCurlSpeed;
uniform float uStrain;
uniform float uEmerge;
uniform float uBass;
uniform float uHigh;
uniform float uImplode;
uniform float uFluidAmt;
uniform float uStringSpan;
uniform float uWordScale;
uniform float uPluck[9];
uniform float uSnap;
uniform float uShatter;
uniform float uVortex;

uniform vec3 uPointer;
uniform vec3 uPointerVel;
uniform float uPointerRadius;
uniform float uPointerStrength;

uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;

varying vec2 vUv;

const float STAGGER = 0.55;
const float PI = 3.14159265;

// Targets encode a "kind" in .w: 0 generic, 1..9 string index + 1, 20 = word glyph.
vec3 resolveTarget(vec4 t, vec4 seed) {
  vec3 p = t.xyz;
  if (t.w > 0.5 && t.w < 10.0) {
    float idx = t.w - 1.0;
    p.x = (idx / 8.0 * 2.0 - 1.0) * uStringSpan;
    float along = clamp(p.y / 2.6 * 0.5 + 0.5, 0.0, 1.0);
    float amp = uPluck[int(idx)];
    // Standing wave, fundamental + a quiet 2nd partial; frequency rises with string index.
    float f = 26.0 + idx * 4.0;
    p.z += amp * sin(PI * along) * sin(uTime * f + seed.y * 0.3) * 0.55;
    p.x += amp * (sin(PI * along) * sin(uTime * f) * 0.28 + sin(2.0 * PI * along) * sin(uTime * f * 2.0) * 0.08);
  } else if (t.w > 19.5) {
    p.xy *= uWordScale;
  }
  return p;
}

void main() {
  vec4 pos = texture2D(tPos, vUv);
  vec4 vel = texture2D(tVel, vUv);
  vec4 seed = texture2D(tSeed, vUv);
  vec4 ta = texture2D(tTargetA, vUv);
  vec4 tb = texture2D(tTargetB, vUv);

  // Staggered morph: each particle has its own departure time, so shapes pour rather than cross-fade.
  float m = clamp(uMix * (1.0 + STAGGER) - seed.x * STAGGER, 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  vec3 target = mix(resolveTarget(ta, seed), resolveTarget(tb, seed), m);

  // Emergence: before birth, everything is held at a single point.
  float born = clamp(uEmerge * (1.0 + STAGGER) - seed.z * STAGGER, 0.0, 1.0);
  target = mix(seed.xyz * 0.02 - 0.01, target, born * born * (3.0 - 2.0 * born));

  // Shatter (IV secret): targets blown outward along their own direction.
  target += normalize(target + 1e-4) * uShatter * (1.0 + seed.w * 2.5);

  vec3 acc = vec3(0.0);
  vec3 toTarget = target - pos.xyz;
  // Spring weakens mid-morph so the curl field gets to "carry" particles between shapes.
  float inFlight = 1.0 - abs(m - 0.5) * 2.0;
  acc += toTarget * uSpring * (1.0 - 0.6 * inFlight) * (0.75 + seed.y * 0.5);

  // Curl field. Strain (II) fights the spring: more turbulence, higher frequency.
  vec3 cp = pos.xyz * (uCurlFreq + uStrain * 0.35) + vec3(0.0, 0.0, uTime * uCurlSpeed);
  float curlK = uCurlAmp * (1.0 + inFlight * 1.5 + uStrain * 1.6 + uHigh * 0.6);
  acc += curlNoise(cp) * curlK;

  // Pointer: repel within radius, plus drag along pointer velocity.
  vec3 d = pos.xyz - uPointer;
  float r2 = dot(d, d);
  float fall = exp(-r2 / (uPointerRadius * uPointerRadius));
  acc += normalize(d + 1e-5) * fall * uPointerStrength;
  acc += uPointerVel * fall * 1.6;

  // Implode (I secret): collapse to the pointer, then release.
  acc += (uPointer - pos.xyz) * uImplode * (1.5 + seed.w);

  // Whirlpool (III secret): tangential swirl around the vertical axis.
  vec3 swirl = vec3(-pos.z, 0.0, pos.x);
  acc += swirl * uVortex * 1.8 / (1.0 + dot(pos.xz, pos.xz) * 0.15);

  // Snap (II secret): an impulse wave along x, like a released cable.
  acc.y += uSnap * sin(pos.x * 2.2 - uTime * 18.0) * 6.0 * (0.6 + seed.y);

  // Audio: bass breathes the whole form outward from its centre; highs add fine jitter.
  acc += normalize(pos.xyz + 1e-4) * uBass * 2.2;

  // Fluid coupling: sample the screen-space ink velocity under this particle.
  vec4 clip = uViewProj * vec4(pos.xyz, 1.0);
  vec2 suv = clip.xy / max(clip.w, 1e-3) * 0.5 + 0.5;
  if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
    vec2 fv = texture2D(tFluid, suv).xy;
    acc += (uCamRight * fv.x + uCamUp * fv.y) * uFluidAmt;
  }

  vel.xyz += acc * uDt;
  vel.xyz *= pow(uDamping, uDt * 60.0);
  // Speed limit keeps secrets and fluid from ejecting particles into infinity.
  float sp = length(vel.xyz);
  if (sp > 14.0) vel.xyz *= 14.0 / sp;
  vel.w = sp;
  gl_FragColor = vel;
}
