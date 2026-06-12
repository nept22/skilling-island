import * as THREE from 'three';
import {
  SIZE, HALF, ISLAND, BANK_CHEST, RANGE,
  inBay, inBridge, isRiverTile, isMarketStreet, isDockPier,
  inTown, inForest, inMineHills,
} from './layout';

// Re-export SIZE so pathfinding.ts and any other consumers keep working.
export { SIZE, HALF } from './layout';

export type TileType = 'ocean' | 'river' | 'sand' | 'grass' | 'bridge' | 'path' | 'dock';

export interface Tile {
  x: number;
  z: number;
  type: TileType;
  walkable: boolean;
}

export function toWorld(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x - HALF + 0.5, 0, z - HALF + 0.5);
}

export function toGrid(p: THREE.Vector3): { x: number; z: number } {
  return { x: Math.floor(p.x + HALF), z: Math.floor(p.z + HALF) };
}

// Deterministic pseudo-random in [0, 1) so the island is identical every load.
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export interface TreeSpot {
  x: number;
  z: number;
  kind: 'tree' | 'oak';
  mesh: THREE.Group;
}

export class World {
  tiles: Tile[][] = [];
  trees: TreeSpot[] = [];
  rocks: { x: number; z: number }[] = [];
  bankChest = { x: BANK_CHEST.x, z: BANK_CHEST.z };
  range = { x: RANGE.x, z: RANGE.z };
  group = new THREE.Group();
  water!: THREE.Mesh;
  clickTargets: THREE.Object3D[] = [];

  constructor() {
    this.generate();
    this.decorate();
    this.build();
  }

  tile(x: number, z: number): Tile | undefined {
    return this.tiles[x]?.[z];
  }

  walkable(x: number, z: number): boolean {
    return this.tile(x, z)?.walkable ?? false;
  }

  // Nearest water tile of the given types that has at least one walkable
  // neighbour to stand on — i.e. somewhere you can actually fish.
  findFishableWater(types: TileType[], near: { x: number; z: number }): { x: number; z: number } {
    let best = near;
    let bestDist = Infinity;
    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        if (!types.includes(this.tiles[x][z].type)) continue;
        let hasBank = false;
        for (let dx = -1; dx <= 1 && !hasBank; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (this.walkable(x + dx, z + dz)) { hasBank = true; break; }
          }
        }
        if (!hasBank) continue;
        const d = (x - near.x) ** 2 + (z - near.z) ** 2;
        if (d < bestDist) { bestDist = d; best = { x, z }; }
      }
    }
    return best;
  }

  private generate(): void {
    // Pass 1: classify every tile from zone rules.
    for (let x = 0; x < SIZE; x++) {
      this.tiles[x] = [];
      for (let z = 0; z < SIZE; z++) {
        let type: TileType;
        if (isDockPier(x, z)) {
          // Dock piers sit inside the bay bounds, so check before inBay.
          type = 'dock';
        } else if (inBay(x, z)) {
          type = 'ocean';
        } else {
          const nx = (x - ISLAND.cx + 0.5) / ISLAND.rx;
          const nz = (z - ISLAND.cz + 0.5) / ISLAND.rz;
          const d = nx * nx + nz * nz + (hash(x, z) - 0.5) * 0.07;
          if (d >= 1) {
            type = 'ocean';
          } else if (inBridge(x, z)) {
            type = 'bridge';
          } else if (isRiverTile(x, z)) {
            type = 'river';
          } else if (isMarketStreet(x, z)) {
            type = 'path';
          } else {
            type = d > 0.8 ? 'sand' : 'grass';
          }
        }
        this.tiles[x][z] = {
          x, z, type,
          walkable: type === 'grass' || type === 'sand' || type === 'bridge'
                 || type === 'path' || type === 'dock',
        };
      }
    }

    // Pass 2: grass adjacent to ocean (including bay) becomes sand (beach ring).
    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        if (this.tiles[x][z].type !== 'grass') continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (this.tiles[x + dx]?.[z + dz]?.type === 'ocean') {
            this.tiles[x][z].type = 'sand';
            break;
          }
        }
      }
    }
  }

  private decorate(): void {
    this.tiles[BANK_CHEST.x][BANK_CHEST.z].walkable = false;
    this.tiles[RANGE.x][RANGE.z].walkable = false;

    for (let x = 0; x < SIZE; x++) {
      for (let z = 0; z < SIZE; z++) {
        const t = this.tiles[x][z];
        if (t.type !== 'grass') continue;
        if (inTown(x, z)) continue; // town plots stay clear

        const h = hash(x * 3 + 11, z * 5 + 7);
        if (inForest(x, z)) {
          if (h > 0.82) {
            const kind = hash(x * 7 + 1, z * 11 + 3) < 0.3 ? 'oak' : 'tree';
            this.trees.push({ x, z, kind, mesh: new THREE.Group() });
            t.walkable = false;
          }
        } else if (inMineHills(x, z)) {
          if (h < 0.12) {
            this.rocks.push({ x, z });
            t.walkable = false;
          }
        } else if (h > 0.93) {
          // Sparse trees on the rest of the island
          const kind = hash(x * 7 + 1, z * 11 + 3) < 0.3 ? 'oak' : 'tree';
          this.trees.push({ x, z, kind, mesh: new THREE.Group() });
          t.walkable = false;
        }
      }
    }
  }

  private build(): void {
    // One subdivided plane covers the whole island. 2 segments per tile gives
    // interior vertices that carry bilinear-blended colours and heights so tile
    // boundaries fade smoothly instead of snapping. Ocean/river tiles are given
    // sand colour and negative height so they slide below the water plane; the
    // coast therefore dips naturally without any extra geometry.
    const SEGS = SIZE * 2; // 145×145 vertices — cheaper than the old ~84k box verts

    // Precompute colour and height per tile (SIZE+1 to cover the +1 look-up
    // in bilinear sampling without a per-vertex bounds check).
    const STRIDE = SIZE + 1;
    const tileCols = new Array<THREE.Color>(STRIDE * STRIDE);
    const tileHts  = new Float32Array(STRIDE * STRIDE);

    const tileHex = (tx: number, tz: number): number => {
      const t = this.tiles[tx]?.[tz];
      if (!t) return 0xdcc894;
      switch (t.type) {
        case 'grass':  return 0x69a854;
        case 'bridge': return 0xcc3333;
        case 'path':   return 0x8a7a68;
        case 'dock':   return 0x8B5E3C;
        // ocean + river blend as sand so the beach fades naturally into water
        default:       return 0xdcc894;
      }
    };

    for (let tx = 0; tx <= SIZE; tx++) {
      for (let tz = 0; tz <= SIZE; tz++) {
        const si = tx * STRIDE + tz;
        const col = new THREE.Color(tileHex(tx, tz));
        col.offsetHSL(0, 0, (hash(tx * 7 + 3, tz * 13 + 1) - 0.5) * 0.05);
        tileCols[si] = col;
        const t = this.tiles[tx]?.[tz];
        tileHts[si] = (!t || t.type === 'ocean' || t.type === 'river')
          ? -0.45
          : (hash(tx * 3 + 7, tz * 11 + 5) - 0.5) * 0.1;
      }
    }

    // Clamp tile index to [0, SIZE] for edge vertices whose +1 neighbour is
    // outside the grid; reuses the border tile's values harmlessly.
    const ci = (tx: number, tz: number) =>
      Math.min(tx, SIZE) * STRIDE + Math.min(tz, SIZE);

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
    geo.rotateX(-Math.PI / 2); // XY plane → XZ ground plane

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const vertCount = pos.count;
    const vertColors = new Float32Array(vertCount * 3);
    const scratch = new THREE.Color();

    for (let vi = 0; vi < vertCount; vi++) {
      // After rotateX(-PI/2): getX = world X, getZ = world Z, getY = 0.
      const wx = pos.getX(vi);
      const wz = pos.getZ(vi);

      // Fractional position within the tile grid
      const fx = wx + HALF;   // 0 … SIZE
      const fz = wz + HALF;
      const tx = Math.floor(fx);
      const tz = Math.floor(fz);
      const ux = fx - tx;     // 0 … 1 within the tile
      const uz = fz - tz;

      // Bilinear blend of the four surrounding tiles
      const c00 = tileCols[ci(tx,   tz)];   const h00 = tileHts[ci(tx,   tz)];
      const c10 = tileCols[ci(tx+1, tz)];   const h10 = tileHts[ci(tx+1, tz)];
      const c01 = tileCols[ci(tx,   tz+1)]; const h01 = tileHts[ci(tx,   tz+1)];
      const c11 = tileCols[ci(tx+1, tz+1)]; const h11 = tileHts[ci(tx+1, tz+1)];

      const w00 = (1-ux)*(1-uz), w10 = ux*(1-uz), w01 = (1-ux)*uz, w11 = ux*uz;

      scratch.setRGB(
        c00.r*w00 + c10.r*w10 + c01.r*w01 + c11.r*w11,
        c00.g*w00 + c10.g*w10 + c01.g*w01 + c11.g*w11,
        c00.b*w00 + c10.b*w10 + c01.b*w01 + c11.b*w11,
      ).toArray(vertColors, vi * 3);

      pos.setY(vi, h00*w00 + h10*w10 + h01*w01 + h11*w11);
    }
    pos.needsUpdate = true;

    geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    ground.receiveShadow = true;
    this.group.add(ground);
    this.clickTargets.push(ground);

    const seaFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshLambertMaterial({ color: 0x2c5d7c }),
    );
    seaFloor.rotation.x = -Math.PI / 2;
    seaFloor.position.y = -0.55;
    this.group.add(seaFloor);

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshLambertMaterial({ color: 0x4583c2, transparent: true, opacity: 0.88 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.18;
    this.group.add(this.water);
    this.clickTargets.push(this.water);

    for (const tree of this.trees) {
      tree.mesh = makeTree(toWorld(tree.x, tree.z), hash(tree.x, tree.z), tree.kind);
      this.group.add(tree.mesh);
    }
    for (const { x, z } of this.rocks) this.group.add(makeRock(toWorld(x, z), hash(x, z)));
    this.group.add(makeChest(toWorld(this.bankChest.x, this.bankChest.z)));
    this.group.add(makeRange(toWorld(this.range.x, this.range.z)));
  }
}

function makeChest(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.4, 0.45),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b }),
  );
  base.position.y = 0.2;
  base.castShadow = true;
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.66, 0.18, 0.49),
    new THREE.MeshLambertMaterial({ color: 0x9c6a34 }),
  );
  lid.position.y = 0.46;
  lid.castShadow = true;
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.56, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xd9b14a }),
  );
  strap.position.y = 0.28;
  g.add(base, lid, strap);
  g.position.copy(at);
  g.rotation.y = 0.4;
  return g;
}

function makeRange(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6f6b66 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 0.7), stoneMat);
  body.position.y = 0.33;
  body.castShadow = true;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.08, 0.76),
    new THREE.MeshLambertMaterial({ color: 0x57534e }),
  );
  slab.position.y = 0.69;
  slab.castShadow = true;
  const fire = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xff7a22 }),
  );
  fire.position.set(0, 0.3, 0.36);
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0x57534e }),
  );
  chimney.position.set(0.26, 0.9, -0.18);
  chimney.castShadow = true;
  g.add(body, slab, fire, chimney);
  g.position.copy(at);
  g.rotation.y = -0.5;
  return g;
}

function makeTree(at: THREE.Vector3, r: number, kind: 'tree' | 'oak' = 'tree'): THREE.Group {
  const g = new THREE.Group();
  const isOak = kind === 'oak';
  const trunkRadiusTop = isOak ? 0.09 * 1.25 : 0.09;
  const trunkRadiusBot = isOak ? 0.14 * 1.25 : 0.14;
  const leafColor = isOak ? 0x3d6e31 : 0x4d8a3d;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkRadiusTop, trunkRadiusBot, 0.75, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  );
  trunk.position.y = 0.38;
  trunk.castShadow = true;

  const leafMat = new THREE.MeshLambertMaterial({ color: leafColor });
  const lower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), leafMat);
  lower.position.y = 1.05;
  lower.scale.y = 0.85;
  lower.castShadow = true;
  const upper = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), leafMat);
  upper.position.y = 1.5;
  upper.castShadow = true;

  const canopy = new THREE.Group();
  canopy.name = 'canopy';
  canopy.add(lower, upper);

  g.add(trunk, canopy);
  g.position.copy(at);
  g.rotation.y = r * Math.PI * 2;
  const baseScale = isOak ? (0.85 + r * 0.35) * 1.2 : 0.85 + r * 0.35;
  g.scale.setScalar(baseScale);
  return g;
}

function makeRock(at: THREE.Vector3, r: number): THREE.Mesh {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 0),
    new THREE.MeshLambertMaterial({ color: 0x8d8d8d }),
  );
  rock.position.set(at.x, 0.16, at.z);
  rock.rotation.set(r * 3, r * 7, r * 5);
  rock.scale.set(1 + r * 0.5, 0.7 + r * 0.4, 1 + ((r * 13) % 1) * 0.4);
  rock.castShadow = true;
  return rock;
}
