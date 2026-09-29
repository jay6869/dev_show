precision highp float;
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uDt;
varying vec2 vUv;
void main() {
  vec4 pos = texture2D(tPos, vUv);
  vec4 vel = texture2D(tVel, vUv);
  pos.xyz += vel.xyz * uDt;
  gl_FragColor = pos;
}
