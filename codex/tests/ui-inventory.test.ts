import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui';
import { Inventory, matchRecipe } from '../src/inventory';
import type { Slot } from '../src/shared';

// Exercise the real interaction methods without requiring WebGL or a DOM renderer.
function fixture(){
  const drops:unknown[]=[],messages:string[]=[];
  const game={inventory:new Inventory(),creative:false,selected:0,state:'inventory',
    chests:{container:Array(27).fill(null) as Slot[]},
    furnaces:{container:{slots:[null,null,null] as Slot[],burn:0,progress:0}},
    player:{position:{x:0,y:40,z:0}},audio:{play(){}},refreshHeld(){},
    drop(...args:unknown[]){drops.push(args);},
  };
  const ui:any=Object.assign(Object.create(UI.prototype),{game,grid:Array(4).fill(null),carried:null,kind:'inventory',containerKey:'container',
    renderInventory(){},updateCursor(){},toast(message:string){messages.push(message);},
  });
  return {ui,game,drops,messages};
}
function button(ui:any,area:string,index:number){
  const element:any={dataset:{area,index:String(index)}};
  ui.overlay={querySelectorAll(){return [element];}};ui.bindSlots();
  return {left(shiftKey=false){element.onclick({shiftKey});},right(shiftKey=false){element.oncontextmenu({shiftKey,preventDefault(){}});}};
}
const total=(arrays:Slot[][],id:string)=>arrays.flat().reduce((n,s)=>n+(s?.id===id?s.count:0),0);

test('recipe book fills mixed wooden recipes and preserves the carried stack',()=>{
  const {ui,game}=fixture();game.inventory.add('planks',2);game.inventory.add('birch_planks',2);ui.carried={id:'stick',count:7};
  assert.equal(ui.canRecipe('workbench'),true);ui.fillRecipe('workbench');
  assert.equal(matchRecipe(ui.grid,2)?.output.id,'workbench');
  assert.equal(total([ui.grid],'birch_planks'),2);assert.equal(total([ui.grid],'planks'),2);
  assert.equal(game.inventory.count('planks')+game.inventory.count('birch_planks'),0);
  assert.deepEqual(ui.carried,{id:'stick',count:7});
});
test('recipe replacement is atomic when displaced grid items cannot fit the backpack',()=>{
  const {ui,game,drops,messages}=fixture();
  game.inventory=new Inventory(Array.from({length:36},()=>({id:'stone',count:64})));
  game.inventory.slots[0]={id:'planks',count:5};ui.grid[0]={id:'dirt',count:1};ui.carried={id:'wood_pickaxe',count:1,durability:2};
  const before=JSON.stringify({inventory:game.inventory.slots,grid:ui.grid,carried:ui.carried});
  assert.equal(ui.canRecipe('workbench'),true);ui.fillRecipe('workbench');
  assert.equal(JSON.stringify({inventory:game.inventory.slots,grid:ui.grid,carried:ui.carried}),before);
  assert.equal(drops.length,0);assert.ok(messages.length);
  game.inventory.slots[0]!.count=4;ui.fillRecipe('workbench');
  assert.equal(matchRecipe(ui.grid,2)?.output.id,'workbench');assert.equal(game.inventory.count('dirt'),1);
});
test('unavailable or wrong-workbench recipes leave existing inputs unchanged',()=>{
  const {ui,game,drops}=fixture();ui.grid[3]={id:'oak_log',count:2};game.inventory.add('stick',1);
  const before=JSON.stringify([game.inventory.slots,ui.grid]);
  ui.fillRecipe('wood_pickaxe');assert.equal(JSON.stringify([game.inventory.slots,ui.grid]),before);assert.equal(drops.length,0);
  assert.equal(ui.canRecipe('missing-recipe'),false);ui.fillRecipe('missing-recipe');
  assert.equal(JSON.stringify([game.inventory.slots,ui.grid]),before);
});
test('craft output refuses an incompatible or full cursor before consuming ingredients',()=>{
  const {ui}=fixture();ui.grid[0]={id:'oak_log',count:2};ui.carried={id:'planks',count:62};
  ui.takeCraft();assert.equal(ui.grid[0].count,2);assert.equal(ui.carried.count,62);
  ui.carried={id:'dirt',count:1};ui.takeCraft();assert.equal(ui.grid[0].count,2);
  ui.carried=null;ui.takeCraft();assert.equal(ui.grid[0].count,1);assert.deepEqual(ui.carried,{id:'planks',count:4});
});
test('repeated shift transfers between chest and backpack conserve partial stacks',()=>{
  const {ui,game}=fixture();ui.kind='chest';game.inventory.slots[0]={id:'stone',count:10};
  game.chests.container=Array.from({length:27},()=>({id:'dirt',count:64}));game.chests.container[0]={id:'stone',count:60};
  ui.transfer(game.inventory.slots,0,'inv');
  assert.equal(game.chests.container[0]?.count,64);assert.equal(game.inventory.slots[0]?.count,6);
  assert.equal(total([game.inventory.slots,game.chests.container],'stone'),70);
  for(let i=0;i<20;i++){ui.transfer(game.chests.container,0,'chest');ui.transfer(game.inventory.slots,0,'inv');}
  assert.equal(total([game.inventory.slots,game.chests.container],'stone'),70);
});
test('hotbar and backpack shifts never merge a stack into itself or reset tool durability',()=>{
  const {ui,game}=fixture();game.inventory.add('wood_pickaxe',1,3);game.inventory.slots[1]={id:'dirt',count:42};
  for(let i=0;i<20;i++){
    const index=game.inventory.slots.findIndex(s=>s?.id==='wood_pickaxe');ui.transfer(game.inventory.slots,index,'inv');
    const dirt=game.inventory.slots.findIndex(s=>s?.id==='dirt');ui.transfer(game.inventory.slots,dirt,'inv');
  }
  assert.equal(game.inventory.count('wood_pickaxe'),1);assert.equal(game.inventory.count('dirt'),42);
  assert.equal(game.inventory.slots.find(s=>s?.id==='wood_pickaxe')?.durability,3);
});
test('furnace shift routing accepts input and fuel, excludes output, and resets removed-input progress',()=>{
  const {ui,game}=fixture();ui.kind='furnace';const f=game.furnaces.container;
  game.inventory.add('raw_iron',3);game.inventory.add('coal',2);game.inventory.add('dirt',4);
  for(let i=0;i<3;i++)ui.transfer(game.inventory.slots,i,'inv');
  assert.deepEqual(f.slots,[{id:'raw_iron',count:3},{id:'coal',count:2},null]);assert.equal(game.inventory.count('dirt'),4);
  f.progress=3;ui.transfer(f.slots,0,'furnace');assert.equal(f.progress,0);assert.equal(game.inventory.count('raw_iron'),3);
});
test('slot clicks split and merge stacks while furnace output only allows extraction',()=>{
  const {ui,game}=fixture();game.inventory.slots[0]={id:'dirt',count:9};const inv=button(ui,'inv',0);
  inv.right();assert.equal(ui.carried.count,5);assert.equal(game.inventory.slots[0]?.count,4);
  inv.right();assert.equal(ui.carried.count,4);assert.equal(game.inventory.slots[0]?.count,5);
  inv.left();assert.equal(ui.carried,null);assert.equal(game.inventory.slots[0]?.count,9);
  ui.kind='furnace';game.furnaces.container.slots[2]={id:'iron_ingot',count:4};ui.carried={id:'iron_ingot',count:62};
  const output=button(ui,'furnace',2);output.left();assert.equal(ui.carried.count,64);assert.equal(game.furnaces.container.slots[2]?.count,2);
  output.left();assert.equal(game.furnaces.container.slots[2]?.count,2);
  ui.carried={id:'dirt',count:3};output.left();assert.equal(game.furnaces.container.slots[2]?.count,2);assert.equal(ui.carried.count,3);
  const fuel=button(ui,'furnace',1);fuel.left();assert.equal(game.furnaces.container.slots[1],null);assert.equal(ui.carried.count,3);
});
test('closing inventory returns the entire grid and worn cursor tool once',()=>{
  const {ui,game,drops}=fixture();ui.grid[0]={id:'oak_log',count:2};ui.grid[3]={id:'stick',count:5};ui.carried={id:'stone_axe',count:1,durability:7};
  ui.returnCraft();ui.returnCraft();assert.equal(game.inventory.count('oak_log'),2);assert.equal(game.inventory.count('stick'),5);
  assert.equal(game.inventory.count('stone_axe'),1);assert.equal(game.inventory.slots.find(s=>s?.id==='stone_axe')?.durability,7);
  assert.ok(ui.grid.every((s:Slot)=>s===null));assert.equal(ui.carried,null);assert.equal(drops.length,0);
});
