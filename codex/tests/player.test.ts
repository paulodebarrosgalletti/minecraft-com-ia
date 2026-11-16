import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player, raycast } from '../src/player';
import { B, type WorldAccess } from '../src/shared';

function fixture(mode: 'survival' | 'creative' = 'survival', floor = true) {
  const blocks = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  const world: WorldAccess = {
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? (floor && Math.floor(y) <= 0 ? B.Stone : B.Air),
    setBlock: (x, y, z, id) => { blocks.set(key(x, y, z), id); },
    surface: () => 0,
    isSolid: (x, y, z) => { const id = world.getBlock(x, y, z); return id !== B.Air && id !== B.Water; },
  };
  const damage: { amount: number; cause: string }[] = [];
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(world, camera, mode, (amount, cause) => damage.push({ amount, cause }));
  player.position.set(.5, 1.01, .5);
  player.fallStart = 1.01;
  return { world, player, camera, damage };
}
const tick = (player: Player, frames: number, dt = .02) => { for (let i = 0; i < frames; i++) player.update(dt, 'normal'); };

test('a downward ray reports the nearest block and placement normal', () => {
  const f = fixture();
  const hit = raycast(f.world, new THREE.Vector3(.5, 4, .5), new THREE.Vector3(0, -1, 0), 6);
  assert.ok(hit);
  assert.deepEqual([hit.x, hit.y, hit.z], [0, 0, 0]);
  assert.deepEqual(hit.normal.toArray(), [0, 1, 0]);
  assert.equal(hit.distance, 3);
});

test('raycasting skips water and plants, respects range, and handles negative coordinates', () => {
  const f = fixture('survival', false);
  f.world.setBlock(-1, 2, 0, B.Water);
  f.world.setBlock(-2, 2, 0, B.TallGrass);
  f.world.setBlock(-3, 2, 0, B.OakLog);
  const origin = new THREE.Vector3(.5, 2.5, .5), direction = new THREE.Vector3(-1, 0, 0);
  assert.equal(raycast(f.world, origin, direction, 2), null);
  const hit = raycast(f.world, origin, direction, 4);
  assert.ok(hit);
  assert.equal(hit.id, B.OakLog);
  assert.equal(hit.distance, 2.5);
  assert.deepEqual(hit.normal.toArray(), [1, 0, 0]);
});

test('gravity settles feet above the floor and keeps the eye at standing height', () => {
  const { player, camera, damage } = fixture();
  player.position.y = 3;
  player.fallStart = 3;
  tick(player, 100);
  assert.ok(player.position.y >= .998 && player.position.y < 1.18);
  assert.equal(player.grounded, true);
  assert.ok(Math.abs(camera.position.y - player.position.y - 1.62) < .03);
  assert.equal(damage.length, 0);
});

test('sprinting cannot tunnel through a one-block wall even at a long frame step', () => {
  const f = fixture();
  for (let y = 1; y <= 3; y++) for (let z = -1; z <= 1; z++) f.world.setBlock(2, y, z, B.Stone);
  f.player.keys.add('KeyD');
  f.player.keys.add('ControlLeft');
  tick(f.player, 30, .1);
  assert.ok(f.player.position.x <= 1.711);
  assert.equal(f.player.collides(...f.player.position.toArray() as [number, number, number]), false);
});

test('jumping is edge-triggered and a ceiling blocks the head', () => {
  const f = fixture();
  f.world.setBlock(0, 3, 0, B.Stone);
  tick(f.player, 2);
  f.player.keys.add('Space');
  tick(f.player, 70);
  assert.ok(f.player.position.y < 1.23);
  assert.equal(f.player.grounded, true);
  assert.equal(f.damage.length, 0);
});

test('crouching prevents walking off an unsupported ledge', () => {
  const f = fixture('survival', false);
  f.world.setBlock(0, 0, 0, B.Stone);
  tick(f.player, 2);
  f.player.keys.add('ShiftLeft');
  f.player.keys.add('KeyD');
  tick(f.player, 100);
  assert.ok(f.player.position.x < 1.3);
  assert.ok(f.player.position.y >= .998);
});

test('a long fall hurts a survival player but creative mode ignores damage', () => {
  for (const mode of ['survival', 'creative'] as const) {
    const f = fixture(mode);
    f.player.position.y = 10;
    f.player.fallStart = 10;
    tick(f.player, 100);
    assert.ok(f.player.grounded);
    if (mode === 'survival') {
      assert.ok(f.player.health < 20);
      assert.equal(f.damage[0]?.cause, 'uma queda');
    } else {
      assert.equal(f.player.health, 20);
      assert.equal(f.damage.length, 0);
    }
  }
});

test('damage invulnerability prevents duplicate hits within one combat interval', () => {
  const f = fixture();
  f.player.damage(3, 'test');
  f.player.damage(8, 'test');
  assert.equal(f.player.health, 17);
  tick(f.player, 34);
  f.player.damage(2, 'test');
  assert.equal(f.player.health, 15);
});

test('holding jump in water swims upward and breath recovers after surfacing', () => {
  const f = fixture();
  for (let y = 1; y <= 5; y++) f.world.setBlock(0, y, 0, B.Water);
  f.player.air = 3;
  f.player.keys.add('Space');
  tick(f.player, 80);
  assert.ok(f.player.position.y > 4);
  f.player.position.y = 8;
  f.player.flying = true;
  f.player.keys.clear();
  tick(f.player, 30);
  assert.ok(f.player.air > 3);
});
