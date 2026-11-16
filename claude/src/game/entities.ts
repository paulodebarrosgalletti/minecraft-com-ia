// Dropped items and arrows.
import * as THREE from 'three';
import { Body, makeBody, moveBody } from './physics';
import type { World } from '../world/world';
import type { TextureAtlas, IconFactory } from '../render/textures';
import { ItemStack, itemDef } from '../world/items';
import { block, SOLID } from '../world/blocks';
import { canMerge } from './inventory';

export class ItemEntity {
  body: Body;
  age = 0;
  pickupDelay: number;
  bob = Math.random() * Math.PI * 2;
  dead = false;
  constructor(public stack: ItemStack, public mesh: THREE.Object3D, pickupDelay: number) {
    this.body = makeBody(0.125, 0.25);
    this.pickupDelay = pickupDelay;
  }
}

export class Arrow {
  vel = new THREE.Vector3();
  stuck = false;
  life = 0;
  dead = false;
  constructor(public mesh: THREE.Mesh, public pos: THREE.Vector3, public damage: number) {}
}

export class EntityManager {
  items: ItemEntity[] = [];
  arrows: Arrow[] = [];
  group = new THREE.Group();
  private blockGeo = new Map<number, THREE.BufferGeometry>();
  private blockMat: THREE.MeshLambertMaterial;
  private spriteMats = new Map<number, THREE.SpriteMaterial>();
  private arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.55);
  private arrowMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });

  constructor(private atlas: TextureAtlas, private icons: IconFactory) {
    this.blockMat = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5 });
  }

  makeItemMesh(id: number, scale = 1): THREE.Object3D {
    const d = itemDef(id);
    if (d.isBlock) {
      const b = block(id);
      if (b.shape === 'cube' || b.shape === 'slab' || b.shape === 'stairs' || b.shape === 'cactus' || b.shape === 'bed') {
        let g = this.blockGeo.get(id);
        if (!g) {
          const h = b.shape === 'slab' ? 0.5 : b.shape === 'bed' ? 0.5625 : 1;
          g = new THREE.BoxGeometry(1, h, 1);
          g.translate(0, h / 2 - 0.5, 0);
          const uv = g.attributes.uv as THREE.BufferAttribute;
          const names = [b.side, b.side, b.shape === 'bed' ? 'bed_head_top' : b.top, b.bottom, b.front ?? b.side, b.side];
          for (let f = 0; f < 6; f++) {
            const t = this.atlas.uv(names[f]);
            for (let k = 0; k < 4; k++) {
              const U = k % 2, V = k < 2 ? 1 : 0;
              const vv = f < 2 || f >= 4 ? (V ? h : 0) : V;
              uv.setXY(f * 4 + k, t[0] + (t[2] - t[0]) * U, t[1] + (t[3] - t[1]) * vv);
            }
          }
          this.blockGeo.set(id, g);
        }
        const m = new THREE.Mesh(g, this.blockMat);
        m.scale.setScalar(0.25 * scale);
        return m;
      }
    }
    let mat = this.spriteMats.get(id);
    if (!mat) { mat = new THREE.SpriteMaterial({ map: this.icons.texture(id), alphaTest: 0.5 }); this.spriteMats.set(id, mat); }
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.4 * scale);
    return s;
  }

  spawnItem(stack: ItemStack, x: number, y: number, z: number, vel?: THREE.Vector3, pickupDelay = 0.4) {
    if (stack.count <= 0) return;
    const mesh = this.makeItemMesh(stack.id);
    const e = new ItemEntity({ ...stack }, mesh, pickupDelay);
    e.body.pos.set(x, y, z);
    if (vel) e.body.vel.copy(vel);
    else e.body.vel.set((Math.random() - 0.5) * 2.5, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5);
    this.items.push(e);
    this.group.add(mesh);
  }

  spawnArrow(from: THREE.Vector3, vel: THREE.Vector3, damage: number) {
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    const a = new Arrow(mesh, from.clone(), damage);
    a.vel.copy(vel);
    this.arrows.push(a);
    this.group.add(mesh);
  }

  update(dt: number, world: World, playerPos: THREE.Vector3, tryPickup: (s: ItemStack) => number,
    hitPlayer: (a: Arrow) => boolean, brightness: number) {
    // items
    for (const e of this.items) {
      e.age += dt;
      e.pickupDelay -= dt;
      if (e.age > 300) { e.dead = true; continue; }
      const b = e.body;
      const dx = playerPos.x - b.pos.x, dy = playerPos.y + 0.8 - b.pos.y, dz = playerPos.z - b.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (e.pickupDelay <= 0 && d < 2.2) {
        // magnet
        b.vel.x += (dx / d) * 30 * dt; b.vel.y += (dy / d) * 30 * dt; b.vel.z += (dz / d) * 30 * dt;
        if (d < 0.9) {
          const left = tryPickup(e.stack);
          if (left <= 0) { e.dead = true; continue; }
          e.stack.count = left;
        }
      }
      b.vel.y -= (b.inWater ? 4 : 20) * dt;
      if (b.inWater) b.vel.y = Math.max(b.vel.y, -1) + 5 * dt;
      moveBody(world, b, dt);
      if (b.onGround) { b.vel.x *= Math.pow(0.02, dt); b.vel.z *= Math.pow(0.02, dt); }
      // stuck inside a block -> pop up
      if (SOLID[world.getBlock(Math.floor(b.pos.x), Math.floor(b.pos.y + 0.1), Math.floor(b.pos.z))]) b.pos.y += 4 * dt;
      e.bob += dt * 2.5;
      e.mesh.position.set(b.pos.x, b.pos.y + 0.18 + Math.sin(e.bob) * 0.06, b.pos.z);
      e.mesh.rotation.y = e.bob * 0.6;
    }
    // merge nearby identical stacks occasionally
    if (Math.random() < 0.1) {
      for (let i = 0; i < this.items.length; i++) for (let j = i + 1; j < this.items.length; j++) {
        const a = this.items[i], c = this.items[j];
        if (a.dead || c.dead || !canMerge(a.stack, c.stack)) continue;
        if (a.body.pos.distanceToSquared(c.body.pos) < 0.6 && a.stack.count + c.stack.count <= itemDef(a.stack.id).maxStack) {
          a.stack.count += c.stack.count; c.dead = true;
        }
      }
    }
    for (const e of this.items) if (e.dead) this.group.remove(e.mesh);
    this.items = this.items.filter((e) => !e.dead);
    void brightness;
    // arrows
    for (const a of this.arrows) {
      a.life += dt;
      if (a.stuck) { if (a.life > 6) a.dead = true; continue; }
      if (a.life > 10) { a.dead = true; continue; }
      a.vel.y -= 18 * dt;
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        a.pos.addScaledVector(a.vel, dt / steps);
        const id = world.getBlock(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z));
        if (SOLID[id]) { a.stuck = true; a.life = 0; break; }
        if (hitPlayer(a)) { a.dead = true; break; }
      }
      a.mesh.position.copy(a.pos);
      if (!a.stuck) a.mesh.lookAt(a.pos.clone().add(a.vel));
    }
    for (const a of this.arrows) if (a.dead) this.group.remove(a.mesh);
    this.arrows = this.arrows.filter((a) => !a.dead);
  }

  clear() {
    for (const e of this.items) this.group.remove(e.mesh);
    for (const a of this.arrows) this.group.remove(a.mesh);
    this.items = []; this.arrows = [];
  }
}
