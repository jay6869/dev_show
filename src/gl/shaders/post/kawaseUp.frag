// Dual Kawase upsample: 8 taps in a tent, blended additively with the level above.
precision highp float;
uniform sampler2D tMap;
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform float uBlend;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 sum = texture2D(tMap, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  sum += texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  sum += texture2D(tMap, vUv + vec2(0.0, o.y * 2.0)).rgb;
  sum += texture2D(tMap, vUv + vec2(o.x, o.y)).rgb * 2.0;
  sum += texture2D(tMap, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  sum += texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  sum += texture2D(tMap, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  sum += texture2D(tMap, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  vec3 up = sum / 12.0;
  vec3 prev = texture2D(tPrev, vUv).rgb;
  gl_FragColor = vec4(prev + up * uBlend, 1.0);
}
