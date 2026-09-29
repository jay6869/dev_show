float easeOutExpo(float t) { return t >= 1.0 ? 1.0 : 1.0 - pow(2.0, -10.0 * t); }
float easeInOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5; }
float easeOutBack(float t) { float c1 = 1.70158; float c3 = c1 + 1.0; return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0); }
