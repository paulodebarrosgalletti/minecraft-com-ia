// Item registry: block items + standalone items, tools, food, fuel, smelting.
import { BLOCKS, B, Category, ToolType } from './blocks';

export interface ToolInfo {
  type: Exclude<ToolType, null>;
  material: string;
  level: number; // 1 wood, 2 stone, 3 iron, 4 diamond
  speed: number;
  damage: number;
  durability: number;
}

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  maxStack: number;
  isBlock: boolean;
  category: Category;
  tool?: ToolInfo;
  food?: { hunger: number; saturation: number };
  fuel?: number; // seconds of burn time
  smelt?: number; // result item id
  hidden?: boolean;
  desc?: string;
}

export interface ItemStack {
  id: number;
  count: number;
  dmg?: number; // damage taken (tools)
}

export const ITEMS: (ItemDef | undefined)[] = [];

for (const b of BLOCKS) {
  if (!b) continue;
  ITEMS[b.id] = {
    id: b.id, key: b.key, name: b.name, maxStack: b.id === B.BED || b.id === B.OAK_DOOR ? 16 : 64, isBlock: true,
    category: b.category, hidden: b.hidden,
  };
}

export const I = {
  STICK: 256, COAL: 257, RAW_IRON: 258, IRON_INGOT: 259, RAW_GOLD: 260, GOLD_INGOT: 261, DIAMOND: 262,
  RAW_COPPER: 263, COPPER_INGOT: 264, REDSTONE: 265, APPLE: 266, BEEF: 267, COOKED_BEEF: 268, PORKCHOP: 269,
  COOKED_PORKCHOP: 270, CHICKEN: 271, COOKED_CHICKEN: 272, MUTTON: 273, COOKED_MUTTON: 274, LEATHER: 275,
  FEATHER: 276, ROTTEN_FLESH: 277, BONE: 278, ARROW: 279, STRING: 280, GUNPOWDER: 281, BOWL: 282,
  MUSHROOM_STEW: 283, FLINT: 284, CHARCOAL: 285, BREAD: 286, BRICK: 287, CLAY_BALL: 288,
} as const;

function item(id: number, key: string, name: string, extra: Partial<ItemDef> = {}): void {
  ITEMS[id] = { id, key, name, maxStack: 64, isBlock: false, category: 'materials', ...extra };
}

item(I.STICK, 'stick', 'Graveto', { fuel: 5 });
item(I.COAL, 'coal', 'Carvão', { fuel: 80 });
item(I.CHARCOAL, 'charcoal', 'Carvão Vegetal', { fuel: 80 });
item(I.RAW_IRON, 'raw_iron', 'Ferro Bruto', { smelt: I.IRON_INGOT });
item(I.IRON_INGOT, 'iron_ingot', 'Lingote de Ferro');
item(I.RAW_GOLD, 'raw_gold', 'Ouro Bruto', { smelt: I.GOLD_INGOT });
item(I.GOLD_INGOT, 'gold_ingot', 'Lingote de Ouro');
item(I.RAW_COPPER, 'raw_copper', 'Cobre Bruto', { smelt: I.COPPER_INGOT });
item(I.COPPER_INGOT, 'copper_ingot', 'Lingote de Cobre');
item(I.DIAMOND, 'diamond', 'Diamante');
item(I.REDSTONE, 'redstone', 'Pó de Redstone');
item(I.APPLE, 'apple', 'Maçã', { category: 'food', food: { hunger: 4, saturation: 2.4 } });
item(I.BEEF, 'beef', 'Carne Crua', { category: 'food', food: { hunger: 3, saturation: 1.8 }, smelt: I.COOKED_BEEF });
item(I.COOKED_BEEF, 'cooked_beef', 'Bife', { category: 'food', food: { hunger: 8, saturation: 12.8 } });
item(I.PORKCHOP, 'porkchop', 'Costeleta Crua', { category: 'food', food: { hunger: 3, saturation: 1.8 }, smelt: I.COOKED_PORKCHOP });
item(I.COOKED_PORKCHOP, 'cooked_porkchop', 'Costeleta Cozida', { category: 'food', food: { hunger: 8, saturation: 12.8 } });
item(I.CHICKEN, 'chicken', 'Frango Cru', { category: 'food', food: { hunger: 2, saturation: 1.2 }, smelt: I.COOKED_CHICKEN });
item(I.COOKED_CHICKEN, 'cooked_chicken', 'Frango Assado', { category: 'food', food: { hunger: 6, saturation: 7.2 } });
item(I.MUTTON, 'mutton', 'Carneiro Cru', { category: 'food', food: { hunger: 2, saturation: 1.2 }, smelt: I.COOKED_MUTTON });
item(I.COOKED_MUTTON, 'cooked_mutton', 'Carneiro Assado', { category: 'food', food: { hunger: 6, saturation: 9.6 } });
item(I.BREAD, 'bread', 'Pão', { category: 'food', food: { hunger: 5, saturation: 6 } });
item(I.ROTTEN_FLESH, 'rotten_flesh', 'Carne Podre', { category: 'food', food: { hunger: 4, saturation: 0.8 } });
item(I.MUSHROOM_STEW, 'mushroom_stew', 'Ensopado de Cogumelos', { category: 'food', food: { hunger: 6, saturation: 7.2 }, maxStack: 1 });
item(I.LEATHER, 'leather', 'Couro');
item(I.FEATHER, 'feather', 'Pena');
item(I.BONE, 'bone', 'Osso');
item(I.ARROW, 'arrow', 'Flecha');
item(I.STRING, 'string', 'Linha');
item(I.GUNPOWDER, 'gunpowder', 'Pólvora');
item(I.BOWL, 'bowl', 'Tigela', { fuel: 5 });
item(I.FLINT, 'flint', 'Sílex');
item(I.CLAY_BALL, 'clay_ball', 'Bola de Argila', { smelt: I.BRICK });
item(I.BRICK, 'brick', 'Tijolo');

// Tools ---------------------------------------------------------------
export const TOOL_MATERIALS = [
  { key: 'wooden', name: 'Madeira', level: 1, speed: 2, durability: 59, dmg: 0, color: '#9c7a45' },
  { key: 'stone', name: 'Pedra', level: 2, speed: 4, durability: 131, dmg: 1, color: '#8a8a8a' },
  { key: 'iron', name: 'Ferro', level: 3, speed: 6, durability: 250, dmg: 2, color: '#e2e2e2' },
  { key: 'golden', name: 'Ouro', level: 1, speed: 12, durability: 32, dmg: 0, color: '#f7d54a' },
  { key: 'diamond', name: 'Diamante', level: 4, speed: 8, durability: 1561, dmg: 3, color: '#4de8d8' },
];
export const TOOL_TYPES: { type: Exclude<ToolType, null>; name: string; baseDmg: number }[] = [
  { type: 'pickaxe', name: 'Picareta', baseDmg: 2 },
  { type: 'axe', name: 'Machado', baseDmg: 3 },
  { type: 'shovel', name: 'Pá', baseDmg: 1.5 },
  { type: 'sword', name: 'Espada', baseDmg: 4 },
];

export function toolId(material: string, type: string): number {
  const mi = TOOL_MATERIALS.findIndex((m) => m.key === material);
  const ti = TOOL_TYPES.findIndex((t) => t.type === type);
  return 300 + mi * 4 + ti;
}

TOOL_MATERIALS.forEach((m, mi) => {
  TOOL_TYPES.forEach((t, ti) => {
    const id = 300 + mi * 4 + ti;
    ITEMS[id] = {
      id, key: `${m.key}_${t.type}`, name: `${t.name} de ${m.name}`, maxStack: 1, isBlock: false, category: 'tools',
      tool: { type: t.type, material: m.key, level: m.level, speed: m.speed, damage: t.baseDmg + m.dmg + (t.type === 'sword' ? 0 : 0), durability: m.durability },
      fuel: m.key === 'wooden' ? 10 : undefined,
    };
  });
});

// Fuel & smelting for blocks
const setFuel = (id: number, s: number) => { ITEMS[id]!.fuel = s; };
[B.OAK_LOG, B.BIRCH_LOG, B.SPRUCE_LOG].forEach((id) => { setFuel(id, 15); ITEMS[id]!.smelt = I.CHARCOAL; });
[B.OAK_PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.CRAFTING_TABLE, B.CHEST, B.BOOKSHELF, B.OAK_STAIRS].forEach((id) => setFuel(id, 15));
[B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.OAK_SLAB].forEach((id) => setFuel(id, 5));
setFuel(B.COAL_BLOCK, 800);
ITEMS[B.SAND]!.smelt = B.GLASS;
ITEMS[B.COBBLE]!.smelt = B.STONE;
ITEMS[B.IRON_ORE]!.smelt = I.IRON_INGOT;
ITEMS[B.GOLD_ORE]!.smelt = I.GOLD_INGOT;
ITEMS[B.CLAY]!.smelt = I.BRICK;

export function itemDef(id: number): ItemDef {
  return ITEMS[id] ?? ITEMS[0]!;
}

export function maxStack(id: number): number {
  return itemDef(id).maxStack;
}

export function allItemIds(): number[] {
  const out: number[] = [];
  ITEMS.forEach((d, i) => { if (d && i !== 0 && !d.hidden) out.push(i); });
  return out;
}
