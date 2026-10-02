import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS} from '../lib/lessons.ts';
import {electricalKey,acceptsElectricalResult} from '../lib/simulation-identity.ts';
test('presentation edits and inspection preserve electrical identity',()=>{
  const a=structuredClone(LESSONS.find(l=>l.id===7)!.circuit),b=structuredClone(a);
  b.revision++;b.name='Moved bench';b.components[0].position=[12,2,-8];b.components[0].rotation=Math.PI/2;b.components[0].label='New label';b.components.at(-1)!.variant='downlight';b.wires[0].bends=[[2,3,4]];
  assert.equal(electricalKey(a),electricalKey(b));
});
test('actual commands, extra neutral-earth connection and protective changes invalidate results',()=>{
  const a=structuredClone(LESSONS.find(l=>l.id===7)!.circuit),key=electricalKey(a);
  const mutations=[(d:typeof a)=>{d.components.find(c=>c.id==='switch')!.params.closed=false;},(d:typeof a)=>{d.wires.push({...structuredClone(d.wires[0]),id:'wrong-earth',from:{component:'protect',terminal:'NOUT'},to:{component:'light',terminal:'PE'},role:'PE'});},(d:typeof a)=>{d.wires[0].resistance=.5;},(d:typeof a)=>{d.supply.enabled=false;},(d:typeof a)=>{d.components[1].params.resetToken=1;}];
  for(const mutation of mutations){const next=structuredClone(a);mutation(next);assert.notEqual(electricalKey(next),key);}
});
test('geometry-only results may be reused but a previous A generation and another circuit are rejected',()=>{
  const current={id:'one-way',revision:9,generation:3};
  assert.equal(acceptsElectricalResult(current,{circuitId:'one-way',revision:7,electricalGeneration:3}),true);
  assert.equal(acceptsElectricalResult(current,{circuitId:'one-way',revision:7,electricalGeneration:1}),false);
  assert.equal(acceptsElectricalResult(current,{circuitId:'other',revision:9,electricalGeneration:3}),false);
  assert.equal(acceptsElectricalResult(current,{circuitId:'one-way',revision:8}),false);
  assert.equal(acceptsElectricalResult(current,{circuitId:'one-way',revision:9}),true);
});
