export enum B { Air,Grass,Dirt,Stone,Cobble,Sand,Sandstone,Gravel,Bedrock,Snow,Water,OakLog,Planks,BirchLog,BirchPlanks,Leaves,CoalOre,IronOre,GoldOre,DiamondOre,StoneBricks,Glass,Bricks,Slab,Stairs,Torch,Workbench,Furnace,Chest,Door,Bed,Cactus,FlowerRed,FlowerYellow,TallGrass,Sapling,SpruceLog,SpruceLeaves }
export type Mode='survival'|'creative';
export type Difficulty='peaceful'|'easy'|'normal'|'hard';
export type Stack={id:string;count:number;durability?:number};
export type Slot=Stack|null;
export interface WorldConfig { id:string;name:string;seed:string;mode:Mode;difficulty:Difficulty;type:'default'|'flat';created:number;lastPlayed:number;thumbnail?:string }
export interface PlayerState { x:number;y:number;z:number;yaw:number;pitch:number;health:number;hunger:number;inventory:Slot[];selected:number;spawn:[number,number,number];flying:boolean }
export interface FurnaceData { slots:Slot[];burn:number;progress:number }
export interface SaveData { version:1;config:WorldConfig;player:PlayerState;time:number;edits:Record<string,number>;chests:Record<string,Slot[]>;furnaces:Record<string,FurnaceData>;doors:Record<string,boolean> }
export interface WorldAccess { getBlock(x:number,y:number,z:number):number; setBlock(x:number,y:number,z:number,id:number):void; surface(x:number,z:number):number; isSolid(x:number,y:number,z:number):boolean }
export const key3=(x:number,y:number,z:number)=>`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
