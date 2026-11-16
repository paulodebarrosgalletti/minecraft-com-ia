// Fully synthesized sound effects, ambience and generative background music (Web Audio API).

export type Material = 'stone' | 'wood' | 'grass' | 'sand' | 'gravel' | 'glass' | 'cloth' | 'snow';

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private noiseBuf!: AudioBuffer;
  private windGain: GainNode | null = null;
  private waterGain: GainNode | null = null;
  private caveGain: GainNode | null = null;
  private musicTimer = 20;
  volumes = { master: 0.8, sfx: 1, ambient: 0.6, music: 0.5 };
  listener = { x: 0, y: 0, z: 0 };

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.applyVolumes();
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.amb.gain.value = this.volumes.ambient;
    this.music.gain.value = this.volumes.music * 0.5;
  }

  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, at = 0, dest?: AudioNode, attack = 0.005) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest ?? this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return f;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, endFreq?: number, dest?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type;
    const t = c.currentTime + at;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  private distVol(pos?: { x: number; y: number; z: number }, range = 16): number {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return Math.max(0, 1 - d / range);
  }

  blockSound(mat: Material, kind: 'break' | 'place' | 'hit' | 'step', pos?: { x: number; y: number; z: number }) {
    if (!this.ctx) return;
    const v = this.distVol(pos) * (kind === 'step' ? 0.25 : kind === 'hit' ? 0.3 : 0.8);
    if (v <= 0.01) return;
    const dur = kind === 'break' ? 0.22 : kind === 'place' ? 0.12 : 0.08;
    const p = 0.85 + Math.random() * 0.3;
    switch (mat) {
      case 'stone': this.noise(dur, 'bandpass', 1800 * p, 1.2, v); this.noise(dur * 0.6, 'lowpass', 500, 1, v * 0.6); break;
      case 'wood': this.noise(dur, 'bandpass', 600 * p, 3, v); this.tone(160 * p, dur * 0.8, 'triangle', v * 0.5); break;
      case 'grass': this.noise(dur * 1.1, 'highpass', 2500 * p, 0.7, v * 0.7); this.noise(dur, 'lowpass', 900, 1, v * 0.4); break;
      case 'sand': this.noise(dur * 1.2, 'highpass', 3500 * p, 0.5, v * 0.6); break;
      case 'snow': this.noise(dur * 1.1, 'bandpass', 2800 * p, 0.8, v * 0.5); break;
      case 'gravel': this.noise(dur, 'bandpass', 1100 * p, 0.8, v); this.noise(dur * 0.5, 'lowpass', 400, 1, v * 0.5, 0.03); break;
      case 'glass':
        if (kind === 'break') { for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2500, 0.15, 'sine', v * 0.3, i * 0.025); }
        else this.noise(dur, 'bandpass', 3000, 2, v * 0.5);
        break;
      case 'cloth': this.noise(dur, 'lowpass', 700 * p, 0.7, v * 0.8); break;
    }
  }

  play(name: string, pos?: { x: number; y: number; z: number }, volume = 1) {
    if (!this.ctx) return;
    const v = this.distVol(pos, 24) * volume;
    if (v <= 0.01) return;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'click': this.tone(800, 0.05, 'square', 0.15); this.tone(1200, 0.04, 'square', 0.08, 0.02); break;
      case 'hover': this.tone(1400, 0.03, 'sine', 0.03); break;
      case 'pop': this.tone(600 * r(), 0.09, 'sine', 0.25 * v, 0, 1400); break;
      case 'hurt': this.tone(320, 0.18, 'sawtooth', 0.25 * v, 0, 140); this.noise(0.12, 'lowpass', 900, 1, 0.2 * v); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, 'bandpass', 1500 + Math.random() * 1000, 1.5, 0.4 * v, i * 0.11); break;
      case 'burp': this.tone(140, 0.25, 'sawtooth', 0.2 * v, 0, 90); break;
      case 'jump': this.noise(0.08, 'lowpass', 600, 1, 0.12 * v); break;
      case 'land': this.noise(0.12, 'lowpass', 400, 1, 0.3 * v); break;
      case 'swim': this.noise(0.25, 'bandpass', 900 * r(), 0.6, 0.15 * v); break;
      case 'splash': this.noise(0.5, 'bandpass', 1200, 0.5, 0.4 * v, 0, undefined, 0.02); break;
      case 'attack': this.noise(0.08, 'bandpass', 2400, 1, 0.2 * v); break;
      case 'hit': this.tone(180, 0.1, 'square', 0.22 * v, 0, 90); this.noise(0.08, 'lowpass', 1400, 1, 0.25 * v); break;
      case 'craft': this.tone(500, 0.06, 'triangle', 0.2); this.tone(750, 0.08, 'triangle', 0.18, 0.06); break;
      case 'open': this.noise(0.15, 'lowpass', 500, 1, 0.3); this.tone(220, 0.1, 'triangle', 0.15); break;
      case 'close': this.noise(0.1, 'lowpass', 400, 1, 0.25); this.tone(180, 0.08, 'triangle', 0.12); break;
      case 'door': this.noise(0.18, 'bandpass', 500, 2, 0.4 * v); this.tone(240, 0.12, 'triangle', 0.2 * v, 0.03, 180); break;
      case 'chest': this.noise(0.25, 'bandpass', 350, 2, 0.4 * v); this.tone(200, 0.2, 'sawtooth', 0.08 * v, 0, 150); break;
      case 'fizz': this.noise(0.3, 'highpass', 3000, 0.5, 0.2 * v); break;
      case 'levelup': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.15, i * 0.08)); break;
      case 'break_tool': this.noise(0.2, 'highpass', 2500, 1, 0.4); this.tone(900, 0.2, 'square', 0.15, 0, 300); break;
      case 'explode': {
        this.noise(1.6, 'lowpass', 600, 0.6, 1.0 * v, 0, undefined, 0.01);
        this.noise(0.6, 'lowpass', 2000, 0.6, 0.5 * v);
        this.tone(70, 1.0, 'sine', 0.6 * v, 0, 30);
        break;
      }
      case 'fuse': this.noise(1.4, 'highpass', 2200, 0.6, 0.45 * v, 0, undefined, 0.3); break;
      case 'bow': this.noise(0.12, 'bandpass', 1500, 2, 0.3 * v); this.tone(300, 0.1, 'triangle', 0.15 * v, 0, 600); break;
      case 'arrow_hit': this.noise(0.06, 'bandpass', 2000, 2, 0.3 * v); break;
      case 'zombie': { const o = this.tone(110 * r(), 0.8, 'sawtooth', 0.12 * v, 0, 80); void o; this.noise(0.7, 'bandpass', 400, 3, 0.1 * v); break; }
      case 'zombie_hurt': this.tone(160, 0.25, 'sawtooth', 0.18 * v, 0, 90); break;
      case 'skeleton': for (let i = 0; i < 4; i++) this.noise(0.03, 'bandpass', 2500 + i * 300, 4, 0.2 * v, i * 0.06); break;
      case 'spider': this.noise(0.4, 'bandpass', 700, 6, 0.2 * v); this.noise(0.3, 'highpass', 3500, 1, 0.08 * v, 0.1); break;
      case 'cow': this.tone(120 * r(), 0.9, 'sawtooth', 0.16 * v, 0, 95); this.noise(0.8, 'bandpass', 500, 4, 0.06 * v); break;
      case 'pig': for (let i = 0; i < 2; i++) this.tone(280 * r(), 0.12, 'square', 0.1 * v, i * 0.16, 200); break;
      case 'sheep': { const c = this.ctx; const o = this.tone(330 * r(), 0.6, 'sawtooth', 0.1 * v); const lfo = c.createOscillator(); const lg = c.createGain(); lfo.frequency.value = 12; lg.gain.value = 25; lfo.connect(lg); lg.connect(o.frequency); lfo.start(); lfo.stop(c.currentTime + 0.7); break; }
      case 'chicken': for (let i = 0; i < 3; i++) this.tone(900 * r(), 0.06, 'square', 0.06 * v, i * 0.09, 1300); break;
      case 'bubble': this.tone(500 + Math.random() * 400, 0.08, 'sine', 0.1 * v, 0, 1200); break;
      case 'furnace': this.noise(0.4, 'lowpass', 300, 1, 0.15 * v); break;
    }
  }

  private loopNoise(type: BiquadFilterType, freq: number, q: number): { gain: GainNode; filter: BiquadFilterNode } {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.amb);
    src.start();
    return { gain: g, filter: f };
  }

  private startAmbience() {
    const w = this.loopNoise('lowpass', 420, 0.8);
    this.windGain = w.gain;
    // slow wind modulation
    const lfo = this.ctx!.createOscillator(); lfo.frequency.value = 0.07;
    const lg = this.ctx!.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(w.filter.frequency); lfo.start();
    this.waterGain = this.loopNoise('bandpass', 900, 0.4).gain;
    this.caveGain = this.loopNoise('lowpass', 120, 4).gain;
  }

  /** Called every frame with environment info. */
  updateAmbience(dt: number, env: { outdoors: number; nearWater: number; cave: number; night: boolean; inGame: boolean }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain?.gain.setTargetAtTime(env.inGame ? 0.05 * env.outdoors : 0.02, t, 0.5);
    this.waterGain?.gain.setTargetAtTime(env.inGame ? 0.04 * env.nearWater : 0, t, 0.5);
    this.caveGain?.gain.setTargetAtTime(env.inGame ? 0.12 * env.cave : 0, t, 0.8);
    if (env.inGame && env.cave > 0.6 && Math.random() < dt * 0.02) {
      // eerie cave sound
      this.tone(80 + Math.random() * 60, 2.5, 'sine', 0.06, 0, 50 + Math.random() * 40, this.amb);
    }
    if (env.inGame && env.night && env.outdoors > 0.5 && Math.random() < dt * 0.05) {
      // crickets
      for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.04, 'sine', 0.015, i * 0.07, undefined, this.amb);
    }
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 60 + Math.random() * 90;
      this.playPhrase();
    }
  }

  /** Gentle generative piano-like phrase (pentatonic). */
  playPhrase() {
    if (!this.ctx || this.volumes.music <= 0) return;
    const c = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const root = [196, 220, 174.6, 261.6][Math.floor(Math.random() * 4)];
    const n = 10 + Math.floor(Math.random() * 10);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const semi = scale[Math.floor(Math.random() * scale.length)];
      const f = root * Math.pow(2, semi / 12);
      const at = c.currentTime + t;
      for (const [mul, vol] of [[1, 0.09], [2, 0.025], [3, 0.01]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
        o.connect(g); g.connect(this.music);
        o.start(at); o.stop(at + 3);
      }
      if (Math.random() < 0.35) {
        const bf = root / 2 * Math.pow(2, scale[Math.floor(Math.random() * 4)] / 12);
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = bf;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.05, at + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, at + 3.5);
        o.connect(g); g.connect(this.music); o.start(at); o.stop(at + 3.6);
      }
      t += [0.5, 0.75, 1, 1.5][Math.floor(Math.random() * 4)];
    }
  }
}

export const audio = new AudioManager();
