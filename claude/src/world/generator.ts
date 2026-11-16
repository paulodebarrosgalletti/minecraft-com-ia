// Deterministic procedural world generation: terrain, biomes, rivers, caves, ores, trees, vegetation.
import { Simplex, hash2, hash3, mulberry32, smoothstep, lerp } from '../core/noise';
import { B } from './blocks';

export const CS = 16; // chunk size (x/z)
export const WH = 128; // world height
export const SEA = 62;

export enum Biome { PLAINS, FOREST, DESERT, MOUNTAINS, TAIGA, BIRCH_FOREST, BEACH, RIVER, OCEAN }
export const BIOME_NAMES = ['Planícies', 'Floresta', 'Deserto', 'Montanhas', 'Taiga Nevada', 'Floresta de Bétulas', 'Praia', 'Rio', 'Lago'];
/** Grass / foliage tints per biome. */
export const BIOME_TINT: [number, number, number][] = [
  [0.94, 0.98, 0.84], [0.8, 0.96, 0.76], [1.12, 1.02, 0.66], [0.78, 0.92, 0.84], [0.72, 0.9, 0.86], [0.95, 1.05, 0.8], [1, 1, 0.9], [0.9, 1, 0.85], [0.9, 1, 0.85],
];

export interface ColumnInfo {
  h: number;
  biome: Biome;
  river: number;
  temp: number;
  humid: number;
}

export type WorldType = 'default' | 'flat';

export const idx = (x: number, y: number, z: number) => x + z * CS + y * CS * CS;

export class Generator {
  private nCont: Simplex; private nDet: Simplex; private nMnt: Simplex; private nRidge: Simplex;
  private nTemp: Simplex; private nHum: Simplex; private nRiver: Simplex; private nCaveA: Simplex;
  private nCaveB: Simplex; private nCheese: Simplex; private nEntrance: Simplex; private nPatch: Simplex;

  constructor(public seed: number, public type: WorldType) {
    const s = (k: number) => (seed * 31 + k * 977) >>> 0;
    this.nCont = new Simplex(s(1)); this.nDet = new Simplex(s(2)); this.nMnt = new Simplex(s(3));
    this.nRidge = new Simplex(s(4)); this.nTemp = new Simplex(s(5)); this.nHum = new Simplex(s(6));
    this.nRiver = new Simplex(s(7)); this.nCaveA = new Simplex(s(8)); this.nCaveB = new Simplex(s(9));
    this.nCheese = new Simplex(s(10)); this.nEntrance = new Simplex(s(11)); this.nPatch = new Simplex(s(12));
  }

  column(x: number, z: number): ColumnInfo {
    if (this.type === 'flat') return { h: 4, biome: Biome.PLAINS, river: 1, temp: 0, humid: 0 };
    const cont = this.nCont.fbm2(x / 700, z / 700, 4);
    const det = this.nDet.fbm2(x / 90, z / 90, 4);
    const mnt = this.nMnt.fbm2(x / 380, z / 380, 3);
    const mF = smoothstep(0.12, 0.5, mnt);
    const ridgeRaw = 1 - Math.abs(this.nRidge.fbm2(x / 170, z / 170, 4));
    const ridge = ridgeRaw * ridgeRaw;
    const temp = this.nTemp.fbm2(x / 520, z / 520, 2) + det * 0.05;
    const humid = this.nHum.fbm2(x / 480, z / 480, 2) + det * 0.05;
    let h = 65 + cont * 11 + det * 5 + mF * (ridge * 48 + 10);
    const dw = smoothstep(0.18, 0.32, temp) * smoothstep(0.1, -0.05, humid) * (1 - mF);
    if (dw > 0) h = lerp(h, 65 + cont * 4 + det * 3 + Math.abs(this.nPatch.noise2(x / 40, z / 40)) * 4, dw);
    const rv = Math.abs(this.nRiver.fbm2(x / 420, z / 420, 3));
    const riverF = smoothstep(0.055, 0.015, rv) * (1 - smoothstep(0.35, 0.7, mF));
    if (riverF > 0) h = lerp(h, 56.5, riverF);
    const hi = Math.floor(h);
    let biome: Biome;
    if (riverF > 0.5 && hi < SEA) biome = Biome.RIVER;
    else if (hi < SEA - 3) biome = Biome.OCEAN;
    else if (mF > 0.55 && hi > 82) biome = Biome.MOUNTAINS;
    else if (dw > 0.5) biome = Biome.DESERT;
    else if (temp < -0.28) biome = Biome.TAIGA;
    else if (hi <= SEA + 1) biome = Biome.BEACH;
    else if (humid > 0.12) biome = temp > 0.05 ? Biome.FOREST : Biome.BIRCH_FOREST;
    else biome = Biome.PLAINS;
    return { h: Math.min(hi, WH - 12), biome, river: riverF, temp, humid };
  }

  /** Coarse cave density sample (trilinearly interpolated during generation). */
  private caveSample(x: number, y: number, z: number): number {
    const a = this.nCaveA.noise3(x / 42, y / 26, z / 42);
    const b = this.nCaveB.noise3(x / 42, y / 26, z / 42);
    const tunnel = a * a + b * b; // small = tunnel
    let v = tunnel / 0.014; // < 1 => cave
    if (y < 48) {
      const c = this.nCheese.noise3(x / 70, y / 30, z / 70);
      const cheese = (0.66 - c) / 0.1; // < 1 when c > 0.56
      v = Math.min(v, cheese + (48 - y < 6 ? (6 - (48 - y)) * 0.4 : 0));
    }
    return v;
  }

  generate(cx: number, cz: number, blocks: Uint8Array, meta: Uint8Array): void {
    const x0 = cx * CS, z0 = cz * CS;
    if (this.type === 'flat') return this.generateFlat(blocks);
    // Column cache (with margin for trees)
    const M = 3, W = CS + M * 2;
    const cols: ColumnInfo[] = new Array(W * W);
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) cols[x + z * W] = this.column(x0 + x - M, z0 + z - M);
    const col = (lx: number, lz: number) => cols[lx + M + (lz + M) * W];

    // Cave samples on a 4x4x4 lattice (5x5 in xz, WH/4+1 in y)
    const SX = 5, SY = WH / 4 + 1;
    const cave = new Float32Array(SX * SX * SY);
    for (let sy = 0; sy < SY; sy++) for (let sz = 0; sz < SX; sz++) for (let sx = 0; sx < SX; sx++) {
      cave[sx + sz * SX + sy * SX * SX] = this.caveSample(x0 + sx * 4, sy * 4, z0 + sz * 4);
    }
    const caveAt = (lx: number, y: number, lz: number) => {
      const fx = lx / 4, fy = y / 4, fz = lz / 4;
      const ix = Math.min(3, Math.floor(fx)), iy = Math.min(SY - 2, Math.floor(fy)), iz = Math.min(3, Math.floor(fz));
      const tx = fx - ix, ty = fy - iy, tz = fz - iz;
      const g = (a: number, b: number, c: number) => cave[a + c * SX + b * SX * SX];
      const c00 = lerp(g(ix, iy, iz), g(ix + 1, iy, iz), tx);
      const c10 = lerp(g(ix, iy + 1, iz), g(ix + 1, iy + 1, iz), tx);
      const c01 = lerp(g(ix, iy, iz + 1), g(ix + 1, iy, iz + 1), tx);
      const c11 = lerp(g(ix, iy + 1, iz + 1), g(ix + 1, iy + 1, iz + 1), tx);
      return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
    };

    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const c = col(lx, lz);
      const h = c.h;
      const entrance = this.nEntrance.noise2(wx / 60, wz / 60) > 0.55 && h > SEA + 2;
      const r = hash2(this.seed, wx, wz);
      let top: number, filler: number, fillDepth: number, deep: number = B.STONE;
      switch (c.biome) {
        case Biome.DESERT: top = B.SAND; filler = B.SAND; fillDepth = 4; deep = B.SANDSTONE; break;
        case Biome.BEACH: top = B.SAND; filler = B.SAND; fillDepth = 3; break;
        case Biome.RIVER: case Biome.OCEAN:
          top = h < SEA - 4 ? (r < 0.3 ? B.CLAY : B.GRAVEL) : B.SAND; filler = top === B.CLAY ? B.CLAY : B.SAND; fillDepth = 3; break;
        case Biome.TAIGA: top = B.SNOWY_GRASS; filler = B.DIRT; fillDepth = 3; break;
        case Biome.MOUNTAINS: {
          const rock = h > 88 + this.nPatch.noise2(wx / 12, wz / 12) * 6;
          top = h > 104 + r * 3 ? B.SNOW : rock ? B.STONE : B.GRASS;
          filler = rock ? B.STONE : B.DIRT; fillDepth = rock ? 1 : 3; break;
        }
        default: top = B.GRASS; filler = B.DIRT; fillDepth = 3 + (r < 0.5 ? 1 : 0);
      }
      if (h < SEA && top === B.GRASS) top = B.DIRT;
      for (let y = 0; y < WH; y++) {
        let id: number = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y < 4 && hash3(this.seed, wx, y, wz) < 0.7 - y * 0.18) id = B.BEDROCK;
        else if (y < h) id = y >= h - fillDepth ? filler : deep === B.SANDSTONE && y < h - fillDepth - 3 ? B.STONE : deep;
        else if (y === h) id = top;
        else if (y <= SEA) id = B.WATER;
        if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && y > 4) {
          const limit = entrance ? h + 1 : h - 5;
          if (y <= limit && !(h < SEA + 2 && y > h - 8) && caveAt(lx, y, lz) < 1) id = y < 11 ? B.AIR : B.AIR;
        }
        if (id !== B.AIR) blocks[idx(lx, y, lz)] = id;
      }
    }

    // Grass under carved surfaces -> dirt fix + surface vegetation
    this.ores(cx, cz, blocks);
    this.decorate(cx, cz, blocks, meta, col);
  }

  private generateFlat(blocks: Uint8Array) {
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      blocks[idx(x, 0, z)] = B.BEDROCK;
      blocks[idx(x, 1, z)] = B.DIRT;
      blocks[idx(x, 2, z)] = B.DIRT;
      blocks[idx(x, 3, z)] = B.DIRT;
      blocks[idx(x, 4, z)] = B.GRASS;
    }
  }

  private ores(cx: number, cz: number, blocks: Uint8Array) {
    const rnd = mulberry32((hash2(this.seed, cx, cz) * 4294967296) >>> 0);
    const vein = (ore: number, tries: number, ymin: number, ymax: number, size: number) => {
      for (let t = 0; t < tries; t++) {
        let x = Math.floor(rnd() * CS), y = ymin + Math.floor(rnd() * (ymax - ymin)), z = Math.floor(rnd() * CS);
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 0 && y < WH) {
            const i = idx(x, y, z);
            if (blocks[i] === B.STONE) blocks[i] = ore;
          }
          const dir = Math.floor(rnd() * 6);
          if (dir === 0) x++; else if (dir === 1) x--; else if (dir === 2) y++; else if (dir === 3) y--; else if (dir === 4) z++; else z--;
        }
      }
    };
    vein(B.COAL_ORE, 18, 5, 115, 12);
    vein(B.IRON_ORE, 12, 5, 66, 8);
    vein(B.COPPER_ORE, 6, 20, 90, 9);
    vein(B.GOLD_ORE, 3, 5, 34, 7);
    vein(B.REDSTONE_ORE, 5, 4, 18, 7);
    vein(B.DIAMOND_ORE, rnd() < 0.7 ? 1 : 2, 4, 16, 5);
    vein(B.GRAVEL, 4, 5, 90, 14);
    vein(B.DIRT, 4, 5, 100, 14);
  }

  private decorate(cx: number, cz: number, blocks: Uint8Array, meta: Uint8Array, col: (x: number, z: number) => ColumnInfo) {
    const x0 = cx * CS, z0 = cz * CS;
    const set = (lx: number, y: number, lz: number, id: number, onlyAir: boolean) => {
      if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= WH) return;
      const i = idx(lx, y, lz);
      const cur = blocks[i];
      if (onlyAir && cur !== B.AIR && cur !== B.TALL_GRASS) return;
      if (!onlyAir && cur !== B.AIR && cur !== B.TALL_GRASS && cur !== B.OAK_LEAVES && cur !== B.BIRCH_LEAVES && cur !== B.SPRUCE_LEAVES && cur !== B.DANDELION && cur !== B.POPPY) return;
      blocks[i] = id;
    };
    const surfaceOk = (lx: number, lz: number, c: ColumnInfo): boolean => {
      // ensure the surface was not carved away by a cave entrance
      const wx = x0 + lx, wz = z0 + lz;
      return c.h > SEA && !(this.nEntrance.noise2(wx / 60, wz / 60) > 0.55 && this.caveSample(wx, c.h, wz) < 1 && this.caveSample(wx, c.h - 1, wz) < 1);
    };
    // Trees (also from neighbours within margin)
    for (let lz = -3; lz < CS + 3; lz++) for (let lx = -3; lx < CS + 3; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const c = col(lx, lz);
      const r = hash2(this.seed + 17, wx, wz);
      let density = 0;
      switch (c.biome) {
        case Biome.PLAINS: density = 0.004; break;
        case Biome.FOREST: density = 0.06; break;
        case Biome.BIRCH_FOREST: density = 0.05; break;
        case Biome.TAIGA: density = 0.035; break;
        case Biome.MOUNTAINS: density = c.h < 92 ? 0.012 : 0; break;
      }
      if (r >= density || c.h >= WH - 14) continue;
      if (c.biome === Biome.MOUNTAINS && c.h > 88) continue;
      if (!surfaceOk(lx, lz, c)) continue;
      const r2 = hash2(this.seed + 23, wx, wz);
      const base = c.h + 1;
      if (c.biome === Biome.TAIGA || (c.biome === Biome.MOUNTAINS && r2 < 0.7)) this.spruce(set, lx, base, lz, r2);
      else if (c.biome === Biome.BIRCH_FOREST || (c.biome === Biome.FOREST && r2 < 0.25)) this.oak(set, lx, base, lz, r2, B.BIRCH_LOG, B.BIRCH_LEAVES);
      else this.oak(set, lx, base, lz, r2, B.OAK_LOG, B.OAK_LEAVES);
      // dirt beneath trunk
      if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) {
        const i = idx(lx, c.h, lz);
        if (blocks[i] === B.GRASS || blocks[i] === B.SNOWY_GRASS) blocks[i] = B.DIRT;
      }
    }
    // Small plants
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const c = col(lx, lz);
      const y = c.h + 1;
      if (y >= WH - 4) continue;
      const below = blocks[idx(lx, c.h, lz)];
      if (blocks[idx(lx, y, lz)] !== B.AIR) continue;
      const r = hash2(this.seed + 41, wx, wz);
      if (below === B.GRASS) {
        const flowerPatch = this.nPatch.noise2(wx / 30, wz / 30) > 0.35;
        let tg = 0.0, fl = 0.0;
        if (c.biome === Biome.PLAINS) { tg = 0.22; fl = flowerPatch ? 0.12 : 0.01; }
        else if (c.biome === Biome.FOREST || c.biome === Biome.BIRCH_FOREST) { tg = 0.12; fl = flowerPatch ? 0.06 : 0.008; }
        else if (c.biome === Biome.MOUNTAINS) tg = 0.08;
        else tg = 0.05;
        if (r < fl) blocks[idx(lx, y, lz)] = hash2(this.seed + 5, wx, wz) < 0.5 ? B.DANDELION : B.POPPY;
        else if (r < fl + tg) blocks[idx(lx, y, lz)] = B.TALL_GRASS;
        else if ((c.biome === Biome.FOREST || c.biome === Biome.TAIGA) && r > 0.993) blocks[idx(lx, y, lz)] = r > 0.9965 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
      } else if (below === B.SAND && c.biome === Biome.DESERT) {
        if (r < 0.006 && lx > 0 && lz > 0 && lx < CS - 1 && lz < CS - 1) {
          const hgt = 1 + Math.floor(hash2(this.seed + 9, wx, wz) * 3);
          for (let k = 0; k < hgt; k++) blocks[idx(lx, y + k, lz)] = B.CACTUS;
        } else if (r < 0.014) blocks[idx(lx, y, lz)] = B.DEAD_BUSH;
      } else if (below === B.SNOWY_GRASS && r < 0.05) {
        blocks[idx(lx, y, lz)] = B.TALL_GRASS;
      }
    }
    // Cave mushrooms + gravel pockets near cave floors already from ores
  }

  oak(set: (x: number, y: number, z: number, id: number, onlyAir: boolean) => void, x: number, y: number, z: number, r: number, log: number, leaf: number) {
    const h = 4 + Math.floor(r * 3);
    const top = y + h;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy <= -1 ? 2 : 1;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 1 || hash3(this.seed, x + dx, top + dy, z + dz) < 0.5)) continue;
        set(x + dx, top + dy, z + dz, leaf, true);
      }
    }
    for (let k = 0; k < h; k++) set(x, y + k, z, log, false);
  }

  spruce(set: (x: number, y: number, z: number, id: number, onlyAir: boolean) => void, x: number, y: number, z: number, r: number) {
    const h = 6 + Math.floor(r * 4);
    const top = y + h;
    set(x, top, z, B.SPRUCE_LEAVES, true);
    set(x, top + 1, z, B.SPRUCE_LEAVES, true);
    for (let yy = top - 1, i = 0; yy >= y + 2; yy--, i++) {
      const rad = Math.max(1, Math.min(2, 1 + Math.floor(i / 2)) - (i % 2 === 0 && i > 0 ? 1 : 0));
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
        set(x + dx, yy, z + dz, B.SPRUCE_LEAVES, true);
      }
    }
    for (let k = 0; k < h; k++) set(x, y + k, z, B.SPRUCE_LOG, false);
  }

  /** Finds a safe spawn column (grass, above sea, plains/forest preferred). */
  findSpawn(): { x: number; z: number } {
    if (this.type === 'flat') return { x: 0.5, z: 0.5 };
    for (let rad = 0; rad < 2000; rad += 8) {
      const steps = Math.max(1, Math.floor((rad * 6.28) / 16));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * rad), z = Math.round(Math.sin(a) * rad);
        const c = this.column(x, z);
        if ((c.biome === Biome.PLAINS || c.biome === Biome.FOREST || c.biome === Biome.BIRCH_FOREST) && c.h > SEA + 1 && c.h < 90) {
          // ensure some trees nearby (forest within 24 blocks) for a good start
          let near = c.biome !== Biome.PLAINS;
          for (let k = 0; k < 12 && !near; k++) {
            const b = this.column(x + Math.cos(k) * 20, z + Math.sin(k) * 20).biome;
            if (b === Biome.FOREST || b === Biome.BIRCH_FOREST) near = true;
          }
          if (near || rad > 600) return { x: x + 0.5, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, z: 0.5 };
  }
}
