import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toWorld } from './world';
import type { Pt } from './pathfinding';
import { toonify } from '../render/toon';

export type PlayerState = 'idle' | 'walk' | 'fish' | 'cook' | 'chop';

const A = new THREE.Vector3();
const B = new THREE.Vector3();

export class Player {
  tile: Pt = { x: 45, z: 39 };
  prev: Pt = { x: 45, z: 39 };
  path: Pt[] = [];
  onArrive: (() => void) | null = null;
  group = new THREE.Group();

  private _state: PlayerState = 'idle';
  private facing = 0;
  private targetFacing = 0;
  private bobTime = 0;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<PlayerState, THREE.AnimationAction>> = {};
  private current: THREE.AnimationAction | null = null;
  private body: THREE.Group | null = null;
  private rod: THREE.Group | null = null;
  private axe: THREE.Group | null = null;

  constructor() {
    this.buildPlaceholder();
    void this.tryLoadModel();
    this.group.position.copy(toWorld(this.tile.x, this.tile.z, A));
  }

  get state(): PlayerState {
    return this._state;
  }

  set state(s: PlayerState) {
    if (s === this._state) return;
    this._state = s;
    if (this.rod) this.rod.visible = s === 'fish';
    if (this.axe) this.axe.visible = s === 'chop';
    this.playAction(s);
  }

  setPath(path: Pt[], onArrive: (() => void) | null = null): void {
    this.path = path;
    this.onArrive = onArrive;
  }

  faceToward(x: number, z: number): void {
    this.targetFacing = Math.atan2(x - this.tile.x, z - this.tile.z);
  }

  onTick(): void {
    if (this.path.length > 0) {
      this.prev = this.tile;
      this.tile = this.path.shift()!;
      this.targetFacing = Math.atan2(this.tile.x - this.prev.x, this.tile.z - this.prev.z);
      this.state = 'walk';
    } else {
      this.prev = this.tile;
      if (this.state === 'walk') this.state = 'idle';
      if (this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
    }
  }

  updateRender(alpha: number, dt: number): void {
    toWorld(this.prev.x, this.prev.z, A);
    toWorld(this.tile.x, this.tile.z, B);
    this.group.position.lerpVectors(A, B, alpha);

    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 12);
    this.group.rotation.y = this.facing;

    this.bobTime += dt;
    if (this.mixer) {
      this.mixer.update(dt);
    } else if (this.body) {
      // Procedural placeholder animation until a real model takes over.
      if (this._state === 'walk') {
        this.body.position.y = Math.abs(Math.sin(this.bobTime * 9)) * 0.07;
        this.body.rotation.x = 0.06;
      } else if (this._state === 'fish') {
        this.body.position.y = 0;
        this.body.rotation.x = 0.14 + Math.sin(this.bobTime * 2.2) * 0.04;
      } else if (this._state === 'cook') {
        this.body.position.y = Math.abs(Math.sin(this.bobTime * 3)) * 0.03;
        this.body.rotation.x = 0.2;
      } else if (this._state === 'chop') {
        this.body.position.y = 0;
        this.body.rotation.x = 0.1 + Math.abs(Math.sin(this.bobTime * 4.5)) * 0.18;
      } else {
        this.body.position.y = Math.sin(this.bobTime * 1.8) * 0.012;
        this.body.rotation.x = 0;
      }
    }
  }

  private buildPlaceholder(): void {
    const body = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.5, 4, 10),
      new THREE.MeshLambertMaterial({ color: 0x3a6ea8 }),
    );
    torso.position.y = 0.62;
    torso.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0xe8b88a }),
    );
    head.position.y = 1.18;
    head.castShadow = true;
    body.add(torso, head);

    const rod = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, 1.15, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    );
    pole.geometry.translate(0, 0.575, 0);
    rod.add(pole);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1.15, 0),
        new THREE.Vector3(0, 0.05, 0.7),
      ]),
      new THREE.LineBasicMaterial({ color: 0xdddddd }),
    );
    rod.add(line);
    rod.position.set(0.2, 0.55, 0.16);
    rod.rotation.x = 0.9;
    rod.visible = false;
    body.add(rod);

    const axe = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.55, 6),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2a }),
    );
    handle.geometry.translate(0, 0.275, 0);
    axe.add(handle);
    const axeHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.1, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x8d8d8d }),
    );
    axeHead.position.set(0, 0.57, 0);
    axe.add(axeHead);
    axe.position.set(0.2, 0.55, 0.16);
    axe.rotation.x = 0.9;
    axe.visible = false;
    body.add(axe);

    this.rod = rod;
    this.axe = axe;
    this.body = body;
    this.group.add(body);
  }

  private async tryLoadModel(): Promise<void> {
    try {
      // Vite's dev server answers missing files with index.html, so check the
      // content type before handing the URL to the loader.
      const head = await fetch('/models/player.glb', { method: 'HEAD' });
      if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return;

      const gltf = await new GLTFLoader().loadAsync('/models/player.glb');
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      if (size.y > 0) gltf.scene.scale.setScalar(1.7 / size.y);
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      toonify(gltf.scene);

      if (this.body) this.group.remove(this.body);
      this.body = null;
      this.rod = null;
      this.axe = null;
      this.group.add(gltf.scene);

      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(gltf.scene);
        const states: PlayerState[] = ['idle', 'walk', 'fish', 'cook', 'chop'];
        for (const s of states) {
          const clip = gltf.animations.find((c) => c.name.toLowerCase().includes(s));
          if (clip) this.actions[s] = this.mixer.clipAction(clip);
        }
        this.playAction(this._state);
      }
      console.info('Loaded custom player model from /models/player.glb');
    } catch {
      // No custom model yet — the placeholder capsule fellow stays.
    }
  }

  private playAction(state: PlayerState): void {
    const next = this.actions[state];
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = next;
  }
}
