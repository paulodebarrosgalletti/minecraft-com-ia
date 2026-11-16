// Player: movement controller, physics, survival stats.
import * as THREE from 'three';
import { Body, makeBody, moveBody } from './physics';
import { Inventory } from './inventory';
import type { World } from '../world/world';
import type { Input } from './input';

export type GameMode = 'survival' | 'creative';

export interface PlayerEvents {
  onJump(): void;
  onLand(fall: number): void;
  onStep(): void;
  onSwim(): void;
  onSplash(): void;
}

export class Player {
  body: Body = makeBody(0.3, 1.8);
  yaw = 0;
  pitch = 0;
  inv = new Inventory();
  health = 20;
  hunger = 20;
  saturation = 5;
  exhaustion = 0;
  air = 15;
  mode: GameMode = 'survival';
  flying = false;
  sneaking = false;
  sprinting = false;
  dead = false;
  deathCause = '';
  spawn = new THREE.Vector3();
  hasBedSpawn = false;
  hurtTimer = 0;
  invuln = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private drownTimer = 0;
  private fallStartY = 0;
  private airborne = false;
  private stepDist = 0;
  private wasInWater = false;
  walkDist = 0;
  bobAmount = 0;
  eyeOffset = 1.62;

  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.body.pos.x, this.body.pos.y + this.eyeOffset, this.body.pos.z);
  }

  get lookDir(): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt: number, input: Input | null, world: World, ev: PlayerEvents, controls: { sens: number; invert: boolean }) {
    const b = this.body;
    const creative = this.mode === 'creative';
    let fwd = 0, strafe = 0, jump = false, down = false, sprintKey = false;
    if (input && input.locked) {
      this.yaw -= input.dx * 0.0022 * controls.sens;
      this.pitch -= input.dy * 0.0022 * controls.sens * (controls.invert ? -1 : 1);
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
      if (input.keys.has('KeyW')) fwd += 1;
      if (input.keys.has('KeyS')) fwd -= 1;
      if (input.keys.has('KeyA')) strafe -= 1;
      if (input.keys.has('KeyD')) strafe += 1;
      jump = input.keys.has('Space');
      down = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
      // Ctrl is NOT used for sprint: Ctrl+W closes the browser tab and cannot be intercepted.
      sprintKey = input.keys.has('KeyR');
      if (input.doubleTapped.has('KeyW')) this.sprinting = true;
      if (creative && input.doubleTapped.has('Space')) { this.flying = !this.flying; b.vel.y = 0; }
    }
    if (!creative) this.flying = false;
    this.sneaking = down && !this.flying;
    if (sprintKey && fwd > 0) this.sprinting = true;
    if (fwd <= 0 || this.sneaking || (!creative && this.hunger <= 6) || b.collidedH) this.sprinting = false;

    // Desired horizontal velocity
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe, wz = -cos * fwd - sin * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    let speed = 4.317;
    if (this.flying) speed = this.sprinting ? 21 : 10.9;
    else if (this.sneaking) speed = 1.31;
    else if (this.sprinting) speed = 5.61;
    if (b.inWater && !this.flying) speed *= 0.5;
    const accel = this.flying ? 10 : b.onGround ? 22 : b.inWater ? 6 : 6.5;
    b.vel.x += (wx * speed - b.vel.x) * Math.min(1, accel * dt);
    b.vel.z += (wz * speed - b.vel.z) * Math.min(1, accel * dt);

    if (this.flying) {
      const vy = (jump ? 1 : 0) - (down ? 1 : 0);
      b.vel.y += (vy * 8 - b.vel.y) * Math.min(1, 12 * dt);
    } else if (b.inWater) {
      b.vel.y -= 9 * dt;
      b.vel.y *= Math.pow(0.25, dt);
      if (jump) {
        b.vel.y = Math.min(b.vel.y + 26 * dt, 3.2);
        if (b.collidedH) b.vel.y = 5.5; // climb out at shores
        if (Math.random() < dt * 2) ev.onSwim();
      }
      b.vel.y = Math.max(b.vel.y, -3.5);
    } else {
      b.vel.y -= 32 * dt;
      b.vel.y = Math.max(b.vel.y, -78);
      if (jump && b.onGround) {
        b.vel.y = 8.7;
        if (this.sprinting) { b.vel.x -= sin * 2; b.vel.z -= cos * 2; this.exhaustion += 0.2; } else this.exhaustion += 0.05;
        ev.onJump();
      }
    }

    const px = b.pos.x, pz = b.pos.z;
    moveBody(world, b, dt, b.onGround || this.flying ? 0.6 : 0, this.sneaking && !this.flying);
    if (this.flying && b.onGround && !creative) this.flying = false;
    if (creative && this.flying && b.onGround && down) this.flying = false;
    const moved = Math.hypot(b.pos.x - px, b.pos.z - pz);
    if (b.onGround) {
      this.walkDist += moved;
      this.stepDist += moved;
      if (this.stepDist > 2.1) { this.stepDist = 0; ev.onStep(); }
    }
    if (this.sprinting) this.exhaustion += moved * 0.1;
    if (b.inWater) this.exhaustion += moved * 0.01;

    // Splash
    if (b.inWater && !this.wasInWater && b.vel.y < -4) ev.onSplash();
    this.wasInWater = b.inWater;

    // Fall damage
    if (!b.onGround && !b.inWater && !this.flying) {
      if (!this.airborne) { this.airborne = true; this.fallStartY = b.pos.y; }
      this.fallStartY = Math.max(this.fallStartY, b.pos.y);
    } else {
      if (this.airborne) {
        const fall = this.fallStartY - b.pos.y;
        this.airborne = false;
        if (b.onGround) ev.onLand(fall);
        if (!b.inWater && !creative && fall > 3.4) this.damage(Math.floor(fall - 3), 'Caiu de um lugar alto');
      }
      this.fallStartY = b.pos.y;
    }
    if (b.pos.y < -40) { this.damage(1000, 'Caiu do mundo', true); }

    // Eye height (sneak) smoothing
    const targetEye = this.sneaking ? 1.32 : 1.62;
    this.eyeOffset += (targetEye - this.eyeOffset) * Math.min(1, dt * 12);
    const hs = Math.hypot(b.vel.x, b.vel.z);
    this.bobAmount += ((b.onGround && !this.flying ? Math.min(1, hs / 4.3) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
  }

  damage(amount: number, cause: string, bypass = false): boolean {
    if (this.dead) return false;
    if (this.mode === 'creative' && !bypass) return false;
    if (this.invuln > 0 && !bypass) return false;
    this.health -= amount;
    this.hurtTimer = 0.4;
    this.invuln = 0.5;
    this.exhaustion += 0.1;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deathCause = cause;
    }
    return true;
  }

  /** Survival stat tick (called each frame). */
  tickStats(dt: number, difficulty: number) {
    if (this.mode === 'creative' || this.dead) { this.air = 15; return; }
    const b = this.body;
    // Air / drowning
    if (b.headInWater) {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownTimer += dt;
        if (this.drownTimer >= 1) { this.drownTimer = 0; this.damage(2, 'Afogou-se'); }
      }
    } else { this.air = Math.min(15, this.air + dt * 6); this.drownTimer = 0; }
    // Hunger
    if (difficulty === 0) {
      this.regenTimer += dt;
      if (this.regenTimer > 1.5) { this.regenTimer = 0; if (this.health < 20) this.health = Math.min(20, this.health + 1); if (this.hunger < 20) this.hunger++; }
      return;
    }
    this.exhaustion += dt * 0.0035; // slow passive drain
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
    if (this.hunger >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= (this.saturation > 0 && this.hunger >= 20 ? 0.8 : 3.5)) {
        this.regenTimer = 0;
        this.health = Math.min(20, this.health + 1);
        this.exhaustion += 6;
      }
    } else this.regenTimer = 0;
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        const floor = difficulty === 1 ? 10 : difficulty === 2 ? 1 : 0;
        if (this.health > floor) this.damage(1, 'Morreu de fome', true);
      }
    } else this.starveTimer = 0;
  }

  eat(hunger: number, saturation: number) {
    this.hunger = Math.min(20, this.hunger + hunger);
    this.saturation = Math.min(this.hunger, this.saturation + saturation);
  }

  respawn() {
    this.dead = false;
    this.health = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 15;
    this.body.vel.set(0, 0, 0);
    this.body.pos.copy(this.spawn);
    this.airborne = false;
    this.invuln = 2;
  }
}
