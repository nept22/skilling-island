import * as THREE from 'three';

// One shared 4-step gradient so every toon material bands identically.
// Each value is a luminance step: dark shadow → mid → lit → highlight.
const GRADIENT_DATA = new Uint8Array([70, 145, 215, 255]);
const GRADIENT = new THREE.DataTexture(GRADIENT_DATA, 4, 1, THREE.RedFormat);
GRADIENT.minFilter = THREE.NearestFilter;
GRADIENT.magFilter = THREE.NearestFilter;
GRADIENT.needsUpdate = true;

// Swaps lit materials (Lambert/Standard) under `root` for MeshToonMaterial,
// preserving color, map, vertex colors, and transparency. Unlit materials
// (MeshBasicMaterial markers, lines) are left alone.
export function toonify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const src = m as THREE.MeshStandardMaterial;
      if (
        !(src as unknown as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial &&
        !(src as unknown as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial
      ) {
        return m;
      }
      const toon = new THREE.MeshToonMaterial({
        color: src.color.clone(),
        gradientMap: GRADIENT,
        map: src.map ?? null,
        vertexColors: src.vertexColors,
        transparent: src.transparent,
        opacity: src.opacity,
        side: src.side,
      });
      src.dispose();
      return toon;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(swap)
      : swap(mesh.material);
  });
}
