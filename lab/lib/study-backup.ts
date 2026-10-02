import type { CircuitDocument } from './types.ts';
import { validateCircuit, writeRecordsAtomic, type Progress } from './storage.ts';
import { validateTestRecord } from './test-record.ts';

export interface FullStudyBackup {
  format:'irish-electrical-lab-study';
  version:1;
  exportedAt:string;
  draft:CircuitDocument|null;
  builds:CircuitDocument[];
  progress:Progress;
}
export const BACKUP_LIMITS={bytes:32*1024*1024,builds:256,learningNodes:1_000_000,depth:12} as const;
const RESERVED=new Set(['__proto__','prototype','constructor']);
function fail(message:string):never { throw new Error('Invalid study backup: '+message); }
function plain(value:unknown,label:string):Record<string,unknown> {
  if(value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(label+' must be a plain JSON object.');
  return value as Record<string,unknown>;
}
/** Preserve future learning fields, but only bounded, finite, plain JSON data. */
function safeLearningJson(value:unknown):unknown {
  let nodes=0;
  function visit(value:unknown,depth:number):unknown {
    if(++nodes>BACKUP_LIMITS.learningNodes||depth>BACKUP_LIMITS.depth)fail('learning data exceeds its size or depth limit.');
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='string'){if(value.length>8192)fail('learning text is too long.');return value;}
    if(typeof value==='number'){if(!Number.isFinite(value))fail('learning numbers must be finite.');return value;}
    if(Array.isArray(value)){if(value.length>4096)fail('learning array is too large.');return value.map(item=>visit(item,depth+1));}
    const source=plain(value,'learning data'),result:Record<string,unknown>={};
    for(const [key,item] of Object.entries(source)){if(RESERVED.has(key)||key.length>128)fail('learning data contains an invalid key.');if(item!==undefined)result[key]=visit(item,depth+1);}
    return result;
  }
  return visit(value,0);
}
function validId(value:unknown,label:string,max=128):void{if(typeof value!=='string'||!value.trim()||value.length>max||RESERVED.has(value)||/[\u0000-\u001f]/.test(value))fail(label+' must contain a valid identity.');}
function count(value:unknown,label:string,max=Number.MAX_SAFE_INTEGER):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>max)fail(label+' must be a nonnegative integer.');return value;}
function epoch(value:unknown,label:string):void{count(value,label,8_640_000_000_000_000);}
function endpoint(value:unknown,label:string):void{const item=plain(value,label);validId(item.component,label+' component');validId(item.terminal,label+' terminal');}
function validateLearning(value:unknown):void {
  const records=plain(value,'learning');if(Object.keys(records).length>64)fail('learning exceeds 64 lessons.');
  for(const [id,value] of Object.entries(records)){
    if(!/^([1-9]|[1-5][0-9]|6[0-4])$/.test(id))fail('learning must use valid lesson IDs.');
    const record=plain(value,'lesson '+id+' learning');if(record.version!==1)fail('unsupported lesson learning version.');
    if(!Array.isArray(record.activityIds)||record.activityIds.length>512)fail('completed activities exceed the supported limit.');
    for(const activity of record.activityIds)validId(activity,'activity',256);
    const competencies=plain(record.competencies,'competencies');if(Object.keys(competencies).length>256)fail('too many lesson competencies.');
    for(const [key,value] of Object.entries(competencies)){
      validId(key,'competency');const item=plain(value,'competency '+key),attempts=count(item.attempts,'attempts',1_000_000),successes=count(item.successes,'successes',1_000_000);
      if(successes>attempts)fail('successful attempts cannot exceed total attempts.');epoch(item.lastPracticed,'last practiced');epoch(item.nextReview,'next review');
    }
    if(!Array.isArray(record.evidence)||record.evidence.length>60)fail('a lesson can contain at most 60 recorded measurements.');
    const evidenceIds=new Set<string>();
    for(const value of record.evidence){
      const item=plain(value,'measurement');validId(item.id,'measurement',1024);validId(item.circuitId,'measurement circuit');
      if(evidenceIds.has(item.id as string))fail('duplicate measurement identity.');evidenceIds.add(item.id as string);
      if(item.lessonId!==undefined&&(!Number.isSafeInteger(item.lessonId)||Number(item.lessonId)<1||Number(item.lessonId)>64))fail('measurement has an invalid lesson ID.');
      count(item.revision,'measurement revision');epoch(item.recordedAt,'measurement time');
      if(!['voltage','current','resistance'].includes(String(item.mode)))fail('unsupported measurement mode.');
      if(item.value!==null&&(typeof item.value!=='number'||!Number.isFinite(item.value)))fail('measurement value must be finite or unresolved (null).');
      if(item.status!==undefined&&!['value','open','unresolved'].includes(String(item.status)))fail('unsupported measurement status.');
      if(item.status==='value'&&item.value===null||item.status==='unresolved'&&item.value!==null||item.status==='open'&&(item.mode!=='resistance'||item.value!==null))fail('measurement status conflicts with its value or mode.');
      if(typeof item.explanation!=='string'||item.explanation.length>8192)fail('measurement explanation is invalid.');
      if(item.unit!==({voltage:'V',current:'A',resistance:'Ω'} as Record<string,string>)[String(item.mode)])fail('measurement unit does not match its mode.');
      if(item.a!==undefined)endpoint(item.a,'red probe');if(item.b!==undefined)endpoint(item.b,'black probe');if(item.wire!==undefined)validId(item.wire,'measured conductor');
      if(item.mode==='current'&&item.wire===undefined)fail('a current measurement requires a conductor identity.');
      if(item.mode!=='current'&&(item.a===undefined||item.b===undefined))fail('voltage and resistance measurements require two probe endpoints.');
      const state=plain(item.controlState,'measurement control state');if(Object.keys(state).length>8192)fail('measurement control state is too large.');
      for(const [key,value] of Object.entries(state)){validId(key,'control-state key',256);if(!['string','number','boolean'].includes(typeof value)||(typeof value==='number'&&!Number.isFinite(value)))fail('control-state values must be finite scalar parameters.');}
    }
  }
}
export function validateProgress(value:unknown):Progress {
  const source=plain(value,'progress');
  const ids=(value:unknown,label:string):number[]=>{
    if(!Array.isArray(value)||value.length>64||value.some(id=>!Number.isSafeInteger(id)||id<1||id>64))fail(label+' must contain lesson IDs from 1 to 64.');
    return Array.from(new Set(value as number[]));
  };
  const lessons=ids(source.lessons,'studied lessons'),builds=ids(source.builds,'completed builds'),faults=ids(source.faults,'diagnosed faults'),scoreSource=plain(source.scores,'scores'),scores:Record<string,number>={};
  if(Object.keys(scoreSource).length>64)fail('too many lesson scores.');
  for(const [key,score] of Object.entries(scoreSource)){if(!/^([1-9]|[1-5][0-9]|6[0-4])$/.test(key)||typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)fail('scores must be between 0 and 100 for valid lesson IDs.');scores[key]=score;}
  const result={lessons,builds,faults,scores} as Progress & Record<string,unknown>;
  // Preserve extensions through browser-to-desktop migration instead of dropping newer progress.
  for(const [key,item] of Object.entries(source))if(!['lessons','builds','faults','scores'].includes(key)){
    if(RESERVED.has(key)||key.length>128)fail('invalid progress field.');result[key]=safeLearningJson(item);
  }
  if(source.version!==undefined&&source.version!==2)fail('unsupported progress version.');
  if(source.version===2&&source.learning===undefined)fail('version 2 progress requires lesson learning records.');
  if(result.learning!==undefined)validateLearning(result.learning);
  if(result.lastTest!==undefined)result.lastTest=validateTestRecord(result.lastTest);
  return result;
}
export function validateStudyBackup(raw:unknown):FullStudyBackup {
  let value=raw;
  if(typeof raw==='string'){
    if(new TextEncoder().encode(raw).length>BACKUP_LIMITS.bytes)fail('file exceeds 32 MB.');
    try{value=JSON.parse(raw);}catch{fail('file is not valid JSON.');}
  }
  const source=plain(value,'backup');
  if(source.format!=='irish-electrical-lab-study'||source.version!==1)fail('unsupported backup format or version.');
  if(typeof source.exportedAt!=='string'||source.exportedAt.length>64||!Number.isFinite(Date.parse(source.exportedAt)))fail('export date is missing or invalid.');
  if(!Array.isArray(source.builds)||source.builds.length>BACKUP_LIMITS.builds)fail('named builds must be an array with at most 256 builds.');
  const draft=source.draft===null?null:validateCircuit(source.draft),builds=source.builds.map(validateCircuit),ids=new Set<string>();
  for(const build of builds){if(ids.has(build.id))fail('named builds have duplicate identities.');ids.add(build.id);}
  const backup:FullStudyBackup={format:'irish-electrical-lab-study',version:1,exportedAt:source.exportedAt,draft,builds,progress:validateProgress(source.progress)};
  if(new TextEncoder().encode(JSON.stringify(backup)).length>BACKUP_LIMITS.bytes)fail('backup exceeds 32 MB.');
  return backup;
}
export function exportStudyBackup(draft:CircuitDocument|null,builds:CircuitDocument[],progress:Progress):FullStudyBackup {
  return validateStudyBackup({format:'irish-electrical-lab-study',version:1,exportedAt:new Date().toISOString(),draft,builds,progress});
}
export async function restoreStudyBackup(raw:unknown,preservedBuild?:CircuitDocument):Promise<FullStudyBackup> {
  const loaded=validateStudyBackup(raw);
  // A Save-and-continue snapshot must survive replacement of the named list too.
  const backup=preservedBuild?validateStudyBackup({...loaded,builds:[preservedBuild,...loaded.builds.filter(build=>build.id!==preservedBuild.id)]}):loaded;
  await writeRecordsAtomic({draft:backup.draft,builds:backup.builds,progress:backup.progress});
  return backup;
}
