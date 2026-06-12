import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toWorld } from './world';
import type { PlacedBuilding } from './buildingEditor';
import { toonify } from '../render/toon';

export interface BuildingPlacement {
  file: string; // url under /public, e.g. /models/buildings/shop.glb
  x: number; // tile coordinate of the footprint centre
  z: number;
  rotationY?: number; // radians; 0 = as authored, Math.PI = spun 180
}

// Loads a glTF building and seats it on the ground at a tile centre. The model
// keeps its authored size (buildings are modelled to real metres), so a wrongly
// scaled export shows up obviously — the logged dimensions tell you for sure.
// Returns the PlacedBuilding so callers can register it with the building editor,
// or null if the file could not be loaded.
export async function loadBuilding(
  scene: THREE.Scene,
  p: BuildingPlacement,
): Promise<PlacedBuilding | null> {
  try {
    // Vite serves index.html for missing files; check the type before loading.
    const head = await fetch(p.file, { method: 'HEAD' });
    if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) {
      console.warn(`Building not found: ${p.file}`);
      return null;
    }

    const gltf = await new GLTFLoader().loadAsync(p.file);
    const root = gltf.scene;
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    toonify(root);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const w = toWorld(p.x, p.z);
    // Seat the model's lowest point on the ground plane regardless of where its
    // origin ended up, so a slightly-off origin still sits flush.
    root.position.set(w.x, -box.min.y, w.z);
    root.rotation.y = p.rotationY ?? 0;
    scene.add(root);

    console.info(
      `Loaded ${p.file} — ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m ` +
        `(footprint ${size.x.toFixed(1)}×${size.z.toFixed(1)}, height ${size.y.toFixed(1)})`,
    );

    return { root, placement: p };
  } catch (e) {
    console.warn(`Failed to load building ${p.file}`, e);
    return null;
  }
}
