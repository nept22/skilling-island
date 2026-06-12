export interface ItemDef {
  id: string;
  name: string;
  color: string;
  icon?: 'fish' | 'log';
}

export const ITEMS: Record<string, ItemDef> = {
  raw_shrimp: { id: 'raw_shrimp', name: 'Raw shrimp', color: '#e8a07a' },
  raw_sardine: { id: 'raw_sardine', name: 'Raw sardine', color: '#9db4c0' },
  raw_trout: { id: 'raw_trout', name: 'Raw trout', color: '#d49aa7' },
  raw_lobster: { id: 'raw_lobster', name: 'Raw lobster', color: '#c25b3f' },
  shrimp: { id: 'shrimp', name: 'Shrimp', color: '#ff9d72' },
  sardine: { id: 'sardine', name: 'Sardine', color: '#cfe3f0' },
  trout: { id: 'trout', name: 'Trout', color: '#f0b7c4' },
  lobster: { id: 'lobster', name: 'Lobster', color: '#ff6a3d' },
  burnt_fish: { id: 'burnt_fish', name: 'Burnt fish', color: '#3f3a36' },
  logs: { id: 'logs', name: 'Logs', color: '#a07a4a', icon: 'log' },
  oak_logs: { id: 'oak_logs', name: 'Oak logs', color: '#7a5a30', icon: 'log' },
};

export const INVENTORY_SIZE = 28;

export class Inventory {
  slots: (string | null)[] = Array(INVENTORY_SIZE).fill(null);
  onChange: (inv: Inventory) => void = () => {};

  get count(): number {
    return this.slots.filter(Boolean).length;
  }

  get full(): boolean {
    return this.count >= INVENTORY_SIZE;
  }

  add(itemId: string): boolean {
    const i = this.slots.indexOf(null);
    if (i === -1) return false;
    this.slots[i] = itemId;
    this.onChange(this);
    return true;
  }

  set(index: number, itemId: string | null): void {
    this.slots[index] = itemId;
    this.onChange(this);
  }
}
