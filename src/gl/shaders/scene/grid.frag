// Analytic, resolution-independent anti-aliased lines: coverage from fwidth, not from MSAA.
uniform vec2 uCells;
uniform float uWeight;
uniform vec3 uInk;
uniform vec3 uAccent;
varying vec2 vUv;
varying float vStress;
varying float vFade;

float gridLine(vec2 coord, float width) {
  vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
  return 1.0 - min(min(g.x, g.y) / width, 1.0);
}

void main() {
  vec2 c = vUv * uCells;
  float minor = gridLine(c, 1.0);
  float major = gridLine(c / 4.0, 1.25);
  float stress = smoothstep(0.35, 1.3, vStress);
  vec3 col = mix(uInk, uAccent, stress);
  float a = (minor * 0.07 + major * 0.2) * (1.0 + stress * 1.6);
  gl_FragColor = vec4(col * a * uWeight * vFade, 1.0);
}
