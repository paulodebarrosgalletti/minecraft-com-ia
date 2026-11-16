import * as THREE from 'three';
import { B, type Difficulty, type WorldAccess } from './shared';
import { ParticleSystem } from './effects';

export type MobType = 'cow' | 'pig' | 'sheep' | 'chicken' | 'zombie' | 'skeleton' | 'creeper';
export interface Mob {
  type: MobType;
  group: THREE.Group;
  health: number;
  velocity: THREE.Vector3;
  height: number;
  radius: number;
  hostile: boolean;
  limbs: THREE.Group[];
  wings: THREE.Group[];
  materials: THREE.MeshLambertMaterial[];
  wander: THREE.Vector3;
  wanderTimer: number;
  hurt: number;
  flee: number;
  cooldown: number;
  fuse: number;
  age: number;
  phase: number;
  grounded: boolean;
  knockback: THREE.Vector3;
  burnTimer: number;
}

interface Callbacks {
  damagePlayer: (amount: number, cause: string) => void;
  drop: (x: number, y: number, z: number, id: string, count: number) => void;
  explode?: (x: number, y: number, z: number) => void;
}
type Arrow = { mesh: THREE.Group; velocity: THREE.Vector3; life: number };
const passive: MobType[] = ['cow', 'pig', 'sheep', 'chicken'];
const hostile: MobType[] = ['zombie', 'skeleton', 'creeper'];
const v = new THREE.Vector3();

/** Living voxel inhabitants. Positions are the center of each creature's feet. */
export class MobManager {
  readonly mobs: Mob[] = [];
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private arrows: Arrow[] = [];
  private arrowWood = new THREE.MeshLambertMaterial({ color: 0x8b6439 });
  private arrowTip = new THREE.MeshLambertMaterial({ color: 0xd7d8d0 });
  private particles: ParticleSystem;
  private spawnTimer = 7;
  private initialized = false;
  constructor(private scene: THREE.Scene, private world: WorldAccess, private callbacks: Callbacks) {
    this.particles = new ParticleSystem(scene);
  }

  private box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private make(type: MobType, x: number, y: number, z: number): Mob {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const palette = new Map<number, THREE.MeshLambertMaterial>();
    const mat = (color: number) => {
      if (!palette.has(color)) palette.set(color, new THREE.MeshLambertMaterial({ color }));
      return palette.get(color)!;
    };
    const box = (p: THREE.Object3D, color: number, px: number, py: number, pz: number, w: number, h: number, d: number) => this.box(p, mat(color), px, py, pz, w, h, d);
    const limbs: THREE.Group[] = [];
    const wings: THREE.Group[] = [];
    const leg = (px: number, py: number, pz: number, w: number, h: number, color: number, depth = w) => {
      const pivot = new THREE.Group(); pivot.position.set(px, py, pz); group.add(pivot);
      box(pivot, color, 0, -h / 2, 0, w, h, depth); limbs.push(pivot); return pivot;
    };
    let height = 1.35, radius = .43, health = 10;
    if (type === 'cow') {
      height = 1.5; radius = .48; health = 12;
      box(group, 0xede5d4, 0, .88, .1, .9, .74, 1.36);
      box(group, 0x423028, -.457, .95, .12, .015, .43, .57);
      box(group, 0x4a362b, .457, .83, .44, .015, .39, .4);
      box(group, 0x49332a, .13, 1.258, .27, .5, .012, .52);
      box(group, 0x4b352d, 0, 1.2, -.75, .68, .65, .47);
      box(group, 0xe7c6bc, 0, 1.05, -1.015, .63, .28, .12);
      for (const side of [-1, 1]) {
        box(group, 0xf6f2df, side * .335, 1.22, -.999, .13, .13, .018);
        box(group, 0x211b1c, side * .337, 1.22, -1.013, .064, .085, .012);
        box(group, 0x71504a, side * .18, 1.06, -1.082, .07, .055, .012);
        box(group, 0xddd1ab, side * .25, 1.59, -.71, .12, .22, .12);
        box(group, 0x4d382c, side * .43, 1.38, -.68, .23, .16, .2);
        for (const zz of [-.39, .58]) {
          const l = leg(side * .29, .56, zz, .23, .56, 0xeee3cf);
          box(l, 0x3d2e28, 0, -.49, 0, .24, .14, .25);
        }
      }
      box(group, 0xd99a96, 0, .46, .45, .35, .18, .36);
    } else if (type === 'pig') {
      height = 1.06; health = 10;
      box(group, 0xe998a1, 0, .67, .12, .8, .6, 1.14);
      box(group, 0xf0a5ae, 0, .79, -.61, .67, .58, .59);
      box(group, 0xf6b7bc, 0, .68, -.963, .4, .25, .15);
      for (const side of [-1, 1]) {
        box(group, 0xbd6679, side * .1, .68, -1.045, .06, .06, .012);
        box(group, 0xffede7, side * .23, .88, -.911, .13, .12, .012);
        box(group, 0x302423, side * .235, .88, -.921, .06, .08, .012);
        box(group, 0xd98091, side * .28, 1.09, -.57, .18, .17, .13);
        for (const zz of [-.3, .49]) {
          const l = leg(side * .27, .42, zz, .23, .42, 0xe6959e);
          box(l, 0xb9707c, 0, -.37, 0, .24, .09, .24);
        }
      }
      box(group, 0xd27e8e, 0, .81, .76, .12, .12, .19);
    } else if (type === 'sheep') {
      height = 1.39; health = 10;
      box(group, 0xeae5d6, 0, .94, .13, 1, .82, 1.34);
      for (const side of [-1, 1]) {
        box(group, 0xf7f3e9, side * .49, 1.02, .07, .08, .5, .88);
        for (const zz of [-.38, .6]) leg(side * .32, .55, zz, .2, .55, 0x8a8176);
      }
      box(group, 0x7f7367, 0, 1.11, -.77, .53, .58, .52);
      box(group, 0xf3eee1, 0, 1.4, -.7, .62, .15, .57);
      box(group, 0xa99c8c, 0, .99, -1.045, .38, .17, .03);
      for (const side of [-1, 1]) {
        box(group, 0xfaf8ed, side * .19, 1.18, -1.039, .13, .14, .014);
        box(group, 0x201e1c, side * .19, 1.18, -1.05, .065, .095, .012);
        box(group, 0x7f7367, side * .34, 1.25, -.7, .18, .13, .23);
      }
    } else if (type === 'chicken') {
      height = .93; radius = .24; health = 4;
      box(group, 0xf4f0dc, 0, .48, .05, .49, .48, .58);
      box(group, 0xfff9e7, 0, .78, -.28, .38, .38, .35);
      box(group, 0xe3a936, 0, .72, -.527, .22, .14, .18);
      box(group, 0xc54134, 0, .97, -.27, .13, .11, .26);
      box(group, 0xcc4d39, 0, .57, -.41, .14, .19, .11);
      for (const side of [-1, 1]) {
        box(group, 0x202325, side * .198, .82, -.36, .012, .075, .075);
        leg(side * .12, .28, .04, .055, .28, 0xc88e27);
        box(group, 0xd7a03a, side * .12, .035, -.045, .14, .05, .24);
        const wing = new THREE.Group(); wing.position.set(side * .26, .62, .03); group.add(wing);
        box(wing, 0xddd9c8, side * .035, -.12, 0, .12, .3, .43); wings.push(wing);
      }
      box(group, 0xede5c9, 0, .65, .4, .25, .27, .25);
    } else if (type === 'zombie') {
      height = 1.84; radius = .32; health = 20;
      box(group, 0x3b9da0, 0, 1.05, 0, .57, .66, .32);
      box(group, 0x657fb0, 0, .72, 0, .58, .12, .33);
      for (const side of [-1, 1]) {
        const l = leg(side * .15, .71, 0, .26, .71, 0x4c4c89, .28);
        box(l, 0x35423c, 0, -.65, -.04, .27, .13, .34);
        const arm = new THREE.Group(); arm.position.set(side * .4, 1.28, -.02); group.add(arm);
        box(arm, 0x4e9858, 0, -.025, -.3, .24, .25, .65);
        box(arm, 0x3b9da0, 0, 0, -.09, .25, .27, .24);
      }
      box(group, 0x609e50, 0, 1.58, 0, .59, .57, .54);
      box(group, 0x477d3c, -.14, 1.8, -.276, .21, .08, .012);
      box(group, 0x477d3c, .16, 1.53, -.277, .19, .15, .012);
      for (const side of [-1, 1]) box(group, 0x1e3025, side * .15, 1.64, -.28, .12, .08, .016);
      box(group, 0x314b2b, 0, 1.46, -.282, .25, .07, .018);
    } else if (type === 'skeleton') {
      height = 1.89; radius = .28; health = 16;
      box(group, 0xc8c7b2, 0, 1.04, .04, .13, .64, .12);
      for (let i = 0; i < 4; i++) box(group, 0xdedcc8, 0, .86 + i * .12, -.015, .48, .075, .24);
      box(group, 0xc6c5ae, 0, .73, 0, .44, .13, .23);
      for (const side of [-1, 1]) {
        leg(side * .15, .68, 0, .14, .68, 0xdedbc8, .16);
        const arm = new THREE.Group(); arm.position.set(side * .34, 1.3, -.01); group.add(arm);
        box(arm, 0xd5d3bd, 0, -.24, -.1, .13, .59, .14);
      }
      box(group, 0xe8e4ce, 0, 1.61, 0, .57, .56, .53);
      for (const side of [-1, 1]) box(group, 0x373b33, side * .145, 1.66, -.273, .15, .17, .015);
      box(group, 0x555447, 0, 1.52, -.276, .09, .1, .018);
      box(group, 0x666457, 0, 1.42, -.276, .35, .055, .018);
      for (const side of [-1, 1]) box(group, 0xddd9c2, side * .11, 1.42, -.29, .045, .08, .025);
      box(group, 0x80592f, -.39, .99, -.31, .075, .75, .08);
      box(group, 0x80592f, -.39, 1.38, -.23, .075, .12, .22);
      box(group, 0x80592f, -.39, .6, -.23, .075, .12, .22);
      box(group, 0xddd4b7, -.39, .99, -.12, .025, .74, .025);
    } else {
      height = 1.64; radius = .36; health = 20;
      box(group, 0x64a94c, 0, .87, 0, .57, .83, .38);
      box(group, 0x6eb24e, 0, 1.42, -.025, .68, .59, .63);
      for (const side of [-1, 1]) {
        for (const zz of [-.25, .27]) leg(side * .22, .46, zz, .28, .46, 0x569340, .31);
        box(group, 0x203d22, side * .16, 1.49, -.35, .14, .16, .018);
        box(group, 0x29452a, side * .105, 1.26, -.35, .09, .2, .018);
        box(group, 0x477c38, side * .278, .98, -.198, .11, .14, .018);
      }
      box(group, 0x203d22, 0, 1.32, -.35, .18, .15, .018);
      box(group, 0x81bf57, -.17, 1.65, -.35, .15, .1, .018);
      box(group, 0x518c3e, .22, 1.31, -.35, .11, .12, .018);
      box(group, 0x87ba61, -.15, .96, -.2, .16, .21, .018);
    }
    group.rotation.y = Math.random() * Math.PI * 2;
    group.userData.mob = type;
    this.scene.add(group);
    return {
      type, group, health, height, radius, hostile: hostile.includes(type), limbs, wings,
      materials: [...palette.values()], velocity: new THREE.Vector3(), wander: new THREE.Vector3(),
      wanderTimer: 0, hurt: 0, flee: 0, cooldown: 1 + Math.random(), fuse: 0, age: 0,
      phase: Math.random() * Math.PI * 2, grounded: false, knockback: new THREE.Vector3(), burnTimer: 0,
    };
  }

  /** Public spawn is also convenient for debugging creature behavior. */
  spawn(type: MobType, x: number, y: number, z: number): Mob {
    const mob = this.make(type, x, y, z);
    this.mobs.push(mob);
    return mob;
  }

  private spawnPoint(player: THREE.Vector3, min: number, max: number): THREE.Vector3 | null {
    for (let n = 0; n < 18; n++) {
      const angle = Math.random() * Math.PI * 2, distance = min + Math.random() * (max - min);
      const x = Math.floor(player.x + Math.cos(angle) * distance) + .5;
      const z = Math.floor(player.z + Math.sin(angle) * distance) + .5;
      const y = this.world.surface(Math.floor(x), Math.floor(z)) + 1;
      const under = this.world.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (y < 1 || under === B.Water || !this.world.isSolid(Math.floor(x), y - 1, Math.floor(z))) continue;
      if (this.world.getBlock(Math.floor(x), y, Math.floor(z)) === B.Water) continue;
      if (!this.blocked(x, y, z, .49, 1.9)) return new THREE.Vector3(x, y, z);
    }
    return null;
  }

  spawnAround(player: THREE.Vector3): void {
    if (this.initialized) return;
    this.initialized = true;
    for (let i = 0; i < 10; i++) {
      const point = this.spawnPoint(player, 8, 25);
      if (point) this.spawn(passive[i % passive.length], point.x, point.y, point.z);
    }
  }

  private blocked(x: number, y: number, z: number, radius: number, height: number): boolean {
    for (const dx of [-radius, radius]) for (const dz of [-radius, radius]) {
      for (let yy = Math.floor(y + .04); yy <= Math.floor(y + height - .03); yy++) {
        if (this.world.isSolid(Math.floor(x + dx), yy, Math.floor(z + dz))) return true;
      }
    }
    return false;
  }

  private ground(mob: Mob, y: number): boolean {
    const p = mob.group.position, r = mob.radius * .8;
    for (const dx of [-r, r]) for (const dz of [-r, r]) {
      if (this.world.isSolid(Math.floor(p.x + dx), Math.floor(y), Math.floor(p.z + dz))) return true;
    }
    return false;
  }

  private move(mob: Mob, direction: THREE.Vector3, speed: number, dt: number): void {
    const p = mob.group.position;
    const water = this.world.getBlock(Math.floor(p.x), Math.floor(p.y + .4), Math.floor(p.z)) === B.Water;
    const dx = (direction.x * speed + mob.knockback.x) * dt * (water ? .55 : 1);
    const dz = (direction.z * speed + mob.knockback.z) * dt * (water ? .55 : 1);
    let obstruction = false;
    if (!this.blocked(p.x + dx, p.y + .04, p.z, mob.radius, mob.height)) p.x += dx;
    else obstruction = Math.abs(dx) > .001;
    if (!this.blocked(p.x, p.y + .04, p.z + dz, mob.radius, mob.height)) p.z += dz;
    else obstruction ||= Math.abs(dz) > .001;
    mob.grounded = this.ground(mob, p.y - .06);
    if (obstruction && mob.grounded && direction.lengthSq() > .1) mob.velocity.y = 6.4;
    if (water) mob.velocity.y += 10 * dt;
    mob.velocity.y -= (water ? 7 : 18) * dt;
    if (typeIsChicken(mob) && mob.velocity.y < -1.6) mob.velocity.y = -1.6;
    const nextY = p.y + mob.velocity.y * dt;
    if (mob.velocity.y <= 0 && this.ground(mob, nextY)) {
      p.y = Math.floor(nextY) + 1;
      mob.velocity.y = 0;
      mob.grounded = true;
    } else if (mob.velocity.y > 0 && this.blocked(p.x, nextY, p.z, mob.radius * .8, mob.height)) {
      mob.velocity.y = 0;
    } else p.y = nextY;
    mob.knockback.multiplyScalar(Math.exp(-7 * dt));
    if (direction.lengthSq() > .01) {
      const yaw = Math.atan2(-direction.x, -direction.z);
      const difference = Math.atan2(Math.sin(yaw - mob.group.rotation.y), Math.cos(yaw - mob.group.rotation.y));
      mob.group.rotation.y += difference * Math.min(1, dt * 8);
    }
    mob.phase += dt * (speed > 0 ? speed * 6 : 1);
    const walking = speed > .1 && direction.lengthSq() > .01;
    mob.limbs.forEach((limb, i) => limb.rotation.x = walking ? Math.sin(mob.phase + (i % 2) * Math.PI) * .55 : Math.sin(mob.phase) * .018);
    mob.wings.forEach((wing, i) => wing.rotation.z = (i ? 1 : -1) * (mob.grounded ? .12 + Math.sin(mob.phase) * .04 : .5 + Math.sin(mob.phase * 3) * .55));
  }

  private lineClear(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const length = from.distanceTo(to);
    const delta = to.clone().sub(from).normalize();
    for (let d = .3; d < length; d += .35) {
      v.copy(from).addScaledVector(delta, d);
      if (this.world.isSolid(Math.floor(v.x), Math.floor(v.y), Math.floor(v.z))) return false;
    }
    return true;
  }

  private shoot(mob: Mob, player: THREE.Vector3): void {
    const group = new THREE.Group();
    this.box(group, this.arrowWood, 0, 0, 0, .045, .045, .65);
    this.box(group, this.arrowTip, 0, 0, -.36, .09, .09, .13);
    this.box(group, this.arrowTip, 0, 0, .25, .15, .025, .15);
    group.position.copy(mob.group.position).add(new THREE.Vector3(0, 1.2, 0));
    const target = player.clone().add(new THREE.Vector3(0, .9, 0));
    const velocity = target.sub(group.position).normalize().multiplyScalar(12);
    velocity.y += group.position.distanceTo(player) * .08;
    group.lookAt(group.position.clone().sub(velocity));
    this.scene.add(group);
    this.arrows.push({ mesh: group, velocity, life: 4 });
  }

  private remove(mob: Mob, drops = false): void {
    const index = this.mobs.indexOf(mob);
    if (index < 0) return;
    const p = mob.group.position;
    if (drops) {
      this.particles.burst(p.x, p.y + mob.height * .55, p.z, mob.hostile ? 0x9da995 : 0xc6b3a3, 18);
      const drop = (id: string, count: number) => this.callbacks.drop(p.x, p.y + .3, p.z, id, count);
      if (mob.type === 'cow') { drop('raw_meat', 1 + Math.floor(Math.random() * 3)); drop('leather', 1); }
      if (mob.type === 'pig') drop('raw_meat', 1 + Math.floor(Math.random() * 3));
      if (mob.type === 'sheep') { drop('wool', 1 + Math.floor(Math.random() * 2)); drop('raw_meat', 1); }
      if (mob.type === 'chicken') { drop('raw_meat', 1); drop('feather', 1 + Math.floor(Math.random() * 2)); }
      if (mob.hostile) drop('coal', 1 + (Math.random() < .25 ? 1 : 0));
    }
    this.scene.remove(mob.group);
    mob.materials.forEach(m => m.dispose());
    this.mobs.splice(index, 1);
  }

  attack(origin: THREE.Vector3, direction: THREE.Vector3, damage: number, range = 4): boolean {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    const intersection = new THREE.Vector3();
    let target: Mob | undefined, closest = range;
    for (const mob of this.mobs) {
      const p = mob.group.position, r = mob.radius + .12;
      const bounds = new THREE.Box3(new THREE.Vector3(p.x - r, p.y, p.z - r), new THREE.Vector3(p.x + r, p.y + mob.height, p.z + r));
      if (ray.intersectBox(bounds, intersection)) {
        const distance = intersection.distanceTo(origin);
        if (distance < closest && this.lineClear(origin, intersection)) { closest = distance; target = mob; }
      }
    }
    if (!target || target.hurt > .18) return false;
    target.health -= damage;
    target.hurt = .3;
    target.flee = 5;
    target.knockback.copy(direction).setY(0).normalize().multiplyScalar(5);
    target.velocity.y = 3;
    this.particles.burst(target.group.position.x, target.group.position.y + target.height * .65, target.group.position.z, 0xc96857, 7);
    if (target.health <= 0) this.remove(target, true);
    return true;
  }

  update(dt: number, player: THREE.Vector3, night: boolean, difficulty: Difficulty): void {
    dt = Math.min(Math.max(dt, 0), .06);
    this.particles.update(dt);
    const damageScale = difficulty === 'hard' ? 1.5 : difficulty === 'easy' ? .65 : 1;
    for (const mob of [...this.mobs]) {
      if (!this.mobs.includes(mob)) continue;
      mob.age += dt;
      const p = mob.group.position;
      const distance = Math.hypot(player.x - p.x, player.z - p.z);
      if (p.y < -24 || distance > (mob.hostile ? 82 : 100) || (mob.hostile && difficulty === 'peaceful')) { this.remove(mob); continue; }
      mob.hurt = Math.max(0, mob.hurt - dt);
      mob.flee = Math.max(0, mob.flee - dt);
      mob.cooldown -= dt;
      const direction = new THREE.Vector3();
      let speed = 0;
      if (mob.hostile && distance < 30 && Math.abs(player.y - p.y) < 16) {
        direction.set(player.x - p.x, 0, player.z - p.z).normalize();
        if (mob.type === 'skeleton') {
          speed = distance > 11 ? 1.8 : distance < 5 ? 1.7 : 0;
          if (distance < 5) direction.negate();
          if (distance < 22 && mob.cooldown <= 0 && this.lineClear(p.clone().add(new THREE.Vector3(0, 1.3, 0)), player.clone().add(new THREE.Vector3(0, .9, 0)))) {
            this.shoot(mob, player);
            mob.cooldown = difficulty === 'hard' ? 1.7 : 2.6;
          }
        } else if (mob.type === 'creeper') {
          speed = distance > 2 ? 1.6 : 0;
          if (distance < 2.8 && Math.abs(player.y - p.y) < 2.5) mob.fuse += dt;
          else mob.fuse = Math.max(0, mob.fuse - dt * 1.8);
          if (mob.fuse > 1.65) {
            const blast = p.clone().add(new THREE.Vector3(0, .6, 0));
            this.particles.burst(blast.x, blast.y, blast.z, 0xf3dba1, 50);
            if (distance < 6 && Math.abs(player.y - p.y) < 5) this.callbacks.damagePlayer(Math.max(1, Math.round((1 - distance / 6) * 15 * damageScale)), 'explosão de Creeper');
            this.callbacks.explode?.(p.x, p.y + .5, p.z);
            for (const other of [...this.mobs]) if (other !== mob && other.group.position.distanceTo(blast) < 4) {
              other.health -= 14;
              if (other.health <= 0) this.remove(other, true);
            }
            this.remove(mob);
            continue;
          }
        } else {
          speed = distance > 1.25 ? 1.65 : 0;
          if (distance < 1.65 && Math.abs(player.y - p.y) < 2 && mob.cooldown <= 0) {
            this.callbacks.damagePlayer(Math.max(1, Math.round(3 * damageScale)), 'ataque de Zumbi');
            mob.cooldown = 1.15;
          }
        }
      } else {
        mob.fuse = Math.max(0, mob.fuse - dt);
        mob.wanderTimer -= dt;
        if (mob.flee > 0) {
          direction.set(p.x - player.x, 0, p.z - player.z).normalize();
          speed = mob.type === 'chicken' ? 2.7 : 3.4;
        } else {
          if (mob.wanderTimer <= 0) {
            const angle = Math.random() * Math.PI * 2;
            mob.wander.set(Math.cos(angle), 0, Math.sin(angle));
            if (Math.random() < .35) mob.wander.set(0, 0, 0);
            mob.wanderTimer = 2 + Math.random() * 4;
          }
          direction.copy(mob.wander);
          speed = mob.hostile ? .8 : mob.type === 'chicken' ? .8 : .65;
        }
      }
      // A small nudge prevents an entire herd occupying the same voxel.
      for (const other of this.mobs) if (other !== mob) {
        const dx = p.x - other.group.position.x, dz = p.z - other.group.position.z;
        const dsq = dx * dx + dz * dz;
        if (dsq > .001 && dsq < .65) { direction.x += dx * .55; direction.z += dz * .55; }
      }
      if (direction.lengthSq() > 1) direction.normalize();
      this.move(mob, direction, speed, dt);
      let burning = false;
      if (!night && (mob.type === 'zombie' || mob.type === 'skeleton')) {
        burning = this.world.surface(Math.floor(p.x), Math.floor(p.z)) < p.y + 2;
        for (let yy = Math.floor(p.y + mob.height); burning && yy < Math.min(128, p.y + 20); yy++) {
          if (this.world.isSolid(Math.floor(p.x), yy, Math.floor(p.z))) burning = false;
        }
        if (burning) {
          mob.burnTimer -= dt;
          if (mob.burnTimer <= 0) {
            mob.burnTimer = 1;
            mob.health -= 2;
            this.particles.burst(p.x, p.y + 1, p.z, 0xf2a03d, 3);
          }
        }
      }
      const flash = mob.type === 'creeper' && mob.fuse > 0 && Math.sin(mob.fuse * (9 + mob.fuse * 12)) > .15;
      for (const material of mob.materials) {
        material.emissive.setHex(mob.hurt > 0 ? 0x9f2222 : flash ? 0xbdbdbd : burning ? 0x6b260a : 0x000000);
        material.emissiveIntensity = flash ? .85 : .55;
      }
      if (mob.health <= 0) this.remove(mob, true);
    }
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.life -= dt;
      arrow.velocity.y -= 3.5 * dt;
      arrow.mesh.position.addScaledVector(arrow.velocity, dt);
      arrow.mesh.lookAt(arrow.mesh.position.clone().sub(arrow.velocity));
      const p = arrow.mesh.position;
      const hit = Math.hypot(p.x - player.x, p.z - player.z) < .55 && p.y > player.y - .1 && p.y < player.y + 1.9;
      if (hit && difficulty !== 'peaceful') this.callbacks.damagePlayer(Math.max(1, Math.round(3 * damageScale)), 'flecha de Esqueleto');
      if (hit || arrow.life <= 0 || this.world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) || difficulty === 'peaceful') {
        this.scene.remove(arrow.mesh); this.arrows.splice(i, 1);
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 7 + Math.random() * 5;
      const passiveCount = this.mobs.filter(m => !m.hostile).length;
      const hostileCount = this.mobs.length - passiveCount;
      if (passiveCount < 12) {
        const point = this.spawnPoint(player, 18, 36);
        if (point) this.spawn(passive[Math.floor(Math.random() * passive.length)], point.x, point.y, point.z);
      }
      const hostileLimit = difficulty === 'hard' ? 12 : 8;
      if (night && difficulty !== 'peaceful' && hostileCount < hostileLimit) {
        for (let n = 0; n < Math.min(2, hostileLimit - hostileCount); n++) {
          const point = this.spawnPoint(player, 17, 35);
          if (point) this.spawn(hostile[Math.floor(Math.random() * hostile.length)], point.x, point.y, point.z);
        }
      }
    }
  }

  dispose(): void {
    for (const mob of [...this.mobs]) this.remove(mob);
    for (const arrow of this.arrows) this.scene.remove(arrow.mesh);
    this.arrows.length = 0;
    this.particles.dispose();
    this.geometry.dispose();
    this.arrowWood.dispose();
    this.arrowTip.dispose();
  }
}

function typeIsChicken(mob: Mob): boolean { return mob.type === 'chicken'; }
