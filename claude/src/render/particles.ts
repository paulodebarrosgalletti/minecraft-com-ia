// Lightweight pooled particle system (square pixels) for block breaking, explosions, smoke, etc.
import * as THREE from 'three';
import type { World } from '../world/world';
import { SOLID } from '../world/blocks';

const MAX = 3000;

export class Particles {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private count = 0;
  private geo: THREE.BufferGeometry;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, life: number, gravity = 14) {
    if (this.count >= MAX) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life;
    this.grav[i] = gravity;
  }

  /** Burst of block-coloured fragments. color in 0..255. */
  burst(x: number, y: number, z: number, color: [number, number, number], n: number, speed = 3, bright = 1, spread = 0.4) {
    for (let k = 0; k < n; k++) {
      const v = 0.75 + Math.random() * 0.5;
      this.spawn(
        x + (Math.random() - 0.5) * spread * 2, y + (Math.random() - 0.5) * spread * 2, z + (Math.random() - 0.5) * spread * 2,
        (Math.random() - 0.5) * speed, Math.random() * speed * 0.9, (Math.random() - 0.5) * speed,
        (color[0] / 255) * v * bright, (color[1] / 255) * v * bright, (color[2] / 255) * v * bright,
        0.5 + Math.random() * 0.6,
      );
    }
  }

  smoke(x: number, y: number, z: number, dark = 0.35) {
    this.spawn(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2, dark, dark, dark, 1 + Math.random(), -0.2);
  }

  flame(x: number, y: number, z: number) {
    this.spawn(x, y, z, (Math.random() - 0.5) * 0.1, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1, 1, 0.75 + Math.random() * 0.2, 0.3, 0.35, -0.3);
  }

  update(dt: number, world: World | null) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.count;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k]; this.vel[i * 3 + k] = this.vel[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k];
          }
          this.life[i] = this.life[j]; this.grav[i] = this.grav[j];
        }
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const nx = this.pos[i * 3] + this.vel[i * 3] * dt;
      const ny = this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt;
      const nz = this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt;
      if (world && this.grav[i] > 0 && SOLID[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        this.vel[i * 3] *= 0.3; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] *= 0.3;
      } else {
        this.pos[i * 3] = nx; this.pos[i * 3 + 1] = ny; this.pos[i * 3 + 2] = nz;
      }
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() { this.count = 0; this.geo.setDrawRange(0, 0); }
}
