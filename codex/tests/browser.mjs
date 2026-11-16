import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';

await mkdir('artifacts',{recursive:true});
const baseURL=process.env.BLOCKCRAFT_BASE_URL??'http://127.0.0.1:5173/';
const diagnosticsOnly=process.argv.includes('--diagnostics-only');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage(),errors=[],consoleErrors=[],consoleWarnings=[],networkErrors=[],requests=[],externalRequests=[];
page.setDefaultTimeout(20000);
page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());else if(message.type()==='warning')consoleWarnings.push(message.text());});
page.on('response',response=>{if(response.status()>=400)networkErrors.push({url:response.url(),status:response.status()});});
page.on('request',request=>{const url=request.url();if(/^https?:/.test(url)){requests.push(url);if(new URL(url).origin!==new URL(baseURL).origin)externalRequests.push(url);}});
const report={baseURL,passed:[],errors,consoleErrors,consoleWarnings,networkErrors,requests,externalRequests};let stage='initialization';
const passed=(name,data)=>{report.passed.push({name,...(data===undefined?{}:{data})});console.log('PASS',name,data??'');};
const evaluate=fn=>page.evaluate(fn);
const count=id=>page.evaluate(id=>window.blockcraft.inventory.count(id),id);
async function stashCursor(){
  const index=await evaluate(()=>{const g=window.blockcraft,carry=g.ui.carried,limit=window.__acceptance.ITEMS[carry.id].stack;const match=g.inventory.slots.findIndex(s=>s?.id===carry.id&&s.durability===carry.durability&&s.count+carry.count<=limit);return match>=0?match:g.inventory.slots.findIndex(s=>s===null);});
  assert.ok(index>=0,'A free inventory slot is available for the crafted result');
  await page.locator(`[data-area="inv"][data-index="${index}"]`).click();
  assert.equal(await evaluate(()=>window.blockcraft.ui.carried),null);
}
async function craft(id,{screenshot}={}){
  await page.locator(`[data-recipe="${id}"]`).click();
  assert.ok(await evaluate(()=>!!document.querySelector('[data-area="result"] img')),`Recipe ${id} has a real output`);
  if(screenshot)await page.screenshot({path:`artifacts/${screenshot}.png`});
  await page.locator('[data-area="result"]').click();await stashCursor();
}
async function openWorkbench(){
  await evaluate(()=>{const g=window.blockcraft,t=window.__acceptance.sites.workbench;g.placeCooldown=0;g.hit={...t,id:window.__acceptance.B.Workbench,normal:g.player.position.clone().set(0,1,0),distance:3};g.use();});
  await page.waitForFunction(()=>window.blockcraft.state==='inventory'&&window.blockcraft.ui.kind==='workbench');
}
async function closeInventory(){await page.locator('#close-inventory').click();await page.waitForFunction(()=>window.blockcraft.state==='playing');}
async function mineNatural(blockId,amount,tool){
  return page.evaluate(({blockId,amount,tool})=>{
    const g=window.blockcraft,{B}=window.__acceptance,origin=g.player.position.clone(),found=[];
    const selected=tool?g.inventory.slots.findIndex(s=>s?.id===tool):g.inventory.slots.findIndex(s=>!s);
    if(selected<0)throw new Error('No tool/empty hand slot available');g.selected=selected;
    const tree=blockId===B.OakLog;
    for(let radius=0;radius<=30&&found.length<amount;radius++)for(let dz=-radius;dz<=radius&&found.length<amount;dz++)for(let dx=-radius;dx<=radius&&found.length<amount;dx++){
      if(radius&&Math.abs(dx)!==radius&&Math.abs(dz)!==radius)continue;
      const x=Math.floor(origin.x)+dx,z=Math.floor(origin.z)+dz,h=g.world.surface(x,z);
      const low=tree?h+1:blockId===B.Stone?Math.max(4,h-9):4,high=tree?h+10:blockId===B.Stone?h-4:Math.min(42,h-4);
      for(let y=low;y<=high&&found.length<amount;y++)if(g.world.getBlock(x,y,z)===blockId&&!Object.hasOwn(g.world.edits,`${x},${y},${z}`))found.push({x,y,z});
    }
    if(found.length!==amount)throw new Error(`Natural block ${blockId}: found ${found.length}/${amount}`);
    for(const position of found){
      g.hit={...position,id:blockId,normal:g.player.position.clone().set(0,1,0),distance:3};g.mouseDown=true;g.mine(30);g.mouseDown=false;
      if(g.world.getBlock(position.x,position.y,position.z)!==B.Air)throw new Error('Mining did not remove the natural block');
      for(const drop of g.drops){drop.age=1;drop.vy=0;drop.mesh.position.copy(g.player.position).add(g.player.position.clone().set(0,.7,0));}
      g.tick(1/60);
    }
    g.refreshHeld();g.ui.updateHUD();return {blockId,amount,positions:found,toolDurability:tool?g.inventory.slots[selected]?.durability:undefined};
  },{blockId,amount,tool});
}
async function place(id,label,dx,dz){
  return page.evaluate(({id,label,dx,dz})=>{
    const g=window.blockcraft,def=window.__acceptance.ITEMS[id];
    let selected=g.inventory.slots.findIndex(s=>s?.id===id);if(selected<0)throw new Error(`Missing placeable item: ${id}`);
    if(selected>=9){const empty=g.inventory.slots.slice(0,9).findIndex(s=>!s),hot=empty>=0?empty:0;[g.inventory.slots[hot],g.inventory.slots[selected]]=[g.inventory.slots[selected],g.inventory.slots[hot]];selected=hot;}
    const x=Math.floor(window.__acceptance.origin[0])+dx,z=Math.floor(window.__acceptance.origin[2])+dz,y=g.world.surface(x,z)+1;
    g.selected=selected;g.placeCooldown=0;g.hit={x,y:y-1,z,id:g.world.getBlock(x,y-1,z),normal:g.player.position.clone().set(0,1,0),distance:3};g.use();
    if(g.world.getBlock(x,y,z)!==def.block)throw new Error(`Placement failed for ${id} at ${x},${y},${z}`);
    const site={x,y,z};window.__acceptance.sites[label]=site;return site;
  },{id,label,dx,dz});
}

try{
  if(diagnosticsOnly){
    stage='production resource diagnostics';await page.goto(baseURL);await page.waitForFunction(()=>window.blockcraft?.world.chunks.size>=60);await page.waitForTimeout(300);
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(networkErrors,[]);assert.deepEqual(externalRequests,[]);report.success=true;
    passed('Production resources load locally without errors or external requests',{requests,warnings:consoleWarnings});
  }else{
  stage='survival world creation';
  await page.goto(baseURL);
  await page.waitForFunction(()=>window.blockcraft?.world.chunks.size>=60);
  await page.screenshot({path:'artifacts/menu.png'});
  assert.equal(await page.title(),'Blockcraft · AI Challenge');
  await page.getByRole('button',{name:'Um Jogador',exact:true}).click();
  await page.getByRole('button',{name:'Criar Novo Mundo',exact:true}).click();
  await page.locator('#world-name').fill('Teste de aceitação');await page.locator('#world-seed').fill('blockcraft-valley');
  await page.getByRole('button',{name:'Criar e jogar',exact:true}).click();
  await page.waitForFunction(()=>window.blockcraft?.config&&window.blockcraft.state==='playing');
  await page.waitForFunction(()=>window.blockcraft.world.chunks.size>=60);
  const initial=await evaluate(()=>{const g=window.blockcraft;return{inventory:g.inventory.slots.filter(Boolean).length,health:g.player.health,spawn:g.player.position.toArray(),mobs:g.mobs.mobs.length,chunks:g.world.chunks.size};});
  assert.equal(initial.inventory,0);assert.equal(initial.health,20);assert.ok(initial.mobs>0);
  await evaluate(()=>{const g=window.blockcraft;window.__acceptance={B:g.blockIds,ITEMS:g.itemDefs,origin:g.player.position.toArray(),sites:{}};});
  const constants=await evaluate(()=>window.__acceptance.B);
  await page.screenshot({path:'artifacts/gameplay.png'});passed('Survival starts with an empty inventory and a populated procedural world',initial);

  stage='natural wood harvesting and inventory crafting';
  const wood=await mineNatural(constants.OakLog,8);assert.equal(await count('oak_log'),8);passed('Mine and collect eight natural logs through game mining and drop pickup',wood);
  await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.blockcraft.state==='inventory');
  for(let i=0;i<8;i++)await craft('planks');assert.equal(await count('planks'),32);assert.equal(await count('oak_log'),0);
  await craft('workbench',{screenshot:'inventory'});await craft('stick');assert.equal(await count('stick'),4);
  await closeInventory();await place('workbench','workbench',3,0);await openWorkbench();
  await craft('wood_pickaxe',{screenshot:'workbench'});await closeInventory();
  assert.equal(await count('wood_pickaxe'),1);passed('Actual recipe UI produces planks, workbench, sticks and a wooden pickaxe');

  stage='stone tool progression and utility crafting';
  const stone=await mineNatural(constants.Stone,13,'wood_pickaxe');assert.equal(await count('cobble'),13);
  await openWorkbench();await craft('stone_pickaxe');await craft('furnace');await craft('chest');await craft('stick');await closeInventory();
  assert.equal(await count('stone_pickaxe'),1);assert.equal(await count('cobble'),2);passed('Wooden pickaxe yields stone resources for stone tools, furnace and chest',stone);
  await mineNatural(constants.IronOre,3,'stone_pickaxe');await mineNatural(constants.CoalOre,4,'stone_pickaxe');
  assert.equal(await count('raw_iron'),3);assert.equal(await count('coal'),4);
  await openWorkbench();await craft('torch');await closeInventory();
  const furnaceSite=await place('furnace','furnace',5,0),chestSite=await place('chest','chest',7,0);
  await place('planks','wall1',3,2);await place('planks','wall2',4,2);await place('planks','wall3',5,2);await place('torch','torch',4,1);
  passed('Mine natural iron and coal, and place real functional blocks through use()', {furnaceSite,chestSite});

  stage='live furnace smelting';
  await evaluate(()=>{const g=window.blockcraft,t=window.__acceptance.sites.furnace;g.placeCooldown=0;g.hit={...t,id:window.__acceptance.B.Furnace,normal:g.player.position.clone().set(0,1,0),distance:3};g.use();});
  await page.waitForFunction(()=>window.blockcraft.state==='inventory'&&window.blockcraft.ui.kind==='furnace');
  for(const id of ['raw_iron','coal']){
    const index=await page.evaluate(id=>window.blockcraft.inventory.slots.findIndex(s=>s?.id===id),id);
    await page.locator(`[data-area="inv"][data-index="${index}"]`).click({modifiers:['Shift']});
  }
  await page.waitForFunction(()=>{const g=window.blockcraft,f=g.furnaces[g.ui.containerKey];return f.progress>1&&f.slots[1]?.count===2;},null,{timeout:15000});
  await page.screenshot({path:'artifacts/furnace.png'});
  await page.waitForFunction(()=>{const g=window.blockcraft;return g.furnaces[g.ui.containerKey].slots[2]?.count>=1;},null,{timeout:30000});
  const smelted=await evaluate(()=>{const g=window.blockcraft;return structuredClone(g.furnaces[g.ui.containerKey]);});
  assert.equal(smelted.slots[2].id,'iron_ingot');assert.ok(smelted.slots[0].count<3);assert.equal(smelted.slots[1].count,2);
  await page.locator('[data-area="furnace"][data-index="2"]').click();await stashCursor();assert.ok(await count('iron_ingot')>=1);
  await closeInventory();passed('Furnace consumes fuel and produces extractable iron while its inventory remains open',smelted);

  stage='natural cave lighting';
  const caveBefore=await evaluate(()=>{
    const g=window.blockcraft,{B}=window.__acceptance;
    window.__acceptance.beforeCave={position:g.player.position.toArray(),yaw:g.player.yaw,pitch:g.player.pitch,selected:g.selected};
    g.player.position.set(38.5,30.02,-19.5);g.player.velocity.set(0,0,0);g.player.fallStart=30.02;g.player.yaw=Math.PI*.25;g.player.pitch=-.05;g.player.syncCamera();
    if(g.player.collides(...g.player.position.toArray()))throw new Error('Known natural cave viewpoint is obstructed');
    if(g.world.getBlock(37,31,-20)!==B.Air)throw new Error('Natural cave torch cell is not air');
    g.world.update(g.player.position.x,g.player.position.z,g.settings.renderDistance,25);g.lighting();
    return {position:g.player.position.toArray(),surface:g.world.surface(38,-20),ambient:g.ambient.intensity,lights:g.torches.filter(l=>l.visible&&l.intensity>0).length,torches:g.inventory.count('torch')};
  });
  await page.waitForTimeout(250);await page.screenshot({path:'artifacts/cave-before.png'});
  const caveAfter=await evaluate(()=>{
    const g=window.blockcraft,{B}=window.__acceptance,target={x:37,y:31,z:-20};
    const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    const support=normals.map(([nx,ny,nz])=>({x:target.x-nx,y:target.y-ny,z:target.z-nz,nx,ny,nz})).find(p=>g.world.isSolid(p.x,p.y,p.z));
    if(!support)throw new Error('Natural cave torch has no adjacent support');
    g.selected=g.inventory.slots.findIndex(s=>s?.id==='torch');if(g.selected<0)throw new Error('No crafted torch remains');
    g.placeCooldown=0;g.hit={x:support.x,y:support.y,z:support.z,id:g.world.getBlock(support.x,support.y,support.z),normal:g.player.position.clone().set(support.nx,support.ny,support.nz),distance:2};g.use();
    if(g.world.getBlock(target.x,target.y,target.z)!==B.Torch)throw new Error('Actual cave torch placement failed');
    const pickaxe=g.inventory.slots.findIndex(s=>s?.id==='stone_pickaxe');g.selected=pickaxe;g.refreshHeld();g.lighting();
    return {lights:g.torches.filter(l=>l.visible&&l.intensity>0).length,torches:g.inventory.count('torch'),intensity:Math.max(...g.torches.map(l=>l.intensity))};
  });
  await page.waitForTimeout(250);await page.screenshot({path:'artifacts/cave.png'});
  assert.ok(caveBefore.position[1]<caveBefore.surface-2);assert.ok(caveBefore.ambient<.5);assert.ok(caveAfter.lights>caveBefore.lights);assert.ok(caveAfter.intensity>10);assert.equal(caveAfter.torches,caveBefore.torches-1);
  await evaluate(()=>{const g=window.blockcraft,s=window.__acceptance.beforeCave;g.player.position.set(...s.position);g.player.velocity.set(0,0,0);g.player.fallStart=s.position[1];g.player.yaw=s.yaw;g.player.pitch=s.pitch;g.selected=s.selected;g.player.syncCamera();g.refreshHeld();});
  passed('A natural cave is dim underground and a genuinely placed crafted torch activates nearby point lighting',{before:caveBefore,after:caveAfter});

  stage='chest transfer and combat';
  await evaluate(()=>{const g=window.blockcraft,t=window.__acceptance.sites.chest;g.placeCooldown=0;g.hit={...t,id:window.__acceptance.B.Chest,normal:g.player.position.clone().set(0,1,0),distance:3};g.use();});
  await page.waitForFunction(()=>window.blockcraft.ui.kind==='chest');
  const beforeChest=await count('planks'),plankIndex=await evaluate(()=>window.blockcraft.inventory.slots.findIndex(s=>s?.id==='planks'));
  await page.locator(`[data-area="inv"][data-index="${plankIndex}"]`).click({modifiers:['Shift']});assert.equal(await count('planks'),0);
  const chest=await evaluate(()=>{const g=window.blockcraft;return structuredClone(g.chests[g.ui.containerKey]);});
  assert.equal(chest.reduce((n,s)=>n+(s?.id==='planks'?s.count:0),0),beforeChest);await page.screenshot({path:'artifacts/chest.png'});await closeInventory();
  const combat=await evaluate(()=>{
    const g=window.blockcraft,mob=g.mobs.mobs.find(m=>!m.hostile);if(!mob)throw new Error('No passive animal exists');
    const type=mob.type;mob.group.position.copy(g.player.position).add(g.player.position.clone().set(0,0,-2));
    const origin=mob.group.position.clone().add(g.player.position.clone().set(0,1,2)),direction=g.player.position.clone().set(0,0,-1);
    const hit=g.mobs.attack(origin,direction,100,4);
    for(const drop of g.drops){drop.age=1;drop.vy=0;drop.mesh.position.copy(g.player.position).add(g.player.position.clone().set(0,.7,0));}g.tick(1/60);
    return {type,hit,meat:g.inventory.count('raw_meat'),wool:g.inventory.count('wool'),feathers:g.inventory.count('feather')};
  });assert.equal(combat.hit,true);assert.ok(combat.meat+combat.wool+combat.feathers>0);
  passed('Chest Shift transfer conserves stored resources; a live animal can be attacked and its drops collected',{storedPlanks:beforeChest,combat});

  stage='night rendering and persistence';
  await evaluate(()=>{const g=window.blockcraft;g.time=.75;const p=g.player.position.clone();g.mobs.spawn('zombie',p.x+7,g.world.surface(p.x+7,p.z)+1,p.z);g.player.pitch=-.06;g.player.syncCamera();});
  await page.waitForFunction(()=>window.blockcraft.night);await page.screenshot({path:'artifacts/night.png'});assert.ok(await evaluate(()=>window.blockcraft.mobs.mobs.some(m=>m.hostile)));
  await evaluate(()=>window.blockcraft.pause());
  const expected=await evaluate(()=>{const g=window.blockcraft;return {id:g.config.id,inventory:structuredClone(g.inventory.slots),edits:{...g.world.edits},chests:structuredClone(g.chests),furnaces:structuredClone(g.furnaces),position:g.player.position.toArray()};});
  await page.locator('#exit').click();await page.waitForFunction(()=>window.blockcraft.state==='menu'&&!window.blockcraft.config);
  await page.reload();await page.waitForFunction(()=>window.blockcraft?.world.chunks.size>=60);
  await page.getByRole('button',{name:'Um Jogador',exact:true}).click();await page.locator(`[data-play="${expected.id}"]`).click();
  await page.waitForFunction(()=>window.blockcraft.state==='playing'&&!!window.blockcraft.config);
  const restored=await evaluate(()=>{const g=window.blockcraft;g.pause();return {inventory:structuredClone(g.inventory.slots),edits:{...g.world.edits},chests:structuredClone(g.chests),furnaces:structuredClone(g.furnaces),position:g.player.position.toArray()};});
  assert.deepEqual(restored.inventory,expected.inventory);assert.deepEqual(restored.edits,expected.edits);assert.deepEqual(restored.chests,expected.chests);
  for(const [key,furnace] of Object.entries(expected.furnaces)){
    assert.deepEqual(restored.furnaces[key].slots,furnace.slots);assert.ok(Math.abs(restored.furnaces[key].burn-furnace.burn)<1);assert.ok(Math.abs(restored.furnaces[key].progress-furnace.progress)<1);
  }
  assert.ok(restored.position.every((v,i)=>Math.abs(v-expected.position[i])<.25));
  passed('Actual save, exit, page reload and world selection restore inventory, edits, chest, furnace and position',{worldId:expected.id,modifiedBlocks:Object.keys(expected.edits).length,position:restored.position});

  stage='creative mode and flight';
  await page.locator('#exit').click();await page.waitForFunction(()=>window.blockcraft.state==='menu');
  await page.getByRole('button',{name:'Um Jogador',exact:true}).click();await page.getByRole('button',{name:'Criar Novo Mundo',exact:true}).click();
  await page.locator('#world-name').fill('Criativo plano');await page.locator('#world-seed').fill('creative-acceptance');await page.locator('#world-mode').selectOption('creative');await page.locator('#world-type').selectOption('flat');
  await page.getByRole('button',{name:'Criar e jogar',exact:true}).click();await page.waitForFunction(()=>window.blockcraft.state==='playing'&&window.blockcraft.creative);
  assert.deepEqual(await evaluate(()=>[-25,0,25].map(x=>window.blockcraft.world.surface(x,0))),[24,24,24]);
  await page.keyboard.press('KeyE');await page.locator('#category').waitFor();
  const categories=await page.locator('#category option').allTextContents();assert.ok(categories.length>=8);
  for(const name of ['Construção','Natureza','Minérios','Madeira','Decoração','Ferramentas','Utilidades'])assert.ok(categories.includes(name),name);
  await page.locator('#category').selectOption('Ferramentas');await page.locator('[data-creative="diamond_pickaxe"]').click();
  const tool=await evaluate(()=>window.blockcraft.inventory.slots[window.blockcraft.selected]);assert.equal(tool.id,'diamond_pickaxe');assert.equal(tool.count,1);assert.equal(tool.durability,1561);
  await closeInventory();await page.keyboard.press('Space');await page.waitForTimeout(80);await page.keyboard.press('Space');assert.equal(await evaluate(()=>window.blockcraft.player.flying),true);
  const beforeFlight=await evaluate(()=>window.blockcraft.player.position.y);await page.keyboard.down('Space');await page.waitForTimeout(350);await page.keyboard.up('Space');
  assert.ok(await evaluate(()=>window.blockcraft.player.position.y)>beforeFlight+.1);await page.screenshot({path:'artifacts/creative.png'});
  passed('Creative flat world exposes all categories, initializes tool durability and supports double-Space flight',{categories,tool});
  stage='dead save and respawn';
  await evaluate(()=>window.blockcraft.pause());await page.locator('#exit').click();await page.waitForFunction(()=>window.blockcraft.state==='menu');
  await page.getByRole('button',{name:'Um Jogador',exact:true}).click();await page.locator(`[data-play="${expected.id}"]`).click();
  await page.waitForFunction(()=>window.blockcraft.state==='playing'&&!window.blockcraft.creative);
  await evaluate(()=>{const g=window.blockcraft;g.player.health=1;g.player.damage(20,'teste de aceitação');});
  await page.waitForFunction(()=>window.blockcraft.state==='dead');assert.equal(await count('stone_pickaxe'),0);
  await page.locator('#exit').click();await page.waitForFunction(()=>window.blockcraft.state==='menu');
  await page.reload();await page.waitForFunction(()=>!!window.blockcraft);
  await page.getByRole('button',{name:'Um Jogador',exact:true}).click();await page.locator(`[data-play="${expected.id}"]`).click();
  await page.waitForFunction(()=>window.blockcraft.state==='dead');await page.screenshot({path:'artifacts/death.png'});
  assert.equal(await evaluate(()=>window.blockcraft.player.health),0);
  await page.locator('#respawn').click();await page.waitForFunction(()=>window.blockcraft.state==='playing');
  assert.equal(await evaluate(()=>window.blockcraft.player.health),20);
  assert.equal(await evaluate(()=>{const g=window.blockcraft;return g.player.collides(...g.player.position.toArray());}),false);
  passed('A dead survival save reopens at the death screen and respawns safely through the real UI');
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(externalRequests,[]);report.success=true;console.log('Comprehensive browser acceptance passed.');
  }
}catch(error){
  report.success=false;report.failure={stage,message:error.message,stack:error.stack};try{await page.screenshot({path:'artifacts/acceptance-failure.png'});}catch{}throw error;
}finally{await writeFile(diagnosticsOnly?'artifacts/browser-resources.json':'artifacts/browser-acceptance.json',JSON.stringify(report,null,2));await browser.close();}
