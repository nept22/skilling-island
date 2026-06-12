import { TreeSpot } from './world';
import { Player } from './player';
import { Skill } from './skills';
import { Inventory } from './inventory';

interface KindConfig {
  item: string;
  level: number;
  xp: number;
  fallChance: number;
  respawnTicks: number;
}

const KIND_CONFIG: Record<'tree' | 'oak', KindConfig> = {
  tree: { item: 'logs', level: 1, xp: 25, fallChance: 0.35, respawnTicks: 25 },
  oak:  { item: 'oak_logs', level: 15, xp: 40, fallChance: 0.125, respawnTicks: 50 },
};

interface TreeState {
  alive: boolean;
  respawn: number; // ticks remaining until regrowth (0 when alive)
}

export class WoodcuttingSystem {
  private active: TreeSpot | null = null;
  private ticks = 0;
  private state: Map<TreeSpot, TreeState>;

  constructor(
    private player: Player,
    private skill: Skill,
    private inventory: Inventory,
    private log: (msg: string) => void,
    trees: TreeSpot[],
  ) {
    this.state = new Map(trees.map((t) => [t, { alive: true, respawn: 0 }]));
  }

  start(tree: TreeSpot): void {
    const ts = this.state.get(tree)!;
    if (!ts.alive) {
      this.log('The tree has been chopped down.');
      return;
    }
    if (tree.kind === 'oak' && this.skill.level < 15) {
      this.log('You need a Woodcutting level of 15 to chop this oak.');
      return;
    }
    if (this.inventory.full) {
      this.log('Your inventory is too full to hold any more logs.');
      return;
    }
    this.active = tree;
    this.ticks = 0;
    this.player.state = 'chop';
    this.player.faceToward(tree.x, tree.z);
    this.log('You swing your axe at the tree.');
  }

  stop(): void {
    if (this.active) this.player.state = 'idle';
    this.active = null;
  }

  onTick(): void {
    // Advance respawn countdowns even when not actively chopping.
    for (const [tree, ts] of this.state) {
      if (!ts.alive) {
        ts.respawn--;
        if (ts.respawn <= 0) {
          ts.alive = true;
          tree.mesh.getObjectByName('canopy')!.visible = true;
        }
      }
    }

    const tree = this.active;
    if (!tree) return;

    const dx = Math.abs(this.player.tile.x - tree.x);
    const dz = Math.abs(this.player.tile.z - tree.z);
    if (Math.max(dx, dz) > 1) {
      this.stop();
      return;
    }

    this.ticks++;
    if (this.ticks % 4 !== 0) return;

    const cfg = KIND_CONFIG[tree.kind];
    const level = this.skill.level;
    if (Math.random() > Math.min(0.85, 0.35 + level * 0.008)) return;

    if (!this.inventory.add(cfg.item)) {
      this.log('Your inventory is too full to hold any more logs.');
      this.stop();
      return;
    }
    const logName = tree.kind === 'oak' ? 'some oak logs' : 'some logs';
    this.log(`You get ${logName}.`);
    this.skill.addXp(cfg.xp);

    // Roll for the tree to fall.
    if (Math.random() < cfg.fallChance) {
      tree.mesh.getObjectByName('canopy')!.visible = false;
      const ts = this.state.get(tree)!;
      ts.alive = false;
      ts.respawn = cfg.respawnTicks;
      this.log('The tree falls.');
      this.stop();
    }
  }
}
