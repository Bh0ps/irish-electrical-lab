import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HouseCallPanel} from '../components/lab/HouseCallPanel';
import { getLesson, olderTimerFan } from '../lib/lessons';
import { getLessonActivities } from '../lib/learning';
import { callActivityId, callReadings, fanRunPhase, HOUSE_CALLS, verifiedCallStep } from '../lib/house-calls';
import { getScenario, runLessonScenarios } from '../lib/scenarios';
import { assessBuild } from '../lib/assessment';
import { measureVoltage, simulate } from '../lib/simulation';
import { validateBookmark } from '../lib/lesson-bookmark';
import type { CircuitDocument,SimulationResult } from '../lib/types';

const lesson=getLesson(36)!;
const job=HOUSE_CALLS.find(c=>c.lesson===36)!;
const setting=(doc:CircuitDocument,id:string,closed:boolean):CircuitDocument=>({...doc,revision:doc.revision+1,
  components:doc.components.map(c=>c.id===id?{...c,params:{...c.params,closed}}:c)});

test('opening the isolator instead of the light switch offers undo and keeps genuine missing readings distinct',()=>{
  const original=lesson.circuit,on=simulate(original),off=setting(original,'fan-isolation',false),solved=simulate(off,on.deviceStates);
  const operation={component:'fan-isolation',activity:callActivityId(36,0),before:original,reading:on};
  const idle=()=>{};
  const display=(doc:CircuitDocument,result:SimulationResult,latest?:typeof operation)=>renderToStaticMarkup(createElement(HouseCallPanel,{
    call:job,start:callActivityId(36,0),document:doc,result,operation:latest,onActivity:idle,onCredit:async()=>{},
    closeTools:idle,openMeter:idle,operate:idle,locate:idle,restart:idle,choose:idle,undo:idle,startFault:idle}));
  const card=display(off,solved,operation);
  assert.match(card,/The fan has stopped and the light is still on/);
  assert.match(card,/Undo that change/);
  assert.doesNotMatch(card,/couldn’t get a reading|both on|Use the light switch</);
  assert.equal(callReadings(job.steps[0].before,off,solved)?.[1].value,null);
  assert.equal(verifiedCallStep(job,0,off,solved,operation),false);
  assert.match(display(off,solved),/Switch fan isolator on/); // A resumed draft has no undo history.
  const restored=setting(off,'fan-isolation',true),ready=simulate(restored,solved.deviceStates);
  assert.match(display(restored,ready),/Use the light switch</);
  assert.doesNotMatch(display(restored,ready),/Undo that change|couldn’t get a reading/);
  const loose={...restored,wires:restored.wires.filter(w=>w.from.component!=='fan'&&w.to.component!=='fan')};
  assert.match(display(loose,simulate(loose)),/couldn’t get a reading/);
  assert.match(display(off,{...solved,converged:false},operation),/couldn’t get a reading/);
});

test('bathroom light, permanent feed and the five-second timer follow the actual switches',()=>{
  const doc=structuredClone(lesson.circuit),on=simulate(doc);
  assert.equal(doc.components.find(c=>c.id==='fan-fcu')?.params.currentRating,3);
  assert.equal(doc.components.find(c=>c.id==='fan')?.params.watts,15);
  assert.equal(lesson.challenge.wire,'w6');
  const off=setting(doc,'light-switch',false);
  const action={activity:callActivityId(36,0),component:'light-switch',before:doc,reading:on};
  let running=simulate(off,on.deviceStates,.1);
  assert.equal(fanRunPhase(job,off,running,action),'running');
  assert.ok(verifiedCallStep(job,0,off,running,action));
  assert.equal(fanRunPhase(job,off,running),undefined);
  assert.equal(fanRunPhase(job,off,{...running,revision:off.revision-1},action),undefined);
  assert.equal(fanRunPhase(job,off,running,{...action,activity:callActivityId(36,3)}),undefined);
  running=simulate(off,running.deviceStates,4.8);
  assert.equal(fanRunPhase(job,off,running,action),'running');
  const stopped=simulate(off,running.deviceStates,.2);
  assert.equal(fanRunPhase(job,off,stopped,action),'stopped');
  const bookmark=validateBookmark({version:1,circuit:off,activityId:callActivityId(36,1),path:'coursebook',mode:'explore'});
  assert.equal(fanRunPhase(job,bookmark.circuit,simulate(bookmark.circuit)),undefined);
  const lit=setting(off,'light-switch',true),litResult=simulate(lit,stopped.deviceStates);
  assert.ok(verifiedCallStep(job,2,lit,litResult,{component:'light-switch',activity:callActivityId(36,2),before:off,reading:stopped}));
  const isolated=setting(lit,'fan-isolation',false),isolatedResult=simulate(isolated,litResult.deviceStates);
  assert.ok(verifiedCallStep(job,3,isolated,isolatedResult,{component:'fan-isolation',activity:callActivityId(36,3),before:lit,reading:litResult}));
  assert.ok(callReadings(job.steps[3].after,isolated,isolatedResult)?.every(r=>r.matches));
  // Both fan conductors are disconnected. Nothing assigns an artificial voltage to the floating pair.
  assert.equal(measureVoltage(isolatedResult,{component:'fan',terminal:'L'},{component:'fan',terminal:'N'}).value,null);
  const restored=setting(isolated,'fan-isolation',true);
  assert.ok(verifiedCallStep(job,4,restored,simulate(restored,isolatedResult.deviceStates),{component:'fan-isolation',activity:callActivityId(36,4),before:isolated,reading:isolatedResult}));
  const spurOff=setting(doc,'fan-fcu',false),dead=simulate(spurOff,on.deviceStates);
  for(const id of ['fan','light','runon'])assert.equal(dead.deviceStates[id].energized,false);
  const broken={...doc,faults:[{type:lesson.challenge.fault,wire:lesson.challenge.wire,enabled:true}]};
  const fault=simulate(broken);
  assert.ok(fault.deviceStates.light.energized&&fault.deviceStates.runon.energized);
  assert.equal(fault.deviceStates.fan.energized,false);
  assert.ok(runLessonScenarios(broken).some(c=>c.status==='fail'));
});

test('an older fan exercise keeps its targets without excusing missing equipment on a new build',()=>{
  const released: CircuitDocument=JSON.parse(readFileSync(new URL('./fixtures/timer-fan-v1.11.0.json',import.meta.url),'utf8'));
  const prior=validateBookmark({version:1,circuit:released,activityId:'lesson:36:operate:sequence:2',path:'full',mode:'explore'}).circuit;
  assert.deepEqual(getLesson(36,prior)!.circuit,released);
  assert.ok(olderTimerFan(prior));
  assert.equal(prior.wires.find(w=>w.id==='w12')?.to.terminal,'PE');
  assert.equal(getScenario(36,prior)?.steps.length,3);
  const earlier=getLesson(36,prior)!;
  assert.doesNotMatch(earlier.summary,/light off|lamp/i);
  for(const activity of getLessonActivities(earlier).filter(a=>a.kind==='predict'||a.kind==='explain')){
    assert.doesNotMatch(activity.instruction,/switch the light|lamp/i);
  }
  assert.doesNotMatch(getScenario(36,prior)!.steps[0].title,/light|lamp/i);
  assert.ok(assessBuild(prior,simulate(prior),lesson.circuit).passed);
  const broken={...lesson.circuit,components:lesson.circuit.components.filter(c=>c.id!=='light'),wires:lesson.circuit.wires.filter(w=>w.to.component!=='light')};
  assert.equal(olderTimerFan(broken),false);
  assert.ok(!assessBuild(broken,simulate(broken),lesson.circuit).passed);
  assert.ok(assessBuild(lesson.circuit,simulate(lesson.circuit),lesson.circuit).passed);
});
