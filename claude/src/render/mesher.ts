// Chunk mesher: computes voxel lighting (sky + block light BFS) on a padded region and builds
// face-culled geometry with smooth lighting + ambient occlusion. Water goes to a separate mesh.
import { OPAQUE, LIGHT, ATTEN, SHAPE_CODE, BLOCKS, B, isLeaves } from '../world/blocks';
import { CS, WH } from '../world/generator';
import type { TextureAtlas } from './textures';

export const PAD = 8;
export const PW = CS + PAD * 2; // padded width (32)
const PA = PW * PW;

export interface MeshData {
  pos: Float32Array; uv: Float32Array; light: Float32Array; color: Float32Array; index: Uint32Array;
}
export interface MeshResult { solid: MeshData | null; water: MeshData | null; sky: Uint8Array; blk: Uint8Array; }

class Buf {
  pos: number[] = []; uv: number[] = []; light: number[] = []; color: number[] = []; index: number[] = [];
  vc = 0;
  out(): MeshData | null {
    if (this.vc === 0) return null;
    return {
      pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), light: new Float32Array(this.light),
      color: new Float32Array(this.color), index: new Uint32Array(this.index),
    };
  }
}

// Face table: dir, normal, corners (CCW from outside)
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62, kind: 'side' }, // +X
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62, kind: 'side' }, // -X
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, kind: 'top' }, // +Y
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, kind: 'bottom' }, // -Y
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8, kind: 'side' }, // +Z
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, kind: 'side' }, // -Z
] as const;
const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
/** facing meta -> face index of the "front" (0:+Z 1:-X 2:-Z 3:+X) */
export const FACING_FACE = [4, 1, 5, 0];
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

export interface MeshInput {
  blocks: Uint8Array; // padded PW*PW*WH
  meta: Uint8Array;
  tint: Float32Array; // 3 * CS * CS biome tint for the center chunk
  fancy: boolean;
  smooth: boolean;
}

const Q = new Int32Array(1 << 19);

function computeLight(blocks: Uint8Array, maxY: number): { sky: Uint8Array; blk: Uint8Array } {
  const N = PA * WH;
  const sky = new Uint8Array(N);
  const blk = new Uint8Array(N);
  // Sky light: straight down
  for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
    let l = 15;
    for (let y = WH - 1; y >= 0; y--) {
      const i = x + z * PW + y * PA;
      const id = blocks[i];
      const a = ATTEN[id];
      if (a >= 15) l = 0; else if (a) l = Math.max(0, l - a);
      sky[i] = l;
      if (l === 0 && y < maxY) { /* rest stays 0 */ for (let yy = y - 1; yy >= 0; yy--) sky[x + z * PW + yy * PA] = 0; break; }
    }
  }
  // Seed BFS: lit cells adjacent to darker cells
  let head = 0, tail = 0;
  const MASK = Q.length - 1;
  const top = Math.min(WH - 1, maxY + 1);
  for (let y = 0; y <= top; y++) for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
    const i = x + z * PW + y * PA;
    const l = sky[i];
    if (l < 2) continue;
    if ((x > 0 && sky[i - 1] < l - 1) || (x < PW - 1 && sky[i + 1] < l - 1) || (z > 0 && sky[i - PW] < l - 1) || (z < PW - 1 && sky[i + PW] < l - 1) || (y > 0 && sky[i - PA] < l - 1)) {
      Q[tail++ & MASK] = i;
    }
  }
  const spread = (arr: Uint8Array) => {
    while (head !== tail) {
      const i = Q[head++ & MASK];
      const l = arr[i];
      if (l <= 1) continue;
      const x = i % PW, z = ((i / PW) | 0) % PW, y = (i / PA) | 0;
      for (let d = 0; d < 6; d++) {
        let j: number;
        if (d === 0) { if (x === PW - 1) continue; j = i + 1; }
        else if (d === 1) { if (x === 0) continue; j = i - 1; }
        else if (d === 2) { if (z === PW - 1) continue; j = i + PW; }
        else if (d === 3) { if (z === 0) continue; j = i - PW; }
        else if (d === 4) { if (y === WH - 1) continue; j = i + PA; }
        else { if (y === 0) continue; j = i - PA; }
        const a = ATTEN[blocks[j]];
        if (a >= 15) continue;
        const nl = l - 1 - a;
        if (nl > arr[j]) { arr[j] = nl; Q[tail++ & MASK] = j; }
      }
    }
  };
  spread(sky);
  head = 0; tail = 0;
  for (let y = 0; y <= top; y++) for (let z = 0; z < PW; z++) for (let x = 0; x < PW; x++) {
    const i = x + z * PW + y * PA;
    const e = LIGHT[blocks[i]];
    if (e > 0) { blk[i] = e; Q[tail++ & MASK] = i; }
  }
  spread(blk);
  return { sky, blk };
}

export function buildChunkMesh(input: MeshInput, atlas: TextureAtlas, uvCache: Map<string, number[]>): MeshResult {
  const { blocks, meta, tint, fancy, smooth } = input;
  let maxY = 0;
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i] !== 0) { maxY = (i / PA) | 0; break; }
  const { sky, blk } = computeLight(blocks, maxY);
  const solid = new Buf(), water = new Buf();

  const getUV = (name: string) => {
    let u = uvCache.get(name);
    if (!u) { u = atlas.uv(name); uvCache.set(name, u); }
    return u;
  };

  const P = (x: number, y: number, z: number) => (x + PAD) + (z + PAD) * PW + y * PA;

  const pushQuad = (buf: Buf, verts: number[][], uvs: number[][], lights: number[][], cols: number[][], flip: boolean) => {
    const b = buf.vc;
    for (let k = 0; k < 4; k++) {
      buf.pos.push(verts[k][0], verts[k][1], verts[k][2]);
      buf.uv.push(uvs[k][0], uvs[k][1]);
      buf.light.push(lights[k][0], lights[k][1]);
      buf.color.push(cols[k][0], cols[k][1], cols[k][2]);
    }
    if (flip) buf.index.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else buf.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    buf.vc += 4;
  };

  const lightAt = (i: number): [number, number] => [sky[i] / 15, blk[i] / 15];

  // Emits an axis-aligned box (in block-local units 0..1) for special shapes.
  const emitBox = (x: number, y: number, z: number, mn: number[], mx: number[], tex: (f: number) => string, li: [number, number], tintC: number[], cullOuter: boolean) => {
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const axis = F.n[0] !== 0 ? 0 : F.n[1] !== 0 ? 1 : 2;
      const onBoundary = F.n[axis] > 0 ? mx[axis] >= 1 : mn[axis] <= 0;
      if (cullOuter && onBoundary) {
        const ny = y + F.n[1];
        if (ny >= 0 && ny < WH && OPAQUE[blocks[P(x + F.n[0], ny, z + F.n[2])]]) continue;
      }
      const t = getUV(tex(f));
      const verts: number[][] = [], uvs: number[][] = [], lights: number[][] = [], cols: number[][] = [];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        const px = c[0] ? mx[0] : mn[0], py = c[1] ? mx[1] : mn[1], pz = c[2] ? mx[2] : mn[2];
        verts.push([x + px, y + py, z + pz]);
        let u: number, v: number;
        if (axis === 0) { u = F.n[0] > 0 ? 1 - pz : pz; v = py; }
        else if (axis === 2) { u = F.n[2] > 0 ? px : 1 - px; v = py; }
        else { u = px; v = F.n[1] > 0 ? 1 - pz : pz; }
        uvs.push([t[0] + (t[2] - t[0]) * u, t[1] + (t[3] - t[1]) * v]);
        lights.push(li);
        const s = F.shade;
        cols.push([tintC[0] * s, tintC[1] * s, tintC[2] * s]);
      }
      pushQuad(solid, verts, uvs, lights, cols, false);
    }
  };

  const WHITE = [1, 1, 1];
  for (let y = 0; y <= Math.min(maxY, WH - 1); y++) {
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const pi = P(x, y, z);
      const id = blocks[pi];
      if (id === 0) continue;
      const sc = SHAPE_CODE[id];
      const def = BLOCKS[id]!;
      const m = meta[pi];
      const ti = (x + z * CS) * 3;
      const tintC = def.tint ? [tint[ti], tint[ti + 1], tint[ti + 2]] : WHITE;
      if (sc === 1) {
        const leaves = isLeaves(id);
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const ny = y + F.n[1];
          let nid = 0;
          if (ny >= 0 && ny < WH) nid = blocks[pi + F.n[0] + F.n[2] * PW + F.n[1] * PA];
          else if (ny < 0) continue;
          if (OPAQUE[nid]) continue;
          if (nid === id && (id === B.GLASS || (leaves && !fancy))) continue;
          // texture
          let tex: string;
          if (def.front && f === FACING_FACE[m & 3]) tex = (m & 4) && def.frontLit ? def.frontLit : def.front;
          else tex = F.kind === 'top' ? def.top : F.kind === 'bottom' ? def.bottom : def.side;
          const t = getUV(tex);
          const faceTint = def.tint && (F.kind === 'top' || leaves) ? tintC : WHITE;
          const fi = pi + F.n[0] + F.n[2] * PW + F.n[1] * PA; // front cell
          const verts: number[][] = [], uvs: number[][] = [], lights: number[][] = [], cols: number[][] = [];
          const aos: number[] = [];
          const axis = F.n[0] !== 0 ? 0 : F.n[1] !== 0 ? 1 : 2;
          const fl = ny >= 0 && ny < WH ? lightAt(fi) : [1, 0] as [number, number];
          for (let k = 0; k < 4; k++) {
            const c = F.c[k];
            verts.push([x + c[0], y + c[1], z + c[2]]);
            uvs.push([t[0] + (t[2] - t[0]) * UVC[k][0], t[1] + (t[3] - t[1]) * UVC[k][1]]);
            let ao = 3;
            let lsky = fl[0], lblk = fl[1];
            if (smooth && ny >= 0 && ny < WH) {
              // tangent offsets
              const o1 = [0, 0, 0], o2 = [0, 0, 0];
              const a1 = axis === 0 ? 1 : 0, a2 = axis === 2 ? 1 : 2;
              o1[a1] = c[a1] ? 1 : -1; o2[a2] = c[a2] ? 1 : -1;
              const off = (o: number[]) => o[0] + o[2] * PW + o[1] * PA;
              const yy1 = ny + o1[1], yy2 = ny + o2[1], yy3 = ny + o1[1] + o2[1];
              const i1 = fi + off(o1), i2 = fi + off(o2), i3 = fi + off(o1) + off(o2);
              const v1 = yy1 >= 0 && yy1 < WH, v2 = yy2 >= 0 && yy2 < WH, v3 = yy3 >= 0 && yy3 < WH;
              const s1 = v1 ? OPAQUE[blocks[i1]] : 0, s2 = v2 ? OPAQUE[blocks[i2]] : 0;
              const s3 = v3 ? OPAQUE[blocks[i3]] : 0;
              ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              let n = 1, ss = sky[fi], bb = blk[fi];
              if (v1 && !s1) { ss += sky[i1]; bb += blk[i1]; n++; }
              if (v2 && !s2) { ss += sky[i2]; bb += blk[i2]; n++; }
              if (v3 && !s3 && !(s1 && s2)) { ss += sky[i3]; bb += blk[i3]; n++; }
              lsky = ss / n / 15; lblk = bb / n / 15;
            }
            aos.push(ao);
            lights.push([lsky, lblk]);
            const s = F.shade * AO_CURVE[ao];
            cols.push([faceTint[0] * s, faceTint[1] * s, faceTint[2] * s]);
          }
          pushQuad(solid, verts, uvs, lights, cols, aos[0] + aos[2] < aos[1] + aos[3]);
        }
      } else if (sc === 2) {
        const t = getUV(def.side);
        const li = lightAt(pi);
        const s = 0.9;
        const col = [tintC[0] * s, tintC[1] * s, tintC[2] * s];
        const lo = 0.15, hi = 0.85;
        const quads = [
          [[x + lo, y, z + lo], [x + hi, y, z + hi], [x + hi, y + 1, z + hi], [x + lo, y + 1, z + lo]],
          [[x + lo, y, z + hi], [x + hi, y, z + lo], [x + hi, y + 1, z + lo], [x + lo, y + 1, z + hi]],
        ];
        const uvs = UVC.map(([u, v]) => [t[0] + (t[2] - t[0]) * u, t[1] + (t[3] - t[1]) * v]);
        for (const q of quads) {
          pushQuad(solid, q, uvs, [li, li, li, li], [col, col, col, col], false);
          pushQuad(solid, [q[1], q[0], q[3], q[2]], [uvs[1], uvs[0], uvs[3], uvs[2]], [li, li, li, li], [col, col, col, col], false);
        }
      } else if (sc === 4) {
        // water
        const t = getUV('water');
        const aboveW = y + 1 < WH && blocks[pi + PA] === B.WATER;
        const top = aboveW ? 1 : 0.875;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const ny = y + F.n[1];
          if (ny < 0) continue;
          const nid = ny < WH ? blocks[pi + F.n[0] + F.n[2] * PW + F.n[1] * PA] : 0;
          if (nid === B.WATER || (OPAQUE[nid] && f !== 2)) continue;
          if (f === 2 && OPAQUE[nid]) continue;
          const fi = ny < WH ? pi + F.n[0] + F.n[2] * PW + F.n[1] * PA : pi;
          const li = lightAt(OPAQUE[nid] ? pi : fi);
          const verts: number[][] = [], uvs: number[][] = [], lights: number[][] = [], cols: number[][] = [];
          for (let k = 0; k < 4; k++) {
            const c = F.c[k];
            verts.push([x + c[0], y + (c[1] ? top : 0), z + c[2]]);
            uvs.push([t[0] + (t[2] - t[0]) * UVC[k][0], t[1] + (t[3] - t[1]) * UVC[k][1]]);
            lights.push(li);
            const s = F.shade;
            cols.push([s, s, s]);
          }
          pushQuad(water, verts, uvs, lights, cols, false);
          if (f === 2) {
            // underside of surface so it is visible from below
            pushQuad(water, [verts[1], verts[0], verts[3], verts[2]], [uvs[1], uvs[0], uvs[3], uvs[2]], lights, cols, false);
          }
        }
      } else {
        const li = lightAt(pi);
        const sh = def.shape;
        const tx = (f: number) => (FACES[f].kind === 'top' ? def.top : FACES[f].kind === 'bottom' ? def.bottom : def.side);
        if (sh === 'slab') emitBox(x, y, z, [0, 0, 0], [1, 0.5, 1], tx, li, WHITE, true);
        else if (sh === 'stairs') {
          emitBox(x, y, z, [0, 0, 0], [1, 0.5, 1], tx, li, WHITE, true);
          const f = m & 3;
          const mn = [0, 0.5, 0], mx = [1, 1, 1];
          if (f === 0) mn[2] = 0.5; else if (f === 1) mx[0] = 0.5; else if (f === 2) mx[2] = 0.5; else mn[0] = 0.5;
          emitBox(x, y, z, mn, mx, tx, li, WHITE, true);
        } else if (sh === 'cactus') {
          emitBox(x, y, z, [1 / 16, 0, 1 / 16], [15 / 16, 1, 15 / 16], tx, li, WHITE, false);
        } else if (sh === 'torch') {
          const lo = 7 / 16, hi = 9 / 16;
          let ox = 0, oz = 0, oy = 0;
          const w = m & 7;
          if (w === 1) { oz = -0.34; oy = 0.2; } else if (w === 2) { ox = 0.34; oy = 0.2; } else if (w === 3) { oz = 0.34; oy = 0.2; } else if (w === 4) { ox = -0.34; oy = 0.2; }
          emitBox(x, y, z, [lo + ox, oy, lo + oz], [hi + ox, 10 / 16 + oy, hi + oz], () => 'torch', [li[0], 1], [1.2, 1.2, 1.2], false);
        } else if (sh === 'door') {
          const top = (m & 8) !== 0;
          const d = ((m & 3) + ((m & 4) ? 1 : 0)) % 4;
          const th = 3 / 16;
          const mn = [0, 0, 0], mx = [1, 1, 1];
          if (d === 0) mx[2] = th; else if (d === 1) mn[0] = 1 - th; else if (d === 2) mn[2] = 1 - th; else mx[0] = th;
          emitBox(x, y, z, mn, mx, () => (top ? 'door_top' : 'door_bottom'), li, WHITE, false);
        } else if (sh === 'bed') {
          const head = (m & 4) !== 0;
          emitBox(x, y, z, [0, 0, 0], [1, 9 / 16, 1], (f) => (f === 2 ? (head ? 'bed_head_top' : 'bed_foot_top') : f === 3 ? 'oak_planks' : 'bed_side'), li, WHITE, false);
        }
      }
    }
  }
  return { solid: solid.out(), water: water.out(), sky, blk };
}

export { PA };
