precision highp float;
uniform sampler2D tTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec3 uForce;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uForce;
  gl_FragColor = vec4(texture2D(tTarget, vUv).xyz + splat, 1.0);
}
