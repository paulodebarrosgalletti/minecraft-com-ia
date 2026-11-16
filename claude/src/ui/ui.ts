// Menus, HUD and overlays.
import { h, button, slider, fmtDate } from './dom';
import { ContainerUI, ContainerHost } from './containers';
import type { IconFactory } from '../render/textures';
import { hudIcon } from '../render/textures';
import { SaveManager, WorldMeta, Settings } from '../game/save';
import type { Player } from '../game/player';
import { itemDef } from '../world/items';
import { audio } from '../audio/audio';

export interface UIHooks {
  settings: Settings;
  applySettings(): void;
  playWorld(meta: WorldMeta): void;
  createWorld(o: { name: string; seed: string; mode: 'survival' | 'creative'; difficulty: number; type: 'default' | 'flat' }): void;
  resume(): void;
  saveAndQuit(): void;
  respawn(): void;
  setDifficulty(d: number): void;
  currentDifficulty(): number | null;
}

export const DIFFICULTIES = ['Pacífico', 'Fácil', 'Normal', 'Difícil'];
const SPLASHES = ['Feito por IA!', 'Agora com creepers!', '100% procedural!', 'Também experimente terra!', 'Sem chaves de API!', 'Blocos infinitos!', 'Cuidado à noite!', 'Pixelado com amor!', 'Voxels!'];

export class UI {
  root: HTMLElement;
  screen: HTMLElement;
  hud: HTMLElement;
  containers: ContainerUI;
  private hotbarSlots: HTMLElement[] = [];
  private hearts: HTMLElement;
  private food: HTMLElement;
  private bubbles: HTMLElement;
  private debug: HTMLElement;
  private toastEl: HTMLElement;
  private heldName: HTMLElement;
  private hurtOverlay: HTMLElement;
  private sleepOverlay: HTMLElement;
  private waterOverlay: HTMLElement;
  private selectorEl: HTMLElement;
  private icons: Record<string, string> = {};
  private lastHotbarKey = '';
  private heldTimer = 0;
  private toastTimer = 0;
  current = '';
  backTarget = 'menu';

  constructor(private hooks: UIHooks, private iconFactory: IconFactory, host: ContainerHost) {
    this.root = document.getElementById('ui')!;
    this.screen = h('div', { class: 'screen hidden' });
    this.hud = h('div', { class: 'hud hidden' });
    for (const k of ['heart_full', 'heart_half', 'heart_empty', 'food_full', 'food_half', 'food_empty', 'bubble']) this.icons[k] = hudIcon(k);

    this.hearts = h('div', { class: 'stat-row hearts' });
    this.food = h('div', { class: 'stat-row food' });
    this.bubbles = h('div', { class: 'stat-row bubbles' });
    const hotbar = h('div', { class: 'hotbar' });
    for (let i = 0; i < 9; i++) { const s = h('div', { class: 'hb-slot' }); this.hotbarSlots.push(s); hotbar.append(s); }
    this.selectorEl = h('div', { class: 'hb-selector' });
    hotbar.append(this.selectorEl);
    this.heldName = h('div', { class: 'held-name' });
    this.debug = h('div', { class: 'debug hidden' });
    this.toastEl = h('div', { class: 'toast hidden' });
    this.hurtOverlay = h('div', { class: 'hurt-overlay' });
    this.sleepOverlay = h('div', { class: 'sleep-overlay' });
    this.waterOverlay = h('div', { class: 'water-overlay' });
    this.hud.append(
      this.waterOverlay, this.hurtOverlay, this.sleepOverlay,
      h('div', { class: 'crosshair' }),
      this.debug, this.toastEl,
      h('div', { class: 'hud-bottom' },
        this.heldName,
        h('div', { class: 'stats' }, h('div', { class: 'stats-left' }, this.hearts), h('div', { class: 'stats-right' }, this.bubbles, this.food)),
        hotbar,
      ),
    );
    this.root.append(this.hud, this.screen);
    this.containers = new ContainerUI(host, this.root);
  }

  // ---------------------------------------------------------- screens
  private show(name: string, ...content: HTMLElement[]) {
    this.current = name;
    this.screen.onclick = null;
    this.screen.className = 'screen ' + name;
    this.screen.innerHTML = '';
    this.screen.append(...content);
  }

  hideScreen() {
    this.current = '';
    this.screen.onclick = null;
    this.screen.className = 'screen hidden';
    this.screen.innerHTML = '';
  }

  showMainMenu() {
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this.show('menu',
      h('div', { class: 'title-wrap' },
        h('h1', { class: 'game-title' }, h('span', { class: 't1' }, 'MINECRAFT'), h('span', { class: 't2' }, 'AI RECREATION')),
        h('div', { class: 'splash' }, splash),
      ),
      h('div', { class: 'menu-buttons' },
        button('Um Jogador', () => this.showWorlds(), { wide: true }),
        button('Multijogador — Indisponível', () => {}, { wide: true, disabled: true, title: 'Multijogador não foi implementado' }),
        h('div', { class: 'btn-pair' },
          button('Opções...', () => { this.backTarget = 'menu'; this.showOptions(); }),
          button('Sair', () => this.showQuit()),
        ),
      ),
      h('div', { class: 'footer-left' }, 'BlockCraft AI Challenge 1.0'),
      h('div', { class: 'footer-right' }, 'Projeto de fã. Não afiliado à Mojang/Microsoft.'),
    );
  }

  private showQuit() {
    window.close();
    this.show('dialog',
      h('div', { class: 'panel-title' }, 'Obrigado por jogar!'),
      h('p', { class: 'dialog-text' }, 'O navegador não permite fechar esta aba automaticamente. Você já pode fechá-la com segurança (seus mundos estão salvos).'),
      button('Voltar ao Menu', () => this.showMainMenu(), { wide: true }),
    );
  }

  async showWorlds() {
    const worlds = await SaveManager.listWorlds();
    let selected: WorldMeta | null = worlds[0] ?? null;
    const list = h('div', { class: 'world-list' });
    const playBtn = button('Jogar Mundo', () => selected && this.hooks.playWorld(selected), { wide: true });
    const delBtn = button('Excluir', () => selected && this.confirmDelete(selected));
    const render = () => {
      list.innerHTML = '';
      if (worlds.length === 0) list.append(h('div', { class: 'empty' }, 'Nenhum mundo ainda. Crie um novo!'));
      for (const w of worlds) {
        const row = h('div', { class: 'world-entry' + (selected?.id === w.id ? ' selected' : '') },
          w.thumb ? h('img', { class: 'thumb', src: w.thumb }) : h('div', { class: 'thumb placeholder' }),
          h('div', { class: 'info' },
            h('div', { class: 'wname' }, w.name),
            h('div', { class: 'wsub' }, `Criado: ${fmtDate(w.created)}`),
            h('div', { class: 'wsub' }, `Jogado: ${fmtDate(w.lastPlayed)}`),
            h('div', { class: 'wsub mode' }, `${w.mode === 'creative' ? 'Criativo' : 'Sobrevivência'} • ${DIFFICULTIES[w.difficulty]} • ${w.type === 'flat' ? 'Plano' : 'Padrão'} • Seed: ${w.seedText || w.seed}`),
          ),
        );
        row.addEventListener('click', () => { selected = w; audio.play('click'); render(); });
        row.addEventListener('dblclick', () => this.hooks.playWorld(w));
        list.append(row);
      }
      playBtn.disabled = !selected;
      delBtn.disabled = !selected;
    };
    render();
    this.show('worlds',
      h('div', { class: 'panel-title' }, 'Selecionar Mundo'),
      list,
      h('div', { class: 'world-buttons' },
        h('div', { class: 'btn-pair' }, playBtn, button('Criar Novo Mundo', () => this.showCreate(), { wide: true })),
        h('div', { class: 'btn-pair' }, delBtn, button('Cancelar', () => this.showMainMenu())),
      ),
    );
  }

  private confirmDelete(w: WorldMeta) {
    this.show('dialog',
      h('div', { class: 'panel-title' }, 'Tem certeza que deseja excluir este mundo?'),
      h('p', { class: 'dialog-text' }, `"${w.name}" será perdido para sempre! (muito tempo!)`),
      h('div', { class: 'btn-pair' },
        button('Excluir', async () => { await SaveManager.deleteWorld(w.id); this.showWorlds(); }),
        button('Cancelar', () => this.showWorlds()),
      ),
    );
  }

  private showCreate() {
    const opts = { name: 'Novo Mundo', seed: '', mode: 'survival' as 'survival' | 'creative', difficulty: 2, type: 'default' as 'default' | 'flat' };
    const name = h('input', { class: 'mc-input', value: opts.name, maxlength: 32 }) as HTMLInputElement;
    const seed = h('input', { class: 'mc-input', placeholder: 'Deixe em branco para seed aleatória' }) as HTMLInputElement;
    const modeBtn = button('', () => { opts.mode = opts.mode === 'survival' ? 'creative' : 'survival'; upd(); }, { wide: true });
    const diffBtn = button('', () => { opts.difficulty = (opts.difficulty + 1) % 4; upd(); }, { wide: true });
    const typeBtn = button('', () => { opts.type = opts.type === 'default' ? 'flat' : 'default'; upd(); }, { wide: true });
    const desc = h('div', { class: 'mode-desc' });
    const upd = () => {
      modeBtn.textContent = `Modo de Jogo: ${opts.mode === 'survival' ? 'Sobrevivência' : 'Criativo'}`;
      diffBtn.textContent = `Dificuldade: ${DIFFICULTIES[opts.difficulty]}`;
      typeBtn.textContent = `Tipo de Mundo: ${opts.type === 'default' ? 'Padrão' : 'Plano'}`;
      desc.textContent = opts.mode === 'survival' ? 'Procure recursos, fabrique ferramentas, ganhe vida e fome.' : 'Recursos ilimitados, voo livre e quebra instantânea.';
    };
    upd();
    this.show('create',
      h('div', { class: 'panel-title' }, 'Criar Novo Mundo'),
      h('div', { class: 'form' },
        h('label', {}, 'Nome do Mundo'), name,
        modeBtn, desc, diffBtn, typeBtn,
        h('label', {}, 'Seed para o gerador de mundos'), seed,
      ),
      h('div', { class: 'btn-pair' },
        button('Criar Novo Mundo', () => this.hooks.createWorld({ ...opts, name: name.value.trim() || 'Novo Mundo', seed: seed.value })),
        button('Cancelar', () => this.showWorlds()),
      ),
    );
    setTimeout(() => name.focus(), 0);
  }

  showOptions() {
    const s = this.hooks.settings;
    const apply = () => this.hooks.applySettings();
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const b = button('', () => { set(!get()); b.textContent = `${label}: ${get() ? 'SIM' : 'NÃO'}`; apply(); });
      b.textContent = `${label}: ${get() ? 'SIM' : 'NÃO'}`;
      return b;
    };
    const diff = this.hooks.currentDifficulty();
    const diffBtn = diff !== null ? button(`Dificuldade: ${DIFFICULTIES[diff]}`, () => {
      const nd = ((this.hooks.currentDifficulty() ?? 2) + 1) % 4;
      this.hooks.setDifficulty(nd);
      diffBtn!.textContent = `Dificuldade: ${DIFFICULTIES[nd]}`;
    }) : button('Dificuldade: (por mundo)', () => {}, { disabled: true, title: 'Definida ao criar o mundo; altere durante o jogo.' });
    this.show('options',
      h('div', { class: 'panel-title' }, 'Opções'),
      h('div', { class: 'options-grid' },
        h('div', { class: 'opt-head' }, 'Vídeo'), h('div', { class: 'opt-head' }, ''),
        slider((v) => `Distância de Renderização: ${v} chunks`, 2, 12, 1, s.renderDistance, (v) => { s.renderDistance = v; apply(); }),
        slider((v) => `Campo de Visão: ${v}`, 50, 110, 1, s.fov, (v) => { s.fov = v; apply(); }),
        button(`Gráficos: ${s.quality === 'fancy' ? 'Detalhados' : 'Rápidos'}`, function (this: void) { /* replaced below */ }),
        toggle('Iluminação Suave/Sombras', () => s.smoothLighting, (v) => { s.smoothLighting = v; }),
        slider((v) => `Brilho: ${Math.round(v * 100)}%`, 0, 1, 0.05, s.brightness, (v) => { s.brightness = v; apply(); }),
        toggle('Nuvens', () => s.clouds, (v) => { s.clouds = v; }),
        toggle('Balanço da Visão', () => s.viewBobbing, (v) => { s.viewBobbing = v; }),
        button('Tela Cheia', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }),
        h('div', { class: 'opt-head' }, 'Áudio'), h('div', { class: 'opt-head' }, ''),
        slider((v) => `Volume Geral: ${Math.round(v * 100)}%`, 0, 1, 0.05, s.master, (v) => { s.master = v; apply(); }),
        slider((v) => `Efeitos: ${Math.round(v * 100)}%`, 0, 1, 0.05, s.sfx, (v) => { s.sfx = v; apply(); }),
        slider((v) => `Ambiente: ${Math.round(v * 100)}%`, 0, 1, 0.05, s.ambient, (v) => { s.ambient = v; apply(); }),
        slider((v) => `Música: ${Math.round(v * 100)}%`, 0, 1, 0.05, s.music, (v) => { s.music = v; apply(); }),
        h('div', { class: 'opt-head' }, 'Jogabilidade'), h('div', { class: 'opt-head' }, ''),
        slider((v) => `Sensibilidade do Mouse: ${Math.round(v * 100)}%`, 0.2, 3, 0.05, s.sensitivity, (v) => { s.sensitivity = v; apply(); }),
        toggle('Inverter Mouse', () => s.invertMouse, (v) => { s.invertMouse = v; }),
        diffBtn,
        button('Controles...', () => this.showControls()),
      ),
      button('Concluído', () => { apply(); if (this.backTarget === 'pause') this.showPause(); else this.showMainMenu(); }, { wide: true }),
    );
    // graphics toggle needs self reference
    const gb = this.screen.querySelectorAll('.options-grid .mc-btn')[0] as HTMLButtonElement;
    const ng = gb.cloneNode(true) as HTMLButtonElement;
    ng.addEventListener('click', () => { audio.play('click'); s.quality = s.quality === 'fancy' ? 'fast' : 'fancy'; ng.textContent = `Gráficos: ${s.quality === 'fancy' ? 'Detalhados' : 'Rápidos'}`; apply(); });
    gb.replaceWith(ng);
  }

  private showControls() {
    const rows = [
      ['W A S D', 'Movimentar'], ['Mouse', 'Olhar'], ['Espaço', 'Pular / Nadar / Subir (voo)'], ['Shift', 'Agachar / Descer (voo)'],
      ['W duas vezes ou R', 'Correr'], ['Espaço duas vezes', 'Ativar/desativar voo (Criativo)'], ['Botão Esquerdo', 'Quebrar / Atacar'],
      ['Botão Direito', 'Colocar / Usar / Comer / Interagir'], ['E', 'Inventário'], ['1–9 / Scroll', 'Selecionar hotbar'],
      ['Q', 'Soltar item'], ['Esc', 'Pausar'], ['F3', 'Informações de depuração'], ['F5', 'Alternar câmera (1ª/3ª pessoa)'],
      ['F2', 'Alternar HUD (modo screenshot)'], ['Shift + Clique', 'Mover stack rapidamente (inventário)'], ['Botão Direito (inventário)', 'Dividir stack / colocar 1'],
    ];
    this.show('options',
      h('div', { class: 'panel-title' }, 'Controles'),
      h('table', { class: 'controls' }, rows.map(([k, v]) => h('tr', {}, h('td', { class: 'key' }, k), h('td', {}, v)))),
      h('p', { class: 'dialog-text small' }, 'Obs.: Ctrl não é usado para correr porque Ctrl+W fecha a aba do navegador.'),
      button('Concluído', () => this.showOptions(), { wide: true }),
    );
  }

  showPause() {
    this.backTarget = 'pause';
    this.show('pause',
      h('div', { class: 'panel-title' }, 'Menu do Jogo'),
      h('div', { class: 'menu-buttons' },
        button('Voltar ao Jogo', () => this.hooks.resume(), { wide: true }),
        button('Opções...', () => this.showOptions(), { wide: true }),
        button('Salvar e Sair para o Menu', () => this.hooks.saveAndQuit(), { wide: true }),
      ),
    );
  }

  showDeath(cause: string, score: string) {
    this.show('death',
      h('div', { class: 'death-title' }, 'Você morreu!'),
      h('div', { class: 'death-cause' }, cause),
      h('div', { class: 'death-score' }, score),
      h('div', { class: 'menu-buttons' },
        button('Renascer', () => this.hooks.respawn(), { wide: true }),
        button('Menu Principal', () => this.hooks.saveAndQuit(), { wide: true }),
      ),
    );
  }

  showLoading(text: string, progress: number) {
    if (this.current !== 'loading') {
      this.show('loading', h('div', { class: 'loading-text' }, text), h('div', { class: 'progress' }, h('div', { class: 'bar' })));
    }
    (this.screen.querySelector('.loading-text') as HTMLElement).textContent = text;
    (this.screen.querySelector('.bar') as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
  }

  showResumeHint() {
    this.show('resume', h('div', { class: 'resume-hint' }, 'Clique para continuar'));
    this.screen.onclick = () => { this.screen.onclick = null; this.hooks.resume(); };
  }

  // ---------------------------------------------------------- HUD
  setHudVisible(v: boolean) { this.hud.classList.toggle('hidden', !v); }

  updateHud(p: Player, dt: number) {
    const inv = p.inv;
    const key = inv.slots.slice(0, 9).map((s) => (s ? `${s.id}:${s.count}:${s.dmg ?? 0}` : '-')).join('|');
    if (key !== this.lastHotbarKey) {
      this.lastHotbarKey = key;
      for (let i = 0; i < 9; i++) this.containers.renderStack(this.hotbarSlots[i], inv.slots[i]);
    }
    this.selectorEl.style.transform = `translateX(${inv.selected * 40}px)`;
    const survival = p.mode === 'survival';
    this.hearts.style.visibility = survival ? 'visible' : 'hidden';
    this.food.style.visibility = survival ? 'visible' : 'hidden';
    if (survival) {
      this.renderRow(this.hearts, p.health, 'heart', p.hurtTimer > 0);
      this.renderRow(this.food, p.hunger, 'food', false, true);
    }
    const showAir = survival && (p.body.headInWater || p.air < 15);
    this.bubbles.style.display = showAir ? 'flex' : 'none';
    if (showAir) {
      const n = Math.ceil((p.air / 15) * 10);
      const k = 'b' + n;
      if (this.bubbles.dataset.k !== k) {
        this.bubbles.dataset.k = k;
        this.bubbles.innerHTML = '';
        for (let i = 0; i < n; i++) this.bubbles.append(h('img', { src: this.icons.bubble }));
      }
    }
    this.hurtOverlay.style.opacity = String(Math.min(0.45, p.hurtTimer * 1.1));
    this.heldTimer -= dt;
    this.heldName.style.opacity = String(Math.max(0, Math.min(1, this.heldTimer)));
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
  }

  private renderRow(el: HTMLElement, value: number, kind: 'heart' | 'food', shake: boolean, reverse = false) {
    const k = `${kind}${value}${shake}`;
    if (el.dataset.k === k) return;
    el.dataset.k = k;
    el.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const v = value - i * 2;
      const icon = v >= 2 ? `${kind}_full` : v === 1 ? `${kind}_half` : `${kind}_empty`;
      const img = h('img', { src: this.icons[icon] });
      if ((value <= 4 || shake) && kind === 'heart') img.style.transform = `translateY(${Math.round((Math.random() - 0.5) * 3)}px)`;
      el.append(img);
    }
    if (reverse) el.style.flexDirection = 'row-reverse';
  }

  showHeldName(id: number | null) {
    if (id === null) { this.heldTimer = 0; return; }
    this.heldName.textContent = itemDef(id).name;
    this.heldTimer = 2;
  }

  toast(text: string, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  setDebug(text: string | null) {
    this.debug.classList.toggle('hidden', text === null);
    if (text !== null) this.debug.textContent = text;
  }

  setSleep(v: number) { this.sleepOverlay.style.opacity = String(v); }
  setUnderwater(v: boolean) { this.waterOverlay.style.opacity = v ? '1' : '0'; }
}
