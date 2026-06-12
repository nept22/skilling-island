import * as THREE from 'three';
import { World, toGrid, toWorld } from './world';
import { findPath } from './pathfinding';
import { Player } from './player';
import { CameraRig } from './camera';

// Anything on the map you can click to walk up to and use: fishing spots,
// the bank chest, the cooking range, and whatever comes next.
export interface Interactable {
  x: number;
  z: number;
  name: string;
  act: () => void;
}

export class Input {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt = { x: 0, y: 0, t: 0 };
  private markers: { mesh: THREE.Mesh; age: number }[] = [];

  constructor(
    dom: HTMLElement,
    private rig: CameraRig,
    private scene: THREE.Scene,
    private world: World,
    private player: Player,
    private interactables: Interactable[],
    private onAnyClick: () => void,
    private log: (msg: string) => void,
  ) {
    let mmbDown = false;
    let lastMmb = { x: 0, y: 0 };
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        mmbDown = true;
        lastMmb = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!mmbDown) return;
      const dx = e.clientX - lastMmb.x;
      lastMmb = { x: e.clientX, y: e.clientY };
      // ~300px drag = one full 90° step feels about right
      this.rig.rotateContinuous(-dx / 300 * (Math.PI / 2));
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button === 1) { mmbDown = false; return; }
      this.onPointerUp(e);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft') this.rig.rotate(1);
      if (e.code === 'ArrowRight') this.rig.rotate(-1);
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.rig.zoom(Math.sign(e.deltaY) * 2.5);
      },
      { passive: false },
    );
  }

  private onPointerUp(e: PointerEvent): void {
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (moved > 8 || performance.now() - this.downAt.t > 500) return;
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.world.clickTargets, false);
    if (hits.length === 0) return;
    const g = toGrid(hits[0].point);
    this.clickTile(g.x, g.z);
  }

  // Exposed separately from the pointer handler so dev tooling can simulate
  // clicks on exact tiles.
  clickTile(x: number, z: number): void {
    this.onAnyClick();
    const target = this.interactables.find((i) => i.x === x && i.z === z);
    if (target) {
      const path = findPath(this.world, this.player.tile, target, true);
      const end = path.length > 0 ? path[path.length - 1] : this.player.tile;
      if (Math.max(Math.abs(end.x - target.x), Math.abs(end.z - target.z)) > 1) {
        this.log(`You can't reach the ${target.name.toLowerCase()}.`);
        return;
      }
      this.player.setPath(path, target.act);
      this.spawnMarker(target.x, target.z, 0xff5544);
    } else {
      const path = findPath(this.world, this.player.tile, { x, z });
      if (path.length === 0) return;
      this.player.setPath(path);
      const end = path[path.length - 1];
      this.spawnMarker(end.x, end.z, 0xffd34d);
    }
  }

  private spawnMarker(x: number, z: number, color: number): void {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.05, 6, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    m.rotation.x = -Math.PI / 2;
    const w = toWorld(x, z);
    m.position.set(w.x, 0.04, w.z);
    this.scene.add(m);
    this.markers.push({ mesh: m, age: 0 });
  }

  updateMarkers(dt: number): void {
    for (const mk of [...this.markers]) {
      mk.age += dt;
      const t = mk.age / 0.6;
      (mk.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - t));
      mk.mesh.scale.setScalar(Math.max(0.01, 1 - t * 0.5));
      if (t >= 1) {
        this.scene.remove(mk.mesh);
        mk.mesh.geometry.dispose();
        (mk.mesh.material as THREE.Material).dispose();
        this.markers.splice(this.markers.indexOf(mk), 1);
      }
    }
  }
}
