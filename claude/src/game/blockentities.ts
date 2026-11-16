// Block entity state: furnaces (smelting) and chests (storage), persisted by block position.
import type { Slot } from './inventory';
import { itemDef, maxStack } from '../world/items';

export interface FurnaceState {
  input: Slot;
  fuel: Slot;
  output: Slot;
  burn: number;
  burnMax: number;
  cook: number;
}

export const SMELT_TIME = 8; // seconds per item

export function newFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}

export function canSmelt(f: FurnaceState): boolean {
  if (!f.input) return false;
  const res = itemDef(f.input.id).smelt;
  if (res === undefined) return false;
  if (!f.output) return true;
  return f.output.id === res && f.output.count < maxStack(res);
}

/** Advances furnace; returns true while burning. */
export function tickFurnace(f: FurnaceState, dt: number): boolean {
  const smeltable = canSmelt(f);
  if (f.burn <= 0 && smeltable && f.fuel) {
    const fuel = itemDef(f.fuel.id).fuel;
    if (fuel) {
      f.burn = f.burnMax = fuel;
      f.fuel.count--;
      if (f.fuel.count <= 0) f.fuel = null;
    }
  }
  if (f.burn > 0) {
    f.burn -= dt;
    if (smeltable) {
      f.cook += dt;
      if (f.cook >= SMELT_TIME) {
        f.cook = 0;
        const res = itemDef(f.input!.id).smelt!;
        f.input!.count--;
        if (f.input!.count <= 0) f.input = null;
        if (f.output) f.output.count++;
        else f.output = { id: res, count: 1 };
      }
    } else f.cook = 0;
    if (f.burn < 0) f.burn = 0;
  } else if (f.cook > 0) f.cook = Math.max(0, f.cook - dt * 2);
  return f.burn > 0;
}

export function newChest(): Slot[] {
  return new Array(27).fill(null);
}

export function sanitizeSlot(s: any): Slot {
  if (s && typeof s.id === 'number' && typeof s.count === 'number' && s.count > 0) return { id: s.id, count: s.count, dmg: typeof s.dmg === 'number' ? s.dmg : undefined };
  return null;
}
