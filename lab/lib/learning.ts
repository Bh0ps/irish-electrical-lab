import { COURSE_BOARD_ID,COURSE_BOND_ID } from './board-examples.ts';
import { lessonProbePoints } from './lesson-probe-points.ts';
import { coursePage } from './coursebook-content.ts';
import { lessonClue } from './lesson-clues.ts';
import { describeEndpoint } from './build-hints.ts';
import { definitionFor, COMPONENTS, equipmentPurpose } from './components.ts';
import { forkMode, forkRead, instrumentData, type InstrumentEvidence } from './fork-tester.ts';
import { getScenario, lessonCompetency, evaluateScenarioExpectation, type ScenarioExpectation } from './scenarios.ts';
import { measureResistance, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type ConfigurationLesson, type Endpoint, type SimulationResult, type Wire } from './types.ts';
import type { BuildAssessment } from './assessment.ts';
import { findConnectionWire } from './wire-connections.ts';
import { measurementPoints } from './measurement-points.ts';

export interface MeasurementEvidence {
  id:string; lessonId?:number; circuitId:string; revision:number; mode:'voltage'|'current'|'resistance';
  a?:Endpoint; b?:Endpoint; wire?:string; value:number|null; unit:string; explanation:string; recordedAt:number;
  controlState:Record<string,string|number|boolean>;
  status?:'value'|'open'|'unresolved';
  /** True for a meter setup that supplied the points to the learner. */
  assisted?:boolean;
  /** Labels as they appeared when this reading was recorded. */
  measuredAt?:string;
  instrument?:InstrumentEvidence;
}
export interface LessonActivity {
  id:string;kind:'inspect'|'predict'|'connect'|'operate'|'measure'|'explain'|'repair'|'retest';title:string;instruction:string;explanation:string;
  component?:string;part?:string;endpoints?:Endpoint[];options?:{id:string;label:string}[];answer?:string;
  measurement?:{mode:'voltage'|'current'|'resistance';a?:Endpoint;b?:Endpoint;wire?:string;instrument?:InstrumentEvidence};competency:string;
  bookStep?:'intro'|'switch-off'|'switch-on'|'contact'|'meter-demo'|'dimmer'|'finish';
  independentMeasurement?:boolean;
  clue?:string;
  wire?:string;expectedRole?:string;expectedParams?:Record<string,string|number|boolean>;expectedSupplyEnabled?:boolean;expectedObservations?:ScenarioExpectation[];
  expectedControls?:{component:string;params:Record<string,string|number|boolean>}[];
  expectedSignalOpen?:{a:Endpoint;b:Endpoint};scenarioStep?:number;
}
export interface ActivityOutcome {status:'pass'|'fail'|'not-run'|'unresolved';explanation:string}
const eq=(a:Endpoint|undefined,b:Endpoint|undefined)=>!!a&&!!b&&endpointKey(a)===endpointKey(b);

export function resistanceAtProbes(sample:MeasurementEvidence|undefined, doc:CircuitDocument, red?:Endpoint, black?:Endpoint) {
  if (sample?.mode === 'resistance' && sample.circuitId === doc.id && sample.revision === doc.revision &&
      eq(sample.a,red) && eq(sample.b,black)) return sample;
}
function readingPoints(doc:CircuitDocument,a?:Endpoint,b?:Endpoint) {
  const first=describeEndpoint(doc,a),second=describeEndpoint(doc,b);
  if(!first||!second)return;
  return first.endpoint.component===second.endpoint.component
    ? `${first.pointLabel} to ${second.pointLabel} on ${first.equipmentName}`
    : `${first.label} to ${second.label}`;
}
function knownEndpoint(doc:CircuitDocument,e:Endpoint|undefined){const c=e&&doc.components.find(c=>c.id===e.component);return !!(c&&definitionFor(c)?.terminals.some(t=>t.id===e!.terminal));}
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
    else if(request.mode==='current'&&document.wires.some(w=>w.id===request.wire)){const c=result.wireCurrents[request.wire!];value=c?Math.hypot(c.re,c.im):null;explanation=c?'Current through the selected wire.':'The meter can’t read the current in this wire.';}
  }else if(request.mode!=='resistance')explanation='The meter is still settling. Try again in a moment.';
  const status=Number.isFinite(value)?'value':request.mode==='resistance'&&open?'open':'unresolved';
  return {id:`measurement-${recordedAt}-${request.mode}-${request.wire??[request.a&&endpointKey(request.a),request.b&&endpointKey(request.b)].join(':')}`,lessonId:document.lessonId,circuitId:document.id,revision:document.revision,...structuredClone(request),value:Number.isFinite(value)?value:null,unit,explanation,recordedAt,controlState:controlSnapshot(document),status,measuredAt:measurementPoints(document,request),...(request.instrument?{instrument}:{})};
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
/** A lead can stay on one reference while the other probes each side of a
 * suspect wire. Matching the actual third terminal matters on isolated supplies. */
function comparedWireEnds(wire:Wire,readings:MeasurementEvidence[]):boolean {
  const ends=[wire.from,wire.to];
  const atEnd=ends.map(end=>{
    const points=new Map<string,number>();
    for(const sample of readings){
      if(sample.mode!=='voltage'||sample.value===null||sample.assisted!==false||
        sample.instrument&&sample.instrument.method!=='probe-voltage')continue;
      const reference=eq(end,sample.a)?sample.b:eq(end,sample.b)?sample.a:undefined;
      if(reference&&!ends.some(point=>eq(point,reference)))points.set(endpointKey(reference),Math.abs(sample.value));
    }
    return points;
  });
  // A difference of more than a volt is visible on the whole-volt T6.
  // Compare magnitudes so reversing one pair of DC probes cannot invent a drop.
  for(const [reference,first] of atEnd[0]){
    const second=atEnd[1].get(reference);
    if(second!==undefined&&Math.abs(first-second)>1)return true;
  }
  return false;
}

export function validateDiagnosisEvidence(document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[],target:{wire?:string;component?:string},readings=currentEvidence(document,result,evidence)):{accepted:boolean;explanation:string}{
  if(readings.length<2)return {accepted:false,explanation:'Record two different readings on the circuit as it is now.'};
  const wire=document.wires.find(w=>w.id===target.wire);
  const relevant=wire?readings.some(sample=>
    sample.mode==='current'&&sample.wire===wire.id ||
    sample.instrument?.method!=='fork-voltage'&&(eq(sample.a,wire.from)&&eq(sample.b,wire.to)||eq(sample.a,wire.to)&&eq(sample.b,wire.from)))
    ||comparedWireEnds(wire,currentEvidence(document,result,evidence.filter(sample=>sample?.assisted===false&&sample.mode==='voltage')))
    :!!target.component&&!target.wire&&readings.some(sample=>{
      const branch=document.wires.find(w=>w.id===sample.wire);
      return [sample.a,sample.b,branch?.from,branch?.to].some(point=>point?.component===target.component);
    });
  return relevant
    ? {accepted:true,explanation:'You’ve taken the readings. Choose the fault you think they point to.'}
    : {accepted:false,explanation:wire?'Put a probe at each end of the wire. Or leave one probe in place and touch the other to each end in turn.':'Take a reading on the fitting you think is faulty.'};
}
export const wireMarking: Record<Wire['role'], string> = {
  L:'line (L)', N:'neutral (N)', PE:'earth (PE)', L1:'phase L1', L2:'phase L2', L3:'phase L3',
  control:'control', output:'output', 'DC+':'positive (+)', 'DC-':'negative (−)',
};

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
  const activities:LessonActivity[]=lesson.circuit.components.filter(c=>c.id!==COURSE_BOARD_ID).map(c=>({...base(`inspect:${c.id}`,'inspect',c.label,'Choose Show terminals. Pick one of the marked points where the wires go.',equipmentPurpose(c)),component:c.id,part:'terminals',endpoints:definitionFor(c).terminals.map(t=>({component:c.id,terminal:t.id}))}));
  const scenario=getScenario(lesson.id,lesson.circuit);
  const page=coursePage(lesson.id,lesson.circuit);
  function questionActivity(kind:'predict'|'explain'):LessonActivity {
    const content=kind==='predict'?page.prediction:page.explanation;
    const options=[{id:'expected',label:content.right},{id:'alternative',label:content.alternative}];
    return {...base(kind,kind,kind==='predict'?'What do you expect?':'Why did that happen?',content.prompt,content.feedback??page.idea),
      clue:lessonClue(lesson.id,kind,lesson.circuit),answer:'expected',options:predictionOrder(lesson.id+(kind==='explain'?1:0),'expected',options)};
  }
  activities.push(questionActivity('predict'));
  for(const w of lesson.circuit.wires.filter(w=>w.id!==COURSE_BOND_ID)){
    const from=describeEndpoint(lesson.circuit,w.from)!,to=describeEndpoint(lesson.circuit,w.to)!;
    activities.push({...base(`connect:${w.id}`,'connect',`Connect ${displayPoint(w.from)} to ${displayPoint(w.to)}`,
      `With all supplies off, join ${displayPoint(w.from)} to ${displayPoint(w.to)} with the ${wireMarking[w.role]} wire.${w.resistance>.1?' This length of wire has '+w.resistance+' Ω of resistance.':''}`,
      [from.purpose,to.purpose===from.purpose?'':to.purpose].filter(Boolean).join(' ')),
      component:w.to.component,part:'terminals',endpoints:[structuredClone(w.from),structuredClone(w.to)],wire:w.id,expectedRole:w.role});
  }
  const source=lesson.circuit.components.find(c=>c.type==='source'||c.type==='source3');
  const localSources=lesson.circuit.components.filter(c=>['pv','battery'].includes(c.type)&&Boolean(c.params.on??COMPONENTS[c.type].defaults.on??true));
  const enableLocal=localSources.map(c=>`Choose ${c.label} and turn it on with Operate.`).join(' ');
  activities.push({...base('operate:supply','operate',localSources.length?'Turn on the bench and local supplies':'Turn on the bench supply',`Set the meter to volts, then turn on the bench supply.${enableLocal?' '+enableLocal:''}`,`Use voltage mode to check a powered circuit. Switch off all sources before testing continuity.${localSources.length?' Solar and battery supplies have their own controls.':''}`),component:source?.id,expectedSupplyEnabled:true,...localSources.length?{expectedControls:localSources.map(c=>({component:c.id,params:{on:true}}))}:{}});
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
    const buttonName=(id:string)=>lesson.circuit.components.find(c=>c.id===id)?.label.split(' · ')[0]??id;
    // Use the same named action as the drawing and the test report. Only add
    // words when the learner needs another detail, such as which button to hold.
    let instruction = step.instruction ?? step.title + '.';
    if (pulse && target) {
      instruction = `Press ${buttonName(target)}, then let go.`;
      if (lesson.id === 57) instruction += ' Watch the star contactor drop out and the delta contactor pull in.';
    } else if (step.patches[0]?.params.pressed === true && !step.instruction) {
      instruction = `Keep ${buttonName(step.patches[0].component)} pressed while you check this step.`;
    }
    if (step.openSignal) {
      instruction = `Switch off all supplies. Disconnect the wire between ${displayPoint(step.openSignal.a)} and ${displayPoint(step.openSignal.b)}. Switch the supply back on.`;
    }
    if (comparison) instruction += ' Choose Test circuit to compare the two settings.';
    activities.push({...base(`operate:sequence:${index}`,'operate',step.title,instruction.trim(),observed.expectations.length ? observed.expectations.map(e=>e.title).join('. ')+'.' : 'Now try the next setting.'),component:target,expectedControls:structuredClone(controls),expectedParams:controls.find(p=>p.component===target)?.params,expectedSupplyEnabled:step.supplyEnabled,expectedSignalOpen:step.openSignal&&structuredClone(step.openSignal),expectedObservations:structuredClone(observed.expectations),scenarioStep:outcomeIndex});
    if(pulse)index++;
  }
  const pair=lessonProbePoints(lesson.id,lesson.circuit);
  if(pair){
    const red=describeEndpoint(lesson.circuit,pair.a)!,black=describeEndpoint(lesson.circuit,pair.b)!;
    const place=red.endpoint.component===black.endpoint.component
      ? `On ${red.equipmentName}, put red on ${red.pointLabel} and black on ${black.pointLabel}.`
      : `Put red on ${displayPoint(pair.a)}. Put black on ${displayPoint(pair.b)}.`;
    activities.push({...base('measure:voltage','measure','Check the voltage',place+' Record the reading.',
      lesson.sections.find(s=>s.title==='Where to put the probes')?.beginner??'Read the volts between the two probes.'),
      component:pair.a.component,endpoints:[pair.a,pair.b],measurement:{mode:'voltage',...pair}});
  }
  const live=lesson.circuit.wires.find(w=>['L','L1','L2','L3','DC+'].includes(w.role));if(live)activities.push({...base('measure:current','measure','Read the current in one wire',`Choose the wire from ${displayPoint(live.from)} to ${displayPoint(live.to)}. Record the amps.`,`The meter shows the current in this wire. Where the circuit splits, the branches can carry different currents.`),component:live.to.component,endpoints:[live.from,live.to],wire:live.id,measurement:{mode:'current',wire:live.id}});
  const target=lesson.circuit.wires.find(w=>w.id===lesson.challenge.wire);if(target)activities.push({...base('measure:target','measure','Check the wire for a break',`Turn off all sources, then measure resistance between ${displayPoint(target.from)} and ${displayPoint(target.to)}. Take the meter out of resistance mode before switching the power back on.`, 'A low resistance shows a path between the probes. If two wires reach the same point, the meter can still find a path around a break.'),component:target.to.component,endpoints:[target.from,target.to],measurement:{mode:'resistance',a:target.from,b:target.to}});
  activities.push(questionActivity('explain'));
  activities.push({...base('repair','repair','Repair the fault','Use your readings to find what went wrong. Repair it, then reset any device that tripped.','Run a fresh test to check the repair.'),component:lesson.challenge.component,endpoints:target?[target.from,target.to]:undefined});
  activities.push(base('retest','retest','Test the repair','Choose Test circuit to check your repair.','The bench tries the lesson controls again using your wiring.'));
  return activities;
}
export function evaluateActivity(activity:LessonActivity,document:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]=[],answer?:string,context:{assessment?:BuildAssessment;inspected?:string[];challengeStarted?:boolean;diagnosisAccepted?:boolean;repairVerified?:boolean}={}):ActivityOutcome{
  const outcome=(status:ActivityOutcome['status'],explanation:string)=>({status,explanation});
  if(activity.kind==='predict'||activity.kind==='explain'){
    if(!answer)return outcome('not-run','Choose the answer you think fits.');
    return answer===activity.answer ? outcome('pass',activity.explanation) : outcome('fail',activity.clue??activity.explanation);
  }
  if(activity.kind==='inspect')return context.inspected?.includes(`${activity.component}.${activity.part}`)||answer===`${activity.component}.${activity.part}`?outcome('pass',activity.explanation):outcome('not-run','Select the part named in this step.');
  if(activity.kind==='connect'){
    const [a,b]=activity.endpoints??[];
    if(!a||!b)return outcome('unresolved','The bench could not find the two terminals for this step.');
    const wire=findConnectionWire(document.wires,a,b,activity.expectedRole);
    // The external switch alone does not isolate an available local battery/PV
    // source. Use the same source-isolation guard as the simulated ohmmeter.
    const isolation=measureResistance(document,a,b);
    if(isolation.reason==='supply-on')return outcome('not-run','Switch off the bench supply and any battery or solar supply before checking this wire.');
    return wire?outcome(wire.role===activity.expectedRole?'pass':'fail',wire.role===activity.expectedRole?activity.explanation:'The wire joins the right terminals. Check its marking against the one in this step.'):outcome('not-run','Join the two terminals shown in this step.');
  }
  if(activity.kind==='operate'){
    const c=document.components.find(c=>c.id===activity.component);
    if(activity.component&&!c)return outcome('unresolved','This control is missing from the bench. Check the equipment list.');
    const controls=activity.expectedControls??(c?[{component:c.id,params:activity.expectedParams??{}}]:[]);
    const params=controls.every(p=>{const actual=document.components.find(c=>c.id===p.component);return !!actual&&Object.entries(p.params).every(([k,v])=>actual.params[k]===v);});
    const supply=activity.expectedSupplyEnabled===undefined||document.supply.enabled===activity.expectedSupplyEnabled;
    const interrupted=activity.expectedSignalOpen,signal=interrupted?document.wires.find(w=>eq(w.from,interrupted.a)&&eq(w.to,interrupted.b)||eq(w.from,interrupted.b)&&eq(w.to,interrupted.a)):undefined;
    const signalOpen=!interrupted||!signal||document.faults.some(f=>f.enabled&&f.wire===signal.id&&['wrong-control','open-live','open-neutral'].includes(f.type));
    const observations=activity.expectedObservations??[];
    const report=context.assessment,currentReport=report?.circuitId===document.id&&report.revision===document.revision;
    if(!supply)return outcome('not-run',activity.expectedSupplyEnabled?'Turn the bench supply on.':'Turn the bench supply off.');
    if(!params||!signalOpen)return outcome('not-run',activity.instruction);
    if(!result||result.revision!==document.revision)return outcome('not-run','Give the meter a moment to catch up, then check again.');
    if(!result.converged)return outcome('unresolved','The bench can’t get a reading. Choose Test circuit to check the wiring.');
    const observedReadings:string[]=[];
    for(const [index,expected] of observations.entries()){
      if(expected.kind==='total-power'||expected.kind==='power'&&expected.relative){
        const check=currentReport&&report.checks.find(c=>c.id===`scenario:${document.lessonId}:${activity.scenarioStep}:${index}`);
        if(!check||check.status==='unresolved')return outcome('unresolved','Choose Test circuit to compare the two settings.');
        if(check.status!=='pass')return outcome('not-run',check.explanation);
        observedReadings.push(check.explanation);
      }else{
        const reading=evaluateScenarioExpectation(expected,document,result);
        if(reading.pass===null)return outcome('unresolved',reading.detail);
        const fitting='component' in expected ? document.components.find(part=>part.id===expected.component) : undefined;
        const detail=fitting&&!reading.detail.includes(fitting.label)?fitting.label+' · '+reading.detail:reading.detail;
        if(!reading.pass)return outcome('not-run',detail+' Choose Test circuit to check the wiring.');
        observedReadings.push(detail);
      }
    }
    return outcome('pass',observedReadings.length?observedReadings.slice(0,2).join(' '):activity.explanation);
  }
  if(activity.kind==='measure'){
    const target=activity.measurement;
    if(!target)return outcome('unresolved','The bench has no meter setup for this step.');
    const readings=currentEvidence(document,result,evidence.filter(e=>e?.mode===target.mode&&(!activity.independentMeasurement||e.assisted===false)));
    const saved=(reading:MeasurementEvidence)=>{
      if(reading.status==='open')return outcome('pass','You recorded OL. There was no path between the probes.');
      const shown=reading.instrument?.displayed??reading.value?.toLocaleString('en-IE',{maximumSignificantDigits:4});
      const amount=[shown,reading.unit,reading.instrument?.signal].filter(Boolean).join(' ');
      const at=readingPoints(document,reading.a,reading.b);
      return outcome('pass',at?`You recorded ${amount} from ${at}.`:`You recorded ${amount} in this wire.`);
    };
    if(target.mode==='current'){
      const [a,b]=activity.endpoints??[];
      const wire=document.wires.find(w=>eq(w.from,a)&&eq(w.to,b)||eq(w.from,b)&&eq(w.to,a));
      const match=readings.find(e=>e.wire===(wire?.id??target.wire));
      if(match)return saved(match);
    }else{
      const probes=readings.filter(e=>e.instrument?.method!=='fork-voltage');
      const match=probes.find(e=>eq(e.a,target.a)&&eq(e.b,target.b)||eq(e.a,target.b)&&eq(e.b,target.a));
      if(match)return saved(match);
      const taken=readingPoints(document,probes[0]?.a,probes[0]?.b);
      const wanted=readingPoints(document,target.a,target.b);
      if(taken && target.a && target.b){
        const last=probes[0];
        for(const [lead,point,other] of [['red',last.a,'black'],['black',last.b,'red']] as const){
          const next=eq(point,target.a)?target.b:eq(point,target.b)?target.a:undefined;
          if(!point||!next)continue;
          const here=describeEndpoint(document,point),there=describeEndpoint(document,next);
          if(here&&there)return outcome('not-run',`You measured ${taken}. Leave ${lead} on ${here.pointLabel}. Move ${other} to ${there.pointLabel}${point.component===next.component?'':' on '+there.equipmentName}.`);
        }
      }
      if(taken&&wanted)return outcome('not-run',`You measured ${taken}. For this step, measure ${wanted}.`);
    }
    return outcome('not-run',activity.independentMeasurement?'Choose each measuring point yourself and record a fresh reading.':'Put the probes on the two marked points and record the reading.');
  }
  if(activity.kind==='repair'){if(!context.challengeStarted||!context.diagnosisAccepted)return outcome('not-run','Take your readings and check your diagnosis before recording a repair.');return outcome(document.faults.some(f=>f.enabled)||context.repairVerified===false?'not-run':'pass',document.faults.some(f=>f.enabled)?'The fault is still there. Check your readings, repair the fault and reset any device that tripped.':activity.explanation);}
  const a=context.assessment;return !a?outcome('not-run','Run the lesson test.'):a.circuitId!==document.id||a.revision!==document.revision?outcome('not-run','Your wiring or controls have changed. Test the circuit again.'):outcome(a.passed?'pass':'fail',a.summary);
}
/** A worker can stop continuous polling once all represented time processes settle. */
export function needsSimulationTick(document:CircuitDocument,result:SimulationResult):boolean{
  return document.components.some(c=>{const s=result.deviceStates[c.id],p={...COMPONENTS[c.type]?.defaults,...c.params};if(!s)return false;if(['valve','valve3','floatvalve'].includes(c.type)&&s.moving)return true;if(c.type==='battery'&&s.energized&&s.level>.01&&!s.gridPresent&&Number(s.outputPower)>1e-4)return true;const delay=Number(p.delay??0);if(['timer','sensor','smartrelay'].includes(c.type)&&s.energized&&delay>0){if(c.type==='timer'&&p.mode==='off-delay')return !s.command&&s.closed&&s.elapsed<delay;if(c.type==='timer'&&p.mode==='pulse')return !!s.command&&s.closed&&s.elapsed<delay;return !!s.command&&!s.closed&&s.elapsed<delay;}return ['mcb','mcb3','fuse','fcu','plug','overload','rcbo'].includes(c.type)&&!s.tripped&&s.level>1.05;});
}
