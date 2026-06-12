import * as THREE from 'three';
import { World, toWorld } from './world';
import { Player } from './player';
import { Skill } from './skills';
import { Inventory, ITEMS } from './inventory';

export interface SpotDrop {
  item: string;
  level: number;
  xp: number;
  weight: number;
}

export interface FishingSpot {
  x: number;
  z: number;
  name: string;
  drops: SpotDrop[];
  mesh: THREE.Group;
}

export function createSpots(world: World): FishingSpot[] {
  // Near-hints guide findFishableWater to preferred spots on the 72×72 map.
  // River: mid-river around the bridge zone; bay: near the centre dock pier.
  const river = world.findFishableWater(['river'], { x: 36, z: 30 });
  const sea   = world.findFishableWater(['ocean'], { x: 45, z: 54 });
  return [
    makeSpot(river.x, river.z, 'River fishing spot', [
      { item: 'raw_shrimp', level: 1, xp: 10, weight: 70 },
      { item: 'raw_trout', level: 20, xp: 50, weight: 30 },
    ]),
    makeSpot(sea.x, sea.z, 'Sea fishing spot', [
      { item: 'raw_sardine', level: 5, xp: 20, weight: 70 },
      { item: 'raw_lobster', level: 40, xp: 90, weight: 30 },
    ]),
  ];
}

function makeSpot(x: number, z: number, name: string, drops: SpotDrop[]): FishingSpot {
  const mesh = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xcfe9ff }),
  );
  outer.rotation.x = -Math.PI / 2;
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.035, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8f4ff }),
  );
  inner.rotation.x = -Math.PI / 2;
  mesh.add(outer, inner);
  const w = toWorld(x, z);
  mesh.position.set(w.x, -0.12, w.z);
  return { x, z, name, drops, mesh };
}

export class FishingSystem {
  active: FishingSpot | null = null;
  private ticks = 0;

  constructor(
    private player: Player,
    private skill: Skill,
    private inventory: Inventory,
    private log: (msg: string) => void,
  ) {}

  start(spot: FishingSpot): void {
    if (this.inventory.full) {
      this.log('Your inventory is too full to hold any more fish.');
      return;
    }
    this.active = spot;
    this.ticks = 0;
    this.player.state = 'fish';
    this.player.faceToward(spot.x, spot.z);
    this.log('You cast out your line...');
  }

  stop(): void {
    if (this.active) this.player.state = 'idle';
    this.active = null;
  }

  onTick(): void {
    const spot = this.active;
    if (!spot) return;
    const dx = Math.abs(this.player.tile.x - spot.x);
    const dz = Math.abs(this.player.tile.z - spot.z);
    if (Math.max(dx, dz) > 1) {
      this.stop();
      return;
    }
    this.ticks++;
    // One catch attempt every 4 ticks (2.4s), success odds scale with level.
    if (this.ticks % 4 !== 0) return;
    const level = this.skill.level;
    if (Math.random() > Math.min(0.85, 0.32 + level * 0.008)) return;

    const pool = spot.drops.filter((d) => level >= d.level);
    const total = pool.reduce((sum, d) => sum + d.weight, 0);
    let roll = Math.random() * total;
    let drop = pool[0];
    for (const d of pool) {
      roll -= d.weight;
      if (roll <= 0) {
        drop = d;
        break;
      }
    }

    if (!this.inventory.add(drop.item)) {
      this.log('Your inventory is too full to hold any more fish.');
      this.stop();
      return;
    }
    this.log(`You catch a ${ITEMS[drop.item].name.replace('Raw ', '').toLowerCase()}.`);
    this.skill.addXp(drop.xp);
  }
}
