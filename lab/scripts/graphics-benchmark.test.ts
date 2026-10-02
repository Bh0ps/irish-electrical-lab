import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {LESSONS} from '../lib/lessons.ts';
import {routeCircuit,auditRoutes} from '../lib/routing.ts';
import {simulate} from '../lib/simulation.ts';
import {validateCircuit} from '../lib/storage.ts';
import type {CircuitDocument} from '../lib/types.ts';
const require=createRequire(import.meta.url);
const {makeGraphicsBenchmark}=require('../desktop/app/graphics-diagnostics-helpers.cjs');

test('native thirty-object fixture is six electrically complete training cells with clear actual routes',()=>{
  const original=structuredClone(LESSONS.find(l=>l.id===7)!.circuit),before=JSON.stringify(original),document=makeGraphicsBenchmark(original) as CircuitDocument;
  assert.equal(JSON.stringify(original),before,'diagnostic fixture authoring cannot mutate the course');
  assert.equal(document.components.length,30);assert.equal(document.wires.length,42);assert.equal(new Set(document.components.map(c=>c.id)).size,30);
  assert.deepEqual(validateCircuit(document),document);
  const routing=routeCircuit(document);assert.equal(routing.routes.size,42);assert.deepEqual(routing.issues,[]);assert.deepEqual(auditRoutes(document,routing),[]);
  const result=simulate(document);assert.ok(result.converged);assert.equal(result.diagnostics.filter(d=>d.severity!=='info').length,0);
  for(const lamp of document.components.filter(c=>c.type==='lamp'))assert.ok(result.componentPower[lamp.id]>59&&Number(result.deviceStates[lamp.id].lightOutputPower)>59,JSON.stringify(result.diagnostics));
  document.components.find(c=>c.id==='cell-3-switch')!.params.closed=false;document.components.find(c=>c.id==='cell-3-switch')!.params.on=false;
  const opened=simulate(document);assert.equal(opened.componentPower['cell-3-light'],0);assert.ok(opened.componentPower['cell-2-light']>59);assert.ok(opened.componentPower['cell-4-light']>59);
});
test('thirty-object animation workload has six genuinely powered fans and all42 routes',()=>{
  const document=makeGraphicsBenchmark(LESSONS.find(l=>l.id===7)!.circuit) as CircuitDocument;
  for(const lamp of document.components.filter(c=>c.type==='lamp')){lamp.type='fan';lamp.params={watts:35,nominalVoltage:240};}
  const routing=routeCircuit(document),result=simulate(document);assert.equal(routing.routes.size,42);assert.deepEqual(routing.issues,[]);assert.deepEqual(auditRoutes(document,routing),[]);assert.ok(result.converged);
  const fans=document.components.filter(c=>c.type==='fan');assert.equal(fans.length,6);assert.ok(fans.every(c=>result.deviceStates[c.id].energized&&result.componentPower[c.id]>34));
  assert.equal(result.diagnostics.filter(d=>d.severity!=='info').length,0);
});
