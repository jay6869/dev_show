// Initial state: every particle born inside a single point, the preloader's final dot.
precision highp float;
uniform sampler2D tSeed;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tSeed, vUv);
  gl_FragColor = vec4((s.xyz - 0.5) * 0.04, s.w);
}
