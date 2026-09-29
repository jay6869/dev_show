varying vec3 vColor;
varying float vAlpha;
uniform float uIntensity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  // Gaussian-ish core with a hard-ish rim: reads as a lens-rendered point, not a sprite.
  float a = exp(-d2 * 3.2) * 0.85 + (1.0 - smoothstep(0.82, 1.0, d2)) * 0.15;
  gl_FragColor = vec4(vColor * a * vAlpha * uIntensity, 1.0);
}
