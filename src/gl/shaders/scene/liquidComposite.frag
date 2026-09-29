precision highp float;
#include ../chunks/sampling.glsl;
uniform sampler2D tMap;
uniform vec2 uSize;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec4 c = textureCatmullRom(tMap, vUv, uSize);
  // Premultiplied: the liquid occludes the grid behind it; particles are added on top afterwards.
  gl_FragColor = c * uWeight;
}
