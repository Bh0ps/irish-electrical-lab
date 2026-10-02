import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCircuit, IMPORT_LIMITS } from '../lib/storage.ts';
import { LESSONS } from '../lib/lessons.ts';
import { simulate, measureVoltage, measureResistance } from '../lib/simulation.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Parameters, Wire } from '../lib/types.ts';

const endpoint = (component:string,terminal:string):Endpoint=>({component,terminal});
const component = (id:string,type:string,params:Parameters={}):ComponentInstance=>({id,type,label:id,position:[0,0,0],rotation:0,params});
function fixture():CircuitDocument {
  const wires:Wire[]=[
    {id:'live',from:endpoint('source','L'),to:endpoint('lamp','L'),role:'L',resistance:.01,bends:[[1,0,1]]},
    {id:'neutral',from:endpoint('source','N'),to:endpoint('lamp','N'),role:'N',resistance:.01,bends:[]},
    {id:'earth',from:endpoint('source','PE'),to:endpoint('lamp','PE'),role:'PE',resistance:.01,bends:[]},
  ];
  return {version:1,id:'roundtrip',name:'Saved practice circuit',revision:8,lessonId:7,supply:{enabled:false,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[component('source','source'),component('lamp','lamp',{watts:60,on:true,note:'custom scalar parameter'})],wires,faults:[]};
}
function put(value:unknown,path:string[],replacement:unknown):void {
  let cursor=value as Record<string,unknown>;
  for(const key of path.slice(0,-1))cursor=cursor[key] as Record<string,unknown>;
  cursor[path.at(-1)!]=replacement;
}
function rejects(path:string[],replacement:unknown,match:RegExp=/Invalid circuit import/):void {
  const d=fixture();put(d,path,replacement);assert.throws(()=>validateCircuit(d),match);
}

test('JSON export/import preserves all circuit data and produces detached editable objects',()=>{
  const source=fixture();const imported=validateCircuit(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(imported,source);assert.notEqual(imported,source);assert.notEqual(imported.supply,source.supply);assert.notEqual(imported.components[1].params,source.components[1].params);
  imported.components[1].params.watts=100;imported.wires[0].bends[0][0]=99;assert.equal(source.components[1].params.watts,60);assert.equal(source.wires[0].bends[0][0],1);
});
test('all64 published circuits and their exact challenge targets survive import validation',()=>{
  assert.equal(LESSONS.length,64);
  for(const lesson of LESSONS){
    const doc=structuredClone(lesson.circuit);assert.deepEqual(validateCircuit(doc),doc);
    doc.faults=[{type:lesson.challenge.fault,enabled:true,...(lesson.challenge.component?{component:lesson.challenge.component}:{}),...(lesson.challenge.wire?{wire:lesson.challenge.wire}:{})}];
    assert.deepEqual(validateCircuit(doc),doc,`lesson${lesson.id} challenge import`);
  }
});
test('missing or unknown versions reject before any document mutation',()=>{
  for(const version of [undefined,0,2,'1',true])rejects(['version'],version,/version/);
  assert.throws(()=>validateCircuit(null));assert.throws(()=>validateCircuit([]));assert.throws(()=>validateCircuit('json'));
});
test('invalid imports leave the original and current editable circuit unchanged',()=>{
  const original=fixture(),before=structuredClone(original),bad=structuredClone(original);bad.wires[0].to=endpoint('missing','L');
  let current=original;
  assert.throws(()=>{const validated=validateCircuit(bad);current=validated;},/missing/);
  assert.equal(current,original);assert.deepEqual(original,before);assert.equal(bad.wires[0].to.component,'missing');
});
test('document identities and revisions require valid scalar fields',()=>{
  for(const id of ['', '  ', 4, undefined,'@internal','__proto__'])rejects(['id'],id,/id/);
  for(const revision of [undefined,-1,NaN,Infinity,1.5,'2'])rejects(['revision'],revision,/revision/);
  for(const name of [null,{},2,''])rejects(['name'],name,/name/);
});
test('supply booleans, phase, frequency, voltage and source impedance are validated',()=>{
  for(const enabled of [1,'true',null,undefined])rejects(['supply','enabled'],enabled,/enabled/);
  for(const phase of ['dc','four',null])rejects(['supply','phase'],phase,/phase/);
  for(const frequency of [undefined,0,-50,NaN,Infinity,'50'])rejects(['supply','frequency'],frequency,/frequency/);
  for(const voltage of [0,-240,501,NaN,Infinity,'240'])rejects(['supply','voltage'],voltage,/voltage/);
  for(const resistance of [0,-1,NaN,Infinity,'0.12'])rejects(['supply','sourceResistance'],resistance,/sourceResistance/);
});
test('component types and IDs are checked with own-property lookup',()=>{
  for(const type of ['unknown','constructor','__proto__',null])rejects(['components','0','type'],type,/type/);
  for(const id of ['',0,'@reference','constructor'])rejects(['components','0','id'],id,/id/);
  rejects(['components','1','id'],'source',/duplicates/);rejects(['components','0','label'],false,/label/);
});
test('coordinates reject NaN, Infinity, array holes and values beyond scene limits',()=>{
  for(const position of [[0,Infinity,0],[NaN,0,0],[0,0],[0,'1',0],null,new Array(3),[IMPORT_LIMITS.coordinateMagnitude+1,0,0]])rejects(['components','0','position'],position,/position/);
  rejects(['components','0','rotation'],Infinity,/rotation/);rejects(['wires','0','bends'],[[0,0,NaN]],/bends/);
});
test('equipment parameters accept only finite scalar values and safe property names',()=>{
  for(const params of [null,[],{nested:{}},{nested:[]},{nested:null},{nested:undefined},{nested:()=>0},{watts:NaN},{watts:Infinity}])rejects(['components','1','params'],params,/params/);
  const polluted=JSON.parse('{"__proto__":{"polluted":true}}');rejects(['components','1','params'],polluted,/reserved/);
  const valid=fixture();valid.components[1].params={value:0,negative:-1,enabled:false,note:''};assert.deepEqual(validateCircuit(valid).components[1].params,valid.components[1].params);
});
test('mechanical interlocks must reference another actual contactor',()=>{
  const doc=fixture();doc.components.push(component('a','contactor',{mechanicallyInterlockedWith:'b'}),component('b','contactor',{mechanicallyInterlockedWith:'a'}));
  assert.deepEqual(validateCircuit(doc),doc);
  doc.components[2].params.mechanicallyInterlockedWith='lamp';assert.throws(()=>validateCircuit(doc),/another existing contactor/);
  doc.components[2].params.mechanicallyInterlockedWith='a';assert.throws(()=>validateCircuit(doc),/another existing contactor/);
});
test('wire references, duplicate IDs, roles and resistances cannot bypass validation',()=>{
  for(const target of [null,{component:'missing',terminal:'L'},{component:'lamp',terminal:'fake'},{component:4,terminal:'L'}])rejects(['wires','0','to'],target,/wires/);
  rejects(['wires','1','id'],'live',/duplicates/);rejects(['wires','0','id'],'',/id/);rejects(['wires','0','to'],endpoint('source','L'),/itself/);
  for(const role of ['earth','live',null,4])rejects(['wires','0','role'],role,/role/);
  for(const resistance of [0,-1,NaN,Infinity,'0.01'])rejects(['wires','0','resistance'],resistance,/resistance/);
});
test('all advertised conductor roles are retained without changing electrical identity',()=>{
  const roles=['L','N','PE','L1','L2','L3','control','output','DC+','DC-'] as const;
  for(const role of roles){const doc=fixture();doc.wires[0].role=role;assert.equal(validateCircuit(doc).wires[0].role,role);}
});
test('fault type, enabled value and target references are all validated',()=>{
  for(const fault of [null,{type:'magic',enabled:true,wire:'live'},{type:'open-live',enabled:'true',wire:'live'},{type:'open-live',enabled:true},{type:'open-live',enabled:false,wire:'missing'},{type:'earth-fault',enabled:true,component:'missing'},{type:'overload',enabled:true,wire:'live'}])rejects(['faults'],[fault],/faults/);
  for(const type of ['open-live','open-neutral','missing-earth','phase-loss','wrong-control','open-wire','open-cpc']){const doc=fixture();doc.faults=[{type,enabled:true,wire:'live'}];assert.equal(validateCircuit(doc).faults[0].type,type);}
  for(const type of ['short-circuit','earth-fault','overload']){const doc=fixture();doc.faults=[{type,enabled:true,component:'lamp'}];assert.equal(validateCircuit(doc).faults[0].type,type);}
});
test('component, wire, fault, bend and parameter count limits protect imported builds',()=>{
  rejects(['components'],Array.from({length:81},(_,i)=>component(`lamp-${i}`,'lamp')),/80-item/);
  rejects(['wires'],Array.from({length:301},()=>fixture().wires[0]),/300-item/);
  rejects(['faults'],Array.from({length:301},()=>({type:'open-live',enabled:false,wire:'live'})),/300-item/);
  rejects(['wires','0','bends'],Array.from({length:33},()=>[0,0,0]),/32-item/);
  rejects(['components','0','params'],Object.fromEntries(Array.from({length:101},(_,i)=>[`p${i}`,i])),/too many/);
});
test('lesson association is optional and otherwise an integer from1 to64',()=>{
  const unassociated=fixture();delete unassociated.lessonId;assert.equal(validateCircuit(unassociated).lessonId,undefined);
  for(const id of [0,65,1.5,'7',NaN,null])rejects(['lessonId'],id,/lessonId/);
});
test('unknown ancillary fields are removed from returned canonical circuit',()=>{
  const doc=fixture(),data={...doc,untrustedMetadata:{hello:'world'}};const valid=validateCircuit(data);assert.deepEqual(valid,doc);
});
test('real meter helpers use an imported circuit and withhold cross-isolation voltage',()=>{
  const doc=validateCircuit(fixture());doc.supply.enabled=true;const result=simulate(doc);assert.ok(result.converged);
  const v=measureVoltage(result,endpoint('lamp','L'),endpoint('lamp','N'));assert.ok(v.value!==null&&v.value>239&&v.value<240);
  assert.equal(measureResistance(doc,endpoint('lamp','L'),endpoint('lamp','N')).value,null);
  doc.supply.enabled=false;const r=measureResistance(doc,endpoint('lamp','L'),endpoint('lamp','N'));assert.ok(r.value!==null&&Math.abs(r.value-960)<.001);
  const isolated=structuredClone(LESSONS.find(lesson=>lesson.id===13)!.circuit);isolated.supply.enabled=true;const converted=simulate(validateCircuit(isolated));assert.ok(converted.converged);
  assert.equal(measureVoltage(converted,endpoint('driver','+'),endpoint('supply','PE')).value,null);
});
