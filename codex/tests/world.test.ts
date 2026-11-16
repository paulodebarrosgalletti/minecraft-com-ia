import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { World,WORLD_HEIGHT,WATER_LEVEL } from '../src/world';
import { B,key3 } from '../src/shared';

const make=(seed='test-geography',type:'default'|'flat'='default',edits:Record<string,number>={})=>new World(new THREE.Scene(),seed,type,edits);

test('seeded geography and cross-chunk columns are deterministic at negative coordinates',()=>{
  const a=make(),b=make(),other=make('different-geography');let differences=0;
  for(const x of [-33,-17,-16,-1,0,15,16,31,32])for(const z of [-17,0,16]){
    assert.equal(a.surface(x,z),b.surface(x,z));
    for(const y of [0,8,16,24,32,48,72,95])assert.equal(a.getBlock(x,y,z),b.getBlock(x,y,z));
    if(a.surface(x,z)!==other.surface(x,z))differences++;
  }
  assert.ok(differences>0,'another seed changes the landscape');
  assert.equal(a.getBlock(0,-1,0),B.Bedrock);assert.equal(a.getBlock(0,WORLD_HEIGHT,0),B.Air);
  a.dispose();b.dispose();other.dispose();
});

test('safe spawn has solid ground, clear headroom and no flooded feet',()=>{
  for(const seed of ['test-geography','floresta','12345']){
    const w=make(seed),[x,y,z]=w.findSpawn();assert.ok(w.isSolid(x,Math.floor(y)-1,z));
    assert.equal(w.isSolid(x,y,z),false);assert.equal(w.isSolid(x,y+1,z),false);
    assert.notEqual(w.getBlock(x,y,z),B.Water);assert.ok(y>WATER_LEVEL);w.dispose();
  }
});

test('four distinct biomes, rivers and mountains occur around a fixed seed',()=>{
  const w=make('blockcraft-valley'),biomes=new Set<string>();let low=96,high=0;
  for(let z=-512;z<=512;z+=64)for(let x=-512;x<=512;x+=64){biomes.add(w.biome(x,z));low=Math.min(low,w.surface(x,z));high=Math.max(high,w.surface(x,z));}
  assert.equal(biomes.size,4);assert.ok(high-low>30);assert.ok(low<WATER_LEVEL);
  let caves=0,water=0;
  for(let z=-48;z<=48;z+=8)for(let x=-48;x<=48;x+=8){const h=w.surface(x,z);if(w.getBlock(x,WATER_LEVEL,z)===B.Water)water++;for(let y=4;y<h-4;y++)if(w.getBlock(x,y,z)===B.Air)caves++;}
  assert.ok(water>0);assert.ok(caves>100);w.dispose();
});

test('flat terrain has dry layered ground and a valid spawn',()=>{
  const w=make('flat','flat');assert.equal(w.surface(-100,50),24);assert.equal(w.getBlock(0,24,0),B.Grass);
  assert.equal(w.getBlock(0,23,0),B.Dirt);assert.equal(w.getBlock(0,10,0),B.Stone);
  assert.equal(w.getBlock(0,25,0),B.Air);const[x,y,z]=w.findSpawn();assert.ok(w.isSolid(x,y-1,z));w.dispose();
});

test('edits survive regeneration and unloaded chunk borders remain consistent',()=>{
  const w=make('flat','flat');w.update(8,8,1,1);const c=w.chunks.get('0,0')!;assert.ok(c.group.children.length>0);
  w.setBlock(15,25,0,B.Planks);assert.equal(w.getBlock(15,25,0),B.Planks);assert.equal(c.dirty,true);
  w.setBlock(-1,24,0,B.Air);assert.equal(w.getBlock(-1,24,0),B.Air);
  const edits={...w.edits};w.update(1000,1000,1,1);assert.equal(w.chunks.has('0,0'),false);
  assert.equal(w.getBlock(15,25,0),B.Planks);assert.equal(w.getBlock(-1,24,0),B.Air);
  const reloaded=make('flat','flat',edits);assert.equal(reloaded.getBlock(15,25,0),B.Planks);
  assert.equal(reloaded.getBlock(-1,24,0),B.Air);w.dispose();reloaded.dispose();
});

test('placement above previous mesh bounds renders and open doors stop colliding',()=>{
  const w=make('flat','flat');w.update(0,0,1,1);const c=w.chunks.get('0,0')!;
  w.setBlock(1,70,1,B.Door);assert.ok(c.maxY>=70);assert.ok(w.isSolid(1,70,1));
  w.openDoors.add(key3(1,70,1));w.setBlock(1,70,1,B.Door);assert.equal(w.isSolid(1,70,1),false);
  w.update(0,0,1,1);assert.equal(c.dirty,false);w.dispose();
});

test('streaming creates bounded chunks and releases old meshes',()=>{
  const w=make('flat','flat');for(let i=0;i<20;i++)w.update(0,0,1,8);assert.equal(w.chunks.size,9);
  for(let i=0;i<8;i++)w.update(320,320,1,8);assert.equal(w.chunks.size,9);
  assert.equal(w.chunks.has('0,0'),false);w.dispose();assert.equal(w.chunks.size,0);
});

test('padded chunk borders agree before and after selective edits',()=>{
  const w=make('seams');for(let i=0;i<20;i++)w.update(0,0,1,8);
  const center=w.chunks.get('0,0')!;
  const i=(x:number,y:number,z:number)=>y*324+(z+1)*18+x+1;
  for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const neighbor=w.chunks.get(`${dx},${dz}`)!;
    for(let y=0;y<90;y++)for(let t=0;t<16;t++){
      const bx=dx?dx>0?16:-1:t,bz=dz?dz>0?16:-1:t;
      const nx=dx?dx>0?0:15:t,nz=dz?dz>0?0:15:t;
      assert.equal(center.data[i(bx,y,bz)],neighbor.data[i(nx,y,nz)],`border ${dx},${dz} at ${t},${y}`);
    }
    const x=dx?dx>0?15:0:3,z=dz?dz>0?15:0:3;
    w.setBlock(x,45,z,B.Glass);
    assert.equal(neighbor.data[i(x-dx*16,45,z-dz*16)],B.Glass);
    assert.ok(center.dirty);assert.ok(neighbor.dirty);
  }
  w.dispose();
});
