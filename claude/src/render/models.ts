// Voxel creature models built from boxes with procedurally painted skins (original art).
import * as THREE from 'three';
import { mulberry32, hashString } from '../core/noise';

export interface PartSpec {
  name: string;
  size: [number, number, number]; // px (1/16 block)
  uv: [number, number];
  pivot: [number, number, number];
  off: [number, number, number];
  parent?: string;
}

export interface ModelSpec {
  tex: [number, number];
  parts: PartSpec[];
  paint: (g: CanvasRenderingContext2D, r: () => number, spec: ModelSpec) => void;
}

export interface Model {
  root: THREE.Group;
  parts: Record<string, THREE.Group>;
  material: THREE.MeshLambertMaterial;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: RGB, r: () => number, noise = 0.12) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const f = 1 + (r() - 0.5) * noise;
    g.fillStyle = `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
    g.fillRect(x + xx, y + yy, 1, 1);
  }
}
/** Face rectangles of a box in skin layout. */
export function faces(p: PartSpec) {
  const [w, h, d] = p.size.map((v) => Math.ceil(v));
  const [u, v] = p.uv;
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  } as Record<string, [number, number, number, number]>;
}
function paintPart(g: CanvasRenderingContext2D, p: PartSpec, c: RGB, r: () => number, noise = 0.12) {
  const f = faces(p);
  for (const k of Object.keys(f)) { const [x, y, w, h] = f[k]; rect(g, x, y, w, h, c, r, noise); }
}
const part = (spec: ModelSpec, name: string) => spec.parts.find((p) => p.name === name)!;
const px = (g: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ---------------------------------------------------------------- Specs
const humanoidParts = (armW = 4, legW = 4): PartSpec[] => [
  { name: 'head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 24, 0], off: [-4, 0, -4] },
  { name: 'body', size: [8, 12, 4], uv: [16, 16], pivot: [0, 12, 0], off: [-4, 0, -2] },
  { name: 'armR', size: [armW, 12, armW], uv: [40, 16], pivot: [-4 - armW / 2, 22, 0], off: [-armW / 2, -10, -armW / 2] },
  { name: 'armL', size: [armW, 12, armW], uv: [40, 16], pivot: [4 + armW / 2, 22, 0], off: [-armW / 2, -10, -armW / 2] },
  { name: 'legR', size: [legW, 12, legW], uv: [0, 16], pivot: [-2, 12, 0], off: [-legW / 2, -12, -legW / 2] },
  { name: 'legL', size: [legW, 12, legW], uv: [0, 16], pivot: [2, 12, 0], off: [-legW / 2, -12, -legW / 2] },
];

function humanoidPaint(skin: RGB, shirt: RGB, pants: RGB, hair: RGB, face: (g: CanvasRenderingContext2D, x: number, y: number) => void, sleeves = true) {
  return (g: CanvasRenderingContext2D, r: () => number, spec: ModelSpec) => {
    const head = part(spec, 'head');
    paintPart(g, head, skin, r, 0.08);
    const hf = faces(head);
    // hair: top + upper rows of sides/back
    rect(g, ...hf.top, hair, r, 0.15);
    for (const k of ['right', 'left', 'back']) { const [x, y, w] = hf[k]; rect(g, x, y, w, k === 'back' ? 6 : 3, hair, r, 0.15); }
    { const [x, y, w] = hf.front; rect(g, x, y, w, 2, hair, r, 0.15); }
    face(g, hf.front[0], hf.front[1]);
    paintPart(g, part(spec, 'body'), shirt, r, 0.1);
    const arm = part(spec, 'armR');
    paintPart(g, arm, skin, r, 0.08);
    if (sleeves) { const af = faces(arm); for (const k of ['front', 'back', 'left', 'right']) { const [x, y, w] = af[k]; rect(g, x, y, w, 4, shirt, r, 0.1); } rect(g, ...af.top, shirt, r, 0.1); }
    const leg = part(spec, 'legR');
    paintPart(g, leg, pants, r, 0.1);
    const lf = faces(leg);
    for (const k of ['front', 'back', 'left', 'right']) { const [x, y, w, h] = lf[k]; rect(g, x, y + h - 2, w, 2, hex('#3a3a3a'), r, 0.1); }
  };
}

export const SPECS: Record<string, ModelSpec> = {
  player: {
    tex: [64, 64], parts: humanoidParts(),
    paint: humanoidPaint(hex('#c69c7c'), hex('#7a3fa0'), hex('#2c3a6e'), hex('#3b2414'), (g, x, y) => {
      px(g, x + 1, y + 4, '#ffffff', 2, 1); px(g, x + 5, y + 4, '#ffffff', 2, 1);
      px(g, x + 2, y + 4, '#3a5ab0'); px(g, x + 5, y + 4, '#3a5ab0');
      px(g, x + 3, y + 5, '#a0705a', 2, 1); px(g, x + 2, y + 6, '#6a3a2a', 4, 1);
    }),
  },
  zombie: {
    tex: [64, 64], parts: humanoidParts(),
    paint: humanoidPaint(hex('#4f8a3c'), hex('#2a8aa0'), hex('#3a3a8a'), hex('#3d6a2e'), (g, x, y) => {
      px(g, x + 1, y + 3, '#1a2a12', 2, 2); px(g, x + 5, y + 3, '#1a2a12', 2, 2);
      px(g, x + 3, y + 5, '#2e5a24', 2, 1); px(g, x + 2, y + 6, '#203a18', 4, 1);
    }),
  },
  skeleton: {
    tex: [64, 64], parts: humanoidParts(2, 2),
    paint: (g, r, spec) => {
      const bone = hex('#cfcfcf');
      for (const p of spec.parts) paintPart(g, p, bone, r, 0.14);
      const hf = faces(part(spec, 'head')).front;
      px(g, hf[0] + 1, hf[1] + 3, '#202020', 2, 2); px(g, hf[0] + 5, hf[1] + 3, '#202020', 2, 2);
      px(g, hf[0] + 3, hf[1] + 5, '#505050', 2, 1); px(g, hf[0] + 1, hf[1] + 6, '#404040', 6, 1);
      px(g, hf[0] + 2, hf[1] + 6, '#bfbfbf'); px(g, hf[0] + 4, hf[1] + 6, '#bfbfbf'); px(g, hf[0] + 6, hf[1] + 6, '#bfbfbf');
      const bf = faces(part(spec, 'body'));
      for (const k of ['front', 'back']) { const [x, y, w, h] = bf[k]; for (let yy = 1; yy < h - 2; yy += 2) px(g, x + 1, y + yy, '#5a5a5a', w - 2, 1); px(g, x + 3, y, '#9a9a9a', 2, h); }
    },
  },
  creeper: {
    tex: [64, 64],
    parts: [
      { name: 'head', size: [8, 8, 8], uv: [0, 0], pivot: [0, 18, 0], off: [-4, 0, -4] },
      { name: 'body', size: [8, 12, 4], uv: [16, 16], pivot: [0, 6, 0], off: [-4, 0, -2] },
      { name: 'legFR', size: [4, 6, 4], uv: [0, 16], pivot: [-2, 6, 4], off: [-2, -6, -2] },
      { name: 'legFL', size: [4, 6, 4], uv: [0, 16], pivot: [2, 6, 4], off: [-2, -6, -2] },
      { name: 'legBR', size: [4, 6, 4], uv: [0, 16], pivot: [-2, 6, -4], off: [-2, -6, -2] },
      { name: 'legBL', size: [4, 6, 4], uv: [0, 16], pivot: [2, 6, -4], off: [-2, -6, -2] },
    ],
    paint: (g, r, spec) => {
      for (const p of spec.parts) {
        const f = faces(p);
        for (const k of Object.keys(f)) {
          const [x, y, w, h] = f[k];
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
            const v = r();
            px(g, x + xx, y + yy, v < 0.15 ? '#a8d8a0' : v < 0.45 ? '#3f9a3a' : v < 0.6 ? '#2a6a28' : '#5ab84e');
          }
        }
      }
      const [x, y] = faces(part(spec, 'head')).front;
      px(g, x + 1, y + 2, '#101010', 2, 2); px(g, x + 5, y + 2, '#101010', 2, 2);
      px(g, x + 3, y + 4, '#101010', 2, 3); px(g, x + 2, y + 5, '#101010', 1, 3); px(g, x + 5, y + 5, '#101010', 1, 3);
    },
  },
  cow: {
    tex: [64, 64],
    parts: [
      { name: 'body', size: [12, 10, 18], uv: [0, 0], pivot: [0, 17, 0], off: [-6, -5, -9] },
      { name: 'head', size: [8, 8, 6], uv: [0, 28], pivot: [0, 20, 9], off: [-4, -4, 0] },
      { name: 'hornR', size: [1, 3, 1], uv: [60, 0], pivot: [0, 0, 0], off: [-5, 2, 2], parent: 'head' },
      { name: 'hornL', size: [1, 3, 1], uv: [60, 0], pivot: [0, 0, 0], off: [4, 2, 2], parent: 'head' },
      { name: 'legFR', size: [4, 12, 4], uv: [28, 28], pivot: [-4, 12, 6], off: [-2, -12, -2] },
      { name: 'legFL', size: [4, 12, 4], uv: [28, 28], pivot: [4, 12, 6], off: [-2, -12, -2] },
      { name: 'legBR', size: [4, 12, 4], uv: [28, 28], pivot: [-4, 12, -6], off: [-2, -12, -2] },
      { name: 'legBL', size: [4, 12, 4], uv: [28, 28], pivot: [4, 12, -6], off: [-2, -12, -2] },
    ],
    paint: (g, r, spec) => {
      const brown = hex('#4a3020');
      for (const p of spec.parts) paintPart(g, p, p.name.startsWith('horn') ? hex('#d8d0c0') : brown, r, 0.12);
      // white patches on body
      const bf = faces(part(spec, 'body'));
      for (const k of Object.keys(bf)) {
        const [x, y, w, h] = bf[k];
        for (let i = 0; i < 3; i++) {
          const cx = x + Math.floor(r() * w), cy = y + Math.floor(r() * h), rw = 2 + Math.floor(r() * 4), rh = 2 + Math.floor(r() * 3);
          rect(g, Math.max(x, Math.min(cx, x + w - rw)), Math.max(y, Math.min(cy, y + h - rh)), rw, rh, hex('#e8e8e8'), r, 0.06);
        }
      }
      const [x, y, w, h] = faces(part(spec, 'head')).front;
      rect(g, x + 2, y + h - 3, 4, 3, hex('#d8a0a0'), r, 0.06);
      px(g, x + 3, y + h - 2, '#5a3030'); px(g, x + 4, y + h - 2, '#5a3030');
      px(g, x + 1, y + 3, '#101010'); px(g, x + 6, y + 3, '#101010'); px(g, x, y + 3, '#ffffff'); px(g, x + 7, y + 3, '#ffffff');
      rect(g, x + 2, y, 4, 2, hex('#e8e8e8'), r, 0.05);
      void w;
      const lf = faces(part(spec, 'legFR'));
      for (const k of ['front', 'back', 'left', 'right']) { const [lx, ly, lw, lh] = lf[k]; rect(g, lx, ly + lh - 2, lw, 2, hex('#7a6a5a'), r, 0.06); }
    },
  },
  pig: {
    tex: [64, 64],
    parts: [
      { name: 'body', size: [10, 8, 16], uv: [0, 0], pivot: [0, 10, 0], off: [-5, -4, -8] },
      { name: 'head', size: [8, 8, 8], uv: [0, 24], pivot: [0, 12, 7], off: [-4, -4, 0] },
      { name: 'snout', size: [4, 3, 1], uv: [32, 24], pivot: [0, 0, 0], off: [-2, -3, 8], parent: 'head' },
      { name: 'legFR', size: [4, 6, 4], uv: [44, 24], pivot: [-3, 6, 5], off: [-2, -6, -2] },
      { name: 'legFL', size: [4, 6, 4], uv: [44, 24], pivot: [3, 6, 5], off: [-2, -6, -2] },
      { name: 'legBR', size: [4, 6, 4], uv: [44, 24], pivot: [-3, 6, -5], off: [-2, -6, -2] },
      { name: 'legBL', size: [4, 6, 4], uv: [44, 24], pivot: [3, 6, -5], off: [-2, -6, -2] },
    ],
    paint: (g, r, spec) => {
      for (const p of spec.parts) paintPart(g, p, hex('#f0a0a0'), r, 0.08);
      const [x, y] = faces(part(spec, 'head')).front;
      px(g, x + 1, y + 2, '#ffffff'); px(g, x + 2, y + 2, '#101010'); px(g, x + 5, y + 2, '#101010'); px(g, x + 6, y + 2, '#ffffff');
      const [sx, sy] = faces(part(spec, 'snout')).front;
      rect(g, sx, sy, 4, 3, hex('#e88a90'), r, 0.05); px(g, sx + 1, sy + 1, '#8a4a4a'); px(g, sx + 2, sy + 1, '#8a4a4a');
      const lf = faces(part(spec, 'legFR'));
      for (const k of ['front', 'back', 'left', 'right']) { const [lx, ly, lw, lh] = lf[k]; rect(g, lx, ly + lh - 1, lw, 1, hex('#8a5a50'), r, 0.06); }
    },
  },
  sheep: {
    tex: [64, 64],
    parts: [
      { name: 'body', size: [12, 10, 16], uv: [0, 0], pivot: [0, 15, 0], off: [-6, -5, -8] },
      { name: 'head', size: [6, 6, 8], uv: [0, 26], pivot: [0, 18, 7], off: [-3, -3, 0] },
      { name: 'legFR', size: [4, 12, 4], uv: [28, 26], pivot: [-3, 12, 5], off: [-2, -12, -2] },
      { name: 'legFL', size: [4, 12, 4], uv: [28, 26], pivot: [3, 12, 5], off: [-2, -12, -2] },
      { name: 'legBR', size: [4, 12, 4], uv: [28, 26], pivot: [-3, 12, -5], off: [-2, -12, -2] },
      { name: 'legBL', size: [4, 12, 4], uv: [28, 26], pivot: [3, 12, -5], off: [-2, -12, -2] },
    ],
    paint: (g, r, spec) => {
      paintPart(g, part(spec, 'body'), hex('#ececec'), r, 0.1);
      const head = part(spec, 'head');
      paintPart(g, head, hex('#ececec'), r, 0.1);
      const [x, y, w, h] = faces(head).front;
      rect(g, x + 1, y + 1, w - 2, h - 1, hex('#d8b8a0'), r, 0.06);
      px(g, x + 1, y + 2, '#ffffff'); px(g, x + 2, y + 2, '#101010'); px(g, x + 3, y + 2, '#101010'); px(g, x + 4, y + 2, '#ffffff');
      px(g, x + 2, y + 4, '#e09090', 2, 1);
      const leg = part(spec, 'legFR');
      paintPart(g, leg, hex('#d8b8a0'), r, 0.06);
      const lf = faces(leg);
      for (const k of ['front', 'back', 'left', 'right']) { const [lx, ly, lw] = lf[k]; rect(g, lx, ly, lw, 5, hex('#ececec'), r, 0.1); }
    },
  },
  chicken: {
    tex: [64, 32],
    parts: [
      { name: 'body', size: [6, 6, 8], uv: [0, 0], pivot: [0, 8, 0], off: [-3, -3, -4] },
      { name: 'head', size: [4, 6, 3], uv: [0, 14], pivot: [0, 9, 3], off: [-2, 0, 0] },
      { name: 'beak', size: [4, 2, 2], uv: [14, 14], pivot: [0, 0, 0], off: [-2, 3, 3], parent: 'head' },
      { name: 'wattle', size: [2, 2, 1], uv: [26, 14], pivot: [0, 0, 0], off: [-1, 1, 3], parent: 'head' },
      { name: 'wingR', size: [1, 4, 6], uv: [32, 0], pivot: [-3.5, 10, 0], off: [-0.5, -4, -3] },
      { name: 'wingL', size: [1, 4, 6], uv: [32, 0], pivot: [3.5, 10, 0], off: [-0.5, -4, -3] },
      { name: 'legR', size: [2, 5, 1], uv: [48, 0], pivot: [-1.5, 5, 0], off: [-1, -5, -0.5] },
      { name: 'legL', size: [2, 5, 1], uv: [48, 0], pivot: [1.5, 5, 0], off: [-1, -5, -0.5] },
    ],
    paint: (g, r, spec) => {
      for (const p of spec.parts) paintPart(g, p, hex('#f4f4f4'), r, 0.06);
      paintPart(g, part(spec, 'beak'), hex('#f0a020'), r, 0.06);
      paintPart(g, part(spec, 'wattle'), hex('#d82020'), r, 0.06);
      paintPart(g, part(spec, 'legR'), hex('#e8a020'), r, 0.06);
      const [x, y] = faces(part(spec, 'head')).front;
      px(g, x, y + 1, '#101010'); px(g, x + 3, y + 1, '#101010');
    },
  },
  spider: {
    tex: [64, 64],
    parts: [
      { name: 'head', size: [8, 8, 8], uv: [32, 4], pivot: [0, 9, 3], off: [-4, -4, 0] },
      { name: 'thorax', size: [6, 6, 6], uv: [0, 0], pivot: [0, 9, 0], off: [-3, -3, -3] },
      { name: 'abdomen', size: [10, 8, 12], uv: [0, 24], pivot: [0, 9, -3], off: [-5, -4, -12] },
      ...[0, 1, 2, 3].flatMap((i): PartSpec[] => [
        { name: 'legR' + i, size: [16, 2, 2], uv: [24, 0], pivot: [-3, 9, 2 - i * 1.4], off: [-16, -1, -1] },
        { name: 'legL' + i, size: [16, 2, 2], uv: [24, 0], pivot: [3, 9, 2 - i * 1.4], off: [0, -1, -1] },
      ]),
    ],
    paint: (g, r, spec) => {
      for (const p of spec.parts) paintPart(g, p, hex('#3a322c'), r, 0.25);
      const [x, y] = faces(part(spec, 'head')).front;
      px(g, x + 1, y + 3, '#d01010', 2, 1); px(g, x + 5, y + 3, '#d01010', 2, 1); px(g, x + 2, y + 2, '#ff3030'); px(g, x + 5, y + 2, '#ff3030');
      px(g, x + 3, y + 4, '#ff3030', 2, 1);
    },
  },
};

const skinCache = new Map<string, THREE.Texture>();

export function skinTexture(type: string): THREE.Texture {
  let t = skinCache.get(type);
  if (t) return t;
  const spec = SPECS[type];
  const c = document.createElement('canvas');
  c.width = spec.tex[0]; c.height = spec.tex[1];
  const g = c.getContext('2d')!;
  spec.paint(g, mulberry32(hashString(type)), spec);
  t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  skinCache.set(type, t);
  return t;
}

function boxGeometry(p: PartSpec, tw: number, th: number): THREE.BoxGeometry {
  const [w, h, d] = p.size;
  const geo = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
  const f = faces(p);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const order = ['left', 'right', 'top', 'bottom', 'front', 'back'];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let fi = 0; fi < 6; fi++) {
    const [x0, y0, fw, fh] = f[order[fi]];
    for (let k = 0; k < 4; k++) {
      const U = k % 2, Vt = k < 2 ? 1 : 0;
      uv.setXY(fi * 4 + k, (x0 + U * fw) / tw, 1 - (y0 + (1 - Vt) * fh) / th);
    }
  }
  return geo;
}

export function buildModel(type: string, only?: string[]): Model {
  const spec = SPECS[type];
  const material = new THREE.MeshLambertMaterial({ map: skinTexture(type), alphaTest: 0.5 });
  const root = new THREE.Group();
  const parts: Record<string, THREE.Group> = {};
  for (const p of spec.parts) {
    if (only && !only.includes(p.name)) continue;
    const g = new THREE.Group();
    g.position.set(p.pivot[0] / 16, p.pivot[1] / 16, p.pivot[2] / 16);
    const mesh = new THREE.Mesh(boxGeometry(p, spec.tex[0], spec.tex[1]), material);
    mesh.position.set((p.off[0] + p.size[0] / 2) / 16, (p.off[1] + p.size[1] / 2) / 16, (p.off[2] + p.size[2] / 2) / 16);
    g.add(mesh);
    parts[p.name] = g;
    if (p.parent && parts[p.parent]) parts[p.parent].add(g);
    else root.add(g);
  }
  return { root, parts, material };
}
