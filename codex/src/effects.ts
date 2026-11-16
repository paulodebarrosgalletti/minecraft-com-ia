import * as THREE from 'three';

type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; total: number; size: number };

/** Small, pooled-looking voxel debris, shared geometry and materials keep draw costs bounded. */
export class ParticleSystem {
  private particles: Particle[] = [];
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  constructor(private scene: THREE.Scene) {}

  burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count = 12): void {
    const key = new THREE.Color(color).getHex();
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: key });
      this.materials.set(key, material);
    }
    for (let i = 0; i < Math.min(count, 64); i++) {
      if (this.particles.length >= 260) this.remove(0);
      const mesh = new THREE.Mesh(this.geometry, material);
      const size = 0.045 + Math.random() * 0.09;
      mesh.scale.setScalar(size);
      mesh.position.set(x + (Math.random() - .5) * .4, y + (Math.random() - .5) * .4, z + (Math.random() - .5) * .4);
      mesh.rotation.set(Math.random() * 4, Math.random() * 4, Math.random() * 4);
      this.scene.add(mesh);
      const life = .35 + Math.random() * .5;
      this.particles.push({ mesh, size, life, total: life, velocity: new THREE.Vector3((Math.random() - .5) * 4.5, 1.2 + Math.random() * 3, (Math.random() - .5) * 4.5) });
    }
  }

  update(dt: number): void {
    dt = Math.min(dt, .08);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.remove(i); continue; }
      p.velocity.y -= 8 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.z += dt * 3;
      p.mesh.scale.setScalar(p.size * Math.min(1, p.life / p.total * 3));
    }
  }

  private remove(i: number): void {
    this.scene.remove(this.particles[i].mesh);
    this.particles.splice(i, 1);
  }

  dispose(): void {
    while (this.particles.length) this.remove(this.particles.length - 1);
    this.geometry.dispose();
    this.materials.forEach(m => m.dispose());
    this.materials.clear();
  }
}

/** Original procedural sound effects: no downloaded audio or copyrighted recordings. */
export class AudioManager {
  volume = .65;
  effects = .8;
  ambient = .35;
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private ambienceTimer = 3;

  unlock(): void {
    if (!this.context) {
      const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!ctor) return;
      this.context = new ctor();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    this.master!.gain.value = this.volume;
    void this.context.resume();
  }

  private tone(frequency: number, end: number, duration: number, gain: number, type: OscillatorType = 'triangle', delay = 0): void {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  private hiss(duration: number, gain: number, frequency: number, pitch = 1): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noise || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = pitch;
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start();
    source.stop(now + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  play(name: string, pitch = 1): void {
    if (!this.context || !this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, this.volume));
    const gain = Math.max(0, Math.min(1, this.effects));
    const p = Math.max(.25, Math.min(3, pitch));
    switch (name) {
      case 'break': case 'mine': case 'stone':
        this.hiss(.16, .23 * gain, 1500, p); this.tone(100 * p, 45 * p, .12, .12 * gain, 'square'); break;
      case 'wood':
        this.hiss(.13, .17 * gain, 850, p); this.tone(175 * p, 70 * p, .13, .12 * gain, 'triangle'); break;
      case 'dig':
        this.hiss(.19, .21 * gain, 1100, p); this.tone(65 * p, 35 * p, .11, .075 * gain); break;
      case 'place':
        this.hiss(.06, .17 * gain, 800, p); this.tone(160 * p, 85 * p, .085, .11 * gain, 'triangle'); break;
      case 'step': case 'footstep':
        this.hiss(.055, .055 * gain, 650, p); break;
      case 'swim': case 'water': case 'splash':
        this.hiss(.3, .12 * gain, 3800, p); break;
      case 'hurt': case 'damage':
        this.tone(150 * p, 55 * p, .23, .2 * gain, 'sawtooth'); this.hiss(.1, .08 * gain, 850); break;
      case 'attack': case 'hit':
        this.hiss(.13, .15 * gain, 2500, p); this.tone(180 * p, 75, .1, .07 * gain, 'triangle'); break;
      case 'eat':
        this.hiss(.09, .15 * gain, 2100); this.tone(240, 160, .07, .06 * gain, 'square', .08); break;
      case 'jump':
        this.tone(110 * p, 170 * p, .13, .06 * gain); break;
      case 'explode': case 'explosion':
        this.hiss(.9, .5 * gain, 1400); this.tone(85, 25, .65, .4 * gain, 'sawtooth'); break;
      case 'bow': case 'shoot':
        this.tone(220 * p, 80 * p, .17, .11 * gain, 'triangle'); this.hiss(.1, .07 * gain, 6000); break;
      case 'death':
        this.tone(140, 30, .65, .14 * gain, 'sawtooth'); break;
      case 'craft': case 'levelup': case 'success':
        [392, 494, 587, 784].forEach((n, i) => this.tone(n * p, n * p, .2, .09 * gain, 'triangle', i * .08)); break;
      case 'pickup':
        this.tone(700 * p, 1150 * p, .12, .06 * gain, 'sine'); break;
      case 'chest': case 'door':
        this.tone(100 * p, 160 * p, .18, .08 * gain, 'sawtooth'); break;
      case 'zombie':
        this.tone(75 * p, 48 * p, .5, .09 * gain, 'sawtooth'); break;
      default:
        this.tone(520 * p, 400 * p, .065, .055 * gain, 'sine');
    }
  }

  update(dt: number, night: boolean, water = false): void {
    if (!this.context || this.context.state !== 'running' || !this.master) return;
    this.master.gain.value = Math.max(0, Math.min(1, this.volume));
    this.ambienceTimer -= dt;
    if (this.ambienceTimer > 0 || this.ambient <= 0) return;
    this.ambienceTimer = (night ? 3 : 5) + Math.random() * 5;
    const gain = this.ambient * .025;
    if (water) this.hiss(.8, this.ambient * .055, 2200);
    else if (night) {
      for (let i = 0; i < 3; i++) this.tone(3100, 2900, .07, gain * .5, 'sine', i * .12);
    } else {
      this.tone(2100, 2900, .11, gain, 'sine');
      this.tone(2700, 2000, .15, gain * .8, 'sine', .16);
    }
  }

  dispose(): void {
    void this.context?.close();
    this.context = undefined;
    this.master = undefined;
  }
}
