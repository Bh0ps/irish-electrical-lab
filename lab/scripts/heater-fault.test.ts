import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis';
import { elementWatts,finishHeaterPress,hasPanelHeater,heaterComparisonReady,heaterFaultReadings,heaterFeed,heaterHandoverStep,heaterLine,heaterNeutral,heaterProbeTip,heaterRunReady,isHeaterRun,startHeaterPress } from '../lib/heater-fault';
import { captureMeasurement, validateDiagnosisEvidence } from '../lib/learning';
import { getLesson } from '../lib/lessons';
import { faultMeterCheck } from '../lib/fault-checks';
import { validateBookmark } from '../lib/lesson-bookmark';
import { simulate } from '../lib/simulation';
import type { Endpoint } from '../lib/types';

function setup(legacy=false,closed=true,broken=true,voltage=240){
  const fixture=structuredClone(getLesson(20)!.circuit);
  if(legacy)fixture.components.find(c=>c.id==='fcu-switch')!.type='switch';
  const lesson=getLesson(20,fixture)!,doc=structuredClone(lesson.circuit);
  doc.supply.voltage=voltage;
  doc.components.find(c=>c.id==='fcu-switch')!.params.closed=closed;
  if(broken)doc.faults=[{type:lesson.challenge.fault,wire:lesson.challenge.wire,component:lesson.challenge.component,enabled:true}];
  const result=simulate(doc),feed=heaterFeed(doc)!;
  const read=(a:Endpoint,b:Endpoint)=>({...captureMeasurement(doc,result,{a,b,mode:'voltage'}),assisted:false});
  return {doc,result,read,feed,lesson};
}

test('both heater circuits use their own fuse output and the same heater neutral for the comparison',()=>{
  for(const legacy of [false,true])for(const supply of [230,240]){
    const {doc,result,read,feed,lesson}=setup(legacy,true,true,supply);
    assert.deepEqual(feed,legacy?{component:'fuse',terminal:'OUT'}:{component:'fcu-switch',terminal:'LOUT'});
    assert.equal(lesson.challenge.wire,'w5');
    const samples=[read(heaterNeutral,heaterLine),read(heaterNeutral,feed)];
    assert.ok(Math.abs(samples[0].value!)<.1);
    assert.ok(Math.abs(samples[1].value!-supply)<.1);
    const readings=heaterFaultReadings(doc,result,samples);
    assert.equal(readings.heater,samples[0]);assert.equal(readings.output,samples[1]);assert.ok(heaterComparisonReady(doc,readings));
    assert.ok(validateDiagnosisEvidence(doc,result,samples,lesson.challenge).accepted);
    const wrong=assessFaultDiagnosis(doc,result,'open-neutral',0,lesson.challenge,samples);
    assert.equal(wrong.accepted,false);assert.match(wrong.explanation,new RegExp(supply+' V.*0 V'));
    assert.ok(assessFaultDiagnosis(doc,result,'open-live',0,lesson.challenge,samples).accepted);
    assert.ok(faultMeterCheck(lesson,doc)!.readings.every(r=>r.b?.component==='fixed'&&r.b.terminal==='N'));
    const bookmark={version:1,mode:'challenges',path:'full',activityId:'lesson:20:fault:measure',circuit:doc,
      fault:{heater:true,scored:false,accepted:false,repaired:false,hints:0,probes:{red:heaterNeutral,black:heaterLine}}};
    assert.deepEqual(validateBookmark(bookmark).fault,bookmark.fault);
    assert.equal(getLesson(20,validateBookmark(bookmark).circuit),lesson);
    const ordinary={...bookmark,fault:{scored:true,accepted:false,repaired:false,hints:1}};
    assert.deepEqual(validateBookmark(ordinary).fault,ordinary.fault);
  }
});

test('wrong reference, held or assisted reading, stale results, switch off and intact wiring cannot unlock the heater diagnosis',()=>{
  const {doc,result,read,feed}=setup();
  const load=read(heaterLine,heaterNeutral),out=read(feed,heaterNeutral);
  for(const sample of [read(feed,{component:'supply',terminal:'N'}),{...out,assisted:true},{...out,revision:doc.revision+1},
    {...out,instrument:{model:'T6-600',method:'probe-voltage',held:true,reference:'none',displayed:'240'}} as unknown as typeof out]){
    assert.equal(heaterComparisonReady(doc,heaterFaultReadings(doc,result,[load,sample])),false);
  }
  assert.deepEqual(heaterFaultReadings(doc,{...result,converged:false},[load,out]),{});
  for(const [closed,broken] of [[false,true],[true,false]]){
    const trial=setup(false,closed,broken);
    const captured=[trial.read(heaterLine,heaterNeutral),trial.read(trial.feed,heaterNeutral)];
    assert.equal(heaterComparisonReady(trial.doc,heaterFaultReadings(trial.doc,trial.result,captured)),false);
  }
});

test('heater feedback follows the learner’s own leads, including a reversed pair and a saved separate fuse',()=>{
  for(const legacy of [false,true])for(const reversed of [false,true]){
    const {doc,result,read,feed}=setup(legacy);
    const pair=(point:Endpoint,common:Endpoint=heaterNeutral)=>reversed?read(common,point):read(point,common);
    const first=pair(heaterLine),rows=heaterFaultReadings(doc,result,[first]);
    const earth=pair(heaterLine,{component:'fixed',terminal:'PE'});
    assert.match(heaterProbeTip(doc,earth,{}),/earth.*L and N at the heater/);
    const wrongN=pair(feed,{component:'supply',terminal:'N'});
    assert.match(heaterProbeTip(doc,wrongN,rows),new RegExp('Put '+(reversed?'red':'black')+' back on N at the heater'));
    const wrongOutput=pair(legacy?{component:'fuse',terminal:'IN'}:{component:'fcu-switch',terminal:'LIN'});
    assert.ok(Math.abs(wrongOutput.value!-240)<.2);
    assert.match(heaterProbeTip(doc,wrongOutput,rows),legacy?/OUT on the separate fuse/:/IN is where power comes into the wall switch.*LOAD L/);
    assert.ok(!heaterComparisonReady(doc,heaterFaultReadings(doc,result,[first,wrongN,wrongOutput])));
    assert.ok(heaterComparisonReady(doc,heaterFaultReadings(doc,result,[first,wrongN,wrongOutput,pair(feed)])));
    assert.match(heaterProbeTip(doc,{...first,mode:'resistance'},rows),/bench voltmeter/);
  }
});

test('the wall rocker must stop the repaired panel and bring back actual element power',()=>{
  for(const voltage of [230,240]){
    const {doc}=setup(false,true,false,voltage);
    assert.ok(hasPanelHeater(doc));const running=simulate(doc);
    const off=startHeaterPress(doc,running,'fcu-switch')!;
    assert.ok(off.before>450&&off.before<505);
    assert.equal(startHeaterPress(doc,running,'protect'),undefined);
    doc.components.find(c=>c.id==='fcu-switch')!.params.closed=false;doc.revision++;
    assert.equal(finishHeaterPress(doc,running,off),undefined);
    const stopped=simulate(doc),first=finishHeaterPress(doc,stopped,off)!;
    assert.equal(elementWatts(doc,stopped),0);
    assert.equal(first.runningBefore,off.before);assert.equal(first.stopped,0);
    assert.equal(heaterRunReady(doc,stopped,first),false);
    const restored=validateBookmark({version:1,circuit:doc,path:'full',mode:'challenges',activityId:'lesson:20:retest',
      fault:{hints:0,accepted:true,repaired:true,scored:false,heater:true,heaterRun:first}});
    assert.deepEqual(restored.fault?.heaterRun,first);
    const on=startHeaterPress(doc,stopped,'fcu-switch')!;
    doc.components.find(c=>c.id==='fcu-switch')!.params.closed=true;doc.revision++;
    const again=simulate(doc),second=finishHeaterPress(doc,again,on,first)!;
    assert.equal(second.runningAfter,elementWatts(doc,again));
    assert.ok(heaterRunReady(doc,again,second));
    assert.ok(isHeaterRun(second,doc.revision));
    assert.equal(isHeaterRun({...second,runningAfter:0},doc.revision),false);
    assert.equal(heaterRunReady({...doc,revision:doc.revision+1},again,second),false);
    const panel=doc.components.find(c=>c.id==='fixed')!;
    panel.params.setpoint=16;
    const satisfied=simulate(doc);
    assert.equal(elementWatts(doc,satisfied),0);
    assert.equal(finishHeaterPress(doc,satisfied,on,first),first);
    assert.equal(heaterRunReady(doc,satisfied,second),false);
  }
});

test('visiting a repaired heater, opening the supply, unresolved power and earlier saved heaters earn no handover',()=>{
  const {doc,result}=setup(false,true,false);
  assert.equal(startHeaterPress(doc,{...result,converged:false},'fcu-switch'),undefined);
  assert.equal(startHeaterPress({...doc,supply:{...doc.supply,enabled:false}},result,'fcu-switch'),undefined);
  const faulty={...doc,faults:[{enabled:true,type:'open-live',wire:'w5'}]};
  assert.equal(startHeaterPress(faulty,result,'fcu-switch'),undefined);
  const first=startHeaterPress(doc,result,'fcu-switch')!;
  assert.equal(finishHeaterPress(doc,result,first),undefined);
  assert.equal(finishHeaterPress({...doc,id:'another'},result,first),undefined);
  const legacy=setup(true,true,false);
  assert.equal(startHeaterPress(legacy.doc,legacy.result,'fcu-switch'),undefined);
  assert.equal(heaterRunReady(legacy.doc,legacy.result),false);
});

test('a remaining supply fault asks for a circuit check, whereas a satisfied thermostat asks for heat',()=>{
  const broken=setup();
  assert.equal(elementWatts(broken.doc,broken.result),0);
  assert.equal(heaterHandoverStep(broken.doc,broken.result)?.action,'test');
  const {doc}=setup(false,true,false);
  assert.equal(heaterHandoverStep(doc,undefined)?.disabled,true);
  assert.equal(heaterHandoverStep(doc,undefined,undefined,true)?.disabled,false);
  doc.components.find(c=>c.id==='fixed')!.params.setpoint=17;
  const off=simulate(doc),step=heaterHandoverStep(doc,off);
  assert.equal(step?.action,'raise');assert.match(step!.instruction,/18 °C/);assert.match(step!.reading,/17 °C/);
  doc.components.find(c=>c.id==='fixed')!.params.setpoint=19;
  assert.equal(heaterHandoverStep(doc,simulate(doc))?.action,'operate');
});
