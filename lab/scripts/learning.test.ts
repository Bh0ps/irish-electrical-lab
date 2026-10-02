import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../lib/lessons.ts';
import { COMPONENTS } from '../lib/components.ts';
import { simulate } from '../lib/simulation.ts';
import { getScenario, runLessonScenarios, evaluateScenarioExpectation } from '../lib/scenarios.ts';
import { getLessonActivities, evaluateActivity, captureMeasurement, currentEvidence, validateDiagnosisEvidence, needsSimulationTick } from '../lib/learning.ts';
import { assessBuild, assessConnections } from '../lib/assessment.ts';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis.ts';
import type { CircuitDocument } from '../lib/types.ts';
const lesson=(id:number)=>LESSONS.find(l=>l.id===id)!;
const copy=(id=7)=>structuredClone(lesson(id).circuit);
const failed=(checks:ReturnType<typeof runLessonScenarios>)=>checks.filter(c=>c.status!=='pass');
test('all 64 authored operating sequences pass at requested and nominal supplies without mutating graphs or states',()=>{
  const failures:unknown[]=[];
  for(const l of LESSONS)for(const voltage of l.circuit.supply.phase==='single'?[230,240]:[400]){
    const doc=copy(l.id);doc.supply.voltage=voltage;const result=simulate(doc),before=structuredClone(doc),states=structuredClone(result.deviceStates);
    const checks=runLessonScenarios(doc,result.deviceStates);
    if(failed(checks).length)failures.push({id:l.id,voltage,checks:failed(checks)});
    assert.deepEqual(doc,before);assert.deepEqual(result.deviceStates,states);
    assert.ok(getScenario(l.id)!.steps.some(s=>s.expectations.length>0));
  }
  assert.deepEqual(failures,[]);
});
test('every activity is unique and references real equipment, physical parts and terminals',()=>{
  for(const l of LESSONS){const activities=getLessonActivities(l);assert.equal(new Set(activities.map(a=>a.id)).size,activities.length);for(const a of activities){assert.ok(a.competency);if(a.component){const c=l.circuit.components.find(c=>c.id===a.component);assert.ok(c,`${l.id}:${a.id}`);if(a.part)assert.ok(COMPONENTS[c.type].parts.some(p=>p.id===a.part));}for(const e of a.endpoints??[]){const c=l.circuit.components.find(c=>c.id===e.component)!;assert.ok(COMPONENTS[c.type].terminals.some(t=>t.id===e.terminal));}if(a.kind==='operate')assert.doesNotMatch(a.instruction, /(?:closed|pressed|active|sensorValue|position|on)\s*=/);}assert.equal(activities.filter(a=>a.kind==='connect').length,l.circuit.wires.length);for(const k of ['inspect','predict','connect','operate','measure','explain','repair','retest'])assert.ok(activities.some(a=>a.kind===k),`${l.id} missing ${k}`);}
});
test('stopped starters, chime and emergency standby pass declared outcomes instead of requiring an active load',()=>{
  for(const id of [40,43,44,55,56,57,60,61,64]){const d=copy(id),r=simulate(d);const report=assessBuild(d,r,lesson(id).circuit);assert.equal(report.passed,true,`${id}:${JSON.stringify(failed(report.checks))}`);}
});
test('all 64 intact configurations pass the combined connection and operating assessment',()=>{
  const failures:unknown[]=[];for(const l of LESSONS){const d=copy(l.id),report=assessBuild(d,simulate(d),l.circuit);if(!report.passed)failures.push({id:l.id,checks:failed(report.checks)});}assert.deepEqual(failures,[]);
});
test('bypass and missing hold path fail real functional checks separately from matching connections',()=>{
  const bypass=copy();bypass.wires.push({id:'bypass',from:{component:'protect',terminal:'LOUT'},to:{component:'light',terminal:'L'},role:'L',resistance:.01,bends:[]});const checks=runLessonScenarios(bypass);assert.ok(checks.some(c=>c.title==='light operating load power stops'&&c.status==='fail'));assert.ok(assessConnections(bypass,lesson(7).circuit).some(c=>c.id==='extra:bypass'&&c.status==='fail'));
  const held=copy(55);held.wires=held.wires.filter(w=>w.id!==lesson(55).challenge.wire);assert.ok(runLessonScenarios(held).some(c=>c.status==='fail'&&c.title.includes('motor')));
});
test('mechanical pairing and selected machine parameters are not silently repaired by operating scenarios',()=>{
  const d=copy(56);d.components.find(c=>c.id==='reverse')!.params.mechanicallyInterlockedWith='';assert.ok(runLessonScenarios(d).some(c=>c.title==='Reverse has the actual mechanical pairing'&&c.status==='fail'));
  const windings=copy(57);windings.components.find(c=>c.id==='motor')!.params.windingVoltage=230;assert.ok(runLessonScenarios(windings).some(c=>c.title.includes('winding eligibility')&&c.status==='fail'));
});
test('unknown lesson and disabled supply cannot claim completed operating objectives',()=>{
  const d=copy();delete d.lessonId;assert.equal(runLessonScenarios(d)[0].status,'not-run');const off=copy();off.supply.enabled=false;assert.equal(runLessonScenarios(off)[0].status,'not-run');assert.equal(assessBuild(off,simulate(off),lesson(7).circuit).passed,false);
});
test('latched protective interruption remains a failed experiment until the actual circuit is reset',()=>{
  const d=copy();d.faults=[{type:'earth-fault',component:'light',enabled:true}];const tripped=simulate(d);assert.equal(tripped.deviceStates.protect.tripped,true);d.faults=[];assert.ok(runLessonScenarios(d,tripped.deviceStates).some(c=>c.status==='fail'&&c.title.includes('protection remains')));
});
test('current activity matches a rebuilt wire by endpoints rather than canonical wire ID',()=>{
  const d=copy(),a=getLessonActivities(lesson(7)).find(a=>a.measurement?.mode==='current')!;const original=d.wires.find(w=>w.id===a.measurement!.wire)!;original.id='learner-wire';const r=simulate(d),e=captureMeasurement(d,r,{mode:'current',wire:original.id});assert.equal(evaluateActivity(a,d,r,[e]).status,'pass');
});
test('prediction, inspection and repair require their own evidence and no normal example auto-credits a repair',()=>{
  const d=copy(),r=simulate(d),activities=getLessonActivities(lesson(7));const prediction=activities.find(a=>a.kind==='predict')!,inspect=activities.find(a=>a.kind==='inspect')!,repair=activities.find(a=>a.kind==='repair')!;
  assert.equal(evaluateActivity(prediction,d,r,[],'wrong').status,'fail');assert.equal(evaluateActivity(prediction,d,r,[],prediction.answer).status,'pass');assert.equal(evaluateActivity(inspect,d,r).status,'not-run');assert.equal(evaluateActivity(inspect,d,r,[],undefined,{inspected:[`${inspect.component}.${inspect.part}`]}).status,'pass');assert.equal(evaluateActivity(repair,d,r).status,'not-run');assert.equal(evaluateActivity(repair,d,r,[],undefined,{challengeStarted:true,diagnosisAccepted:true}).status,'pass');
});
function faultEvidence(){const d=copy();d.faults=[{type:'open-live',wire:lesson(7).challenge.wire,component:lesson(7).challenge.component,enabled:true}];const r=simulate(d),w=d.wires.find(w=>w.id===lesson(7).challenge.wire)!;return {d,r,e:[captureMeasurement(d,r,{mode:'voltage',a:w.from,b:w.to}),captureMeasurement(d,r,{mode:'current',wire:w.id})]};}
test('actual distinct target readings establish a diagnosis without click-count credit',()=>{
  const {d,r,e}=faultEvidence();assert.equal(validateDiagnosisEvidence(d,r,e,lesson(7).challenge).accepted,true);assert.equal(assessFaultDiagnosis(d,r,'open-live',0,lesson(7).challenge,e).accepted,true);
});
test('all 64 challenge targets accept actual localized measurements with the required doorbell demand exposed',()=>{
  for(const l of LESSONS){const d=copy(l.id);if(l.id===43)d.components.find(c=>c.id==='push')!.params.pressed=true;d.faults=[{type:l.challenge.fault,wire:l.challenge.wire,component:l.challenge.component,enabled:true}];const r=simulate(d,{},1);const supply=d.components.find(c=>['source','source3'].includes(c.type))!;
    const w=d.wires.find(w=>w.id===l.challenge.wire)||(l.challenge.component&&d.wires.find(w=>w.to.component===l.challenge.component&&['L','L1','DC+'].includes(w.role)));
    assert.ok(w,`${l.id}: target measurement path`);
    const e=[captureMeasurement(d,r,{mode:'current',wire:w.id}),captureMeasurement(d,r,{mode:'voltage',a:{component:supply.id,terminal:supply.type==='source3'?'L1':'L'},b:{component:supply.id,terminal:'N'}})];
    assert.equal(assessFaultDiagnosis(d,r,l.challenge.fault,0,l.challenge,e).accepted,true,`${l.id}:${JSON.stringify(e)}`);
  }
});
test('wrong targets, repeated reverse probe order, fabricated, stale and unresolved evidence cannot establish diagnosis',()=>{
  const {d,r,e}=faultEvidence(),target=lesson(7).challenge;const source={component:'supply',terminal:'L'},neutral={component:'supply',terminal:'N'},earth={component:'supply',terminal:'PE'};
  const wrong=[captureMeasurement(d,r,{mode:'voltage',a:source,b:neutral}),captureMeasurement(d,r,{mode:'voltage',a:source,b:earth})];assert.equal(validateDiagnosisEvidence(d,r,wrong,target).accepted,false);
  const duplicate=[e[0],captureMeasurement(d,r,{mode:'voltage',a:e[0].b,b:e[0].a})];assert.equal(currentEvidence(d,r,duplicate).length,1);assert.equal(validateDiagnosisEvidence(d,r,duplicate,target).accepted,false);
  for(const bad of [[{...e[0],revision:d.revision-1},e[1]],[{...e[0],value:12345},e[1]],[{...e[0],value:null},e[1]],[{...e[0],circuitId:'other'},e[1]]])assert.equal(assessFaultDiagnosis(d,r,'open-live',999,target,bad).accepted,false);
});
test('isolated resistance evidence never records a powered ohmmeter reading',()=>{
  const d=copy(),r=simulate(d),w=d.wires.find(w=>w.id===lesson(7).challenge.wire)!;assert.equal(captureMeasurement(d,r,{mode:'resistance',a:w.from,b:w.to}).value,null);d.supply.enabled=false;assert.notEqual(captureMeasurement(d,simulate(d),{mode:'resistance',a:w.from,b:w.to}).value,null);
});
test('a genuine isolated open-circuit reading is evidence, while a floating voltage or powered resistance is unresolved',()=>{
  const d=copy();d.supply.enabled=false;d.faults=[{type:'missing-earth',wire:d.wires.find(w=>w.to.component==='light'&&w.role==='PE')!.id,enabled:true}];const r=simulate(d),a={component:'supply',terminal:'PE'},b={component:'light',terminal:'PE'};const open=captureMeasurement(d,r,{mode:'resistance',a,b});assert.equal(open.value,null);assert.equal(open.status,'open');assert.equal(currentEvidence(d,r,[open]).length,1);const floating=captureMeasurement(d,r,{mode:'voltage',a,b});assert.equal(floating.status,'unresolved');assert.equal(currentEvidence(d,r,[floating]).length,0);
});
test('worker ticking is needed only while declared time-dependent processes are progressing',()=>{
  const simple=copy();assert.equal(needsSimulationTick(simple,simulate(simple)),false);
  const fan=copy(36);let r=simulate(fan);fan.components.find(c=>c.id==='light-switch')!.params.closed=false;r=simulate(fan,r.deviceStates,.1);assert.equal(needsSimulationTick(fan,r),true);for(let i=0;i<24;i++)r=simulate(fan,r.deviceStates,.25);assert.equal(needsSimulationTick(fan,r),false);
});
test('PIR run-on, valve travel, star-delta delay and declared controller delay request ticks then settle',()=>{
  for(const id of [14,29,57]){const d=copy(id);let r=simulate(d);for(let i=0;i<24;i++)r=simulate(d,r.deviceStates,.25);if(id===14)d.components.find(c=>c.id==='pir')!.params.active=false;if(id===29)d.components.find(c=>c.id==='room')!.params.closed=false;if(id===57)d.components.find(c=>c.id==='start')!.params.pressed=true;r=simulate(d,r.deviceStates,.1);assert.equal(needsSimulationTick(d,r),true,`Pending ${id}`);if(id===57)d.components.find(c=>c.id==='start')!.params.pressed=false;for(let i=0;i<24;i++)r=simulate(d,r.deviceStates,.25);assert.equal(needsSimulationTick(d,r),false,`Settled ${id}`);}
  const d=copy(15);d.components.find(c=>c.id==='photo')!.params.delay=2;let r=simulate(d,{},0);assert.equal(needsSimulationTick(d,r),true);for(let i=0;i<12;i++)r=simulate(d,r.deviceStates,.25);assert.equal(needsSimulationTick(d,r),false);
});
test('released START and held doorbell activities distinguish their actual operating response',()=>{
  const starter=copy(55),a=getLessonActivities(lesson(55)).find(a=>a.component==='start'&&a.kind==='operate')!;let r=simulate(starter);assert.equal(evaluateActivity(a,starter,r).status,'not-run');starter.components.find(c=>c.id==='start')!.params.pressed=true;r=simulate(starter,r.deviceStates,.25);starter.components.find(c=>c.id==='start')!.params.pressed=false;r=simulate(starter,r.deviceStates,.25);assert.equal(evaluateActivity(a,starter,r).status,'pass');
  const chime=copy(43),held=getLessonActivities(lesson(43)).find(a=>a.component==='push'&&a.kind==='operate'&&a.expectedParams?.pressed===true)!;assert.equal(held.expectedParams?.pressed,true);assert.equal(evaluateActivity(held,chime,simulate(chime)).status,'not-run');chime.components.find(c=>c.id==='push')!.params.pressed=true;assert.equal(evaluateActivity(held,chime,simulate(chime)).status,'pass');
});

test('connection activities require isolation of external and available local energy sources',()=>{
  const d=copy(),a=getLessonActivities(lesson(7)).find(a=>a.kind==='connect')!;
  assert.equal(evaluateActivity(a,d,simulate(d)).status,'not-run');d.supply.enabled=false;assert.equal(evaluateActivity(a,d,simulate(d)).status,'pass');
  const backup=copy(48),connection=getLessonActivities(lesson(48)).find(a=>a.kind==='connect')!;backup.supply.enabled=false;
  assert.equal(evaluateActivity(connection,backup,simulate(backup)).status,'not-run');backup.components.find(c=>c.type==='battery')!.params.on=false;assert.equal(evaluateActivity(connection,backup,simulate(backup)).status,'pass');
});

test('every authored operating step is exposed in the learner activities, with pulses combined into physical actions',()=>{
  for(const l of LESSONS){const scenario=getScenario(l.id)!,activities=getLessonActivities(l).filter(a=>a.id.includes('operate:sequence:'));
    const covered=new Set(activities.map(a=>Number(a.id.split(':').at(-1))));
    for(let i=0;i<scenario.steps.length;i++){const prior=scenario.steps[i-1],step=scenario.steps[i];const combinedRelease=prior?.patches.length===1&&prior.patches[0].params.pressed===true&&step.patches.length===1&&step.patches[0].params.pressed===false&&prior.patches[0].component===step.patches[0].component;
      assert.ok(covered.has(i)||combinedRelease,`${l.id} missing learner action ${i}`);
    }
  }
  const lighting=getLessonActivities(lesson(7));assert.ok(lighting.some(a=>a.expectedParams?.closed===false));assert.ok(lighting.some(a=>a.expectedParams?.closed===true));
  const stations=getLessonActivities(lesson(60));for(const c of ['start-a','start-b','stop-a','stop-b'])assert.ok(stations.some(a=>a.kind==='operate'&&a.component===c));
  assert.ok(getLessonActivities(lesson(48)).some(a=>a.expectedSupplyEnabled===false&&a.expectedObservations?.some(e=>'component'in e&&e.component==='essential')));
});

test('multi-control activities require every requested permission, and relative comparisons need actual prior evidence',()=>{
  const d=copy(27),a=getLessonActivities(lesson(27)).find(a=>a.expectedControls?.length===2)!;d.components.find(c=>c.id==='schedule')!.params.on=false;assert.equal(evaluateActivity(a,d,simulate(d)).status,'not-run');d.components.find(c=>c.id==='boost')!.params.closed=false;assert.equal(evaluateActivity(a,d,simulate(d)).status,'pass');
  const dimmer=copy(12),relative=getLessonActivities(lesson(12)).find(a=>a.expectedObservations?.some(e=>e.kind==='power'&&e.relative))!;dimmer.components.find(c=>c.id==='dimmer')!.params.level=.9;const r=simulate(dimmer);
  assert.equal(evaluateScenarioExpectation(relative.expectedObservations![0],dimmer,r).pass,null);assert.equal(evaluateActivity(relative,dimmer,r).status,'unresolved');
  assert.equal(evaluateActivity(relative,dimmer,r,[],undefined,{assessment:assessBuild(dimmer,r,lesson(12).circuit)}).status,'pass');
});

test('delayed overload and pulse output request worker ticks only until their declared process finishes',()=>{
  const overloaded=copy();overloaded.components.find(c=>c.id==='protect')!.params.rating=.2;overloaded.components.find(c=>c.id==='protect')!.params.delay=2;let r=simulate(overloaded,{},.05);assert.equal(r.deviceStates.protect.tripped,false);assert.equal(needsSimulationTick(overloaded,r),true);
  for(let i=0;i<12;i++)r=simulate(overloaded,r.deviceStates,.25);assert.equal(r.deviceStates.protect.tripped,true);assert.equal(needsSimulationTick(overloaded,r),false);
  const pulse=copy(15);const photo=pulse.components.find(c=>c.id==='photo')!;photo.type='timer';photo.params.mode='pulse';photo.params.delay=1;photo.params.on=true;
  r=simulate(pulse,{},.05);assert.equal(r.deviceStates.photo.closed,true);assert.equal(needsSimulationTick(pulse,r),true);for(let i=0;i<8;i++)r=simulate(pulse,r.deviceStates,.25);assert.equal(r.deviceStates.photo.closed,false);assert.equal(needsSimulationTick(pulse,r),false);
});

test('available battery backup advances its energy state while delivering power, then stops when unavailable',()=>{
  const d=copy(48);let r=simulate(d);assert.equal(needsSimulationTick(d,r),false);d.supply.enabled=false;r=simulate(d,r.deviceStates,.25);const before=r.deviceStates.inverter.level;assert.equal(needsSimulationTick(d,r),true);r=simulate(d,r.deviceStates,.25);assert.ok(r.deviceStates.inverter.level<before);
  d.components.find(c=>c.type==='battery')!.params.on=false;r=simulate(d,r.deviceStates,.25);assert.equal(needsSimulationTick(d,r),false);
});

test('terminal teaching purposes identify coil, contacts, winding pairs and isolated AC output truthfully',()=>{
  const purpose=(type:string,id:string)=>COMPONENTS[type].terminals.find(t=>t.id===id)!.purpose;
  assert.match(purpose('contactor','A1'),/A1–A2/);assert.match(purpose('contactor','13'),/Normally open/);assert.match(purpose('contactor','21'),/Normally closed/);assert.match(purpose('overload','95'),/95–96/);
  assert.match(purpose('motor3','U1'),/U2/);assert.match(purpose('transformer','+'),/AC secondary/);assert.match(purpose('transformer','-'),/not fixed DC polarity/);assert.equal(COMPONENTS.transformer.terminals.find(t=>t.id==='+')!.role,'output');
  for(const def of Object.values(COMPONENTS))for(const t of def.terminals)assert.doesNotMatch(t.purpose,/function depends on the contact map/);
  for(const l of LESSONS){const section=l.sections.find(s=>s.title==='Calculations and expected readings');assert.ok(section,`${l.id}: missing worked calculation`);assert.match(section.beginner,/[\d]/);assert.match(section.apprentice,/ΔV = I × Z/);}
});
