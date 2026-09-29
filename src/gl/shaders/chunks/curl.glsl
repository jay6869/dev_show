// Divergence-free curl noise from two potentials: curl = grad(n1) x grad(n2) (Bridson et al.).
// Two analytic-gradient simplex evaluations instead of the usual 18 finite-difference samples.
// Requires noise.glsl.
vec3 curlNoise(vec3 p) {
  vec3 g1 = snoiseGrad(p).xyz;
  vec3 g2 = snoiseGrad(p + vec3(31.416, -47.853, 12.793)).xyz;
  return cross(g1, g2);
}
