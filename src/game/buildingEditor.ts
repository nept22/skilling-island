import * as THREE from 'three';
import { toWorld, toGrid } from './world';
import type { BuildingPlacement } from './buildings';

export interface PlacedBuilding {
  root: THREE.Object3D;
  placement: BuildingPlacement;
}

// Highlights a building with a Box3Helper bounding-box outline while selected.
function makeHighlight(root: THREE.Object3D, scene: THREE.Scene): THREE.Box3Helper {
  const box = new THREE.Box3().setFromObject(root);
  const helper = new THREE.Box3Helper(box, new THREE.Color(0xffdd00));
  scene.add(helper);
  return helper;
}

function updateHighlight(helper: THREE.Box3Helper, root: THREE.Object3D): void {
  (helper.box as THREE.Box3).setFromObject(root);
}

// Snap a world-space X or Z value back to the nearest tile-centre world coord.
function snapToTile(world: number): number {
  // toWorld(t, _) = t - HALF + 0.5  →  t = world + HALF - 0.5
  // HALF = 24 for SIZE=48
  const HALF = 24;
  const tile = Math.round(world + HALF - 0.5);
  return tile - HALF + 0.5;
}

export function initBuildingEditor(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
  buildings: PlacedBuilding[],
  onMove?: () => void,
): void {
  // ── state ────────────────────────────────────────────────────────────────
  let active = false;
  let hovered: PlacedBuilding | null = null;
  let selected: PlacedBuilding | null = null;
  let highlight: THREE.Box3Helper | null = null;
  let dragging = false;

  // Y-offset from model origin to ground so we can re-seat after drag.
  // Stored per-selection: the vertical shift applied on first load.
  let selectedYOffset = 0;

  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundHit = new THREE.Vector3();

  // ── overlay label ────────────────────────────────────────────────────────
  const label = document.createElement('div');
  label.textContent = 'EDITOR MODE  ·  L to export';
  Object.assign(label.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    padding: '4px 10px',
    background: 'rgba(0,0,0,0.6)',
    color: '#ffdd00',
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 'bold',
    borderRadius: '3px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(label);

  // ── export confirmation flash ─────────────────────────────────────────────
  const exportFlash = document.createElement('div');
  exportFlash.textContent = 'Layout copied to clipboard!';
  Object.assign(exportFlash.style, {
    position: 'fixed',
    top: '36px',
    left: '8px',
    padding: '4px 10px',
    background: 'rgba(0,100,0,0.85)',
    color: '#aaffaa',
    fontFamily: 'monospace',
    fontSize: '13px',
    borderRadius: '3px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(exportFlash);
  let exportTimer: ReturnType<typeof setTimeout> | null = null;

  function showExportFlash(): void {
    exportFlash.style.display = 'block';
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      exportFlash.style.display = 'none';
      exportTimer = null;
    }, 2500);
  }

  // ── helpers ───────────────────────────────────────────────────────────────
  const dom = renderer.domElement;

  function setActive(on: boolean): void {
    active = on;
    label.style.display = on ? 'block' : 'none';
    if (!on) deselect();
    if (!on) dom.style.cursor = '';
  }

  function deselect(): void {
    dragging = false;
    selected = null;
    hovered = null;
    if (highlight) {
      scene.remove(highlight);
      highlight = null;
    }
    dom.style.cursor = active ? 'default' : '';
  }

  function buildingUnderPointer(e: PointerEvent): PlacedBuilding | null {
    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    // Collect all meshes across all buildings, then find the closest hit.
    let closest: PlacedBuilding | null = null;
    let closestDist = Infinity;
    for (const b of buildings) {
      const meshes: THREE.Object3D[] = [];
      b.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0 && hits[0].distance < closestDist) {
        closestDist = hits[0].distance;
        closest = b;
      }
    }
    return closest;
  }

  function projectToGround(e: PointerEvent): THREE.Vector3 | null {
    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectPlane(ground, groundHit);
    return hit;
  }

  // ── event handlers ────────────────────────────────────────────────────────
  function onPointerMove(e: PointerEvent): void {
    if (!active) return;

    if (dragging && selected) {
      const wp = projectToGround(e);
      if (!wp) return;
      // Snap to nearest tile centre in X and Z.
      const snappedX = snapToTile(wp.x);
      const snappedZ = snapToTile(wp.z);
      selected.root.position.set(snappedX, selectedYOffset, snappedZ);
      if (highlight) updateHighlight(highlight, selected.root);
      return;
    }

    const under = buildingUnderPointer(e);
    if (under !== hovered) {
      hovered = under;
      dom.style.cursor = hovered ? 'grab' : 'default';
    }
  }

  function onContextMenu(e: MouseEvent): void {
    if (!active) return;
    e.preventDefault();
    const under = buildingUnderPointer(e as unknown as PointerEvent);
    if (!under) return;
    // Select if not already selected.
    if (selected !== under) {
      if (highlight) scene.remove(highlight);
      selected = under;
      highlight = makeHighlight(selected.root, scene);
      selectedYOffset = selected.root.position.y;
    }
    // Rotate 90° clockwise.
    selected.root.rotation.y -= Math.PI / 2;
    selected.placement.rotationY = selected.root.rotation.y;
    if (highlight) updateHighlight(highlight, selected.root);
    console.info('Building placement updated:', JSON.stringify(selected.placement));
    onMove?.();
  }

  function onPointerDown(e: PointerEvent): void {
    if (!active || e.button !== 0) return;
    const under = buildingUnderPointer(e);
    if (!under) {
      deselect();
      return;
    }
    // Select and start drag.
    if (selected !== under) {
      if (highlight) scene.remove(highlight);
      selected = under;
      highlight = makeHighlight(selected.root, scene);
      selectedYOffset = selected.root.position.y;
    }
    dragging = true;
    dom.style.cursor = 'grabbing';
    // Prevent normal gameplay click from firing.
    e.stopPropagation();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!active || !dragging) return;
    dragging = false;
    dom.style.cursor = selected ? 'grab' : 'default';
    if (selected) {
      // Derive tile coords from the final world position.
      const g = toGrid(selected.root.position);
      // Update the in-memory placement.
      selected.placement.x = g.x;
      selected.placement.z = g.z;
      // Re-seat using toWorld to keep the position exactly canonical.
      const w = toWorld(g.x, g.z);
      selected.root.position.set(w.x, selectedYOffset, w.z);
      if (highlight) updateHighlight(highlight, selected.root);
      console.info('Building placement updated:', JSON.stringify(selected.placement));
      onMove?.();
    }
    e.stopPropagation();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyE') {
      setActive(!active);
    }
    if (e.code === 'Escape' && active) {
      setActive(false);
    }
    if (e.code === 'KeyL' && active) {
      const placements = buildings.map((b) => b.placement);
      const json = JSON.stringify(placements, null, 2);
      console.info('Layout exported (defaultPlacements):\n', json);
      navigator.clipboard.writeText(json).catch(() => {});
      if (import.meta.env.DEV) {
        fetch('/__save-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        })
          .then((r) => r.json() as Promise<{ ok: boolean; error?: string }>)
          .then((d) => {
            exportFlash.textContent = d.ok
              ? 'Layout saved to main.ts!'
              : `Save failed: ${d.error ?? '?'}`;
            showExportFlash();
          })
          .catch(() => {
            exportFlash.textContent = 'Save failed — layout copied to clipboard.';
            showExportFlash();
          });
      } else {
        exportFlash.textContent = 'Layout copied to clipboard!';
        showExportFlash();
      }
    }
  }

  // Use capture so we intercept before the normal Input class sees the event.
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerdown', onPointerDown, true);
  dom.addEventListener('pointerup', onPointerUp, true);
  dom.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
}
