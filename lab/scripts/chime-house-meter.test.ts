import assert from 'node:assert/strict';
import test from 'node:test';
import { getLesson } from '../lib/lessons';
import { HOUSE_CALLS, checkCallSample, chimeTask, houseStepId, savedCallStep, verifiedCallStep } from '../lib/house-calls';
import { captureMeasurement } from '../lib/learning';
import { forkRead, instrumentData } from '../lib/fork-tester';
import { validateBookmark } from '../lib/lesson-bookmark';
import { simulate } from '../lib/simulation';
import type { CircuitDocument } from '../lib/types';

const call=HOUSE_CALLS.find(c=>c.lesson===72)!;
const original=getLesson(72)!.circuit;
const held=(doc:CircuitDocument,front:boolean,back=false)=>({...doc,revision:doc.revision+1,components:doc.components.map(c=>c.id==='front'||c.id==='back'?{...c,params:{...c.params,pressed:c.id==='front'?front:back}}:c)});
const pair=(pin:string,component='chime')=>({component,terminal:pin});
const idle=held(original,false),front=held(original,true);
const index=(name:'front-held'|'front-released'|'supply')=>call.steps.findIndex(s=>s.chimeReading===name);
function record(doc:CircuitDocument,i:number,a=pair('FRONT'),b=pair('AC2'),tester=true){
  const result=simulate(doc),setup={method:'probe-voltage' as const,reference:'none' as const,a,b};
  const instrument=tester?instrumentData(setup,forkRead(doc,result,setup)):undefined;
  const evidence={...captureMeasurement(doc,result,{mode:'voltage',a,b,instrument}),assisted:false};
  return {activity:houseStepId(call,i),evidence};
}

test('measuring the chime requires the actual input or supply pair in the requested button state',()=>{
  for(const instrument of [true,false])for(const reverse of [true,false]){
    for(const [name,doc,pin,expect] of [['front-held',front,'FRONT',12],['front-released',idle,'FRONT',0],['supply',idle,'AC1',12]] as const){
      const i=index(name),r=simulate(doc),sample=record(doc,i,pair(reverse?'AC2':pin),pair(reverse?pin:'AC2'),instrument);
      assert.equal(Math.round(sample.evidence.value!),expect);
      if(instrument)assert.equal(sample.evidence.instrument?.signal,'AC');
      const verdict=checkCallSample(call,i,doc,r,sample);
      assert.ok(verdict?.pass);
      assert.match(verdict.message,new RegExp('^'+expect+' V AC'));
      assert.equal(verifiedCallStep(call,i,doc,r),false);
    }
  }
});

test('an equal voltage on another terminal is useful feedback but does not answer the chime check',()=>{
  const i=index('front-held'),result=simulate(front);
  for(const other of [pair('AC1'),pair('+','tx')]){
    const sample=record(front,i,other);
    assert.equal(Math.round(sample.evidence.value!),12);
    const verdict=checkCallSample(call,i,front,result,sample);assert.equal(verdict?.pass,false);assert.match(verdict!.message,/C1/);
  }
  const supply=index('supply'),zero=index('front-released'),wrongZero=record(idle,zero,pair('REAR'));
  assert.equal(Math.round(wrongZero.evidence.value!),0);
  assert.equal(checkCallSample(call,zero,idle,simulate(idle),wrongZero)?.pass,false);
  assert.equal(checkCallSample(call,supply,front,result,record(front,supply,pair('AC1')))?.pass,false);
  assert.equal(checkCallSample(call,i,idle,simulate(idle),record(idle,i))?.pass,false);
  const both=held(original,true,true);
  assert.equal(checkCallSample(call,i,both,simulate(both),record(both,i))?.pass,false);
});

test('chime meter checks reject assisted, stale, forged, unresolved and wrong-method readings',()=>{
  const i=index('front-held'),sample=record(front,i),result=simulate(front),e=sample.evidence;
  for(const evidence of [{...e,assisted:true},{...e,revision:e.revision-1},{...e,circuitId:'other'},{...e,value:7},{...e,mode:'current' as const},{...e,mode:'resistance' as const},{...e,value:null,status:'unresolved' as const}]){
    assert.ok(!checkCallSample(call,i,front,result,{...sample,evidence})?.pass);
  }
  assert.ok(!checkCallSample(call,i,front,{...result,converged:false},sample)?.pass);
  assert.ok(!checkCallSample(call,i,front,simulate(original),sample)?.pass);
  assert.ok(!checkCallSample(call,i,front,result,{...sample,activity:'book:72:call-0'})?.pass);
  assert.ok(!checkCallSample(call,i,front,result)?.pass);
  const cross={...front,wires:front.wires.filter(w=>w.to.component!=='chime'||w.to.terminal!=='FRONT')};
  assert.ok(!checkCallSample(call,i,cross,simulate(cross),record(cross,i))?.pass);
  const tooHigh={...front,components:front.components.map(c=>c.id==='tx'?{...c,params:{...c.params,outputVoltage:24}}:c)};
  assert.ok(!checkCallSample(call,i,tooHigh,simulate(tooHigh),record(tooHigh,i))?.pass);
  const dc={...front,components:front.components.map(c=>c.id==='tx'?{...c,type:'driver'}:c)};
  assert.ok(!checkCallSample(call,i,dc,simulate(dc),record(dc,i))?.pass);
});

test('old chime saves keep their four markings, old operation bookmarks and existing completion',()=>{
  const doc={...front,components:front.components.map(c=>c.id==='chime'?{...c,variant:undefined,label:'Two-input AC chime'}:c)};
  const marks=chimeTask(call.steps[index('front-held')],doc);
  assert.match(marks,/FRONT to AC2/);assert.ok(chimeTask(call.steps[index('front-held')],original).includes('C1 to =/~'));
  assert.equal(getLesson(72,doc)?.circuit.components.find(c=>c.id==='chime')?.variant,undefined);
  assert.equal(getLesson(72)?.circuit.components.find(c=>c.id==='chime')?.variant,'croma-100a');
  for(const [oldId,target,state] of [[0,'front',true],[1,'front',false],[2,'back',true],[3,'back',false]] as const){
    const bookmark=validateBookmark({version:1,circuit:doc,activityId:'book:72:call-'+oldId,path:'coursebook',mode:'explore'});
    const i=savedCallStep(call,bookmark.activityId)!;
    assert.equal(call.steps[i].target,target);assert.equal(call.steps[i].pressed,state);
    assert.equal(bookmark.circuit.components.find(c=>c.id==='chime')?.variant,undefined);
  }
  assert.equal(savedCallStep(call,'book:72:call-4'),call.steps.length);
});
