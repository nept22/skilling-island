# Skilling Island (working title)

An OSRS-inspired browser skilling game: a small town on an island with a river,
surrounded by ocean. Pure skilling, 600ms ticks, and eventually a player-driven
economy. Built with Three.js + TypeScript + Vite.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173. Build for release with `npm run build`
(output in `dist/` — drag that folder into Netlify Drop to put it online).

## Controls

- Click the ground to walk (yellow marker), click rippling water to fish (red marker)
- Q / E or arrow keys — rotate the camera in 90° steps
- Scroll wheel — zoom

## What works today

- 48x48 tile island: town clearing, river, bridge, beaches, trees, a future mine site
- OSRS-style 600ms tick loop; walking is 1 tile per tick with click-to-move pathfinding
- Pixel rendering: scene is drawn at a low internal resolution then upscaled with
  nearest-neighbour filtering for a chunky pixel look (press P to toggle). All lit
  materials use toon (banded) shading with a 4-step gradient map. The blit pass adds
  posterized color with 4×4 Bayer ordered dithering in low-res pixel space so the
  dither dots align with the chunky pixels (press T to toggle the style pass)
- Fishing at two spots (river: shrimp/trout, sea: sardine/lobster) with the real
  OSRS xp curve, level-ups, an inventory (28 slots, naturally), and xp drops
- Bank chest in town: items store as stacks; click stacks to withdraw, click
  inventory to deposit, or hit Deposit all. Walking away closes it
- Cooking range next to the chest: raw fish cook one per 4 ticks, burn chance
  falls from 55% at the required level to 0% at the stop-burn level
  (shrimp 34, sardine 38, trout 50, lobster 74)
- Woodcutting: click any tree to chop logs (regular trees from level 1, oaks from
  level 15); trees can fall leaving a stump and regrow after a delay
- Progress saves to localStorage automatically (key `skilling-island-save-v1`;
  delete it in DevTools > Application to reset)

## Where things live

| File | What it owns |
| --- | --- |
| `src/main.ts` | Boots everything: renderer, lights, game loop, saving |
| `src/game/ticks.ts` | The 600ms tick scheduler |
| `src/game/world.ts` | Island generation and meshes (tiles, water, trees, rocks) |
| `src/game/pathfinding.ts` | Click-to-move BFS pathfinding |
| `src/game/player.ts` | Player movement, placeholder model, glTF loading |
| `src/game/camera.ts` | The fixed-angle OSRS camera rig |
| `src/game/input.ts` | Mouse/keyboard: raycasting clicks onto tiles |
| `src/game/skills.ts` | XP table (real OSRS curve) and skill levels |
| `src/game/inventory.ts` | Items and the 28-slot inventory |
| `src/game/fishing.ts` | Fishing spots and the catch loop |
| `src/game/cooking.ts` | Recipes, burn chances, the cooking loop |
| `src/game/bank.ts` | Bank stacks: deposit/withdraw logic |
| `src/ui/hud.ts` | HTML overlay: skill badge, inventory grid, log, toasts |

## Using your Blender models

Export a glTF Binary (.glb) and drop it in `public/models/` — see the README
there. `player.glb` replaces the placeholder character automatically, including
animation clips named Idle / Walk / Fish.

## Roadmap

1. ~~Bank chest in town (deposit items, bank UI)~~ done
2. ~~Cooking range: raw fish → cooked, burn chance falls with level~~ done
3. Food matters: eating cooked fish buffs gathering speed or luck
4. ~~Woodcutting (two tree tiers, falling/regrowing trees)~~ done — fletching pending (rods, tool handles, crates)
5. Mining + smithing on the north-east hill
6. Magic: enchanting and alchemy
7. Multiplayer (Colyseus server), then the economy
