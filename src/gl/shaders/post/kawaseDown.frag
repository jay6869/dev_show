// Dual Kawase downsample (Marius Bjorge, ARM, SIGGRAPH 2015). 5 taps, half resolution per level.
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 sum = texture2D(tMap, vUv).rgb * 4.0;
  sum += texture2D(tMap, vUv - o).rgb;
  sum += texture2D(tMap, vUv + o).rgb;
  sum += texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb;
  sum += texture2D(tMap, vUv - vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(sum / 8.0, 1.0);
}
