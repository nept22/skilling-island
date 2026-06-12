import { Inventory } from './inventory';

// The bank stores items as stacks, OSRS-style: the inventory is cramped and
// item-per-slot, the bank is roomy and counted.
export class Bank {
  items: Record<string, number> = {};
  onChange: (bank: Bank) => void = () => {};

  depositSlot(inv: Inventory, index: number): void {
    const id = inv.slots[index];
    if (!id) return;
    inv.set(index, null);
    this.items[id] = (this.items[id] ?? 0) + 1;
    this.onChange(this);
  }

  depositAll(inv: Inventory): void {
    let moved = false;
    inv.slots = inv.slots.map((id) => {
      if (!id) return id;
      this.items[id] = (this.items[id] ?? 0) + 1;
      moved = true;
      return null;
    });
    if (moved) {
      inv.onChange(inv);
      this.onChange(this);
    }
  }

  withdraw(id: string, inv: Inventory): void {
    if ((this.items[id] ?? 0) <= 0) return;
    if (!inv.add(id)) return;
    this.items[id]--;
    if (this.items[id] <= 0) delete this.items[id];
    this.onChange(this);
  }
}
