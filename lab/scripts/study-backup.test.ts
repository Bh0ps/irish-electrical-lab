import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../lib/lessons.ts';
import { EMPTY_PROGRESS, readRecord, writeRecordsAtomic } from '../lib/storage.ts';
import { exportStudyBackup, validateStudyBackup, restoreStudyBackup } from '../lib/study-backup.ts';
import { captureTestRecord } from '../lib/test-record.ts';
const fixture=()=>exportStudyBackup(structuredClone(LESSONS[6].circuit),[structuredClone(LESSONS[7].circuit)],{lessons:[7],builds:[7],faults:[],scores:{7:85},version:2,learning:{7:{version:1,activityIds:['inspect'],competencies:{switching:{attempts:2,successes:1,lastPracticed:1,nextReview:2}},evidence:[{id:'measurement1',lessonId:7,circuitId:'lesson-7',revision:3,mode:'voltage',a:{component:'lamp',terminal:'L'},b:{component:'lamp',terminal:'N'},value:240,unit:'V',explanation:'Across lamp',recordedAt:1,controlState:{'switch.position':1}}]}}} as typeof EMPTY_PROGRESS);
test('Save and continue retains the current snapshot when a full backup replaces named builds',async()=>{
  const backup=fixture(),current={...structuredClone(LESSONS[9].circuit),id:'preserved-current-build',name:'My saved changes'};
  const restored=await restoreStudyBackup(JSON.stringify(backup),current);
  assert.deepEqual(restored.draft,backup.draft);
  assert.deepEqual(await readRecord('builds'),[current,...backup.builds]);
  assert.deepEqual(await readRecord('progress'),backup.progress);
});
test('an overflowing or invalid preserved snapshot cannot partially restore study records',async()=>{
  const backup=fixture();await writeRecordsAtomic({draft:backup.draft,builds:backup.builds,progress:backup.progress});
  const full={...backup,builds:Array.from({length:256},(_,index)=>({...structuredClone(backup.builds[0]),id:'full-'+index}))};
  await assert.rejects(restoreStudyBackup(full,{...backup.draft!,id:'extra-preserved'}),/256 builds/);
  const invalid=structuredClone(backup.draft!);invalid.wires[0].to.component='missing';
  await assert.rejects(restoreStudyBackup(backup,invalid),/component/);
  assert.deepEqual(await readRecord('draft'),backup.draft);assert.deepEqual(await readRecord('builds'),backup.builds);assert.deepEqual(await readRecord('progress'),backup.progress);
});
test('full study backup preserves browser circuits and all validated progress extensions',()=>{
  const source=fixture(),loaded=validateStudyBackup(JSON.stringify(source));assert.deepEqual(loaded,source);assert.notEqual(loaded.draft,source.draft);assert.notEqual(loaded.progress,source.progress);
});
test('every published circuit can be backed up and restored without changing connections',()=>{
  for(const lesson of LESSONS){const backup=exportStudyBackup(lesson.circuit,[],EMPTY_PROGRESS);assert.deepEqual(validateStudyBackup(JSON.stringify(backup)).draft,lesson.circuit);}
});
test('unsupported backup versions, malformed circuits and invalid progress reject before restore',()=>{
  for(const mutate of [(b:ReturnType<typeof fixture>)=>b.version=2 as 1,(b:ReturnType<typeof fixture>)=>b.draft!.wires[0].to.component='missing',(b:ReturnType<typeof fixture>)=>b.progress.lessons=[65],(b:ReturnType<typeof fixture>)=>b.progress.scores={'1':Infinity}]){
    const backup=fixture();mutate(backup);assert.throws(()=>validateStudyBackup(backup));
  }
  assert.throws(()=>validateStudyBackup('{bad-json'));assert.throws(()=>validateStudyBackup({version:1}));
});
test('duplicate named builds and unsafe or oversized learning structures reject',()=>{
  const backup=fixture();backup.builds.push(structuredClone(backup.builds[0]));assert.throws(()=>validateStudyBackup(backup),/duplicate/);
  const unsafe=fixture();Object.assign(unsafe.progress,{learning:JSON.parse('{"__proto__":{"bad":true}}')});assert.throws(()=>validateStudyBackup(unsafe),/invalid key/);
  const large=fixture();Object.assign(large.progress,{learning:Array(4097).fill(1)});assert.throws(()=>validateStudyBackup(large),/large/);
});
test('restore commits draft builds and progress atomically and preserves current work after invalid import',async()=>{
  const backup=fixture();await restoreStudyBackup(backup);assert.deepEqual(await readRecord('draft'),backup.draft);assert.deepEqual(await readRecord('builds'),backup.builds);assert.deepEqual(await readRecord('progress'),backup.progress);
  const bad=fixture();bad.draft!.wires[0].from.terminal='absent';await assert.rejects(()=>restoreStudyBackup(bad));assert.deepEqual(await readRecord('draft'),backup.draft);assert.deepEqual(await readRecord('builds'),backup.builds);assert.deepEqual(await readRecord('progress'),backup.progress);
});
test('a failed IndexedDB write aborts all pending writes rather than partially replacing work',async()=>{
  await writeRecordsAtomic({transactionTest:'original'});await assert.rejects(()=>writeRecordsAtomic({transactionTest:'changed',uncloneable:()=>{}}));assert.equal(await readRecord('transactionTest'),'original');
});
test('known learning fields require supported versions, consistent attempts and real measurement contracts',()=>{
  for(const mutate of [(b:ReturnType<typeof fixture>)=>Object.assign(b.progress,{version:3}),(b:ReturnType<typeof fixture>)=>Object.assign((b.progress as unknown as {learning:Record<string,object>}).learning[7],{version:2}),(b:ReturnType<typeof fixture>)=>Object.assign((b.progress as unknown as {learning:Record<string,{competencies:Record<string,object>}>}).learning[7].competencies.switching,{successes:3}),(b:ReturnType<typeof fixture>)=>Object.assign((b.progress as unknown as {learning:Record<string,{evidence:object[]}>}).learning[7].evidence[0],{mode:'amps'}),(b:ReturnType<typeof fixture>)=>Object.assign((b.progress as unknown as {learning:Record<string,{evidence:object[]}>}).learning[7].evidence[0],{unit:'A'})]){const backup=fixture();mutate(backup);assert.throws(()=>validateStudyBackup(backup));}
});
test('isolated open-resistance evidence transfers without inventing a finite reading',()=>{
  const backup=fixture(),learning=(backup.progress as unknown as {learning:Record<string,{evidence:Record<string,unknown>[]}>}).learning;
  Object.assign(learning[7].evidence[0],{mode:'resistance',unit:'Ω',value:null,status:'open',explanation:'Open circuit: no conductive path.',controlState:{'supply.enabled':false}});
  assert.deepEqual(validateStudyBackup(JSON.stringify(backup)),backup);
  for(const status of ['value','unknown']){const bad=structuredClone(backup);(bad.progress as unknown as {learning:Record<string,{evidence:Record<string,unknown>[]}>}).learning[7].evidence[0].status=status;assert.throws(()=>validateStudyBackup(bad),/status/);}
  const wrong=structuredClone(backup);Object.assign((wrong.progress as unknown as {learning:Record<string,{evidence:Record<string,unknown>[]}>}).learning[7].evidence[0],{mode:'voltage',unit:'V'});assert.throws(()=>validateStudyBackup(wrong),/status/);
});

test('persistent test reports migrate with their electrical identity and reject invalid assessment claims',()=>{
  const backup=fixture(),record=captureTestRecord(backup.draft!,{circuitId:backup.draft!.id,revision:backup.draft!.revision,passed:true,summary:'Operating check passed.',checks:[{id:'operating',category:'operation',status:'pass',title:'Declared load operates',explanation:'The measured operating state matched the objective.'}]},1);
  Object.assign(backup.progress,{lastTest:record});assert.deepEqual(validateStudyBackup(JSON.stringify(backup)),backup);
  const wrongStatus=structuredClone(backup);(wrongStatus.progress as unknown as {lastTest:typeof record}).lastTest.assessment.checks[0].status='fail';assert.throws(()=>validateStudyBackup(wrongStatus),/saved test report/);
  const unknownVersion=structuredClone(backup);Object.assign((unknownVersion.progress as unknown as {lastTest:typeof record}).lastTest,{version:2});assert.throws(()=>validateStudyBackup(unknownVersion),/saved test report/);
});
