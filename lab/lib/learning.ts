import { COURSE_BOARD_ID,COURSE_BOND_ID } from './board-examples.ts';
import { elvProbePair } from './elv-coursebook.ts';
import { COURSE_PAGES } from './coursebook-content.ts';
import { describeEndpoint } from './build-hints.ts';
import { COMPONENTS, equipmentPurpose } from './components.ts';
import { forkMode, forkRead, instrumentData, type InstrumentEvidence } from './fork-tester.ts';
import { getScenario, lessonCompetency, evaluateScenarioExpectation, type ScenarioExpectation } from './scenarios.ts';
import { measureResistance, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type ConfigurationLesson, type Endpoint, type SimulationResult, type Wire } from './types.ts';
import type { BuildAssessment } from './assessment.ts';
import { findConnectionWire } from './wire-connections.ts';

export interface MeasurementEvidence {
  id:string; lessonId?:number; circuitId:string; revision:number; mode:'voltage'|'current'|'resistance';
  a?:Endpoint; b?:Endpoint; wire?:string; value:number|null; unit:string; explanation:string; recordedAt:number;
  controlState:Record<string,string|number|boolean>;
  status?:'value'|'open'|'unresolved';
  /** True for a meter setup that supplied the points to the learner. */
  assisted?:boolean;
  instrument?:InstrumentEvidence;
}
export interface LessonActivity {
  id:string;kind:'inspect'|'predict'|'connect'|'operate'|'measure'|'explain'|'repair'|'retest';title:string;instruction:string;explanation:string;
  component?:string;part?:string;endpoints?:Endpoint[];options?:{id:string;label:string}[];answer?:string;
  measurement?:{mode:'voltage'|'current'|'resistance';a?:Endpoint;b?:Endpoint;wire?:string;instrument?:InstrumentEvidence};competency:string;
  bookStep?:'intro'|'switch-off'|'switch-on'|'contact'|'meter-demo'|'dimmer'|'finish';
  independentMeasurement?:boolean;
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
  let value:number|null=null,explanation='Choose the points you want to measure.';const unit=request.mode==='voltage'?'V':request.mode==='current'?'A':'Ω';
  let instrument:InstrumentEvidence|undefined;
  let open = false;
  if(request.instrument){
    const t=request.instrument;
    if(t.method.startsWith('fork-'))request={...request,a:undefined,b:t.method==='fork-voltage'&&t.reference==='black'?request.b:undefined};
    const setup={method:t.method,reference:t.reference,a:request.a,b:request.b,wire:request.wire};
    if(t.model==='T6-600'&&t.held===false&&forkMode(t.method)===request.mode){
      const reading=forkRead(document,result,setup,undefined,true);
      value=reading.value;explanation=reading.explanation;open=reading.status==='open';
      instrument=instrumentData(setup,reading);
    }
  }else if(request.mode==='resistance'&&knownEndpoint(document,request.a)&&knownEndpoint(document,request.b)){
    const sample=measureResistance(document,request.a!,request.b!);
    value=sample.value;explanation=sample.explanation;open=sample.reason==='open';
  }
  else if(result?.revision===document.revision&&result.converged){
    if(request.mode==='voltage'&&knownEndpoint(document,request.a)&&knownEndpoint(document,request.b))({value,explanation}=measureVoltage(result,request.a!,request.b!));
    else if(request.mode==='current'&&document.wires.some(w=>w.id===request.wire)){const c=result.wireCurrents[request.wire!];value=c?Math.hypot(c.re,c.im):null;explanation=c?'Current through the selected wire.':'This conductor has no resolved current.';}
  }else if(request.mode!=='resistance')explanation='Wait for the bench to finish calculating this reading.';
  const status=Number.isFinite(value)?'value':request.mode==='resistance'&&open?'open':'unresolved';
  return {id:`measurement-${recordedAt}-${request.mode}-${request.wire??[request.a&&endpointKey(request.a),request.b&&endpointKey(request.b)].join(':')}`,lessonId:document.lessonId,circuitId:document.id,revision:document.revision,...structuredClone(request),value:Number.isFinite(value)?value:null,unit,explanation,recordedAt,controlState:controlSnapshot(document),status,...(request.instrument?{instrument}:{})};
}
function identity(e:MeasurementEvidence){if(e.instrument?.method==='fork-voltage')return 'fork-voltage:'+e.wire;return e.mode==='current'?`current:${e.wire}`:`${e.mode}:${[e.a&&endpointKey(e.a),e.b&&endpointKey(e.b)].sort().join('|')}`;}
/** Only actual, current measurements count. Opposite probe order is the same observation. */
export function currentEvidence(document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):MeasurementEvidence[]{
  const snapshot=controlSnapshot(document),seen=new Set<string>();
  // Prefer the latest verified sample of a given pair, including a learner
  // choosing their own probes after seeing a worked reading.
  return [...evidence].reverse().filter(e=>{
    if(!e||e.circuitId!==document.id||e.revision!==document.revision||e.lessonId!==document.lessonId||!Number.isFinite(e.recordedAt)||(e.value===null?e.status!=='open':!Number.isFinite(e.value))||!['voltage','current','resistance'].includes(e.mode)||!e.controlState||Object.keys(snapshot).some(k=>e.controlState[k]!==snapshot[k]))return false;
    const actual=captureMeasurement(document,result,e,e.recordedAt);if(e.instrument&&(!actual.instrument||e.instrument.held!==false||actual.instrument.displayed!==e.instrument.displayed||actual.instrument.signal!==e.instrument.signal))return false;if(actual.unit!==e.unit||e.status!==undefined&&actual.status!==e.status)return false;if(e.value===null){if(actual.status!=='open'||e.mode!=='resistance')return false;}else if(actual.value===null||Math.abs(actual.value-e.value)>Math.max(1e-6,Math.abs(actual.value)*1e-5))return false;
    const key=identity(e);if(seen.has(key))return false;seen.add(key);return true;
  });
}
export function validateDiagnosisEvidence(document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[],target:{wire?:string;component?:string}):{accepted:boolean;explanation:string}{
  const readings=currentEvidence(document,result,evidence),wire=document.wires.find(w=>w.id===target.wire);
  const pair=(e:MeasurementEvidence)=>e.instrument?.method!=='fork-voltage'&&!!wire&&(eq(e.a,wire.from)&&eq(e.b,wire.to)||eq(e.a,wire.to)&&eq(e.b,wire.from));
  const relevant=readings.some(e=>target.wire?(e.mode==='current'&&e.wire===target.wire||pair(e)):(e.a?.component===target.component||e.b?.component===target.component||document.wires.find(w=>w.id===e.wire)&&[document.wires.find(w=>w.id===e.wire)!.from.component,document.wires.find(w=>w.id===e.wire)!.to.component].includes(target.component??'')));
  if(readings.length<2)return {accepted:false,explanation:'Record two different readings on the circuit as it is now.'};
  if(!relevant)return {accepted:false,explanation:'Take one reading on the wire or fitting you think is faulty.'};
  return {accepted:true,explanation:'Your readings are saved. The bench can now check your diagnosis.'};
}
export const wireMarking: Record<Wire['role'], string> = {
  L:'line (L)', N:'neutral (N)', PE:'earth (PE)', L1:'phase L1', L2:'phase L2', L3:'phase L3',
  control:'control', output:'output', 'DC+':'positive (+)', 'DC-':'negative (−)',
};

function loadPair(lesson:ConfigurationLesson):{a:Endpoint;b:Endpoint}|undefined {
  const extra=elvProbePair(lesson.id);if(extra)return extra;
  const candidates=lesson.circuit.components.filter(c=>['lamp','led','socket','shaveroutlet','socket3','heater','motor','motor3','pump','fan','cooker','shower','boiler','heatpump','chime','emergency','alarm','indicator','ev'].includes(c.type));
  for(const c of candidates){const ports=COMPONENTS[c.type]?.terminals.map(t=>t.id)??[];if(ports.includes('L')&&ports.includes('N'))return {a:{component:c.id,terminal:'L'},b:{component:c.id,terminal:'N'}};if(ports.includes('U1')&&ports.includes('U2'))return {a:{component:c.id,terminal:'U1'},b:{component:c.id,terminal:'U2'}};if(ports.includes('L1')&&ports.includes('N'))return {a:{component:c.id,terminal:'L1'},b:{component:c.id,terminal:'N'}};}
  const source=lesson.circuit.components.find(c=>c.type==='source'||c.type==='source3');return source?{a:{component:source.id,terminal:source.type==='source3'?'L1':'L'},b:{component:source.id,terminal:'N'}}:undefined;
}
function operateLanguage(lesson:ConfigurationLesson,component:string,params:Record<string,string|number|boolean>):string {
  const item=lesson.circuit.components.find(c=>c.id===component);
  const name=item?.label.split(' · ')[0]??component;
  return Object.entries(params).map(([key,value])=>{
    if(item?.variant==='door-contact'&&key==='closed')return (value?'Open ':'Close ')+(lesson.id===65?'the cupboard':'the door');
    if(item?.type==='proximity'&&key==='active')return value?'Bring metal near the sensor':'Move the metal away';
    if(key==='mix')return 'Set the cool LEDs to '+Math.round(Number(value)*100)+'% of the mix';
    if(key==='closed' && item?.type==='thermostat')return `Turn ${name} ${value?'up':'down'}`;
    if(key==='closed' && ['switch','isolator','isolator3','mcb','mcb3','rcbo','rcd'].includes(item?.type??''))return `Turn ${name} ${value?'on':'off'}`;
    if(key==='closed')return `${value?'Close':'Open'} ${name}`;
    if(key==='pressed')return `${value?'Press':'Release'} ${name}`;
    if(key==='position')return `Move ${name} to its ${value===0?'first':value===1?'second':'selected'} position`;
    if(key==='active'||key==='demand'){
      if(item?.type==='thermostat')return (value?'Call for heat at ':'End the call for heat at ')+name;
      if(item?.type==='sensor') {
        switch(item.params.mode) {
          case 'pir': return (value?'Move in front of ':'Move away from ')+name;
          case 'float': return (value?'Raise ':'Lower ')+name;
          case 'pressure': return value?'Lower the pressure at the switch':'Raise the pressure to the switch-off point';
          case 'humidity': return value?'Set the humidity sensor to damp':'Set the humidity sensor to dry';
          case 'photocell': return value?'Set the daylight sensor to dark':'Set the daylight sensor to daylight';
        }
      }
      return `Turn ${name} ${value?'on':'off'}`;
    }
    if(key==='on')return `Turn ${name} ${value?'on':'off'}`;
    if(key==='level')return `Set ${name} to ${Math.round(Number(value)*100)}%`;
    if(key==='sensorValue')return `Set the reading on ${name} to ${value}${item?.params.mode==='temperature'?' °C':''}`;
    if(key==='alarm')return `${value?'Trigger':'Clear'} the alarm on ${name}`;
    if(key==='availability')return `${Number(value)===0?'Shade the panels':'Change the sunlight level'} at ${name}`;
    return `Change the setting on ${name} to ${value}`;
  }).join('. ')+'.';
}

function predictionOrder(lessonId: number, answer: string, options: NonNullable<LessonActivity['options']>) {
  const correct = options.find(option => option.id === answer)!;
  const alternate = options.filter(option => option.id !== answer);
  return lessonId % 2 === 0 ? [...alternate, correct] : [correct, ...alternate];
}

/** Each configuration has concrete terminal targets, not a disconnected text checklist. */
export function getLessonActivities(lesson:ConfigurationLesson):LessonActivity[]{
  const competency=lessonCompetency(lesson.id),base=(id:string,kind:LessonActivity['kind'],title:string,instruction:string,explanation:string):LessonActivity=>({id:`lesson:${lesson.id}:${id}`,kind,title,instruction,explanation,competency});
  const pointNames = new Map<string, string>();
  function displayPoint(endpoint: Endpoint): string {
    const key = endpointKey(endpoint);
    const saved = pointNames.get(key);
    if (saved) return saved;
    const point = describeEndpoint(lesson.circuit, endpoint);
    const fitting = endpoint.component === 'supply' ? 'Bench supply' : point?.equipmentName ?? endpoint.component;
    const text = `${fitting} · ${point?.pointLabel ?? endpoint.terminal}`;
    pointNames.set(key, text);
    return text;
  }
  const activities:LessonActivity[]=lesson.circuit.components.filter(c=>c.id!==COURSE_BOARD_ID).map(c=>({...base(`inspect:${c.id}`,'inspect',`Inspect ${c.label}`,`Open ${c.label} and choose Show terminals. Find where its wires go.`,equipmentPurpose(c)),component:c.id,part:'terminals',endpoints:COMPONENTS[c.type].terminals.map(t=>({component:c.id,terminal:t.id}))}));
  const scenario=getScenario(lesson.id);
  const page=COURSE_PAGES[lesson.id];
  function questionActivity(kind:'predict'|'explain'):LessonActivity {
    const content=kind==='predict'?page.prediction:page.explanation;
    const options=[{id:'expected',label:content.right},{id:'alternative',label:content.alternative}];
    return {...base(kind,kind,kind==='predict'?'What do you expect?':'What explains what you saw?',content.prompt,page.idea),
      answer:'expected',options:predictionOrder(lesson.id+(kind==='explain'?1:0),'expected',options)};
  }
  activities.push(questionActivity('predict'));
  for(const w of lesson.circuit.wires.filter(w=>w.id!==COURSE_BOND_ID)){const from=lesson.circuit.components.find(c=>c.id===w.from.component)!,to=lesson.circuit.components.find(c=>c.id===w.to.component)!;const ft=COMPONENTS[from.type].terminals.find(t=>t.id===w.from.terminal)!,tt=COMPONENTS[to.type].terminals.find(t=>t.id===w.to.terminal)!;activities.push({...base(`connect:${w.id}`,'connect',`Connect ${displayPoint(w.from)} to ${displayPoint(w.to)}`,`With all supplies off, join ${displayPoint(w.from)} to ${displayPoint(w.to)} with the ${wireMarking[w.role]} wire.${w.resistance>.1?' This length of wire has '+w.resistance+' Ω of resistance.':''}`,`${ft.purpose} → ${tt.purpose}`),component:to.id,part:'terminals',endpoints:[structuredClone(w.from),structuredClone(w.to)],wire:w.id,expectedRole:w.role});}
  const source=lesson.circuit.components.find(c=>c.type==='source'||c.type==='source3');
  const localSources=lesson.circuit.components.filter(c=>['pv','battery'].includes(c.type)&&Boolean(c.params.on??COMPONENTS[c.type].defaults.on??true));
  const enableLocal=localSources.map(c=>`Choose ${c.label} and turn it on with Operate.`).join(' ');
  activities.push({...base('operate:supply','operate',localSources.length?'Turn on the bench and local supplies':'Turn on the bench supply',`When the wiring is in place, switch the meter off resistance and turn on the bench supply.${enableLocal?' '+enableLocal:''}`,`Use voltage mode to check a powered circuit. Switch off all sources before testing continuity.${localSources.length?' Solar and battery supplies have their own controls.':''}`),component:source?.id,expectedSupplyEnabled:true,...localSources.length?{expectedControls:localSources.map(c=>({component:c.id,params:{on:true}}))}:{}});
  // Present the complete authored sequence, including legitimate stopped states,
  // independent zones, delayed actions and backup operation. A pulse is one
  // physical press/release task; the resulting maintained response must be seen.
  for(let index=0;index<(scenario?.steps.length??0);index++){
    const step=scenario!.steps[index],next=scenario!.steps[index+1];
    const pulse=(lesson.id<=64||step.expectations.length===0)&&step.patches.length===1&&step.patches[0].params.pressed===true&&next?.patches.length===1&&next.patches[0].component===step.patches[0].component&&next.patches[0].params.pressed===false;
    let outcomeIndex=index;
    if(pulse){outcomeIndex=index+1;for(let i=index+2;i<scenario!.steps.length;i++){if(scenario!.steps[i].patches.length||scenario!.steps[i].supplyEnabled!==undefined||scenario!.steps[i].openSignal)break;if(scenario!.steps[i].expectations.length){outcomeIndex=i;break;}}}
    const observed=scenario!.steps[outcomeIndex],controls=pulse?next.patches:step.patches;
    const target=step.patches[0]?.component??('component'in(observed.expectations[0]??{})?(observed.expectations[0] as {component:string}).component:source?.id);
    const comparison=observed.expectations.some(e=>e.kind==='total-power'||e.kind==='power'&&e.relative);
    let instruction=pulse?`Press and release ${lesson.circuit.components.find(c=>c.id===target)?.label??target}. Watch what stays on${lesson.id===57?' after the star–delta delay':''}.`:step.patches.map(p=>p.params.pressed===true?`Hold ${lesson.circuit.components.find(c=>c.id===p.component)?.label??p.component} down.`:operateLanguage(lesson,p.component,p.params)).join(' ');
    if(step.supplyEnabled!==undefined)instruction+=` ${step.supplyEnabled?'Turn on':'Turn off'} the mains supply in the lab.`;
    if(step.openSignal)instruction+=` Turn off all sources and open the signal wire from ${displayPoint(step.openSignal.a)} to ${displayPoint(step.openSignal.b)}, then turn the supply back on.`;
    if(!instruction.trim())instruction='Watch what the circuit does now.';
    instruction+=comparison?' Choose Test circuit to compare the two settings.':'';
    activities.push({...base(`operate:sequence:${index}`,'operate',step.title.replace(/: press$/,''),instruction.trim(),`${observed.expectations.map(e=>e.title).join('. ')}.`),component:target,expectedControls:structuredClone(controls),expectedParams:controls.find(p=>p.component===target)?.params,expectedSupplyEnabled:step.supplyEnabled,expectedSignalOpen:step.openSignal&&structuredClone(step.openSignal),expectedObservations:structuredClone(observed.expectations),scenarioStep:outcomeIndex});
    if(pulse)index++;
  }
  const pair=loadPair(lesson);if(pair)activities.push({...base('measure:voltage','measure','Measure across the load',`Place red on ${displayPoint(pair.a)} and black on ${displayPoint(pair.b)}. Record the voltage before moving a switch.`,`${lesson.sections.find(s=>s.title==='Where to put the probes')?.beginner??'Put one probe on each terminal.'} If you see zero, check the switch position.`),component:pair.a.component,endpoints:[pair.a,pair.b],measurement:{mode:'voltage',...pair}});
  const live=lesson.circuit.wires.find(w=>['L','L1','L2','L3','DC+'].includes(w.role));if(live)activities.push({...base('measure:current','measure','Read the current in one wire',`Select the conductor from ${displayPoint(live.from)} to ${displayPoint(live.to)} and record the current in amps.`,`The meter shows the current in this wire. Where the circuit splits, the branches can carry different currents.`),component:live.to.component,endpoints:[live.from,live.to],wire:live.id,measurement:{mode:'current',wire:live.id}});
  const target=lesson.circuit.wires.find(w=>w.id===lesson.challenge.wire);if(target)activities.push({...base('measure:target','measure','Check the wire for a break',`Turn off all sources, then measure resistance between ${displayPoint(target.from)} and ${displayPoint(target.to)}. Take the meter out of resistance mode before switching the power back on.`, 'A low resistance shows a path between the probes. If two wires reach the same point, the meter can still find a path around a break.'),component:target.to.component,endpoints:[target.from,target.to],measurement:{mode:'resistance',a:target.from,b:target.to}});
  activities.push(questionActivity('explain'));
  activities.push({...base('repair','repair','Repair the fault','Use your readings to find what went wrong. Repair it, then reset any device that tripped.','Run a fresh test to check the repair.'),component:lesson.challenge.component,endpoints:target?[target.from,target.to]:undefined});
  activities.push(base('retest','retest','Retest the operating sequence','Choose Test circuit to check your repair.','The bench tries the lesson controls again using your wiring.'));
  return activities;
}
export function evaluateActivity(activity:LessonActivity,document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]=[],answer?:string,context:{assessment?:BuildAssessment;inspected?:string[];challengeStarted?:boolean;diagnosisAccepted?:boolean;repairVerified?:boolean}={}):ActivityOutcome{
  const outcome=(status:ActivityOutcome['status'],explanation:string)=>({status,explanation});
  if(activity.kind==='predict'||activity.kind==='explain')return answer?outcome(answer===activity.answer?'pass':'fail',activity.explanation):outcome('not-run','Choose a prediction or explanation before revealing the feedback.');
  if(activity.kind==='inspect')return context.inspected?.includes(`${activity.component}.${activity.part}`)||answer===`${activity.component}.${activity.part}`?outcome('pass',activity.explanation):outcome('not-run','Select the part named in this step.');
  if(activity.kind==='connect'){
    const [a,b]=activity.endpoints??[];
    if(!a||!b)return outcome('unresolved','The bench could not find the two terminals for this step.');
    const wire=findConnectionWire(document.wires,a,b,activity.expectedRole);
    // The external switch alone does not isolate an available local battery/PV
    // source. Use the same source-isolation guard as the simulated ohmmeter.
    const isolation=measureResistance(document,a,b);
    if(isolation.reason==='supply-on')return outcome('not-run','Switch off the bench supply and any battery or solar supply before checking this wire.');
    return wire?outcome(wire.role===activity.expectedRole?'pass':'fail',wire.role===activity.expectedRole?activity.explanation:'The wire joins the right terminals. Check its marking against the one in this step.'):outcome('not-run','Connect the highlighted terminal pair.');
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
    if(params&&supply&&signalOpen&&unresolved)return outcome('unresolved','Choose Test circuit to compare the two settings.');
    return outcome(params&&supply&&signalOpen&&observed?'pass':'not-run',params&&supply&&signalOpen&&observed?activity.explanation:'Try the control in the instruction, then watch what the equipment does.');
  }
  if(activity.kind==='measure'){const m=activity.measurement;if(!m)return outcome('unresolved','The bench has no meter setup for this step.');const [a,b]=activity.endpoints??[];const actualWire=document.wires.find(w=>eq(w.from,a)&&eq(w.to,b)||eq(w.from,b)&&eq(w.to,a));const found=currentEvidence(document,result,evidence).some(e=>(!activity.independentMeasurement||e.assisted===false)&&e.mode===m.mode&&(m.mode==='current'?e.wire===(actualWire?.id??m.wire):e.instrument?.method!=='fork-voltage'&&(eq(e.a,m.a)&&eq(e.b,m.b)||eq(e.a,m.b)&&eq(e.b,m.a))));return outcome(found?'pass':'not-run',found?activity.explanation:activity.independentMeasurement?'Choose each measuring point yourself and record a fresh reading.':'Put the probes on the two marked points and record the reading.');}
  if(activity.kind==='repair'){if(!context.challengeStarted||!context.diagnosisAccepted)return outcome('not-run','Take your readings and check your diagnosis before recording a repair.');return outcome(document.faults.some(f=>f.enabled)||context.repairVerified===false?'not-run':'pass',document.faults.some(f=>f.enabled)?'The fault is still there. Check your readings, repair the fault and reset any device that tripped.':activity.explanation);}
  const a=context.assessment;return !a?outcome('not-run','Run the lesson test.'):a.circuitId!==document.id||a.revision!==document.revision?outcome('not-run','Your wiring or controls have changed. Test the circuit again.'):outcome(a.passed?'pass':'fail',a.summary);
}
/** A worker can stop continuous polling once all represented time processes settle. */
export function needsSimulationTick(document:CircuitDocument,result:SimulationResult):boolean{
  return document.components.some(c=>{const s=result.deviceStates[c.id],p={...COMPONENTS[c.type]?.defaults,...c.params};if(!s)return false;if(['valve','valve3','floatvalve'].includes(c.type)&&s.moving)return true;if(c.type==='battery'&&s.energized&&s.level>.01&&!s.gridPresent&&Number(s.outputPower)>1e-4)return true;const delay=Number(p.delay??0);if(['timer','sensor','smartrelay'].includes(c.type)&&s.energized&&delay>0){if(c.type==='timer'&&p.mode==='off-delay')return !s.command&&s.closed&&s.elapsed<delay;if(c.type==='timer'&&p.mode==='pulse')return !!s.command&&s.closed&&s.elapsed<delay;return !!s.command&&!s.closed&&s.elapsed<delay;}return ['mcb','mcb3','fuse','fcu','plug','overload','rcbo'].includes(c.type)&&!s.tripped&&s.level>1.05;});
}
