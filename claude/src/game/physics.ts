// AABB vs voxel collision for the player, mobs and dropped items.
import * as THREE from 'three';
import type { World } from '../world/world';
import { collisionBoxes } from '../world/world';
import { B } from '../world/blocks';

export interface Body {
  pos: THREE.Vector3; // feet centre
  vel: THREE.Vector3;
  hw: number; // half width
  h: number; // height
  onGround: boolean;
  inWater: boolean;
  headInWater: boolean;
  collidedH: boolean;
}

export function makeBody(hw: number, h: number): Body {
  return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hw, h, onGround: false, inWater: false, headInWater: false, collidedH: false };
}

type AABB = [number, number, number, number, number, number];
const boxes: AABB[] = [];

function gather(world: World, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
  boxes.length = 0;
  for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
    const loaded = world.isLoaded(x, z);
    for (let y = Math.floor(minY) - 1; y <= Math.floor(maxY); y++) {
      if (!loaded) { boxes.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
      const id = world.getBlock(x, y, z);
      if (id === B.AIR) continue;
      const bs = collisionBoxes(id, world.getMeta(x, y, z));
      if (!bs) continue;
      for (const b of bs) boxes.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
  }
}

const EPS = 1e-4;

function clampAxis(b: AABB, axis: number, d: number): number {
  const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  for (const o of boxes) {
    if (o[a1 + 3] <= b[a1] + EPS || o[a1] >= b[a1 + 3] - EPS) continue;
    if (o[a2 + 3] <= b[a2] + EPS || o[a2] >= b[a2 + 3] - EPS) continue;
    if (d > 0 && o[axis] >= b[axis + 3] - EPS) d = Math.min(d, o[axis] - b[axis + 3]);
    else if (d < 0 && o[axis + 3] <= b[axis] + EPS) d = Math.max(d, o[axis + 3] - b[axis]);
  }
  return d;
}

function bodyBox(p: THREE.Vector3, hw: number, h: number): AABB {
  return [p.x - hw, p.y, p.z - hw, p.x + hw, p.y + h, p.z + hw];
}

function hasSupport(world: World, x: number, y: number, z: number, hw: number): boolean {
  gather(world, x - hw, y - 0.6, z - hw, x + hw, y, z + hw);
  for (const o of boxes) {
    if (o[3] <= x - hw + EPS || o[0] >= x + hw - EPS) continue;
    if (o[5] <= z - hw + EPS || o[2] >= z + hw - EPS) continue;
    if (o[4] <= y + EPS && o[4] > y - 0.6) return true;
  }
  return false;
}

export function moveBody(world: World, body: Body, dt: number, stepHeight = 0, sneakEdge = false): void {
  let dx = body.vel.x * dt, dy = body.vel.y * dt, dz = body.vel.z * dt;
  const p = body.pos;
  const wasGround = body.onGround;
  if (sneakEdge && wasGround) {
    if (dx !== 0 && !hasSupport(world, p.x + dx, p.y, p.z, body.hw)) { dx = 0; body.vel.x = 0; }
    if (dz !== 0 && !hasSupport(world, p.x + dx, p.y, p.z + dz, body.hw)) { dz = 0; body.vel.z = 0; }
  }
  gather(world, p.x - body.hw - Math.abs(dx) - 1, p.y - Math.abs(dy) - 1, p.z - body.hw - Math.abs(dz) - 1,
    p.x + body.hw + Math.abs(dx) + 1, p.y + body.h + Math.abs(dy) + stepHeight + 1, p.z + body.hw + Math.abs(dz) + 1);
  const start = p.clone();
  let box = bodyBox(p, body.hw, body.h);
  const ny = clampAxis(box, 1, dy);
  p.y += ny;
  if (Math.abs(ny - dy) > 1e-9) body.vel.y = 0;
  box = bodyBox(p, body.hw, body.h);
  // robust ground test: is there something directly below (independent of step size)?
  body.onGround = dy <= 0 && clampAxis(box, 1, -0.01) > -0.01 + 1e-7;
  const nx = clampAxis(box, 0, dx);
  p.x += nx;
  box = bodyBox(p, body.hw, body.h);
  const nz = clampAxis(box, 2, dz);
  p.z += nz;
  body.collidedH = Math.abs(nx - dx) > EPS || Math.abs(nz - dz) > EPS;

  if (body.collidedH && stepHeight > 0 && (wasGround || body.onGround)) {
    // try stepping up
    const alt = start.clone();
    alt.y = p.y;
    let ab = bodyBox(alt, body.hw, body.h);
    const up = clampAxis(ab, 1, stepHeight);
    alt.y += up;
    ab = bodyBox(alt, body.hw, body.h);
    alt.x += clampAxis(ab, 0, dx);
    ab = bodyBox(alt, body.hw, body.h);
    alt.z += clampAxis(ab, 2, dz);
    ab = bodyBox(alt, body.hw, body.h);
    alt.y += clampAxis(ab, 1, -up);
    const dOrig = (p.x - start.x) ** 2 + (p.z - start.z) ** 2;
    const dAlt = (alt.x - start.x) ** 2 + (alt.z - start.z) ** 2;
    if (dAlt > dOrig + 1e-4) {
      p.copy(alt);
      body.onGround = true;
      body.collidedH = false;
    }
  }
  if (Math.abs(nx - dx) > EPS && body.collidedH) body.vel.x = 0;
  if (Math.abs(nz - dz) > EPS && body.collidedH) body.vel.z = 0;

  const feet = world.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
  const mid = world.getBlock(Math.floor(p.x), Math.floor(p.y + body.h * 0.5), Math.floor(p.z));
  body.inWater = feet === B.WATER || mid === B.WATER;
  body.headInWater = world.getBlock(Math.floor(p.x), Math.floor(p.y + body.h * 0.9), Math.floor(p.z)) === B.WATER;
}

/** True if an AABB intersects any solid block. */
export function boxBlocked(world: World, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
  gather(world, minX, minY + 1, minZ, maxX, maxY, maxZ);
  for (const o of boxes) {
    if (o[3] > minX + EPS && o[0] < maxX - EPS && o[4] > minY + EPS && o[1] < maxY - EPS && o[5] > minZ + EPS && o[2] < maxZ - EPS) return true;
  }
  return false;
}
