import type { FurnaceData, Slot, Stack } from './shared';
import { ITEMS } from './registry';

const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export function validStack(value:unknown):value is Stack {
  if(!value || typeof value!=='object') return false;
  const s=value as Stack;
  if(typeof s.id!=='string'||!Object.hasOwn(ITEMS,s.id))return false;
  const def=ITEMS[s.id];
  return !!def && integer(s.count) && s.count>0 && s.count<=def.stack &&
    (s.durability===undefined || (!!def.durability && integer(s.durability) && s.durability>0 && s.durability<=def.durability));
}
const cloneStack=(s:Slot):Slot=>s?{...s}:null;
const normalize=(s:Slot):Slot=>validStack(s)?{...s,...(ITEMS[s.id].durability?{durability:s.durability??ITEMS[s.id].durability}:{})}:null;
export class Inventory {
  public slots:Slot[];
  constructor(slots:Slot[]=[]){this.slots=Array.from({length:36},(_,i)=>normalize(slots[i]??null));}
  count(id:string):number {return this.slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0);}
  add(id:string,count:number,durability?:number):number {
    const def=ITEMS[id];
    if(!Object.hasOwn(ITEMS,id)||!def||!integer(count)||(durability!==undefined&&(!integer(durability)||durability<=0)))return count;
    let left=count;
    const health=def.durability?Math.max(1,Math.min(def.durability,Math.floor(durability??def.durability))):undefined;
    if(def.stack>1) for(const s of this.slots) if(s?.id===id&&s.durability===health&&s.count<def.stack) {
      const n=Math.min(left,def.stack-s.count);s.count+=n;left-=n;if(!left)return 0;
    }
    for(let i=0;i<this.slots.length&&left;i++) if(!this.slots[i]) {
      const n=Math.min(left,def.stack);this.slots[i]={id,count:n,...(health===undefined?{}:{durability:health})};left-=n;
    }
    return left;
  }
  canAdd(id:string,count:number):boolean {
    if(!ITEMS[id]||!integer(count))return false;
    const preview=new Inventory(this.slots);return preview.add(id,count)===0;
  }
  remove(id:string,count:number):boolean {
    if(!integer(count)||this.count(id)<count)return false;
    let left=count;
    for(let i=0;i<this.slots.length&&left;i++) {
      const s=this.slots[i];if(s?.id!==id)continue;
      const n=Math.min(left,s.count);s.count-=n;left-=n;if(!s.count)this.slots[i]=null;
    }
    return true;
  }
  consumeSlot(index:number,count=1):boolean {
    const s=this.slots[index];if(!integer(index)||!integer(count)||!s||s.count<count)return false;
    s.count-=count;if(!s.count)this.slots[index]=null;return true;
  }
  damageTool(index:number):void {
    const s=this.slots[index];if(!s)return;
    const max=ITEMS[s.id]?.durability;if(!max)return;
    s.durability=(s.durability??max)-1;if(s.durability<=0)this.slots[index]=null;
  }
}

export interface Recipe {id:string;name:string;pattern:string[][];output:Stack;table:boolean}
export const RECIPES:Recipe[]=[];
function recipe(id:string,pattern:string[][],output:string,count=1,table=pattern.length>2||pattern.some(r=>r.length>2)) {
  RECIPES.push({id,name:ITEMS[output].name,pattern,output:{id:output,count,...(ITEMS[output].durability?{durability:ITEMS[output].durability}:{})},table});
}
recipe('planks',[['oak_log']],'planks',4);
recipe('birch_planks',[['birch_log']],'birch_planks',4);
recipe('spruce_planks',[['spruce_log']],'planks',4);
recipe('stick',[['planks'],['planks']],'stick',4);
recipe('workbench',[['planks','planks'],['planks','planks']],'workbench');
recipe('torch',[['coal'],['stick']],'torch',4);
recipe('charcoal_torch',[['charcoal'],['stick']],'torch',4);
recipe('furnace',[['cobble','cobble','cobble'],['cobble','','cobble'],['cobble','cobble','cobble']],'furnace');
recipe('chest',[['planks','planks','planks'],['planks','','planks'],['planks','planks','planks']],'chest');
recipe('bed',[['wool','wool','wool'],['planks','planks','planks']],'bed');
recipe('door',[['planks','planks'],['planks','planks'],['planks','planks']],'door',3);
recipe('slab',[['planks','planks','planks']],'slab',6);
recipe('stairs',[['planks','',''],['planks','planks',''],['planks','planks','planks']],'stairs',4);
recipe('stone_bricks',[['stone','stone'],['stone','stone']],'stone_bricks',4);
recipe('bricks',[['brick','brick'],['brick','brick']],'bricks');
recipe('wool',[['string','string'],['string','string']],'wool');
recipe('bread',[['wheat','wheat','wheat']],'bread');
for(const [material,ingredient] of [['wood','planks'],['stone','cobble'],['iron','iron_ingot'],['gold','gold_ingot'],['diamond','diamond']]) {
  recipe(`${material}_pickaxe`,[[ingredient,ingredient,ingredient],['','stick',''],['','stick','']],`${material}_pickaxe`);
  recipe(`${material}_axe`,[[ingredient,ingredient], [ingredient,'stick'],['','stick']],`${material}_axe`);
  recipe(`${material}_shovel`,[[ingredient],['stick'],['stick']],`${material}_shovel`);
  recipe(`${material}_sword`,[[ingredient],[ingredient],['stick']],`${material}_sword`);
}

// Wooden recipes accept either plank species, including mixtures.
const ingredientMatches=(ingredient:string,id:string)=>ingredient===id || (ingredient==='planks'&&id==='birch_planks');
export function matchRecipe(grid:Slot[],size:number):{recipe:Recipe;output:Stack;indices:number[]}|null {
  if((size!==2&&size!==3)||grid.length!==size*size||grid.some(s=>s!==null&&!validStack(s)))return null;
  const occupied=grid.map((s,i)=>s?i:-1).filter(i=>i>=0);if(!occupied.length)return null;
  const left=Math.min(...occupied.map(i=>i%size)),right=Math.max(...occupied.map(i=>i%size));
  const top=Math.min(...occupied.map(i=>Math.floor(i/size))),bottom=Math.max(...occupied.map(i=>Math.floor(i/size)));
  const width=right-left+1,height=bottom-top+1;
  for(const r of RECIPES) {
    if(r.table&&size<3)continue;
    if(r.pattern.length!==height||r.pattern[0].length!==width)continue;
    for(const mirror of [false,true]) {
      let match=true;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const ingredient=r.pattern[y][mirror?width-1-x:x]??'',s=grid[(top+y)*size+left+x];
        if(ingredient?(!s||!ingredientMatches(ingredient,s.id)):!!s)match=false;
      }
      if(match)return {recipe:r,output:{...r.output},indices:occupied};
    }
  }
  return null;
}
export function craftGrid(grid:Slot[],size:number):Stack|null {
  const match=matchRecipe(grid,size);if(!match)return null;
  for(const index of match.indices){const s=grid[index]!;s.count--;if(!s.count)grid[index]=null;}
  return {...match.output};
}
export function quickCraft(inventory:Inventory,recipeId:string,table:boolean):boolean {
  const r=RECIPES.find(r=>r.id===recipeId);if(!r||(r.table&&!table))return false;
  const preview=new Inventory(inventory.slots);
  for(const ingredient of r.pattern.flat().filter(Boolean)) {
    const index=preview.slots.findIndex(s=>s&&ingredientMatches(ingredient,s.id));
    if(index<0)return false;preview.consumeSlot(index);
  }
  if(preview.add(r.output.id,r.output.count,r.output.durability))return false;
  inventory.slots.splice(0,inventory.slots.length,...preview.slots.map(cloneStack));return true;
}

export const SMELT_TIME=8;
export const FUELS:Record<string,number>={coal:80,charcoal:80,oak_log:15,birch_log:15,spruce_log:15,planks:15,birch_planks:15,stick:5,workbench:15,chest:15,door:10,sapling:5};
export const SMELTING:Record<string,string>={raw_iron:'iron_ingot',iron_ore:'iron_ingot',raw_gold:'gold_ingot',gold_ore:'gold_ingot',sand:'glass',cobble:'stone',oak_log:'charcoal',birch_log:'charcoal',spruce_log:'charcoal',raw_meat:'cooked_meat',raw_beef:'cooked_beef',raw_pork:'cooked_pork',raw_chicken:'cooked_chicken',clay:'brick'};
export function updateFurnace(data:FurnaceData,dt:number):void {
  if(!Number.isFinite(dt)||dt<=0)return;
  data.slots=Array.from({length:3},(_,i)=>normalize(data.slots?.[i]??null));
  data.burn=Number.isFinite(data.burn)?Math.max(0,data.burn):0;
  data.progress=Number.isFinite(data.progress)?Math.max(0,Math.min(SMELT_TIME,data.progress)):0;
  let remaining=dt;
  while(remaining>1e-8) {
    const input=data.slots[0],output=data.slots[2],result=input?SMELTING[input.id]:undefined;
    const canSmelt=!!result&&(!output||(output.id===result&&output.count<ITEMS[result].stack));
    if(!canSmelt){data.progress=0;data.burn=Math.max(0,data.burn-remaining);break;}
    if(data.burn<=1e-8) {
      const fuel=data.slots[1],seconds=fuel?FUELS[fuel.id]:0;
      if(!seconds)break;
      data.burn=seconds;fuel!.count--;if(!fuel!.count)data.slots[1]=null;
    }
    const step=Math.min(remaining,data.burn,SMELT_TIME-data.progress);
    data.burn-=step;data.progress+=step;remaining-=step;
    if(data.progress>=SMELT_TIME-1e-8) {
      input!.count--;if(!input!.count)data.slots[0]=null;
      if(output)output.count++;else data.slots[2]={id:result!,count:1};
      data.progress=0;
    }
  }
}
