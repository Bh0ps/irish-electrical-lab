import { COMPONENTS } from './components.ts';
import { getScenario, lessonCompetency, evaluateScenarioExpectation, type ScenarioExpectation } from './scenarios.ts';
import { measureResistance, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type ConfigurationLesson, type Endpoint, type SimulationResult } from './types.ts';
import type { BuildAssessment } from './assessment.ts';
import { findConnectionWire } from './wire-connections.ts';

export interface MeasurementEvidence {
  id:string; lessonId?:number; circuitId:string; revision:number; mode:'voltage'|'current'|'resistance';
  a?:Endpoint; b?:Endpoint; wire?:string; value:number|null; unit:string; explanation:string; recordedAt:number;
  controlState:Record<string,string|number|boolean>;
  status?:'value'|'open'|'unresolved';
}
export interface LessonActivity {
  id:string;kind:'inspect'|'predict'|'connect'|'operate'|'measure'|'explain'|'repair'|'retest';title:string;instruction:string;explanation:string;
  component?:string;part?:string;endpoints?:Endpoint[];options?:{id:string;label:string}[];answer?:string;
  measurement?:{mode:'voltage'|'current'|'resistance';a?:Endpoint;b?:Endpoint;wire?:string};competency:string;
  wire?:string;expectedRole?:string;expectedParams?:Record<string,string|number|boolean>;expectedSupplyEnabled?:boolean;expectedObservations?:ScenarioExpectation[];
  expectedControls?:{component:string;params:Record<string,string|number|boolean>}[];
  expectedSignalOpen?:{a:Endpoint;b:Endpoint};scenarioStep?:number;
}
export interface ActivityOutcome {status:'pass'|'fail'|'not-run'|'unresolved';explanation:string}
const eq=(a:Endpoint|undefined,b:Endpoint|undefined)=>!!a&&!!b&&endpointKey(a)===endpointKey(b);
function knownEndpoint(doc:CircuitDocument,e:Endpoint|undefined){const c=e&&doc.components.find(c=>c.id===e.component);return !!(c&&COMPONENTS[c.type]?.terminals.some(t=>t.id===e!.terminal));}
export function controlSnapshot(doc:CircuitDocument):Record<string,string|number|boolean>{
  return Object.fromEntries([['supply.enabled',doc.supply.enabled],['supply.voltage',doc.supply.voltage],['supply.frequency',doc.supply.frequency],...doc.components.flatMap(c=>Object.entries(c.params).map(([key,value])=>[`${c.id}.${key}`,value]))]);
}
export function captureMeasurement(document:CircuitDocument,result:SimulationResult|undefined,request:NonNullable<LessonActivity['measurement']>,recordedAt=Date.now()):MeasurementEvidence {
  let value:number|null=null,explanation='Select valid measuring points.';const unit=request.mode==='voltage'?'V':request.mode==='current'?'A':'Ω';
  if(request.mode==='resistance'&&knownEndpoint(document,request.a)&&knownEndpoint(document,request.b))({value,explanation}=measureResistance(document,request.a!,request.b!));
  else if(result?.revision===document.revision&&result.converged){
    if(request.mode==='voltage'&&knownEndpoint(document,request.a)&&knownEndpoint(document,request.b))({value,explanation}=measureVoltage(result,request.a!,request.b!));
    else if(request.mode==='current'&&document.wires.some(w=>w.id===request.wire)){const c=result.wireCurrents[request.wire!];value=c?Math.hypot(c.re,c.im):null;explanation=c?'RMS current through the selected actual conductor.':'This conductor has no resolved current.';}
  }else if(request.mode!=='resistance')explanation='Wait for a current, converged electrical result before recording this reading.';
  const status=Number.isFinite(value)?'value':request.mode==='resistance'&&explanation.startsWith('Open circuit:')?'open':'unresolved';
  return {id:`measurement-${recordedAt}-${request.mode}-${request.wire??[request.a&&endpointKey(request.a),request.b&&endpointKey(request.b)].join(':')}`,lessonId:document.lessonId,circuitId:document.id,revision:document.revision,...structuredClone(request),value:Number.isFinite(value)?value:null,unit,explanation,recordedAt,controlState:controlSnapshot(document),status};
}
function identity(e:MeasurementEvidence){return e.mode==='current'?`current:${e.wire}`:`${e.mode}:${[e.a&&endpointKey(e.a),e.b&&endpointKey(e.b)].sort().join('|')}`;}
/** Only actual, current measurements count. Opposite probe order is the same observation. */
export function currentEvidence(document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):MeasurementEvidence[]{
  const snapshot=controlSnapshot(document),seen=new Set<string>();
  return evidence.filter(e=>{
    if(!e||e.circuitId!==document.id||e.revision!==document.revision||e.lessonId!==document.lessonId||!Number.isFinite(e.recordedAt)||(e.value===null?e.status!=='open':!Number.isFinite(e.value))||!['voltage','current','resistance'].includes(e.mode)||!e.controlState||Object.keys(snapshot).some(k=>e.controlState[k]!==snapshot[k]))return false;
    const actual=captureMeasurement(document,result,e,e.recordedAt);if(actual.unit!==e.unit||e.status!==undefined&&actual.status!==e.status)return false;if(e.value===null){if(actual.status!=='open'||e.mode!=='resistance')return false;}else if(actual.value===null||Math.abs(actual.value-e.value)>Math.max(1e-6,Math.abs(actual.value)*1e-5))return false;
    const key=identity(e);if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function validateDiagnosisEvidence(document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[],target:{wire?:string;component?:string}):{accepted:boolean;explanation:string}{
  const readings=currentEvidence(document,result,evidence),wire=document.wires.find(w=>w.id===target.wire);
  const pair=(e:MeasurementEvidence)=>!!wire&&(eq(e.a,wire.from)&&eq(e.b,wire.to)||eq(e.a,wire.to)&&eq(e.b,wire.from));
  const relevant=readings.some(e=>target.wire?(e.mode==='current'&&e.wire===target.wire||pair(e)):(e.a?.component===target.component||e.b?.component===target.component||document.wires.find(w=>w.id===e.wire)&&[document.wires.find(w=>w.id===e.wire)!.from.component,document.wires.find(w=>w.id===e.wire)!.to.component].includes(target.component??'')));
  if(readings.length<2)return {accepted:false,explanation:'Record at least two distinct, current measurements. Repeated clicks, old readings and unresolved values do not establish evidence.'};
  if(!relevant)return {accepted:false,explanation:'Measure the investigated conductor itself or the affected equipment. Readings elsewhere do not localize this defect.'};
  return {accepted:true,explanation:'Current target measurements are recorded; the electrical comparison will now check the diagnosis.'};
}
function display(lesson:ConfigurationLesson,e:Endpoint){return `${lesson.circuit.components.find(c=>c.id===e.component)?.label??e.component} · ${e.terminal}`;}
function loadPair(lesson:ConfigurationLesson):{a:Endpoint;b:Endpoint}|undefined {
  const candidates=lesson.circuit.components.filter(c=>['lamp','led','socket','socket3','heater','motor','motor3','pump','fan','cooker','shower','boiler','heatpump','chime','emergency','alarm','indicator','ev'].includes(c.type));
  for(const c of candidates){const ports=COMPONENTS[c.type]?.terminals.map(t=>t.id)??[];if(ports.includes('L')&&ports.includes('N'))return {a:{component:c.id,terminal:'L'},b:{component:c.id,terminal:'N'}};if(ports.includes('U1')&&ports.includes('U2'))return {a:{component:c.id,terminal:'U1'},b:{component:c.id,terminal:'U2'}};if(ports.includes('L1')&&ports.includes('N'))return {a:{component:c.id,terminal:'L1'},b:{component:c.id,terminal:'N'}};}
  const source=lesson.circuit.components.find(c=>c.type==='source'||c.type==='source3');return source?{a:{component:source.id,terminal:source.type==='source3'?'L1':'L'},b:{component:source.id,terminal:'N'}}:undefined;
}
function operateLanguage(lesson:ConfigurationLesson,component:string,params:Record<string,string|number|boolean>):string {
  const item=lesson.circuit.components.find(c=>c.id===component),name=item?.label??component;
  return Object.entries(params).map(([key,value])=>{
    if(key==='closed')return `${value?'Close':'Open'} ${name}`;
    if(key==='pressed')return `${value?'Press':'Release'} ${name}`;
    if(key==='position')return `Move ${name} to its ${value===0?'first':value===1?'second':'selected'} position`;
    if(key==='active'||key==='demand')return `${value?'Apply':'Remove'} the represented demand at ${name}`;
    if(key==='on')return `${value?'Enable':'Remove'} the operating permission at ${name}`;
    if(key==='level')return `Set ${name} to ${Math.round(Number(value)*100)}%`;
    if(key==='sensorValue')return `Set the represented sensor reading at ${name} to ${value}${item?.params.mode==='temperature'?' °C':''}`;
    if(key==='alarm')return `${value?'Trigger':'Clear'} the alarm condition at ${name}`;
    if(key==='availability')return `${Number(value)===0?'Remove solar availability':'Set the represented solar availability'} at ${name}`;
    return `Change the represented condition at ${name} to ${value}`;
  }).join('. ')+'.';
}
/** Each configuration has concrete terminal targets, not a disconnected text checklist. */
export function getLessonActivities(lesson:ConfigurationLesson):LessonActivity[]{
  const competency=lessonCompetency(lesson.id),base=(id:string,kind:LessonActivity['kind'],title:string,instruction:string,explanation:string):LessonActivity=>({id:`lesson:${lesson.id}:${id}`,kind,title,instruction,explanation,competency});
  const activities:LessonActivity[]=lesson.circuit.components.map(c=>({...base(`inspect:${c.id}`,'inspect',`Inspect ${c.label}`,`Select ${c.label}. Open its terminal view and identify the normal operating terminals and any protective terminal.`,`${COMPONENTS[c.type].description} ${COMPONENTS[c.type].abstraction??''}`),component:c.id,part:'terminals',endpoints:COMPONENTS[c.type].terminals.map(t=>({component:c.id,terminal:t.id}))}));
  const scenario=getScenario(lesson.id);let actionIndex=scenario?.steps.findIndex(s=>s.patches.length&&s.expectations.some(e=>e.kind==='power'||e.kind==='state'))??-1;
  if(actionIndex<0)actionIndex=scenario?.steps.findIndex(s=>s.patches.length)??-1;
  const action=actionIndex>=0?scenario?.steps[actionIndex]:undefined;
  const observedAction=action?.expectations.length?action:scenario?.steps.slice(Math.max(0,actionIndex+1)).find(s=>s.expectations.length);
  const prediction=observedAction?.expectations.find(e=>e.kind==='power'||e.kind==='state');
  if(action&&prediction){
    let answer='expected',label=prediction.title;const component='component'in prediction?prediction.component:undefined;
    if(prediction.kind==='power'){answer=prediction.max!==undefined?'stopped':'operating';label=answer==='stopped'?'Operating load power stops':'The load receives operating power';}
    const other=answer==='stopped'?'operating':answer==='operating'?'stopped':'opposite';
    activities.push({...base('predict','predict','Predict before operating',`After “${action.title}”, what should happen to ${component?lesson.circuit.components.find(c=>c.id===component)?.label??component:'the circuit'}?`,`${prediction.title}. Compare your prediction with the measured outcome, then trace the actual operating and return paths.`),component,answer,options:[{id:answer,label},{id:other,label:other==='stopped'?'Operating load power stops':other==='operating'?'The load receives operating power':'That expected behaviour is prevented'}]});
  }else{
    const pair=loadPair(lesson);activities.push({...base('predict','predict','Predict the measuring reference','Can protective earth replace the normal return conductor for this load?','Normal load current uses its designated return. Protective earth has a different purpose; some incorrect arrangements can operate and still fail protective checks.'),answer:'separate',options:[{id:'separate',label:'Use the designated normal return'},{id:'earth-return',label:'Use protective earth as the normal return'}],endpoints:pair?[pair.a,pair.b]:undefined});
  }
  for(const w of lesson.circuit.wires){const from=lesson.circuit.components.find(c=>c.id===w.from.component)!,to=lesson.circuit.components.find(c=>c.id===w.to.component)!;const ft=COMPONENTS[from.type].terminals.find(t=>t.id===w.from.terminal)!,tt=COMPONENTS[to.type].terminals.find(t=>t.id===w.to.terminal)!;activities.push({...base(`connect:${w.id}`,'connect',`Connect ${display(lesson,w.from)} to ${display(lesson,w.to)}`,`With the simulated supply off, connect these actual terminals using the ${w.role} conductor identification.`,`${ft.purpose} → ${tt.purpose}. The connection is determined by its endpoints. Colour or visual proximity cannot change its electrical path.`),component:to.id,part:'terminals',endpoints:[structuredClone(w.from),structuredClone(w.to)],wire:w.id,expectedRole:w.role});}
  const source=lesson.circuit.components.find(c=>c.type==='source'||c.type==='source3');
  const localSources=lesson.circuit.components.filter(c=>['pv','battery'].includes(c.type)&&Boolean(c.params.on??COMPONENTS[c.type].defaults.on??true));
  const enableLocal=localSources.map(c=>`Select ${c.label} and use Operate to enable its local source.`).join(' ');
  activities.push({...base('operate:supply','operate',localSources.length?'Enable the external and local supplies':'Enable the simulated supply',`After completing the connections, enable the simulated supply. Leave resistance mode before applying the supply.${enableLocal?' '+enableLocal:''}`,`Powered tests and isolated continuity tests answer different questions. Operating voltage is selected in the supply controls.${localSources.length?' PV and battery availability are separate controls: guided wiring isolates them, and this step restores the local sources enabled in the original example.':''}`),component:source?.id,expectedSupplyEnabled:true,...localSources.length?{expectedControls:localSources.map(c=>({component:c.id,params:{on:true}}))}:{}});
  // Present the complete authored sequence, including legitimate stopped states,
  // independent zones, delayed actions and backup operation. A pulse is one
  // physical press/release task; the resulting maintained response must be seen.
  for(let index=0;index<(scenario?.steps.length??0);index++){
    const step=scenario!.steps[index],next=scenario!.steps[index+1];
    const pulse=step.patches.length===1&&step.patches[0].params.pressed===true&&next?.patches.length===1&&next.patches[0].component===step.patches[0].component&&next.patches[0].params.pressed===false;
    let outcomeIndex=index;
    if(pulse){outcomeIndex=index+1;for(let i=index+2;i<scenario!.steps.length;i++){if(scenario!.steps[i].patches.length||scenario!.steps[i].supplyEnabled!==undefined||scenario!.steps[i].openSignal)break;if(scenario!.steps[i].expectations.length){outcomeIndex=i;break;}}}
    const observed=scenario!.steps[outcomeIndex],controls=pulse?next.patches:step.patches;
    const target=step.patches[0]?.component??('component'in(observed.expectations[0]??{})?(observed.expectations[0] as {component:string}).component:source?.id);
    const comparison=observed.expectations.some(e=>e.kind==='total-power'||e.kind==='power'&&e.relative);
    let instruction=pulse?`Press and release ${lesson.circuit.components.find(c=>c.id===target)?.label??target}. Observe the maintained response${lesson.id===57?' after the star–delta delay':''}.`:step.patches.map(p=>p.params.pressed===true?`Hold ${lesson.circuit.components.find(c=>c.id===p.component)?.label??p.component} down.`:operateLanguage(lesson,p.component,p.params)).join(' ');
    if(step.supplyEnabled!==undefined)instruction+=` ${step.supplyEnabled?'Enable':'Disable'} the simulated external supply. Internal backup availability remains a separate condition.`;
    if(step.openSignal)instruction+=` Isolate the simulated sources and interrupt the actual signal conductor from ${display(lesson,step.openSignal.a)} to ${display(lesson,step.openSignal.b)}, then restore the operating supply.`;
    if(!instruction.trim())instruction='Observe the circuit in the state established by the preceding action.';
    instruction+=comparison?' Run Test to verify the comparison against the earlier operating point.':' Wait for the stated response before checking this activity.';
    activities.push({...base(`operate:sequence:${index}`,'operate',step.title.replace(/: press$/,''),instruction.trim(),`${observed.expectations.map(e=>e.title).join('. ')}. Delays use simulated time; operating and protective findings remain separate.`),component:target,expectedControls:structuredClone(controls),expectedParams:controls.find(p=>p.component===target)?.params,expectedSupplyEnabled:step.supplyEnabled,expectedSignalOpen:step.openSignal&&structuredClone(step.openSignal),expectedObservations:structuredClone(observed.expectations),scenarioStep:outcomeIndex});
    if(pulse)index++;
  }
  const pair=loadPair(lesson);if(pair)activities.push({...base('measure:voltage','measure','Measure across the load',`Place red on ${display(lesson,pair.a)} and black on ${display(lesson,pair.b)}. Record the voltage under the present control state.`,`${lesson.sections.find(s=>s.title==='Measurements and model limits')?.beginner??'Measure across the actual pair.'} A reading near zero can be a legitimate stopped state; record the control state with it.`),component:pair.a.component,endpoints:[pair.a,pair.b],measurement:{mode:'voltage',...pair}});
  const live=lesson.circuit.wires.find(w=>['L','L1','L2','L3','DC+'].includes(w.role));if(live)activities.push({...base('measure:current','measure','Measure a conductor current',`Select the conductor from ${display(lesson,live.from)} to ${display(lesson,live.to)} and record its RMS current.`,`This is current through that conductor. Parallel paths and ring legs may carry different currents; the selected wire and controls are part of the evidence.`),component:live.to.component,endpoints:[live.from,live.to],wire:live.id,measurement:{mode:'current',wire:live.id}});
  const target=lesson.circuit.wires.find(w=>w.id===lesson.challenge.wire);if(target)activities.push({...base('measure:target','measure','Localize an interrupted path',`Isolate simulated sources, then measure resistance between ${display(lesson,target.from)} and ${display(lesson,target.to)}. Re-enable the supply only after leaving resistance mode.`, 'Compare the isolated continuity with the voltage/current symptoms. An alternative parallel path can produce a finite resistance even when this conductor is broken. The ohmmeter uses the declared passive teaching model.'),component:target.to.component,endpoints:[target.from,target.to],measurement:{mode:'resistance',a:target.from,b:target.to}});
  activities.push({...base('explain','explain','Explain operation and protection','Why does an operating load alone fail to demonstrate correct protective wiring?','Normal operation demonstrates an operating loop. Protective continuity, conductor identification and control behaviour require their own checks.'),options:[{id:'separate',label:'Operation and protective paths need separate checks'},{id:'lit',label:'An operating load proves every connection is correct'}],answer:'separate'});
  activities.push({...base('repair','repair','Repair the investigated defect','After recording and explaining the target measurements, repair the injected defect. Remove its cause before resetting any interrupted protection.','Clearing a defect is followed by a fresh operating check, not automatic competence credit.'),component:lesson.challenge.component,endpoints:target?[target.from,target.to]:undefined});
  activities.push(base('retest','retest','Retest the operating sequence','Run the lesson test after repair. Check every authored operating objective, including stopped states, independence and any timed sequence.','The test runs copies of this actual terminal graph. A passing result covers this declared model, not a real installation.'));
  return activities;
}
export function evaluateActivity(activity:LessonActivity,document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]=[],answer?:string,context:{assessment?:BuildAssessment;inspected?:string[];challengeStarted?:boolean;diagnosisAccepted?:boolean;repairVerified?:boolean}={}):ActivityOutcome{
  const outcome=(status:ActivityOutcome['status'],explanation:string)=>({status,explanation});
  if(activity.kind==='predict'||activity.kind==='explain')return answer?outcome(answer===activity.answer?'pass':'fail',answer===activity.answer?activity.explanation:'Reconsider the designated operating path, control request and protective purpose, then compare with the experiment.'):outcome('not-run','Choose a prediction or explanation before revealing the feedback.');
  if(activity.kind==='inspect')return context.inspected?.includes(`${activity.component}.${activity.part}`)||answer===`${activity.component}.${activity.part}`?outcome('pass',activity.explanation):outcome('not-run','Select the requested physical part and read its purpose.');
  if(activity.kind==='connect'){
    const [a,b]=activity.endpoints??[];
    if(!a||!b)return outcome('unresolved','This activity has no valid endpoint pair.');
    const wire=findConnectionWire(document.wires,a,b,activity.expectedRole);
    // The external switch alone does not isolate an available local battery/PV
    // source. Use the same source-isolation guard as the simulated ohmmeter.
    const isolation=measureResistance(document,a,b);
    if(isolation.explanation.startsWith('Turn the simulated supply off')||isolation.explanation.startsWith('An additional generation or battery source'))return outcome('not-run','Isolate the simulated external supply and any available local energy source before demonstrating this connection.');
    return wire?outcome(wire.role===activity.expectedRole?'pass':'fail',wire.role===activity.expectedRole?activity.explanation:'The endpoints match, but conductor identification differs from this lesson.'):outcome('not-run','Connect the highlighted terminal pair.');
  }
  if(activity.kind==='operate'){
    const c=document.components.find(c=>c.id===activity.component);
    if(activity.component&&!c)return outcome('unresolved','The requested control is missing.');
    const controls=activity.expectedControls??(c?[{component:c.id,params:activity.expectedParams??{}}]:[]);
    const params=controls.every(p=>{const actual=document.components.find(c=>c.id===p.component);return !!actual&&Object.entries(p.params).every(([k,v])=>actual.params[k]===v);});
    const supply=activity.expectedSupplyEnabled===undefined||document.supply.enabled===activity.expectedSupplyEnabled;
    const interrupted=activity.expectedSignalOpen,signal=interrupted?document.wires.find(w=>eq(w.from,interrupted.a)&&eq(w.to,interrupted.b)||eq(w.from,interrupted.b)&&eq(w.to,interrupted.a)):undefined;
    const signalOpen=!interrupted||!signal||document.faults.some(f=>f.enabled&&f.wire===signal.id&&['wrong-control','open-live','open-neutral'].includes(f.type));
    const observations=activity.expectedObservations??[];
    const report=context.assessment,currentReport=report?.circuitId===document.id&&report.revision===document.revision;
    let unresolved=false;
    const observed=!!result&&result.revision===document.revision&&result.converged&&observations.every((e,index)=>{
      if(e.kind==='total-power'||e.kind==='power'&&e.relative){const check=currentReport&&report.checks.find(c=>c.id===`scenario:${document.lessonId}:${activity.scenarioStep}:${index}`);if(!check){unresolved=true;return false;}return check.status==='pass';}
      const evaluated=evaluateScenarioExpectation(e,document,result);if(evaluated.pass===null)unresolved=true;return evaluated.pass===true;
    });
    if(params&&supply&&signalOpen&&unresolved)return outcome('unresolved','Run Test to resolve the sequence comparison at this operating point. A single snapshot cannot establish a change from an earlier reading.');
    return outcome(params&&supply&&signalOpen&&observed?'pass':'not-run',params&&supply&&signalOpen&&observed?activity.explanation:'Perform every stated control action and wait for its measured response. A released pushbutton alone does not demonstrate that the holding circuit operated.');
  }
  if(activity.kind==='measure'){const m=activity.measurement;if(!m)return outcome('unresolved','This activity has no measurement contract.');const [a,b]=activity.endpoints??[];const actualWire=document.wires.find(w=>eq(w.from,a)&&eq(w.to,b)||eq(w.from,b)&&eq(w.to,a));const found=currentEvidence(document,result,evidence).some(e=>e.mode===m.mode&&(m.mode==='current'?e.wire===(actualWire?.id??m.wire):eq(e.a,m.a)&&eq(e.b,m.b)||eq(e.a,m.b)&&eq(e.b,m.a)));return outcome(found?'pass':'not-run',found?activity.explanation:'Record a current, resolved reading at the specified points in the current control state.');}
  if(activity.kind==='repair'){if(!context.challengeStarted||!context.diagnosisAccepted)return outcome('not-run','Start this fault exercise and establish an accepted, measured diagnosis before claiming a repair.');return outcome(document.faults.some(f=>f.enabled)||context.repairVerified===false?'not-run':'pass',document.faults.some(f=>f.enabled)?'The injected defect is still active. Record the evidence, remove its cause, then reset interrupted protection.':activity.explanation);}
  const a=context.assessment;return !a?outcome('not-run','Run the lesson test.'):a.circuitId!==document.id||a.revision!==document.revision?outcome('not-run','The circuit changed after that test; retest the current graph.'):outcome(a.passed?'pass':'fail',a.summary);
}
/** A worker can stop continuous polling once all represented time processes settle. */
export function needsSimulationTick(document:CircuitDocument,result:SimulationResult):boolean{
  return document.components.some(c=>{const s=result.deviceStates[c.id],p={...COMPONENTS[c.type]?.defaults,...c.params};if(!s)return false;if((c.type==='valve'||c.type==='valve3')&&s.moving)return true;if(c.type==='battery'&&s.energized&&s.level>.01&&!s.gridPresent&&Number(s.outputPower)>1e-4)return true;const delay=Number(p.delay??0);if(['timer','sensor','smartrelay'].includes(c.type)&&s.energized&&delay>0){if(c.type==='timer'&&p.mode==='off-delay')return !s.command&&s.closed&&s.elapsed<delay;if(c.type==='timer'&&p.mode==='pulse')return !!s.command&&s.closed&&s.elapsed<delay;return !!s.command&&!s.closed&&s.elapsed<delay;}return ['mcb','mcb3','fuse','fcu','plug','overload','rcbo'].includes(c.type)&&!s.tripped&&s.level>1.05;});
}
