import * as THREE from 'three';
import { World } from './world';
import { createAtlas } from './atlas';
import { Player, raycast, type Hit } from './player';
import { B,key3,type SaveData,type WorldConfig,type FurnaceData,type Slot } from './shared';
import { Inventory,updateFurnace } from './inventory';
import { ITEMS,getItem,getBlockDef,blockItem } from './registry';
import { SaveManager } from './storage';
import { MobManager } from './mobs';
import { AudioManager,ParticleSystem } from './effects';
import { UI } from './ui';

export interface Settings { renderDistance:number;fov:number;sensitivity:number;volume:number;effects:number;ambient:number;quality:string;shadows:boolean;invert:boolean }
type Drop={mesh:THREE.Mesh;id:string;count:number;durability?:number;age:number;vy:number;baseY:number};
export class Game {
  readonly blockIds=B;readonly itemDefs=ITEMS;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.06,450);renderer:THREE.WebGLRenderer;
  world!:World;player!:Player;inventory=new Inventory();mobs!:MobManager;audio=new AudioManager();particles:ParticleSystem;
  ui:UI;state:'menu'|'playing'|'paused'|'inventory'|'dead'|'loading'='menu';config:WorldConfig|null=null;
  time=.27;selected=0;chests:Record<string,Slot[]>={};furnaces:Record<string,FurnaceData>={};doors:Record<string,boolean>={};
  settings:Settings;atlas=createAtlas();hit:Hit|null=null;mining=0;mouseDown=false;debug=false;fps=60;lastCause='';
  drops:Drop[]=[];private lastTime=0;private accumulator=0;private saveClock=0;private hudClock=0;private mineKey='';private placeCooldown=0;
  private sunLight=new THREE.DirectionalLight(0xffedce,2.1);private ambient=new THREE.HemisphereLight(0xc4e8ff,0x70603d,2.3);
  private sun:THREE.Mesh;private moon:THREE.Mesh;private stars:THREE.Points;private clouds=new THREE.Group();private hand=new THREE.Group();private held=new THREE.Group();
  private outline:THREE.LineSegments;private cracks:THREE.Mesh;private crackTextures:THREE.CanvasTexture[]=[];private torches:THREE.PointLight[]=[];
  private panorama=0;private lastSpace=0;private swing=0;private difficultyClock=0;private stepSound=0;private thirdPerson=false;
  private lightWorld:World|null=null;private lightRevision=-1;private lightBlocks:{xyz:number[];id:number;key:string}[]=[];
  private avatar=new THREE.Group();private avatarLimbs:THREE.Group[]=[];
  constructor(public canvas:HTMLCanvasElement){
    let stored={};try{stored=JSON.parse(localStorage.getItem('blockcraft-settings')||'{}')}catch{}
    this.settings={renderDistance:4,fov:75,sensitivity:1,volume:.55,effects:.8,ambient:.2,quality:'balanced',shadows:false,invert:false,...stored};
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor(0x91c8e8);
    this.scene.background=new THREE.Color(0x91c8e8);this.scene.fog=new THREE.Fog(0x91c8e8,35,85);
    this.scene.add(this.ambient,this.sunLight);this.sunLight.position.set(40,100,30);this.sunLight.castShadow=true;this.sunLight.shadow.mapSize.set(1024,1024);Object.assign(this.sunLight.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:180});this.sunLight.shadow.camera.updateProjectionMatrix();this.sunLight.shadow.bias=-.0005;this.scene.add(this.sunLight.target);
    this.sun=new THREE.Mesh(new THREE.BoxGeometry(7,7,.3),new THREE.MeshBasicMaterial({color:0xfff4c5,fog:false}));this.moon=new THREE.Mesh(new THREE.BoxGeometry(5,5,.3),new THREE.MeshBasicMaterial({color:0xcbdff0,fog:false}));this.scene.add(this.sun,this.moon);
    const starPositions=[];for(let i=0;i<500;i++){const a=i*2.39996,z=.05+(i%137)/145,r=Math.sqrt(1-z*z);starPositions.push(Math.cos(a)*r*170,z*170,Math.sin(a)*r*170)}
    this.stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3)),new THREE.PointsMaterial({color:0xe3f0ff,size:.65,fog:false}));this.scene.add(this.stars);
    const cloudMat=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.85});const cloudGeo=new THREE.BoxGeometry(1,1,1);
    for(let i=0;i<38;i++){const cloud=new THREE.Mesh(cloudGeo,cloudMat);cloud.scale.set(10+(i*7%15),2,6+(i*3%9));cloud.position.set((i*47%230)-115,75+(i%3)*3,(i*83%230)-115);this.clouds.add(cloud)}this.scene.add(this.clouds);
    this.particles=new ParticleSystem(this.scene);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008,1.008,1.008)),new THREE.LineBasicMaterial({color:0x18251b,transparent:true,opacity:.8}));this.scene.add(this.outline);this.outline.visible=false;
    for(let stage=0;stage<8;stage++){const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d')!;ctx.strokeStyle='rgba(20,12,7,.8)';ctx.lineWidth=1.4;for(let n=0;n<3+stage*3;n++){let x=(n*17+3)%32,y=(n*13+9)%32;ctx.beginPath();ctx.moveTo(x,y);for(let k=0;k<3;k++){x+=((n+k*3)%9)-4;y+=((n*3+k)%9)-4;ctx.lineTo(x,y)}ctx.stroke()}const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;this.crackTextures.push(t)}
    this.cracks=new THREE.Mesh(new THREE.BoxGeometry(1.012,1.012,1.012),new THREE.MeshBasicMaterial({map:this.crackTextures[0],transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));this.scene.add(this.cracks);this.cracks.visible=false;
    this.camera.add(this.hand);this.scene.add(this.camera);this.buildHand();this.buildAvatar();
    for(let i=0;i<12;i++){const light=new THREE.PointLight(0xffa343,0,13,1.8);light.visible=false;this.torches.push(light);this.scene.add(light)}
    this.world=new World(this.scene,'blockcraft-valley','default');this.player=new Player(this.world,this.camera,'creative',()=>{});
    this.mobs=this.createMobs();this.ui=new UI(this);this.bindInputs();this.applySettings();
    requestAnimationFrame(t=>this.frame(t));
  }
  private createMobs(){return new MobManager(this.scene,this.world,{damagePlayer:(n,c)=>this.player.damage(n,c),drop:(x,y,z,id,count)=>this.drop(x,y,z,id,count),explode:(x,y,z)=>{this.particles.burst(x,y,z,0xebcc88,40);this.audio.play('explosion')}})}
  get creative(){return this.config?.mode==='creative'}
  get night(){return Math.sin(this.time*Math.PI*2)<-.12}
  get active(){return this.state==='playing'}
  get currentItem(){const s=this.inventory.slots[this.selected];return s?getItem(s.id):null}
  private buildHand(){
    const arm=new THREE.Mesh(new THREE.BoxGeometry(.23,.6,.24),new THREE.MeshLambertMaterial({color:0xc99b72}));arm.position.set(.48,-.44,-.55);arm.rotation.set(-.22,0,-.22);
    const sleeve=new THREE.Mesh(new THREE.BoxGeometry(.235,.25,.245),new THREE.MeshLambertMaterial({color:0x417f82}));sleeve.position.set(.5,-.67,-.5);sleeve.rotation.z=-.22;this.hand.add(arm,sleeve,this.held);this.hand.renderOrder=10;this.hand.traverse(o=>{if(o instanceof THREE.Mesh)o.frustumCulled=false});
  }
  private buildAvatar(){
    const box=(parent:THREE.Group,color:number,w:number,h:number,d:number,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh};
    box(this.avatar,0x448b8e,.52,.67,.28,0,1.12,0);box(this.avatar,0xc99b72,.47,.47,.47,0,1.69,0);box(this.avatar,0x55402d,.49,.13,.49,0,1.89,0);box(this.avatar,0x55402d,.48,.24,.08,0,1.74,.21);
    for(const sign of [-1,1]){box(this.avatar,0xeee6c7,.09,.045,.015,sign*.11,1.73,-.24);box(this.avatar,0x304f51,.04,.045,.02,sign*.11,1.73,-.25);const leg=new THREE.Group();leg.position.set(sign*.14,.78,0);box(leg,0x495b7b,.24,.67,.27,0,-.34,0);box(leg,0x3a403e,.245,.12,.3,0,-.72,-.015);this.avatar.add(leg);this.avatarLimbs.push(leg)}
    box(this.avatar,0x9a6a4a,.15,.035,.02,0,1.57,-.245);
    for(const sign of [-1,1]){const arm=new THREE.Group();arm.position.set(sign*.39,1.43,0);box(arm,0x3e7b80,.23,.24,.27,0,-.09,0);box(arm,0xc99b72,.22,.41,.25,0,-.4,0);this.avatar.add(arm);this.avatarLimbs.push(arm)}
    this.avatar.visible=false;this.scene.add(this.avatar);
  }
  refreshHeld(){
    for(const child of [...this.held.children]){this.held.remove(child);if(child instanceof THREE.Mesh){child.geometry.dispose();(child.material as THREE.Material).dispose()}}
    const item=this.currentItem;if(!item)return;
    if(item.block===B.Torch){const stick=new THREE.Mesh(new THREE.BoxGeometry(.045,.29,.045),new THREE.MeshLambertMaterial({color:0x88603a}));stick.position.set(.42,-.29,-.65);stick.rotation.z=-.2;const flame=new THREE.Mesh(new THREE.BoxGeometry(.07,.09,.07),new THREE.MeshBasicMaterial({color:0xffd572}));flame.position.set(.395,-.12,-.65);this.held.add(stick,flame)}
    else if(item.block!==undefined){const geo=new THREE.BoxGeometry(.24,.24,.24);const uv=geo.getAttribute('uv');for(let f=0;f<6;f++){const [u0,v0,u1,v1]=this.atlas.uv(item.block,f);const c=[[u0,v1],[u1,v1],[u0,v0],[u1,v0]];for(let k=0;k<4;k++)uv.setXY(f*4+k,c[k][0],c[k][1])}const cube=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map:this.atlas.texture,transparent:getBlockDef(item.block).transparent,alphaTest:.1}));cube.position.set(.44,-.36,-.67);cube.rotation.set(.2,.4,.15);this.held.add(cube)}
    else if(item.tool){const handle=new THREE.Mesh(new THREE.BoxGeometry(.045,.42,.045),new THREE.MeshLambertMaterial({color:0x88603a}));handle.position.set(.43,-.28,-.67);handle.rotation.z=-.5;this.held.add(handle);const head=new THREE.Mesh(new THREE.BoxGeometry(item.tool==='sword'?.055:.29,item.tool==='sword'?.42:.07,.065),new THREE.MeshLambertMaterial({color:item.color}));head.position.set(.34,-.08,-.67);head.rotation.z=-.5;this.held.add(head)}
    else{const mesh=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.08),new THREE.MeshLambertMaterial({color:item.color}));mesh.position.set(.43,-.35,-.65);this.held.add(mesh)}
  }
  async start(config:WorldConfig,save?:SaveData){
    this.state='loading';this.ui.loading('Preparando seu mundo…');this.unlock();this.config=config;
    this.mobs.dispose();this.world.dispose();this.drops.forEach(d=>{this.scene.remove(d.mesh);d.mesh.geometry.dispose();(d.mesh.material as THREE.Material).dispose()});this.drops=[];
    this.world=new World(this.scene,config.seed,config.type,save?.edits||{});this.chests=save?.chests||{};this.furnaces=save?.furnaces||{};this.doors=save?.doors||{};
    for(const [key,open]of Object.entries(this.doors))if(open)this.world.openDoors.add(key);
    this.inventory=new Inventory(save?.player.inventory);this.selected=save?.player.selected||0;this.time=save?.time??.27;
    this.player=new Player(this.world,this.camera,config.mode,(n,c)=>this.onDamage(n,c));
    const spawn=this.world.findSpawn();this.player.spawn=spawn;
    if(save)this.player.restore(save.player);else{this.player.position.set(...spawn);this.player.yaw=Math.PI*.65;this.player.pitch=-.06;this.player.fallStart=spawn[1];if(config.mode==='creative'){['grass','stone','oak_log','planks','glass','workbench','torch','chest','bed'].forEach((id,i)=>this.inventory.slots[i]={id,count:64})}}
    this.mobs=this.createMobs();this.world.update(this.player.position.x,this.player.position.z,2,25);this.mobs.spawnAround(this.player.position);
    this.player.syncCamera();this.refreshHeld();this.thirdPerson=false;this.saveClock=0;this.state='playing';
    if(this.player.health<=0&&!this.creative){this.state='dead';this.ui.death('sua última aventura');return}
    this.ui.play();this.toast(config.mode==='creative'?'Criativo · E: todos os blocos · duplo Espaço: voo':'Seu mundo, suas regras. Comece coletando madeira.');await this.save(false);this.lock();
  }
  async save(show=true){
    if(!this.config||this.state==='loading')return;
    this.config.lastPlayed=Date.now();const p=this.player;
    let thumbnail=this.config.thumbnail;try{if(show||!thumbnail){this.renderer.render(this.scene,this.camera);const c=document.createElement('canvas');c.width=240;c.height=135;c.getContext('2d')!.drawImage(this.canvas,0,0,240,135);thumbnail=c.toDataURL('image/jpeg',.65);this.config.thumbnail=thumbnail}}catch{}
    const save:SaveData={version:1,config:{...this.config},player:{x:p.position.x,y:p.position.y,z:p.position.z,yaw:p.yaw,pitch:p.pitch,health:p.health,hunger:p.hunger,inventory:structuredClone(this.inventory.slots),selected:this.selected,spawn:p.spawn,flying:p.flying},time:this.time,edits:{...this.world.edits},chests:structuredClone(this.chests),furnaces:structuredClone(this.furnaces),doors:{...this.doors}};
    try{await SaveManager.save(save);if(show)this.toast('Mundo salvo.')}catch(e){this.toast('Não foi possível salvar: '+String(e),6000);throw e}
  }
  async exit(){this.unlock();this.ui.returnCraft();await this.save();this.config=null;this.state='menu';this.player.keys.clear();this.mobs.dispose();this.mobs=this.createMobs();this.hand.visible=false;this.ui.main()}
  pause(){if(this.state!=='playing')return;this.state='paused';this.mouseDown=false;this.player.keys.clear();this.unlock();this.ui.pause()}
  resume(){this.state='playing';this.ui.play();this.player.keys.clear();this.mouseDown=false;this.lock()}
  lock(){try{void Promise.resolve(this.canvas.requestPointerLock()).catch(()=>this.toast('Clique no cenário para controlar o mouse.'))}catch{this.toast('Clique no cenário para controlar o mouse.')}}
  unlock(){if(document.pointerLockElement)document.exitPointerLock()}
  openInventory(kind:'inventory'|'workbench'|'chest'|'furnace'='inventory',key=''){this.state='inventory';this.mouseDown=false;this.player.keys.clear();this.unlock();this.audio.play('inventory');this.ui.inventory(kind,key)}
  closeInventory(){this.ui.returnCraft();this.refreshHeld();this.resume()}
  respawn(){this.player.health=20;this.player.hunger=20;this.player.air=10;this.player.position.set(...this.player.spawn);while(this.player.collides(...this.player.position.toArray() as [number,number,number]))this.player.position.y++;this.player.velocity.set(0,0,0);this.player.fallStart=this.player.position.y;this.resume()}
  private onDamage(_n:number,cause:string){this.lastCause=cause;this.audio.play('hurt');this.ui.flash();if(this.player.health<=0){this.state='dead';this.unlock();this.mouseDown=false;this.player.keys.clear();if(!this.creative){for(const stack of this.inventory.slots)if(stack)this.drop(this.player.position.x,this.player.position.y+.5,this.player.position.z,stack.id,stack.count,stack.durability);this.inventory=new Inventory()}this.ui.death(cause)}}
  select(i:number){this.selected=(i+9)%9;this.mining=0;this.refreshHeld();this.ui.updateHUD();const s=this.inventory.slots[this.selected];if(s)this.ui.itemName(getItem(s.id).name)}
  drop(x:number,y:number,z:number,id:string,count=1,durability?:number){if(!ITEMS[id])return;const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshLambertMaterial({color:getItem(id).color}));mesh.position.set(x+.1,y+.2,z+.1);this.scene.add(mesh);this.drops.push({mesh,id,count,durability,age:0,vy:2,baseY:y})}
  dropSelected(){const slot=this.inventory.slots[this.selected];if(!slot)return;const dir=this.camera.getWorldDirection(new THREE.Vector3());const p=this.player.position.clone().addScaledVector(dir,1.4);this.drop(p.x,p.y+.7,p.z,slot.id,1,slot.durability);if(!this.creative)this.inventory.consumeSlot(this.selected);this.refreshHeld();this.ui.updateHUD()}
  use(){
    if(!this.active||this.placeCooldown>0)return;this.placeCooldown=.18;this.swing=1;
    const item=this.currentItem,slot=this.inventory.slots[this.selected],hit=this.hit;
    if(item?.food){if(this.player.hunger>=20&&!this.creative){this.toast('Você já está satisfeito.');return}this.player.hunger=Math.min(20,this.player.hunger+item.food);if(!this.creative)this.inventory.consumeSlot(this.selected);this.audio.play('eat');this.ui.updateHUD();this.refreshHeld();return}
    if(hit&&!this.player.keys.has('ShiftLeft')){
      const key=key3(hit.x,hit.y,hit.z);
      if(hit.id===B.Workbench){this.openInventory('workbench',key);return}
      if(hit.id===B.Chest){this.chests[key]??=Array(27).fill(null);this.openInventory('chest',key);return}
      if(hit.id===B.Furnace){this.furnaces[key]??={slots:[null,null,null],burn:0,progress:0};this.openInventory('furnace',key);return}
      if(hit.id===B.Bed){this.player.spawn=[hit.x+.5,hit.y+1.1,hit.z+.5];if(this.night){this.time=.25;this.player.health=Math.min(20,this.player.health+5);this.toast('Bom dia! Ponto de renascimento definido.')}else this.toast('Ponto de renascimento definido. Durma quando anoitecer.');this.audio.play('inventory');return}
      if(hit.id===B.Door){const base=this.world.getBlock(hit.x,hit.y-1,hit.z)===B.Door?hit.y-1:hit.y;const open=!this.doors[key3(hit.x,base,hit.z)];for(let dy=0;dy<2;dy++){const k=key3(hit.x,base+dy,hit.z);this.doors[k]=open;if(open)this.world.openDoors.add(k);else this.world.openDoors.delete(k);this.world.setBlock(hit.x,base+dy,hit.z,B.Door)}this.audio.play('place');return}
    }
    if(item?.block===undefined||!slot||!hit)return;
    const x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z;
    const existing=this.world.getBlock(x,y,z);if(existing!==B.Air&&existing!==B.Water&&existing!==B.TallGrass&&existing!==B.FlowerRed&&existing!==B.FlowerYellow)return;
    if(this.player.intersectsBlock(x,y,z)&&getBlockDef(item.block).solid)return;
    if(y<1||y>=95)return;
    if(item.block===B.Door&&(y>=94||this.world.getBlock(x,y+1,z)!==B.Air||this.player.intersectsBlock(x,y+1,z)))return;
    this.world.setBlock(x,y,z,item.block);if(!this.creative)this.inventory.consumeSlot(this.selected);
    if(item.block===B.Door)this.world.setBlock(x,y+1,z,B.Door);
    if(item.block===B.Chest)this.chests[key3(x,y,z)]=Array(27).fill(null);
    if(item.block===B.Furnace)this.furnaces[key3(x,y,z)]={slots:[null,null,null],burn:0,progress:0};
    this.audio.play('place');this.ui.updateHUD();this.refreshHeld();
  }
  private mine(dt:number){
    if(!this.mouseDown||!this.hit){this.mining=0;this.mineKey='';return}
    const hit=this.hit,key=key3(hit.x,hit.y,hit.z),def=getBlockDef(hit.id),tool=this.currentItem;
    if(key!==this.mineKey){this.mining=0;this.mineKey=key}
    if(hit.id===B.Bedrock){this.mining=0;return}
    const correct=!!tool?.tool&&tool.tool===def.tool;
    const seconds=this.creative?.09:Math.max(.1,def.hardness*(correct?1/(tool?.speed||2):def.tool==='pickaxe'?3:1.2));
    this.mining+=dt/seconds;this.swing=.6+Math.sin(performance.now()*.025)*.3;
    if(Math.random()<dt*9)this.particles.burst(hit.x+.5,hit.y+.5,hit.z+.5,def.color,2);
    if(this.mining>=1){
      let drop=def.drop??blockItem(hit.id);if(def.tool==='pickaxe'&&(!correct||(tool?.tier||0)<(def.tier||1)))drop=undefined;
      this.world.setBlock(hit.x,hit.y,hit.z,B.Air);this.world.openDoors.delete(key);delete this.doors[key];
      if(hit.id===B.Door){const otherY=this.world.getBlock(hit.x,hit.y-1,hit.z)===B.Door?hit.y-1:hit.y+1;if(this.world.getBlock(hit.x,otherY,hit.z)===B.Door){this.world.setBlock(hit.x,otherY,hit.z,B.Air);const otherKey=key3(hit.x,otherY,hit.z);this.world.openDoors.delete(otherKey);delete this.doors[otherKey]}}
      if(hit.id===B.Chest){for(const s of this.chests[key]||[])if(s)this.drop(hit.x+.5,hit.y+.5,hit.z+.5,s.id,s.count,s.durability);delete this.chests[key]}
      if(hit.id===B.Furnace){for(const s of this.furnaces[key]?.slots||[])if(s)this.drop(hit.x+.5,hit.y+.5,hit.z+.5,s.id,s.count,s.durability);delete this.furnaces[key]}
      if(!this.creative&&drop)this.drop(hit.x+.5,hit.y+.3,hit.z+.5,drop,1);
      if(!this.creative&&(hit.id===B.Leaves||hit.id===B.SpruceLeaves)){if(Math.random()<.15)this.drop(hit.x,hit.y,hit.z,'apple');if(Math.random()<.25)this.drop(hit.x,hit.y,hit.z,'sapling')}
      if(!this.creative&&tool?.tool)this.inventory.damageTool(this.selected);
      this.particles.burst(hit.x+.5,hit.y+.5,hit.z+.5,def.color,15);this.audio.play(def.tool==='axe'?'wood':def.tool==='pickaxe'?'stone':'dig');this.mining=0;this.ui.updateHUD();this.refreshHeld();
    }
  }
  private attack(){
    const dir=this.camera.getWorldDirection(new THREE.Vector3());const block=raycast(this.world,this.camera.position,dir,5);
    if(this.mobs.attack(this.camera.position,dir,this.currentItem?.damage||2,Math.min(4.3,block?.distance??4.3))){this.mouseDown=false;this.swing=1;this.audio.play('hit');if(!this.creative)this.inventory.damageTool(this.selected);this.refreshHeld();return true}return false;
  }
  applySettings(){
    this.camera.fov=this.settings.fov;this.camera.updateProjectionMatrix();this.audio.volume=this.settings.volume;this.audio.effects=this.settings.effects;this.audio.ambient=this.settings.ambient;
    this.renderer.setPixelRatio(this.settings.quality==='low'?1:this.settings.quality==='high'?Math.min(devicePixelRatio,2):Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=this.settings.shadows;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    try{localStorage.setItem('blockcraft-settings',JSON.stringify(this.settings))}catch{}
  }
  toast(msg:string,duration=3500){this.ui.toast(msg,duration)}
  private bindInputs(){
    addEventListener('resize',()=>{this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix()});
    document.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('click',()=>{if(this.active&&document.pointerLockElement!==this.canvas)this.lock();this.audio.unlock()});
    document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&this.active)this.pause()});
    document.addEventListener('mousemove',e=>{if(this.active&&document.pointerLockElement===this.canvas){this.player.yaw-=e.movementX*.002*this.settings.sensitivity;this.player.pitch=THREE.MathUtils.clamp(this.player.pitch-e.movementY*.002*this.settings.sensitivity*(this.settings.invert?-1:1),-1.55,1.55)}});
    document.addEventListener('mousedown',e=>{if(!this.active||document.pointerLockElement!==this.canvas)return;this.audio.unlock();if(e.button===0){if(!this.attack())this.mouseDown=true}else if(e.button===2)this.use();else if(e.button===1&&this.creative&&this.hit){const id=blockItem(this.hit.id);if(id){this.inventory.slots[this.selected]={id,count:64};this.refreshHeld();this.ui.updateHUD()}}});
    addEventListener('mouseup',()=>this.mouseDown=false);
    addEventListener('blur',()=>{this.player.keys.clear();this.mouseDown=false;if(this.active)this.pause()});
    document.addEventListener('wheel',e=>{if(this.active){e.preventDefault();this.select(this.selected+Math.sign(e.deltaY))}},{passive:false});
    document.addEventListener('keydown',e=>{
      if((e.target as HTMLElement).matches('input,select,textarea'))return;
      if(['Space','Tab','F3','F5','Escape'].includes(e.code))e.preventDefault();
      if(e.code==='Escape'){if(this.state==='inventory')this.closeInventory();else if(this.active)this.pause();else if(this.state==='paused')this.resume();return}
      if(e.code==='KeyE'&&!e.repeat){if(this.active)this.openInventory();else if(this.state==='inventory')this.closeInventory();return}
      if(!this.active)return;this.player.keys.add(e.code);
      if(e.code==='Space'&&!e.repeat&&this.creative){const now=performance.now();if(now-this.lastSpace<300){this.player.flying=!this.player.flying;this.player.velocity.y=0;this.toast(this.player.flying?'Voo ativado · Espaço sobe · Shift desce':'Voo desativado')}this.lastSpace=now}
      if(/^Digit[1-9]$/.test(e.code))this.select(Number(e.code.slice(-1))-1);
      if(e.code==='KeyQ'&&!e.repeat)this.dropSelected();
      if(e.code==='F3'&&!e.repeat){this.debug=!this.debug;this.ui.updateHUD()}
      if(e.code==='F5'&&!e.repeat){this.thirdPerson=!this.thirdPerson;this.toast(this.thirdPerson?'Terceira pessoa':'Primeira pessoa')}
    });
    document.addEventListener('keyup',e=>this.player.keys.delete(e.code));
    addEventListener('blockcraft-storage-warning',event=>this.toast((event as CustomEvent<string>).detail,8000));
    addEventListener('beforeunload',()=>{this.ui.returnCraft();void this.save(false)});
  }
  private tick(dt:number){
    this.placeCooldown=Math.max(0,this.placeCooldown-dt);
    this.player.update(dt,this.config?.difficulty||'normal');if(!this.active)return;
    this.time=(this.time+dt/1200)%1;this.mobs.update(dt,this.player.position,this.night,this.config?.difficulty||'normal');
    for(const data of Object.values(this.furnaces))updateFurnace(data,dt);
    this.hit=raycast(this.world,this.camera.position,this.camera.getWorldDirection(new THREE.Vector3()),this.creative?7:5);
    this.mine(dt);this.particles.update(dt);
    for(let i=this.drops.length-1;i>=0;i--){const d=this.drops[i];d.age+=dt;d.vy=Math.max(-12,d.vy-dt*12);const nextY=d.mesh.position.y+d.vy*dt;if(!this.world.isSolid(d.mesh.position.x,nextY-.12,d.mesh.position.z))d.mesh.position.y=nextY;else d.vy=0;d.mesh.rotation.y+=dt*1.6;
      if(d.age>.55&&d.mesh.position.distanceTo(this.player.position.clone().add(new THREE.Vector3(0,.7,0)))<2){const leftover=this.inventory.add(d.id,d.count,d.durability);if(leftover!==d.count){this.audio.play('pickup');this.ui.updateHUD();this.refreshHeld()}d.count=leftover}
      if(d.count<=0||d.age>300){this.scene.remove(d.mesh);d.mesh.geometry.dispose();(d.mesh.material as THREE.Material).dispose();this.drops.splice(i,1)}
    }
    this.saveClock+=dt;if(this.saveClock>15){this.saveClock=0;void this.save(false).catch(()=>{})}
    this.stepSound+=dt;if(this.stepSound>.42&&this.player.grounded&&Math.hypot(this.player.velocity.x,this.player.velocity.z)>1){this.stepSound=0;this.audio.play('step')}
    this.difficultyClock+=dt;if(this.difficultyClock>20){this.difficultyClock=0;this.growSaplings()}
  }
  private growSaplings(){for(const [key,id]of Object.entries(this.world.edits)){if(id!==B.Sapling||Math.random()>.25)continue;const [x,y,z]=key.split(',').map(Number);if(this.world.getBlock(x,y+1,z)!==B.Air)continue;for(let h=0;h<4;h++)this.world.setBlock(x,y+h,z,B.OakLog);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=2;dy<=4;dy++)if(Math.abs(dx)+Math.abs(dz)<4&&this.world.getBlock(x+dx,y+dy,z+dz)===B.Air)this.world.setBlock(x+dx,y+dy,z+dz,B.Leaves);break}}
  private lighting(){
    const daylight=THREE.MathUtils.clamp(Math.sin(this.time*Math.PI*2)*1.4+.2,0,1);const sunset=1-Math.abs(daylight-.35)/.35;
    const sky=new THREE.Color(0x0b142a).lerp(new THREE.Color(0x91c8e8),daylight);if(sunset>0)sky.lerp(new THREE.Color(0xdcab8e),sunset*.35);
    (this.scene.background as THREE.Color).copy(sky);const radius=this.config?this.settings.renderDistance:4;
    const fog=this.scene.fog as THREE.Fog;fog.color.copy(sky);fog.near=radius*16*.48;fog.far=radius*16+12;
    const p=this.config?this.player.position:this.camera.position;const surface=this.world.surface(p.x,p.z);const underground=p.y<surface-2;
    this.ambient.intensity=(.32+daylight*1.9)*(underground?.12:1);this.sunLight.intensity=daylight*2.15;this.sunLight.color.set(sunset>.2?0xffd1a0:0xfff0d2);
    const angle=this.time*Math.PI*2;this.sun.position.set(p.x+Math.cos(angle)*140,p.y+Math.sin(angle)*140,p.z-80);this.moon.position.set(p.x-Math.cos(angle)*140,p.y-Math.sin(angle)*140,p.z-80);this.sun.lookAt(this.camera.position);this.moon.lookAt(this.camera.position);this.sunLight.position.set(p.x+Math.cos(angle)*60,p.y+80,p.z+40);this.sunLight.target.position.set(p.x,p.y,p.z);this.stars.position.set(p.x,0,p.z);this.stars.visible=daylight<.5;this.sun.visible=daylight>.05;this.moon.visible=daylight<.45;
    if(this.lightWorld!==this.world||this.lightRevision!==this.world.revision){this.lightWorld=this.world;this.lightRevision=this.world.revision;this.lightBlocks=Object.entries(this.world.edits).filter(([,id])=>id===B.Torch||id===B.Furnace).map(([key,id])=>({xyz:key.split(',').map(Number),id,key}))}
    const sources=this.lightBlocks.map(s=>({...s,d:(s.xyz[0]-p.x)**2+(s.xyz[1]-p.y)**2+(s.xyz[2]-p.z)**2})).filter(s=>s.d<225&&(s.id===B.Torch||this.furnaces[s.key]?.burn>0)).sort((a,b)=>a.d-b.d).slice(0,12);
    this.torches.forEach((light,i)=>{const s=sources[i];light.visible=!!s;light.intensity=s?12+Math.sin(performance.now()*.01+i)*1.5:0;if(s)light.position.set(s.xyz[0]+.5,s.xyz[1]+.8,s.xyz[2]+.5)});
  }
  private frame(t:number){
    const dt=Math.min(.1,(t-this.lastTime)/1000||.016);this.lastTime=t;this.fps=THREE.MathUtils.lerp(this.fps,1/Math.max(dt,.001),.04);
    if(this.active){this.accumulator+=dt;let steps=0;while(this.accumulator>=1/60&&steps++<6){this.tick(1/60);this.accumulator-=1/60}this.world.update(this.player.position.x,this.player.position.z,this.settings.renderDistance,1)}
    else if(this.state==='menu'&&!this.config){this.panorama+=dt*.025;const spawn=this.world.findSpawn();this.camera.position.set(spawn[0]+Math.cos(this.panorama)*14,spawn[1]+10,spawn[2]+Math.sin(this.panorama)*14);this.camera.lookAt(spawn[0]-15,spawn[1]+2,spawn[2]-15);this.world.update(this.camera.position.x,this.camera.position.z,4,1);this.time=.31;}
    if(this.state==='inventory')for(const data of Object.values(this.furnaces))updateFurnace(data,dt);
    this.audio.update(dt,this.night,this.player.inWater);
    this.clouds.position.x=(t*.0008)%220;this.clouds.position.z=this.config?Math.floor(this.player.position.z/180)*180:0;
    this.lighting();this.hand.visible=this.active&&!this.thirdPerson;this.swing=Math.max(0,this.swing-dt*4);this.hand.rotation.x=-Math.sin(this.swing*Math.PI)*.45;this.hand.position.y=this.active?Math.sin(this.player.walk*2.5)*.015:0;
    this.avatar.visible=this.active&&this.thirdPerson;this.avatar.position.copy(this.player.position);this.avatar.rotation.y=this.player.yaw;this.avatarLimbs.forEach((limb,i)=>limb.rotation.x=Math.sin(this.player.walk*2.5+(i%2)*Math.PI)*Math.min(.7,Math.hypot(this.player.velocity.x,this.player.velocity.z)*.1)*(i>1?-1:1));
    this.outline.visible=this.active&&!!this.hit;this.cracks.visible=this.outline.visible&&this.mining>0;
    if(this.hit){this.outline.position.set(this.hit.x+.5,this.hit.y+.5,this.hit.z+.5);this.cracks.position.copy(this.outline.position);(this.cracks.material as THREE.MeshBasicMaterial).map=this.crackTextures[Math.min(7,Math.floor(this.mining*8))]}
    if(this.active&&this.thirdPerson){const backward=this.camera.getWorldDirection(new THREE.Vector3()).negate();const obstacle=raycast(this.world,this.camera.position,backward,4);this.camera.position.addScaledVector(backward,Math.min(4,(obstacle?.distance??4)-.2))}
    this.renderer.render(this.scene,this.camera);this.hudClock+=dt;if(this.hudClock>.12){this.hudClock=0;if(this.config)this.ui.updateHUD();if(this.state==='inventory')this.ui.updateFurnaceProgress()}
    requestAnimationFrame(time=>this.frame(time));
  }
}
