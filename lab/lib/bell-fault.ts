import {sesameCallWiring} from './bell-meter-site';
import {voltagesFromCommon} from './fault-probes';
import type {MeasurementEvidence} from './learning';
import {endpointKey,type CircuitDocument,type Endpoint,type SimulationResult} from './types';

export const bellFaultTitle='The back doorbell is quiet';
export const bellFaultActivity='lesson:72:fault:back-call';
export const bellReturn={component:'chime',terminal:'AC2'};
export const bellInput={component:'chime',terminal:'REAR'};
export const backPushOutput={component:'back',terminal:'NO'};
export function bellPushTerminal(doc:CircuitDocument):Endpoint|undefined {
  if(doc.lessonId!==72)return;
  const fitted=sesameCallWiring(doc,'back');
  if(fitted)return fitted.call;
  // The virtual bench also works with the earlier three-contact push. Follow its call wire.
  const ends=doc.wires.flatMap(w=>endpointKey(w.from)===endpointKey(bellInput)?[w.to]:endpointKey(w.to)===endpointKey(bellInput)?[w.from]:[])
    .filter(p=>p.component==='back');
  return ends.length===1?ends[0]:undefined;
}

export type BellReadings={call?:MeasurementEvidence;push?:MeasurementEvidence};

export function bellReadings(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):BellReadings {
  if(doc.lessonId!==72||!doc.supply.enabled||doc.components.find(c=>c.id==='front')?.params.pressed||
    doc.components.find(c=>c.id==='back')?.params.pressed!==true)return {};
  const probes=voltagesFromCommon(doc,result,evidence,bellReturn);
  const push=bellPushTerminal(doc);
  return {call:probes.get(endpointKey(bellInput)),push:push?probes.get(endpointKey(push)):undefined};
}
export function bellComparisonReady(readings:BellReadings){
  return typeof readings.call?.value==='number'&&Math.abs(readings.call.value)<1&&
    typeof readings.push?.value==='number'&&Math.abs(readings.push.value)>=10.8&&Math.abs(readings.push.value)<=13.2;
}


export type BellDoor='front'|'back';
type Call='Idle'|'Front'|'Rear'|'Both';
export interface BellRun {revision:number;front?:true;back?:true;held?:BellDoor}
export interface BellPress {circuit:string;revision:number;door:BellDoor;down:boolean;before:Call}

export function hasBellHandover(doc:CircuitDocument) {
  return doc.lessonId===72&&doc.components.some(c=>c.id==='chime'&&c.type==='callchime'&&c.variant==='croma-100a')
    &&(['front','back'] as const).every(door=>doc.components.some(c=>c.id===door&&c.type==='pushbutton'&&c.variant==='sesame'));
}

function callAtChime(doc:CircuitDocument,result:SimulationResult|undefined):Call|undefined {
  if(!doc.supply.enabled||!result?.converged||result.revision!==doc.revision)return;
  const chime=result.deviceStates.chime;
  if(!chime?.supplyReady)return;
  const call=chime.call;
  if(call==='Idle'||call==='Front'||call==='Rear'||call==='Both')return call;
}

const pressed=(doc:CircuitDocument,door:BellDoor)=>doc.components.find(c=>c.id===door)?.params.pressed===true;
const doorCall=(door:BellDoor)=>door==='front'?'Front':'Rear';

export function startBellPress(doc:CircuitDocument,result:SimulationResult|undefined,door:string):BellPress|undefined {
  if((door!=='front'&&door!=='back')||!hasBellHandover(doc))return;
  const before=callAtChime(doc,result);
  if(!before)return;
  return {circuit:doc.id,revision:doc.revision+1,door,down:!pressed(doc,door),before};
}

/** Match the user's button action with the next solved state at the hall chime. */
export function finishBellPress(doc:CircuitDocument,result:SimulationResult|undefined,press:BellPress,previous?:BellRun):BellRun|undefined {
  if(press.circuit!==doc.id||press.revision!==doc.revision||pressed(doc,press.door)!==press.down)return previous;
  const after=callAtChime(doc,result);
  if(!after)return previous;
  if(previous?.revision===doc.revision)return previous;
  const prior=previous?.revision===doc.revision-1?previous:undefined;
  const run:BellRun={revision:doc.revision,...(prior?.front?{front:true}:{}),...(prior?.back?{back:true}:{})};
  const other=press.door==='front'?'back':'front';
  if(!pressed(doc,other)){
    if(press.down&&press.before==='Idle'&&after===doorCall(press.door))run.held=press.door;
    if(!press.down&&prior?.held===press.door&&press.before===doorCall(press.door)&&after==='Idle')run[press.door]=true;
  }
  return run;
}

export function bellRunReady(doc:CircuitDocument,result:SimulationResult|undefined,run?:BellRun){
  return hasBellHandover(doc)&&run?.revision===doc.revision&&!!run.front&&!!run.back&&!run.held
    &&!pressed(doc,'front')&&!pressed(doc,'back')&&callAtChime(doc,result)==='Idle';
}

export function isBellRun(value:unknown,revision:number):value is BellRun {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as Partial<BellRun>;
  return Number.isSafeInteger(r.revision)&&r.revision!>=0&&r.revision!<=revision
    &&[r.front,r.back].every(v=>v===undefined||v===true)
    &&(r.held===undefined||r.held==='front'||r.held==='back');
}

interface BellHandoverStep {action:'door'|'test';door?:BellDoor;label:string;instruction:string;reading:string;disabled:boolean}
export function bellHandoverStep(doc:CircuitDocument,result:SimulationResult|undefined,run?:BellRun,solverError=false):BellHandoverStep|undefined {
  if(!hasBellHandover(doc)||!doc.supply.enabled||bellRunReady(doc,result,run))return;
  const call=callAtChime(doc,result);
  if(!call){
    const failed=solverError||result?.revision===doc.revision;
    const lowSupply=result?.revision===doc.revision&&result.converged&&result.deviceStates.chime?.supplyReady===false;
    return {action:'test',label:failed?'Check the circuit':'Checking the chime…',disabled:!failed,instruction:lowSupply?'The chime has no working supply. Check the circuit.':failed?'The chime reading is missing. Check the circuit.':'Wait for the chime reading.',reading:''};
  }
  const fresh=run?.revision===doc.revision?run:undefined;
  const reading=call==='Idle'?'Hall chime · no call':call==='Rear'?'Hall chime · back door':call==='Front'?'Hall chime · front door':'Hall chime · both doors';
  const held=pressed(doc,'back')?'back':pressed(doc,'front')?'front':undefined;
  if(held){
    const instruction=call==='Both'?'Let go of the buttons. Try one door at a time.':fresh?.held===held?'The hall chime picked up the '+held+' door. Let go of the button.'
      :call===doorCall(held)?'Let go of the '+held+' button so you can try it from rest.'
      :call==='Idle'?'There’s no '+held+' call at the chime. Let go and check the wire.'
      :'The chime picked up the other door. Let go and check which wire goes to each input.';
    return {action:'door',door:held,label:'Let go of '+held+' button',instruction,reading,disabled:false};
  }
  if(call!=='Idle')return {action:'test',label:'Check the circuit',instruction:'Both buttons are up, but the chime still has a call.',reading,disabled:false};
  const door=fresh?.back?'front':'back';
  return {action:'door',door,label:'Ring '+door+' doorbell',instruction:fresh?.back||fresh?.front?'Now ring from the '+door+' door.':'Ring the back doorbell. Check that the call reaches the hall.',reading,disabled:false};
}
