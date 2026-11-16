// World: chunk storage, streaming (load/unload), player modifications, meshing, raycasts and simple block updates.
import * as THREE from 'three';
import { B, BLOCKS, SOLID, block } from './blocks';
import { CS, WH, Generator, idx, BIOME_TINT, Biome } from './generator';
import { buildChunkMesh, PAD, PW, MeshData } from '../render/mesher';
import type { TextureAtlas } from '../render/textures';

export class Chunk {
  blocks = new Uint8Array(CS * CS * WH);
  meta = new Uint8Array(CS * CS * WH);
  biomes = new Uint8Array(CS * CS);
  tint = new Float32Array(CS * CS * 3);
  sky: Uint8Array | null = null;
  blk: Uint8Array | null = null;
  mesh: THREE.Mesh | null = null;
  water: THREE.Mesh | null = null;
  dirty = true;
  constructor(public cx: number, public cz: number) {}
}

export interface RayHit {
  x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number; dist: number;
  point: THREE.Vector3;
}

const key = (cx: number, cz: number) => (cx + 1048576) * 2097152 + (cz + 1048576); // exact numeric key
const chunkKeyStr = (cx: number, cz: number) => `${cx},${cz}`;

export class World {
  chunks = new Map<number, Chunk>();
  mods: Map<string, Map<number, number>>;
  group = new THREE.Group();
  radius = 6;
  fancy = true;
  smooth = true;
  private uvCache = new Map<string, number[]>();
  private fluidQueue: [number, number, number, number][] = [];
  private fluidTimer = 0;
  onBlockChanged: ((x: number, y: number, z: number, oldId: number, newId: number) => void) | null = null;
  generatedCount = 0;

  constructor(
    public gen: Generator,
    private atlas: TextureAtlas,
    private solidMat: THREE.Material,
    private waterMat: THREE.Material,
    mods?: Map<string, Map<number, number>>,
  ) {
    this.mods = mods ?? new Map();
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(key(cx, cz));
  }

  isLoaded(x: number, z: number): boolean {
    return !!this.getChunk(Math.floor(x / CS), Math.floor(z / CS));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= WH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return B.AIR;
    return c.blocks[idx(x - cx * CS, y, z - cz * CS)];
  }

  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= WH) return 0;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return 0;
    return c.meta[idx(x - cx * CS, y, z - cz * CS)];
  }

  /** Returns [sky, block] light 0..15. */
  getLight(x: number, y: number, z: number): [number, number] {
    if (y >= WH) return [15, 0];
    if (y < 0) return [0, 0];
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c || !c.sky || !c.blk) return [15, 0];
    const i = idx(x - cx * CS, y, z - cz * CS);
    return [c.sky[i], c.blk[i]];
  }

  biomeAt(x: number, z: number): Biome {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return this.gen.column(x, z).biome;
    return c.biomes[(x - cx * CS) + (z - cz * CS) * CS];
  }

  setBlock(x: number, y: number, z: number, id: number, meta = 0, record = true, immediate = true): void {
    if (y < 0 || y >= WH) return;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    if (!c) return;
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = idx(lx, y, lz);
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return;
    c.blocks[i] = id;
    c.meta[i] = meta;
    if (record) {
      const k = chunkKeyStr(cx, cz);
      let m = this.mods.get(k);
      if (!m) { m = new Map(); this.mods.set(k, m); }
      m.set(i, id | (meta << 8));
    }
    // Remesh: own chunk + touching neighbours now, others (light range) lazily
    const touch: Chunk[] = [c];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.getChunk(cx + dx, cz + dz);
      if (!n) continue;
      const nearX = dx === 0 || (dx < 0 ? lx === 0 : lx === CS - 1);
      const nearZ = dz === 0 || (dz < 0 ? lz === 0 : lz === CS - 1);
      if (nearX && nearZ) touch.push(n);
      else n.dirty = true;
    }
    if (immediate) for (const t of touch) this.remesh(t);
    else for (const t of touch) t.dirty = true;
    this.onBlockChanged?.(x, y, z, old, id);
  }

  /** Streams chunks around a position. Returns number of chunks still pending. */
  update(px: number, pz: number, budgetMs: number): number {
    const t0 = performance.now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const R = this.radius;
    // Unload far chunks
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > R + 2 || Math.abs(c.cz - pcz) > R + 2) {
        this.disposeChunk(c);
        this.chunks.delete(k);
      }
    }
    // Generate missing chunks (radius + 1 so meshing has neighbours), nearest first
    const missing: [number, number, number][] = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      if (!this.getChunk(pcx + dx, pcz + dz)) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
    }
    missing.sort((a, b) => a[0] - b[0]);
    let pending = missing.length;
    for (const [, cx, cz] of missing) {
      if (performance.now() - t0 > budgetMs * 0.5 && pending < missing.length) break;
      this.generateChunk(cx, cz);
      pending--;
    }
    // Mesh dirty chunks whose neighbours exist
    const dirty: [number, Chunk][] = [];
    for (const c of this.chunks.values()) {
      if (!c.dirty) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
      dirty.push([dx * dx + dz * dz, c]);
    }
    dirty.sort((a, b) => a[0] - b[0]);
    let meshed = 0;
    for (const [, c] of dirty) {
      if (performance.now() - t0 > budgetMs && meshed > 0) break;
      if (!this.neighboursReady(c)) continue;
      this.remesh(c);
      meshed++;
    }
    pending += dirty.length - meshed;
    // Hide chunk meshes outside radius (fog distance)
    return pending;
  }

  private neighboursReady(c: Chunk): boolean {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.getChunk(c.cx + dx, c.cz + dz)) return false;
    return true;
  }

  generateChunk(cx: number, cz: number): Chunk {
    const c = new Chunk(cx, cz);
    this.gen.generate(cx, cz, c.blocks, c.meta);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = this.gen.column(cx * CS + x, cz * CS + z);
      c.biomes[x + z * CS] = col.biome;
    }
    // smooth tint (average 3x3 of biome tints along chunk using generator columns at offsets)
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox * 2, zz = z + oz * 2;
        const bi = xx >= 0 && zz >= 0 && xx < CS && zz < CS ? c.biomes[xx + zz * CS] : c.biomes[x + z * CS];
        const t = BIOME_TINT[bi];
        r += t[0]; g += t[1]; b += t[2]; n++;
      }
      const i = (x + z * CS) * 3;
      c.tint[i] = r / n; c.tint[i + 1] = g / n; c.tint[i + 2] = b / n;
    }
    const m = this.mods.get(chunkKeyStr(cx, cz));
    if (m) for (const [i, v] of m) { c.blocks[i] = v & 255; c.meta[i] = v >> 8; }
    this.chunks.set(key(cx, cz), c);
    this.generatedCount++;
    // neighbours need remesh to include this chunk's border
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(cx + dx, cz + dz);
      if (n) n.dirty = true;
    }
    return c;
  }

  private padded = { blocks: new Uint8Array(PW * PW * WH), meta: new Uint8Array(PW * PW * WH) };

  remesh(c: Chunk): void {
    if (!this.neighboursReady(c)) { c.dirty = true; return; }
    const pb = this.padded.blocks, pm = this.padded.meta;
    const PA = PW * PW;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz)!;
      // source x/z ranges within neighbour, destination offsets in padded
      const sx0 = dx < 0 ? CS - PAD : 0, sx1 = dx > 0 ? PAD : CS;
      const sz0 = dz < 0 ? CS - PAD : 0, sz1 = dz > 0 ? PAD : CS;
      const ox = dx < 0 ? 0 : dx === 0 ? PAD : PAD + CS;
      const oz = dz < 0 ? 0 : dz === 0 ? PAD : PAD + CS;
      const len = sx1 - sx0;
      for (let y = 0; y < WH; y++) for (let z = sz0; z < sz1; z++) {
        const s = idx(sx0, y, z);
        const d = ox + (oz + z - sz0) * PW + y * PA;
        pb.set(n.blocks.subarray(s, s + len), d);
        pm.set(n.meta.subarray(s, s + len), d);
      }
    }
    const res = buildChunkMesh({ blocks: pb, meta: pm, tint: c.tint, fancy: this.fancy, smooth: this.smooth }, this.atlas, this.uvCache);
    // Store center light for gameplay queries
    const sky = new Uint8Array(CS * CS * WH), blk = new Uint8Array(CS * CS * WH);
    for (let y = 0; y < WH; y++) for (let z = 0; z < CS; z++) {
      const s = PAD + (z + PAD) * PW + y * PA;
      const d = idx(0, y, z);
      sky.set(res.sky.subarray(s, s + CS), d);
      blk.set(res.blk.subarray(s, s + CS), d);
    }
    c.sky = sky; c.blk = blk;
    this.disposeChunk(c);
    if (res.solid) c.mesh = this.makeMesh(res.solid, this.solidMat, c);
    if (res.water) { c.water = this.makeMesh(res.water, this.waterMat, c); c.water.renderOrder = 1; }
    c.dirty = false;
  }

  private makeMesh(d: MeshData, mat: THREE.Material, c: Chunk): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
    g.setAttribute('light', new THREE.BufferAttribute(d.light, 2));
    g.setAttribute('color', new THREE.BufferAttribute(d.color, 3));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.position.set(c.cx * CS, 0, c.cz * CS);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.group.add(m);
    return m;
  }

  private disposeChunk(c: Chunk) {
    for (const m of [c.mesh, c.water]) {
      if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
    c.mesh = null; c.water = null;
  }

  dispose() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
  }

  remeshAll() { for (const c of this.chunks.values()) c.dirty = true; }

  /** Highest non-air, non-plant block at x,z (or -1). */
  surfaceY(x: number, z: number): number {
    for (let y = WH - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && SOLID[id]) return y;
      if (id === B.WATER) return y;
    }
    return -1;
  }

  /** Voxel DDA raycast against block selection boxes (ignores air and water). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): RayHit | null {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx !== 0 ? Math.abs(1 / d.x) : Infinity, tdy = sy !== 0 ? Math.abs(1 / d.y) : Infinity, tdz = sz !== 0 ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    for (let step = 0; step < 64; step++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && id !== B.WATER) {
        const boxes = selectionBoxes(id, this.getMeta(x, y, z));
        let best: RayHit | null = null;
        for (const b of boxes) {
          const h = rayBox(o, d, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
          if (h && h.t <= maxDist && (!best || h.t < best.dist)) {
            best = { x, y, z, nx: h.n[0], ny: h.n[1], nz: h.n[2], id, dist: h.t, point: o.clone().addScaledVector(d, h.t) };
          }
        }
        if (best) return best;
      }
      if (tmx < tmy && tmx < tmz) { if (tmx > maxDist) break; x += sx; tmx += tdx; }
      else if (tmy < tmz) { if (tmy > maxDist) break; y += sy; tmy += tdy; }
      else { if (tmz > maxDist) break; z += sz; tmz += tdz; }
    }
    return null;
  }

  // ---------------- Block updates (gravity + simple fluid) ----------------
  afterRemoved(x: number, y: number, z: number) {
    this.checkFalling(x, y + 1, z);
    // water inflow
    const nb = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    if (nb.some(([dx, dy, dz]) => this.getBlock(x + dx, y + dy, z + dz) === B.WATER)) this.fluidQueue.push([x, y, z, 6]);
  }

  checkFalling(x: number, y: number, z: number) {
    let yy = y;
    while (yy < WH) {
      const id = this.getBlock(x, yy, z);
      if (!block(id).gravity) break;
      const below = this.getBlock(x, yy - 1, z);
      if (SOLID[below]) break;
      // find landing
      let land = yy - 1;
      while (land > 0) {
        const b = this.getBlock(x, land - 1, z);
        if (SOLID[b]) break;
        land--;
      }
      this.setBlock(x, yy, z, B.AIR);
      this.setBlock(x, land, z, id);
      yy++;
    }
  }

  tickFluids(dt: number) {
    this.fluidTimer += dt;
    if (this.fluidTimer < 0.25 || this.fluidQueue.length === 0) return;
    this.fluidTimer = 0;
    const q = this.fluidQueue;
    this.fluidQueue = [];
    let n = 0;
    for (const [x, y, z, budget] of q) {
      if (n++ > 64) { this.fluidQueue.push([x, y, z, budget]); continue; }
      const cur = this.getBlock(x, y, z);
      if (cur !== B.AIR && !block(cur).replaceable) continue;
      if (cur === B.WATER) continue;
      const above = this.getBlock(x, y + 1, z) === B.WATER;
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.getBlock(x + dx, y, z + dz) === B.WATER && SOLID[this.getBlock(x + dx, y - 1, z + dz)]);
      if (!above && !side) continue;
      this.setBlock(x, y, z, B.WATER, 0, true, false);
      const below = this.getBlock(x, y - 1, z);
      if (below === B.AIR || block(below).replaceable && below !== B.WATER) this.fluidQueue.push([x, y - 1, z, budget]);
      else if (budget > 0) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const b = this.getBlock(x + dx, y, z + dz);
        if (b === B.AIR || (block(b).replaceable && b !== B.WATER)) this.fluidQueue.push([x + dx, y, z + dz, budget - 1]);
      }
    }
  }
}

// ---------------- Shapes ----------------
type Box = [number, number, number, number, number, number];
const FULL: Box[] = [[0, 0, 0, 1, 1, 1]];

export function selectionBoxes(id: number, meta: number): Box[] {
  const d = BLOCKS[id];
  if (!d) return FULL;
  switch (d.shape) {
    case 'slab': return [[0, 0, 0, 1, 0.5, 1]];
    case 'torch': {
      const w = meta & 7;
      let ox = 0, oz = 0, oy = 0;
      if (w === 1) { oz = -0.34; oy = 0.2; } else if (w === 2) { ox = 0.34; oy = 0.2; } else if (w === 3) { oz = 0.34; oy = 0.2; } else if (w === 4) { ox = -0.34; oy = 0.2; }
      return [[0.38 + ox, oy, 0.38 + oz, 0.62 + ox, 0.65 + oy, 0.62 + oz]];
    }
    case 'cross': return [[0.15, 0, 0.15, 0.85, 0.85, 0.85]];
    case 'bed': return [[0, 0, 0, 1, 0.5625, 1]];
    case 'cactus': return [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]];
    case 'door': return [doorBox(meta)];
    case 'stairs': return stairBoxes(meta);
    default: return FULL;
  }
}

function doorBox(meta: number): Box {
  const d = ((meta & 3) + ((meta & 4) ? 1 : 0)) % 4;
  const th = 3 / 16;
  if (d === 0) return [0, 0, 0, 1, 1, th];
  if (d === 1) return [1 - th, 0, 0, 1, 1, 1];
  if (d === 2) return [0, 0, 1 - th, 1, 1, 1];
  return [0, 0, 0, th, 1, 1];
}

function stairBoxes(meta: number): Box[] {
  const f = meta & 3;
  const top: Box = [0, 0.5, 0, 1, 1, 1];
  if (f === 0) top[2] = 0.5; else if (f === 1) top[3] = 0.5; else if (f === 2) top[5] = 0.5; else top[0] = 0.5;
  return [[0, 0, 0, 1, 0.5, 1], top];
}

/** Collision boxes for physics. */
export function collisionBoxes(id: number, meta: number): Box[] | null {
  const d = BLOCKS[id];
  if (!d || !d.solid) return null;
  switch (d.shape) {
    case 'slab': return [[0, 0, 0, 1, 0.5, 1]];
    case 'bed': return [[0, 0, 0, 1, 0.5625, 1]];
    case 'cactus': return [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]];
    case 'door': return [doorBox(meta)];
    case 'stairs': return stairBoxes(meta);
    default: return FULL;
  }
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): { t: number; n: number[] } | null {
  let tmin = -Infinity, tmax = Infinity;
  let n: number[] = [0, 0, 0];
  const axes: [number, number, number, number][] = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (let a = 0; a < 3; a++) {
    const [oo, dd, lo, hi] = axes[a];
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return null; continue; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
    let sign = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[a] = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), n };
}

export { chunkKeyStr };
