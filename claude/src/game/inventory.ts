// Inventory data model (hotbar 0-8, main 9-35) and stack helpers.
import { ItemStack, maxStack, itemDef } from '../world/items';

export type Slot = ItemStack | null;

export function cloneStack(s: Slot): Slot {
  return s ? { id: s.id, count: s.count, dmg: s.dmg } : null;
}

export function canMerge(a: Slot, b: Slot): boolean {
  return !!a && !!b && a.id === b.id && !itemDef(a.id).tool && (a.dmg ?? 0) === (b.dmg ?? 0);
}

export class Inventory {
  slots: Slot[];
  selected = 0;
  constructor(size = 36) {
    this.slots = new Array(size).fill(null);
  }

  get held(): Slot { return this.slots[this.selected]; }

  /** Adds a stack; returns leftover count. Fills existing stacks first (hotbar first). */
  add(stack: ItemStack): number {
    let left = stack.count;
    const max = maxStack(stack.id);
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && canMerge(s, stack) && s.count < max) {
        const n = Math.min(left, max - s.count);
        s.count += n; left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, max);
        this.slots[i] = { id: stack.id, count: n, dmg: stack.dmg };
        left -= n;
      }
    }
    return left;
  }

  canAdd(stack: ItemStack): boolean {
    let left = stack.count;
    const max = maxStack(stack.id);
    for (const s of this.slots) {
      if (!s) left -= max;
      else if (canMerge(s, stack)) left -= max - s.count;
      if (left <= 0) return true;
    }
    return left <= 0;
  }

  consumeSelected(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  count(id: number): number {
    return this.slots.reduce((a, s) => a + (s && s.id === id ? s.count : 0), 0);
  }

  clear() { this.slots.fill(null); }

  toJSON(): Slot[] { return this.slots.map(cloneStack); }
  load(data: unknown) {
    this.clear();
    if (!Array.isArray(data)) return;
    data.forEach((s, i) => {
      if (i < this.slots.length && s && typeof s.id === 'number' && typeof s.count === 'number' && s.count > 0) {
        this.slots[i] = { id: s.id, count: s.count, dmg: typeof s.dmg === 'number' ? s.dmg : undefined };
      }
    });
  }
}
