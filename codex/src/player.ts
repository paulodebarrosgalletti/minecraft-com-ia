import * as THREE from 'three';
import { B, type PlayerState, type WorldAccess } from './shared';

export interface Hit { x:number;y:number;z:number;id:number;normal:THREE.Vector3;distance:number }
export function raycast(world:WorldAccess,origin:THREE.Vector3,dir:THREE.Vector3,max=6):Hit|null {
  let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z);
  const sx=dir.x>=0?1:-1,sy=dir.y>=0?1:-1,sz=dir.z>=0?1:-1;
  const dx=Math.abs(1/dir.x),dy=Math.abs(1/dir.y),dz=Math.abs(1/dir.z);
  let tx=(dir.x>=0?x+1-origin.x:origin.x-x)*dx,ty=(dir.y>=0?y+1-origin.y:origin.y-y)*dy,tz=(dir.z>=0?z+1-origin.z:origin.z-z)*dz;
  if(!Number.isFinite(tx))tx=Infinity;if(!Number.isFinite(ty))ty=Infinity;if(!Number.isFinite(tz))tz=Infinity;
  let distance=0;const normal=new THREE.Vector3();
  for(let i=0;i<128&&distance<=max;i++){
    const id=world.getBlock(x,y,z);
    if(id!==B.Air&&id!==B.Water&&id!==B.TallGrass&&id!==B.FlowerRed&&id!==B.FlowerYellow)return{x,y,z,id,normal:normal.clone(),distance};
    if(tx<ty&&tx<tz){x+=sx;distance=tx;tx+=dx;normal.set(-sx,0,0)}
    else if(ty<tz){y+=sy;distance=ty;ty+=dy;normal.set(0,-sy,0)}
    else{z+=sz;distance=tz;tz+=dz;normal.set(0,0,-sz)}
  }return null;
}

export class Player {
  position=new THREE.Vector3();velocity=new THREE.Vector3();keys=new Set<string>();yaw=0;pitch=0;grounded=false;flying=false;inWater=false;crouching=false;
  health=20;hunger=20;spawn:[number,number,number]=[0,50,0];fallStart=0;walk=0;air=10;
  private jumpLatch=false;private survivalClock=0;private hurtTimer=0;
  constructor(public world:WorldAccess,public camera:THREE.PerspectiveCamera,public mode:'survival'|'creative',private onDamage:(n:number,cause:string)=>void){}
  restore(s:PlayerState){this.position.set(s.x,s.y,s.z);this.yaw=s.yaw;this.pitch=s.pitch;this.health=s.health;this.hunger=s.hunger;this.spawn=s.spawn;this.flying=s.flying&&this.mode==='creative';this.fallStart=s.y;this.syncCamera()}
  collides(x:number,y:number,z:number):boolean {
    for(let bx=Math.floor(x-.29);bx<=Math.floor(x+.29);bx++)for(let by=Math.floor(y+.002);by<=Math.floor(y+1.78);by++)for(let bz=Math.floor(z-.29);bz<=Math.floor(z+.29);bz++)if(this.world.isSolid(bx,by,bz))return true;
    return false;
  }
  intersectsBlock(x:number,y:number,z:number){const p=this.position;return p.x+.3>x&&p.x-.3<x+1&&p.y+1.8>y&&p.y<y+1&&p.z+.3>z&&p.z-.3<z+1}
  damage(amount:number,cause:string){if(this.mode==='creative'||this.hurtTimer>0||this.health<=0)return;this.health=Math.max(0,this.health-amount);this.hurtTimer=.65;this.onDamage(amount,cause)}
  update(dt:number,difficulty:string){
    this.hurtTimer=Math.max(0,this.hurtTimer-dt);
    const p=this.position,k=this.keys;
    this.inWater=this.world.getBlock(Math.floor(p.x),Math.floor(p.y+.6),Math.floor(p.z))===B.Water;
    this.crouching=k.has('ShiftLeft')&&!this.flying;
    const sprint=k.has('ControlLeft')&&this.hunger>5&&!this.crouching;
    let ix=Number(k.has('KeyD'))-Number(k.has('KeyA')),iz=Number(k.has('KeyW'))-Number(k.has('KeyS'));
    const len=Math.hypot(ix,iz);if(len){ix/=len;iz/=len}
    const speed=this.flying?(sprint?17:9):this.inWater?2.5:this.crouching?1.8:sprint?6.6:4.3;
    const vx=(ix*Math.cos(this.yaw)-iz*Math.sin(this.yaw))*speed;
    const vz=(-ix*Math.sin(this.yaw)-iz*Math.cos(this.yaw))*speed;
    this.velocity.x=THREE.MathUtils.damp(this.velocity.x,vx,12,dt);this.velocity.z=THREE.MathUtils.damp(this.velocity.z,vz,12,dt);
    const jump=k.has('Space');
    if(this.flying)this.velocity.y=(Number(jump)-Number(k.has('ShiftLeft')))*speed;
    else if(this.inWater){this.velocity.y-=5*dt;this.velocity.y*=Math.exp(-3*dt);if(jump)this.velocity.y=3.5}
    else{this.velocity.y=Math.max(-35,this.velocity.y-25*dt);if(jump&&this.grounded&&!this.jumpLatch){this.velocity.y=8.6;this.grounded=false;this.fallStart=p.y}}
    this.jumpLatch=jump;
    const wasGround=this.grounded;this.grounded=false;
    for(const axis of ['x','z','y'] as const){
      const delta=this.velocity[axis]*dt,steps=Math.max(1,Math.ceil(Math.abs(delta)/.18));
      for(let i=0;i<steps;i++){
        const old=p[axis];p[axis]+=delta/steps;
        if(this.collides(p.x,p.y,p.z)){p[axis]=old;if(axis==='y'&&delta<0)this.grounded=true;this.velocity[axis]=0;break}
        if(this.crouching&&wasGround&&axis!=='y'&&!this.collides(p.x,p.y-.12,p.z)){p[axis]=old;this.velocity[axis]=0;break}
      }
    }
    if(this.grounded){if(!wasGround&&!this.inWater&&!this.flying){const fall=this.fallStart-p.y;if(fall>3.5)this.damage(Math.floor(fall-3),'uma queda')}this.fallStart=p.y}
    else if(this.velocity.y>0||this.inWater||this.flying)this.fallStart=p.y;
    if(p.y<-10){if(this.mode==='creative'){p.set(...this.spawn);this.velocity.set(0,0,0)}else this.damage(20,'o vazio')}
    this.walk+=Math.hypot(this.velocity.x,this.velocity.z)*dt;
    this.survivalClock+=dt;
    if(this.mode==='survival'){
      if(difficulty==='peaceful')this.hunger=Math.min(20,this.hunger+dt*.4);
      else this.hunger=Math.max(0,this.hunger-dt*(sprint&&len?.025:.006));
      if(this.survivalClock>=4){this.survivalClock=0;if(this.hunger>=16&&this.health<20){this.health=Math.min(20,this.health+1);this.hunger=Math.max(0,this.hunger-.15)}if(this.hunger===0&&difficulty!=='peaceful'&&(difficulty==='hard'||this.health>2))this.damage(1,'fome')}
      const submerged=this.world.getBlock(Math.floor(p.x),Math.floor(p.y+1.6),Math.floor(p.z))===B.Water;
      if(submerged){this.air-=dt;if(this.air<=0){this.damage(2,'afogamento');this.air=0}}else this.air=Math.min(10,this.air+dt*4);
    }
    this.syncCamera();
  }
  syncCamera(){this.camera.rotation.order='YXZ';this.camera.rotation.set(this.pitch,this.yaw,0);this.camera.position.copy(this.position);this.camera.position.y+=this.crouching?1.35:1.62;if(this.grounded&&!this.flying)this.camera.position.y+=Math.sin(this.walk*2.5)*.025;}
}
