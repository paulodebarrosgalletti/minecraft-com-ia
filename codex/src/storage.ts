import { BLOCKS } from './registry';
import { validStack, SMELT_TIME } from './inventory';
import type { SaveData } from './shared';

const DB_NAME='blockcraft-worlds',STORE='worlds',FALLBACK_KEY='blockcraft-worlds-v1';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
const coordinate=(v:unknown)=>finite(v)&&Math.abs(v as number)<=30000000;
const key=(s:string)=>/^-?\d+,-?\d+,-?\d+$/.test(s)&&s.split(',').every(n=>coordinate(Number(n)));
const text=(v:unknown,max:number,min=0)=>typeof v==='string'&&v.length>=min&&v.length<=max;
const slots=(v:unknown,length:number)=>Array.isArray(v)&&v.length===length&&v.every(s=>s===null||validStack(s));
const enumValue=(v:unknown,values:string[])=>typeof v==='string'&&values.includes(v);
const clone=<T>(v:T):T=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));

/** Reject partial/corrupt worlds before they can replace a working save. */
export function validateSave(value:unknown):asserts value is SaveData {
  const fail=(part:string):never=>{throw new Error(`Mundo salvo inválido: ${part}.`);};
  if(!object(value)||value.version!==1)fail('versão não suportada');
  const s=value as unknown as SaveData,c=s.config,p=s.player;
  if(!object(c)||!text(c.id,128,1)||!text(c.name,100,1)||!text(c.seed,256)||
    !enumValue(c.mode,['survival','creative'])||!enumValue(c.difficulty,['peaceful','easy','normal','hard'])||
    !enumValue(c.type,['default','flat'])||!finite(c.created)||c.created<0||!finite(c.lastPlayed)||c.lastPlayed<0||
    (c.thumbnail!==undefined&&!text(c.thumbnail,1000000)))fail('configurações');
  if(!object(p)||![p.x,p.y,p.z].every(coordinate)||![p.yaw,p.pitch,p.health,p.hunger].every(finite)||
    p.health<0||p.health>20||p.hunger<0||p.hunger>20||!slots(p.inventory,36)||
    !Number.isInteger(p.selected)||p.selected<0||p.selected>8||typeof p.flying!=='boolean'||
    !Array.isArray(p.spawn)||p.spawn.length!==3||!p.spawn.every(coordinate))fail('jogador ou inventário');
  if(!finite(s.time)||s.time<0)fail('horário');
  if(!object(s.edits)||Object.entries(s.edits).some(([k,v])=>!key(k)||!Number.isInteger(v)||!Object.hasOwn(BLOCKS,v)))fail('blocos modificados');
  if(!object(s.chests)||Object.entries(s.chests).some(([k,v])=>!key(k)||!slots(v,27)))fail('baús');
  if(!object(s.furnaces)||Object.entries(s.furnaces).some(([k,f])=>!key(k)||!object(f)||!slots(f.slots,3)||
    !finite(f.burn)||f.burn<0||f.burn>100000||!finite(f.progress)||f.progress<0||f.progress>SMELT_TIME))fail('fornalhas');
  if(!object(s.doors)||Object.entries(s.doors).some(([k,v])=>!key(k)||typeof v!=='boolean'))fail('portas');
}

function errorMessage(error:unknown):string{return error instanceof Error?error.message:String(error);}
export class SaveManager {
  static lastWarning='';
  private static connection:Promise<IDBDatabase|null>|undefined;
  private static warn(message:string):void {
    this.lastWarning=message;
    console.warn(message);
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('blockcraft-storage-warning',{detail:message}));
  }
  private static async database():Promise<IDBDatabase|null> {
    if(!this.connection)this.connection=new Promise((resolve)=>{
      if(typeof indexedDB==='undefined'){resolve(null);return;}
      let request:IDBOpenDBRequest;
      try{request=indexedDB.open(DB_NAME,1);}catch(error){this.warn(`IndexedDB indisponível. Usando armazenamento local: ${errorMessage(error)}`);resolve(null);return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'config.id'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();this.connection=undefined;};
        resolve(db);
      };
      request.onerror=()=>{this.warn(`IndexedDB indisponível. Usando armazenamento local: ${request.error?.message??'erro desconhecido'}`);resolve(null);};
      request.onblocked=()=>{
        this.warn('O banco de mundos está bloqueado. Usando armazenamento local; feche outras abas antigas do jogo.');
        request.onsuccess=()=>request.result.close();
        resolve(null);
      };
    });
    return this.connection;
  }
  private static local():Storage {
    try{if(typeof localStorage!=='undefined')return localStorage;}catch{/* Denied browser storage is reported below. */}
    throw new Error('O navegador não disponibilizou IndexedDB nem armazenamento local. O mundo não pôde ser salvo.');
  }
  private static readLocal():Record<string,unknown> {
    const raw=this.local().getItem(FALLBACK_KEY);
    if(!raw)return Object.create(null) as Record<string,unknown>;
    let data:unknown;
    try{data=JSON.parse(raw);}catch{throw new Error('O armazenamento local dos mundos está corrompido. Exporte os dados do navegador antes de restaurá-lo.');}
    if(!object(data))throw new Error('Formato inválido do armazenamento local dos mundos.');
    return Object.assign(Object.create(null),data) as Record<string,unknown>;
  }
  private static writeLocal(data:Record<string,unknown>):void {
    try{this.local().setItem(FALLBACK_KEY,JSON.stringify(data));}
    catch(error){throw new Error(`Falha ao salvar no armazenamento local: ${errorMessage(error)}`);}
  }
  private static transaction<T>(db:IDBDatabase,mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
    return new Promise((resolve,reject)=>{
      let tx:IDBTransaction,request:IDBRequest<T>;
      try{tx=db.transaction(STORE,mode);request=action(tx.objectStore(STORE));}
      catch(error){reject(new Error(`Falha ao acessar mundos salvos: ${errorMessage(error)}`));return;}
      tx.oncomplete=()=>resolve(request.result);
      tx.onerror=()=>reject(new Error(`Falha no banco de mundos: ${tx.error?.message??request.error?.message??'erro de armazenamento'}`));
      tx.onabort=()=>reject(new Error(`A gravação do mundo foi cancelada: ${tx.error?.message??'transação interrompida'}`));
    });
  }
  static async list():Promise<SaveData[]> {
    const db=await this.database();
    const values:unknown[]=db?await this.transaction(db,'readonly',store=>store.getAll()):Object.values(this.readLocal());
    const result:SaveData[]=[];
    for(const value of values) {
      try{validateSave(value);result.push(clone(value));}
      catch(error){this.warn(`Um mundo corrompido não foi listado: ${errorMessage(error)}`);}
    }
    return result.sort((a,b)=>b.config.lastPlayed-a.config.lastPlayed);
  }
  static async load(id:string):Promise<SaveData|undefined> {
    if(!text(id,128,1))throw new Error('Identificador do mundo inválido.');
    const db=await this.database(),value:unknown=db?await this.transaction(db,'readonly',store=>store.get(id)):this.readLocal()[id];
    if(value===undefined)return undefined;
    validateSave(value);
    if(value.config.id!==id)throw new Error('O identificador do mundo salvo não corresponde ao solicitado.');
    return clone(value);
  }
  static async save(data:SaveData):Promise<void> {
    validateSave(data);
    const value=clone(data),db=await this.database();
    if(db){await this.transaction(db,'readwrite',store=>store.put(value));return;}
    const all=this.readLocal();all[value.config.id]=value;this.writeLocal(all);
  }
  static async delete(id:string):Promise<void> {
    if(!text(id,128,1))throw new Error('Identificador do mundo inválido.');
    const db=await this.database();
    if(db){await this.transaction(db,'readwrite',store=>store.delete(id));return;}
    const all=this.readLocal();delete all[id];this.writeLocal(all);
  }
  list(){return SaveManager.list();}
  load(id:string){return SaveManager.load(id);}
  save(data:SaveData){return SaveManager.save(data);}
  delete(id:string){return SaveManager.delete(id);}
}
