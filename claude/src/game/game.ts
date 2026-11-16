// Game manager: owns renderer, world, player, mobs and ties systems together.
import * as THREE from 'three';
import { TextureAtlas, IconFactory } from '../render/textures';
import { createWorldUniforms, createSolidMaterial, createWaterMaterial, WorldUniforms } from '../render/materials';
import { Sky } from '../render/sky';
import { Particles } from '../render/particles';
import { buildModel, Model } from '../render/models';
import { World, chunkKeyStr, selectionBoxes } from '../world/world';
import { Generator, CS, WH, BIOME_NAMES, SEA } from '../world/generator';
import { B, block, SOLID, isLeaves, OPAQUE } from '../world/blocks';
import { itemDef, ItemStack, I } from '../world/items';
import { Player, PlayerEvents } from './player';
import { Input } from './input';
import { EntityManager, Arrow } from './entities';
import { MobManager, MobContext, MobType } from './mobs';
import { UI, UIHooks, DIFFICULTIES } from '../ui/ui';
import { SaveManager, WorldMeta, WorldData, Settings, loadSettings, saveSettings } from './save';
import { FurnaceState, newFurnace, tickFurnace, newChest, sanitizeSlot } from './blockentities';
import { Slot } from './inventory';
import { audio, Material } from '../audio/audio';
import { parseSeed, hashString } from '../core/noise';
import { boxBlocked } from './physics';

type State = 'menu' | 'loading' | 'playing' | 'paused' | 'dead';

const posKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const TIME_SCALE = Number(new URLSearchParams(location.search).get('timeScale')) || 1;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  handScene = new THREE.Scene();
  handCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  atlas: TextureAtlas;
  icons: IconFactory;
  uniforms: WorldUniforms;
  solidMat: THREE.ShaderMaterial;
  waterMat: THREE.ShaderMaterial;
  sky = new Sky();
  particles = new Particles();
  entities: EntityManager;
  mobs = new MobManager();
  world: World | null = null;
  player = new Player();
  input: Input;
  ui: UI;
  settings: Settings = loadSettings();
  state: State = 'menu';
  meta: WorldMeta | null = null;
  difficulty = 2;
  ticks = 1000;
  day = 0;
  chests = new Map<string, Slot[]>();
  furnaces = new Map<string, FurnaceState>();
  saplings = new Map<string, number>();
  private elapsed = 0;
  private last = performance.now();
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private mining: { x: number; y: number; z: number; progress: number; soundT: number } | null = null;
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private crackStage = -1;
  private arm: Model;
  private armGroup = new THREE.Group();
  private heldObj: THREE.Object3D | null = null;
  private heldId = -1;
  private swing = 1;
  private swingSpeed = 4;
  private attackCd = 0;
  private placeCd = 0;
  private eatTime = 0;
  private showDebug = false;
  private hudHidden = false;
  private thirdPerson = false;
  private playerModel: Model;
  private autosave = 60;
  private loadingNeedsPlace = false;
  private loadingStart = 0;
  private sleepT = -1;
  private fovCur = 75;
  private furnaceFxT = 0;
  private hurtTilt = 0;
  private panoramaAngle = 0;
  private openFurnaceKey: string | null = null;
  private mobCtx!: MobContext;
  private ambient = new THREE.AmbientLight(0xffffff, 0.75);
  private sun = new THREE.DirectionalLight(0xffffff, 0.55);
  private handLight = new THREE.AmbientLight(0xffffff, 1);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 1000);
    this.atlas = new TextureAtlas();
    this.icons = new IconFactory(this.atlas);
    this.uniforms = createWorldUniforms(this.atlas.texture);
    this.solidMat = createSolidMaterial(this.uniforms);
    this.waterMat = createWaterMaterial(this.uniforms);
    this.entities = new EntityManager(this.atlas, this.icons);
    this.scene.add(this.sky.group, this.particles.points, this.entities.group, this.mobs.group, this.ambient, this.sun);
    this.sun.position.set(0.3, 1, 0.5);

    // Selection outline + crack overlay
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.outline.visible = false;
    const crackMat = new THREE.MeshBasicMaterial({ map: this.atlas.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), crackMat);
    this.crack.visible = false;
    this.scene.add(this.outline, this.crack);

    // First-person arm
    this.arm = buildModel('player', ['armR']);
    const armPart = this.arm.parts.armR;
    armPart.position.set(0, 0, 0);
    this.armGroup.add(armPart);
    this.handScene.add(this.armGroup, this.handLight, new THREE.DirectionalLight(0xffffff, 0.4));
    this.playerModel = buildModel('player');
    this.playerModel.root.visible = false;
    this.scene.add(this.playerModel.root);

    this.input = new Input(canvas);
    const hooks: UIHooks = {
      settings: this.settings,
      applySettings: () => this.applySettings(),
      playWorld: (m) => this.playWorld(m),
      createWorld: (o) => this.createWorld(o),
      resume: () => this.resume(),
      saveAndQuit: () => this.saveAndQuit(),
      respawn: () => this.respawn(),
      setDifficulty: (d) => { this.difficulty = d; if (this.meta) this.meta.difficulty = d; },
      currentDifficulty: () => (this.world ? this.difficulty : null),
    };
    this.ui = new UI(hooks, this.icons, {
      icons: this.icons,
      dropStack: (s) => this.dropStack(s),
      onCraft: () => audio.play('craft'),
    });
    this.ui.containers.onClose = () => {
      this.openFurnaceKey = null;
      if (this.state === 'playing') this.input.lock();
    };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.ui.containers.open) this.pause();
    };
    this.input.onKey = (code, e) => this.onKey(code, e);
    canvas.addEventListener('click', () => {
      audio.init();
      if (this.state === 'playing' && !this.input.locked && !this.ui.containers.open) this.input.lock();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => { if (this.world && this.state !== 'menu') this.save(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.world && this.state === 'playing') this.save(false); });
    this.resize();
    this.applySettings();
    this.mobCtx = this.makeMobCtx();
  }

  start() {
    this.startPanorama();
    this.ui.showMainMenu();
    const loop = () => {
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCamera.aspect = w / h;
    this.handCamera.updateProjectionMatrix();
  }

  applySettings() {
    const s = this.settings;
    saveSettings(s);
    if (this.world && this.state !== 'menu') {
      this.world.radius = s.renderDistance;
      const fancy = s.quality === 'fancy';
      if (this.world.fancy !== fancy || this.world.smooth !== s.smoothLighting) {
        this.world.fancy = fancy;
        this.world.smooth = s.smoothLighting;
        this.world.remeshAll();
      }
    }
    this.uniforms.brightness.value = s.brightness;
    this.sky.cloudsEnabled = s.clouds;
    this.renderer.setPixelRatio(s.quality === 'fancy' ? Math.min(window.devicePixelRatio, 1.5) : 1);
    this.resize();
    audio.volumes = { master: s.master, sfx: s.sfx, ambient: s.ambient, music: s.music };
    audio.applyVolumes();
  }

  // ------------------------------------------------------------------ menu panorama
  private startPanorama() {
    this.disposeWorld();
    const gen = new Generator(hashString('BlockCraft Panorama 7'), 'default');
    this.world = new World(gen, this.atlas, this.solidMat, this.waterMat);
    this.world.radius = Math.min(6, this.settings.renderDistance);
    this.scene.add(this.world.group);
    const s = gen.findSpawn();
    const h = gen.column(Math.floor(s.x), Math.floor(s.z)).h;
    this.camera.position.set(s.x, Math.max(h, SEA) + 9, s.z);
    this.ticks = 11200;
    this.state = 'menu';
  }

  private disposeWorld() {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    this.mobs.clear();
    this.entities.clear();
    this.particles.clear();
    this.chests.clear();
    this.furnaces.clear();
    this.saplings.clear();
    this.mining = null;
  }

  // ------------------------------------------------------------------ world lifecycle
  private async createWorld(o: { name: string; seed: string; mode: 'survival' | 'creative'; difficulty: number; type: 'default' | 'flat' }) {
    const seed = parseSeed(o.seed);
    const now = Date.now();
    const meta: WorldMeta = {
      id: `w${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: o.name, created: now, lastPlayed: now, mode: o.mode, difficulty: o.difficulty, seed, seedText: o.seed.trim() || String(seed), type: o.type,
    };
    await SaveManager.saveMeta(meta);
    this.startWorld(meta, null);
  }

  private async playWorld(meta: WorldMeta) {
    this.ui.showLoading('Carregando mundo...', 0);
    const data = await SaveManager.loadData(meta.id);
    this.startWorld(meta, data);
  }

  private startWorld(meta: WorldMeta, data: WorldData | null) {
    audio.init();
    this.disposeWorld();
    this.meta = meta;
    this.difficulty = meta.difficulty;
    const mods = new Map<string, Map<number, number>>();
    if (data?.mods) for (const [k, arr] of Object.entries(data.mods)) {
      if (!Array.isArray(arr)) continue;
      const m = new Map<number, number>();
      for (const e of arr) if (Array.isArray(e) && e.length === 2) m.set(Number(e[0]), Number(e[1]));
      mods.set(k, m);
    }
    const gen = new Generator(meta.seed, meta.type);
    this.world = new World(gen, this.atlas, this.solidMat, this.waterMat, mods);
    this.world.radius = this.settings.renderDistance;
    this.world.fancy = this.settings.quality === 'fancy';
    this.world.smooth = this.settings.smoothLighting;
    this.scene.add(this.world.group);
    this.world.onBlockChanged = (x, y, z, oldId, newId) => this.onBlockChanged(x, y, z, oldId, newId);
    // block entities
    if (data) {
      for (const [k, v] of Object.entries(data.chests ?? {})) if (Array.isArray(v)) this.chests.set(k, Array.from({ length: 27 }, (_, i) => sanitizeSlot(v[i])));
      for (const [k, v] of Object.entries(data.furnaces ?? {})) {
        const f = v as any;
        if (f && typeof f === 'object') this.furnaces.set(k, { input: sanitizeSlot(f.input), fuel: sanitizeSlot(f.fuel), output: sanitizeSlot(f.output), burn: Number(f.burn) || 0, burnMax: Number(f.burnMax) || 0, cook: Number(f.cook) || 0 });
      }
      for (const s of data.saplings ?? []) if (Array.isArray(s)) this.saplings.set(posKey(s[0], s[1], s[2]), s[3]);
    }
    const p = this.player = new Player();
    p.mode = meta.mode;
    this.ticks = data?.time ?? 1000;
    this.day = data?.day ?? 0;
    if (data?.player) {
      const d = data.player;
      p.body.pos.set(d.x, d.y, d.z);
      p.yaw = d.yaw; p.pitch = d.pitch;
      p.health = d.health; p.hunger = d.hunger; p.saturation = d.saturation;
      p.inv.load(d.inv);
      p.inv.selected = Math.max(0, Math.min(8, d.selected | 0));
      p.spawn.set(...d.spawn);
      p.hasBedSpawn = !!d.hasBedSpawn;
      p.flying = !!d.flying && p.mode === 'creative';
      if (p.health <= 0) { p.health = 20; p.body.pos.copy(p.spawn); }
      this.loadingNeedsPlace = false;
    } else {
      const s = gen.findSpawn();
      p.body.pos.set(s.x, WH, s.z);
      p.spawn.set(s.x, WH, s.z);
      this.loadingNeedsPlace = true;
    }
    if (data?.animals) for (const a of data.animals as any[]) {
      if (a && typeof a.t === 'string' && ['cow', 'pig', 'sheep', 'chicken'].includes(a.t)) {
        const m = this.mobs.add(a.t as MobType, new THREE.Vector3(a.x, a.y, a.z));
        m.health = a.h ?? m.health;
      }
    }
    this.state = 'loading';
    this.loadingStart = performance.now();
    this.ui.setHudVisible(false);
    this.ui.showLoading('Gerando terreno...', 0);
    this.input.unlock();
  }

  /** Finds a good standing spot near x,z (natural ground with open sky). */
  private findStandSpot(x: number, z: number): THREE.Vector3 {
    const w = this.world!;
    for (let r = 0; r < 12; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
        for (let y = WH - 2; y > 1; y--) {
          const id = w.getBlock(cx, y, cz);
          if (id === B.AIR || !SOLID[id] && id !== B.WATER) continue;
          if (id === B.WATER || isLeaves(id) || id === B.OAK_LOG || id === B.BIRCH_LOG || id === B.SPRUCE_LOG || id === B.CACTUS) break;
          if (!SOLID[w.getBlock(cx, y + 1, cz)] && !SOLID[w.getBlock(cx, y + 2, cz)]) return new THREE.Vector3(cx + 0.5, y + 1, cz + 0.5);
          break;
        }
      }
    }
    const y = w.surfaceY(Math.floor(x), Math.floor(z));
    return new THREE.Vector3(Math.floor(x) + 0.5, y + 1, Math.floor(z) + 0.5);
  }

  private finishLoading() {
    const p = this.player;
    if (this.loadingNeedsPlace) {
      const spot = this.findStandSpot(p.body.pos.x, p.body.pos.z);
      p.body.pos.copy(spot);
      if (!p.hasBedSpawn || p.spawn.y >= WH) p.spawn.copy(spot);
      this.loadingNeedsPlace = false;
    }
    // unstuck
    const b = p.body;
    let guard = 0;
    while (boxBlocked(this.world!, b.pos.x - 0.3, b.pos.y, b.pos.z - 0.3, b.pos.x + 0.3, b.pos.y + 1.8, b.pos.z + 0.3) && guard++ < 128) b.pos.y += 1;
    this.mobs.trySpawn(this.mobCtx, 30);
    this.state = 'playing';
    this.ui.setHudVisible(!this.hudHidden);
    this.ui.showResumeHint();
    this.ui.showHeldName(p.inv.held?.id ?? null);
    this.autosave = 60;
  }

  private resume() {
    if (!this.world || this.state === 'menu') return;
    if (this.state === 'dead') return;
    this.ui.hideScreen();
    this.state = 'playing';
    this.input.lock(() => { if (this.state === 'playing' && !this.input.locked && !this.ui.containers.open) this.ui.showResumeHint(); });
  }

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.mining = null;
    this.ui.showPause();
  }

  private async saveAndQuit() {
    if (this.ui.containers.open) this.ui.containers.close();
    this.ui.showLoading('Salvando mundo...', 0.5);
    await this.save(true);
    this.input.unlock();
    this.ui.setHudVisible(false);
    this.meta = null;
    this.startPanorama();
    this.ui.showMainMenu();
  }

  private captureThumb(): string | undefined {
    try {
      this.render();
      const c = document.createElement('canvas');
      c.width = 160; c.height = 90;
      const g = c.getContext('2d')!;
      const src = this.renderer.domElement;
      const ar = src.width / src.height;
      const sw = ar > 16 / 9 ? src.height * (16 / 9) : src.width;
      const sh = ar > 16 / 9 ? src.height : src.width / (16 / 9);
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 160, 90);
      return c.toDataURL('image/jpeg', 0.75);
    } catch { return undefined; }
  }

  async save(thumb: boolean) {
    if (!this.world || !this.meta || this.state === 'menu' || this.state === 'loading') return;
    const p = this.player;
    const mods: Record<string, [number, number][]> = {};
    for (const [k, m] of this.world.mods) if (m.size) mods[k] = [...m.entries()];
    const chests: Record<string, Slot[]> = {};
    for (const [k, v] of this.chests) chests[k] = v.map((s) => (s ? { ...s } : null));
    const furnaces: Record<string, FurnaceState> = {};
    for (const [k, v] of this.furnaces) furnaces[k] = JSON.parse(JSON.stringify(v));
    const data: WorldData = {
      id: this.meta.id, version: 1,
      player: {
        x: p.body.pos.x, y: p.body.pos.y, z: p.body.pos.z, yaw: p.yaw, pitch: p.pitch,
        health: p.dead ? 20 : p.health, hunger: p.dead ? 20 : p.hunger, saturation: p.saturation, inv: p.inv.toJSON(), selected: p.inv.selected,
        spawn: [p.spawn.x, p.spawn.y, p.spawn.z], hasBedSpawn: p.hasBedSpawn, flying: p.flying,
      },
      time: this.ticks, day: this.day, mods, chests, furnaces,
      animals: this.mobs.toJSON().slice(0, 40),
      saplings: [...this.saplings.entries()].map(([k, t]) => { const [x, y, z] = k.split(',').map(Number); return [x, y, z, t]; }),
    };
    if (p.dead) { data.player!.x = p.spawn.x; data.player!.y = p.spawn.y; data.player!.z = p.spawn.z; }
    this.meta.lastPlayed = Date.now();
    this.meta.difficulty = this.difficulty;
    if (thumb) { const t = this.captureThumb(); if (t) this.meta.thumb = t; }
    try {
      await SaveManager.saveData(data);
      await SaveManager.saveMeta({ ...this.meta });
    } catch (e) {
      console.error('Save failed', e);
      this.ui.toast('Falha ao salvar o mundo!');
    }
  }

  private respawn() {
    const p = this.player;
    if (p.hasBedSpawn) {
      // verify bed still exists
      const bx = Math.floor(p.spawn.x), by = Math.floor(p.spawn.y) - 1, bz = Math.floor(p.spawn.z);
      let ok = false;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 0; dy++) if (this.world!.getBlock(bx + dx, by + dy, bz + dz) === B.BED) ok = true;
      if (!ok && this.world!.isLoaded(bx, bz)) { p.hasBedSpawn = false; this.ui.toast('Sua cama estava faltando ou obstruída'); }
    }
    p.respawn();
    this.loadingNeedsPlace = true;
    this.state = 'loading';
    this.loadingStart = performance.now();
    this.ui.showLoading('Renascendo...', 0);
  }

  // ------------------------------------------------------------------ input
  private onKey(code: string, e: KeyboardEvent) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const c = this.ui.containers;
    if (code === 'Escape') {
      if (c.open) { c.close(); return; }
      if (this.state === 'paused' && this.ui.current === 'pause') { this.resume(); return; }
    }
    if (this.state !== 'playing') return;
    if (code === 'KeyE') {
      if (c.open) { c.close(); }
      else if (this.input.locked && !this.player.dead) {
        this.mining = null;
        c.openWindow(this.player.mode === 'creative' ? 'creative' : 'inventory', this.player);
        this.input.unlock();
      }
      return;
    }
    if (c.open) return;
    if (!this.input.locked) return;
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5));
      if (n >= 1 && n <= 9) this.selectSlot(n - 1);
    } else if (code === 'KeyQ') {
      const s = this.player.inv.held;
      if (s) {
        const n = e.ctrlKey ? s.count : 1;
        this.throwStack({ ...s, count: n });
        this.player.inv.consumeSelected(n);
        this.swing = 0;
      }
    } else if (code === 'F3') this.showDebug = !this.showDebug;
    else if (code === 'F5') this.thirdPerson = !this.thirdPerson;
    else if (code === 'F2') { this.hudHidden = !this.hudHidden; this.ui.setHudVisible(!this.hudHidden); }
  }

  private selectSlot(i: number) {
    const inv = this.player.inv;
    if (inv.selected === i) return;
    inv.selected = i;
    this.eatTime = 0;
    this.mining = null;
    this.ui.showHeldName(inv.held?.id ?? null);
  }

  private throwStack(s: ItemStack) {
    const p = this.player;
    const dir = p.lookDir;
    const eye = p.eye;
    this.entities.spawnItem(s, eye.x, eye.y - 0.3, eye.z, dir.clone().multiplyScalar(6).add(new THREE.Vector3(0, 1.5, 0)), 1.5);
  }

  private dropStack(s: ItemStack) {
    if (!this.world || this.state === 'menu') return;
    this.throwStack(s);
  }

  // ------------------------------------------------------------------ main loop
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }
    this.uniforms.time.value = this.elapsed;

    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'loading') this.updateLoading();
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'paused' || this.state === 'dead') {
      if (this.world) this.world.update(this.player.body.pos.x, this.player.body.pos.z, 4);
      this.updateCamera(0);
    }
    audio.updateAmbience(dt, this.ambienceEnv());
    this.render();
    this.input.endFrame();
  }

  private updateMenu(dt: number) {
    const w = this.world!;
    w.update(this.camera.position.x, this.camera.position.z, 10);
    this.panoramaAngle += dt * 0.04;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(-0.18, this.panoramaAngle, 0);
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
    this.ticks = 11200 + Math.sin(this.elapsed * 0.02) * 400;
    this.updateEnvironment(0);
  }

  private updateLoading() {
    const w = this.world!;
    const p = this.player.body.pos;
    const pending = w.update(p.x, p.z, 30);
    // ready when the 5x5 chunks around the player are meshed
    const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
    let ready = 0, total = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      total++;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (c && !c.dirty) ready++;
    }
    this.ui.showLoading(this.loadingNeedsPlace ? 'Gerando terreno...' : 'Carregando terreno...', ready / total);
    this.camera.position.set(p.x, p.y + 1.62, p.z);
    this.updateEnvironment(0);
    void pending;
    if (ready === total && performance.now() - this.loadingStart > 300) this.finishLoading();
  }

  private updatePlaying(dt: number) {
    const w = this.world!;
    const p = this.player;
    const input = this.input;
    const uiOpen = this.ui.containers.open;
    const active = input.locked && !uiOpen && !p.dead;

    // time
    if (this.sleepT < 0) this.ticks += dt * 20 * TIME_SCALE;
    if (this.ticks >= 24000) { this.ticks -= 24000; this.day++; }

    // hotbar scroll
    if (active && input.wheel !== 0) this.selectSlot((p.inv.selected + (input.wheel > 0 ? 1 : 8)) % 9);

    // player physics (freeze if chunk not loaded)
    const pcx = Math.floor(p.body.pos.x / CS), pcz = Math.floor(p.body.pos.z / CS);
    const chunk = w.getChunk(pcx, pcz);
    if (chunk && !chunk.dirty || chunk?.mesh) {
      let rem = dt;
      while (rem > 0) {
        const step = Math.min(rem, 1 / 60);
        p.update(step, active ? input : null, w, this.playerEvents(), { sens: this.settings.sensitivity, invert: this.settings.invertMouse });
        if (active) { input.dx = 0; input.dy = 0; }
        rem -= step;
      }
    }
    if (!active) { p.sprinting = p.sprinting && active; }
    p.tickStats(dt, this.difficulty);

    if (active) this.handleInteraction(dt);
    else { this.mining = null; this.eatTime = 0; }

    // world streaming + updates
    w.update(p.body.pos.x, p.body.pos.z, 6);
    w.tickFluids(dt);
    this.tickBlockEntities(dt);

    // mobs & entities
    this.mobCtx.playerAlive = !p.dead;
    this.mobCtx.playerTargetable = p.mode === 'survival';
    this.mobCtx.difficulty = this.difficulty;
    this.mobCtx.daylight = this.sky.state.daylight;
    this.mobCtx.playerPos.copy(p.body.pos);
    this.mobCtx.playerEye.copy(p.eye);
    this.mobs.update(dt, this.mobCtx);
    this.entities.update(dt, w, p.body.pos, (s) => this.pickup(s), (a) => this.arrowHitsPlayer(a), 1);
    this.particles.update(dt, w);

    // sleeping
    if (this.sleepT >= 0) {
      this.sleepT += dt;
      this.ui.setSleep(Math.min(1, this.sleepT / 1.5) * (this.sleepT > 3 ? Math.max(0, 1 - (this.sleepT - 3) / 1) : 1));
      if (this.sleepT > 2.2 && this.ticks > 1000) { this.ticks = 0; this.day++; this.ui.toast('Bom dia! Ponto de renascimento definido.'); }
      if (this.sleepT > 4) { this.sleepT = -1; this.ui.setSleep(0); }
    }

    // death
    if (p.dead && this.state === 'playing') this.onDeath();

    this.autosave -= dt;
    if (this.autosave <= 0) { this.autosave = 60; this.save(false); }

    this.updateEnvironment(dt);
    this.updateCamera(dt);
    this.updateHand(dt);
    this.ui.updateHud(p, dt);
    if (this.showDebug) this.ui.setDebug(this.debugText()); else this.ui.setDebug(null);
    if (uiOpen && this.openFurnaceKey) this.ui.containers.refresh();
  }

  private playerEvents(): PlayerEvents {
    const p = this.player;
    const below = () => this.world!.getBlock(Math.floor(p.body.pos.x), Math.floor(p.body.pos.y - 0.2), Math.floor(p.body.pos.z));
    return {
      onJump: () => audio.play('jump'),
      onLand: (fall) => { if (fall > 1.5) { audio.blockSound(block(below()).sound as Material, 'step'); audio.play('land'); } },
      onStep: () => { const id = below(); if (id) audio.blockSound(block(id).sound as Material, 'step'); },
      onSwim: () => audio.play('swim'),
      onSplash: () => { audio.play('splash'); this.particles.burst(p.body.pos.x, p.body.pos.y + 0.5, p.body.pos.z, [120, 160, 255], 20, 4); },
    };
  }

  private onDeath() {
    const p = this.player;
    this.state = 'dead';
    this.mining = null;
    if (this.ui.containers.open) this.ui.containers.close();
    for (let i = 0; i < p.inv.slots.length; i++) {
      const s = p.inv.slots[i];
      if (s) this.entities.spawnItem(s, p.body.pos.x, p.body.pos.y + 1, p.body.pos.z, undefined, 2);
      p.inv.slots[i] = null;
    }
    audio.play('hurt');
    this.input.unlock();
    this.ui.showDeath(p.deathCause, `Dia ${this.day + 1} • Você sobreviveu ${this.day} noite(s)`);
  }

  // ------------------------------------------------------------------ interaction
  private handleInteraction(dt: number) {
    const w = this.world!;
    const p = this.player;
    const input = this.input;
    const eye = p.eye;
    const dir = p.lookDir;
    const creative = p.mode === 'creative';
    const reach = creative ? 5.5 : 4.6;
    const hit = w.raycast(eye, dir, reach);
    const mobHit = this.mobs.raycast(eye, dir, 3.2);
    const targetMob = mobHit && (!hit || mobHit.dist < hit.dist) ? mobHit.mob : null;
    this.attackCd -= dt;
    this.placeCd -= dt;

    // outline
    if (hit && !targetMob) {
      const boxes = selectionBoxes(hit.id, w.getMeta(hit.x, hit.y, hit.z));
      const bmin = new THREE.Vector3(1, 1, 1), bmax = new THREE.Vector3(0, 0, 0);
      for (const b of boxes) { bmin.min(new THREE.Vector3(b[0], b[1], b[2])); bmax.max(new THREE.Vector3(b[3], b[4], b[5])); }
      const size = bmax.clone().sub(bmin);
      this.outline.scale.set(size.x + 0.004, size.y + 0.004, size.z + 0.004);
      this.outline.position.set(hit.x + (bmin.x + bmax.x) / 2, hit.y + (bmin.y + bmax.y) / 2, hit.z + (bmin.z + bmax.z) / 2);
      this.outline.visible = true;
    } else this.outline.visible = false;

    // ---- left button: attack / mine
    if (input.mouseDown[0]) {
      if (targetMob) {
        this.mining = null;
        if (input.mousePressed[0] && this.attackCd <= 0) this.attackMob(targetMob);
      } else if (hit) {
        if (creative) {
          if (input.mousePressed[0] || this.placeCd <= 0) {
            const held = p.inv.held;
            if (!(held && itemDef(held.id).tool?.type === 'sword')) this.breakBlock(hit.x, hit.y, hit.z, false);
            this.placeCd = 0.22;
            this.swing = 0;
          }
        } else this.mine(hit.x, hit.y, hit.z, hit.id, dt);
      } else {
        this.mining = null;
        if (input.mousePressed[0]) this.swing = 0;
      }
      if (!this.mining && input.mousePressed[0] && this.swing >= 1) this.swing = 0;
    } else this.mining = null;

    if (input.mousePressed[1] && creative && hit) {
      // pick block
      const id = hit.id === B.OAK_DOOR ? B.OAK_DOOR : hit.id;
      const inv = p.inv;
      const existing = inv.slots.findIndex((s, i) => i < 9 && s?.id === id);
      if (existing >= 0) this.selectSlot(existing);
      else inv.slots[inv.selected] = { id, count: 64 };
    }

    // ---- right button: use / place / eat
    const held = p.inv.held;
    const food = held ? itemDef(held.id).food : undefined;
    if (input.mouseDown[2]) {
      if (input.mousePressed[2] || this.placeCd <= 0) {
        let used = false;
        if (hit && !targetMob && (!p.sneaking || !held)) used = this.interactBlock(hit.x, hit.y, hit.z, hit.id);
        if (!used && food && (p.hunger < 20 || creative && false) && p.mode === 'survival') {
          // eating handled below
        } else if (!used && hit && held && itemDef(held.id).isBlock && !targetMob) {
          if (this.placeBlock(hit, held.id)) { this.swing = 0; }
        }
        this.placeCd = 0.22;
      }
      if (food && p.mode === 'survival' && p.hunger < 20) {
        this.eatTime += dt;
        if (Math.floor(this.eatTime * 5) !== Math.floor((this.eatTime - dt) * 5)) {
          audio.play('eat');
          const e = p.eye.add(dir.clone().multiplyScalar(0.4));
          const col = this.atlas.color('dirt');
          this.particles.burst(e.x, e.y - 0.15, e.z, held!.id === I.APPLE ? [200, 40, 40] : [col[0] + 40, col[1], col[2]], 4, 1.5, 1, 0.1);
        }
        if (this.eatTime >= 1.6) {
          this.eatTime = 0;
          p.eat(food.hunger, food.saturation);
          const wasStew = held!.id === I.MUSHROOM_STEW;
          p.inv.consumeSelected();
          if (wasStew) p.inv.add({ id: I.BOWL, count: 1 });
          audio.play('burp');
          if (held!.id === I.ROTTEN_FLESH && Math.random() < 0.8) { p.exhaustion += 8; this.ui.toast('Isso não fez bem...'); }
        }
      } else this.eatTime = 0;
    } else this.eatTime = 0;
  }

  private attackMob(m: import('./mobs').Mob) {
    const p = this.player;
    const held = p.inv.held;
    const tool = held ? itemDef(held.id).tool : undefined;
    let dmg = tool ? tool.damage : 1;
    const crit = !p.body.onGround && p.body.vel.y < 0 && !p.body.inWater;
    if (crit) dmg *= 1.5;
    const from = p.body.pos.clone();
    this.mobs.damage(m, dmg, from, this.mobCtx, p.sprinting ? 1.5 : 1);
    if (crit) this.particles.burst(m.body.pos.x, m.body.pos.y + m.def.h * 0.7, m.body.pos.z, [255, 255, 200], 10, 3);
    this.particles.burst(m.body.pos.x, m.body.pos.y + m.def.h * 0.6, m.body.pos.z, [180, 30, 30], 5, 2);
    this.attackCd = tool?.type === 'sword' ? 0.3 : tool?.type === 'axe' ? 0.6 : 0.35;
    this.swing = 0;
    p.exhaustion += 0.1;
    audio.play('attack');
    if (tool) this.damageHeld(tool.type === 'sword' ? 1 : 2);
  }

  private harvestInfo(id: number): { time: number; canHarvest: boolean; correctTool: boolean } {
    const d = block(id);
    const p = this.player;
    const held = p.inv.held;
    const tool = held ? itemDef(held.id).tool : undefined;
    if (d.hardness < 0) return { time: Infinity, canHarvest: false, correctTool: false };
    const correctTool = !!tool && tool.type === d.tool;
    const canHarvest = d.level === 0 || (correctTool && tool!.level >= d.level);
    let speed = correctTool ? tool!.speed : 1;
    if (tool?.type === 'sword' && (isLeaves(id) || d.shape === 'cross')) speed = 1.5;
    if (isLeaves(id) && tool?.type === 'axe') speed = tool.speed;
    let time = (d.hardness * (canHarvest ? 1.5 : 5)) / speed;
    if (p.body.headInWater) time *= 5;
    if (!p.body.onGround && !p.body.inWater && !p.flying) time *= 2;
    return { time, canHarvest, correctTool };
  }

  private mine(x: number, y: number, z: number, id: number, dt: number) {
    const m = this.mining;
    if (!m || m.x !== x || m.y !== y || m.z !== z) {
      this.mining = { x, y, z, progress: 0, soundT: 0 };
    }
    const mm = this.mining!;
    const info = this.harvestInfo(id);
    if (!isFinite(info.time)) { this.swing = this.swing >= 1 ? 0 : this.swing; return; }
    mm.progress += info.time <= 0 ? 1 : dt / info.time;
    mm.soundT -= dt;
    if (this.swing >= 1) this.swing = 0;
    if (mm.soundT <= 0) {
      mm.soundT = 0.25;
      audio.blockSound(block(id).sound as Material, 'hit', { x, y, z });
      const c = this.atlas.color(block(id).side);
      const hit = this.world!.raycast(this.player.eye, this.player.lookDir, 6);
      if (hit) this.particles.burst(hit.point.x + hit.nx * 0.05, hit.point.y + hit.ny * 0.05, hit.point.z + hit.nz * 0.05, c, 3, 1.5, 0.9, 0.05);
    }
    if (mm.progress >= 1) {
      this.breakBlock(x, y, z, true);
      this.mining = null;
      this.player.exhaustion += 0.005;
    }
  }

  /** Breaks a block, handling drops, multi-block structures and block entities. */
  breakBlock(x: number, y: number, z: number, survival: boolean, fromExplosion = false, remesh = true) {
    const w = this.world!;
    const id = w.getBlock(x, y, z);
    if (id === B.AIR || id === B.WATER) return;
    const d = block(id);
    if (d.hardness < 0 && survival) return;
    if (id === B.BEDROCK && fromExplosion) return;
    const meta = w.getMeta(x, y, z);
    const info = this.harvestInfo(id);
    const doDrops = survival && (info.canHarvest || fromExplosion);
    w.setBlock(x, y, z, B.AIR, 0, true, remesh);
    // other half of doors / beds
    if (id === B.OAK_DOOR) {
      const oy = meta & 8 ? y - 1 : y + 1;
      if (w.getBlock(x, oy, z) === B.OAK_DOOR) w.setBlock(x, oy, z, B.AIR, 0, true, remesh);
    } else if (id === B.BED) {
      const f = meta & 3;
      const [dx, dz] = FACING_DIRS[f];
      const s = meta & 4 ? -1 : 1;
      if (w.getBlock(x + dx * s, y, z + dz * s) === B.BED) w.setBlock(x + dx * s, y, z + dz * s, B.AIR, 0, true, remesh);
    }
    const k = posKey(x, y, z);
    if (this.chests.has(k)) {
      for (const s of this.chests.get(k)!) if (s) this.entities.spawnItem(s, x + 0.5, y + 0.5, z + 0.5);
      this.chests.delete(k);
    }
    if (this.furnaces.has(k)) {
      const f = this.furnaces.get(k)!;
      for (const s of [f.input, f.fuel, f.output]) if (s) this.entities.spawnItem(s, x + 0.5, y + 0.5, z + 0.5);
      this.furnaces.delete(k);
    }
    this.saplings.delete(k);
    if (doDrops && (!fromExplosion || Math.random() < 0.35)) {
      const drops: [number, number][] = d.drop === undefined ? [[id, 1]] : typeof d.drop === 'number' ? (d.drop < 0 ? [] : [[d.drop, 1]]) : d.drop(Math.random);
      for (const [did, n] of drops) if (n > 0) this.entities.spawnItem({ id: did, count: n }, x + 0.5, y + 0.3, z + 0.5);
    }
    if (!fromExplosion) {
      audio.blockSound(d.sound as Material, 'break', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      const c = this.atlas.color(id === B.GRASS ? 'dirt' : d.side);
      this.particles.burst(x + 0.5, y + 0.5, z + 0.5, c, 24, 3.2);
      if (survival && d.hardness > 0) {
        const held = this.player.inv.held;
        if (held && itemDef(held.id).tool) this.damageHeld(itemDef(held.id).tool!.type === 'sword' ? 2 : 1);
      }
    }
    // things that need support above
    const above = w.getBlock(x, y + 1, z);
    if (above !== B.AIR) {
      const ad = block(above);
      const am = w.getMeta(x, y + 1, z);
      if (ad.shape === 'cross' || (ad.shape === 'torch' && (am & 7) === 0) || (above === B.OAK_DOOR && !(am & 8)) || above === B.CACTUS) {
        this.breakBlock(x, y + 1, z, survival || !fromExplosion, fromExplosion, remesh);
      }
    }
    // wall torches attached to this block
    const wallDirs: [number, number, number][] = [[0, 1, 1], [-1, 2, 0], [0, 3, -1], [1, 4, 0]];
    for (const [dx, wm, dz] of wallDirs) {
      const tx = x + dx, tz = z + dz;
      if (w.getBlock(tx, y, tz) === B.TORCH && (w.getMeta(tx, y, tz) & 7) === wm) this.breakBlock(tx, y, tz, true, fromExplosion, remesh);
    }
    w.afterRemoved(x, y, z);
  }

  private damageHeld(n: number) {
    const p = this.player;
    if (p.mode === 'creative') return;
    const s = p.inv.held;
    if (!s) return;
    const t = itemDef(s.id).tool;
    if (!t) return;
    s.dmg = (s.dmg ?? 0) + n;
    if (s.dmg >= t.durability) {
      p.inv.slots[p.inv.selected] = null;
      audio.play('break_tool');
      const e = p.eye.add(p.lookDir.multiplyScalar(0.5));
      this.particles.burst(e.x, e.y - 0.2, e.z, [140, 120, 90], 12, 2);
      this.ui.toast(`${itemDef(s.id).name} quebrou!`, 2);
    }
  }

  private lookFacing(): number {
    const d = this.player.lookDir;
    if (Math.abs(d.x) > Math.abs(d.z)) return d.x > 0 ? 3 : 1;
    return d.z > 0 ? 0 : 2;
  }

  private placeBlock(hit: import('../world/world').RayHit, id: number): boolean {
    const w = this.world!;
    const p = this.player;
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (block(hit.id).replaceable && hit.id !== B.WATER) { x = hit.x; y = hit.y; z = hit.z; }
    if (y < 1 || y >= WH - 1) return false;
    const cur = w.getBlock(x, y, z);
    if (cur !== B.AIR && !block(cur).replaceable) return false;
    const d = block(id);
    const below = w.getBlock(x, y - 1, z);
    let meta = 0;
    // placement rules
    if (d.shape === 'cross') {
      const okSoil = id === B.DEAD_BUSH ? [B.SAND, B.DIRT, B.GRASS] : id === B.BROWN_MUSHROOM || id === B.RED_MUSHROOM ? [B.DIRT, B.GRASS, B.STONE, B.COBBLE, B.GRAVEL, B.SNOWY_GRASS] : [B.GRASS, B.DIRT, B.SNOWY_GRASS];
      if (!okSoil.includes(below as any)) return false;
    }
    if (id === B.CACTUS && below !== B.SAND && below !== B.CACTUS) return false;
    if (id === B.TORCH) {
      if (hit.ny === 1) { if (!SOLID[below]) return false; meta = 0; }
      else if (hit.ny === -1) return false;
      else {
        if (!OPAQUE[hit.id] && !SOLID[hit.id]) return false;
        meta = hit.nz === 1 ? 1 : hit.nx === -1 ? 2 : hit.nz === -1 ? 3 : 4;
      }
    }
    const f = this.lookFacing();
    if (d.shape === 'stairs') meta = f;
    if (d.front) meta = (f + 2) % 4;
    // collision with player / mobs
    if (d.solid) {
      const pb = p.body;
      const bx = pb.pos.x, by = pb.pos.y, bz = pb.pos.z;
      const inter = (cx: number, cy: number, cz: number, h = 1) => bx + 0.3 > cx && bx - 0.3 < cx + 1 && by + 1.8 > cy && by < cy + h && bz + 0.3 > cz && bz - 0.3 < cz + 1;
      if (inter(x, y, z, id === B.OAK_SLAB || id === B.STONE_SLAB ? 0.5 : 1) && p.mode !== 'creative' || inter(x, y, z) && !p.flying && id !== B.OAK_DOOR) {
        if (!(p.mode === 'creative' && p.flying)) return false;
      }
      for (const m of this.mobs.mobs) {
        const mp = m.body.pos, hw = m.def.hw;
        if (mp.x + hw > x && mp.x - hw < x + 1 && mp.y + m.def.h > y && mp.y < y + 1 && mp.z + hw > z && mp.z - hw < z + 1) return false;
      }
    }
    if (id === B.OAK_DOOR) {
      const up = w.getBlock(x, y + 1, z);
      if (up !== B.AIR && !block(up).replaceable) return false;
      if (!SOLID[below]) return false;
      w.setBlock(x, y, z, B.OAK_DOOR, f);
      w.setBlock(x, y + 1, z, B.OAK_DOOR, f | 8);
    } else if (id === B.BED) {
      const [dx, dz] = FACING_DIRS[f];
      const hx = x + dx, hz = z + dz;
      const hb = w.getBlock(hx, y, hz);
      if ((hb !== B.AIR && !block(hb).replaceable) || !SOLID[w.getBlock(hx, y - 1, hz)] || !SOLID[below]) { this.ui.toast('Não há espaço para a cama', 2); return false; }
      w.setBlock(x, y, z, B.BED, f);
      w.setBlock(hx, y, hz, B.BED, f | 4);
    } else {
      w.setBlock(x, y, z, id, meta);
    }
    const k = posKey(x, y, z);
    if (id === B.CHEST) this.chests.set(k, newChest());
    if (id === B.FURNACE) this.furnaces.set(k, newFurnace());
    if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING) this.saplings.set(k, 60 + Math.random() * 120);
    audio.blockSound(d.sound as Material, 'place', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    if (p.mode === 'survival') p.inv.consumeSelected();
    if (d.gravity) w.checkFalling(x, y, z);
    return true;
  }

  private interactBlock(x: number, y: number, z: number, id: number): boolean {
    const w = this.world!;
    const k = posKey(x, y, z);
    const c = this.ui.containers;
    const open = (kind: 'crafting' | 'furnace' | 'chest', data?: any) => {
      this.mining = null;
      c.openWindow(kind, this.player, data);
      this.input.unlock();
    };
    switch (id) {
      case B.CRAFTING_TABLE: open('crafting'); return true;
      case B.FURNACE: {
        if (!this.furnaces.has(k)) this.furnaces.set(k, newFurnace());
        this.openFurnaceKey = k;
        open('furnace', { furnace: this.furnaces.get(k) });
        return true;
      }
      case B.CHEST: {
        if (!this.chests.has(k)) this.chests.set(k, newChest());
        audio.play('chest', { x, y, z });
        open('chest', { chest: this.chests.get(k) });
        return true;
      }
      case B.OAK_DOOR: {
        const m = w.getMeta(x, y, z);
        const by = m & 8 ? y - 1 : y;
        const bm = w.getMeta(x, by, z);
        const nm = bm ^ 4;
        w.setBlock(x, by, z, B.OAK_DOOR, nm & ~8);
        if (w.getBlock(x, by + 1, z) === B.OAK_DOOR) w.setBlock(x, by + 1, z, B.OAK_DOOR, (nm & ~8) | 8);
        audio.play('door', { x, y, z });
        this.swing = 0;
        return true;
      }
      case B.BED: return this.trySleep(x, y, z);
    }
    return false;
  }

  private trySleep(x: number, y: number, z: number): boolean {
    const p = this.player;
    p.spawn.set(x + 0.5, y + 1, z + 0.5);
    p.hasBedSpawn = true;
    const night = this.ticks > 12541 && this.ticks < 23458;
    if (!night) { this.ui.toast('Você só pode dormir à noite. Ponto de renascimento definido.'); return true; }
    const monsters = this.mobs.mobs.some((m) => m.alive && m.def.hostile && m.body.pos.distanceTo(new THREE.Vector3(x, y, z)) < 8);
    if (monsters) { this.ui.toast('Você não pode descansar agora; há monstros por perto'); return true; }
    if (p.mode === 'survival' && p.body.pos.distanceTo(new THREE.Vector3(x + 0.5, y, z + 0.5)) > 3) { this.ui.toast('Você está muito longe da cama'); return true; }
    this.sleepT = 0;
    return true;
  }

  private pickup(s: ItemStack): number {
    if (this.player.dead) return s.count;
    const left = this.player.inv.add(s);
    if (left < s.count) audio.play('pop');
    return left;
  }

  private arrowHitsPlayer(a: Arrow): boolean {
    const p = this.player;
    const b = p.body;
    if (p.dead || p.mode === 'creative') return false;
    if (a.pos.x > b.pos.x - 0.35 && a.pos.x < b.pos.x + 0.35 && a.pos.z > b.pos.z - 0.35 && a.pos.z < b.pos.z + 0.35 && a.pos.y > b.pos.y && a.pos.y < b.pos.y + 1.85) {
      const mult = [0, 0.5, 1, 1.5][this.difficulty];
      this.damagePlayer(Math.max(1, Math.round(a.damage * mult + Math.random())), 'Atingido por uma flecha de Esqueleto', a.pos.clone().sub(a.vel));
      audio.play('arrow_hit', a.pos);
      return true;
    }
    return false;
  }

  private damagePlayer(amount: number, cause: string, from: THREE.Vector3) {
    const p = this.player;
    if (p.damage(amount, cause)) {
      const d = p.body.pos.clone().sub(from).setY(0).normalize();
      p.body.vel.x += d.x * 6; p.body.vel.z += d.z * 6; p.body.vel.y = Math.max(p.body.vel.y, 4);
      audio.play('hurt');
      this.hurtTilt = 1;
    }
  }

  private explode(pos: THREE.Vector3, power: number) {
    const w = this.world!;
    audio.play('explode', pos);
    for (let i = 0; i < 40; i++) this.particles.spawn(pos.x + (Math.random() - 0.5) * 3, pos.y + (Math.random() - 0.5) * 3, pos.z + (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.9, 0.9, 0.9, 0.8 + Math.random(), -1);
    this.particles.burst(pos.x, pos.y, pos.z, [255, 170, 60], 40, 9);
    // damage player
    const p = this.player;
    const dist = p.body.pos.clone().setY(p.body.pos.y + 0.9).distanceTo(pos);
    const R = power * 2;
    if (dist < R) {
      const mult = [0, 0.5, 1, 1.5][this.difficulty];
      const dmg = Math.round((1 - dist / R) * power * 7 * mult);
      if (dmg > 0) this.damagePlayer(dmg, 'Explodido por um Creeper', pos);
      const push = p.body.pos.clone().sub(pos).normalize().multiplyScalar((1 - dist / R) * 14);
      p.body.vel.add(push);
    }
    for (const m of this.mobs.mobs) {
      const md = m.body.pos.distanceTo(pos);
      if (md < R) this.mobs.damage(m, Math.round((1 - md / R) * power * 7), pos, this.mobCtx, 2);
    }
    // block destruction (not in peaceful)
    if (this.difficulty > 0) {
      const touched = new Set<string>();
      const r = power;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > r - Math.random() * 1.2) continue;
        const x = Math.floor(pos.x) + dx, y = Math.floor(pos.y) + dy, z = Math.floor(pos.z) + dz;
        const id = w.getBlock(x, y, z);
        if (id === B.AIR || id === B.WATER || id === B.BEDROCK) continue;
        this.breakBlock(x, y, z, true, true, false);
        touched.add(chunkKeyStr(Math.floor(x / CS), Math.floor(z / CS)));
      }
      for (const k of touched) {
        const [cx, cz] = k.split(',').map(Number);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const c = w.getChunk(cx + ox, cz + oz);
          if (c) { if (!ox && !oz) w.remesh(c); else c.dirty = true; }
        }
      }
    }
  }

  private onBlockChanged(_x: number, _y: number, _z: number, _old: number, _new: number) { /* hook for future systems */ }

  private tickBlockEntities(dt: number) {
    const w = this.world!;
    this.furnaceFxT -= dt;
    const fx = this.furnaceFxT <= 0;
    if (fx) this.furnaceFxT = 0.15;
    for (const [k, f] of this.furnaces) {
      const [x, y, z] = k.split(',').map(Number);
      const before = f.burn > 0;
      const lit = tickFurnace(f, dt);
      if (!w.isLoaded(x, z)) continue;
      if (w.getBlock(x, y, z) !== B.FURNACE) { this.furnaces.delete(k); continue; }
      const m = w.getMeta(x, y, z);
      if (lit !== before || ((m & 4) !== 0) !== lit) w.setBlock(x, y, z, B.FURNACE, lit ? m | 4 : m & ~4);
      if (lit && fx && this.player.body.pos.distanceToSquared(new THREE.Vector3(x, y, z)) < 400) {
        const [dx, dz] = FACING_DIRS[m & 3];
        const fxp = x + 0.5 + dx * 0.55, fzp = z + 0.5 + dz * 0.55;
        this.particles.flame(fxp, y + 0.3, fzp);
        if (Math.random() < 0.4) this.particles.smoke(x + 0.5, y + 1.05, z + 0.5);
      }
    }
    // torch particles near player
    if (fx) {
      const p = this.player.body.pos;
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(p.x + (Math.random() - 0.5) * 24), y = Math.floor(p.y + (Math.random() - 0.5) * 12), z = Math.floor(p.z + (Math.random() - 0.5) * 24);
        if (w.getBlock(x, y, z) === B.TORCH) {
          const m = w.getMeta(x, y, z) & 7;
          let ox = 0, oz = 0, oy = 0;
          if (m === 1) { oz = -0.34; oy = 0.2; } else if (m === 2) { ox = 0.34; oy = 0.2; } else if (m === 3) { oz = 0.34; oy = 0.2; } else if (m === 4) { ox = -0.34; oy = 0.2; }
          this.particles.flame(x + 0.5 + ox, y + 0.68 + oy, z + 0.5 + oz);
          if (Math.random() < 0.5) this.particles.smoke(x + 0.5 + ox, y + 0.75 + oy, z + 0.5 + oz, 0.25);
        }
      }
    }
    // saplings
    for (const [k, t] of this.saplings) {
      const [x, y, z] = k.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      const nt = t - dt;
      if (nt > 0) { this.saplings.set(k, nt); continue; }
      this.saplings.delete(k);
      const id = w.getBlock(x, y, z);
      if (id !== B.OAK_SAPLING && id !== B.BIRCH_SAPLING && id !== B.SPRUCE_SAPLING) continue;
      this.growTree(x, y, z, id);
    }
  }

  private growTree(x: number, y: number, z: number, sapling: number) {
    const w = this.world!;
    for (let dy = 1; dy < 7; dy++) if (w.getBlock(x, y + dy, z) !== B.AIR) { this.saplings.set(posKey(x, y, z), 30); return; }
    const touched = new Set<string>();
    const set = (bx: number, by: number, bz: number, id: number, onlyAir: boolean) => {
      const cur = w.getBlock(x + bx, by, z + bz);
      if (onlyAir && cur !== B.AIR) return;
      if (!onlyAir && cur !== B.AIR && !isLeaves(cur) && cur !== sapling) return;
      w.setBlock(x + bx, by, z + bz, id, 0, true, false);
      touched.add(chunkKeyStr(Math.floor((x + bx) / CS), Math.floor((z + bz) / CS)));
    };
    w.setBlock(x, y, z, B.AIR, 0, true, false);
    const r = Math.random();
    if (sapling === B.SPRUCE_SAPLING) w.gen.spruce((bx, by, bz, id, oa) => set(bx, by, bz, id, oa), 0, y, 0, r);
    else w.gen.oak((bx, by, bz, id, oa) => set(bx, by, bz, id, oa), 0, y, 0, r, sapling === B.BIRCH_SAPLING ? B.BIRCH_LOG : B.OAK_LOG, sapling === B.BIRCH_SAPLING ? B.BIRCH_LEAVES : B.OAK_LEAVES);
    touched.add(chunkKeyStr(Math.floor(x / CS), Math.floor(z / CS)));
    for (const k of touched) { const [cx, cz] = k.split(',').map(Number); const c = w.getChunk(cx, cz); if (c) w.remesh(c); }
  }

  private makeMobCtx(): MobContext {
    return {
      world: null as unknown as World,
      playerPos: new THREE.Vector3(), playerEye: new THREE.Vector3(), playerAlive: true, playerTargetable: true,
      difficulty: 2, daylight: 1,
      damagePlayer: (a, c, f) => this.damagePlayer(a, c, f),
      dropItem: (id, n, pos) => this.entities.spawnItem({ id, count: n }, pos.x, pos.y, pos.z),
      shootArrow: (from, vel, dmg) => this.entities.spawnArrow(from, vel, dmg),
      explode: (pos, power) => this.explode(pos, power),
      sound: (name, pos) => audio.play(name, pos),
      burst: (pos, color, n) => this.particles.burst(pos.x, pos.y, pos.z, color, n, 2.5),
      flame: (pos) => this.particles.flame(pos.x, pos.y, pos.z),
    };
  }

  // ------------------------------------------------------------------ rendering helpers
  private updateEnvironment(dt: number) {
    const st = this.sky.update(this.camera, this.ticks, this.elapsed);
    this.uniforms.sun.value = st.sunLight;
    this.uniforms.skyTint.value.copy(st.skyTint);
    const p = this.player;
    const underwater = this.state !== 'menu' && this.world !== null && this.world.getBlock(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z)) === B.WATER;
    this.uniforms.underwater.value = underwater ? 1 : 0;
    if (underwater) this.uniforms.fogColor.value.setRGB(0.05, 0.12, 0.35).multiplyScalar(0.3 + 0.7 * st.sunLight);
    else this.uniforms.fogColor.value.copy(st.fogColor);
    const rd = (this.world?.radius ?? 6) * CS;
    this.uniforms.fogFar.value = rd - 2;
    this.uniforms.fogNear.value = rd * 0.55;
    this.ui.setUnderwater(underwater && this.state !== 'menu');
    if (this.mobCtx) this.mobCtx.world = this.world!;
    void dt; void p;
    audio.listener = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    const eye = p.eye;
    let bobX = 0, bobY = 0, roll = 0;
    if (this.settings.viewBobbing && !this.thirdPerson) {
      const ph = p.walkDist * Math.PI * 0.75;
      bobX = Math.sin(ph) * 0.045 * p.bobAmount;
      bobY = -Math.abs(Math.cos(ph)) * 0.06 * p.bobAmount;
      roll = Math.sin(ph) * 0.008 * p.bobAmount;
    }
    this.hurtTilt = Math.max(0, this.hurtTilt - dt * 3);
    roll += Math.sin(this.hurtTilt * Math.PI) * 0.08;
    cam.rotation.set(p.pitch, p.yaw, roll);
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    cam.position.copy(eye).addScaledVector(right, bobX).add(new THREE.Vector3(0, bobY, 0));
    if (this.thirdPerson && this.world) {
      const back = p.lookDir.multiplyScalar(-1);
      const hit = this.world.raycast(eye, back, 4);
      const d = hit ? Math.max(0.3, hit.dist - 0.3) : 4;
      cam.position.copy(eye).addScaledVector(back, d);
    }
    const targetFov = this.settings.fov * (p.sprinting ? 1.12 : 1) * (p.flying && p.sprinting ? 1.05 : 1);
    this.fovCur += (targetFov - this.fovCur) * Math.min(1, dt * 10);
    if (cam.fov !== this.fovCur) { cam.fov = this.fovCur; cam.updateProjectionMatrix(); }
    // third person model
    const pm = this.playerModel;
    pm.root.visible = this.thirdPerson && this.state !== 'menu';
    if (pm.root.visible) {
      pm.root.position.copy(p.body.pos);
      pm.root.rotation.y = p.yaw + Math.PI;
      pm.parts.head.rotation.x = -p.pitch;
      const sw = Math.sin(p.walkDist * 2.2) * 0.7 * p.bobAmount;
      pm.parts.legR.rotation.x = sw; pm.parts.legL.rotation.x = -sw;
      pm.parts.armR.rotation.x = -sw * 0.8 - (this.swing < 1 ? Math.sin(this.swing * Math.PI) * 1.4 : 0);
      pm.parts.armL.rotation.x = sw * 0.8;
      pm.root.position.y -= p.sneaking ? 0.1 : 0;
      const [s, b] = this.world ? this.world.getLight(Math.floor(p.body.pos.x), Math.floor(p.body.pos.y + 1), Math.floor(p.body.pos.z)) : [15, 0];
      const br = 0.1 + 0.9 * Math.max((s / 15) * this.sky.state.sunLight, b / 15);
      pm.material.color.setRGB(br, br, br);
    }
  }

  private updateHand(dt: number) {
    const p = this.player;
    if (this.swing < 1) this.swing = Math.min(1, this.swing + dt * this.swingSpeed);
    const held = p.inv.held;
    const hid = held ? held.id : -1;
    if (hid !== this.heldId) {
      this.heldId = hid;
      if (this.heldObj) this.armGroup.remove(this.heldObj);
      this.heldObj = null;
      if (held) {
        const d = itemDef(held.id);
        let obj: THREE.Object3D;
        if (d.isBlock && ['cube', 'slab', 'stairs', 'cactus', 'bed'].includes(block(held.id).shape)) {
          obj = this.entities.makeItemMesh(held.id, 1.0);
          obj.position.set(-0.08, 0.02, -0.1);
          obj.rotation.set(0.1, Math.PI / 4, 0);
        } else {
          const mat = new THREE.MeshLambertMaterial({ map: this.icons.texture(held.id), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
          obj = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat);
          obj.position.set(-0.1, 0.12, -0.18);
          obj.rotation.set(0, Math.PI / 2 + 0.2, Math.PI / 5);
        }
        this.heldObj = obj;
        this.armGroup.add(obj);
      }
      this.swing = 1;
    }
    const armMesh = this.arm.parts.armR;
    armMesh.visible = !held;
    // position in camera space
    const s = this.swing < 1 ? Math.sin(this.swing * Math.PI) : 0;
    const s2 = this.swing < 1 ? Math.sin(Math.sqrt(this.swing) * Math.PI) : 0;
    const ph = p.walkDist * Math.PI * 0.75;
    const bob = this.settings.viewBobbing ? p.bobAmount : 0;
    const bx = Math.sin(ph) * 0.03 * bob, by = -Math.abs(Math.cos(ph)) * 0.035 * bob;
    const g = this.armGroup;
    if (this.eatTime > 0) {
      g.position.set(0.25 + Math.sin(this.eatTime * 20) * 0.01, -0.35 + Math.abs(Math.sin(this.eatTime * 14)) * 0.04, -0.5);
      g.rotation.set(-0.3, 0.6, 0.2);
    } else {
      g.position.set(0.48 + bx - s2 * 0.25, -0.5 + by + s * 0.12, -0.62 - s * 0.15);
      g.rotation.set(-0.4 - s * 1.0 + (held ? 0.35 : 0), held ? -0.35 : 0.15 - s2 * 0.3, held ? 0.05 : -0.25 + s * 0.2);
    }
    if (!held) {
      armMesh.rotation.set(1.95 - s * 0.5, 0.0, 0.1);
      armMesh.position.set(0.05, -0.12, 0.3);
    }
    // light the hand like the environment
    if (this.world) {
      const e = p.eye;
      const [sl, bl] = this.world.getLight(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
      const br = 0.1 + 0.9 * Math.max((sl / 15) * this.sky.state.sunLight, bl / 15);
      this.handLight.intensity = br * 1.1;
    }
  }

  private render() {
    const r = this.renderer;
    // crack overlay
    if (this.mining && this.state === 'playing') {
      const stage = Math.min(9, Math.floor(this.mining.progress * 10));
      if (stage !== this.crackStage) {
        this.crackStage = stage;
        const t = this.atlas.uv('destroy_' + stage);
        const uv = this.crack.geometry.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const k = i % 4;
          uv.setXY(i, k % 2 ? t[2] : t[0], k < 2 ? t[3] : t[1]);
        }
        uv.needsUpdate = true;
      }
      this.crack.position.set(this.mining.x + 0.5, this.mining.y + 0.5, this.mining.z + 0.5);
      this.crack.visible = true;
    } else { this.crack.visible = false; this.crackStage = -1; }
    if (this.state === 'menu' || this.state === 'loading') this.outline.visible = false;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused') && !this.thirdPerson && !this.hudHidden && !this.player.dead) {
      r.clearDepth();
      r.render(this.handScene, this.handCamera);
    }
  }

  private ambienceEnv() {
    const inGame = this.state === 'playing' && !!this.world;
    if (!inGame || !this.world) return { outdoors: 1, nearWater: 0, cave: 0, night: false, inGame: false };
    const p = this.player.eye;
    const [s] = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    let water = 0;
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(p.x + (Math.random() - 0.5) * 16), z = Math.floor(p.z + (Math.random() - 0.5) * 16);
      if (this.world.getBlock(x, SEA, z) === B.WATER && Math.abs(p.y - SEA) < 12) water++;
    }
    return { outdoors: s / 15, nearWater: water / 6, cave: p.y < 55 && s < 6 ? 1 : 0, night: this.sky.state.daylight < 0.3, inGame };
  }

  private debugText(): string {
    const p = this.player;
    const w = this.world!;
    const b = p.body.pos;
    const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z);
    const [sl, bl] = w.getLight(bx, by, bz);
    const facing = ['Sul (+Z)', 'Oeste (-X)', 'Norte (-Z)', 'Leste (+X)'][this.lookFacing()];
    let meshed = 0;
    for (const c of w.chunks.values()) if (c.mesh || c.water) meshed++;
    return [
      `BlockCraft AI (${this.fps} fps)`,
      `XYZ: ${b.x.toFixed(2)} / ${b.y.toFixed(2)} / ${b.z.toFixed(2)}`,
      `Bloco: ${bx} ${by} ${bz}   Chunk: ${Math.floor(bx / CS)} ${Math.floor(bz / CS)}`,
      `Olhando para: ${facing}`,
      `Bioma: ${BIOME_NAMES[w.biomeAt(bx, bz)]}`,
      `Luz: céu ${sl}, bloco ${bl}`,
      `Seed: ${this.meta?.seedText ?? ''} (${w.gen.seed})`,
      `Chunks: ${w.chunks.size} carregados, ${meshed} renderizados (raio ${w.radius})`,
      `Mobs: ${this.mobs.mobs.length} (${this.mobs.count(true)} hostis)  Itens: ${this.entities.items.length}`,
      `Modo: ${p.mode === 'creative' ? 'Criativo' : 'Sobrevivência'}  Dificuldade: ${DIFFICULTIES[this.difficulty]}`,
      `Dia ${this.day + 1}, hora ${Math.floor(((this.ticks / 1000 + 6) % 24))}:${String(Math.floor(((this.ticks % 1000) / 1000) * 60)).padStart(2, '0')}`,
      `Draw calls: ${this.renderer.info.render.calls}  Triângulos: ${this.renderer.info.render.triangles}`,
    ].join('\n');
  }
}

/** Facing meta -> [dx, dz] (0:+Z 1:-X 2:-Z 3:+X) */
export const FACING_DIRS: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
