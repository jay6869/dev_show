// Six-band spectral refraction: six IORs, six taps, re-integrated to RGB.
// "Light enters as one and leaves as six" is literally what this shader does.
precision highp float;
uniform sampler2D tScene;
uniform mat4 uViewProj;
uniform float uWeight;
uniform float uIorMin;
uniform float uIorMax;
uniform float uThickness;
uniform float uTime;
uniform float uHigh;
uniform vec3 uInk;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vBary;
varying vec4 vClip;

vec3 bandWeight(int i) {
  if (i == 0) return vec3(1.0, 0.0, 0.0);
  if (i == 1) return vec3(0.7, 0.3, 0.0);
  if (i == 2) return vec3(0.1, 0.9, 0.0);
  if (i == 3) return vec3(0.0, 0.6, 0.4);
  if (i == 4) return vec3(0.0, 0.0, 1.0);
  return vec3(0.3, 0.0, 0.7);
}

void main() {
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vPosW - cameraPosition);
  float ndv = clamp(dot(n, -v), 0.0, 1.0);

  vec3 sum = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float ior = mix(uIorMin, uIorMax, float(i) / 5.0);
    vec3 r = refract(v, n, 1.0 / ior);
    vec4 pc = uViewProj * vec4(vPosW + r * uThickness, 1.0);
    vec2 uv = pc.xy / pc.w * 0.5 + 0.5;
    vec3 w = bandWeight(i);
    sum += texture2D(tScene, clamp(uv, 0.001, 0.999)).rgb * w;
    wsum += w;
  }
  vec3 col = sum / wsum;
  // Slight absorption: glass is never perfectly clear.
  col *= vec3(0.92, 0.95, 0.97);

  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  // Thin-film interference on the grazing faces: the only spectrum in the piece.
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ndv * 1.7 + uTime * 0.03));
  vec3 r = reflect(v, n);
  float strip = smoothstep(0.04, 0.0, abs(r.x - 0.5)) + pow(max(r.y, 0.0), 8.0);
  col += (uInk * strip * 1.8 + film * 0.35 * (1.0 + uHigh)) * fres;

  // Facet edges from barycentrics, 1.2px wide at any distance.
  vec3 fw = fwidth(vBary);
  vec3 e3 = smoothstep(vec3(0.0), fw * 1.2, vBary);
  float edge = 1.0 - min(min(e3.x, e3.y), e3.z);
  col += uInk * edge * 0.55;

  gl_FragColor = vec4(col, uWeight);
}
