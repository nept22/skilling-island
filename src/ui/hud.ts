import { Skill, xpForLevel, MAX_LEVEL } from '../game/skills';
import { Inventory, ITEMS, INVENTORY_SIZE } from '../game/inventory';
import { Bank } from '../game/bank';

const FISH_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
<path d="M2.6 12c3.2-4.4 9-4.4 12.4 0-3.4 4.4-9.2 4.4-12.4 0Z"/>
<path d="M14.2 12l6.8-4.6c-.9 3-.9 6.2 0 9.2L14.2 12Z"/>
<circle cx="6.4" cy="11" r="0.9" fill="#1d1812"/>
</svg>`;

const LOG_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
<rect x="3" y="9" width="16" height="6" rx="3"/>
<circle cx="19" cy="12" r="3"/>
</svg>`;

let audio: AudioContext | null = null;

function chime(): void {
  try {
    audio = audio ?? new AudioContext();
    const t0 = audio.currentTime;
    for (const [freq, at] of [[660, 0], [880, 0.13]] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.3);
    }
  } catch {
    // Audio is a nice-to-have; some browsers block it until interaction.
  }
}

function itemIcon(id: string): string {
  const def = ITEMS[id];
  const svg = def.icon === 'log' ? LOG_SVG : FISH_SVG;
  return `<span style="color:${def.color}" title="${def.name}">${svg}</span>`;
}

interface BadgeRefs {
  badge: HTMLElement;
  level: HTMLElement;
  fill: HTMLElement;
  xpText: HTMLElement;
}

export class Hud {
  private root = document.getElementById('hud')!;
  private badges = new Map<string, BadgeRefs>();
  private logBox!: HTMLElement;
  private toasts!: HTMLElement;
  private grid!: HTMLElement;
  private invCount!: HTMLElement;
  private bankPanel!: HTMLElement;
  private bankGrid!: HTMLElement;
  private bankRef: Bank | null = null;

  constructor(
    skills: Skill[],
    private bank: Bank,
    private inventory: Inventory,
  ) {
    const badgeHtml = skills
      .map(
        (s) => `
      <div class="skill-badge panel" data-skill="${s.name}">
        <div class="skill-row"><span>${s.name}</span><span class="skill-level">1</span></div>
        <div class="bar"><div class="fill"></div></div>
        <div class="skill-xp">0 xp</div>
      </div>`,
      )
      .join('');

    this.root.innerHTML = `
      <div id="skills">${badgeHtml}</div>
      <div id="hint">Fish the ripples &middot; bank at the chest &middot; cook at the range &middot; arrows / middle-drag rotate &middot; E editor &middot; scroll zoom</div>
      <div id="toasts"></div>
      <div id="log"></div>
      <div id="bank" class="panel" hidden>
        <div class="bank-head">
          <span>Bank of Skilling Island</span>
          <button class="btn" id="bank-close" aria-label="Close bank">&times;</button>
        </div>
        <div class="bank-grid"></div>
        <div class="bank-foot">
          <span class="bank-tip">Click a stack to withdraw &middot; click inventory to deposit</span>
          <button class="btn" id="deposit-all">Deposit all</button>
        </div>
      </div>
      <div id="inv" class="panel">
        <div class="inv-head">Inventory <span class="inv-count">0/${INVENTORY_SIZE}</span></div>
        <div class="grid"></div>
      </div>
    `;

    for (const s of skills) {
      const badge = this.root.querySelector<HTMLElement>(`[data-skill="${s.name}"]`)!;
      this.badges.set(s.name, {
        badge,
        level: badge.querySelector('.skill-level')!,
        fill: badge.querySelector('.fill')!,
        xpText: badge.querySelector('.skill-xp')!,
      });
    }
    this.logBox = this.root.querySelector('#log')!;
    this.toasts = this.root.querySelector('#toasts')!;
    this.grid = this.root.querySelector('#inv .grid')!;
    this.invCount = this.root.querySelector('.inv-count')!;
    this.bankPanel = this.root.querySelector('#bank')!;
    this.bankGrid = this.root.querySelector('.bank-grid')!;

    this.root.querySelector('#bank-close')!.addEventListener('click', () => this.closeBank());
    this.root.querySelector('#deposit-all')!.addEventListener('click', () => {
      this.bank.depositAll(this.inventory);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.closeBank();
    });
  }

  get bankOpen(): boolean {
    return !this.bankPanel.hidden;
  }

  openBank(): void {
    this.bankRef = this.bank;
    this.bankPanel.hidden = false;
    this.renderBank();
  }

  closeBank(): void {
    this.bankPanel.hidden = true;
  }

  renderBank(): void {
    if (!this.bankRef || !this.bankOpen) return;
    this.bankGrid.innerHTML = '';
    const entries = Object.entries(this.bankRef.items);
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bank-empty';
      empty.textContent = 'Your bank is empty.';
      this.bankGrid.appendChild(empty);
      return;
    }
    for (const [id, count] of entries) {
      const slot = document.createElement('div');
      slot.className = 'slot bank-slot';
      slot.innerHTML = `${itemIcon(id)}<span class="stack-count">${count}</span>`;
      slot.title = `${ITEMS[id].name} × ${count} — click to withdraw 1`;
      slot.addEventListener('click', () => this.bank.withdraw(id, this.inventory));
      this.bankGrid.appendChild(slot);
    }
  }

  setSkill(skill: Skill): void {
    const refs = this.badges.get(skill.name);
    if (!refs) return;
    const lvl = skill.level;
    refs.level.textContent = String(lvl);
    refs.fill.style.width = `${Math.round(skill.progress * 100)}%`;
    refs.xpText.textContent =
      lvl >= MAX_LEVEL
        ? `${skill.xp.toLocaleString()} xp — max level!`
        : `${skill.xp.toLocaleString()} / ${xpForLevel(lvl + 1).toLocaleString()} xp`;
  }

  xpDrop(skillName: string, amount: number): void {
    const refs = this.badges.get(skillName);
    if (!refs) return;
    const el = document.createElement('div');
    el.className = 'xp-drop';
    el.textContent = `+${amount} xp`;
    refs.badge.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  renderInventory(inv: Inventory): void {
    this.invCount.textContent = `${inv.count}/${INVENTORY_SIZE}`;
    this.grid.innerHTML = '';
    inv.slots.forEach((slot, i) => {
      const div = document.createElement('div');
      div.className = 'slot';
      if (slot) {
        div.innerHTML = itemIcon(slot);
        div.classList.add('filled');
        div.addEventListener('click', () => {
          if (this.bankOpen) this.bank.depositSlot(this.inventory, i);
        });
      }
      this.grid.appendChild(div);
    });
  }

  log(msg: string): void {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = msg;
    this.logBox.prepend(line);
    while (this.logBox.children.length > 6) this.logBox.lastChild?.remove();
  }

  toast(msg: string): void {
    chime();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
