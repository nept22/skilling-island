import * as THREE from 'three';
import './styles.css';
import { World } from './game/world';
import { updateTicks, onTick, tickAlpha } from './game/ticks';
import { Player } from './game/player';
import { CameraRig } from './game/camera';
import { Input, Interactable } from './game/input';
import { Skill } from './game/skills';
import { Inventory } from './game/inventory';
import { FishingSystem, createSpots } from './game/fishing';
import { CookingSystem } from './game/cooking';
import { WoodcuttingSystem } from './game/woodcutting';
import { Bank } from './game/bank';
import { Hud } from './ui/hud';
import { PixelRenderer } from './render/pixel';
import { toonify } from './render/toon';
import { loadBuilding } from './game/buildings';
import { initBuildingEditor, PlacedBuilding } from './game/buildingEditor';

const SAVE_KEY = 'skilling-island-save-v1';
const LAYOUT_KEY = 'skilling-island-layout-v1';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app')!.appendChild(renderer.domElement);

// Pixel post-processing — the Webfishing look. Press P in-game to toggle.
const pixel = new PixelRenderer(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec7e8);

scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x8a9a78, 0.9));
const sun = new THREE.DirectionalLight(0xfff1da, 1.6);
sun.position.set(18, 32, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0004;
scene.add(sun);

const world = new World();
scene.add(world.group);
toonify(world.group);

// Loaded buildings are collected so the editor can select and drag them.
const placedBuildings: PlacedBuilding[] = [];

// Default placements — overridden by saved positions if present.
const defaultPlacements = [
  {
    "file": "/models/buildings/shop.glb",
    "x": 14,
    "z": 17,
    "rotationY": -1.5707963267948966
  }
];

const player = new Player();
scene.add(player.group);
toonify(player.group);

const skills = {
  fishing: new Skill('Fishing'),
  cooking: new Skill('Cooking'),
  woodcutting: new Skill('Woodcutting'),
};
const inventory = new Inventory();
const bank = new Bank();
const hud = new Hud([skills.fishing, skills.cooking, skills.woodcutting], bank, inventory);

type BuildingEntry = { file: string; x: number; z: number; rotationY?: number };

interface SaveData {
  xp?: number; // legacy single-skill saves
  skills?: Record<string, number>;
  slots?: (string | null)[];
  bank?: Record<string, number>;
  buildings?: BuildingEntry[]; // legacy — migrated to LAYOUT_KEY on first load
}

let savedBuildingPlacements: BuildingEntry[] | undefined;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const save = JSON.parse(raw) as SaveData;
    skills.fishing.xp = save.skills?.fishing ?? save.xp ?? 0;
    skills.cooking.xp = save.skills?.cooking ?? 0;
    skills.woodcutting.xp = save.skills?.woodcutting ?? 0;
    bank.items = save.bank ?? {};
    if (Array.isArray(save.slots)) {
      inventory.slots = inventory.slots.map((_, i) => save.slots?.[i] ?? null);
    }
    // One-time migration: move buildings out of the player save.
    if (Array.isArray(save.buildings) && !localStorage.getItem(LAYOUT_KEY)) {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(save.buildings));
    }
  }
} catch {
  // Corrupt save — start fresh.
}
try {
  const layoutRaw = localStorage.getItem(LAYOUT_KEY);
  if (layoutRaw) savedBuildingPlacements = JSON.parse(layoutRaw) as BuildingEntry[];
} catch {
  // Corrupt layout — fall back to defaults.
}

// Merge saved positions over defaults (matched by file path).
const buildingPlacements = defaultPlacements.map((def) => {
  const saved = savedBuildingPlacements?.find((s) => s.file === def.file);
  return saved ?? def;
});
for (const p of buildingPlacements) {
  void loadBuilding(scene, p).then((b) => { if (b) placedBuildings.push(b); });
}

const persist = () =>
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      skills: { fishing: skills.fishing.xp, cooking: skills.cooking.xp, woodcutting: skills.woodcutting.xp },
      slots: inventory.slots,
      bank: bank.items,
    }),
  );

const persistLayout = () =>
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(placedBuildings.map((b) => b.placement)));

for (const skill of Object.values(skills)) {
  skill.onChange = (s) => {
    hud.setSkill(s);
    persist();
  };
  skill.onXpGain = (amount) => hud.xpDrop(skill.name, amount);
  skill.onLevelUp = (s, lvl) => hud.toast(`Congratulations! Your ${s.name} level is now ${lvl}.`);
}
inventory.onChange = (inv) => {
  hud.renderInventory(inv);
  persist();
};
bank.onChange = () => {
  hud.renderBank();
  persist();
};

const spots = createSpots(world);
for (const s of spots) scene.add(s.mesh);

const log = (msg: string) => hud.log(msg);
const fishing = new FishingSystem(player, skills.fishing, inventory, log);
const cooking = new CookingSystem(player, skills.cooking, inventory, log);
const woodcutting = new WoodcuttingSystem(player, skills.woodcutting, inventory, log, world.trees);

const interactables: Interactable[] = [
  ...spots.map((s) => ({ x: s.x, z: s.z, name: s.name, act: () => fishing.start(s) })),
  { ...world.bankChest, name: 'Bank chest', act: () => hud.openBank() },
  { ...world.range, name: 'Cooking range', act: () => cooking.start(world.range) },
  ...world.trees.map((t) => ({
    x: t.x,
    z: t.z,
    name: t.kind === 'oak' ? 'Oak tree' : 'Tree',
    act: () => woodcutting.start(t),
  })),
];

const stopActions = () => {
  fishing.stop();
  cooking.stop();
  woodcutting.stop();
  hud.closeBank();
};

const rig = new CameraRig(window.innerWidth / window.innerHeight);
const input = new Input(
  renderer.domElement,
  rig,
  scene,
  world,
  player,
  interactables,
  stopActions,
  log,
);

// Building drag editor — Shift+E to toggle, Escape to exit.
// Buildings are pushed into placedBuildings as their GLBs resolve.
initBuildingEditor(scene, rig.camera, renderer, placedBuildings, persistLayout);

onTick(() => player.onTick());
onTick(() => fishing.onTick());
onTick(() => cooking.onTick());
onTick(() => woodcutting.onTick());
onTick(() => {
  // Wandering off closes the bank, OSRS-style.
  const dx = Math.abs(player.tile.x - world.bankChest.x);
  const dz = Math.abs(player.tile.z - world.bankChest.z);
  if (hud.bankOpen && Math.max(dx, dz) > 2) hud.closeBank();
});

hud.setSkill(skills.fishing);
hud.setSkill(skills.cooking);
hud.setSkill(skills.woodcutting);
hud.renderInventory(inventory);
hud.log('Welcome to the island.');

window.addEventListener('resize', () => {
  pixel.setSize(window.innerWidth, window.innerHeight);
  rig.camera.aspect = window.innerWidth / window.innerHeight;
  rig.camera.updateProjectionMatrix();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') pixel.enabled = !pixel.enabled;
  if (e.code === 'KeyT') pixel.styleEnabled = !pixel.styleEnabled;
});

let lastFrame = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  const t = now / 1000;
  updateTicks(performance.now());
  player.updateRender(tickAlpha(), dt);
  input.updateMarkers(dt);
  for (const s of spots) {
    s.mesh.scale.setScalar(1 + 0.1 * Math.sin(t * 2.6 + s.x));
    s.mesh.position.y = -0.12 + 0.02 * Math.sin(t * 1.7 + s.z);
  }
  world.water.position.y = -0.18 + 0.015 * Math.sin(t * 0.8);
  rig.update(dt, player.group.position);
  pixel.render(scene, rig.camera);
});

if (import.meta.env.DEV) {
  // Debug handle for the console and automated testing.
  (window as unknown as Record<string, unknown>).__game = {
    world,
    player,
    skills,
    inventory,
    bank,
    fishing,
    cooking,
    woodcutting,
    spots,
    input,
    hud,
    pixel,
  };
}
