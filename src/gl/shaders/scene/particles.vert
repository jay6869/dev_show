// Particle render. Positions are fetched from the simulation texture; 'position' holds the lookup uv.
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize;
uniform float uViewportH;
uniform float uFocus;
uniform float uAperture;
uniform float uBass;
uniform float uEmerge;
uniform float uAccentAmt;
uniform float uDecay;
uniform float uWake;
uniform vec3 uInk;
uniform vec3 uAccent;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 p = texture2D(tPos, position.xy);
  vec4 v = texture2D(tVel, position.xy);
  float seed = p.w;
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;

  float depth = -mv.z;
  // Thin-lens circle of confusion: out-of-focus particles grow, and their alpha falls with area,
  // so total energy on screen is conserved. That is what makes it read as optics, not blur.
  float coc = abs(depth - uFocus) / max(depth, 0.1) * uAperture;
  float base = uSize * (0.55 + seed * seed * 1.1) * (1.0 + uBass * 0.35 + uWake * 0.6);
  // Size follows the projection (focal length x viewport height), not raw pixels, so a wide portrait FOV
  // shrinks the points with the scene and density on screen stays constant at every aspect ratio.
  float focalPx = projectionMatrix[1][1] * uViewportH * 0.5 * 0.00647;
  float size = base * focalPx / max(depth, 0.1);
  float blurPx = coc * (focalPx / 8.0) * 30.0;
  gl_PointSize = clamp(size + blurPx, 1.0, 64.0);
  float energy = size / gl_PointSize;

  float speed = v.w;
  float hot = smoothstep(1.2, 4.5, speed) * uAccentAmt;
  // One in thirty particles carries the accent at rest: sparse signal lights inside the field.
  hot = max(hot, step(0.967, seed) * uAccentAmt * 0.8);
  vColor = mix(uInk, uAccent, hot);
  float born = smoothstep(0.0, 0.35, uEmerge + seed * 0.1 - 0.05);
  vAlpha = energy * energy * born * (0.35 + 0.65 * seed) * (1.0 - uDecay * (0.35 + 0.65 * fract(seed * 7.13)));
}
