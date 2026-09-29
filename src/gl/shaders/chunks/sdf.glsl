// Signed distance primitives + polynomial smooth-min (Inigo Quilez).
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdPlane(vec3 p, float h) { return p.y - h; }

// Quadratic smooth-min. k in distance units; returns blend weight in .y for material mixing.
vec2 sminW(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  float m = h * h * 0.5;
  float s = m * k * 0.5;
  return (a < b) ? vec2(a - s, m) : vec2(b - s, 1.0 - m);
}
float smin(float a, float b, float k) { return sminW(a, b, k).x; }
