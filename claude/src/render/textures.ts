// Procedural pixel-art texture atlas and item icons (all original, generated at runtime).
import * as THREE from 'three';
import { mulberry32, hashString } from '../core/noise';
import { BLOCKS, block } from '../world/blocks';
import { ITEMS, itemDef, TOOL_MATERIALS } from '../world/items';

type C3 = [number, number, number];
const T = 16;
const ATLAS_TILES = 16; // 16x16 tiles of 16px => 256px atlas

function hex(h: string): C3 {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function sh(c: C3, f: number): C3 {
  return [c[0] * f, c[1] * f, c[2] * f];
}
function mix(a: C3, b: C3, t: number): C3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

class Tile {
  data = new Uint8ClampedArray(T * T * 4);
  set(x: number, y: number, c: C3, a = 255) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  get(x: number, y: number): C3 {
    const i = (((y + T) % T) * T + ((x + T) % T)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
  alpha(x: number, y: number) { return this.data[(y * T + x) * 4 + 3]; }
  fill(c: C3, amt: number, r: () => number) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) this.set(x, y, sh(c, 1 + (r() - 0.5) * amt));
  }
  copy(o: Tile) { this.data.set(o.data); }
}

type Painter = (t: Tile, r: () => number) => void;

function speckle(t: Tile, r: () => number, c: C3, n: number, amt = 0.1) {
  for (let i = 0; i < n; i++) t.set(Math.floor(r() * T), Math.floor(r() * T), sh(c, 1 + (r() - 0.5) * amt));
}

const DIRT = hex('#86603f');
const GRASS = hex('#6fae4a');
const STONE = hex('#7e7e7e');

const P: Record<string, Painter> = {};

P.dirt = (t, r) => {
  t.fill(DIRT, 0.3, r);
  speckle(t, r, hex('#5e4129'), 22);
  speckle(t, r, hex('#a07a55'), 14);
  speckle(t, r, hex('#6f7070'), 4);
};
P.grass_top = (t, r) => {
  t.fill(GRASS, 0.3, r);
  speckle(t, r, hex('#5b9a3a'), 30);
  speckle(t, r, hex('#86c45c'), 18);
};
function grassSide(t: Tile, r: () => number, top: C3, light: C3, amt: number) {
  P.dirt(t, r);
  for (let x = 0; x < T; x++) {
    const depth = 3 + (r() < 0.45 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    for (let y = 0; y < depth; y++) t.set(x, y, sh(y === depth - 1 && r() < 0.5 ? light : top, 1 + (r() - 0.5) * amt));
  }
}
P.grass_side = (t, r) => grassSide(t, r, GRASS, hex('#5b9a3a'), 0.25);
P.snowy_grass_side = (t, r) => grassSide(t, r, hex('#f4fafa'), hex('#d8e4e6'), 0.06);
P.stone = (t, r) => {
  t.fill(STONE, 0.16, r);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T), len = 2 + Math.floor(r() * 3);
    const c = r() < 0.6 ? hex('#696969') : hex('#939393');
    for (let k = 0; k < len; k++) t.set(x + k, y, sh(c, 1 + (r() - 0.5) * 0.08));
  }
};
function voronoiStones(t: Tile, r: () => number, base: C3, mortar: C3, cells: number, moss = false) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < cells; i++) pts.push([r() * T, r() * T, 0.8 + r() * 0.4]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = x + 0.5 - (pts[i][0] + ox * T), dy = y + 0.5 - (pts[i][1] + oy * T);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
      }
    }
    if (d2 - d1 < 1.1) t.set(x, y, sh(mortar, 1 + (r() - 0.5) * 0.15));
    else {
      const edge = Math.min(1, (d2 - d1) / 4);
      let c = sh(base, pts[best][2] * (0.85 + edge * 0.2) * (1 + (r() - 0.5) * 0.12));
      if (moss && r() < 0.35 + (pts[best][2] > 1 ? 0.3 : 0)) c = sh(hex('#58803a'), 1 + (r() - 0.5) * 0.3);
      t.set(x, y, c);
    }
  }
}
P.cobblestone = (t, r) => voronoiStones(t, r, hex('#888888'), hex('#4c4c4c'), 9);
P.mossy_cobblestone = (t, r) => voronoiStones(t, r, hex('#888888'), hex('#4c4c4c'), 9, true);
P.sand = (t, r) => { t.fill(hex('#dcd2a0'), 0.1, r); speckle(t, r, hex('#c4b886'), 20); speckle(t, r, hex('#ece4b8'), 10); };
P.sandstone = (t, r) => {
  t.fill(hex('#d8ca94'), 0.08, r);
  for (let x = 0; x < T; x++) {
    for (let y = 0; y < 3; y++) t.set(x, y, sh(hex('#e4d9a8'), 1 + (r() - 0.5) * 0.06));
    t.set(x, 3, hex('#bba873'));
    t.set(x, 11, sh(hex('#c6b47e'), 1 + (r() - 0.5) * 0.08));
    t.set(x, 15, hex('#b09c66'));
  }
};
P.sandstone_top = (t, r) => { t.fill(hex('#e0d5a3'), 0.07, r); speckle(t, r, hex('#cfc290'), 12); };
P.gravel = (t, r) => {
  const pal = ['#7a7270', '#8f8786', '#a59d9b', '#5e5857', '#8a7a6e', '#b0aaa8'].map(hex);
  for (let y = 0; y < T; y += 2) for (let x = 0; x < T; x += 2) {
    const c = pal[Math.floor(r() * pal.length)];
    for (let k = 0; k < 4; k++) t.set(x + (k & 1), y + (k >> 1), sh(c, 1 + (r() - 0.5) * 0.15));
  }
};
P.clay = (t, r) => { t.fill(hex('#a1a7b4'), 0.08, r); speckle(t, r, hex('#8f95a2'), 14); };
P.bedrock = (t, r) => {
  const pal = ['#575757', '#2f2f2f', '#7a7a7a', '#444444', '#1c1c1c'].map(hex);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, pal[Math.floor(r() * pal.length)]);
};
P.snow = (t, r) => { t.fill(hex('#f3f9fa'), 0.05, r); speckle(t, r, hex('#dde9ee'), 10); };
P.water = (t, r) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + 0.5;
    t.set(x, y, sh(mix(hex('#2d5bd0'), hex('#4a7ae6'), w * 0.6), 1 + (r() - 0.5) * 0.08), 200);
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T);
    for (let k = 0; k < 3; k++) t.set(x + k, y, hex('#7aa0f0'), 210);
  }
};
function logSide(t: Tile, r: () => number, base: C3) {
  for (let x = 0; x < T; x++) {
    const colShade = (x % 4 === 0 ? 0.75 : x % 4 === 2 ? 1.08 : 1) * (1 + (r() - 0.5) * 0.1);
    for (let y = 0; y < T; y++) t.set(x, y, sh(base, colShade * (1 + (r() - 0.5) * 0.12)));
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T), len = 2 + Math.floor(r() * 4);
    for (let k = 0; k < len; k++) t.set(x, y + k, sh(base, 0.65));
  }
}
function logTop(t: Tile, r: () => number, bark: C3, wood: C3) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) t.set(x, y, sh(bark, 1 + (r() - 0.5) * 0.15));
    else t.set(x, y, sh(wood, (Math.floor(d) % 2 ? 0.86 : 1) * (1 + (r() - 0.5) * 0.06)));
  }
}
function planks(t: Tile, r: () => number, base: C3) {
  for (let y = 0; y < T; y++) {
    const row = y >> 2;
    const seam = (row * 7 + 3) % 16;
    for (let x = 0; x < T; x++) {
      let c = sh(base, 1 + (r() - 0.5) * 0.08 + (Math.sin(x * 1.3 + row * 4) * 0.04));
      if (y % 4 === 3) c = sh(base, 0.62);
      else if (x === seam) c = sh(base, 0.7);
      else if (y % 4 === 0) c = sh(base, 1.06);
      t.set(x, y, c);
    }
  }
}
P.oak_log = (t, r) => logSide(t, r, hex('#6b5232'));
P.oak_log_top = (t, r) => logTop(t, r, hex('#6b5232'), hex('#b4905a'));
P.oak_planks = (t, r) => planks(t, r, hex('#b08c56'));
P.birch_log = (t, r) => {
  t.fill(hex('#dcd9cd'), 0.08, r);
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(r() * T), y = Math.floor(r() * T), len = 2 + Math.floor(r() * 3);
    for (let k = 0; k < len; k++) t.set(x + k, y, hex(r() < 0.5 ? '#2b2b2b' : '#45403a'));
  }
};
P.birch_log_top = (t, r) => logTop(t, r, hex('#dcd9cd'), hex('#cdbb80'));
P.birch_planks = (t, r) => planks(t, r, hex('#d0c184'));
P.spruce_log = (t, r) => logSide(t, r, hex('#4a3420'));
P.spruce_log_top = (t, r) => logTop(t, r, hex('#4a3420'), hex('#7c5b36'));
P.spruce_planks = (t, r) => planks(t, r, hex('#7c5b36'));
function leaves(t: Tile, r: () => number, base: C3) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (r() < 0.16) { t.set(x, y, [0, 0, 0], 0); continue; }
    const f = r() < 0.2 ? 0.7 : r() < 0.15 ? 1.2 : 0.9 + r() * 0.2;
    t.set(x, y, sh(base, f));
  }
}
P.oak_leaves = (t, r) => leaves(t, r, hex('#5c9a38'));
P.birch_leaves = (t, r) => leaves(t, r, hex('#80a755'));
P.spruce_leaves = (t, r) => leaves(t, r, hex('#3a6646'));
function ore(t: Tile, r: () => number, c: C3, hi: C3, clusters = 5) {
  P.stone(t, r);
  for (let i = 0; i < clusters; i++) {
    let x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      t.set(x, y, k === 0 ? hi : sh(c, 0.85 + r() * 0.3));
      if (r() < 0.5) x += r() < 0.5 ? 1 : -1; else y += r() < 0.5 ? 1 : -1;
    }
  }
}
P.coal_ore = (t, r) => ore(t, r, hex('#2a2a2a'), hex('#474747'));
P.iron_ore = (t, r) => ore(t, r, hex('#d4a888'), hex('#ecd0b8'));
P.copper_ore = (t, r) => ore(t, r, hex('#c46c3c'), hex('#5fb89a'));
P.gold_ore = (t, r) => ore(t, r, hex('#f4d03a'), hex('#fff6a0'));
P.redstone_ore = (t, r) => ore(t, r, hex('#c81010'), hex('#ff5050'));
P.diamond_ore = (t, r) => ore(t, r, hex('#4ee4d4'), hex('#c8fff8'), 4);
function mineral(t: Tile, r: () => number, c: C3) {
  t.fill(c, 0.08, r);
  for (let i = 0; i < T; i++) {
    t.set(i, 0, sh(c, 1.25)); t.set(0, i, sh(c, 1.2));
    t.set(i, 15, sh(c, 0.7)); t.set(15, i, sh(c, 0.75));
  }
  for (let i = 3; i < 13; i += 4) for (let j = 3; j < 13; j += 4) t.set(i, j, sh(c, 1.15));
}
P.coal_block = (t, r) => mineral(t, r, hex('#262626'));
P.iron_block = (t, r) => mineral(t, r, hex('#d8d8d8'));
P.gold_block = (t, r) => mineral(t, r, hex('#f6d23e'));
P.diamond_block = (t, r) => mineral(t, r, hex('#5fe6da'));
P.stone_bricks = (t, r) => {
  t.fill(hex('#7b7b7b'), 0.1, r);
  for (let x = 0; x < T; x++) { t.set(x, 7, hex('#555555')); t.set(x, 15, hex('#555555')); t.set(x, 0, hex('#8e8e8e')); t.set(x, 8, hex('#8e8e8e')); }
  for (let y = 0; y < 8; y++) t.set(15, y, hex('#555555'));
  for (let y = 8; y < 16; y++) t.set(7, y, hex('#555555'));
};
P.bricks = (t, r) => {
  const mortar = hex('#b5aea4');
  for (let y = 0; y < T; y++) {
    const row = y >> 2;
    for (let x = 0; x < T; x++) {
      const off = row % 2 ? 4 : 12;
      if (y % 4 === 3 || (x === off % 16)) t.set(x, y, sh(mortar, 1 + (r() - 0.5) * 0.1));
      else t.set(x, y, sh(hex('#9a4f3b'), (1 + ((row * 7 + (x > off ? 1 : 0) * 3) % 5) * 0.04) * (1 + (r() - 0.5) * 0.12)));
    }
  }
};
P.glass = (t, r) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, [255, 255, 255], 0);
  for (let i = 0; i < T; i++) {
    t.set(i, 0, hex('#dbe9ee')); t.set(i, 15, hex('#a9c2ca')); t.set(0, i, hex('#dbe9ee')); t.set(15, i, hex('#a9c2ca'));
  }
  [[3, 5], [4, 4], [5, 3], [6, 2], [9, 12], [10, 11], [11, 10]].forEach(([x, y]) => t.set(x, y, [240, 250, 255], 220));
};
P.torch = (t, r) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, [0, 0, 0], 0);
  for (let y = 6; y < 16; y++) { t.set(7, y, hex('#7b5a32')); t.set(8, y, hex('#5c4122')); }
  t.set(7, 6, hex('#ffd84a')); t.set(8, 6, hex('#ff9a20'));
  t.set(7, 5, hex('#fff3a0')); t.set(8, 5, hex('#ffd84a'));
  t.set(7, 4, hex('#ffffff')); t.set(8, 4, hex('#fff3a0'));
};
P.glowstone = (t, r) => {
  t.fill(hex('#a9803f'), 0.25, r);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * 14), y = Math.floor(r() * 14);
    t.set(x, y, hex('#ffe9a0')); t.set(x + 1, y, hex('#ffd36a')); t.set(x, y + 1, hex('#ffd36a')); t.set(x + 1, y + 1, hex('#fff6d0'));
  }
};
P.crafting_table_top = (t, r) => {
  planks(t, r, hex('#a37a42'));
  for (let i = 0; i < T; i++) { t.set(i, 0, hex('#5a3d1c')); t.set(i, 15, hex('#5a3d1c')); t.set(0, i, hex('#5a3d1c')); t.set(15, i, hex('#5a3d1c')); }
  for (let i = 2; i < 14; i++) { t.set(i, 5, hex('#6b4a24')); t.set(i, 10, hex('#6b4a24')); t.set(5, i, hex('#6b4a24')); t.set(10, i, hex('#6b4a24')); }
};
function tableSide(t: Tile, r: () => number, front: boolean) {
  planks(t, r, hex('#a37a42'));
  for (let x = 0; x < T; x++) for (let y = 0; y < 3; y++) t.set(x, y, sh(hex('#5a3d1c'), 1 + (r() - 0.5) * 0.1));
  if (front) {
    // saw
    for (let x = 2; x < 8; x++) { t.set(x, 7, hex('#c9c9c9')); t.set(x, 8, hex('#a8a8a8')); if (x % 2) t.set(x, 9, hex('#8e8e8e')); }
    t.set(8, 7, hex('#6b4a24')); t.set(9, 7, hex('#6b4a24')); t.set(9, 8, hex('#6b4a24'));
    // hammer
    for (let y = 6; y < 13; y++) t.set(12, y, hex('#6b4a24'));
    for (let x = 10; x < 15; x++) { t.set(x, 5, hex('#8e8e8e')); t.set(x, 6, hex('#b0b0b0')); }
  } else {
    for (let y = 5; y < 13; y++) { t.set(4, y, hex('#6b4a24')); }
    for (let x = 2; x < 7; x++) t.set(x, 5, hex('#9c9c9c'));
    for (let y = 6; y < 13; y++) t.set(11, y, hex('#6b4a24'));
    t.set(10, 5, hex('#c0c0c0')); t.set(11, 5, hex('#c0c0c0')); t.set(12, 5, hex('#c0c0c0')); t.set(10, 6, hex('#a0a0a0')); t.set(12, 6, hex('#a0a0a0'));
  }
}
P.crafting_table_side = (t, r) => tableSide(t, r, false);
P.crafting_table_front = (t, r) => tableSide(t, r, true);
function furnaceBase(t: Tile, r: () => number) {
  t.fill(hex('#7a7a7a'), 0.14, r);
  for (let i = 0; i < T; i++) { t.set(i, 0, hex('#5a5a5a')); t.set(i, 15, hex('#4a4a4a')); t.set(0, i, hex('#5a5a5a')); t.set(15, i, hex('#4a4a4a')); }
}
P.furnace_side = (t, r) => furnaceBase(t, r);
P.furnace_top = (t, r) => { furnaceBase(t, r); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) t.set(x, y, sh(hex('#8a8a8a'), 1 + (r() - 0.5) * 0.1)); };
function furnaceFront(t: Tile, r: () => number, lit: boolean) {
  furnaceBase(t, r);
  for (let x = 3; x < 13; x++) { t.set(x, 3, hex('#9a9a9a')); t.set(x, 4, hex('#5a5a5a')); }
  for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) {
    if (lit) {
      const f = (14 - y) / 6 + (r() - 0.5) * 0.4;
      t.set(x, y, f > 0.75 ? hex('#ffe680') : f > 0.4 ? hex('#ff9a20') : hex('#c84010'));
    } else t.set(x, y, sh(hex('#1d1d1d'), 1 + (r() - 0.5) * 0.3));
  }
  for (let x = 3; x < 13; x++) t.set(x, 7, hex('#4a4a4a'));
}
P.furnace_front = (t, r) => furnaceFront(t, r, false);
P.furnace_front_on = (t, r) => furnaceFront(t, r, true);
function chestBase(t: Tile, r: () => number) {
  planks(t, r, hex('#a36a2c'));
  for (let i = 0; i < T; i++) { t.set(i, 0, hex('#3e2810')); t.set(i, 15, hex('#3e2810')); t.set(0, i, hex('#3e2810')); t.set(15, i, hex('#3e2810')); }
}
P.chest_top = (t, r) => chestBase(t, r);
P.chest_side = (t, r) => { chestBase(t, r); for (let x = 0; x < T; x++) t.set(x, 5, hex('#3e2810')); };
P.chest_front = (t, r) => {
  P.chest_side(t, r);
  for (let y = 4; y < 9; y++) { t.set(7, y, hex('#d8d8d8')); t.set(8, y, hex('#a8a8a8')); }
  t.set(7, 8, hex('#3a3a3a'));
};
P.bookshelf = (t, r) => {
  planks(t, r, hex('#b08c56'));
  const colors = ['#8c2c2c', '#2c4c8c', '#2c7c3c', '#8c7c2c', '#5c2c7c', '#a05a20'].map(hex);
  for (const [y0, y1] of [[2, 7], [9, 14]]) {
    let x = 1;
    while (x < 15) {
      const c = colors[Math.floor(r() * colors.length)];
      const top = y0 + (r() < 0.3 ? 1 : 0);
      for (let y = top; y <= y1; y++) t.set(x, y, sh(c, y === top ? 1.25 : 1));
      x += 1 + (r() < 0.25 ? 1 : 0);
    }
  }
};
function doorPanel(t: Tile, r: () => number, top: boolean) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const board = Math.floor(x / 4);
    let c = sh(hex('#9a7542'), (board % 2 ? 0.94 : 1.03) * (1 + (r() - 0.5) * 0.08));
    if (x % 4 === 3) c = sh(hex('#9a7542'), 0.75);
    t.set(x, y, c);
  }
  for (let i = 0; i < T; i++) { t.set(0, i, hex('#5e4424')); t.set(15, i, hex('#5e4424')); }
  if (top) {
    for (let i = 0; i < T; i++) t.set(i, 0, hex('#5e4424'));
    for (let y = 3; y < 8; y++) for (let x = 3; x < 13; x++) if (x !== 7 && x !== 8 && y !== 5) t.set(x, y, [0, 0, 0], 0);
  } else {
    for (let i = 0; i < T; i++) t.set(i, 15, hex('#5e4424'));
    t.set(12, 2, hex('#c0c0c0')); t.set(12, 3, hex('#909090'));
  }
}
P.door_bottom = (t, r) => doorPanel(t, r, false);
P.door_top = (t, r) => doorPanel(t, r, true);
P.bed_foot_top = (t, r) => { t.fill(hex('#b32d25'), 0.08, r); for (let x = 0; x < T; x++) t.set(x, 2, hex('#d8463c')); };
P.bed_head_top = (t, r) => {
  t.fill(hex('#b32d25'), 0.08, r);
  for (let y = 7; y < 15; y++) for (let x = 2; x < 14; x++) t.set(x, y, sh(hex('#ececec'), 1 + (r() - 0.5) * 0.06));
};
P.bed_side = (t, r) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, [0, 0, 0], 0);
  for (let x = 0; x < T; x++) {
    for (let y = 7; y < 11; y++) t.set(x, y, sh(hex('#b32d25'), 1 + (r() - 0.5) * 0.08));
    t.set(x, 11, hex('#e0e0e0'));
    for (let y = 12; y < 14; y++) t.set(x, y, sh(hex('#8a6a3a'), 1 + (r() - 0.5) * 0.08));
  }
  for (let y = 14; y < 16; y++) for (const x of [0, 1, 2, 13, 14, 15]) t.set(x, y, hex('#6b5230'));
};
P.cactus_side = (t, r) => {
  t.fill(hex('#3f8a2c'), 0.1, r);
  for (let y = 0; y < T; y++) for (const x of [1, 5, 10, 14]) t.set(x, y, hex('#2c6a1e'));
  for (let i = 0; i < 8; i++) t.set([0, 4, 9, 15][i % 4], Math.floor(r() * T), hex('#d8e8a0'));
};
P.cactus_top = (t, r) => {
  t.fill(hex('#4a9a34'), 0.1, r);
  for (let i = 1; i < 15; i++) { t.set(i, 1, hex('#2c6a1e')); t.set(i, 14, hex('#2c6a1e')); t.set(1, i, hex('#2c6a1e')); t.set(14, i, hex('#2c6a1e')); }
  t.set(7, 7, hex('#8ac060')); t.set(8, 8, hex('#8ac060'));
};
function clear(t: Tile) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, [0, 0, 0], 0); }
P.tall_grass = (t, r) => {
  clear(t);
  for (let b = 0; b < 9; b++) {
    let x = 1 + Math.floor(r() * 14);
    const h = 5 + Math.floor(r() * 9);
    const lean = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      if (k > 3 && r() < 0.25) x += lean;
      t.set(x, y, sh(GRASS, 0.75 + (k / h) * 0.45));
    }
  }
};
function flower(t: Tile, r: () => number, petal: C3, center: C3) {
  clear(t);
  for (let y = 8; y < 16; y++) t.set(7, y, hex('#3f7a2a'));
  t.set(6, 12, hex('#4e8f34')); t.set(5, 11, hex('#4e8f34')); t.set(8, 13, hex('#4e8f34')); t.set(9, 12, hex('#4e8f34'));
  for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) if (!((x === 5 || x === 9) && (y === 4 || y === 7))) t.set(x, y, sh(petal, 0.9 + r() * 0.2));
  t.set(7, 5, center); t.set(7, 6, center);
}
P.dandelion = (t, r) => flower(t, r, hex('#f6dc28'), hex('#e8a010'));
P.poppy = (t, r) => flower(t, r, hex('#d81e1e'), hex('#2a2a10'));
function sapling(t: Tile, r: () => number, leaf: C3, trunk: C3) {
  clear(t);
  for (let y = 9; y < 16; y++) t.set(7, y, trunk);
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, d = r() * 4.5;
    t.set(Math.round(7 + Math.cos(a) * d), Math.round(6 + Math.sin(a) * d * 0.9), sh(leaf, 0.8 + r() * 0.4));
  }
}
P.oak_sapling = (t, r) => sapling(t, r, hex('#4e8a30'), hex('#6b5232'));
P.birch_sapling = (t, r) => sapling(t, r, hex('#7aa652'), hex('#d8d5c9'));
P.spruce_sapling = (t, r) => sapling(t, r, hex('#2f5a3a'), hex('#4a3420'));
P.brown_mushroom = (t) => {
  clear(t);
  for (let y = 10; y < 16; y++) { t.set(7, y, hex('#e0d0b0')); t.set(8, y, hex('#c8b898')); }
  for (let x = 4; x < 12; x++) { t.set(x, 9, hex('#8a6a4a')); t.set(x, 8, hex('#a07a55')); }
  for (let x = 5; x < 11; x++) t.set(x, 7, hex('#b08a65'));
};
P.red_mushroom = (t) => {
  clear(t);
  for (let y = 10; y < 16; y++) { t.set(7, y, hex('#e8e0d0')); t.set(8, y, hex('#d0c8b8')); }
  for (let x = 4; x < 12; x++) { t.set(x, 9, hex('#b01a1a')); t.set(x, 8, hex('#d82a2a')); }
  for (let x = 5; x < 11; x++) { t.set(x, 7, hex('#d82a2a')); t.set(x, 6, x > 5 && x < 10 ? hex('#e83a3a') : [0, 0, 0], x > 5 && x < 10 ? 255 : 0); }
  t.set(6, 8, hex('#ffffff')); t.set(9, 7, hex('#ffffff')); t.set(10, 9, hex('#ffffff'));
};
P.dead_bush = (t, r) => {
  clear(t);
  for (let b = 0; b < 5; b++) {
    let x = 7, y = 15;
    const dx = (r() - 0.5) * 1.6;
    let fx = 7;
    for (let k = 0; k < 7 + r() * 4; k++) {
      t.set(x, y, hex('#7a5530'));
      y--; fx += dx; x = Math.round(fx);
    }
  }
};
P.wool = (t, r) => {
  t.fill(hex('#e8ecec'), 0.06, r);
  for (let i = 0; i < 14; i++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 15); t.set(x, y, hex('#cfd4d4')); t.set(x + 1, y + 1, hex('#d8dcdc')); }
};

// Crack overlay stages
const crackWalks: [number, number][][] = [];
{
  const r = mulberry32(1234);
  for (let i = 0; i < 20; i++) {
    const pts: [number, number][] = [];
    let x = 5 + r() * 6, y = 5 + r() * 6;
    const ang = r() * Math.PI * 2;
    for (let k = 0; k < 6 + i / 2; k++) {
      pts.push([Math.floor(x), Math.floor(y)]);
      x += Math.cos(ang + (r() - 0.5) * 1.6);
      y += Math.sin(ang + (r() - 0.5) * 1.6);
    }
    crackWalks.push(pts);
  }
}
for (let s = 0; s < 10; s++) {
  P['destroy_' + s] = (t) => {
    clear(t);
    for (let i = 0; i < (s + 1) * 2; i++) for (const [x, y] of crackWalks[i]) {
      if (x >= 0 && y >= 0 && x < T && y < T) t.set(x, y, [20, 20, 20], 200);
    }
  };
}

// ------------------------------------------------------------------
export class TextureAtlas {
  canvas: HTMLCanvasElement;
  texture: THREE.Texture;
  index = new Map<string, number>();
  tiles = new Map<string, Tile>();
  private avgColor = new Map<string, C3>();

  constructor() {
    const size = T * ATLAS_TILES;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size; this.canvas.height = size;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    let n = 0;
    for (const name of Object.keys(P)) {
      const tile = new Tile();
      P[name](tile, mulberry32(hashString(name)));
      this.tiles.set(name, tile);
      const tx = (n % ATLAS_TILES) * T, ty = Math.floor(n / ATLAS_TILES) * T;
      let ar = 0, ag = 0, ab = 0, cnt = 0;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const si = (y * T + x) * 4, di = ((ty + y) * size + tx + x) * 4;
        for (let k = 0; k < 4; k++) img.data[di + k] = tile.data[si + k];
        if (tile.data[si + 3] > 100) { ar += tile.data[si]; ag += tile.data[si + 1]; ab += tile.data[si + 2]; cnt++; }
      }
      this.avgColor.set(name, cnt ? [ar / cnt, ag / cnt, ab / cnt] : [128, 128, 128]);
      this.index.set(name, n);
      n++;
    }
    ctx.putImageData(img, 0, 0);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Returns [u0, v0, u1, v1] for a named tile (v flipped for WebGL). */
  uv(name: string): [number, number, number, number] {
    const i = this.index.get(name) ?? 0;
    const s = 1 / ATLAS_TILES;
    const e = 0.0005;
    const u0 = (i % ATLAS_TILES) * s, v0 = 1 - (Math.floor(i / ATLAS_TILES) + 1) * s;
    return [u0 + e, v0 + e, u0 + s - e, v0 + s - e];
  }

  tileIndex(name: string): number { return this.index.get(name) ?? 0; }

  color(name: string): C3 { return this.avgColor.get(name) ?? [128, 128, 128]; }

  tileCanvas(name: string): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = T; c.height = T;
    const tile = this.tiles.get(name);
    if (tile) c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tile.data), T, T), 0, 0);
    return c;
  }
}

// ------------------------------------------------------------------
// Item icons
type IconPainter = (t: Tile, r: () => number) => void;
const IP: Record<string, IconPainter> = {};

function line(t: Tile, x0: number, y0: number, x1: number, y1: number, c: C3, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    t.set(x, y, c);
    if (w > 1) t.set(x + 1, y, c);
  }
}
function outline(t: Tile, c: C3 = [30, 24, 18]) {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < T && y < T && t.alpha(x, y) > 0;
  const add: [number, number][] = [];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (solid(x, y)) continue;
    if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) add.push([x, y]);
  }
  for (const [x, y] of add) t.set(x, y, c);
}
function blob(t: Tile, r: () => number, cx: number, cy: number, rx: number, ry: number, c: C3, rough = 0.3) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = dx * dx + dy * dy;
    if (d < 1 - r() * rough) {
      const light = 1.15 - (dy + dx) * 0.18;
      t.set(x, y, sh(c, light * (1 + (r() - 0.5) * 0.1)));
    }
  }
}
const lump = (c: string, spots?: string) => (t: Tile, r: () => number) => {
  clear(t); blob(t, r, 8, 8.5, 5.5, 5, hex(c), 0.35);
  if (spots) for (let i = 0; i < 6; i++) { const x = 5 + Math.floor(r() * 6), y = 5 + Math.floor(r() * 6); if (t.alpha(x, y)) t.set(x, y, hex(spots)); }
  outline(t);
};
const ingot = (c: string) => (t: Tile) => {
  clear(t);
  const base = hex(c);
  for (let y = 6; y < 11; y++) for (let x = 2 + (10 - y); x < 14 - (y - 6) * 0; x++) {
    if (x > 13) continue;
    t.set(x, y, sh(base, y === 6 ? 1.3 : y < 8 ? 1.1 : 0.85));
  }
  for (let y = 6; y < 11; y++) t.set(13, y, sh(base, 0.7));
  outline(t);
};
IP.stick = (t) => { clear(t); line(t, 3, 13, 12, 4, hex('#7a5a30')); line(t, 4, 13, 13, 4, hex('#5a3e1e')); outline(t); };
IP.coal = lump('#2e2e2e', '#4a4a4a');
IP.charcoal = lump('#3a2e24', '#5a4a3a');
IP.flint = lump('#3a3a40', '#6a6a70');
IP.raw_iron = lump('#c8a088', '#e8c8b0');
IP.raw_gold = lump('#e8c030', '#fff080');
IP.raw_copper = lump('#c06a3a', '#5fb89a');
IP.clay_ball = lump('#a1a7b4', '#c0c6d0');
IP.iron_ingot = ingot('#d8d8d8');
IP.gold_ingot = ingot('#f4d040');
IP.copper_ingot = ingot('#d07a48');
IP.brick = ingot('#a04a34');
IP.diamond = (t) => {
  clear(t);
  for (let y = 3; y < 14; y++) {
    const w = y < 7 ? (y - 3) + 3 : 13 - y;
    for (let x = 8 - w; x < 8 + w; x++) t.set(x, y, sh(hex('#4de8d8'), y < 7 ? 1.25 : 1 - (y - 7) * 0.05));
  }
  t.set(6, 5, hex('#ffffff')); t.set(7, 4, hex('#e0fffc'));
  outline(t, [10, 60, 60]);
};
IP.redstone = (t, r) => { clear(t); for (let i = 0; i < 30; i++) { const a = r() * 6.28, d = r() * 5; t.set(Math.round(8 + Math.cos(a) * d), Math.round(9 + Math.sin(a) * d * 0.7), hex(r() < 0.3 ? '#ff4040' : '#b01010')); } };
IP.gunpowder = (t, r) => { clear(t); for (let i = 0; i < 34; i++) { const a = r() * 6.28, d = r() * 5; t.set(Math.round(8 + Math.cos(a) * d), Math.round(9 + Math.sin(a) * d * 0.7), hex(r() < 0.3 ? '#8a8a8a' : '#4a4a4a')); } };
IP.apple = (t, r) => {
  clear(t); blob(t, r, 8, 9.5, 5.5, 5, hex('#d8231c'), 0.05);
  t.set(8, 3, hex('#5a3a1a')); t.set(8, 4, hex('#5a3a1a')); t.set(9, 3, hex('#4a9a2a')); t.set(10, 2, hex('#4a9a2a'));
  t.set(6, 7, hex('#ff8a80')); outline(t);
};
const meat = (c: string, fat: string, bone: boolean) => (t: Tile, r: () => number) => {
  clear(t); blob(t, r, 7.5, 8.5, 6, 4.5, hex(c), 0.08);
  for (let i = 0; i < 6; i++) { const x = 4 + Math.floor(r() * 7), y = 6 + Math.floor(r() * 4); if (t.alpha(x, y)) t.set(x, y, hex(fat)); }
  if (bone) { t.set(13, 11, hex('#f0ece0')); t.set(14, 12, hex('#f0ece0')); t.set(14, 11, hex('#d8d4c8')); }
  outline(t);
};
IP.beef = meat('#c83a3a', '#f0a0a0', false);
IP.cooked_beef = meat('#7a4a2a', '#a06a40', false);
IP.porkchop = meat('#f0908a', '#ffd0c8', true);
IP.cooked_porkchop = meat('#c08a5a', '#e0b080', true);
IP.mutton = meat('#c84a4a', '#f0e0d8', true);
IP.cooked_mutton = meat('#8a5232', '#c09060', true);
IP.chicken = (t, r) => { clear(t); blob(t, r, 7, 7.5, 5, 4.5, hex('#f0c8b0'), 0.06); line(t, 10, 10, 13, 13, hex('#f0ece0')); outline(t); };
IP.cooked_chicken = (t, r) => { clear(t); blob(t, r, 7, 7.5, 5, 4.5, hex('#c8884a'), 0.06); line(t, 10, 10, 13, 13, hex('#f0ece0')); outline(t); };
IP.rotten_flesh = meat('#7a8a4a', '#a05a3a', false);
IP.bread = (t, r) => { clear(t); blob(t, r, 8, 9, 7, 3.5, hex('#c08a3a'), 0.04); for (const x of [4, 7, 10]) { t.set(x, 7, hex('#e8c070')); t.set(x + 1, 8, hex('#e8c070')); } outline(t); };
IP.leather = (t, r) => { clear(t); blob(t, r, 8, 8, 6, 6, hex('#8a5230'), 0.25); outline(t); };
IP.feather = (t) => { clear(t); line(t, 3, 13, 12, 3, hex('#d8d8d8'), 2); line(t, 3, 13, 11, 4, hex('#a0a0a0')); outline(t, [90, 90, 90]); };
IP.bone = (t) => { clear(t); line(t, 4, 12, 11, 5, hex('#ece8d8'), 2); for (const [x, y] of [[3, 12], [4, 13], [12, 4], [11, 3], [13, 5]]) t.set(x, y, hex('#ece8d8')); outline(t, [80, 80, 70]); };
IP.arrow = (t) => {
  clear(t); line(t, 3, 12, 12, 3, hex('#7a5a30'));
  t.set(12, 3, hex('#c8c8c8')); t.set(13, 2, hex('#e0e0e0')); t.set(11, 3, hex('#a0a0a0')); t.set(12, 4, hex('#a0a0a0'));
  t.set(2, 12, hex('#f0f0f0')); t.set(3, 13, hex('#f0f0f0')); t.set(2, 13, hex('#d0d0d0')); t.set(4, 13, hex('#d0d0d0')); t.set(2, 11, hex('#d0d0d0'));
};
IP.string = (t) => { clear(t); for (let x = 2; x < 14; x++) t.set(x, Math.round(8 + Math.sin(x * 0.9) * 3), hex('#f0f0f0')); outline(t, [120, 120, 120]); };
const bowl = (fill?: string) => (t: Tile, r: () => number) => {
  clear(t);
  for (let y = 8; y < 13; y++) for (let x = 2 + (y - 8); x < 14 - (y - 8); x++) t.set(x, y, sh(hex('#8a5a2a'), 1 + (r() - 0.5) * 0.1));
  for (let x = 2; x < 14; x++) t.set(x, 8, fill ? sh(hex(fill), 1 + (r() - 0.5) * 0.2) : hex('#5a3a1a'));
  if (fill) for (let x = 3; x < 13; x++) t.set(x, 7, sh(hex(fill), 1.1 + (r() - 0.5) * 0.2));
  outline(t);
};
IP.bowl = bowl();
IP.mushroom_stew = bowl('#b08a5a');

function toolIcon(type: string, mat: C3): IconPainter {
  return (t) => {
    clear(t);
    const wood = hex('#7a5a30'), woodD = hex('#4e3618');
    const m = mat, mD = sh(mat, 0.7), mL = sh(mat, 1.2);
    if (type === 'sword') {
      for (let i = 0; i < 10; i++) { t.set(5 + i, 10 - i, mL); t.set(6 + i, 10 - i, m); t.set(6 + i, 11 - i, mD); }
      line(t, 2, 9, 6, 13, woodD);
      line(t, 3, 9, 6, 12, wood);
      line(t, 1, 14, 4, 11, wood);
      t.set(1, 15, woodD);
    } else {
      // handle
      for (let i = 0; i < 11; i++) { t.set(2 + i, 13 - i, wood); t.set(3 + i, 13 - i, woodD); }
      if (type === 'pickaxe') {
        const pts: [number, number][] = [[3, 2], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 2], [11, 2], [12, 3], [13, 4], [13, 5], [14, 6], [14, 7], [14, 8], [14, 9], [14, 10], [13, 11]];
        pts.forEach(([x, y], i) => { t.set(x, y, mL); t.set(x - (i > 9 ? 1 : 0), y + (i <= 9 ? 1 : 0), m); });
        t.set(11, 3, mD); t.set(12, 4, mD); t.set(12, 5, mD);
      } else if (type === 'axe') {
        for (let y = 1; y < 8; y++) for (let x = 8; x < 14; x++) {
          const inside = (x - 8) + (7 - y) > 2 && x - 8 < 6 - Math.abs(y - 4) * 0.5;
          if (inside) t.set(x, y, y < 3 ? mL : x > 11 ? mD : m);
        }
      } else if (type === 'shovel') {
        for (let y = 0; y < 7; y++) for (let x = 9; x < 16; x++) {
          const dx = x - 12, dy = y - 3;
          if (dx * dx + dy * dy < 9 && !(x < 11 && y > 4)) t.set(x, y, dx + dy < -1 ? mL : dx + dy > 2 ? mD : m);
        }
      }
    }
    outline(t, [24, 20, 16]);
  };
}

export class IconFactory {
  private cache = new Map<number, HTMLCanvasElement>();
  private urlCache = new Map<number, string>();
  private texCache = new Map<number, THREE.Texture>();
  constructor(private atlas: TextureAtlas) {}

  canvas(id: number): HTMLCanvasElement {
    let c = this.cache.get(id);
    if (c) return c;
    c = this.build(id);
    this.cache.set(id, c);
    return c;
  }

  url(id: number): string {
    let u = this.urlCache.get(id);
    if (!u) { u = this.canvas(id).toDataURL(); this.urlCache.set(id, u); }
    return u;
  }

  /** Flat texture (16px) for 3D sprites of non-block items. */
  texture(id: number): THREE.Texture {
    let tex = this.texCache.get(id);
    if (!tex) {
      tex = new THREE.CanvasTexture(this.flat(id));
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.texCache.set(id, tex);
    }
    return tex;
  }

  flat(id: number): HTMLCanvasElement {
    const d = itemDef(id);
    if (d.isBlock) return this.atlas.tileCanvas(block(id).side === 'door_bottom' ? 'door_top' : block(id).side);
    const c = document.createElement('canvas');
    c.width = T; c.height = T;
    const t = new Tile();
    this.paintItem(id, t);
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.data), T, T), 0, 0);
    return c;
  }

  private paintItem(id: number, t: Tile) {
    const d = itemDef(id);
    if (d.tool) {
      const m = TOOL_MATERIALS.find((x) => x.key === d.tool!.material)!;
      toolIcon(d.tool.type, hex(m.color))(t, mulberry32(id));
    } else if (IP[d.key]) IP[d.key](t, mulberry32(hashString(d.key)));
    else { clear(t); blob(t, mulberry32(id), 8, 8, 5, 5, [200, 0, 200]); }
  }

  private build(id: number): HTMLCanvasElement {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const d = itemDef(id);
    if (!d.isBlock) {
      ctx.drawImage(this.flat(id), 0, 0, S, S);
      return c;
    }
    const b = block(id);
    if (b.shape === 'cross' || b.shape === 'torch') {
      ctx.drawImage(this.atlas.tileCanvas(b.side), 0, 0, S, S);
      return c;
    }
    if (b.shape === 'door') {
      ctx.drawImage(this.atlas.tileCanvas('door_top'), 16, 0, 32, 32);
      ctx.drawImage(this.atlas.tileCanvas('door_bottom'), 16, 32, 32, 32);
      return c;
    }
    const h = b.shape === 'slab' ? 0.5 : b.shape === 'bed' ? 0.5625 : 1;
    const top = this.atlas.tileCanvas(b.shape === 'bed' ? 'bed_head_top' : b.top);
    const side = this.atlas.tileCanvas(b.side);
    const front = this.atlas.tileCanvas(b.front ?? b.side);
    if (b.tint) this.tintCanvas(top, [0.95, 1.05, 0.85]);
    const off = (1 - h) * 30;
    // left (front) face
    ctx.save();
    ctx.setTransform(28 / 16, 14 / 16, 0, (30 * h) / (16 * h), 4, 18 + off);
    ctx.drawImage(front, 0, 16 * (1 - h), 16, 16 * h, 0, 0, 16, 16 * h);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.restore();
    // right face
    ctx.save();
    ctx.setTransform(28 / 16, -14 / 16, 0, 30 / 16, 32, 32 + off);
    ctx.drawImage(side, 0, 16 * (1 - h), 16, 16 * h, 0, 0, 16, 16 * h);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.restore();
    // top
    ctx.save();
    ctx.setTransform(28 / 16, -14 / 16, 28 / 16, 14 / 16, 4, 18 + off);
    ctx.drawImage(top, 0, 0);
    ctx.restore();
    return c;
  }

  private tintCanvas(c: HTMLCanvasElement, tint: number[]) {
    const ctx = c.getContext('2d')!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] *= tint[0]; img.data[i + 1] *= tint[1]; img.data[i + 2] *= tint[2];
    }
    ctx.putImageData(img, 0, 0);
  }
}

// HUD icons (hearts, hunger, bubbles)
export function hudIcon(kind: string): string {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const ctx = c.getContext('2d')!;
  const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const heart = ['.XX...XX.', 'XooX.XooX', 'XoaooooaX', 'XooooooоX', 'XoooooooX', '.XoooooX.', '..XoooX..', '...XoX...', '....X....'];
  if (kind.startsWith('heart')) {
    heart.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'X') px(x, y, '#1a0505');
      else if (ch !== '.') {
        const filled = kind === 'heart_full' || (kind === 'heart_half' && x < 5);
        px(x, y, filled ? (ch === 'a' ? '#ff9a9a' : y < 3 ? '#ff3030' : '#c81010') : '#3a2020');
      }
    }));
  } else if (kind.startsWith('food')) {
    const shape = ['.....XX..', '....XooX.', '...XoooX.', '..XoooX..', '.XoooX...', 'XoaoX....', 'XooX.....', 'XbbX.....', '.XX......'];
    shape.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'X') px(x, y, '#1a1005');
      else if (ch !== '.') {
        const filled = kind === 'food_full' || (kind === 'food_half' && x > 3);
        px(x, y, filled ? (ch === 'b' ? '#f0e8d8' : ch === 'a' ? '#e8b070' : '#b0662a') : '#3a2a1a');
      }
    }));
  } else if (kind === 'bubble') {
    ctx.strokeStyle = '#2050c0';
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d < 4.2 && d > 3.2) px(x, y, '#3060d0');
      else if (d <= 3.2) px(x, y, '#a0c8ff');
    }
    px(3, 2, '#ffffff');
  }
  return c.toDataURL();
}

export function allBlockTextures(): string[] {
  return BLOCKS.filter(Boolean).map((b) => b!.key);
}
export { ITEMS };
