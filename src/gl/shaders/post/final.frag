// Final composite, in order: fluid displacement -> lens -> chromatic aberration -> bloom ->
// exposure + ACES -> vignette -> sRGB -> grain -> dither. Every effect is a scalar so tiers
// and reduced motion scale it to zero without a shader recompile.
precision highp float;
#include ../chunks/hash.glsl;
#include ../chunks/tonemap.glsl;

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tFluid;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uFluidAmt;
uniform float uCA;
uniform float uLens;
uniform float uGrain;
uniform float uVignette;
uniform float uFade;
uniform float uWake;
uniform float uHigh;
uniform vec4 uBursts[4];

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;

  // 1. Pointer ink: the whole frame is displaced by the fluid velocity field.
  vec2 flow = texture2D(tFluid, uv).xy;
  uv -= flow * uFluidAmt;

  // 2. Instrument bursts: expanding refractive rings (never brightness strobes).
  for (int i = 0; i < 4; i++) {
    vec4 b = uBursts[i];
    if (b.w <= 0.0) continue;
    vec2 d = (uv - b.xy) * vec2(aspect, 1.0);
    float r = length(d);
    float ring = b.z * 0.9;
    float band = exp(-pow((r - ring) * 26.0, 2.0));
    uv -= normalize(d + 1e-5) / vec2(aspect, 1.0) * band * b.w * 0.018 * (1.0 - b.z);
  }

  // 3. Lens: gentle barrel distortion, stronger toward the corners.
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
  uv = 0.5 + c * (1.0 + uLens * r2 * 0.08);

  // 4. Chromatic aberration, radial, scaled by scroll velocity. Three taps, not a blur.
  vec2 dir = (uv - 0.5) * r2;
  float ca = uCA * 0.012;
  vec3 col;
  col.r = texture2D(tScene, uv - dir * ca).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv + dir * ca).b;

  // 5. Bloom.
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom * (1.0 + uWake * 0.8);

  // 6. Exposure + tone map.
  col = acesFitted(col * uExposure);

  // 7. Vignette: an elliptical falloff that follows the frame, not a circle.
  float vig = smoothstep(1.25, 0.25, length(c * vec2(aspect * 0.78, 1.0)) * 1.25);
  col *= mix(1.0, vig, uVignette);

  col = linearToSRGB(col);

  // 8. Film grain: luminance-aware (heavier in the shadows, where film grain lives), temporal.
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.13) * 1000.0) - 0.5;
  float shadow = 1.0 - smoothstep(0.0, 0.6, luma(col));
  col += g * uGrain * (0.035 + shadow * 0.045) * (1.0 + uHigh * 0.8);

  // 9. Fade to void (entry, context restore, reduced-motion transitions).
  col = mix(vec3(0.031, 0.035, 0.043), col, uFade);

  // 10. Triangular dither to kill 8-bit banding in the long dark gradients.
  float dn = hash12(gl_FragCoord.xy * 1.37) + hash12(gl_FragCoord.xy * 0.71 + 13.0) - 1.0;
  col += dn / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
