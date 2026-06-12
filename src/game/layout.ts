// Zone definitions for the 72×72 river-mouth market-town island.
// Coordinates are tile coords: x → east, z → south.
// world.ts reads these; nothing else should bake in raw tile numbers.

export const SIZE = 72;
export const HALF = SIZE / 2;

// Island landmass ellipse
export const ISLAND = { cx: 36, cz: 37, rx: 26, rz: 25 } as const;

// Southern bay — ocean notch cut into the south coast
export const BAY = { x0: 26, x1: 50, z0: 52, z1: 64 } as const;

// Red arched bridge over the river
export const BRIDGE = { x0: 33, x1: 39, z0: 39, z1: 40 } as const;

// Zones
export const TOWN      = { x0: 40, x1: 56, z0: 34, z1: 52 } as const;
export const PLAZA     = { x0: 44, x1: 48, z0: 38, z1: 42 } as const;
export const FOREST    = { x0: 12, x1: 30, z0: 18, z1: 46 } as const;
export const MINE_HILLS = { x0: 50, x1: 64, z0: 10, z1: 24 } as const;

// Town POIs — in the plaza
export const BANK_CHEST = { x: 46, z: 40 } as const;
export const RANGE      = { x: 44, z: 40 } as const;

// Market street — path tiles along the bay shore inside the town zone
export const MARKET_STREET = { x0: 40, x1: 54, z0: 50, z1: 51 } as const;

// Three dock piers running south from the shore into the bay
export const DOCK_PIERS = [
  { x: 41, zStart: 52, zEnd: 57 },
  { x: 45, zStart: 52, zEnd: 57 },
  { x: 49, zStart: 52, zEnd: 57 },
] as const;

// River centerline waypoints: source (north) → delta mouth (south)
const RIVER_WP = [
  { x: 38, z: 0 },
  { x: 34, z: 20 },
  { x: 37, z: 32 },
  { x: 36, z: 40 }, // bridge crossing
  { x: 33, z: 48 },
] as const;

const RIVER_HALF_WIDTH = 2.5; // half-width in tiles for the normal stretch

/** River centerline x at a given z, linearly interpolated from waypoints. */
export function riverCenterX(z: number): number {
  if (z <= RIVER_WP[0].z) return RIVER_WP[0].x;
  for (let i = 0; i < RIVER_WP.length - 1; i++) {
    const a = RIVER_WP[i];
    const b = RIVER_WP[i + 1];
    if (z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      return a.x + t * (b.x - a.x);
    }
  }
  return RIVER_WP[RIVER_WP.length - 1].x;
}

export function inBay(x: number, z: number): boolean {
  return x >= BAY.x0 && x <= BAY.x1 && z >= BAY.z0 && z <= BAY.z1;
}

export function inBridge(x: number, z: number): boolean {
  return x >= BRIDGE.x0 && x <= BRIDGE.x1 && z >= BRIDGE.z0 && z <= BRIDGE.z1;
}

/**
 * True if the tile belongs to the river channel.
 * The delta (z 48–51) widens from half-width 2.5 to 5 as it approaches the bay.
 */
export function isRiverTile(x: number, z: number): boolean {
  if (z >= BAY.z0) return false; // bay owns the southern stretch
  if (z < 48) return Math.abs(x - riverCenterX(z)) < RIVER_HALF_WIDTH;
  // Delta zone: lerp centre x 33→37 and half-width 2.5→5 across z 48–52
  const t = (z - 48) / 4;
  const cx = 33 + t * 4;
  const hw = RIVER_HALF_WIDTH + t * (5 - RIVER_HALF_WIDTH);
  return Math.abs(x - cx) < hw;
}

export function inTown(x: number, z: number): boolean {
  return x >= TOWN.x0 && x <= TOWN.x1 && z >= TOWN.z0 && z <= TOWN.z1;
}

export function inForest(x: number, z: number): boolean {
  return x >= FOREST.x0 && x <= FOREST.x1 && z >= FOREST.z0 && z <= FOREST.z1;
}

export function inMineHills(x: number, z: number): boolean {
  return x >= MINE_HILLS.x0 && x <= MINE_HILLS.x1 && z >= MINE_HILLS.z0 && z <= MINE_HILLS.z1;
}

export function isMarketStreet(x: number, z: number): boolean {
  return x >= MARKET_STREET.x0 && x <= MARKET_STREET.x1
      && z >= MARKET_STREET.z0 && z <= MARKET_STREET.z1;
}

export function isDockPier(x: number, z: number): boolean {
  return DOCK_PIERS.some((p) => p.x === x && z >= p.zStart && z <= p.zEnd);
}
