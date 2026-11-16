// IndexedDB persistence for worlds (metadata + modifications) and localStorage settings.

export interface WorldMeta {
  id: string;
  name: string;
  created: number;
  lastPlayed: number;
  mode: 'survival' | 'creative';
  difficulty: number;
  seed: number;
  seedText: string;
  type: 'default' | 'flat';
  thumb?: string;
}

export interface WorldData {
  id: string;
  version: number;
  player: {
    x: number; y: number; z: number; yaw: number; pitch: number;
    health: number; hunger: number; saturation: number; inv: unknown; selected: number;
    spawn: [number, number, number]; hasBedSpawn: boolean; flying: boolean; mode?: 'survival' | 'creative';
  } | null;
  time: number;
  day: number;
  mods: Record<string, [number, number][]>;
  chests: Record<string, unknown>;
  furnaces: Record<string, unknown>;
  animals: unknown[];
  saplings: [number, number, number, number][];
}

const DB_NAME = 'blockcraft-ai';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('worlds')) d.createObjectStore('worlds', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const SaveManager = {
  async listWorlds(): Promise<WorldMeta[]> {
    try {
      const all = (await tx<WorldMeta[]>('worlds', 'readonly', (s) => s.getAll())) ?? [];
      return all.filter((w) => w && typeof w.id === 'string' && typeof w.seed === 'number').sort((a, b) => b.lastPlayed - a.lastPlayed);
    } catch (e) {
      console.error('listWorlds failed', e);
      return [];
    }
  },
  async saveMeta(meta: WorldMeta) {
    await tx('worlds', 'readwrite', (s) => s.put(meta));
  },
  async loadData(id: string): Promise<WorldData | null> {
    try {
      const d = await tx<WorldData>('data', 'readonly', (s) => s.get(id));
      if (!d || typeof d !== 'object') return null;
      // sanitize
      return {
        id, version: d.version ?? 1, player: d.player ?? null, time: Number(d.time) || 1000, day: Number(d.day) || 0,
        mods: d.mods && typeof d.mods === 'object' ? d.mods : {}, chests: d.chests ?? {}, furnaces: d.furnaces ?? {},
        animals: Array.isArray(d.animals) ? d.animals : [], saplings: Array.isArray(d.saplings) ? d.saplings : [],
      };
    } catch (e) {
      console.error('loadData failed (corrupted?)', e);
      return null;
    }
  },
  async saveData(data: WorldData) {
    await tx('data', 'readwrite', (s) => s.put(data));
  },
  async deleteWorld(id: string) {
    await tx('worlds', 'readwrite', (s) => s.delete(id));
    await tx('data', 'readwrite', (s) => s.delete(id));
  },
};

// ---------------- Settings ----------------
export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  invertMouse: boolean;
  quality: 'fast' | 'fancy';
  smoothLighting: boolean;
  clouds: boolean;
  brightness: number;
  master: number;
  sfx: number;
  ambient: number;
  music: number;
  viewBobbing: boolean;
}

const DEFAULTS: Settings = {
  renderDistance: 6, fov: 75, sensitivity: 1, invertMouse: false, quality: 'fancy', smoothLighting: true, clouds: true,
  brightness: 0.3, master: 0.8, sfx: 1, ambient: 0.6, music: 0.5, viewBobbing: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('blockcraft-settings');
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem('blockcraft-settings', JSON.stringify(s)); } catch { /* ignore */ }
}
