precision highp float;
uniform sampler2D tVelocity;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
varying vec2 vUv;
void main() {
  vec2 coord = vUv - uDt * texture2D(tVelocity, vUv).xy * uTexel;
  gl_FragColor = vec4(texture2D(tSource, coord).xyz / (1.0 + uDissipation * uDt), 1.0);
}
