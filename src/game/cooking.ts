import { Player } from './player';
import { Skill } from './skills';
import { Inventory, ITEMS } from './inventory';
import type { Pt } from './pathfinding';

interface Recipe {
  cooked: string;
  level: number;
  xp: number;
  // Burn chance falls linearly from 55% at the required level to 0% here.
  stopBurn: number;
}

export const RECIPES: Record<string, Recipe> = {
  raw_shrimp: { cooked: 'shrimp', level: 1, xp: 30, stopBurn: 34 },
  raw_sardine: { cooked: 'sardine', level: 1, xp: 40, stopBurn: 38 },
  raw_trout: { cooked: 'trout', level: 15, xp: 70, stopBurn: 50 },
  raw_lobster: { cooked: 'lobster', level: 40, xp: 120, stopBurn: 74 },
};

export class CookingSystem {
  active = false;
  private at: Pt = { x: 0, z: 0 };
  private ticks = 0;

  constructor(
    private player: Player,
    private skill: Skill,
    private inventory: Inventory,
    private log: (msg: string) => void,
  ) {}

  start(at: Pt): void {
    if (!this.inventory.slots.some((id) => id && RECIPES[id])) {
      this.log('You have nothing to cook.');
      return;
    }
    this.active = true;
    this.at = at;
    this.ticks = 0;
    this.player.state = 'cook';
    this.player.faceToward(at.x, at.z);
    this.log('You begin cooking over the range.');
  }

  stop(): void {
    if (this.active) this.player.state = 'idle';
    this.active = false;
  }

  onTick(): void {
    if (!this.active) return;
    const dx = Math.abs(this.player.tile.x - this.at.x);
    const dz = Math.abs(this.player.tile.z - this.at.z);
    if (Math.max(dx, dz) > 1) {
      this.stop();
      return;
    }
    this.ticks++;
    // One fish on the fire every 4 ticks, like an OSRS range.
    if (this.ticks % 4 !== 0) return;

    const level = this.skill.level;
    const index = this.inventory.slots.findIndex(
      (id) => id !== null && RECIPES[id] !== undefined && level >= RECIPES[id].level,
    );
    if (index === -1) {
      const rawLeft = this.inventory.slots.some((id) => id && RECIPES[id]);
      this.log(
        rawLeft
          ? 'You need a higher Cooking level for the rest of these fish.'
          : 'You have run out of raw fish to cook.',
      );
      this.stop();
      return;
    }

    const recipe = RECIPES[this.inventory.slots[index]!];
    const cookedName = ITEMS[recipe.cooked].name.toLowerCase();
    const span = Math.max(1, recipe.stopBurn - recipe.level);
    const burnChance = Math.max(0, 0.55 * (recipe.stopBurn - level) / span);
    if (Math.random() < burnChance) {
      this.inventory.set(index, 'burnt_fish');
      this.log(`You accidentally burn the ${cookedName}.`);
    } else {
      this.inventory.set(index, recipe.cooked);
      this.log(`You cook a ${cookedName}.`);
      this.skill.addXp(recipe.xp);
    }
  }
}
