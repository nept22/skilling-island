// OSRS experience curve: reaching level n costs floor(n + 300 * 2^(n/7))
// points, and total xp is the running sum divided by 4. Sanity anchors:
// level 2 = 83 xp, level 99 = 13,034,431 xp.
const XP_TABLE: number[] = [0, 0];
{
  let points = 0;
  for (let n = 1; n < 99; n++) {
    points += Math.floor(n + 300 * Math.pow(2, n / 7));
    XP_TABLE.push(Math.floor(points / 4));
  }
}

export const MAX_LEVEL = 99;

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.min(Math.max(level, 1), MAX_LEVEL)];
}

export class Skill {
  xp = 0;
  onChange: (skill: Skill) => void = () => {};
  onXpGain: (amount: number) => void = () => {};
  onLevelUp: (skill: Skill, level: number) => void = () => {};

  constructor(public readonly name: string) {}

  get level(): number {
    let l = 1;
    while (l < MAX_LEVEL && this.xp >= XP_TABLE[l + 1]) l++;
    return l;
  }

  get progress(): number {
    const l = this.level;
    if (l >= MAX_LEVEL) return 1;
    const lo = XP_TABLE[l];
    const hi = XP_TABLE[l + 1];
    return (this.xp - lo) / (hi - lo);
  }

  addXp(amount: number): void {
    const before = this.level;
    this.xp += amount;
    this.onXpGain(amount);
    this.onChange(this);
    if (this.level > before) this.onLevelUp(this, this.level);
  }
}
