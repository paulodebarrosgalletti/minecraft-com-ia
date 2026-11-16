import * as THREE from 'three';
import { B } from './shared';

// Original 16px textures, painted from deterministic pixel patterns at startup.
// Faces: +X, -X, +Y, -Y, +Z, -Z. Atlas UVs have a half-texel inset.
const SIZE=16, GRID=8;
const palette:Record<number,string>={
  [B.Grass]:'#66a23d',[B.Dirt]:'#87603e',[B.Stone]:'#89908d',[B.Cobble]:'#777f7c',
  [B.Sand]:'#e1ce8d',[B.Sandstone]:'#c9b576',[B.Gravel]:'#95938d',[B.Bedrock]:'#454946',
  [B.Snow]:'#e9f4f4',[B.Water]:'#387ebc',[B.OakLog]:'#71512f',[B.Planks]:'#b78b50',
  [B.BirchLog]:'#ddd8bf',[B.BirchPlanks]:'#d4bb7b',[B.Leaves]:'#4c8c35',
  [B.CoalOre]:'#858d89',[B.IronOre]:'#858d89',[B.GoldOre]:'#858d89',[B.DiamondOre]:'#858d89',
  [B.StoneBricks]:'#8a918d',[B.Glass]:'#b6e3e8',[B.Bricks]:'#b26449',[B.Slab]:'#b78b50',
  [B.Stairs]:'#b78b50',[B.Torch]:'#bc783d',[B.Workbench]:'#986435',[B.Furnace]:'#747c79',
  [B.Chest]:'#ad7e36',[B.Door]:'#a77a3e',[B.Bed]:'#ae413e',[B.Cactus]:'#559244',
  [B.FlowerRed]:'#e64d42',[B.FlowerYellow]:'#f4d54c',[B.TallGrass]:'#6c9e42',
  [B.Sapling]:'#609340',[B.SpruceLog]:'#59422e',[B.SpruceLeaves]:'#3e7450'
};
const hash=(x:number,y:number,s:number)=>{let n=Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^Math.imul(s+1,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
const rgb=(hex:string)=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const variant=(block:number,face:number)=>block===B.Grass?(face===2?B.Grass:face===3?B.Dirt:38):
  block===B.OakLog?(face===2||face===3?39:block):block===B.BirchLog?(face===2||face===3?40:block):
  block===B.SpruceLog?(face===2||face===3?41:block):block===B.Workbench&&face===2?42:
  block===B.Chest&&face===2?43:block===B.Furnace&&face===4?44:block;

export function atlasUV(block:number,face:number):[number,number,number,number]{
  const t=variant(block,face), x=t%GRID,y=Math.floor(t/GRID),pad=.28/(SIZE*GRID);
  return[x/GRID+pad,1-(y+1)/GRID+pad,(x+1)/GRID-pad,1-y/GRID-pad];
}

export function createAtlas():{texture:THREE.CanvasTexture;uv:typeof atlasUV;icon:(block:number)=>string}{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE*GRID;
  const ctx=canvas.getContext('2d')!;
  const image=ctx.createImageData(canvas.width,canvas.height);
  const set=(tile:number,x:number,y:number,c:number[],a=255)=>{const i=((Math.floor(tile/GRID)*SIZE+y)*canvas.width+(tile%GRID)*SIZE+x)*4;image.data[i]=c[0];image.data[i+1]=c[1];image.data[i+2]=c[2];image.data[i+3]=a;};
  for(let tile=1;tile<=44;tile++)for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    let id=tile,base=palette[tile]??'#92724a',a=255;
    if(tile===38){id=B.Dirt;base=y<3+Math.floor(hash(x,2,91)*3)?'#63973c':palette[B.Dirt];}
    if(tile===39||tile===40||tile===41)base=tile===40?'#c8ae72':tile===41?'#9f7a4a':'#b68b52';
    if(tile===42||tile===43)base=tile===42?'#9a6b38':'#b4833c';
    if(tile===44)base=palette[B.Furnace];
    let c=rgb(base),shade=(hash(x,y,tile)-.5)*30;
    if(id===B.Stone||id===B.Gravel||id===B.Bedrock||id===B.Sand)shade+=(hash(Math.floor(x/3),Math.floor(y/3),tile)-.5)*20;
    if(id===B.Cobble){const xx=(x+((Math.floor(y/5)%2)*3))%6, yy=y%5;shade+=xx===0||yy===0?-34:13;}
    if(id===B.Planks||id===B.BirchPlanks||id===B.Slab||id===B.Stairs){shade+=y%4===0?-32:5;if(x===(Math.floor(y/4)%2)*8&&y%4!==0)shade-=22;shade+=Math.sin(x*1.7+y*.3)*4;}
    if(id===B.OakLog||id===B.SpruceLog){shade+=Math.sin(x*2.5+Math.floor(y/5))*18;if(x%5===1)shade-=22;}
    if(id===B.BirchLog&&((x+Math.floor(y/3)*7)%13<4)&&y%5<2)c=rgb('#575d52');
    if(tile>=39&&tile<=41){const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));shade+=Math.floor(d)%3===0?-30:10;}
    if(id===B.Leaves||id===B.SpruceLeaves){shade+=(hash(Math.floor(x/2),Math.floor(y/2),tile)-.5)*50;if(hash(x,y,tile+51)>.94)a=0;}
    if(id===B.Grass)shade+=(hash(Math.floor(x/2),Math.floor(y/2),tile+2)-.5)*30;
    if(id>=B.CoalOre&&id<=B.DiamondOre){const oreColors=['#333e39','#c6987e','#e9c54b','#61d9d6'];const r=hash(Math.floor(x/3),Math.floor(y/3),tile+22);if(r>.66&&x%3!==2&&y%3!==2){c=rgb(oreColors[id-B.CoalOre]);shade=(hash(x,y,tile)-.5)*35;}}
    if(id===B.StoneBricks||id===B.Bricks){const xx=(x+(Math.floor(y/5)%2)*4)%8;if(y%5===0||xx===0){c=rgb(id===B.Bricks?'#b4a68f':'#535f5a');shade=0;}}
    if(id===B.Water){shade+=Math.sin(x*.7+y*.6)*10;a=185;if((x+y*2)%13===0)shade+=21;}
    if(id===B.Glass){a=x===0||y===0||x===15||y===15?185:32;if((x-y===4||x-y===5)&&x>7){a=130;c=rgb('#e8fbfb');}}
    if(id===B.Cactus){shade+=x%4===0?-30:5;if(x%5===2&&y%5===1)c=rgb('#d7d19b');}
    if(id===B.Workbench||tile===42){if(tile===42){if(x<2||x>13||y<2||y>13||x===5||x===10||y===5||y===10)shade-=42;}else{if(x<2||x>13||y>11)shade-=35;if(y>3&&y<10&&x>5&&x<10)shade+=30;}}
    if(id===B.Chest||tile===43){if(x<1||x>14||y<2||y===9||y>14)shade-=44;if(tile!==43&&x>=7&&x<=9&&y>=7&&y<=11){c=rgb('#ddd4a4');shade=0;}}
    if(id===B.Furnace||tile===44){if(x===0||y===0||x===15||y===15)shade-=34;if(tile===44&&x>3&&x<12&&((y>3&&y<7)||(y>9&&y<14))){c=rgb('#2d3431');shade=0;}}
    if(id===B.Door){if(x<2||x>13||y===0||y===15||y===8)shade-=36;if(x>4&&x<11&&y>1&&y<7){c=rgb('#7d9fa0');shade=0;}if(x===12&&y===11)c=rgb('#dfc974');}
    if(id===B.Bed){if(y>11){c=rgb('#e5ddd0');}if(x===0||y===0)shade-=24;}
    if(id===B.FlowerRed||id===B.FlowerYellow||id===B.TallGrass||id===B.Sapling||id===B.Torch){
      a=0;
      if(id===B.TallGrass){if((Math.abs(x-(7+Math.sin(y*.6)*3))<1.4&&y>5)||(Math.abs(x-(3+y*.3))<1&&y>8)||(Math.abs(x-(14-y*.25))<1&&y>3))a=255;}
      else if(id===B.Sapling){if(y>8&&Math.abs(x-8)<1.2){c=rgb('#795432');a=255;}if(y>2&&y<11&&Math.abs(x-8)<(y<7?4:6)&&hash(x,y,tile)>.12)a=255;}
      else if(id===B.Torch){if(x>=7&&x<=9&&y>5){c=rgb('#885430');a=255;}if(x>=6&&x<=10&&y>=2&&y<=6){c=rgb(y<4?'#fff1a1':'#f8b23c');a=255;}}
      else {if(y>=7&&Math.abs(x-8)<1.2){c=rgb('#4d8835');a=255;}if(y===11&&x>5&&x<11){c=rgb('#4d8835');a=255;}if(y>=2&&y<=7&&Math.abs(x-8)+(Math.abs(y-4))<5){c=rgb(base);a=255;if(x===8&&y===4)c=rgb('#f7d87b');}}
    }
    set(tile,x,y,c.map(v=>Math.max(0,Math.min(255,v+shade))),a);
  }
  ctx.putImageData(image,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
  texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;
  const icons=new Map<number,string>();
  return{texture,uv:atlasUV,icon:(block:number)=>{
    const cached=icons.get(block);if(cached)return cached;
    const icon=document.createElement('canvas');icon.width=icon.height=32;const c=icon.getContext('2d')!;c.imageSmoothingEnabled=false;
    const tile=variant(block,block===B.Grass?2:4);c.drawImage(canvas,(tile%GRID)*SIZE,Math.floor(tile/GRID)*SIZE,SIZE,SIZE,0,0,32,32);
    const url=icon.toDataURL();icons.set(block,url);return url;
  }};
}
