import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  OrthographicCamera,
  type Material,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';

/**
 * A single oversized triangle covering clip space. One triangle instead of a quad avoids the diagonal
 * seam where fragment quads are shaded twice; every fullscreen pass in the app goes through this.
 */
export class Fullscreen {
  readonly mesh: Mesh;
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.mesh = new Mesh(g);
    this.mesh.frustumCulled = false;
  }

  render(renderer: WebGLRenderer, material: Material, target: WebGLRenderTarget | null, clear = false): void {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    if (clear) renderer.clear(true, false, false);
    renderer.render(this.mesh, this.camera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
