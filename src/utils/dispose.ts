import type { Material, Object3D, Texture, WebGLRenderTarget } from 'three';

export interface Disposable {
  dispose(): void;
}

/** Collects disposers so owners can release everything in one call, in reverse order of creation. */
export class Bin implements Disposable {
  private items: (() => void)[] = [];

  add<T extends Disposable | (() => void)>(item: T): T {
    this.items.push(typeof item === 'function' ? item : () => item.dispose());
    return item;
  }

  dispose(): void {
    for (let i = this.items.length - 1; i >= 0; i--) this.items[i]?.();
    this.items = [];
  }
}

const disposeMaterial = (m: Material): void => {
  for (const value of Object.values(m)) {
    if (value && typeof value === 'object' && 'isTexture' in value) (value as Texture).dispose();
  }
  m.dispose();
};

/** Traverses an Object3D and disposes geometries and materials (and textures they hold). */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
  root.removeFromParent();
}

export const disposeTargets = (...targets: (WebGLRenderTarget | undefined)[]): void => {
  for (const t of targets) t?.dispose();
};
