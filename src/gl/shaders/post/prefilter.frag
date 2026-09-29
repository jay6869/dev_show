// Bloom prefilter: soft-knee threshold + Karis average (luma-weighted) to kill single-pixel fireflies,
// which is what stops 260k additive particles from shimmering at the bloom's lowest mip.
precision highp float;
#include ../chunks/tonemap.glsl;
uniform sampler2D tMap;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

vec3 karis(vec3 c) { return c / (1.0 + luma(c)); }

void main() {
  vec2 o = uTexel;
  vec3 a = texture2D(tMap, vUv + vec2(-o.x, -o.y)).rgb;
  vec3 b = texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb;
  vec3 c = texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb;
  vec3 d = texture2D(tMap, vUv + vec2(o.x, o.y)).rgb;
  float wa = 1.0 / (1.0 + luma(a));
  float wb = 1.0 / (1.0 + luma(b));
  float wc = 1.0 / (1.0 + luma(c));
  float wd = 1.0 / (1.0 + luma(d));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  float br = max(col.r, max(col.g, col.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = (rq * rq) / (4.0 * uKnee + 1e-4);
  float w = max(rq, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(col * w, 1.0);
}
