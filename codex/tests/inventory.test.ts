import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, RECIPES, craftGrid, matchRecipe, quickCraft, updateFurnace, validStack, SMELT_TIME } from '../src/inventory';
import { B } from '../src/shared';
import type { FurnaceData, SaveData, Slot } from '../src/shared';
import { BLOCKS, ITEMS, blockItem } from '../src/registry';
import { SaveManager, validateSave } from '../src/storage';

const grid=(size:number,values:Record<number,string|[string,number]>):Slot[]=>Array.from({length:size*size},(_,i)=>{
  const v=values[i];return !v?null:typeof v==='string'?{id:v,count:1}:{id:v[0],count:v[1]};
});
const newSave=(id='test-world'):SaveData=>({version:1,
  config:{id,name:'Teste',seed:'deterministic-seed',mode:'survival',difficulty:'normal',type:'default',created:1,lastPlayed:2},
  player:{x:0,y:48,z:0,yaw:0,pitch:0,health:20,hunger:20,inventory:new Inventory().slots,selected:0,spawn:[0,48,0],flying:false},
  time:100,edits:{'1,47,1':B.Planks,'2,47,1':B.Air},chests:{'1,48,1':Array(27).fill(null)},
  furnaces:{'2,48,1':{slots:[{id:'raw_iron',count:2},{id:'coal',count:1},null],burn:0,progress:0}},doors:{'3,48,1':true},
});

test('survival inventory starts with 36 empty slots; loaded stacks are detached and validated',()=>{
  const inv=new Inventory();assert.equal(inv.slots.length,36);assert.ok(inv.slots.every(s=>s===null));
  const source:Slot[]=[{id:'stone',count:12},{id:'stone',count:100},{id:'made_up',count:1}];
  const loaded=new Inventory(source);assert.deepEqual(loaded.slots.slice(0,3),[{id:'stone',count:12},null,null]);
  source[0]!.count=1;assert.equal(loaded.count('stone'),12);
});
test('stack insertion, full inventory, atomic removal, and capacity checks conserve items',()=>{
  const inv=new Inventory();assert.equal(inv.add('dirt',130),0);
  assert.deepEqual(inv.slots.slice(0,3).map(s=>s?.count),[64,64,2]);
  assert.equal(inv.remove('dirt',131),false);assert.equal(inv.count('dirt'),130);
  assert.equal(inv.remove('dirt',65),true);assert.equal(inv.count('dirt'),65);
  const full=new Inventory(Array.from({length:36},()=>({id:'stone',count:64})));
  assert.equal(full.canAdd('dirt',1),false);assert.equal(full.add('dirt',2),2);assert.equal(full.count('stone'),2304);
  assert.equal(full.add('unknown',3),3);assert.equal(inv.consumeSlot(99),false);
  assert.equal(inv.remove('dirt',-1),false);assert.equal(inv.add('dirt',NaN),NaN);
});
test('tools never stack, retain durability, and disappear exactly when broken',()=>{
  const inv=new Inventory();assert.equal(inv.add('wood_pickaxe',2,2),0);
  assert.equal(inv.slots[0]?.count,1);assert.equal(inv.slots[1]?.count,1);
  inv.damageTool(0);assert.equal(inv.slots[0]?.durability,1);
  inv.damageTool(0);assert.equal(inv.slots[0],null);assert.equal(inv.count('wood_pickaxe'),1);
  assert.equal(inv.add('wood_pickaxe',1,NaN),1);assert.equal(inv.count('wood_pickaxe'),1);
});
test('crafting accepts offsets and mirrors and consumes exactly one of each ingredient',()=>{
  const logs=grid(2,{3:['oak_log',2]});assert.deepEqual(craftGrid(logs,2),{id:'planks',count:4});
  assert.equal(logs[3]?.count,1);
  const mirrored=grid(3,{0:'birch_planks',1:'planks',3:'stick',4:'birch_planks',6:'stick'});
  const match=matchRecipe(mirrored,3);assert.equal(match?.recipe.id,'wood_axe');
  const result=craftGrid(mirrored,3);assert.equal(result?.id,'wood_axe');assert.ok(result?.durability);
  assert.ok(mirrored.every(s=>s===null));
  const extra=grid(2,{0:'oak_log',1:'stick'}),snapshot=JSON.stringify(extra);
  assert.equal(craftGrid(extra,2),null);assert.equal(JSON.stringify(extra),snapshot);
});
test('quick crafting enforces workbench access, handles mixed planks, and is atomic when full',()=>{
  const inv=new Inventory();inv.add('planks',2);inv.add('birch_planks',1);inv.add('stick',2);
  assert.equal(quickCraft(inv,'wood_pickaxe',false),false);assert.equal(inv.count('stick'),2);
  assert.equal(quickCraft(inv,'wood_pickaxe',true),true);assert.equal(inv.count('stick'),0);assert.equal(inv.count('wood_pickaxe'),1);
  const full=new Inventory(Array.from({length:36},()=>({id:'stone',count:64})));
  full.slots[0]={id:'oak_log',count:2};const before=JSON.stringify(full.slots);
  assert.equal(quickCraft(full,'planks',false),false);assert.equal(JSON.stringify(full.slots),before);
  full.slots[0]={id:'oak_log',count:1};assert.equal(quickCraft(full,'planks',false),true);assert.equal(full.count('planks'),4);
});
test('every recipe conserves its listed ingredients and produces a valid stack',()=>{
  for(const recipe of RECIPES) {
    const inv=new Inventory();for(const id of recipe.pattern.flat().filter(Boolean))inv.add(id,1);
    assert.equal(quickCraft(inv,recipe.id,true),true,recipe.id);
    assert.equal(inv.slots.filter(Boolean).length,1,recipe.id);
    assert.deepEqual(inv.slots.find(Boolean),recipe.output,recipe.id);
  }
});
test('furnaces smelt ores and meat, consume fuel once, and handle several smelts per update',()=>{
  const furnace:FurnaceData={slots:[{id:'raw_iron',count:3},{id:'coal',count:2},null],burn:0,progress:0};
  updateFurnace(furnace,SMELT_TIME*3+1);
  assert.equal(furnace.slots[0],null);assert.equal(furnace.slots[1]?.count,1);
  assert.deepEqual(furnace.slots[2],{id:'iron_ingot',count:3});assert.equal(furnace.burn,55);
  furnace.slots[0]={id:'raw_meat',count:1};furnace.slots[2]=null;updateFurnace(furnace,SMELT_TIME);
  assert.deepEqual(furnace.slots[2],{id:'cooked_meat',count:1});
  const sticks:FurnaceData={slots:[{id:'sand',count:1},{id:'stick',count:2},null],burn:0,progress:0};
  updateFurnace(sticks,8);assert.deepEqual(sticks.slots[2],{id:'glass',count:1});assert.equal(sticks.slots[1],null);assert.equal(sticks.burn,2);
});
test('furnaces never burn new fuel for invalid input or blocked output',()=>{
  for(const slots of [
    [{id:'dirt',count:3},{id:'coal',count:1},null],
    [{id:'raw_gold',count:3},{id:'coal',count:1},{id:'gold_ingot',count:64}],
    [{id:'raw_gold',count:3},{id:'coal',count:1},{id:'glass',count:1}],
  ] as Slot[][]) {
    const f={slots,burn:0,progress:0},before=JSON.stringify(f);updateFurnace(f,100);assert.equal(JSON.stringify(f),before);
  }
  const noFuel:FurnaceData={slots:[{id:'sand',count:1},null,null],burn:0,progress:0};
  updateFurnace(noFuel,100);assert.equal(noFuel.slots[0]?.count,1);assert.equal(noFuel.progress,0);
});
test('registries cover every block with valid drops and enforce tool progression',()=>{
  for(const b of Object.values(BLOCKS)){if(b.drop)assert.ok(ITEMS[b.drop],b.name);if(b.id!==B.Air)assert.ok(blockItem(b.id));}
  assert.equal(BLOCKS[B.IronOre].drop,'raw_iron');assert.equal(BLOCKS[B.GoldOre].drop,'raw_gold');
  assert.ok(ITEMS.iron_pickaxe.tier!>ITEMS.stone_pickaxe.tier!);assert.ok(ITEMS.diamond_pickaxe.durability!>ITEMS.iron_pickaxe.durability!);
});
test('save validation rejects malformed player, unknown items, missing blocks, and broken furnace data',()=>{
  assert.doesNotThrow(()=>validateSave(newSave()));
  const mutations=[
    (s:SaveData)=>{s.player.x=NaN;},(s:SaveData)=>{s.player.inventory[0]={id:'hacked',count:1};},
    (s:SaveData)=>{s.player.inventory[0]={id:'dirt',count:100};},(s:SaveData)=>{s.edits['0,1,0']=999;},
    (s:SaveData)=>{s.furnaces['2,48,1'].progress=Infinity;},(s:SaveData)=>{s.chests['1,48,1']=[];},
    (s:SaveData)=>{s.player.selected=10;},(s:SaveData)=>{(s as unknown as {version:number}).version=2;},
  ];
  for(const mutate of mutations){const save=newSave();mutate(save);assert.throws(()=>validateSave(save),/inválido/);}
  assert.equal(validStack({id:'__proto__',count:1}),false);assert.equal(validStack({id:'stone',count:-1}),false);
});
test('local persistence preserves worlds independently and rejects corruption without overwriting saves',async()=>{
  const memory=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v),
    removeItem:(k:string)=>memory.delete(k),clear:()=>memory.clear(),key:(i:number)=>[...memory.keys()][i]??null,get length(){return memory.size;},
  }});
  const one=newSave('one'),two=newSave('two');two.config.lastPlayed=3;one.player.inventory[0]={id:'diamond',count:3};
  await SaveManager.save(one);await SaveManager.save(two);
  assert.deepEqual((await SaveManager.list()).map(s=>s.config.id),['two','one']);
  const loaded=await SaveManager.load('one');assert.deepEqual(loaded,one);
  loaded!.player.inventory[0]!.count=9;assert.equal((await SaveManager.load('one'))?.player.inventory[0]?.count,3);
  one.player.inventory[0]!.count=999;await assert.rejects(SaveManager.save(one),/inválido/);
  assert.equal((await SaveManager.load('one'))?.player.inventory[0]?.count,3);
  await SaveManager.delete('one');assert.equal(await SaveManager.load('one'),undefined);assert.ok(await SaveManager.load('two'));
  memory.set('blockcraft-worlds-v1','broken-json');await assert.rejects(SaveManager.list(),/corrompido/);
  memory.clear();delete (globalThis as {localStorage?:Storage}).localStorage;
});
