// Data-driven block registry.

export type Shape = 'cube' | 'cross' | 'torch' | 'slab' | 'stairs' | 'door' | 'bed' | 'water' | 'cactus' | 'none';
export type ToolType = 'pickaxe' | 'axe' | 'shovel' | 'sword' | null;
export type Category = 'building' | 'nature' | 'ores' | 'wood' | 'decoration' | 'tools' | 'utility' | 'food' | 'materials';

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  top: string;
  bottom: string;
  side: string;
  front?: string;
  frontLit?: string;
  shape: Shape;
  /** Physical collision. */
  solid: boolean;
  /** Fully covers neighbours and blocks light. */
  opaque: boolean;
  hardness: number; // seconds-ish (MC hardness)
  tool: ToolType;
  /** Minimum tool level required to get drops (0 = hand). */
  level: number;
  light: number;
  gravity?: boolean;
  tint?: boolean; // biome tinted (grass top / leaves)
  category: Category;
  sound: 'stone' | 'wood' | 'grass' | 'sand' | 'gravel' | 'glass' | 'cloth' | 'snow';
  /** Item dropped; default = itself. -1 = nothing. Function for random drops. */
  drop?: number | ((rnd: () => number) => [number, number][]);
  replaceable?: boolean; // e.g. tall grass, water
  hidden?: boolean; // not in creative inventory
  flammable?: boolean;
}

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, SANDSTONE: 6, GRAVEL: 7, BEDROCK: 8, SNOW: 9,
  WATER: 10, OAK_LOG: 11, OAK_PLANKS: 12, BIRCH_LOG: 13, BIRCH_PLANKS: 14, OAK_LEAVES: 15, BIRCH_LEAVES: 16,
  SPRUCE_LOG: 17, SPRUCE_LEAVES: 18, SPRUCE_PLANKS: 19, COAL_ORE: 20, IRON_ORE: 21, GOLD_ORE: 22,
  DIAMOND_ORE: 23, COPPER_ORE: 24, REDSTONE_ORE: 25, STONE_BRICKS: 26, GLASS: 27, BRICKS: 28, OAK_SLAB: 29,
  OAK_STAIRS: 30, TORCH: 31, CRAFTING_TABLE: 32, FURNACE: 33, CHEST: 34, OAK_DOOR: 35, BED: 36, CACTUS: 37,
  TALL_GRASS: 38, DANDELION: 39, POPPY: 40, OAK_SAPLING: 41, BROWN_MUSHROOM: 42, RED_MUSHROOM: 43, WOOL: 44,
  SNOWY_GRASS: 45, DEAD_BUSH: 46, STONE_SLAB: 47, COBBLE_STAIRS: 48, IRON_BLOCK: 50, GOLD_BLOCK: 51,
  DIAMOND_BLOCK: 52, BOOKSHELF: 53, BIRCH_SAPLING: 54, SPRUCE_SAPLING: 55, COAL_BLOCK: 56, GLOWSTONE: 58,
  MOSSY_COBBLE: 59, CLAY: 60,
} as const;

export const BLOCKS: (BlockDef | undefined)[] = [];

function def(d: Partial<BlockDef> & { id: number; key: string; name: string }): void {
  const tex = (d as any).tex as string | undefined;
  const full: BlockDef = {
    top: tex ?? d.key, bottom: tex ?? d.key, side: tex ?? d.key,
    shape: 'cube', solid: true, opaque: true, hardness: 1, tool: null, level: 0, light: 0,
    category: 'building', sound: 'stone',
    ...d,
  };
  BLOCKS[d.id] = full;
}

type DefIn = Partial<BlockDef> & { id: number; key: string; name: string; tex?: string };
const d = (x: DefIn) => def(x);

d({ id: B.AIR, key: 'air', name: 'Ar', shape: 'none', solid: false, opaque: false, hardness: 0, replaceable: true, hidden: true });
d({ id: B.GRASS, key: 'grass', name: 'Bloco de Grama', top: 'grass_top', bottom: 'dirt', side: 'grass_side', hardness: 0.6, tool: 'shovel', category: 'nature', sound: 'grass', drop: B.DIRT, tint: true });
d({ id: B.DIRT, key: 'dirt', name: 'Terra', tex: 'dirt', hardness: 0.5, tool: 'shovel', category: 'nature', sound: 'gravel' });
d({ id: B.STONE, key: 'stone', name: 'Pedra', tex: 'stone', hardness: 1.5, tool: 'pickaxe', level: 1, category: 'building', drop: B.COBBLE });
d({ id: B.COBBLE, key: 'cobblestone', name: 'Pedregulho', tex: 'cobblestone', hardness: 2, tool: 'pickaxe', level: 1 });
d({ id: B.MOSSY_COBBLE, key: 'mossy_cobblestone', name: 'Pedregulho Musgoso', tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', level: 1 });
d({ id: B.SAND, key: 'sand', name: 'Areia', tex: 'sand', hardness: 0.5, tool: 'shovel', gravity: true, category: 'nature', sound: 'sand' });
d({ id: B.SANDSTONE, key: 'sandstone', name: 'Arenito', top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone', hardness: 0.8, tool: 'pickaxe', level: 1 });
d({ id: B.GRAVEL, key: 'gravel', name: 'Cascalho', tex: 'gravel', hardness: 0.6, tool: 'shovel', gravity: true, category: 'nature', sound: 'gravel',
  drop: (r) => (r() < 0.1 ? [[284, 1]] : [[B.GRAVEL, 1]]) });
d({ id: B.CLAY, key: 'clay', name: 'Argila', tex: 'clay', hardness: 0.6, tool: 'shovel', category: 'nature', sound: 'gravel', drop: () => [[288, 4]] });
d({ id: B.BEDROCK, key: 'bedrock', name: 'Rocha Matriz', tex: 'bedrock', hardness: -1, category: 'building', hidden: false });
d({ id: B.SNOW, key: 'snow', name: 'Bloco de Neve', tex: 'snow', hardness: 0.2, tool: 'shovel', category: 'nature', sound: 'snow' });
d({ id: B.WATER, key: 'water', name: 'Água', tex: 'water', shape: 'water', solid: false, opaque: false, hardness: -1, replaceable: true, hidden: true, drop: -1 });
d({ id: B.OAK_LOG, key: 'oak_log', name: 'Tronco de Carvalho', top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
d({ id: B.OAK_PLANKS, key: 'oak_planks', name: 'Tábuas de Carvalho', tex: 'oak_planks', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
d({ id: B.BIRCH_LOG, key: 'birch_log', name: 'Tronco de Bétula', top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
d({ id: B.BIRCH_PLANKS, key: 'birch_planks', name: 'Tábuas de Bétula', tex: 'birch_planks', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
d({ id: B.SPRUCE_LOG, key: 'spruce_log', name: 'Tronco de Pinheiro', top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
d({ id: B.SPRUCE_PLANKS, key: 'spruce_planks', name: 'Tábuas de Pinheiro', tex: 'spruce_planks', hardness: 2, tool: 'axe', category: 'wood', sound: 'wood', flammable: true });
const leafDrop = (sap: number, apple: boolean) => (r: () => number): [number, number][] => {
  const out: [number, number][] = [];
  if (r() < 0.06) out.push([sap, 1]);
  if (r() < 0.05) out.push([256, 1]);
  if (apple && r() < 0.03) out.push([266, 1]);
  return out;
};
d({ id: B.OAK_LEAVES, key: 'oak_leaves', name: 'Folhas de Carvalho', tex: 'oak_leaves', opaque: false, hardness: 0.2, tool: null, category: 'nature', sound: 'grass', tint: true, drop: leafDrop(B.OAK_SAPLING, true), flammable: true });
d({ id: B.BIRCH_LEAVES, key: 'birch_leaves', name: 'Folhas de Bétula', tex: 'birch_leaves', opaque: false, hardness: 0.2, category: 'nature', sound: 'grass', tint: true, drop: leafDrop(B.BIRCH_SAPLING, false) });
d({ id: B.SPRUCE_LEAVES, key: 'spruce_leaves', name: 'Folhas de Pinheiro', tex: 'spruce_leaves', opaque: false, hardness: 0.2, category: 'nature', sound: 'grass', tint: true, drop: leafDrop(B.SPRUCE_SAPLING, false) });
d({ id: B.COAL_ORE, key: 'coal_ore', name: 'Minério de Carvão', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', level: 1, category: 'ores', drop: 257 });
d({ id: B.IRON_ORE, key: 'iron_ore', name: 'Minério de Ferro', tex: 'iron_ore', hardness: 3, tool: 'pickaxe', level: 2, category: 'ores', drop: 258 });
d({ id: B.COPPER_ORE, key: 'copper_ore', name: 'Minério de Cobre', tex: 'copper_ore', hardness: 3, tool: 'pickaxe', level: 2, category: 'ores', drop: (r) => [[263, 2 + Math.floor(r() * 3)]] });
d({ id: B.GOLD_ORE, key: 'gold_ore', name: 'Minério de Ouro', tex: 'gold_ore', hardness: 3, tool: 'pickaxe', level: 3, category: 'ores', drop: 260 });
d({ id: B.REDSTONE_ORE, key: 'redstone_ore', name: 'Minério de Redstone', tex: 'redstone_ore', hardness: 3, tool: 'pickaxe', level: 3, category: 'ores', drop: (r) => [[265, 4 + Math.floor(r() * 2)]], light: 0 });
d({ id: B.DIAMOND_ORE, key: 'diamond_ore', name: 'Minério de Diamante', tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', level: 3, category: 'ores', drop: 262 });
d({ id: B.COAL_BLOCK, key: 'coal_block', name: 'Bloco de Carvão', tex: 'coal_block', hardness: 5, tool: 'pickaxe', level: 1, category: 'ores' });
d({ id: B.IRON_BLOCK, key: 'iron_block', name: 'Bloco de Ferro', tex: 'iron_block', hardness: 5, tool: 'pickaxe', level: 2, category: 'ores' });
d({ id: B.GOLD_BLOCK, key: 'gold_block', name: 'Bloco de Ouro', tex: 'gold_block', hardness: 3, tool: 'pickaxe', level: 3, category: 'ores' });
d({ id: B.DIAMOND_BLOCK, key: 'diamond_block', name: 'Bloco de Diamante', tex: 'diamond_block', hardness: 5, tool: 'pickaxe', level: 3, category: 'ores' });
d({ id: B.STONE_BRICKS, key: 'stone_bricks', name: 'Tijolos de Pedra', tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', level: 1 });
d({ id: B.GLASS, key: 'glass', name: 'Vidro', tex: 'glass', opaque: false, hardness: 0.3, category: 'building', sound: 'glass', drop: -1 });
d({ id: B.BRICKS, key: 'bricks', name: 'Tijolos', tex: 'bricks', hardness: 2, tool: 'pickaxe', level: 1 });
d({ id: B.OAK_SLAB, key: 'oak_slab', name: 'Laje de Carvalho', tex: 'oak_planks', shape: 'slab', opaque: false, hardness: 2, tool: 'axe', category: 'wood', sound: 'wood' });
d({ id: B.STONE_SLAB, key: 'stone_slab', name: 'Laje de Pedra', tex: 'stone_bricks', shape: 'slab', opaque: false, hardness: 2, tool: 'pickaxe', level: 1 });
d({ id: B.OAK_STAIRS, key: 'oak_stairs', name: 'Escada de Carvalho', tex: 'oak_planks', shape: 'stairs', opaque: false, hardness: 2, tool: 'axe', category: 'wood', sound: 'wood' });
d({ id: B.COBBLE_STAIRS, key: 'cobblestone_stairs', name: 'Escada de Pedregulho', tex: 'cobblestone', shape: 'stairs', opaque: false, hardness: 2, tool: 'pickaxe', level: 1 });
d({ id: B.TORCH, key: 'torch', name: 'Tocha', tex: 'torch', shape: 'torch', solid: false, opaque: false, hardness: 0, light: 14, category: 'decoration', sound: 'wood' });
d({ id: B.GLOWSTONE, key: 'glowstone', name: 'Pedra Luminosa', tex: 'glowstone', hardness: 0.3, light: 15, category: 'decoration', sound: 'glass' });
d({ id: B.CRAFTING_TABLE, key: 'crafting_table', name: 'Bancada de Trabalho', top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front', hardness: 2.5, tool: 'axe', category: 'utility', sound: 'wood' });
d({ id: B.FURNACE, key: 'furnace', name: 'Fornalha', top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front', frontLit: 'furnace_front_on', hardness: 3.5, tool: 'pickaxe', level: 1, category: 'utility' });
d({ id: B.CHEST, key: 'chest', name: 'Baú', top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front', hardness: 2.5, tool: 'axe', category: 'utility', sound: 'wood' });
d({ id: B.BOOKSHELF, key: 'bookshelf', name: 'Estante', top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf', hardness: 1.5, tool: 'axe', category: 'decoration', sound: 'wood' });
d({ id: B.OAK_DOOR, key: 'oak_door', name: 'Porta de Carvalho', top: 'door_bottom', bottom: 'door_bottom', side: 'door_bottom', shape: 'door', opaque: false, hardness: 3, tool: 'axe', category: 'utility', sound: 'wood' });
d({ id: B.BED, key: 'bed', name: 'Cama', top: 'bed_foot_top', bottom: 'oak_planks', side: 'bed_side', shape: 'bed', opaque: false, hardness: 0.2, category: 'utility', sound: 'cloth' });
d({ id: B.CACTUS, key: 'cactus', name: 'Cacto', top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side', shape: 'cactus', opaque: false, hardness: 0.4, category: 'nature', sound: 'cloth' });
d({ id: B.TALL_GRASS, key: 'tall_grass', name: 'Grama Alta', tex: 'tall_grass', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass', tint: true, replaceable: true,
  drop: () => [] });
d({ id: B.DANDELION, key: 'dandelion', name: 'Dente-de-leão', tex: 'dandelion', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'decoration', sound: 'grass' });
d({ id: B.POPPY, key: 'poppy', name: 'Papoula', tex: 'poppy', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'decoration', sound: 'grass' });
d({ id: B.OAK_SAPLING, key: 'oak_sapling', name: 'Muda de Carvalho', tex: 'oak_sapling', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass' });
d({ id: B.BIRCH_SAPLING, key: 'birch_sapling', name: 'Muda de Bétula', tex: 'birch_sapling', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass' });
d({ id: B.SPRUCE_SAPLING, key: 'spruce_sapling', name: 'Muda de Pinheiro', tex: 'spruce_sapling', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass' });
d({ id: B.BROWN_MUSHROOM, key: 'brown_mushroom', name: 'Cogumelo Marrom', tex: 'brown_mushroom', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass', light: 1 });
d({ id: B.RED_MUSHROOM, key: 'red_mushroom', name: 'Cogumelo Vermelho', tex: 'red_mushroom', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass' });
d({ id: B.DEAD_BUSH, key: 'dead_bush', name: 'Arbusto Morto', tex: 'dead_bush', shape: 'cross', solid: false, opaque: false, hardness: 0, category: 'nature', sound: 'grass', replaceable: true, drop: (r) => (r() < 0.5 ? [[256, 1]] : []) });
d({ id: B.WOOL, key: 'wool', name: 'Lã Branca', tex: 'wool', hardness: 0.8, category: 'decoration', sound: 'cloth', flammable: true });
d({ id: B.SNOWY_GRASS, key: 'snowy_grass', name: 'Grama com Neve', top: 'snow', bottom: 'dirt', side: 'snowy_grass_side', hardness: 0.6, tool: 'shovel', category: 'nature', sound: 'snow', drop: B.DIRT });

export function block(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[0]!;
}

// Fast lookup tables used by the mesher / physics.
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIGHT = new Uint8Array(256);
export const SHAPE_CODE = new Uint8Array(256); // 0 none, 1 cube, 2 cross, 3 other, 4 water
/** Light attenuation for sky light passing through. */
export const ATTEN = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const b = BLOCKS[i];
  if (!b) continue;
  OPAQUE[i] = b.opaque ? 1 : 0;
  SOLID[i] = b.solid ? 1 : 0;
  LIGHT[i] = b.light;
  SHAPE_CODE[i] = b.shape === 'none' ? 0 : b.shape === 'cube' ? 1 : b.shape === 'cross' ? 2 : b.shape === 'water' ? 4 : 3;
  ATTEN[i] = b.opaque ? 15 : b.shape === 'water' ? 2 : i === B.OAK_LEAVES || i === B.BIRCH_LEAVES || i === B.SPRUCE_LEAVES ? 1 : 0;
}

export function isLeaves(id: number): boolean {
  return id === B.OAK_LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES;
}
