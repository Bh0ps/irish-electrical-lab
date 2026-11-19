import assert from 'node:assert/strict';
import test from 'node:test';
import {bellInput,bellReturn} from '../lib/bell-fault';
import {heaterNeutral,heaterLine} from '../lib/heater-fault';
import {getLesson} from '../lib/lessons';
import {captureMeasurement} from '../lib/learning';
import {repairMeterPrompt} from '../lib/repair-meter-guidance';
import {simulate} from '../lib/simulation';
import type {CircuitDocument,Endpoint} from '../lib/types';
import {worktopFaultPoints} from '../lib/worktop-fault';

function job(id:number){
  const lesson=getLesson(id)!;
  const doc=structuredClone(lesson.circuit);
  doc.faults=[{type:lesson.challenge.fault,wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true}];
  return doc;
}

function read(doc:CircuitDocument,a:Endpoint,b:Endpoint){
  return {...captureMeasurement(doc,simulate(doc),{mode:'voltage',a,b}),assisted:false};
}

test('worktop guidance uses the operated rocker, the recorded probe colours and the fitted blade marking',()=>{
  const doc=job(66),right=doc.components.find(c=>c.id==='right-switch')!;
  right.params.closed=false;
  assert.match(repairMeterPrompt(doc,'worktop',{}),/Turn on the right worktop switch/);
  right.params.closed=true;
  assert.match(repairMeterPrompt(doc,'worktop',{}),/Touch red to \+ and black to −/);
  const {a,b}=worktopFaultPoints.strip;
  const strip=read(doc,b,a);
  assert.equal(Math.round(strip.value!),0);
  assert.match(repairMeterPrompt(doc,'worktop',{strip}),/Keep red on the strip’s − pad. Move black to terminal 1/);
  const wrong=read(doc,b,{component:'right-switch',terminal:'COM'});
  assert.match(repairMeterPrompt(doc,'worktop',{strip},undefined,undefined,wrong),/feed from the driver at 2.*Move black to terminal 1/);
});

test('heater guidance requires the actual wall switch and keeps the original reference lead',()=>{
  const doc=job(20),control=doc.components.find(c=>c.id==='fcu-switch')!;
  control.params.closed=false;
  assert.match(repairMeterPrompt(doc,'heater',{}),/Turn the heater on at the wall/);
  control.params.closed=true;
  assert.match(repairMeterPrompt(doc,'heater',{}),/check L to N at the heater/);
  const heater=read(doc,heaterNeutral,heaterLine);
  assert.match(repairMeterPrompt(doc,'heater',{},{heater}),/Leave red on heater N. Move black to.*LOAD L/i);
});

test('rear bell guidance follows the current held button, fitted chime markings and measured reference',()=>{
  const doc=job(72),front=doc.components.find(c=>c.id==='front')!,back=doc.components.find(c=>c.id==='back')!;
  front.params.pressed=true;back.params.pressed=false;
  assert.match(repairMeterPrompt(doc,'chime',{}),/Let go of the front button/);
  front.params.pressed=false;
  assert.match(repairMeterPrompt(doc,'chime',{}),/Hold the back doorbell button/);
  back.params.pressed=true;
  assert.match(repairMeterPrompt(doc,'chime',{}),/C2 to =\/~ with the back button held/);
  const call=read(doc,bellReturn,bellInput);
  assert.match(repairMeterPrompt(doc,'chime',{},undefined,{call}),/Leave red on =\/~.*move black to the lower screw/);
  doc.components.find(c=>c.id==='chime')!.variant=undefined;
  assert.match(repairMeterPrompt(doc,'chime',{}),/REAR to AC2/);
});
