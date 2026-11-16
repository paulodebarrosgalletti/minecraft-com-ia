import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs';
import { ParticleSystem } from '../src/effects';
import { B, type WorldAccess } from '../src/shared';

function fixture() {
  const blocks = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  const world: WorldAccess = {
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? (Math.floor(y) <= 0 ? B.Stone : B.Air),
    setBlock: (x, y, z, id) => { blocks.set(key(x, y, z), id); },
    surface: () => 0,
    isSolid: (x, y, z) => { const id = world.getBlock(x, y, z); return id !== B.Air && id !== B.Water; },
  };
  const scene = new THREE.Scene();
  const damage: number[] = [], drops: string[] = [], explosions: number[][] = [];
  const mobs = new MobManager(scene, world, {
    damagePlayer: amount => damage.push(amount),
    drop: (_x, _y, _z, id) => drops.push(id),
    explode: (x, y, z) => explosions.push([x, y, z]),
  });
  return { world, scene, mobs, damage, drops, explosions };
}

test('a melee ray hits the nearest creature and killing it produces its drops', () => {
  const f = fixture();
  const near = f.mobs.spawn('pig', 0, 1, -2);
  const far = f.mobs.spawn('cow', 0, 1, -3.4);
  assert.equal(f.mobs.attack(new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(0, 0, -1), 20), true);
  assert.equal(f.mobs.mobs.includes(near), false);
  assert.equal(far.health, 12);
  assert.deepEqual(f.drops, ['raw_meat']);
  f.mobs.dispose();
  assert.equal(f.scene.children.length, 0);
});

test('solid blocks stop a melee ray', () => {
  const f = fixture();
  const mob = f.mobs.spawn('zombie', 0, 1, -3);
  f.world.setBlock(0, 1, -2, B.Stone);
  f.world.setBlock(0, 2, -2, B.Stone);
  assert.equal(f.mobs.attack(new THREE.Vector3(.1, 1.8, 0), new THREE.Vector3(0, 0, -1), 20), false);
  assert.equal(mob.health, 20);
  f.mobs.dispose();
});

test('peaceful difficulty removes hostile creatures without killing passive animals', () => {
  const f = fixture();
  f.mobs.spawn('zombie', 2, 1, 0);
  f.mobs.spawn('skeleton', 4, 1, 0);
  f.mobs.spawn('creeper', 6, 1, 0);
  const sheep = f.mobs.spawn('sheep', 8, 1, 0);
  f.mobs.update(.05, new THREE.Vector3(0, 1, 0), true, 'peaceful');
  assert.deepEqual(f.mobs.mobs, [sheep]);
  assert.equal(f.damage.length, 0);
  f.mobs.dispose();
});

test('the natural spawn clock produces hostiles at night, keeps day peaceful, and respects population limits', () => {
  const f=fixture(),player=new THREE.Vector3(0,1,0);
  for(let i=0;i<240;i++)f.mobs.update(.05,player,false,'normal');
  assert.equal(f.mobs.mobs.some(m=>m.hostile),false);
  for(let i=0;i<260;i++)f.mobs.update(.05,player,true,'normal');
  assert.ok(f.mobs.mobs.some(m=>m.hostile));
  for(let i=0;i<1600;i++)f.mobs.update(.05,player,true,'normal');
  assert.ok(f.mobs.mobs.filter(m=>m.hostile).length<=8);
  assert.ok(f.mobs.mobs.filter(m=>!m.hostile).length<=12);
  f.mobs.update(.05,player,true,'peaceful');
  assert.equal(f.mobs.mobs.some(m=>m.hostile),false);
  f.mobs.dispose();
});

test('passive creatures stay above a solid floor while wandering', () => {
  const f = fixture();
  for (const type of ['cow', 'pig', 'sheep', 'chicken'] as const) f.mobs.spawn(type, Math.random() * 10, 3, 0);
  for (let i = 0; i < 100; i++) f.mobs.update(.04, new THREE.Vector3(0, 1, 20), false, 'normal');
  for (const mob of f.mobs.mobs) assert.ok(Math.abs(mob.group.position.y - 1) < .001, mob.type);
  f.mobs.dispose();
});

test('a nearby creeper has a fuse, then explodes and applies radial damage', () => {
  const f = fixture();
  const creeper = f.mobs.spawn('creeper', 0, 1, 0);
  const player = new THREE.Vector3(1, 1, 0);
  for (let i = 0; i < 20; i++) f.mobs.update(.05, player, true, 'normal');
  assert.equal(f.explosions.length, 0);
  assert.ok(creeper.fuse > .9);
  for (let i = 0; i < 18; i++) f.mobs.update(.05, player, true, 'normal');
  assert.equal(f.explosions.length, 1);
  assert.equal(f.mobs.mobs.includes(creeper), false);
  assert.ok(f.damage.some(n => n > 0));
  f.mobs.dispose();
});

test('skeleton arrows reach the player and cause damage', () => {
  const f = fixture();
  const skeleton = f.mobs.spawn('skeleton', 0, 1, 0);
  skeleton.cooldown = 0;
  for (let i = 0; i < 35; i++) f.mobs.update(.04, new THREE.Vector3(0, 1, -8), true, 'normal');
  assert.ok(f.damage.length >= 1);
  f.mobs.dispose();
});

test('voxel debris expires and releases scene objects', () => {
  const scene = new THREE.Scene(), particles = new ParticleSystem(scene);
  particles.burst(0, 2, 0, 0x448822, 15);
  assert.equal(scene.children.length, 15);
  for (let i = 0; i < 20; i++) particles.update(.08);
  assert.equal(scene.children.length, 0);
  particles.dispose();
});
