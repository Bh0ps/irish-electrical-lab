import test from 'node:test';
import assert from 'node:assert/strict';
import {electricalKey} from '../lib/simulation-identity.ts';
import {LESSONS} from '../lib/lessons.ts';
import {endpointKey} from '../lib/types.ts';
import {BACK, DOOR_Z, JOBS, jobSite, walkStep} from '../lib/job-site.ts';
import {drawingNets,ladderPaths,matchConnection,terminalSheet} from '../lib/installation-drawing.ts';

test('each published job has a physical fixing point and a labelled drawing for every component and wire',()=>{
  assert.deepEqual(Object.keys(JOBS).map(Number),LESSONS.map(l=>l.id));
  for(const lesson of LESSONS){
    const doc=lesson.circuit, before=JSON.stringify(doc),site=jobSite(doc),sheet=terminalSheet(doc,site);
    assert.ok(site.first&&doc.components.some(c=>c.id===site.first));
    assert.equal(new Set(site.items.map(i=>i.ref)).size,doc.components.length);
    assert.equal(sheet.lines.length,doc.wires.length,'Missing endpoint in lesson '+lesson.id);
    for(const item of site.items){assert.ok(item.position.every(Number.isFinite)&&item.scale>0);assert.ok(site.location(item.room));}
    assert.equal(JSON.stringify(doc),before);
  }
});
test('editing a conductor changes the as-wired drawing independently of the reference',()=>{
  const reference=LESSONS.find(l=>l.id===7)!.circuit,actual=structuredClone(reference),wire=actual.wires.pop()!;
  const old=jobSite(reference),site=jobSite(actual,reference);
  assert.deepEqual(site.items,old.items);
  assert.equal(matchConnection(wire,actual),undefined);
  actual.wires.push({...wire,from:wire.to,to:wire.from,role:'control'});
  assert.equal(matchConnection(wire,actual)?.role,'control');
  assert.equal(matchConnection(wire,reference)?.role,wire.role);
  assert.equal(drawingNets(actual).get(endpointKey(wire.from)),drawingNets(actual).get(endpointKey(wire.to)));
});
test('holding contact is a second traceable path to the same starter coil',()=>{
  const lesson=LESSONS.find(l=>l.id===55)!,rows=ladderPaths(lesson.circuit);
  assert.ok(rows.some(r=>r.feed&&r.path.some(c=>c.a.terminal==='13')));
  assert.ok(rows.some(r=>r.feed&&r.path.some(c=>c.a.terminal==='COM'&&c.b.terminal==='NO')));
  const aux=lesson.circuit.wires.find(w=>[w.from,w.to].some(e=>e.terminal==='14'));
  assert.ok(aux);const cut={...lesson.circuit,wires:lesson.circuit.wires.filter(w=>w!==aux)};
  assert.equal(ladderPaths(cut).some(r=>r.feed&&r.path.some(c=>c.a.terminal==='13')),false);
});
test('walk through a doorway and stop against solid walls',()=>{
  assert.equal(walkStep([-2.4,1.56,0],.4,0)[0],-2.4);
  assert.equal(walkStep([-2.4,1.56,DOOR_Z],.4,0)[0],-2);
  assert.ok(walkStep([0,1.56,2.5],0,.7)[2]>3);
  assert.ok(walkStep([1.4,1.56,2.5],0,.7)[2]<2.8);
  assert.ok(walkStep([0,1.56,0],0,-6)[2]>BACK);
});

test('opening board doors, removing shields and walking preserve electrical state',()=>{
  for(const id of [2,53]){
    const doc=LESSONS.find(l=>l.id===id)!.circuit,open=structuredClone(doc);
    const shell=open.components.find(c=>c.type==='gammaboard'||c.type==='invictaboard')!;
    assert.ok(shell);shell.params.doorOpen=!shell.params.doorOpen;shell.params.frontOff=!shell.params.frontOff;
    const site=jobSite(open);for(const item of site.items)walkStep(item.position,0,.18,site);
    assert.equal(electricalKey(open),electricalKey(doc));
  }
});
