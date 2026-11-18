import test from 'node:test';
import * as THREE from 'three';
import { testerPose } from '../components/lab/ToolPlacement.tsx';
import type { CircuitRoutes } from '../lib/routing.ts';
import type { Vec3 } from '../lib/types.ts';
import assert from 'node:assert/strict';
import { LESSONS } from '../lib/lessons.ts';
import { forkRead, forkMode, instrumentData, type ForkSetup } from '../lib/fork-tester.ts';
import { simulate } from '../lib/simulation.ts';
import { currentEvidence,captureMeasurement } from '../lib/learning.ts';
import { migrateProgress,recordEvidence } from '../lib/progress.ts';
import { exportStudyBackup,validateStudyBackup } from '../lib/study-backup.ts';
import { prepareSample,terminations,type PreparationTask } from '../lib/termination-practice.ts';
import type { Endpoint } from '../lib/types.ts';

const doc=(id=7)=>structuredClone(LESSONS.find(l=>l.id===id)!.circuit);
const end=(component:string,terminal:string):Endpoint=>({component,terminal});
const probes=(a:Endpoint,b:Endpoint):ForkSetup=>({method:'probe-voltage',reference:'none',a,b});

test('two-lead ranges compare real points, with signed DC, phase-phase AC and isolated transformer AC',()=>{
  const led=doc(13),bell=doc(43),three=doc(55),p=end('driver','+'),n=end('driver','-');
  for(const [a,b,numeric] of [[p,n,24],[n,p,-24]] as const){
    const reading=forkRead(led,simulate(led),probes(a,b));
    assert.equal(reading.signal,'DC');assert.equal(reading.shown,String(numeric));assert.ok(Math.abs(reading.value!-numeric)<.1);
  }
  const secondary=forkRead(bell,simulate(bell),probes(end('tx','+'),end('tx','-')));assert.equal(secondary.signal,'AC');assert.equal(secondary.shown,'12');
  const mismatch=forkRead(bell,simulate(bell),probes(end('tx','+'),end('supply','N')));assert.equal(mismatch.status,'unresolved');
  const drive=doc(58);drive.components.find(c=>c.type==='vfd')!.params.frequency=50;
  assert.equal(forkRead(drive,simulate(drive),probes(end('motor','U1'),end('motor','V1'))).status,'unresolved');
  const pair=probes(end('supply','L1'),end('supply','L2')),s=simulate(three);
  assert.equal(forkRead(three,s,pair).shown,'400');
  s.terminalVoltages['supply.L1']={...s.terminalVoltages['supply.L1'],re:900};
  assert.equal(forkRead(three,s,pair).status,'overrange');
});
test('single core fork checks actual protective bonding, reference, frequency, range and branch current',()=>{
  const d=doc(),s=simulate(d),w=d.wires.find(w=>w.from.terminal==='L')!,fork:ForkSetup={method:'fork-voltage',reference:'none',wire:w.id};
  assert.equal(forkRead(d,s,fork).status,'unresolved');
  assert.equal(forkRead(d,s,{...fork,reference:'pad'}).shown,'240');
  assert.equal(forkRead(d,s,{...fork,reference:'black',b:end('light','PE')}).shown,'240');
  assert.equal(forkRead(d,s,{...fork,reference:'black',b:end('light','N')}).status,'unresolved');
  d.wires=d.wires.filter(w=>w.role!=='PE');assert.equal(forkRead(d,simulate(d),{...fork,reference:'black',b:end('light','PE')}).status,'unresolved');
  const neutral=d.wires.find(w=>w.role==='N')!;
  assert.equal(forkRead(d,s,{...fork,wire:neutral.id,reference:'pad'}).status,'unresolved');
  const amps:ForkSetup={...fork,method:'fork-current'};
  assert.equal(forkRead(d,s,amps).shown, Math.hypot(s.wireCurrents[w.id].re,s.wireCurrents[w.id].im).toFixed(1));
  s.wireCurrents[w.id]={re:200.01,im:0};assert.equal(forkRead(d,s,amps).status,'overrange');
  s.pwmWires=[w.id];assert.equal(forkRead(d,s,amps).status,'unresolved');
  const dc=doc(13);assert.equal(forkRead(dc,simulate(dc),{...amps,wire:dc.wires.find(w=>w.from.terminal==='+')!.id}).status,'unresolved');
  const bell=doc(43);assert.match(forkRead(bell,simulate(bell),{...fork,reference:'pad',wire:bell.wires.find(w=>w.from.terminal==='+')!.id}).explanation,/isolated/);
});
test('continuity distinguishes short, open, overrange, unresolved and active sources',()=>{
  const d=doc(),s=simulate(d);const method:ForkSetup={...probes(end('switch','COM'),end('switch','OUT')),method:'resistance'};
  assert.equal(forkRead(d,s,method,undefined,true).status,'unresolved');
  d.supply.enabled=false;d.revision++;
  const r=simulate(d),short=forkRead(d,r,method,undefined,true);
  assert.equal(short.shown,'0');assert.equal(short.beeps,true);
  d.components.find(c=>c.type==='switch')!.params.closed=false;
  d.wires=d.wires.filter(w=>w.from.component!=='switch'&&w.to.component!=='switch');d.revision++;
  const o=simulate(d);assert.equal(forkRead(d,o,method,undefined,true).status,'open');
  for(const n of [39,40,2000,2001]){const x=forkRead(d,o,method,{value:n,explanation:''});assert.equal(x.status,n>2000?'overrange':'value');assert.equal(x.beeps,n>2000?undefined:n<40);}
  assert.equal(forkRead(d,r,method).status,'unresolved');
});
test('fork readings survive backup without creating probe evidence or accepting stale or held values',()=>{
  const d=doc(),s=simulate(d),setup:ForkSetup={method:'fork-voltage',reference:'pad',wire:d.wires[0].id},reading=forkRead(d,s,setup),meta=instrumentData(setup,reading)!;
  const evidence=captureMeasurement(d,s,{mode:forkMode(setup.method),wire:setup.wire,instrument:meta,a:end('switch','COM'),b:end('switch','OUT')},100);
  assert.equal(evidence.a,undefined);assert.equal(evidence.b,undefined);assert.equal(currentEvidence(d,s,[evidence]).length,1);
  for(const mutation of [{held:true as never},{displayed:'0'},{signal:'DC' as const}])assert.equal(currentEvidence(d,s,[{...evidence,instrument:{...meta,...mutation}}]).length,0);
  d.revision++;assert.equal(currentEvidence(d,s,[evidence]).length,0);d.revision--;
  const progress=recordEvidence(migrateProgress(undefined),7,evidence),backup=exportStudyBackup(d,[],progress);assert.equal(validateStudyBackup(JSON.stringify(backup)).version,backup.version);
  const invalid=structuredClone(backup);const stored=(invalid.progress as typeof progress).learning['7'].evidence[0];stored.a=end('switch','COM');assert.throws(()=>validateStudyBackup(invalid));
});
test('seating the fork on a low loose core lifts its visible span while keeping all electrical anchors and saved bends',()=>{
  const d=doc(),w=d.wires[0],before=structuredClone(d);
  const path:Vec3[]=[[0,.08,-1],[0,.08,1]],routing={routes:new Map([[w.id,path]])} as CircuitRoutes;
  const pose=testerPose(d,routing,w.id);assert.ok(pose.sampled);
  const notch=new THREE.Vector3(0,1.58,0).applyQuaternion(pose.rotation).add(pose.position);
  assert.ok(Math.abs(notch.y-.32)<1e-6);assert.ok(Math.abs(notch.x)+Math.abs(notch.z)<1e-6);
  assert.deepEqual(pose.sampled.points[0],path[0]);assert.deepEqual(pose.sampled.points.at(-1),path[1]);assert.deepEqual(d,before);
});
test('each isolated hand-tool exercise accepts only its referenced material or terminal setting',()=>{
  for(const id of Object.keys(terminations) as PreparationTask[]){
    const sample=terminations[id];assert.ok(sample.source.startsWith('https://'));assert.ok(sample.documentation);
    for(const value of sample.choices){const result=prepareSample(id,value);assert.equal(result.won,value===sample.target);assert.ok(result.message);}
  }
});
