// Inventory / crafting / furnace / chest / creative windows with Minecraft-like slot interaction.
import { h } from './dom';
import type { IconFactory } from '../render/textures';
import { Slot, canMerge, cloneStack } from '../game/inventory';
import type { Player } from '../game/player';
import { ItemStack, itemDef, maxStack, allItemIds, ITEMS } from '../world/items';
import { findRecipe } from '../world/recipes';
import type { FurnaceState } from '../game/blockentities';
import { SMELT_TIME } from '../game/blockentities';
import { audio } from '../audio/audio';
import { skinTexture } from '../render/models';
import type { Category } from '../world/blocks';

export interface SlotRef {
  get(): Slot;
  set(s: Slot): void;
  output?: boolean;
  accept?(s: ItemStack): boolean;
  section: string;
}

export type WindowKind = 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative';

export interface ContainerHost {
  icons: IconFactory;
  dropStack(s: ItemStack): void;
  onCraft(): void;
}

const CREATIVE_TABS: { key: Category | 'inventory' | 'search'; name: string; icon: number }[] = [
  { key: 'building', name: 'Construção', icon: 28 },
  { key: 'nature', name: 'Natureza', icon: 1 },
  { key: 'wood', name: 'Madeira', icon: 11 },
  { key: 'ores', name: 'Minérios', icon: 23 },
  { key: 'decoration', name: 'Decoração', icon: 40 },
  { key: 'utility', name: 'Utilidades', icon: 32 },
  { key: 'tools', name: 'Ferramentas', icon: 316 },
  { key: 'food', name: 'Comida', icon: 266 },
  { key: 'materials', name: 'Materiais', icon: 259 },
  { key: 'search', name: 'Buscar', icon: 280 },
  { key: 'inventory', name: 'Inventário', icon: 34 },
];

export class ContainerUI {
  el: HTMLElement;
  cursor: Slot = null;
  kind: WindowKind | null = null;
  private refs: SlotRef[] = [];
  private slotEls: HTMLElement[] = [];
  private cursorEl: HTMLElement;
  private tooltip: HTMLElement;
  private grid: Slot[] = [];
  private gridSize = 2;
  private furnace: FurnaceState | null = null;
  private chest: Slot[] | null = null;
  private player: Player | null = null;
  private creativeTab: string = 'building';
  private search = '';
  private progressEls: { arrow?: HTMLElement; flame?: HTMLElement } = {};
  private mouse = { x: 0, y: 0 };
  onClose: (() => void) | null = null;

  constructor(private host: ContainerHost, root: HTMLElement) {
    this.el = h('div', { class: 'container-backdrop hidden' });
    this.cursorEl = h('div', { class: 'cursor-stack hidden' });
    this.tooltip = h('div', { class: 'mc-tooltip hidden' });
    root.append(this.el, this.cursorEl, this.tooltip);
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.cursorEl.style.left = e.clientX - 24 + 'px';
      this.cursorEl.style.top = e.clientY - 24 + 'px';
      this.tooltip.style.left = e.clientX + 14 + 'px';
      this.tooltip.style.top = e.clientY - 30 + 'px';
    });
    this.el.addEventListener('mousedown', (e) => {
      // click outside window -> drop cursor stack
      if (e.target === this.el && this.cursor) {
        if (e.button === 0) { this.host.dropStack(this.cursor); this.cursor = null; }
        else if (e.button === 2) { this.host.dropStack({ ...this.cursor, count: 1 }); this.cursor.count--; if (this.cursor.count <= 0) this.cursor = null; }
        this.refresh();
      }
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get open() { return this.kind !== null; }

  openWindow(kind: WindowKind, player: Player, data?: { furnace?: FurnaceState; chest?: Slot[] }) {
    this.kind = kind;
    this.player = player;
    this.furnace = data?.furnace ?? null;
    this.chest = data?.chest ?? null;
    this.gridSize = kind === 'crafting' ? 3 : 2;
    this.grid = new Array(this.gridSize * this.gridSize).fill(null);
    this.build();
    this.el.classList.remove('hidden');
    audio.play('open');
  }

  /** Closes the window; returns items left in the crafting grid / cursor to the player. */
  close() {
    if (!this.kind || !this.player) return;
    const give = (s: Slot) => {
      if (!s) return;
      const left = this.player!.inv.add(s);
      if (left > 0) this.host.dropStack({ ...s, count: left });
    };
    this.grid.forEach(give);
    this.grid = [];
    give(this.cursor);
    this.cursor = null;
    this.kind = null;
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    this.cursorEl.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    audio.play('close');
    this.onClose?.();
  }

  private invRefs(section: string, from: number, to: number): SlotRef[] {
    const inv = this.player!.inv;
    const out: SlotRef[] = [];
    for (let i = from; i < to; i++) out.push({ get: () => inv.slots[i], set: (s) => { inv.slots[i] = s; }, section });
    return out;
  }

  private slotEl(ref: SlotRef, extraClass = ''): HTMLElement {
    const idx = this.refs.length;
    this.refs.push(ref);
    const el = h('div', { class: 'slot ' + extraClass });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.click(idx, e.button, e.shiftKey); });
    el.addEventListener('mouseenter', () => this.showTooltip(ref.get()));
    el.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    this.slotEls.push(el);
    return el;
  }

  private row(refs: SlotRef[], cls = ''): HTMLElement {
    return h('div', { class: 'slot-row ' + cls }, refs.map((r) => this.slotEl(r)));
  }

  private playerSections(): HTMLElement[] {
    return [
      h('div', { class: 'win-label' }, 'Inventário'),
      this.row(this.invRefs('main', 9, 18)), this.row(this.invRefs('main', 18, 27)), this.row(this.invRefs('main', 27, 36)),
      h('div', { class: 'gap' }),
      this.row(this.invRefs('hotbar', 0, 9)),
    ];
  }

  private gridRefs(): SlotRef[] {
    return this.grid.map((_, i) => ({ get: () => this.grid[i], set: (s: Slot) => { this.grid[i] = s; }, section: 'grid' }));
  }

  private resultRef(): SlotRef {
    return {
      section: 'result', output: true,
      get: () => {
        const r = findRecipe(this.grid.map((s) => (s ? s.id : null)), this.gridSize);
        return r ? { ...r.result } : null;
      },
      set: () => {},
    };
  }

  private consumeGrid() {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) this.grid[i] = null;
      // bowls are returned when crafting stew
    }
    this.host.onCraft();
  }

  private build() {
    this.refs = [];
    this.slotEls = [];
    this.progressEls = {};
    this.el.innerHTML = '';
    const win = h('div', { class: 'mc-window' });
    const k = this.kind!;
    if (k === 'inventory') {
      const preview = h('canvas', { class: 'player-preview', width: 64, height: 128 }) as HTMLCanvasElement;
      this.drawPlayer(preview);
      const g = this.gridRefs();
      win.append(
        h('div', { class: 'win-top' },
          h('div', { class: 'preview-box' }, preview),
          h('div', { class: 'craft-area' },
            h('div', { class: 'win-label' }, 'Fabricação'),
            h('div', { class: 'craft-row' },
              h('div', { class: 'grid grid2' }, g.map((r) => this.slotEl(r))),
              h('div', { class: 'arrow' }),
              this.slotEl(this.resultRef(), 'big'),
            ),
          ),
        ),
        ...this.playerSections(),
      );
    } else if (k === 'crafting') {
      const g = this.gridRefs();
      win.append(
        h('div', { class: 'win-label' }, 'Bancada de Trabalho'),
        h('div', { class: 'craft-row center' },
          h('div', { class: 'grid grid3' }, g.map((r) => this.slotEl(r))),
          h('div', { class: 'arrow' }),
          this.slotEl(this.resultRef(), 'big'),
        ),
        ...this.playerSections(),
      );
    } else if (k === 'furnace') {
      const f = this.furnace!;
      const mk = (key: 'input' | 'fuel' | 'output', accept?: (s: ItemStack) => boolean, output = false): SlotRef =>
        ({ section: 'furnace-' + key, get: () => f[key], set: (s) => { f[key] = s; }, accept, output });
      const flame = h('div', { class: 'flame' }, h('div', { class: 'flame-fill' }));
      const arrow = h('div', { class: 'arrow progress' }, h('div', { class: 'arrow-fill' }));
      this.progressEls = { arrow: arrow.firstChild as HTMLElement, flame: flame.firstChild as HTMLElement };
      win.append(
        h('div', { class: 'win-label' }, 'Fornalha'),
        h('div', { class: 'furnace-area' },
          h('div', { class: 'furnace-col' },
            this.slotEl(mk('input', (s) => itemDef(s.id).smelt !== undefined || true)),
            flame,
            this.slotEl(mk('fuel', (s) => !!itemDef(s.id).fuel)),
          ),
          arrow,
          this.slotEl(mk('output', undefined, true), 'big'),
        ),
        ...this.playerSections(),
      );
    } else if (k === 'chest') {
      const c = this.chest!;
      const refs = c.map((_, i) => ({ section: 'chest', get: () => c[i], set: (s: Slot) => { c[i] = s; } }));
      win.append(
        h('div', { class: 'win-label' }, 'Baú'),
        this.row(refs.slice(0, 9)), this.row(refs.slice(9, 18)), this.row(refs.slice(18, 27)),
        h('div', { class: 'gap' }),
        ...this.playerSections(),
      );
    } else if (k === 'creative') {
      win.classList.add('creative');
      const tabs = h('div', { class: 'tabs' }, CREATIVE_TABS.map((t) => {
        const img = h('img', { src: this.host.icons.url(t.icon), draggable: 'false' });
        const tab = h('div', { class: 'tab' + (this.creativeTab === t.key ? ' active' : ''), title: t.name }, img);
        tab.addEventListener('mousedown', (e) => { e.stopPropagation(); this.creativeTab = t.key; audio.play('click'); this.build(); });
        return tab;
      }));
      const current = CREATIVE_TABS.find((t) => t.key === this.creativeTab)!;
      win.append(tabs, h('div', { class: 'win-label' }, current.name));
      if (this.creativeTab === 'inventory') {
        win.append(...this.playerSections());
      } else {
        if (this.creativeTab === 'search') {
          const inp = h('input', { class: 'mc-input search', placeholder: 'Buscar item...', value: this.search }) as HTMLInputElement;
          inp.addEventListener('input', () => { this.search = inp.value; this.build(); const n = this.el.querySelector('input.search') as HTMLInputElement; n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); });
          inp.addEventListener('mousedown', (e) => e.stopPropagation());
          win.append(inp);
        }
        const ids = allItemIds().filter((id) => {
          const d = ITEMS[id]!;
          if (this.creativeTab === 'search') return d.name.toLowerCase().includes(this.search.toLowerCase());
          return d.category === this.creativeTab;
        });
        const palette = h('div', { class: 'palette' });
        for (const id of ids) {
          const ref: SlotRef = { section: 'palette', output: true, get: () => ({ id, count: 1 }), set: () => {} };
          palette.append(this.slotEl(ref));
        }
        win.append(palette, h('div', { class: 'gap' }), h('div', { class: 'win-label small' }, 'Clique num item para pegar. Clique na paleta segurando um item para apagá-lo.'), this.row(this.invRefs('hotbar', 0, 9)));
      }
    }
    this.el.append(win);
    this.refresh();
  }

  private drawPlayer(c: HTMLCanvasElement) {
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const skin = skinTexture('player').image as HTMLCanvasElement;
    const S = 4;
    // head front (8,8), body front (20,20), arm front (44,20), leg front (4,20)
    g.drawImage(skin, 8, 8, 8, 8, 4 * S, 0, 8 * S, 8 * S);
    g.drawImage(skin, 20, 20, 8, 12, 4 * S, 8 * S, 8 * S, 12 * S);
    g.drawImage(skin, 44, 20, 4, 12, 0, 8 * S, 4 * S, 12 * S);
    g.drawImage(skin, 44, 20, 4, 12, 12 * S, 8 * S, 4 * S, 12 * S);
    g.drawImage(skin, 4, 20, 4, 12, 4 * S, 20 * S, 4 * S, 12 * S);
    g.drawImage(skin, 4, 20, 4, 12, 8 * S, 20 * S, 4 * S, 12 * S);
  }

  private showTooltip(s: Slot) {
    if (!s || this.cursor) { this.tooltip.classList.add('hidden'); return; }
    const d = itemDef(s.id);
    const lines = [h('div', { class: 'tt-name' }, d.name)];
    if (d.tool) {
      lines.push(h('div', { class: 'tt-info' }, `Dano: ${d.tool.damage}  Velocidade: ${d.tool.speed}`));
      lines.push(h('div', { class: 'tt-info' }, `Durabilidade: ${d.tool.durability - (s.dmg ?? 0)} / ${d.tool.durability}`));
    }
    if (d.food) lines.push(h('div', { class: 'tt-info food' }, `Restaura ${d.food.hunger / 2} de fome`));
    if (d.fuel) lines.push(h('div', { class: 'tt-info' }, `Combustível: ${d.fuel}s`));
    if (d.smelt !== undefined) lines.push(h('div', { class: 'tt-info' }, `Fundível → ${itemDef(d.smelt).name}`));
    this.tooltip.innerHTML = '';
    this.tooltip.append(...lines);
    this.tooltip.classList.remove('hidden');
  }

  renderStack(el: HTMLElement, s: Slot) {
    el.innerHTML = '';
    if (!s) return;
    el.append(h('img', { src: this.host.icons.url(s.id), draggable: 'false' }));
    if (s.count > 1) el.append(h('span', { class: 'count' }, String(s.count)));
    const d = itemDef(s.id);
    if (d.tool && s.dmg) {
      const frac = 1 - s.dmg / d.tool.durability;
      const bar = h('div', { class: 'dur' }, h('div', { style: { width: `${frac * 100}%`, background: `hsl(${frac * 120},90%,45%)` } }));
      el.append(bar);
    }
  }

  refresh() {
    if (!this.kind) return;
    this.refs.forEach((r, i) => this.renderStack(this.slotEls[i], r.get()));
    this.renderStack(this.cursorEl, this.cursor);
    this.cursorEl.classList.toggle('hidden', !this.cursor);
    if (this.furnace && this.progressEls.arrow) {
      this.progressEls.arrow.style.width = `${(this.furnace.cook / SMELT_TIME) * 100}%`;
      this.progressEls.flame!.style.height = `${this.furnace.burnMax > 0 ? (this.furnace.burn / this.furnace.burnMax) * 100 : 0}%`;
    }
  }

  private click(i: number, button: number, shift: boolean) {
    const ref = this.refs[i];
    const s = ref.get();
    if (ref.section === 'palette') {
      if (this.cursor) { this.cursor = null; }
      else if (s) {
        if (shift) { this.player!.inv.add({ id: s.id, count: maxStack(s.id) }); }
        else this.cursor = { id: s.id, count: button === 2 ? 1 : maxStack(s.id) };
      }
      audio.play('pop');
      this.refresh();
      return;
    }
    if (ref.output) {
      if (!s) return;
      if (ref.section === 'result') {
        if (shift) {
          let guard = 64;
          while (guard-- > 0) {
            const r = ref.get();
            if (!r || !this.player!.inv.canAdd(r)) break;
            this.player!.inv.add(r);
            this.consumeGrid();
          }
        } else if (!this.cursor) { this.cursor = cloneStack(s); this.consumeGrid(); }
        else if (canMerge(this.cursor, s) && this.cursor.count + s.count <= maxStack(s.id)) { this.cursor.count += s.count; this.consumeGrid(); }
      } else {
        // furnace output: take
        if (shift) { const left = this.player!.inv.add(s); ref.set(left > 0 ? { ...s, count: left } : null); }
        else if (!this.cursor) { this.cursor = s; ref.set(null); }
        else if (canMerge(this.cursor, s)) {
          const n = Math.min(s.count, maxStack(s.id) - this.cursor.count);
          this.cursor.count += n; s.count -= n; if (s.count <= 0) ref.set(null);
        }
      }
      this.refresh();
      return;
    }
    if (shift && s) { this.quickMove(ref, s); this.refresh(); return; }
    const c = this.cursor;
    if (button === 0) {
      if (!c) { this.cursor = s; ref.set(null); }
      else if (!s) { if (!ref.accept || ref.accept(c)) { ref.set(c); this.cursor = null; } }
      else if (canMerge(c, s)) {
        const n = Math.min(c.count, maxStack(s.id) - s.count);
        s.count += n; c.count -= n; if (c.count <= 0) this.cursor = null;
      } else if (!ref.accept || ref.accept(c)) { ref.set(c); this.cursor = s; }
    } else if (button === 2) {
      if (!c && s) {
        const half = Math.ceil(s.count / 2);
        this.cursor = { ...s, count: half };
        s.count -= half;
        if (s.count <= 0) ref.set(null);
      } else if (c) {
        if (!s) { if (!ref.accept || ref.accept(c)) { ref.set({ ...c, count: 1 }); c.count--; } }
        else if (canMerge(c, s) && s.count < maxStack(s.id)) { s.count++; c.count--; }
        if (c.count <= 0) this.cursor = null;
      }
    }
    this.refresh();
  }

  private quickMove(ref: SlotRef, s: ItemStack) {
    const inv = this.player!.inv;
    const moveInto = (targets: SlotRef[]) => {
      // merge first, then empty
      for (const t of targets) {
        const ts = t.get();
        if (ts && canMerge(ts, s) && ts.count < maxStack(s.id)) {
          const n = Math.min(s.count, maxStack(s.id) - ts.count);
          ts.count += n; s.count -= n;
          if (s.count <= 0) break;
        }
      }
      for (const t of targets) {
        if (s.count <= 0) break;
        if (!t.get() && (!t.accept || t.accept(s))) { t.set({ ...s }); s.count = 0; }
      }
      if (s.count <= 0) ref.set(null);
    };
    const all = this.refs;
    const sec = ref.section;
    if (sec === 'grid' || sec.startsWith('furnace') || sec === 'chest') {
      moveInto([...all.filter((r) => r.section === 'hotbar'), ...all.filter((r) => r.section === 'main')]);
    } else if (this.kind === 'chest') {
      moveInto(all.filter((r) => r.section === 'chest'));
    } else if (this.kind === 'furnace') {
      const d = itemDef(s.id);
      if (d.smelt !== undefined) moveInto(all.filter((r) => r.section === 'furnace-input'));
      else if (d.fuel) moveInto(all.filter((r) => r.section === 'furnace-fuel'));
      else moveInto(all.filter((r) => r.section === (sec === 'hotbar' ? 'main' : 'hotbar')));
    } else {
      moveInto(all.filter((r) => r.section === (sec === 'hotbar' ? 'main' : 'hotbar')));
    }
    void inv;
  }
}
