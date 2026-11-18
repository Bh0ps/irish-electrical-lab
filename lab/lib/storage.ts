import { lessonIdLimit } from './elv-coursebook.ts';
import type { CableCore, CableRun, CircuitDocument, ComponentInstance, Endpoint, FaultSetting, Parameters, TerminalRole, Vec3, Wire } from './types.ts';
import { cableCores, isSheathKind, markedRole } from './cables.ts';
import { COMPONENTS } from './components.ts';
import { mountError, normalizeBoardMounts } from './board-assembly.ts';
export interface Progress { lessons: number[]; builds: number[]; faults: number[]; scores: Record<string,number> }
export const EMPTY_PROGRESS: Progress = { lessons:[], builds:[], faults:[], scores:{} };
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve,reject)=>{
    const req=indexedDB.open('irish-electrical-lab',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('records');
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
export async function readRecord<T>(key:string):Promise<T|undefined> {
  const d=await db(); return new Promise((resolve,reject)=>{const r=d.transaction('records').objectStore('records').get(key); r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
export async function writeRecord(key:string,value:unknown) {
  const d=await db();return new Promise<void>((resolve,reject)=>{const t=d.transaction('records','readwrite');t.objectStore('records').put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});
}
/** All writes commit together; a failed transaction leaves every existing record intact. */
export async function writeRecordsAtomic(records:Record<string,unknown>):Promise<void> {
  const d=await db();return new Promise((resolve,reject)=>{
    const transaction=d.transaction('records','readwrite'),store=transaction.objectStore('records');
    try{for(const [key,value] of Object.entries(records))store.put(value,key);}catch(error){transaction.abort();reject(error);return;}
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??new Error('Study restore was aborted; existing work was preserved.'));
  });
}
export const IMPORT_LIMITS = { components:80, wires:300, faults:300, bendsPerWire:32, parametersPerComponent:100, coordinateMagnitude:10000 } as const;
const ROLES = new Set<TerminalRole>(['L','N','PE','L1','L2','L3','control','output','DC+','DC-']);
const OPEN_FAULTS = new Set(['open','open-wire','open-live','open-neutral','open-cpc','missing-earth','phase-loss','wrong-control']);
const COMPONENT_FAULTS = new Set(['short-circuit','earth-fault','overload','stuck-contact']);
const RESERVED = new Set(['__proto__','prototype','constructor']);
type ObjectValue = Record<string,unknown>;
function invalid(path:string, detail:string):never { throw new Error(`Invalid circuit import: ${path} ${detail}`); }
function object(value:unknown,path:string):ObjectValue {
  if(value===null||typeof value!=='object'||Array.isArray(value))return invalid(path,'must be an object.');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)return invalid(path,'must contain plain JSON data.');
  return value as ObjectValue;
}
function text(value:unknown,path:string,max=256,nonempty=true):string {
  if(typeof value!=='string'||value.length>max||(nonempty&&!value.trim()))return invalid(path,`must be ${nonempty?'a nonempty':'a'} string of at most ${max} characters.`);
  return value;
}
function identity(value:unknown,path:string):string {
  const id=text(value,path,128);
  if(RESERVED.has(id)||id.startsWith('@')||/[\u0000-\u001f]/.test(id))return invalid(path,'uses a reserved or control-character identity.');
  return id;
}
function finite(value:unknown,path:string,min=-Infinity,max=Infinity):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return invalid(path,`must be a finite number${Number.isFinite(min)||Number.isFinite(max)?` in the range ${min} to ${max}`:''}.`);
  return value;
}
function boolean(value:unknown,path:string):boolean { return typeof value==='boolean'?value:invalid(path,'must be true or false.'); }
function integer(value:unknown,path:string,min:number,max:number):number { const n=finite(value,path,min,max);return Number.isSafeInteger(n)?n:invalid(path,'must be an integer.'); }
function array(value:unknown,path:string,limit:number):unknown[] {
  if(!Array.isArray(value))return invalid(path,'must be an array.');
  if(value.length>limit)return invalid(path,`exceeds the ${limit}-item limit.`);
  for(let i=0;i<value.length;i++)if(!(i in value))return invalid(`${path}[${i}]`,'must not be an array hole.');
  return value;
}
function vector(value:unknown,path:string):Vec3 {
  const v=array(value,path,3);if(v.length!==3)return invalid(path,'must have exactly three coordinates.');
  return v.map((axis,i)=>finite(axis,`${path}[${i}]`,-IMPORT_LIMITS.coordinateMagnitude,IMPORT_LIMITS.coordinateMagnitude)) as Vec3;
}
function equipmentParameters(value:unknown,path:string):Parameters {
  const record=object(value,path),entries=Object.entries(record);
  if(entries.length>IMPORT_LIMITS.parametersPerComponent)return invalid(path,'contains too many equipment parameters.');
  const result:Parameters={};
  for(const [key,value] of entries){
    text(key,`${path} key`,128);if(RESERVED.has(key))return invalid(`${path}.${key}`,'uses a reserved parameter name.');
    if(typeof value==='number')result[key]=finite(value,`${path}.${key}`);
    else if(typeof value==='boolean')result[key]=value;
    else if(typeof value==='string')result[key]=text(value,`${path}.${key}`,4096,false);
    else return invalid(`${path}.${key}`,'must be a string, finite number or boolean; nested data is not supported.');
  }
  return result;
}

/** Validate everything before returning a detached document. The caller can commit only after success. */
export function validateCircuit(value:unknown):CircuitDocument {
  const d=object(value,'document');
  if(d.version!==1)return invalid('version','must be 1. This import uses an unsupported or missing circuit version.');
  const id=identity(d.id,'id'),name=text(d.name,'name'),revision=integer(d.revision,'revision',0,Number.MAX_SAFE_INTEGER);
  const supply=object(d.supply,'supply');
  const enabled=boolean(supply.enabled,'supply.enabled');
  if(supply.phase!=='single'&&supply.phase!=='three')return invalid('supply.phase','must be single or three.');
  const phase=supply.phase,voltage=finite(supply.voltage,'supply.voltage',1,500),frequency=finite(supply.frequency,'supply.frequency',1,1000),sourceResistance=finite(supply.sourceResistance,'supply.sourceResistance',.01,1000);
  const componentValues=array(d.components,'components',IMPORT_LIMITS.components),wireValues=array(d.wires,'wires',IMPORT_LIMITS.wires),faultValues=array(d.faults,'faults',IMPORT_LIMITS.faults);
  const components:ComponentInstance[]=[],byId=new Map<string,ComponentInstance>();
  componentValues.forEach((value,index)=>{
    const path=`components[${index}]`,c=object(value,path),id=identity(c.id,`${path}.id`),type=text(c.type,`${path}.type`,128);
    if(!Object.prototype.hasOwnProperty.call(COMPONENTS,type))return invalid(`${path}.type`,'does not name supported equipment.');
    if(byId.has(id))return invalid(`${path}.id`,'duplicates another component identity.');
    const component:ComponentInstance={id,type,label:text(c.label,`${path}.label`),position:vector(c.position,`${path}.position`),rotation:finite(c.rotation,`${path}.rotation`,-1000000,1000000),params:equipmentParameters(c.params,`${path}.params`)};
    if(c.variant!==undefined)component.variant=text(c.variant,`${path}.variant`,256,false);
    if(c.mount!==undefined){
      const m=object(c.mount,`${path}.mount`);
      component.mount={board:identity(m.board,`${path}.mount.board`),row:integer(m.row,`${path}.mount.row`,0,9),slot:integer(m.slot,`${path}.mount.slot`,0,12)};
    }
    components.push(component);byId.set(id,component);
  });
  for(const component of components){
    if(component.mount){const problem=mountError(components,component,component.mount);if(problem)return invalid('mount',problem);}
    const partner=component.params.mechanicallyInterlockedWith;
    if(partner!==undefined&&partner!==''){
      if(component.type!=='contactor'||typeof partner!=='string'||partner===component.id||byId.get(partner)?.type!=='contactor')return invalid(`component ${component.id} mechanicallyInterlockedWith`,'must reference another existing contactor.');
    }
  }
  const endpoint=(value:unknown,path:string):Endpoint=>{
    const e=object(value,path),component=identity(e.component,`${path}.component`),terminal=text(e.terminal,`${path}.terminal`,128),owner=byId.get(component);
    if(!owner||!COMPONENTS[owner.type].terminals.some(t=>t.id===terminal))return invalid(path,'references a missing component or terminal.');
    return {component,terminal};
  };
  const runIds=new Set<string>(), occupiedCores=new Set<string>();
  const cableRuns: CableRun[] | undefined = d.cableRuns===undefined ? undefined : array(d.cableRuns,'cableRuns',300).map((value,index)=>{
    const path=`cableRuns[${index}]`, record=object(value,path), id=identity(record.id,path+'.id');
    if(runIds.has(id))return invalid(path+'.id','duplicates another cable.');runIds.add(id);
    if(!isSheathKind(record.kind))return invalid(path+'.kind','must identify a supported cable.');
    const from=endpoint(record.from,path+'.from'),to=endpoint(record.to,path+'.to');
    if(from.component===to.component)return invalid(path,'needs two different equipment entries.');
    return {id,kind:record.kind,from,to};
  });
  const wires:Wire[]=[],wireIds=new Set<string>();
  wireValues.forEach((value,index)=>{
    const path=`wires[${index}]`,w=object(value,path),id=identity(w.id,`${path}.id`);
    if(wireIds.has(id))return invalid(`${path}.id`,'duplicates another wire identity.');wireIds.add(id);
    const from=endpoint(w.from,`${path}.from`),to=endpoint(w.to,`${path}.to`);
    if(from.component===to.component&&from.terminal===to.terminal)return invalid(path,'cannot connect a terminal to itself.');
    if(typeof w.role!=='string'||!ROLES.has(w.role as TerminalRole))return invalid(`${path}.role`,'does not name a supported conductor role.');
    const resistance=finite(w.resistance,`${path}.resistance`,Number.MIN_VALUE,1e9),bends=array(w.bends,`${path}.bends`,IMPORT_LIMITS.bendsPerWire).map((bend,i)=>vector(bend,`${path}.bends[${i}]`));
    const wire: Wire = {id,from,to,role:w.role as TerminalRole,resistance,bends};
    if(w.cable!==undefined){
      const c=object(w.cable,path+'.cable'), runId=identity(c.runId,path+'.cable.runId');
      if(!runIds.has(runId))return invalid(path+'.cable.runId','references a missing cable.');
      if(!cableCores(cableRuns!.find(r=>r.id===runId)!.kind).includes(c.core as CableCore))return invalid(path+'.cable.core','does not identify a supported core.');
      const core=c.core as CableCore,key=runId+'\u0000'+core;
      if(markedRole(core,wire.role)!==wire.role)return invalid(path+'.role','does not match the marked cable core.');
      if(occupiedCores.has(key))return invalid(path+'.cable.core','has already been terminated in this cable.');
      occupiedCores.add(key);
      wire.cable={runId,core,reversed:boolean(c.reversed,path+'.cable.reversed')};
    }
    // Before AC secondary markings were available, the supplied doorbell example
    // used DC conductor identification. Migrate only the original named wires.
    if(d.lessonId===43&&!wire.cable){
      const pairs:Record<string,[string,string,TerminalRole]>={w6:['tx.+','push.COM','DC+'],w7:['push.NO','chime.L','DC+'],w8:['tx.-','chime.N','DC-']};
      const expected=pairs[wire.id],actual=[from.component+'.'+from.terminal,to.component+'.'+to.terminal];
      if(expected&&wire.role===expected[2]&&actual.includes(expected[0])&&actual.includes(expected[1]))wire.role='output';
    }
    wires.push(wire);
  });
  const faults:FaultSetting[]=faultValues.map((value,index)=>{
    const path=`faults[${index}]`,f=object(value,path),type=text(f.type,`${path}.type`,128);
    if(!OPEN_FAULTS.has(type)&&!COMPONENT_FAULTS.has(type))return invalid(`${path}.type`,'does not name a supported fault setting.');
    const enabled=boolean(f.enabled,`${path}.enabled`),fault:FaultSetting={type,enabled};
    if(f.component!==undefined){fault.component=identity(f.component,`${path}.component`);if(!byId.has(fault.component))return invalid(`${path}.component`,'references missing equipment.');}
    if(f.wire!==undefined){fault.wire=identity(f.wire,`${path}.wire`);if(!wireIds.has(fault.wire))return invalid(`${path}.wire`,'references a missing wire.');}
    if(COMPONENT_FAULTS.has(type)&&!fault.component)return invalid(path,'requires an equipment target.');
    if(OPEN_FAULTS.has(type)&&!fault.component&&!fault.wire)return invalid(path,'requires a wire or equipment target.');
    return fault;
  });
  const document:CircuitDocument={version:1,id,name,revision,supply:{enabled,phase,voltage,frequency,sourceResistance},components,wires,faults};
  if(cableRuns!==undefined)document.cableRuns=cableRuns;
  if(d.lessonId!==undefined)document.lessonId=integer(d.lessonId,'lessonId',1,lessonIdLimit);
  return normalizeBoardMounts(document);
}
export function downloadCircuit(doc:CircuitDocument){const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=doc.name.replace(/[^a-z0-9]+/gi,'-')+'.electrical.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
