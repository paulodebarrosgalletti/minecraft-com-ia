import { B } from './shared';

export interface BlockDef {
  id:number; name:string; solid:boolean; transparent:boolean; hardness:number;
  tool?:'pickaxe'|'axe'|'shovel'; tier?:number; drop?:string; color:number;
}
export interface ItemDef {
  id:string; name:string; block?:number; stack:number; tool?:string; tier?:number;
  speed?:number; damage?:number; durability?:number; food?:number; color:number; category:string;
}

export const BLOCKS:Record<number,BlockDef> = {};
export const ITEMS:Record<string,ItemDef> = {};
const blockItems = new Map<number,string>();
function block(id:B,item:string,name:string,color:number,hardness:number,tool?:BlockDef['tool'],tier?:number,options:Partial<BlockDef>={},category='Natureza') {
  BLOCKS[id]={id,name,color,hardness,solid:true,transparent:false,tool,tier,drop:item,...options};
  if (id!==B.Air) {
    ITEMS[item]={id:item,name,color,block:id,stack:64,category};
    blockItems.set(id,item);
  }
}
block(B.Air,'air','Ar',0xffffff,0,undefined,undefined,{solid:false,transparent:true,drop:undefined});
block(B.Grass,'grass','Bloco de grama',0x72ad46,.6,'shovel',undefined,{drop:'dirt'});
block(B.Dirt,'dirt','Terra',0x896043,.5,'shovel');
block(B.Stone,'stone','Pedra',0x85888c,1.5,'pickaxe',1,{drop:'cobble'});
block(B.Cobble,'cobble','Pedregulho',0x77797c,2,'pickaxe',1,{},'Construção');
block(B.Sand,'sand','Areia',0xe6dba0,.5,'shovel');
block(B.Sandstone,'sandstone','Arenito',0xdac88f,.8,'pickaxe',1,{},'Construção');
block(B.Gravel,'gravel','Cascalho',0x9c9790,.6,'shovel');
block(B.Bedrock,'bedrock','Rocha matriz',0x46454b,Infinity,undefined,undefined,{drop:undefined});
block(B.Snow,'snow','Neve',0xe9f4ff,.3,'shovel');
block(B.Water,'water','Água',0x3589ce,100,undefined,undefined,{solid:false,transparent:true,drop:undefined});
block(B.OakLog,'oak_log','Tronco de carvalho',0x79583a,2,'axe',undefined,{},'Madeira');
block(B.Planks,'planks','Tábuas de carvalho',0xbe945d,2,'axe',undefined,{},'Madeira');
block(B.BirchLog,'birch_log','Tronco de bétula',0xd7d6bf,2,'axe',undefined,{},'Madeira');
block(B.BirchPlanks,'birch_planks','Tábuas de bétula',0xd8c38e,2,'axe',undefined,{},'Madeira');
block(B.Leaves,'leaves','Folhas de carvalho',0x4f963f,.2,undefined,undefined,{transparent:true});
block(B.CoalOre,'coal_ore','Minério de carvão',0x5b5c5b,3,'pickaxe',1,{drop:'coal'},'Minérios');
block(B.IronOre,'iron_ore','Minério de ferro',0xad9580,3,'pickaxe',2,{drop:'raw_iron'},'Minérios');
block(B.GoldOre,'gold_ore','Minério de ouro',0xd6b649,3,'pickaxe',3,{drop:'raw_gold'},'Minérios');
block(B.DiamondOre,'diamond_ore','Minério de diamante',0x59d9d1,3,'pickaxe',3,{drop:'diamond'},'Minérios');
block(B.StoneBricks,'stone_bricks','Tijolos de pedra',0x909292,1.5,'pickaxe',1,{},'Construção');
block(B.Glass,'glass','Vidro',0xb4e7ed,.3,undefined,undefined,{transparent:true},'Construção');
block(B.Bricks,'bricks','Tijolos',0xb46954,2,'pickaxe',1,{},'Construção');
block(B.Slab,'slab','Laje de madeira',0xbb915c,2,'axe',undefined,{},'Construção');
block(B.Stairs,'stairs','Escada de madeira',0xb48a54,2,'axe',undefined,{},'Construção');
block(B.Torch,'torch','Tocha',0xffcf62,0,undefined,undefined,{solid:false,transparent:true},'Utilidades');
block(B.Workbench,'workbench','Bancada de trabalho',0xac7a43,2.5,'axe',undefined,{},'Utilidades');
block(B.Furnace,'furnace','Fornalha',0x727477,3.5,'pickaxe',1,{},'Utilidades');
block(B.Chest,'chest','Baú',0xb77e35,2.5,'axe',undefined,{},'Utilidades');
block(B.Door,'door','Porta de madeira',0xb68d50,2,'axe',undefined,{transparent:true},'Utilidades');
block(B.Bed,'bed','Cama',0xc34c43,.3,'axe',undefined,{transparent:true},'Utilidades');
block(B.Cactus,'cactus','Cacto',0x428448,.4);
block(B.FlowerRed,'flower_red','Papoula',0xe9584d,0,undefined,undefined,{solid:false,transparent:true},'Decoração');
block(B.FlowerYellow,'flower_yellow','Dente-de-leão',0xf8d442,0,undefined,undefined,{solid:false,transparent:true},'Decoração');
block(B.TallGrass,'tall_grass','Grama alta',0x74a942,0,undefined,undefined,{solid:false,transparent:true},'Decoração');
block(B.Sapling,'sapling','Muda de carvalho',0x6bab4b,0,undefined,undefined,{solid:false,transparent:true});
block(B.SpruceLog,'spruce_log','Tronco de pinheiro',0x644c36,2,'axe',undefined,{},'Madeira');
block(B.SpruceLeaves,'spruce_leaves','Folhas de pinheiro',0x3e7955,.2,undefined,undefined,{transparent:true});

function item(id:string,name:string,color:number,category:string,extra:Partial<ItemDef>={}) {
  ITEMS[id]={id,name,color,category,stack:64,...extra};
}
item('stick','Graveto',0xa7804b,'Madeira');
item('coal','Carvão',0x33343a,'Minérios');
item('charcoal','Carvão vegetal',0x444047,'Minérios');
item('raw_iron','Ferro bruto',0xc89e7f,'Minérios');
item('raw_gold','Ouro bruto',0xe2bd4b,'Minérios');
item('iron_ingot','Barra de ferro',0xd9dce1,'Minérios');
item('gold_ingot','Barra de ouro',0xf8d457,'Minérios');
item('diamond','Diamante',0x5ae4d9,'Minérios');
item('wool','Lã',0xf4f0e2,'Utilidades');
item('leather','Couro',0xa66940,'Utilidades');
item('feather','Pena',0xeee8de,'Utilidades');
item('string','Linha',0xe9e8e2,'Utilidades');
item('bone','Osso',0xe9e6d8,'Utilidades');
item('gunpowder','Pólvora',0x56535b,'Utilidades');
item('rotten_flesh','Carne podre',0x99613f,'Comida',{food:2});
item('apple','Maçã',0xd84a37,'Comida',{food:4});
item('raw_meat','Carne crua',0xc87772,'Comida',{food:3});
item('cooked_meat','Carne assada',0x9d5436,'Comida',{food:8});
item('raw_beef','Carne bovina crua',0xc85f58,'Comida',{food:3});
item('cooked_beef','Bife assado',0x9a5032,'Comida',{food:8});
item('raw_pork','Carne suína crua',0xe5a096,'Comida',{food:3});
item('cooked_pork','Carne suína assada',0xb5764c,'Comida',{food:8});
item('raw_chicken','Frango cru',0xe6b9ac,'Comida',{food:2});
item('cooked_chicken','Frango assado',0xc28c55,'Comida',{food:6});
item('wheat','Trigo',0xd3b64a,'Comida');
item('seeds','Sementes',0x718d38,'Natureza');
item('bread','Pão',0xcd9c4f,'Comida',{food:5});
item('brick','Tijolo',0xb96b52,'Construção');
item('clay','Argila',0xa7b4c5,'Construção');

const materials=[
  {id:'wood',name:'madeira',color:0xb58a4e,tier:1,speed:2,durability:59,damage:4},
  {id:'stone',name:'pedra',color:0x93969c,tier:2,speed:4,durability:131,damage:5},
  {id:'iron',name:'ferro',color:0xd4dce0,tier:3,speed:6,durability:250,damage:6},
  {id:'gold',name:'ouro',color:0xf4d04c,tier:1,speed:12,durability:32,damage:4},
  {id:'diamond',name:'diamante',color:0x56dcd4,tier:4,speed:8,durability:1561,damage:7},
];
for(const m of materials) for(const [tool,name] of [['pickaxe','Picareta'],['axe','Machado'],['shovel','Pá'],['sword','Espada']]) {
  item(`${m.id}_${tool}`,`${name} de ${m.name}`,m.color,'Ferramentas',{
    stack:1,tool,tier:m.tier,speed:m.speed,durability:m.durability,
    damage:tool==='sword'?m.damage:tool==='axe'?m.damage+1:tool==='pickaxe'?m.damage-2:m.damage-2.5,
  });
}

export function getBlockDef(id:number):BlockDef { return BLOCKS[id] ?? BLOCKS[B.Air]; }
export function blockItem(block:number):string|undefined { return blockItems.get(block); }
export function getItem(id:string):ItemDef {
  return ITEMS[id] ?? {id,name:id,stack:64,color:0xff00ff,category:'Desconhecido'};
}
