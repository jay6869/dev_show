// IV. Crystal. Flat-shaded hexagonal quartz; barycentrics carried per vertex for analytic facet edges.
attribute vec3 bary;
uniform float uShatter;
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vBary;
varying vec4 vClip;

float faceHash(vec3 n) { return fract(sin(dot(n, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_INSTANCING
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
  n = mat3(instanceMatrix) * n;
#endif
  float h = faceHash(normal);
  p += n * uShatter * (0.9 + h * 1.8);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPosW = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vBary = bary;
  gl_Position = projectionMatrix * viewMatrix * wp;
  vClip = gl_Position;
}
