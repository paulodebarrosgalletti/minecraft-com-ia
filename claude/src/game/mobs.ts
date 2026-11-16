// Mobs: passive animals and hostile monsters with simple state-machine AI.
import * as THREE from 'three';
import { Body, makeBody, moveBody, boxBlocked } from './physics';
import { buildModel, Model } from '../render/models';
import type { World } from '../world/world';
import { B, SOLID } from '../world/blocks';
import { I } from '../world/items';
import { CS } from '../world/generator';

export type MobType = 'cow' | 'pig' | 'sheep' | 'chicken' | 'zombie' | 'skeleton' | 'creeper' | 'spider';
type State = 'idle' | 'wander' | 'flee' | 'chase' | 'dead';

interface MobDef {
  hw: number; h: number; health: number; speed: number; hostile: boolean; damage: number;
  drops: (r: () => number) => [number, number][];
  sound: string; legSwing: number; scale?: number;
}

export const MOB_DEFS: Record<MobType, MobDef> = {
  cow: { hw: 0.45, h: 1.4, health: 10, speed: 1.4, hostile: false, damage: 0, sound: 'cow', legSwing: 0.7,
    drops: (r) => [[I.BEEF, 1 + Math.floor(r() * 3)], [I.LEATHER, Math.floor(r() * 3)]] },
  pig: { hw: 0.45, h: 0.9, health: 10, speed: 1.5, hostile: false, damage: 0, sound: 'pig', legSwing: 0.8,
    drops: (r) => [[I.PORKCHOP, 1 + Math.floor(r() * 3)]] },
  sheep: { hw: 0.45, h: 1.3, health: 8, speed: 1.4, hostile: false, damage: 0, sound: 'sheep', legSwing: 0.7,
    drops: (r) => [[B.WOOL, 1], [I.MUTTON, 1 + Math.floor(r() * 2)]] },
  chicken: { hw: 0.2, h: 0.7, health: 4, speed: 1.3, hostile: false, damage: 0, sound: 'chicken', legSwing: 1.0,
    drops: (r) => [[I.CHICKEN, 1], [I.FEATHER, Math.floor(r() * 3)]] },
  zombie: { hw: 0.3, h: 1.95, health: 20, speed: 2.4, hostile: true, damage: 3, sound: 'zombie', legSwing: 0.8,
    drops: (r) => [[I.ROTTEN_FLESH, Math.floor(r() * 3)], ...(r() < 0.03 ? [[I.IRON_INGOT, 1] as [number, number]] : [])] },
  skeleton: { hw: 0.3, h: 1.99, health: 20, speed: 2.5, hostile: true, damage: 3, sound: 'skeleton', legSwing: 0.8,
    drops: (r) => [[I.BONE, Math.floor(r() * 3)], [I.ARROW, Math.floor(r() * 3)]] },
  creeper: { hw: 0.3, h: 1.7, health: 20, speed: 2.1, hostile: true, damage: 0, sound: 'fuse', legSwing: 0.9,
    drops: (r) => [[I.GUNPOWDER, Math.floor(r() * 3)]] },
  spider: { hw: 0.7, h: 0.9, health: 16, speed: 3.1, hostile: true, damage: 2, sound: 'spider', legSwing: 0.5,
    drops: (r) => [[I.STRING, Math.floor(r() * 3)], ...(r() < 0.1 ? [[I.FEATHER, 1] as [number, number]] : [])] },
};

export interface MobContext {
  world: World;
  playerPos: THREE.Vector3;
  playerEye: THREE.Vector3;
  playerAlive: boolean;
  playerTargetable: boolean;
  difficulty: number; // 0 peaceful .. 3 hard
  daylight: number;
  damagePlayer(amount: number, cause: string, from: THREE.Vector3): void;
  dropItem(id: number, count: number, pos: THREE.Vector3): void;
  shootArrow(from: THREE.Vector3, vel: THREE.Vector3, dmg: number): void;
  explode(pos: THREE.Vector3, power: number): void;
  sound(name: string, pos: THREE.Vector3): void;
  burst(pos: THREE.Vector3, color: [number, number, number], n: number): void;
  flame(pos: THREE.Vector3): void;
}

export class Mob {
  model: Model;
  body: Body;
  health: number;
  yaw = Math.random() * Math.PI * 2;
  headYaw = 0;
  state: State = 'idle';
  stateTime = 0;
  hurtTime = 0;
  deathTime = 0;
  walk = 0;
  attackCd = 0;
  fuse = 0;
  soundTimer = 3 + Math.random() * 8;
  burnTimer = 0;
  fleeFrom = new THREE.Vector3();
  moveDir = new THREE.Vector2();
  removed = false;
  def: MobDef;
  persistent = false;

  constructor(public type: MobType, pos: THREE.Vector3) {
    this.def = MOB_DEFS[type];
    this.model = buildModel(type);
    this.body = makeBody(this.def.hw, this.def.h);
    this.body.pos.copy(pos);
    this.health = this.def.health;
    if (type === 'zombie') {
      this.model.parts.armR.rotation.x = -Math.PI / 2.2;
      this.model.parts.armL.rotation.x = -Math.PI / 2.2;
    }
    if (type === 'skeleton') {
      // bow
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.08), new THREE.MeshLambertMaterial({ color: 0x7a5a30 }));
      bow.position.set(0, -0.6, 0.12);
      this.model.parts.armL.add(bow);
      this.model.parts.armL.rotation.x = -Math.PI / 2.4;
    }
    if (type === 'spider') {
      for (let i = 0; i < 4; i++) {
        const fan = (i - 1.5) * 0.35;
        this.model.parts['legR' + i].rotation.set(0, -fan, -0.5);
        this.model.parts['legL' + i].rotation.set(0, fan, 0.5);
      }
    }
  }

  get alive() { return this.state !== 'dead'; }
}

const tmp = new THREE.Vector3();

export class MobManager {
  mobs: Mob[] = [];
  group = new THREE.Group();
  private spawnTimer = 0;

  add(type: MobType, pos: THREE.Vector3): Mob {
    const m = new Mob(type, pos);
    this.mobs.push(m);
    this.group.add(m.model.root);
    return m;
  }

  clear() {
    for (const m of this.mobs) this.group.remove(m.model.root);
    this.mobs = [];
  }

  /** Ray vs mob AABBs. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { mob: Mob; dist: number } | null {
    let best: { mob: Mob; dist: number } | null = null;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const p = m.body.pos, hw = m.def.hw + 0.1;
      const box = new THREE.Box3(new THREE.Vector3(p.x - hw, p.y, p.z - hw), new THREE.Vector3(p.x + hw, p.y + m.def.h, p.z + hw));
      const ray = new THREE.Ray(o, d);
      const hit = ray.intersectBox(box, tmp);
      if (hit) {
        const dist = hit.distanceTo(o);
        if (dist <= maxDist && (!best || dist < best.dist)) best = { mob: m, dist };
      }
    }
    return best;
  }

  damage(m: Mob, amount: number, from: THREE.Vector3, ctx: MobContext, knock = 1) {
    if (!m.alive || m.hurtTime > 0.35) return;
    m.health -= amount;
    m.hurtTime = 0.5;
    const dir = tmp.copy(m.body.pos).sub(from).setY(0).normalize();
    m.body.vel.x = dir.x * 7 * knock; m.body.vel.z = dir.z * 7 * knock; m.body.vel.y = 4.5;
    ctx.sound(m.type === 'zombie' ? 'zombie_hurt' : m.def.sound === 'fuse' ? 'hit' : m.def.sound, m.body.pos);
    ctx.sound('hit', m.body.pos);
    if (!m.def.hostile) { m.state = 'flee'; m.stateTime = 5; m.fleeFrom.copy(from); }
    if (m.health <= 0) {
      m.state = 'dead';
      m.deathTime = 0;
      m.fuse = 0;
    }
  }

  update(dt: number, ctx: MobContext) {
    for (const m of this.mobs) this.updateMob(m, dt, ctx);
    for (const m of this.mobs) if (m.removed) this.group.remove(m.model.root);
    this.mobs = this.mobs.filter((m) => !m.removed);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      this.trySpawn(ctx);
    }
  }

  private lightAt(world: World, p: THREE.Vector3, daylight: number): number {
    const [s, b] = world.getLight(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z));
    return Math.max(s - Math.round((1 - daylight) * 11), b);
  }

  trySpawn(ctx: MobContext, attempts = 1) {
    const { world, playerPos } = ctx;
    let passive = 0, hostile = 0;
    for (const m of this.mobs) if (m.alive) { if (m.def.hostile) hostile++; else passive++; }
    for (let a = 0; a < attempts; a++) {
      // passive
      if (passive < 10 && Math.random() < 0.3) {
        const ang = Math.random() * Math.PI * 2, dist = 22 + Math.random() * 26;
        const x = Math.floor(playerPos.x + Math.cos(ang) * dist), z = Math.floor(playerPos.z + Math.sin(ang) * dist);
        const ch = world.getChunk(Math.floor(x / CS), Math.floor(z / CS));
        if (ch && ch.sky) {
          const y = world.surfaceY(x, z);
          if (y > 0 && world.getBlock(x, y, z) === B.GRASS && world.getBlock(x, y + 1, z) === B.AIR && world.getBlock(x, y + 2, z) === B.AIR) {
            const types: MobType[] = ['cow', 'pig', 'sheep', 'chicken'];
            const t = types[Math.floor(Math.random() * types.length)];
            const n = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) {
              const ox = x + Math.floor(Math.random() * 5) - 2, oz = z + Math.floor(Math.random() * 5) - 2;
              const oy = world.surfaceY(ox, oz);
              if (oy > 0 && world.getBlock(ox, oy, oz) === B.GRASS && !boxBlocked(world, ox + 0.5 - 0.45, oy + 1, oz + 0.5 - 0.45, ox + 0.95, oy + 2.4, oz + 0.95)) {
                this.add(t, new THREE.Vector3(ox + 0.5, oy + 1, oz + 0.5));
                passive++;
              }
            }
          }
        }
      }
      // hostile
      if (ctx.difficulty === 0) continue;
      const cap = [0, 5, 10, 16][ctx.difficulty];
      if (hostile >= cap) continue;
      const ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 26;
      const x = Math.floor(playerPos.x + Math.cos(ang) * dist), z = Math.floor(playerPos.z + Math.sin(ang) * dist);
      const ch = world.getChunk(Math.floor(x / CS), Math.floor(z / CS));
      if (!ch || !ch.sky) continue;
      const top = world.surfaceY(x, z);
      if (top < 2) continue;
      const y = Math.random() < 0.5 ? top + 1 : Math.max(3, Math.floor(playerPos.y + (Math.random() - 0.5) * 24));
      if (y > top + 1) continue;
      if (!SOLID[world.getBlock(x, y - 1, z)] || world.getBlock(x, y, z) !== B.AIR || world.getBlock(x, y + 1, z) !== B.AIR) continue;
      const lp = new THREE.Vector3(x + 0.5, y, z + 0.5);
      if (this.lightAt(world, lp, ctx.daylight) > 7) continue;
      if (lp.distanceTo(playerPos) < 16) continue;
      const r = Math.random();
      const t: MobType = r < 0.36 ? 'zombie' : r < 0.62 ? 'skeleton' : r < 0.84 ? 'creeper' : 'spider';
      if (t === 'spider' && (world.getBlock(x + 1, y, z) !== B.AIR || world.getBlock(x, y, z + 1) !== B.AIR)) continue;
      this.add(t, lp);
      hostile++;
    }
  }

  private updateMob(m: Mob, dt: number, ctx: MobContext) {
    const { world } = ctx;
    const def = m.def;
    const p = m.body.pos;
    const toPlayer = tmp.copy(ctx.playerPos).sub(p);
    const distP = toPlayer.length();
    if (!world.isLoaded(p.x, p.z)) { if (distP > 160) m.removed = true; return; }
    if (def.hostile && (distP > 80 || ctx.difficulty === 0)) { m.removed = true; return; }
    if (!def.hostile && distP > 120) { m.removed = true; return; }

    m.hurtTime = Math.max(0, m.hurtTime - dt);
    m.attackCd -= dt;

    if (m.state === 'dead') {
      m.deathTime += dt;
      m.model.root.rotation.z = Math.min(1, m.deathTime / 0.4) * (Math.PI / 2);
      m.model.material.color.setRGB(1, 0.35, 0.35);
      if (m.deathTime > 0.9) {
        m.removed = true;
        const c = p.clone().setY(p.y + 0.4);
        ctx.burst(c, [230, 230, 230], 14);
        for (const [id, n] of def.drops(Math.random)) if (n > 0) ctx.dropItem(id, n, c);
      }
      m.body.vel.x *= 0.9; m.body.vel.z *= 0.9;
      m.body.vel.y -= 28 * dt;
      moveBody(world, m.body, dt);
      this.place(m);
      return;
    }

    // --- AI ---
    let wantX = 0, wantZ = 0, speed = def.speed, jump = false;
    m.stateTime -= dt;
    const canTarget = ctx.playerAlive && ctx.playerTargetable;
    if (def.hostile) {
      const sees = canTarget && distP < (m.type === 'spider' && ctx.daylight > 0.6 ? 0 : 20);
      if (sees) {
        m.state = 'chase';
        const dirx = toPlayer.x / Math.max(0.01, Math.hypot(toPlayer.x, toPlayer.z)), dirz = toPlayer.z / Math.max(0.01, Math.hypot(toPlayer.x, toPlayer.z));
        const hd = Math.hypot(toPlayer.x, toPlayer.z);
        m.yaw = Math.atan2(dirx, dirz);
        if (m.type === 'skeleton') {
          if (hd < 6) { wantX = -dirx; wantZ = -dirz; } else if (hd > 11) { wantX = dirx; wantZ = dirz; } else { wantX = -dirz * 0.5; wantZ = dirx * 0.5; speed *= 0.6; }
          if (m.attackCd <= 0 && hd < 16 && this.lineOfSight(world, p.clone().setY(p.y + 1.6), ctx.playerEye)) {
            m.attackCd = [3, 2.6, 2, 1.4][ctx.difficulty];
            const from = p.clone().setY(p.y + 1.5);
            const target = ctx.playerPos.clone().setY(ctx.playerPos.y + 1.1);
            const dir = target.sub(from);
            const flat = Math.hypot(dir.x, dir.z);
            const v = 22;
            const vel = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(v);
            vel.y = dir.y / (flat / v) + 0.5 * 18 * (flat / v);
            vel.x += (Math.random() - 0.5) * (3 - ctx.difficulty); vel.z += (Math.random() - 0.5) * (3 - ctx.difficulty);
            from.addScaledVector(new THREE.Vector3(dirx, 0, dirz), 0.5);
            ctx.shootArrow(from, vel, def.damage);
            ctx.sound('bow', p);
          }
        } else if (m.type === 'creeper') {
          if (hd < 2.6 || m.fuse > 0) {
            if (m.fuse === 0) ctx.sound('fuse', p);
            m.fuse += dt;
            if (hd > 7) m.fuse = Math.max(0, m.fuse - dt * 3);
          } else { wantX = dirx; wantZ = dirz; }
          if (m.fuse >= 1.5) {
            m.removed = true;
            ctx.explode(p.clone().setY(p.y + 0.8), 3);
            return;
          }
        } else {
          wantX = dirx; wantZ = dirz;
          const reach = m.type === 'spider' ? 1.6 : 1.4;
          if (hd < reach + def.hw && Math.abs(toPlayer.y) < 1.8 && m.attackCd <= 0) {
            m.attackCd = 1;
            const mult = [0, 0.5, 1, 1.5][ctx.difficulty];
            ctx.damagePlayer(Math.max(1, Math.round(def.damage * mult + (ctx.difficulty === 1 ? 0.5 : 0))), m.type === 'zombie' ? 'Morto por um Zumbi' : 'Morto por uma Aranha', p);
            if (m.type === 'zombie') { m.model.parts.armR.rotation.x = -Math.PI / 1.8; }
          }
          if (m.type === 'spider' && hd < 4 && hd > 2 && m.body.onGround && Math.random() < dt * 1.5) { m.body.vel.y = 6; m.body.vel.x += dirx * 4; m.body.vel.z += dirz * 4; }
        }
      } else {
        if (m.fuse > 0) m.fuse = Math.max(0, m.fuse - dt);
        if (m.state === 'chase') { m.state = 'idle'; m.stateTime = 1; }
        this.wander(m);
        if (m.state === 'wander') { wantX = Math.sin(m.yaw); wantZ = Math.cos(m.yaw); speed *= 0.4; }
      }
      // sun burning
      if ((m.type === 'zombie' || m.type === 'skeleton') && ctx.daylight > 0.7 && !m.body.inWater) {
        const [s] = world.getLight(Math.floor(p.x), Math.floor(p.y + 1.7), Math.floor(p.z));
        if (s >= 15) {
          m.burnTimer += dt;
          if (Math.random() < dt * 20) ctx.flame(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.9, (Math.random() - 0.5) * 0.6)));
          if (m.burnTimer > 1) { m.burnTimer = 0; m.health -= 1; m.hurtTime = 0.2; if (m.health <= 0) { m.state = 'dead'; m.deathTime = 0; } }
        }
      }
    } else {
      if (m.state === 'flee' && m.stateTime > 0) {
        const away = p.clone().sub(m.fleeFrom).setY(0);
        if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        away.normalize();
        if (Math.random() < dt * 1.2) { m.fleeFrom.add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)); }
        m.yaw = Math.atan2(away.x, away.z);
        wantX = away.x; wantZ = away.z; speed *= 2.1;
      } else {
        if (m.state === 'flee') { m.state = 'idle'; m.stateTime = 2; }
        this.wander(m);
        if (m.state === 'wander') { wantX = Math.sin(m.yaw); wantZ = Math.cos(m.yaw); }
      }
      // avoid cliffs/water when wandering
      if ((wantX || wantZ) && m.state === 'wander') {
        const ax = Math.floor(p.x + wantX * 0.9), az = Math.floor(p.z + wantZ * 0.9);
        const fy = Math.floor(p.y);
        const ground = SOLID[world.getBlock(ax, fy - 1, az)] || SOLID[world.getBlock(ax, fy - 2, az)] || SOLID[world.getBlock(ax, fy, az)];
        if (!ground || world.getBlock(ax, fy - 1, az) === B.WATER) { m.state = 'idle'; m.stateTime = 1; wantX = 0; wantZ = 0; m.yaw += Math.PI * (0.5 + Math.random()); }
      }
    }

    // random sounds
    m.soundTimer -= dt;
    if (m.soundTimer <= 0) {
      m.soundTimer = 6 + Math.random() * 12;
      if (m.type !== 'creeper' && distP < 20) ctx.sound(def.sound, p);
    }

    // --- physics ---
    const b = m.body;
    const accel = b.onGround ? 14 : 3;
    b.vel.x += (wantX * speed - b.vel.x) * Math.min(1, accel * dt);
    b.vel.z += (wantZ * speed - b.vel.z) * Math.min(1, accel * dt);
    if (b.inWater) {
      b.vel.y = Math.min(b.vel.y + 18 * dt, 2.2);
      if (b.collidedH) b.vel.y = 4;
    } else {
      b.vel.y -= 28 * dt;
    }
    if (b.collidedH && b.onGround && (wantX || wantZ)) jump = true;
    if (m.type === 'spider' && b.collidedH && (wantX || wantZ)) b.vel.y = 3; // wall climbing
    if (jump) b.vel.y = 8.2;
    b.vel.y = Math.max(b.vel.y, -60);
    const fallStart = b.vel.y;
    moveBody(world, b, dt, 0.6);
    if (b.onGround && fallStart < -18 && m.alive) {
      m.health -= Math.floor((-fallStart - 16) / 3);
      if (m.health <= 0) { m.state = 'dead'; m.deathTime = 0; }
    }

    // --- animation ---
    const hs = Math.hypot(b.vel.x, b.vel.z);
    m.walk += hs * dt * 3.2;
    const swing = Math.sin(m.walk) * def.legSwing * Math.min(1, hs / 1.5);
    const P = m.model.parts;
    const legs = ['legFR', 'legBL', 'legR'];
    for (const k of Object.keys(P)) {
      if (k.startsWith('leg') && m.type !== 'spider') P[k].rotation.x = legs.includes(k) ? swing : -swing;
    }
    if (m.type === 'spider') for (let i = 0; i < 4; i++) {
      const s = Math.sin(m.walk * 1.5 + i * 1.3) * 0.25 * Math.min(1, hs);
      P['legR' + i].rotation.y = -(i - 1.5) * 0.35 + s; P['legL' + i].rotation.y = (i - 1.5) * 0.35 - s;
    }
    if (m.type === 'chicken') { const f = Math.abs(Math.sin(m.walk * 2)) * (b.onGround ? 0.2 : 1.2); P.wingR.rotation.z = f; P.wingL.rotation.z = -f; }
    if (m.type === 'player' as MobType || m.type === 'skeleton') { P.armR.rotation.x = -swing * 0.8; }
    if (m.type === 'zombie' && m.attackCd < 0.6) P.armR.rotation.x += (-Math.PI / 2.2 - P.armR.rotation.x) * Math.min(1, dt * 6);
    // body yaw smoothing
    const cur = m.model.root.rotation.y;
    let diff = m.yaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    m.model.root.rotation.y = cur + diff * Math.min(1, dt * 8);
    // creeper swelling
    const sc = 1 + (m.type === 'creeper' ? m.fuse * 0.12 + Math.sin(m.fuse * 30) * m.fuse * 0.02 : 0);
    m.model.root.scale.setScalar(sc);
    // lighting / hurt tint
    const l = this.lightAt(world, p, 1) / 15;
    const sky = world.getLight(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z));
    const lv = Math.max((sky[0] / 15) * (0.2 + 0.8 * ctx.daylight), sky[1] / 15);
    const br = 0.08 + 0.92 * Math.pow(lv, 1.3);
    void l;
    if (m.hurtTime > 0.2) m.model.material.color.setRGB(1, 0.3, 0.3);
    else if (m.type === 'creeper' && m.fuse > 0 && Math.sin(m.fuse * 25) > 0) m.model.material.color.setRGB(2, 2, 2);
    else m.model.material.color.setRGB(br, br, br);
    this.place(m);
  }

  private wander(m: Mob) {
    if (m.stateTime > 0) return;
    if (m.state === 'wander') { m.state = 'idle'; m.stateTime = 2 + Math.random() * 5; }
    else { m.state = 'wander'; m.stateTime = 2 + Math.random() * 4; m.yaw = Math.random() * Math.PI * 2; }
  }

  private place(m: Mob) {
    m.model.root.position.copy(m.body.pos);
  }

  lineOfSight(world: World, a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = b.clone().sub(a);
    const len = d.length();
    d.normalize();
    for (let t = 0; t < len; t += 0.4) {
      const p = a.clone().addScaledVector(d, t);
      const id = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (SOLID[id] && id !== B.GLASS) return false;
    }
    return true;
  }

  count(hostile: boolean) { return this.mobs.filter((m) => m.alive && m.def.hostile === hostile).length; }

  toJSON() {
    return this.mobs.filter((m) => m.alive && !m.def.hostile).map((m) => ({ t: m.type, x: m.body.pos.x, y: m.body.pos.y, z: m.body.pos.z, h: m.health }));
  }
}
