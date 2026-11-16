import * as THREE from 'three';
import { B,key3,type WorldAccess } from './shared';
import { atlasUV,createAtlas } from './atlas';

export const CHUNK_SIZE=16,WORLD_HEIGHT=96,WATER_LEVEL=29;
const PAD=18,SLICE=PAD*PAD;
const dataIndex=(x:number,y:number,z:number)=>y*SLICE+(z+1)*PAD+x+1;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>t*t*(3-2*t);
type Biome='Planícies'|'Floresta'|'Deserto'|'Montanhas';
type Column={height:number;biome:Biome;river:number;mountain:number;cave:number;caveWidth:number;caveMask:number};
type DataChunk={data:Uint8Array;maxY:number;cx:number;cz:number};
export type Chunk=DataChunk&{group:THREE.Group;dirty:boolean};
const plants=new Set([B.FlowerRed,B.FlowerYellow,B.TallGrass,B.Sapling]);
const nonSolid=new Set([B.Air,B.Water,B.Torch,...plants]);
const cutout=new Set([B.Leaves,B.SpruceLeaves,...plants,B.Torch]);
const transparent=new Set([B.Water,B.Glass]);
const nonFull=new Set([B.Slab,B.Stairs,B.Door,B.Bed,B.Torch,...plants]);
const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const corners=[[[1,0,1],[1,0,0],[1,1,0],[1,1,1]],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]],[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]];

/** Deterministic padded chunks: their one-block border avoids generating four
 * extra chunks while meshing. Only nearby meshes and a bounded data cache live. */
export class World implements WorldAccess{
  public chunks=new Map<string,Chunk>();
  public edits:Record<string,number>;
  public openDoors=new Set<string>();
  public revision=0;
  private cache=new Map<string,DataChunk>();
  private columns=new Map<string,Column>();
  private seedNumber=2166136261;
  private atlas:ReturnType<typeof createAtlas>|null=null;
  private opaqueMaterial:THREE.MeshLambertMaterial|null=null;
  private waterMaterial:THREE.MeshLambertMaterial|null=null;
  private queue:[number,number][]=[];
  private lastCenter='';
  private spawn:[number,number,number]|null=null;
  constructor(private scene:THREE.Scene,public seed:string,public type:'default'|'flat',edits:Record<string,number>={}){
    this.edits={...edits};for(let i=0;i<seed.length;i++)this.seedNumber=Math.imul(this.seedNumber^seed.charCodeAt(i),16777619);
  }
  private hash(x:number,z:number,s=0):number{
    let n=Math.imul(x,374761393)^Math.imul(z,668265263)^this.seedNumber^Math.imul(s+1,1442695041);
    n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;
  }
  private noise(x:number,z:number,s=0):number{
    const ix=Math.floor(x),iz=Math.floor(z),tx=smooth(x-ix),tz=smooth(z-iz);
    return lerp(lerp(this.hash(ix,iz,s),this.hash(ix+1,iz,s),tx),lerp(this.hash(ix,iz+1,s),this.hash(ix+1,iz+1,s),tx),tz)*2-1;
  }
  private column(x:number,z:number):Column{
    const key=`${x},${z}`,cached=this.columns.get(key);if(cached)return cached;
    if(this.type==='flat'){const c:Column={height:24,biome:'Planícies',river:1,mountain:0,cave:0,caveWidth:0,caveMask:0};this.columns.set(key,c);return c;}
    const continental=this.noise(x/170,z/170,1),detail=this.noise(x/44,z/44,2),temperature=this.noise(x/210,z/210,3),moisture=this.noise(x/150,z/150,4);
    const mountain=clamp((continental-.06)*2.4,0,1),river=Math.abs(this.noise(x/110,z/110,8)+this.noise(x/38,z/38,9)*.13);
    let height=34+continental*8+detail*5+this.noise(x/14,z/14,5)*1.5+mountain*(21+Math.abs(this.noise(x/58,z/58,6))*20);
    const riverCut=clamp((.085-river)/.085,0,1);height=lerp(height,25.5+this.noise(x/24,z/24,10),riverCut);
    height=Math.floor(clamp(height,12,78));
    const biome:Biome=mountain>.46?'Montanhas':temperature>.16&&moisture<.12?'Deserto':moisture>-.05?'Floresta':'Planícies';
    const c:Column={height,biome,river,mountain,cave:19+this.noise(x/27,z/27,15)*11+this.noise(x/63,z/63,16)*9,
      caveWidth:2.2+(this.noise(x/18,z/18,17)+1)*1.6,caveMask:this.noise(x/34,z/34,18)};
    this.columns.set(key,c);
    if(this.columns.size>24000){let count=0;for(const k of this.columns.keys()){this.columns.delete(k);if(++count>=5000)break;}}
    return c;
  }
  biome(x:number,z:number):string{return this.column(Math.floor(x),Math.floor(z)).biome;}
  surface(x:number,z:number):number{
    x=Math.floor(x);z=Math.floor(z);let h=this.column(x,z).height;
    // Ground edits matter to respawns and animals, while tree canopies do not.
    const c=this.cache.get(`${Math.floor(x/16)},${Math.floor(z/16)}`);
    if(c){const lx=x-c.cx*16,lz=z-c.cz*16;while(h>0&&!this.blockSolid(c.data[dataIndex(lx,h,lz)]))h--;}
    return h;
  }
  private blockSolid(id:number):boolean{return !nonSolid.has(id);}
  isSolid(x:number,y:number,z:number):boolean{
    const id=this.getBlock(x,y,z);return this.blockSolid(id)&&!(id===B.Door&&this.openDoors.has(key3(x,y,z)));
  }
  getBlock(x:number,y:number,z:number):number{
    x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(y<0)return B.Bedrock;if(y>=WORLD_HEIGHT)return B.Air;
    const cx=Math.floor(x/16),cz=Math.floor(z/16),c=this.getData(cx,cz);
    return c.data[dataIndex(x-cx*16,y,z-cz*16)];
  }
  setBlock(x:number,y:number,z:number,id:number):void{
    x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(y<0||y>=WORLD_HEIGHT||id<0||id>B.SpruceLeaves)return;
    this.revision++;
    this.edits[key3(x,y,z)]=id;
    if(this.spawn&&Math.abs(x-this.spawn[0])<2&&Math.abs(z-this.spawn[2])<2)this.spawn=null;
    const cx=Math.floor(x/16),cz=Math.floor(z/16);this.getData(cx,cz);
    // Update each loaded padded border as well as the edited chunk itself.
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      const k=`${cx+dx},${cz+dz}`,c=this.cache.get(k);if(!c)continue;
      const lx=x-c.cx*16,lz=z-c.cz*16;if(lx< -1||lx>16||lz< -1||lz>16)continue;
      c.data[dataIndex(lx,y,lz)]=id;c.maxY=Math.max(c.maxY,y);
      const rendered=this.chunks.get(k);if(rendered){rendered.dirty=true;rendered.maxY=Math.max(rendered.maxY,y);}
    }
  }
  private getData(cx:number,cz:number):DataChunk{
    const key=`${cx},${cz}`,cached=this.cache.get(key);if(cached)return cached;
    const c=this.generate(cx,cz);this.cache.set(key,c);return c;
  }
  private ore(x:number,y:number,z:number):number{
    // Coarse cells plus local correlated variation produce actual small veins.
    const v=this.hash(Math.floor(x/3)+Math.floor(y/3)*7919,Math.floor(z/3),30);
    const speck=this.hash(x+y*41,z,31);if(speck>.86)return B.Stone;
    if(y<13&&v>.974)return B.DiamondOre;if(y<24&&v>.945&&v<=.974)return B.GoldOre;
    if(y<43&&v>.87&&v<=.945)return B.IronOre;if(v>.77&&v<=.87)return B.CoalOre;return B.Stone;
  }
  private entranceFloor(wx:number,wz:number):number{
    if(this.type==='flat')return -100;
    const gx=Math.floor(wx/48),gz=Math.floor(wz/48);let floor=-100;
    for(let az=gz-1;az<=gz+1;az++)for(let ax=gx-1;ax<=gx;ax++){
      if(this.hash(ax,az,52)>.28)continue;
      const ex=ax*48+8+Math.floor(this.hash(ax,az,53)*28),ez=az*48+8+Math.floor(this.hash(ax,az,54)*28),dx=wx-ex,dz=wz-ez;
      if(dx>=-3&&dx<23&&Math.abs(dz)<2.7+Math.sin(dx*.35)*.8){const anchor=this.column(ex,ez);if(anchor.height>WATER_LEVEL+2)floor=anchor.height-3-Math.floor((dx+3)*.52);}
    }
    return floor;
  }
  private generate(cx:number,cz:number):DataChunk{
    const data=new Uint8Array(SLICE*WORLD_HEIGHT);let maxY=0;
    const put=(wx:number,y:number,wz:number,id:number,onlyEmpty=false)=>{
      const x=wx-cx*16,z=wz-cz*16;if(x< -1||x>16||z< -1||z>16||y<0||y>=WORLD_HEIGHT)return;
      const i=dataIndex(x,y,z);if(onlyEmpty&&data[i]!==B.Air&&!plants.has(data[i]))return;data[i]=id;maxY=Math.max(maxY,y);
    };
    for(let z=-1;z<=16;z++)for(let x=-1;x<=16;x++){
      const wx=cx*16+x,wz=cz*16+z,c=this.column(wx,wz),h=c.height,desert=c.biome==='Deserto',shore=this.type!=='flat'&&h<=WATER_LEVEL+1;
      // A sparse, sloping horizontal tunnel reaches the surface at its mouth.
      const entranceFloor=this.entranceFloor(wx,wz);
      for(let y=0;y<=Math.max(h,this.type==='flat'?0:WATER_LEVEL);y++){
        let id=B.Air;
        if(y===0||y<3&&this.hash(wx+y*173,wz,22)<.35)id=B.Bedrock;
        else if(y<=h){
          if(y===h)id=desert||shore?B.Sand:c.biome==='Montanhas'&&h>58?B.Snow:c.biome==='Montanhas'&&c.mountain>.75?B.Stone:B.Grass;
          else if(y>=h-3)id=desert||shore?B.Sand:B.Dirt;
          else if(desert&&y>=h-7)id=B.Sandstone;else id=this.type==='flat'?B.Stone:this.ore(wx,y,wz);
          if(this.type!=='flat'&&y>3&&((y<h-4&&c.caveMask>-.36&&Math.abs(y-c.cave)<c.caveWidth)||(y>=entranceFloor&&y<entranceFloor+5)))id=B.Air;
        }else if(this.type!=='flat'&&y<=WATER_LEVEL)id=B.Water;
        data[dataIndex(x,y,z)]=id;if(id!==B.Air)maxY=Math.max(maxY,y);
      }
      if(h>WATER_LEVEL&&data[dataIndex(x,h,z)]!==B.Air){
        const r=this.hash(wx,wz,60);
        if(desert&&r<.009){for(let j=1;j<=2+Math.floor(this.hash(wx,wz,61)*2);j++)put(wx,h+j,wz,B.Cactus,true);}
        else if(!desert&&r<.085)put(wx,h+1,wz,r<.012?B.FlowerRed:r<.024?B.FlowerYellow:B.TallGrass,true);
      }
    }
    // Stable grid anchors include neighboring trees, so crowns never split at borders.
    for(let gz=Math.floor((cz*16-4)/6);gz<=Math.floor((cz*16+20)/6);gz++)for(let gx=Math.floor((cx*16-4)/6);gx<=Math.floor((cx*16+20)/6);gx++){
      const wx=gx*6+1+Math.floor(this.hash(gx,gz,65)*4),wz=gz*6+1+Math.floor(this.hash(gx,gz,66)*4),c=this.column(wx,wz);
      const chance=c.biome==='Floresta'?.68:c.biome==='Planícies'?.1:c.biome==='Montanhas'?.3:0;
      if(this.hash(gx,gz,67)>chance||c.height<=WATER_LEVEL+1||c.height>68||this.type==='flat')continue;
      const entrance=this.entranceFloor(wx,wz);if(c.height>=entrance&&c.height<entrance+5)continue;
      if(Math.abs(this.column(wx+2,wz).height-c.height)>2||Math.abs(this.column(wx,wz+2).height-c.height)>2)continue;
      const spruce=c.biome==='Montanhas',birch=!spruce&&this.hash(gx,gz,68)<.25,log=spruce?B.SpruceLog:birch?B.BirchLog:B.OakLog,leaf=spruce?B.SpruceLeaves:B.Leaves;
      const height=spruce?7+Math.floor(this.hash(gx,gz,69)*3):4+Math.floor(this.hash(gx,gz,69)*3),base=c.height+1;
      if(spruce){for(let dy=2;dy<=height+1;dy++){const radius=dy===height+1?0:Math.min(3,Math.floor((height+1-dy)/2)+1);for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)if(Math.abs(dx)+Math.abs(dz)<=radius*1.6)put(wx+dx,base+dy,wz+dz,leaf,true);}}
      else {for(let dy=height-2;dy<=height+1;dy++){const radius=dy===height+1?1:2;for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)if(!(Math.abs(dx)===2&&Math.abs(dz)===2&&this.hash(wx+dx,wz+dz,dy)>.35))put(wx+dx,base+dy,wz+dz,leaf,true);}}
      for(let dy=0;dy<height;dy++)put(wx,base+dy,wz,log);
    }
    for(const [key,id]of Object.entries(this.edits)){const [x,y,z]=key.split(',').map(Number);if(x>=cx*16-1&&x<=cx*16+16&&z>=cz*16-1&&z<=cz*16+16)put(x,y,z,id);}
    return{cx,cz,data,maxY};
  }
  findSpawn():[number,number,number]{
    if(this.spawn)return this.spawn;
    for(let pass=0;pass<2;pass++)for(let radius=0;radius<=(pass?256:112);radius+=8)for(let z=-radius;z<=radius;z+=8)for(let x=-radius;x<=radius;x+=8){
      if(radius>0&&Math.abs(x)!==radius&&Math.abs(z)!==radius)continue;
      const c=this.column(x,z);if(this.type!=='flat'&&c.height<=WATER_LEVEL+1||pass===0&&(c.biome==='Deserto'||c.biome==='Montanhas'))continue;
      if(Math.abs(this.column(x+2,z).height-c.height)>1||Math.abs(this.column(x,z+2).height-c.height)>1)continue;
      const h=c.height;if(this.isSolid(x,h,z)&&!this.isSolid(x,h+1,z)&&!this.isSolid(x,h+2,z))return this.spawn=[x+.5,h+1.02,z+.5];
    }
    for(let y=WORLD_HEIGHT-3;y>0;y--)if(this.isSolid(0,y-1,0)&&!this.isSolid(0,y,0)&&!this.isSolid(0,y+1,0)&&this.getBlock(0,y,0)!==B.Water)return this.spawn=[.5,y+.02,.5];return this.spawn=[.5,85,.5];
  }
  private ensureMaterials():void{
    if(this.opaqueMaterial)return;
    if(typeof document!=='undefined')this.atlas=createAtlas();
    this.opaqueMaterial=new THREE.MeshLambertMaterial({map:this.atlas?.texture??null,vertexColors:true,alphaTest:.45,side:THREE.DoubleSide});
    this.waterMaterial=new THREE.MeshLambertMaterial({map:this.atlas?.texture??null,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.025,side:THREE.DoubleSide});
  }
  private mesh(c:Chunk):void{
    this.ensureMaterials();for(const child of [...c.group.children]){if(child instanceof THREE.Mesh)child.geometry.dispose();c.group.remove(child);}
    type Builder={positions:number[];normals:number[];uvs:number[];colors:number[];indices:number[]};
    const builders:Builder[]=[0,1].map(()=>({positions:[],normals:[],uvs:[],colors:[],indices:[]}));
    const sample=(x:number,y:number,z:number)=>y<0?B.Bedrock:y>=WORLD_HEIGHT?B.Air:c.data[dataIndex(x,y,z)];
    const face=(builder:Builder,verts:number[][],normal:number[],block:number,f:number,shade:number)=>{
      const start=builder.positions.length/3,uv=atlasUV(block,f),uvs=[[uv[0],uv[1]],[uv[2],uv[1]],[uv[2],uv[3]],[uv[0],uv[3]]];
      for(let i=0;i<4;i++){builder.positions.push(...verts[i]);builder.normals.push(...normal);builder.uvs.push(...uvs[i]);builder.colors.push(shade,shade,shade);}
      builder.indices.push(start,start+1,start+2,start,start+2,start+3);
    };
    for(let z=0;z<16;z++)for(let x=0;x<16;x++){
      const surface=this.column(c.cx*16+x,c.cz*16+z).height;
      for(let y=0;y<=c.maxY;y++){
        const id=sample(x,y,z);if(id===B.Air||id===B.Door&&this.openDoors.has(key3(c.cx*16+x,y,c.cz*16+z)))continue;
        const builder=builders[transparent.has(id)?1:0];
        const darkness=y<surface-3?Math.max(.28,.7-(surface-y)*.025):1;
        if(plants.has(id)||id===B.Torch){
          const h=id===B.Torch?.85:1;
          face(builder,[[x+.1,y,z+.1],[x+.9,y,z+.9],[x+.9,y+h,z+.9],[x+.1,y+h,z+.1]],[.707,0,-.707],id,4,darkness);
          face(builder,[[x+.9,y,z+.1],[x+.1,y,z+.9],[x+.1,y+h,z+.9],[x+.9,y+h,z+.1]],[.707,0,.707],id,4,darkness);continue;
        }
        const box=(min:number[],max:number[],force=false)=>{
          for(let f=0;f<6;f++){
            const d=dirs[f],neighbor=sample(x+d[0],y+d[1],z+d[2]);
            const visible=force||neighbor!==id&&(neighbor===B.Air||cutout.has(neighbor)||transparent.has(neighbor)||nonFull.has(neighbor));
            if(!visible)continue;
            const verts=corners[f].map(p=>[x+lerp(min[0],max[0],p[0]),y+lerp(min[1],max[1],p[1]),z+lerp(min[2],max[2],p[2])]);
            face(builder,verts,d,id,f,[.83,.72,1,.53,.9,.77][f]*darkness);
          }
        };
        if(id===B.Slab||id===B.Bed)box([0,0,0],[1,.5,1],true);
        else if(id===B.Stairs){box([0,0,0],[1,.5,1],true);box([0,.5,.5],[1,1,1],true);}
        else if(id===B.Door)box([0,0,.38],[1,1,.57],true);
        else box([0,0,0],[1,id===B.Water&&sample(x,y+1,z)!==B.Water?.88:1,1]);
      }
    }
    builders.forEach((b,i)=>{if(!b.positions.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));geometry.setIndex(b.indices);geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,i===0?this.opaqueMaterial!:this.waterMaterial!);mesh.castShadow=i===0;mesh.receiveShadow=true;mesh.renderOrder=i;c.group.add(mesh);});
    c.dirty=false;
  }
  /** Coordinates in blocks; radius in chunks; budget is maximum meshes per call. */
  update(centerX:number,centerZ:number,radius:number,budget=2):void{
    const cx=Math.floor(centerX/16),cz=Math.floor(centerZ/16);radius=Math.floor(clamp(radius,1,8));
    const marker=`${cx},${cz},${radius}`;
    if(marker!==this.lastCenter){
      this.lastCenter=marker;this.queue=[];
      for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++)if(!this.chunks.has(`${cx+x},${cz+z}`))this.queue.push([cx+x,cz+z]);
      this.queue.sort((a,b)=>(a[0]-cx)**2+(a[1]-cz)**2-((b[0]-cx)**2+(b[1]-cz)**2));
      for(const[k,c]of this.chunks)if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cz-cz))>radius+1){this.removeChunk(c);this.chunks.delete(k);}
      for(const[k,c]of this.cache)if(!this.chunks.has(k)&&Math.max(Math.abs(c.cx-cx),Math.abs(c.cz-cz))>radius+2)this.cache.delete(k);
    }
    let count=0;const start=performance.now();
    for(const c of this.chunks.values()){if(c.dirty){this.mesh(c);count++;if(count>=budget||performance.now()-start>11)return;}}
    while(this.queue.length&&count<budget){const[x,z]=this.queue.shift()!,key=`${x},${z}`;if(this.chunks.has(key))continue;
      const data=this.getData(x,z),group=new THREE.Group();group.position.set(x*16,0,z*16);group.name=`chunk ${key}`;
      const c:Chunk={...data,group,dirty:true};this.chunks.set(key,c);this.scene.add(group);this.mesh(c);count++;
      if(performance.now()-start>11)break;
    }
    if(this.cache.size>Math.max(160,(radius*2+5)**2))for(const[k,c]of this.cache){if(!this.chunks.has(k)){this.cache.delete(k);if(this.cache.size<=Math.max(160,(radius*2+5)**2))break;}}
  }
  private removeChunk(c:Chunk):void{for(const child of c.group.children)if(child instanceof THREE.Mesh)child.geometry.dispose();this.scene.remove(c.group);}
  dispose():void{for(const c of this.chunks.values())this.removeChunk(c);this.chunks.clear();this.cache.clear();this.columns.clear();this.queue=[];this.atlas?.texture.dispose();this.opaqueMaterial?.dispose();this.waterMaterial?.dispose();}
}
