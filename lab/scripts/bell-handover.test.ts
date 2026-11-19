import assert from 'node:assert/strict';
import test from 'node:test';
import {bellHandoverStep,bellRunReady,finishBellPress,hasBellHandover,startBellPress,type BellDoor,type BellRun} from '../lib/bell-fault';
import {getLesson} from '../lib/lessons';
import {validateBookmark} from '../lib/lesson-bookmark';
import {simulate} from '../lib/simulation';
import type {CircuitDocument} from '../lib/types';

const fresh=()=>structuredClone(getLesson(72)!.circuit);
function press(doc:CircuitDocument,door:BellDoor,run?:BellRun) {
  const position=doc.components.find(c=>c.id===door)!;
  const action=startBellPress(doc,simulate(doc),door);
  position.params.pressed=!position.params.pressed;
  doc.revision+=1;
  return action?finishBellPress(doc,simulate(doc),action,run):undefined;
}

test('either door can go first; each must call the hall on its own and clear on release',()=>{
  for(const [first,second] of [['front','back'],['back','front']] as const){
    const doc=fresh();assert.ok(hasBellHandover(doc));
    const initial=bellHandoverStep(doc,simulate(doc));assert.equal(initial?.door,'back');
    let run=press(doc,first);assert.equal(run?.held,first);assert.equal(run?.[first],undefined);
    assert.equal(bellHandoverStep(doc,simulate(doc),run)?.label,'Let go of '+first+' button');
    run=press(doc,first,run);assert.equal(run?.[first],true);assert.equal(run?.held,undefined);
    assert.equal(bellHandoverStep(doc,simulate(doc),run)?.door,second);
    run=press(doc,second,run);assert.equal(bellRunReady(doc,simulate(doc),run),false);
    run=press(doc,second,run);assert.equal(bellRunReady(doc,simulate(doc),run),true);
    assert.equal(bellHandoverStep(doc,simulate(doc),run),undefined);
  }
});

test('a separate open protective conductor does not hide calls that actually reach the chime',()=>{
  const doc=fresh(),earth=doc.wires.find(w=>w.role==='PE')!;
  doc.faults=[{type:'open-wire',wire:earth.id,enabled:true}];
  let run:BellRun|undefined;
  for(const door of ['front','front','back','back'] as const)run=press(doc,door,run);
  const result=simulate(doc);
  assert.ok(bellRunReady(doc,result,run));
  assert.ok(result.diagnostics.some(d=>d.category==='protection'));
});

test('the restored supply and a release left over from diagnosis do not prove a call',()=>{
  const doc=fresh();doc.components.find(c=>c.id==='back')!.params.pressed=true;
  doc.supply.enabled=false;assert.equal(startBellPress(doc,simulate(doc),'back'),undefined);
  doc.supply.enabled=true;doc.revision++;assert.equal(simulate(doc).deviceStates.chime.call,'Rear');
  assert.equal(bellHandoverStep(doc,simulate(doc))?.label,'Let go of back button');
  const released=press(doc,'back');assert.equal(released?.back,undefined);
  assert.equal(bellRunReady(doc,simulate(doc),released),false);
});

test('both buttons together, a wrong call wire, and an open button wire cannot count',()=>{
  const doc=fresh();
  let run=press(doc,'back');run=press(doc,'front',run);
  assert.equal(simulate(doc).deviceStates.chime.call,'Both');
  run=press(doc,'front',run);run=press(doc,'back',run);
  assert.equal(run?.back,undefined);assert.equal(run?.front,undefined);
  const output=getLesson(72)!.challenge.wire;
  const correct=doc.wires.find(w=>w.id===output)!;
  const end=correct.from.component==='chime'?correct.from:correct.to;
  end.terminal='FRONT';run=press(doc,'back',run);assert.equal(simulate(doc).deviceStates.chime.call,'Front');
  assert.match(bellHandoverStep(doc,simulate(doc),run)?.instruction??'',/other door/);
  run=press(doc,'back',run);assert.equal(run?.back,undefined);
  doc.wires=doc.wires.filter(w=>w!==correct);
  run=press(doc,'back',run);assert.equal(simulate(doc).deviceStates.chime.call,'Idle');
  assert.match(bellHandoverStep(doc,simulate(doc),run)?.instruction??'',/no back call/);
  run=press(doc,'back',run);assert.equal(run?.back,undefined);
});

const saved=(doc:CircuitDocument,run?:BellRun)=>({version:1,circuit:doc,path:'full',mode:'challenges',activityId:'lesson:72:fault:retest',fault:{accepted:true,repaired:true,scored:false,hints:0,chime:true,...(run?{bellRun:run}:{})}});
test('partial handover resumes at a deliberate release; stale samples and edits lose their proof',()=>{
  const doc=fresh();let run=press(doc,'front');const partial=validateBookmark(saved(doc,run));
  assert.deepEqual(partial.fault?.bellRun,run);
  run=press(doc,'front',partial.fault?.bellRun);const last=simulate(doc);
  const action=startBellPress(doc,last,'back')!;assert.ok(action);
  doc.revision++;doc.components.find(c=>c.id==='back')!.params.pressed=true;
  assert.deepEqual(finishBellPress(doc,last,action,run),run);
  assert.deepEqual(finishBellPress({...doc,id:'another'},simulate(doc),action,run),run);
  assert.equal(startBellPress(doc,last,'back'),undefined);
  run=finishBellPress(doc,simulate(doc),action,run);run=press(doc,'back',run);
  assert.ok(bellRunReady(doc,simulate(doc),run));
  doc.revision++;assert.equal(bellRunReady(doc,simulate(doc),run),false);
  let restarted=press(doc,'back',run);restarted=press(doc,'back',restarted);assert.equal(restarted?.front,undefined);
  const old=saved(doc);assert.deepEqual(validateBookmark({...old,fault:{...old.fault,completed:true}}).fault,{...old.fault,completed:true});
  doc.components.find(c=>c.id==='chime')!.variant=undefined;
  assert.equal(hasBellHandover(doc),false);assert.equal(startBellPress(doc,simulate(doc),'back'),undefined);
  assert.throws(()=>validateBookmark(saved(doc,restarted)),/fault exercise/);
});

test('malformed new handover fields are rejected while old completed bookmarks still load',()=>{
  const doc=fresh(),old=saved(doc);
  for(const bad of [{revision:doc.revision+1},{revision:0,front:'called'},{revision:0,held:'rear'},{}]){
    assert.throws(()=>validateBookmark({...old,fault:{...old.fault,bellRun:bad}}),/fault exercise/);
  }
  assert.equal(validateBookmark({...old,fault:{...old.fault,completed:true}}).fault?.completed,true);
});
