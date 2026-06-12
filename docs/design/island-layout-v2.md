# Island layout v2 — river-mouth market town

Design spec for the terrain redesign. Builder session: implement in the order listed
at the bottom. Coordinates are tile coords on the new 72×72 grid (x → east, z → south).

## Vision

An East-Asian (China/Japan) inspired fishing village at the mouth of the river, where
it empties into a southern bay. Fish markets, docks, an arched red bridge. The rest of
the island stays natural: forest on the west bank, mine hills in the northeast, beaches
ringing the coast. Future zones (mountains/bamboo at the river source) expand the map
north later — keep the layout zone-based so growing `SIZE` is additive, not a rewrite.

## Map size

- `SIZE`: 48 → **72**. Tile scale unchanged (1 unit per tile).
- Ocean/water planes and camera bounds scale accordingly.

## Zones

| Zone | Tiles (x, z) | Notes |
|---|---|---|
| Island landmass | roughly elliptical, center (36, 37), radii ~26 × 25 | organic coast, beach ring 2–3 tiles |
| Bay | x 26–50, z 52–64 | southern notch in the coast; wide beach on its shore |
| River | source (38, 0) → mouth (32–42, 52) | width 2–3, winds (see centerline below), widens to a ~6-wide delta at the bay |
| Bridge | x 33–39, z 39–40 | red arched bridge, walkable, the landmark |
| Market town | x 40–56, z 34–52 | east bank of the river mouth, faces the bay |
| Forest | x 12–30, z 18–46 | west bank, woodcutting (existing tree logic) |
| Mine hills | x 50–64, z 10–24 | keep existing rock spawns here, future mining |

River centerline (interpolate smoothly between): (38, 0) → (34, 20) → (37, 32) →
(36, 40 — bridge) → (33, 48) → delta x 32–42 at z 52 into the bay.

## Town rough-out (so models can be filled in)

The town is plots first, models later. Reserve these, all walkable except building
footprints:

- **Plaza** ~(44–48, 38–42): relocate the bank chest and cooking range here.
- **Market street** along the bay shore, z 50–52, x 40–54: a `path`-tile street with
  4–5 stall plots (3×2 tiles each) facing the water — fish market stalls.
- **Docks**: three piers of `dock` tiles from the shore (z 52) into the bay, at
  x ≈ 41, 45, 49, length 5–6 tiles. Walkable; fishing works from dock tiles.
- **Building plots** (footprints unwalkable once a model is placed): fish-market hall
  (4×3) at the street's center, the existing `shop.glb` (3×3) near the plaza,
  2–3 house plots (3×3) on the town's north side, gate/torii plot at the bridge's
  east end (39–40, 39).

## New tile types

- `path` — stone/dirt road, walkable. Town streets, later inter-zone roads.
- `dock` — wooden planks over water, walkable, counts as a bank for fishing
  (adjacent water is fishable).

## Organic look (separate pass, after layout works)

Replace the per-tile `BoxGeometry` ground in `world.ts build()` with:

1. One subdivided plane over the landmass (2–4 verts per tile).
2. Vertex colors sampled from tile types, **blended** across boundaries (grass fades
   into sand into the waterline) instead of one flat color per tile.
3. Slight height noise on land (±0.05–0.1) — visual only; gameplay stays flat, all
   pathfinding/walkability untouched.
4. Smooth normals; coast dips gently below water level instead of a cube step.
5. Keep the merged mesh as the single `clickTargets` ground entry — raycast →
   `toGrid` must behave exactly as before.

## Implementation order (builder)

1. `SIZE = 72`; extract the layout into a `src/game/layout.ts` module (zone data from
   the tables above) and rewrite `World.generate()` to read zones instead of inline math.
2. Re-point town POIs: bank chest, range, TOWN clearing → plaza coords above.
3. Add `path` + `dock` tile types; lay the market street and the three dock piers;
   make fishing accept dock tiles as a bank.
4. Verify: pathfinding across the bridge and docks, fishing from a dock, woodcutting
   in the west forest, no trees inside town/street/plots.
5. Organic ground pass (section above) — only after 1–4 are verified.

A rendered map of this layout was shared in the design session (2026-06-12).
