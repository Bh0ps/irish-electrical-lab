import test from 'node:test';
import assert from 'node:assert/strict';
import { getLesson } from '../lib/lessons.ts';
import { getLessonActivities } from '../lib/learning.ts';
import { assessConnections } from '../lib/assessment.ts';
import { routeCircuit,terminalPosition } from '../lib/routing.ts';
import { validateCircuit } from '../lib/storage.ts';
import { simulate } from '../lib/simulation.ts';
import { COURSE_BOND_ID,COURSE_BOARD_ID,populateBoard } from '../lib/board-examples.ts';
import { mountDevice,normalizeBoardMounts,unmountDevice } from '../lib/board-assembly.ts';

for(const id of [2,53]){
 test('Real rail devices, independent branches and compatible saved course '+id,()=>{
   const lesson=getLesson(id)!,course=lesson.circuit,board=course.components.find(c=>c.id===COURSE_BOARD_ID)!;
   assert.deepEqual(routeCircuit(course).issues,[]);
   const legacy={...structuredClone(course),components:course.components.filter(c=>c.id!==board.id).map(c=>({...c,mount:undefined})),wires:course.wires.filter(w=>w.id!==COURSE_BOND_ID)};
   assert.equal(assessConnections(legacy,course).filter(c=>c.status==='fail').length,0);
   assert.deepEqual(getLessonActivities(lesson).map(a=>a.id),getLessonActivities({...lesson,circuit:legacy}).map(a=>a.id));
   const preset=populateBoard({...course,lessonId:undefined,cableRuns:undefined,components:[board],wires:[]},board.id);
   assert.deepEqual(routeCircuit(preset).issues,[]);assert.equal(validateCircuit(preset).components.filter(c=>c.mount).length,preset.components.filter(c=>c.mount).length);
   const first=simulate(preset);
   assert.ok(first.converged);assert.equal(first.diagnostics.filter(d=>d.severity!=='info').length,0);
   const breaker=preset.components.find(c=>c.type==='mcb')!,branch=preset.wires.find(w=>w.from.component===breaker.id&&w.from.terminal==='OUT')!,other=preset.components.find(c=>c.type==='lamp'&&c.id!==branch.to.component)!;
   const opened=simulate({...preset,components:preset.components.map(c=>c.id===breaker.id?{...c,params:{...c.params,closed:false}}:c)});
   assert.ok(opened.componentPower[branch.to.component]<.01);assert.ok(opened.componentPower[other.id]>10);
   const remaining=preset.wires.filter(w=>w.from.component!==preset.components.find(c=>c.id.includes('comb-'))?.id);
   assert.ok(simulate({...preset,wires:remaining}).componentPower[branch.to.component]<.01,'bar is an actual circuit node');
   const otherBreaker=preset.components.find(c=>c.type==='mcb'&&c.id!==breaker.id)!;
   assert.throws(()=>mountDevice(preset,otherBreaker.id,breaker.mount!),/occupies/);
   const changed=normalizeBoardMounts({...preset,components:preset.components.map(c=>c.id===board.id?{...c,position:[1,.4,1.2],rotation:.23,params:{doorOpen:false,frontOff:true}}:c)});
   assert.notDeepEqual(terminalPosition(preset,branch.from),terminalPosition(changed,branch.from));assert.deepEqual(changed.wires,preset.wires);assert.ok(Math.abs(simulate(changed).totalPower-first.totalPower)<1e-6);
   assert.equal(unmountDevice(changed,breaker.id).components.find(c=>c.id===breaker.id)!.mount,undefined);
   if(id===53){const broken=simulate({...course,wires:course.wires.filter(w=>w.id!==COURSE_BOND_ID)});assert.ok(broken.diagnostics.some(d=>d.component===board.id&&d.category==='protection'));}
 });
}
