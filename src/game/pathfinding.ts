import { SIZE, World } from './world';

export interface Pt {
  x: number;
  z: number;
}

const key = (x: number, z: number) => x * SIZE + z;

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

// BFS over the tile grid, 8-directional with no corner cutting. If the goal
// is unreachable, returns a path to the closest reachable tile instead
// (OSRS-style best effort), so callers must verify arrival themselves.
export function findPath(world: World, start: Pt, target: Pt, adjacentOk = false): Pt[] {
  const goals = new Set<number>();
  if (adjacentOk) {
    for (const [dx, dz] of DIRS) {
      const x = target.x + dx;
      const z = target.z + dz;
      if (world.walkable(x, z)) goals.add(key(x, z));
    }
  } else if (world.walkable(target.x, target.z)) {
    goals.add(key(target.x, target.z));
  }
  if (goals.has(key(start.x, start.z))) return [];

  const cameFrom = new Int32Array(SIZE * SIZE).fill(-1);
  const seen = new Uint8Array(SIZE * SIZE);
  const queue: Pt[] = [start];
  seen[key(start.x, start.z)] = 1;
  let head = 0;
  let best: Pt = start;
  let bestDist = manhattan(start, target);
  let found: Pt | null = null;

  while (head < queue.length) {
    const cur = queue[head++];
    if (goals.has(key(cur.x, cur.z))) {
      found = cur;
      break;
    }
    const d = manhattan(cur, target);
    if (d < bestDist) {
      bestDist = d;
      best = cur;
    }
    for (const [dx, dz] of DIRS) {
      const x = cur.x + dx;
      const z = cur.z + dz;
      if (!world.walkable(x, z) || seen[key(x, z)]) continue;
      if (dx !== 0 && dz !== 0 && !(world.walkable(cur.x + dx, cur.z) && world.walkable(cur.x, cur.z + dz))) {
        continue;
      }
      seen[key(x, z)] = 1;
      cameFrom[key(x, z)] = key(cur.x, cur.z);
      queue.push({ x, z });
    }
  }

  const end = found ?? best;
  const path: Pt[] = [];
  const startKey = key(start.x, start.z);
  let k = key(end.x, end.z);
  while (k !== startKey && k !== -1) {
    path.push({ x: Math.floor(k / SIZE), z: k % SIZE });
    k = cameFrom[k];
  }
  path.reverse();
  return path;
}

function manhattan(a: Pt, b: Pt): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}
