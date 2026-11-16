import type { Game } from './game';
import { B,type Slot,type Stack,type SaveData } from './shared';
import { ITEMS,getItem } from './registry';
import { RECIPES,matchRecipe,craftGrid,Inventory,FUELS,SMELTING,SMELT_TIME } from './inventory';
import { SaveManager } from './storage';

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const modeLabel=(s:string)=>s==='creative'?'Criativo':'Sobrevivência';
export class UI {
  root=document.querySelector<HTMLDivElement>('#ui')!;overlay!:HTMLDivElement;hud!:HTMLDivElement;
  kind:'inventory'|'workbench'|'chest'|'furnace'='inventory';containerKey='';grid:Slot[]=Array(4).fill(null);carried:Slot=null;
  private toastTimer=0;private itemTimer=0;private iconCache=new Map<string,string>();private category='Todos';private search='';private recipeSelected='';private deleted:SaveData|null=null;
  constructor(public game:Game){this.root.innerHTML='<div id="hud" hidden></div><div id="overlay"></div><div id="toast" role="status"></div><div id="item-name"></div><div id="damage"></div><div id="cursor-item"></div>';
    this.overlay=this.root.querySelector('#overlay')!;this.hud=this.root.querySelector('#hud')!;
    document.addEventListener('mousemove',e=>{const el=this.root.querySelector<HTMLElement>('#cursor-item')!;el.style.left=e.clientX+12+'px';el.style.top=e.clientY+12+'px'});
    this.main();
  }
  button(text:string,id:string,extra=''){return `<button id="${id}" class="mc-button" ${extra}>${text}</button>`}
  private screen(html:string,cls=''){this.overlay.className=cls;this.overlay.innerHTML=html;this.overlay.hidden=false;this.hud.hidden=true;this.bindSounds()}
  private bindSounds(){this.overlay.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{this.game.audio.unlock();this.game.audio.play('click')}))}
  private on(id:string,fn:()=>void){this.overlay.querySelector('#'+id)?.addEventListener('click',fn)}
  private heading(title:string,subtitle=''){return `<header class="screen-heading"><span class="eyebrow">BLOCKCRAFT / AI CHALLENGE</span><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}</header>`}
  main(){
    this.screen(`<div class="menu-vignette"></div><div class="main-menu"><div class="logo"><span class="logo-top">BLOCKCRAFT</span><span class="logo-bottom">AI CHALLENGE</span><span class="splash">Um mundo só seu!</span></div><p class="menu-tagline">EXPLORE. CONSTRUA. SOBREVIVA.</p><div class="main-buttons">${this.button('Um Jogador','single')}${this.button('Multijogador <small>Indisponível</small>','multi','disabled')}<div class="button-row">${this.button('Opções…','options')}${this.button('Sair','quit')}</div></div><div class="menu-note"><span class="live-dot"></span> MUNDOS INFINITOS · FEITOS DE POSSIBILIDADES</div></div><footer class="menu-footer"><span>Blockcraft 1.0 · WebGL</span><span>Uma recriação independente · Assets originais</span></footer>`,'main-screen');
    this.on('single',()=>void this.worlds());this.on('options',()=>this.options(()=>this.main()));this.on('quit',()=>{this.screen(`${this.heading('Até a próxima aventura.','Seu progresso fica salvo neste navegador.')}<div class="center-buttons">${this.button('Voltar ao menu','back')}</div>`,'shade');this.on('back',()=>this.main());window.close()});
  }
  async worlds(){
    this.screen(`${this.heading('Seus mundos','Cada seed é o começo de uma nova história.')}<div class="world-list"><div class="empty-state">Lendo mundos salvos…</div></div>`,'shade');
    let saves:SaveData[]=[];try{saves=await SaveManager.list()}catch(e){this.toast('Falha ao ler mundos: '+String(e),7000)}
    this.screen(`<div class="world-screen">${this.heading('Seus mundos','Cada seed é o começo de uma nova história.')}<div class="world-list">${saves.length?saves.sort((a,b)=>b.config.lastPlayed-a.config.lastPlayed).map(s=>`<article class="world-card"><div class="world-thumb" ${s.config.thumbnail?`style="background-image:url('${esc(s.config.thumbnail)}')"`:''}>${s.config.thumbnail?'':'▦'}</div><div class="world-info"><h2>${esc(s.config.name)}</h2><p>${modeLabel(s.config.mode)} · ${s.config.type==='flat'?'Plano':'Padrão'} · Seed ${esc(s.config.seed)}</p><small>Criado em ${new Date(s.config.created).toLocaleDateString('pt-BR')}<br>Última visita: ${new Date(s.config.lastPlayed).toLocaleString('pt-BR')}</small></div><div class="world-actions"><button class="mc-button" data-play="${esc(s.config.id)}">Jogar</button><button class="text-button" data-delete="${esc(s.config.id)}">Excluir</button></div></article>`).join(''):`<div class="empty-state"><span class="empty-cube">▧</span><h2>Uma página em branco.</h2><p>Crie seu primeiro mundo e deixe sua marca.</p></div>`}</div><div class="button-row wide-row">${this.button('Criar Novo Mundo','create')}${this.button('Voltar','back')}</div>${this.deleted?'<button id="undo-delete" class="text-button">Restaurar último mundo excluído</button>':''}<p class="storage-note">Salvos neste dispositivo e navegador · sem conta, sem conexão.</p></div>`,'shade');
    this.on('back',()=>this.main());this.on('create',()=>this.createWorld());
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(b=>b.onclick=()=>{const save=saves.find(s=>s.config.id===b.dataset.play)!;void this.game.start(save.config,save).catch(e=>this.error(e))});
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(b=>b.onclick=async()=>{const id=b.dataset.delete!;this.deleted=saves.find(s=>s.config.id===id)!;await SaveManager.delete(id);void this.worlds()});
    this.on('undo-delete',()=>{if(this.deleted)void SaveManager.save(this.deleted).then(()=>{this.deleted=null;void this.worlds()})});
  }
  createWorld(){
    this.screen(`<div class="create-screen">${this.heading('Criar novo mundo','A aventura começa com uma ideia.')}<div class="form-panel"><label>Nome do mundo<input id="world-name" maxlength="48" value="Meu novo mundo" autocomplete="off"></label><div class="form-row"><label>Modo de jogo<select id="world-mode"><option value="survival">Sobrevivência</option><option value="creative">Criativo</option></select></label><label>Dificuldade<select id="world-difficulty"><option value="peaceful">Pacífico</option><option value="easy">Fácil</option><option value="normal" selected>Normal</option><option value="hard">Difícil</option></select></label></div><p id="mode-description" class="field-hint">Explore, colete recursos, fabrique ferramentas e sobreviva à noite.</p><label>Seed <span>opcional</span><input id="world-seed" placeholder="Uma palavra, um número ou o acaso" maxlength="80" autocomplete="off"></label><label>Tipo de mundo<select id="world-type"><option value="default">Padrão · biomas, rios e cavernas</option><option value="flat">Plano · espaço para construir</option></select></label></div><div class="button-row wide-row">${this.button('Criar e jogar','create-play')}${this.button('Cancelar','back')}</div></div>`,'shade');
    const mode=this.overlay.querySelector<HTMLSelectElement>('#world-mode')!;mode.onchange=()=>{this.overlay.querySelector('#mode-description')!.textContent=mode.value==='creative'?'Blocos ilimitados, voo e liberdade para construir sem limites.':'Explore, colete recursos, fabrique ferramentas e sobreviva à noite.'};
    this.on('back',()=>void this.worlds());this.on('create-play',()=>{const value=(id:string)=>(this.overlay.querySelector('#'+id)as HTMLInputElement).value;const config={id:crypto.randomUUID(),name:value('world-name').trim()||'Meu novo mundo',seed:value('world-seed').trim()||Math.floor(Math.random()*2147483647).toString(),mode:value('world-mode') as 'survival'|'creative',difficulty:value('world-difficulty') as 'peaceful'|'easy'|'normal'|'hard',type:value('world-type') as 'default'|'flat',created:Date.now(),lastPlayed:Date.now()};void this.game.start(config).catch(e=>this.error(e))});
  }
  loading(text:string){this.screen(`<div class="loading-screen"><div class="loading-cube"></div><h1>${esc(text)}</h1><p>Gerando terreno. Plantando possibilidades.</p></div>`,'shade')}
  error(error:unknown){console.error(error);this.screen(`${this.heading('Algo não saiu como esperado.')}<pre class="error-message"></pre>${this.button('Voltar ao menu','back')}`,'shade');this.overlay.querySelector('pre')!.textContent=String(error);this.on('back',()=>{this.game.state='menu';this.main()})}
  play(){this.overlay.hidden=true;this.hud.hidden=false;this.updateHUD()}
  pause(){this.screen(`<div class="pause-panel">${this.heading('Jogo pausado',esc(this.game.config?.name))}<div class="stack-buttons">${this.button('Voltar ao Jogo','resume')}${this.button('Opções…','options')}${this.button('Controles','controls')}${this.button('Salvar mundo','save')}${this.button('Salvar e Sair','exit')}</div></div>`,'pause-shade');this.on('resume',()=>this.game.resume());this.on('options',()=>this.options(()=>this.pause()));this.on('controls',()=>this.controls(()=>this.pause()));this.on('save',()=>void this.game.save().catch(()=>{}));this.on('exit',()=>void this.game.exit().catch(e=>this.error(e)))}
  death(cause:string){this.screen(`<div class="death-panel"><h1>Você morreu!</h1><p>Causa: ${esc(cause)}</p><p class="field-hint">Seus itens ficaram no local da morte.</p><div class="stack-buttons">${this.button('Renascer','respawn')}${this.button('Salvar e ir ao menu','exit')}</div></div>`,'death-shade');this.on('respawn',()=>this.game.respawn());this.on('exit',()=>void this.game.exit())}
  controls(back:()=>void){this.screen(`<div class="options-screen">${this.heading('Controles')}<div class="controls-grid">${[['W A S D','Movimentar'],['Mouse','Olhar ao redor'],['Espaço','Pular / nadar'],['Ctrl','Correr'],['Shift','Agachar / descer no voo'],['Mouse esquerdo','Minerar / atacar'],['Mouse direito','Colocar / interagir / comer'],['E','Inventário e fabricação'],['1—9 / Scroll','Selecionar na hotbar'],['Q','Soltar um item'],['Esc','Pausar / fechar inventário'],['Duplo Espaço','Ativar voo no Criativo'],['Botão do meio','Copiar bloco no Criativo'],['F3','Informações do mundo'],['F5','Câmera de observação'],['Shift + clique','Transferir item no inventário']].map(([k,v])=>`<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>${this.button('Voltar','back')}</div>`,'shade');this.on('back',back)}
  options(back:()=>void){
    const s=this.game.settings;
    const range=(label:string,key:keyof typeof s,min:number,max:number,step:number)=>`<label class="range-label">${label}<output id="out-${key}">${s[key]}</output><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"></label>`;
    this.screen(`<div class="options-screen">${this.heading('Opções','Seu jeito de explorar.')}<div class="options-panel"><div class="options-grid">${range('Distância · chunks','renderDistance',2,8,1)}${range('Campo de visão','fov',50,110,1)}${range('Sensibilidade','sensitivity',.2,2.5,.1)}<label>Qualidade<select data-setting="quality"><option value="low" ${s.quality==='low'?'selected':''}>Desempenho</option><option value="balanced" ${s.quality==='balanced'?'selected':''}>Equilibrada</option><option value="high" ${s.quality==='high'?'selected':''}>Alta resolução</option></select></label>${range('Volume geral','volume',0,1,.05)}${range('Efeitos sonoros','effects',0,1,.05)}${range('Ambiente','ambient',0,1,.05)}<label class="check-label"><input type="checkbox" data-setting="shadows" ${s.shadows?'checked':''}> Sombras suaves</label><label class="check-label"><input type="checkbox" data-setting="invert" ${s.invert?'checked':''}> Inverter mouse vertical</label>${this.game.config?`<label>Dificuldade<select id="difficulty">${['peaceful','easy','normal','hard'].map((v,i)=>`<option value="${v}" ${this.game.config?.difficulty===v?'selected':''}>${['Pacífico','Fácil','Normal','Difícil'][i]}</option>`).join('')}</select></label>`:''}</div><p class="field-hint">Reduza a distância e a resolução para melhorar o desempenho.</p></div><div class="button-row wide-row">${this.button('Tela cheia','fullscreen')}${this.button('Controles','controls')}</div>${this.button('Concluído','back')}</div>`,'shade');
    this.overlay.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-setting]').forEach(input=>input.oninput=()=>{const key=input.dataset.setting as keyof typeof s;const val=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input instanceof HTMLInputElement&&input.type==='range'?Number(input.value):input.value;(s as unknown as Record<string,unknown>)[key]=val;const output=this.overlay.querySelector('#out-'+key);if(output)output.textContent=String(val);this.game.applySettings()});
    const diff=this.overlay.querySelector<HTMLSelectElement>('#difficulty');if(diff)diff.onchange=()=>{if(this.game.config)this.game.config.difficulty=diff.value as typeof this.game.config.difficulty};
    this.on('back',back);this.on('controls',()=>this.controls(()=>this.options(back)));this.on('fullscreen',()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>this.toast('Tela cheia indisponível neste navegador.'))});
  }
  icon(id:string){
    const cached=this.iconCache.get(id);if(cached)return cached;
    const item=getItem(id);if(item.block!==undefined){const src=this.game.atlas.icon(item.block);this.iconCache.set(id,src);return src}
    const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d')!;const color='#'+item.color.toString(16).padStart(6,'0');ctx.fillStyle='#493723';
    if(item.tool){for(let i=0;i<10;i++)ctx.fillRect(3+i,13-i,2,2);ctx.fillStyle=color;if(item.tool==='pickaxe'){ctx.fillRect(5,2,10,3);ctx.fillRect(12,4,3,4);ctx.fillRect(4,3,3,2)}else if(item.tool==='axe'){ctx.fillRect(7,1,6,6);ctx.fillRect(6,3,8,3)}else if(item.tool==='sword'){for(let i=0;i<10;i++)ctx.fillRect(4+i,11-i,3,3);ctx.fillStyle='#554133';ctx.fillRect(3,9,5,2)}else{ctx.fillRect(10,1,5,5);ctx.fillRect(9,3,5,4)}}
    else if(id==='stick'){ctx.fillStyle='#a47b47';for(let i=0;i<11;i++)ctx.fillRect(2+i,13-i,2,2)}
    else{ctx.fillStyle='#302b29';ctx.fillRect(3,4,10,9);ctx.fillStyle=color;ctx.fillRect(4,3,8,10);ctx.fillRect(2,6,12,5);ctx.fillStyle='#ffffff65';ctx.fillRect(5,5,3,2);ctx.fillStyle='#00000022';ctx.fillRect(6,11,6,2);if(id.includes('apple')){ctx.fillStyle='#68923d';ctx.fillRect(8,1,4,2)}}
    const src=c.toDataURL();this.iconCache.set(id,src);return src;
  }
  slotHTML(slot:Slot,index:number,area='inv',extra=''){const item=slot?getItem(slot.id):null;return `<button class="slot ${extra}" data-area="${area}" data-index="${index}" title="${slot?esc(item!.name)+(slot.durability!==undefined?' · Durabilidade '+slot.durability:''):''}">${slot?`<img src="${this.icon(slot.id)}" draggable="false" alt="${esc(item!.name)}">${slot.count>1?`<b>${slot.count}</b>`:''}${slot.durability!==undefined?`<i class="durability" style="width:${Math.max(0,slot.durability/(item!.durability||1)*78)}%"></i>`:''}`:''}</button>`}
  updateHUD(){
    const g=this.game;if(!g.config)return;
    this.hud.innerHTML=`<div class="crosshair"></div><div class="top-hint"><span class="tiny-cube">▦</span> ${esc(g.world.biome(g.player.position.x,g.player.position.z))}<span class="hint-separator">/</span>${g.creative?'CRIATIVO':'SOBREVIVÊNCIA'}</div><div class="game-hints">E <span>Inventário</span><span class="hint-separator">·</span> Esc <span>Menu</span></div><div class="hotbar-area">${!g.creative?`<div class="vitals"><div class="hearts" aria-label="Vida ${Math.ceil(g.player.health)} de 20">${Array.from({length:10},(_,i)=>`<i class="heart ${g.player.health>=i*2+2?'full':g.player.health>i*2?'half':''}"></i>`).join('')}</div><div class="hunger" aria-label="Fome ${Math.ceil(g.player.hunger)} de 20">${Array.from({length:10},(_,i)=>`<i class="food ${g.player.hunger>i*2?'full':''}"></i>`).join('')}</div></div><div class="survival-line"><i style="width:${g.player.hunger/20*100}%"></i></div>`:`<div class="creative-label">${g.player.flying?'VOANDO · SHIFT PARA DESCER':'DUPLO ESPAÇO PARA VOAR'}</div>`}<div class="hotbar">${g.inventory.slots.slice(0,9).map((s,i)=>this.slotHTML(s,i,'hot',g.selected===i?'selected':'')).join('')}</div>${g.player.air<9?`<div class="air">${'●'.repeat(Math.ceil(g.player.air))}</div>`:''}</div>${g.hit?`<div class="block-label">${esc(getItem((Object.values(ITEMS).find(i=>i.block===g.hit!.id)?.id)||'').name||'Bloco')}${g.mining>0?`<div class="mining-bar"><i style="width:${Math.min(100,g.mining*100)}%"></i></div>`:''}</div>`:''}${g.debug?`<pre class="debug">Blockcraft 1.0 | ${g.fps.toFixed(0)} FPS<br>XYZ ${g.player.position.toArray().map(n=>n.toFixed(1)).join(' / ')}<br>Seed ${esc(g.config.seed)}<br>Chunks ${g.world.chunks.size} · ${g.renderer.info.render.triangles.toLocaleString()} triângulos<br>${esc(g.world.biome(g.player.position.x,g.player.position.z))} · Dia ${Math.floor(g.time*24)}:00<br>Modificações ${Object.keys(g.world.edits).length}<br>Mobs ${g.mobs.mobs.length}</pre>`:''}`;
  }
  inventory(kind:typeof this.kind,key:string){this.kind=kind;this.containerKey=key;this.grid=Array(kind==='workbench'?9:4).fill(null);this.recipeSelected='';this.category='Todos';this.search='';this.renderInventory()}
  private renderInventory(){
    const g=this.game,table=this.kind==='workbench',size=table?3:2;const creative=g.creative&&this.kind==='inventory';
    const title=this.kind==='workbench'?'Bancada de trabalho':this.kind==='chest'?'Baú':this.kind==='furnace'?'Fornalha':g.creative?'Inventário criativo':'Inventário';
    let top='';
    if(this.kind==='chest'){const slots=g.chests[this.containerKey]||=[];top=`<div class="container-title">Armazenamento</div><div class="slot-grid nine">${slots.map((s,i)=>this.slotHTML(s,i,'chest')).join('')}</div>`}
    else if(this.kind==='furnace'){const f=g.furnaces[this.containerKey];top=`<div class="furnace-ui"><div class="furnace-input"><span>Entrada</span>${this.slotHTML(f.slots[0],0,'furnace')}<div id="burn" class="burn">♨</div>${this.slotHTML(f.slots[1],1,'furnace')}<span>Combustível</span></div><div class="smelt-arrow">➜<div id="smelt-progress"></div></div><div><span>Resultado</span>${this.slotHTML(f.slots[2],2,'furnace','output-slot')}</div></div>`}
    else if(creative){const categories=['Todos',...new Set(Object.values(ITEMS).map(i=>i.category))];const items=Object.values(ITEMS).filter(i=>(this.category==='Todos'||i.category===this.category)&&i.name.toLowerCase().includes(this.search.toLowerCase()));top=`<div class="creative-controls"><select id="category">${categories.map(c=>`<option ${c===this.category?'selected':''}>${esc(c)}</option>`).join('')}</select><input id="search" placeholder="Buscar bloco ou item…" value="${esc(this.search)}"></div><div class="creative-grid slot-grid nine">${items.map(i=>`<button class="slot" data-creative="${i.id}" title="${esc(i.name)}"><img src="${this.icon(i.id)}" alt="${esc(i.name)}"></button>`).join('')}</div><p class="inventory-tip">Clique em um item para equipar na posição selecionada da hotbar.</p>`}
    else{const match=matchRecipe(this.grid,size);top=`<div class="crafting-top">${!table?'<div class="character-preview"><div class="pixel-person"><i class="person-head"></i><i class="person-body"></i><i class="person-arms"></i><i class="person-legs"></i></div></div>':''}<div><div class="container-title">Fabricação ${size} × ${size}</div><div class="slot-grid" style="grid-template-columns:repeat(${size},var(--slot-size))">${this.grid.map((s,i)=>this.slotHTML(s,i,'craft')).join('')}</div></div><span class="craft-arrow">➜</span>${this.slotHTML(match?.output||null,0,'result','output-slot')}</div>`}
    const recipes=(this.kind==='inventory'||table)&&!creative?`<aside class="recipe-panel"><h3>Livro de receitas</h3><p>Selecione para preencher a grade.</p><div class="recipe-list">${RECIPES.filter(r=>table||!r.table).map(r=>{const out=r.output,need:Record<string,number>={};for(const id of r.pattern.flat().filter(Boolean))need[id]=(need[id]||0)+1;const ingredients=Object.entries(need).map(([id,count])=>`${count} × ${getItem(id).name}`).join(', ');return `<button class="recipe ${this.canRecipe(r.id)?'available':''} ${this.recipeSelected===r.id?'chosen':''}" data-recipe="${r.id}" title="${esc(ingredients)}"><img src="${this.icon(out.id)}" alt=""><span>${esc(r.name)}<small>${out.count>1?out.count+' × ':''}${getItem(out.id).name}</small></span></button>`}).join('')}</div><p class="inventory-tip">${table?'Ferramentas e utilidades':'A bancada libera receitas 3 × 3.'}</p></aside>`:'';
    this.screen(`<div class="inventory-wrap">${recipes}<section class="inventory-panel"><div class="inventory-header"><h2>${title}</h2><button id="close-inventory" class="close-button" aria-label="Fechar inventário">×</button></div>${top}<div class="container-title inventory-title">Mochila</div><div class="slot-grid nine">${g.inventory.slots.slice(9,36).map((s,i)=>this.slotHTML(s,i+9)).join('')}</div><div class="slot-grid nine inventory-hotbar">${g.inventory.slots.slice(0,9).map((s,i)=>this.slotHTML(s,i,'inv',i===g.selected?'selected':'')).join('')}</div><p class="inventory-tip">Clique: mover · Direito: dividir / colocar 1 · Shift: transferir · E: fechar</p></section></div>`,'inventory-shade');
    this.on('close-inventory',()=>g.closeInventory());this.bindSlots();this.updateCursor();this.updateFurnaceProgress();
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-recipe]').forEach(b=>b.onclick=()=>this.fillRecipe(b.dataset.recipe!));
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-creative]').forEach(b=>b.onclick=()=>{const item=getItem(b.dataset.creative!);g.inventory.slots[g.selected]={id:item.id,count:item.stack,...(item.durability?{durability:item.durability}:{})};g.refreshHeld();this.renderInventory()});
    const cat=this.overlay.querySelector<HTMLSelectElement>('#category');if(cat)cat.onchange=()=>{this.category=cat.value;this.renderInventory()};
    const search=this.overlay.querySelector<HTMLInputElement>('#search');if(search)search.oninput=()=>{const value=search.value,pos=search.selectionStart;this.search=value;this.renderInventory();const input=this.overlay.querySelector<HTMLInputElement>('#search')!;input.focus();input.setSelectionRange(pos,pos)};
  }
  private canRecipe(id:string){
    const r=RECIPES.find(r=>r.id===id),size=this.kind==='workbench'?3:2;
    if(!r||(r.table&&size<3)||r.pattern.length>size||r.pattern.some(row=>row.length>size))return false;
    const available:Record<string,number>={};
    for(const s of [...this.game.inventory.slots,...this.grid])if(s)available[s.id]=(available[s.id]||0)+s.count;
    for(const ingredient of r.pattern.flat().filter(Boolean)){
      const item=available[ingredient]>0?ingredient:ingredient==='planks'&&available.birch_planks>0?'birch_planks':undefined;
      if(!item)return false;available[item]--;
    }
    return true;
  }
  private fillRecipe(id:string){
    const r=RECIPES.find(r=>r.id===id),size=this.kind==='workbench'?3:2;
    if(!r||!this.canRecipe(id)){const need:Record<string,number>={};if(r)for(const item of r.pattern.flat().filter(Boolean))need[item]=(need[item]||0)+1;this.toast(r?'Ingredientes necessários: '+Object.entries(need).map(([item,count])=>`${count} × ${getItem(item).name}`).join(', '):'Receita indisponível.');this.renderInventory();return}
    const preview=new Inventory(this.game.inventory.slots),remainingGrid=this.grid.map(s=>s?{...s}:null),next:Slot[]=Array(size*size).fill(null);
    for(let y=0;y<r.pattern.length;y++)for(let x=0;x<r.pattern[y].length;x++){
      const ingredient=r.pattern[y][x];if(!ingredient)continue;
      let found=false;
      for(const source of [remainingGrid,preview.slots]){
        const index=source.findIndex(s=>s&&(s.id===ingredient||(ingredient==='planks'&&s.id==='birch_planks')));
        if(index<0)continue;
        const stack=source[index]!;next[y*size+x]={...stack,count:1};stack.count--;if(!stack.count)source[index]=null;found=true;break;
      }
      if(!found)return;
    }
    for(const stack of remainingGrid)if(stack&&preview.add(stack.id,stack.count,stack.durability)){
      this.toast('Libere espaço na mochila para trocar os ingredientes da grade.');this.renderInventory();return;
    }
    this.game.inventory.slots.splice(0,36,...preview.slots);this.grid=next;this.recipeSelected=id;this.renderInventory();
  }
  private slotsFor(area:string):Slot[]{const g=this.game;return area==='craft'?this.grid:area==='chest'?g.chests[this.containerKey]:area==='furnace'?g.furnaces[this.containerKey].slots:g.inventory.slots}
  private bindSlots(){this.overlay.querySelectorAll<HTMLButtonElement>('[data-area]').forEach(b=>{
    const act=(right:boolean,shift:boolean)=>{const area=b.dataset.area!,i=Number(b.dataset.index);if(area==='result'){this.takeCraft();return}const slots=this.slotsFor(area);if(!slots||!Number.isInteger(i)||i<0||i>=slots.length)return;
      const slot=slots[i];if(shift&&slot){this.transfer(slots,i,area);this.renderInventory();return}
      const previousInput=area==='furnace'?slots[0]?.id:undefined;
      if(area==='furnace'&&i===2&&this.carried){
        if(!slot||slot.id!==this.carried.id||slot.durability!==this.carried.durability)return;
        const moved=Math.max(0,Math.min(right?Math.ceil(slot.count/2):slot.count,getItem(slot.id).stack-this.carried.count));
        this.carried.count+=moved;slot.count-=moved;if(!slot.count)slots[i]=null;this.renderInventory();return;
      }
      if(area==='furnace'&&this.carried&&((i===0&&!SMELTING[this.carried.id])||(i===1&&!FUELS[this.carried.id])))return;
      if(!this.carried){if(slot){if(right){const take=Math.ceil(slot.count/2);this.carried={...slot,count:take};slot.count-=take;if(slot.count===0)slots[i]=null}else{this.carried=slot;slots[i]=null}}}
      else if(!slot){const count=right?1:this.carried.count;slots[i]={...this.carried,count};this.carried.count-=count;if(!this.carried.count)this.carried=null}
      else if(slot.id===this.carried.id&&slot.durability===this.carried.durability){const moved=Math.max(0,Math.min(right?1:this.carried.count,getItem(slot.id).stack-slot.count));slot.count+=moved;this.carried.count-=moved;if(!this.carried.count)this.carried=null}
      else if(!right){const old=slots[i];slots[i]=this.carried;this.carried=old}
      if(area==='furnace'&&i===0&&slots[0]?.id!==previousInput)this.game.furnaces[this.containerKey].progress=0;
      this.renderInventory();
    };
    b.onclick=e=>act(false,e.shiftKey);b.oncontextmenu=e=>{e.preventDefault();act(true,e.shiftKey)};
    b.draggable=true;b.ondragstart=e=>{const area=b.dataset.area!,index=Number(b.dataset.index);if(area==='result'||this.carried){e.preventDefault();return}const slots=this.slotsFor(area),stack=slots?.[index];if(!stack){e.preventDefault();return}this.carried=stack;slots[index]=null;this.updateCursor();e.dataTransfer?.setData('text/plain','stack');if(e.dataTransfer)e.dataTransfer.effectAllowed='move';b.style.opacity='.35'};b.ondragover=e=>e.preventDefault();b.ondrop=e=>{e.preventDefault();act(false,e.shiftKey)};b.ondragend=()=>{if(this.carried){const slots=this.slotsFor(b.dataset.area!),index=Number(b.dataset.index);if(!slots[index]){slots[index]=this.carried;this.carried=null}this.renderInventory()}};
  })}
  private transfer(slots:Slot[],index:number,area:string){const slot=slots[index];if(!slot)return;const g=this.game;if(area==='chest'||area==='furnace'||area==='craft'){
    slot.count=g.inventory.add(slot.id,slot.count,slot.durability);if(slot.count<=0)slots[index]=null;
    if(area==='furnace'&&index===0&&!slots[index])g.furnaces[this.containerKey].progress=0;return;
    }
    const target=this.kind==='chest'?g.chests[this.containerKey]:this.kind==='furnace'?g.furnaces[this.containerKey].slots:g.inventory.slots;
    const indices=this.kind==='chest'?target.map((_,i)=>i):this.kind==='furnace'?[...(SMELTING[slot.id]?[0]:[]),...(FUELS[slot.id]?[1]:[])]:index<9?Array.from({length:27},(_,i)=>i+9):Array.from({length:9},(_,i)=>i);
    for(const i of indices){if(target===slots&&i===index)continue;const s=target[i];if(s?.id===slot.id&&s.durability===slot.durability){const n=Math.max(0,Math.min(slot.count,getItem(slot.id).stack-s.count));s.count+=n;slot.count-=n}}
    for(const i of indices)if(!(target===slots&&i===index)&&!target[i]&&slot.count){const n=Math.min(slot.count,getItem(slot.id).stack);target[i]={...slot,count:n};slot.count-=n}
    if(!slot.count)slots[index]=null;
  }
  private takeCraft(){const size=this.kind==='workbench'?3:2,match=matchRecipe(this.grid,size);if(!match)return;const out=match.output;if(this.carried&&(this.carried.id!==out.id||this.carried.durability!==out.durability||this.carried.count+out.count>getItem(out.id).stack))return;const result=craftGrid(this.grid,size);if(!result)return;if(this.carried)this.carried.count+=result.count;else this.carried={...result};this.game.audio.play('craft');this.renderInventory()}
  returnCraft(){for(const s of [...this.grid,this.carried])if(s){const left=this.game.inventory.add(s.id,s.count,s.durability);if(left){const p=this.game.player.position;this.game.drop(p.x,p.y+.5,p.z,s.id,left,s.durability)}}this.grid=this.grid.map(()=>null);this.carried=null;this.updateCursor()}
  updateCursor(){this.root.querySelector('#cursor-item')!.innerHTML=this.carried?`<img src="${this.icon(this.carried.id)}" alt=""><b>${this.carried.count>1?this.carried.count:''}</b>`:''}
  updateFurnaceProgress(){if(this.kind!=='furnace'||this.game.state!=='inventory')return;const f=this.game.furnaces[this.containerKey];if(!f)return;const burn=this.overlay.querySelector<HTMLElement>('#burn'),progress=this.overlay.querySelector<HTMLElement>('#smelt-progress');if(burn)burn.style.color=f.burn>0?'#ef9c39':'#6b6255';if(progress)progress.style.width=f.progress/SMELT_TIME*100+'%';for(let i=0;i<3;i++){
    const output=this.overlay.querySelector<HTMLElement>(`[data-area="furnace"][data-index="${i}"]`);if(!output)continue;
    const slot=f.slots[i],signature=JSON.stringify(slot);if(output.dataset.value!==signature){const replacement=document.createElement('div');replacement.innerHTML=this.slotHTML(slot,i,'furnace',i===2?'output-slot':'');const button=replacement.firstElementChild as HTMLButtonElement;output.innerHTML=button.innerHTML;output.title=button.title;output.dataset.value=signature}
    }}
  toast(text:string,duration=3500){const el=this.root.querySelector<HTMLElement>('#toast')!;el.textContent=text;el.classList.add('visible');clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>el.classList.remove('visible'),duration)}
  itemName(text:string){const el=this.root.querySelector<HTMLElement>('#item-name')!;el.textContent=text;el.classList.add('visible');clearTimeout(this.itemTimer);this.itemTimer=window.setTimeout(()=>el.classList.remove('visible'),1800)}
  flash(){const el=this.root.querySelector<HTMLElement>('#damage')!;el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}
}
