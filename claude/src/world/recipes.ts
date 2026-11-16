// Data-driven crafting recipes (shaped + shapeless) and the matcher.
import { B } from './blocks';
import { I, ItemStack, toolId, TOOL_MATERIALS } from './items';

type Ingredient = number | number[];
export interface ShapedRecipe {
  kind: 'shaped';
  pattern: string[];
  key: Record<string, Ingredient>;
  result: ItemStack;
}
export interface ShapelessRecipe {
  kind: 'shapeless';
  ingredients: Ingredient[];
  result: ItemStack;
}
export type Recipe = ShapedRecipe | ShapelessRecipe;

const PLANKS = [B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const LOGS = [B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG];
const COBBLE = [B.COBBLE, B.MOSSY_COBBLE];
const COALS = [I.COAL, I.CHARCOAL];

export const RECIPES: Recipe[] = [];
const shaped = (pattern: string[], key: Record<string, Ingredient>, id: number, count = 1) =>
  RECIPES.push({ kind: 'shaped', pattern, key, result: { id, count } });
const shapeless = (ingredients: Ingredient[], id: number, count = 1) =>
  RECIPES.push({ kind: 'shapeless', ingredients, result: { id, count } });

shapeless([B.OAK_LOG], B.OAK_PLANKS, 4);
shapeless([B.BIRCH_LOG], B.BIRCH_PLANKS, 4);
shapeless([B.SPRUCE_LOG], B.SPRUCE_PLANKS, 4);
shaped(['#', '#'], { '#': PLANKS }, I.STICK, 4);
shaped(['##', '##'], { '#': PLANKS }, B.CRAFTING_TABLE);
shaped(['###', '# #', '###'], { '#': PLANKS }, B.CHEST);
shaped(['###', '# #', '###'], { '#': COBBLE }, B.FURNACE);
shaped(['C', '|'], { C: COALS, '|': I.STICK }, B.TORCH, 4);
shaped(['##', '##', '##'], { '#': PLANKS }, B.OAK_DOOR, 3);
shaped(['###', 'PPP'], { '#': B.WOOL, P: PLANKS }, B.BED);
shaped(['###'], { '#': PLANKS }, B.OAK_SLAB, 6);
shaped(['###'], { '#': [B.STONE_BRICKS, B.STONE] }, B.STONE_SLAB, 6);
shaped(['#  ', '## ', '###'], { '#': PLANKS }, B.OAK_STAIRS, 4);
shaped(['#  ', '## ', '###'], { '#': COBBLE }, B.COBBLE_STAIRS, 4);
shaped(['##', '##'], { '#': B.STONE }, B.STONE_BRICKS, 4);
shaped(['##', '##'], { '#': I.BRICK }, B.BRICKS, 1);
shaped(['##', '##'], { '#': B.SAND }, B.SANDSTONE, 1);
shaped(['##', '##'], { '#': I.STRING }, B.WOOL, 1);
shaped(['###', 'BBB', '###'], { '#': PLANKS, B: I.FEATHER }, B.BOOKSHELF, 1);
shaped(['# #', ' # '], { '#': PLANKS }, I.BOWL, 4);
shapeless([B.BROWN_MUSHROOM, B.RED_MUSHROOM, I.BOWL], I.MUSHROOM_STEW);
shaped(['###', '###', '###'], { '#': I.COAL }, B.COAL_BLOCK);
shaped(['###', '###', '###'], { '#': I.IRON_INGOT }, B.IRON_BLOCK);
shaped(['###', '###', '###'], { '#': I.GOLD_INGOT }, B.GOLD_BLOCK);
shaped(['###', '###', '###'], { '#': I.DIAMOND }, B.DIAMOND_BLOCK);
shapeless([B.COAL_BLOCK], I.COAL, 9);
shapeless([B.IRON_BLOCK], I.IRON_INGOT, 9);
shapeless([B.GOLD_BLOCK], I.GOLD_INGOT, 9);
shapeless([B.DIAMOND_BLOCK], I.DIAMOND, 9);
shaped(['X', '#', '|'], { X: I.FLINT, '#': I.STICK, '|': I.FEATHER }, I.ARROW, 4);

// Tools
const toolMats: Record<string, Ingredient> = {
  wooden: PLANKS, stone: COBBLE, iron: I.IRON_INGOT, golden: I.GOLD_INGOT, diamond: I.DIAMOND,
};
for (const m of TOOL_MATERIALS) {
  const mat = toolMats[m.key];
  shaped(['XXX', ' | ', ' | '], { X: mat, '|': I.STICK }, toolId(m.key, 'pickaxe'));
  shaped(['XX', 'X|', ' |'], { X: mat, '|': I.STICK }, toolId(m.key, 'axe'));
  shaped(['X', '|', '|'], { X: mat, '|': I.STICK }, toolId(m.key, 'shovel'));
  shaped(['X', 'X', '|'], { X: mat, '|': I.STICK }, toolId(m.key, 'sword'));
}

function matches(ing: Ingredient | undefined, id: number | null): boolean {
  if (ing === undefined) return id === null;
  if (id === null) return false;
  return Array.isArray(ing) ? ing.includes(id) : ing === id;
}

/**
 * Finds a recipe for a grid of item ids (null = empty). Grid is size×size row-major.
 */
export function findRecipe(grid: (number | null)[], size: number): Recipe | null {
  // bounding box
  let minX = size, minY = size, maxX = -1, maxY = -1;
  const items: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = grid[y * size + x];
    if (v !== null) {
      items.push(v);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (items.length === 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  for (const r of RECIPES) {
    if (r.kind === 'shapeless') {
      if (r.ingredients.length !== items.length) continue;
      const pool = items.slice();
      let ok = true;
      for (const ing of r.ingredients) {
        const idx = pool.findIndex((p) => matches(ing, p));
        if (idx < 0) { ok = false; break; }
        pool.splice(idx, 1);
      }
      if (ok) return r;
    } else {
      const ph = r.pattern.length, pw = Math.max(...r.pattern.map((p) => p.length));
      if (pw !== w || ph !== h) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
          const px = mirror ? w - 1 - x : x;
          const ch = r.pattern[y][px] ?? ' ';
          const ing = ch === ' ' ? undefined : r.key[ch];
          const id = grid[(y + minY) * size + (x + minX)];
          if (!matches(ing, id)) ok = false;
        }
        if (ok) return r;
      }
    }
  }
  return null;
}

export { LOGS, PLANKS };
