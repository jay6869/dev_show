precision mediump float;
uniform sampler2D tMap;
uniform float uValue;
varying vec2 vUv;
void main() { gl_FragColor = uValue * texture2D(tMap, vUv); }
