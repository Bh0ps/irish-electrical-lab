import { describeEndpoint } from './endpoint-description';
import { measureVoltage } from './simulation';
import { currentEvidence, type MeasurementEvidence } from './learning';
import { validateCircuit } from './storage';
import type { StudyProgress } from './progress';
import type { CircuitDocument, SimulationResult } from './types';

type DoorCall='Idle'|'Front'|'Rear'|'Both';
interface CallReading { id: string; label: string; on: boolean; dc?: boolean; emitter?:boolean; isolated?:boolean; pair?:[string,string]; nominal?:number; call?:DoorCall }
export interface CallStep {
  target: string; label: string; instruction: string; changed: string;
  before: CallReading[]; after: CallReading[];
  /** The learner deliberately holds or lets go of a momentary control. */
  pressed?:boolean;
  /** Put one probe on each pad of this fitting. */
  measure?:boolean;
  waitForFan?:boolean;
  /** Printed-terminal question between the two switch operations. */
  stairCheck?:'near'|'far';
  savedId?:string;
}
export interface HouseCall {
  lesson: number; title: string; request: string; done: string; steps: CallStep[];
  finishedId?:string;
  searchTerms?:string;
  breakers?: readonly { id:string; label:string }[];
  bellPushes?:readonly { id:string; door:string }[];
}

const lamp = (on:boolean):CallReading => ({id:'light',label:'Stair light',on,emitter:true});
const strip = (on:boolean):CallReading => ({id:'strip',label:'Cupboard strip',on,dc:true});
const worktops=(left:boolean,right:boolean):CallReading[]=>[
  {id:'left',label:'Left strip',on:left,nominal:24,emitter:true},{id:'right',label:'Right strip',on:right,nominal:24,emitter:true},
];
const bathroom=(light:boolean,fan:boolean,isolated=false):CallReading[]=>[
  {id:'light',label:'Bathroom light',on:light,emitter:true},{id:'fan',label:'Extractor',on:fan,emitter:true,isolated},
];
const branches = (on:boolean):CallReading[] => [{id:'load1',label:'Lamp',on},{id:'load2',label:'Socket',on:true}];
const chime = (call:DoorCall):CallReading[] => [
  {id:'chime',label:'Chime supply · AC1 to AC2',pair:['AC1','AC2'],nominal:12,on:true,call},
  {id:'chime',label:'Front · FRONT to AC2',pair:['FRONT','AC2'],nominal:12,on:call==='Front'||call==='Both'},
  {id:'chime',label:'Back · REAR to AC2',pair:['REAR','AC2'],nominal:12,on:call==='Rear'||call==='Both'},
];

export const HOUSE_CALLS:HouseCall[] = [
  {lesson:65,title:'Check the cupboard light',request:'The shelf is lit while the cupboard is open. Check what happens when the door shuts.',done:'The strip went out with the door shut and lit again when you opened it.',steps:[
    {target:'door',label:'Move the cupboard door',instruction:'Shut the cupboard door. Does the strip go out?',changed:'The strip went out when the magnet reached the door contact.',before:[strip(true)],after:[strip(false)]},
    {target:'door',label:'Move the cupboard door',instruction:'Open the door and check that the shelf lights up again.',changed:'Opening the door moved the magnet away and the strip came back on.',before:[strip(false)],after:[strip(true)]},
  ]},
  {lesson:9,searchTerms:'stairs light strappers travellers two way',title:'Try both stair switches',request:'The stair light is on. There’s a switch downstairs and one on the landing.',done:'You worked the stair light from both ends.',finishedId:'book:9:call-2',steps:[
    {target:'near',label:'Use downstairs switch',instruction:'Turn the stair light off at the foot of the stairs.',changed:'The stair light went out.',before:[lamp(true)],after:[lamp(false)]},
    {target:'near',label:'Choose a wire',instruction:'Which downstairs wire is at mains voltage?',changed:'',before:[lamp(false)],after:[lamp(false)],stairCheck:'near',savedId:'book:9:strapper-downstairs'},
    {target:'far',label:'Choose a wire',instruction:'Which wire has the landing switch picked?',changed:'',before:[lamp(false)],after:[lamp(false)],stairCheck:'far',savedId:'book:9:strapper-landing'},
    {target:'far',label:'Use landing switch',instruction:'Use the landing switch to turn the light back on.',changed:'The landing switch connected the lamp to the live strapper.',before:[lamp(false)],after:[lamp(true)],savedId:'book:9:call-1'},
  ]},
  {lesson:2,title:'Find the lighting breaker',request:'There are two breakers in the board. The lamp is on and the kitchen socket has power.',done:'You found the breaker that switches off just the lamp, then put it back on.',breakers:[{id:'branch1',label:'Breaker 1'},{id:'branch2',label:'Breaker 2'}],steps:[
    {target:'branch1',label:'Choose a breaker',instruction:'Which breaker turns off the lamp and leaves the socket on?',changed:'The lamp went out. The socket still has power.',before:branches(true),after:branches(false)},
    {target:'branch1',label:'Restore the lighting breaker',instruction:'Switch the lamp back on at the board. Check both readings.',changed:'The lamp and the socket have power again.',before:branches(false),after:branches(true)},
  ]},
  {lesson:72,title:'Check both doorbell buttons',request:'One chime serves both doors. In this job, press once to hold a button down and again to let go.',done:'You rang from each entrance. The chime showed which door it was and cleared when you let go.',
    bellPushes:[{id:'front',door:'front'},{id:'back',door:'back'}],steps:[
      {target:'front',pressed:true,label:'Hold front button',instruction:'Hold the front doorbell button. Watch the chime.',changed:'The chime shows Front door.',before:chime('Idle'),after:chime('Front')},
      {target:'front',pressed:false,label:'Let go of front button',instruction:'Let go of the front button. Does the call clear?',changed:'The front call cleared. The chime still has its own supply.',before:chime('Front'),after:chime('Idle')},
      {target:'back',pressed:true,label:'Hold back button',instruction:'Now ring from the back door. Which call shows?',changed:'The back button put voltage on the terminal marked REAR.',before:chime('Idle'),after:chime('Rear')},
      {target:'back',pressed:false,label:'Let go of back button',instruction:'Let go of the back button and check the chime again.',changed:'The back call cleared.',before:chime('Rear'),after:chime('Idle')},
    ]},
  {lesson:66,title:'Meter the worktop lights',request:'Both worktops are lit. Check one strip with its switch off and the other with its switch on.',done:'You measured the voltage at each strip and showed that either worktop can stay lit on its own.',steps:[
    {target:'left-switch',label:'Use the left switch',instruction:'Turn off the left worktop light. Leave the right one on.',changed:'The left strip went dark. The right strip is still lit.',before:worktops(true,true),after:worktops(false,true)},
    {target:'left',label:'Use the meter',measure:true,instruction:'Measure across the two pads on the dark left strip.',changed:'There’s no voltage across the left strip with its switch off.',before:worktops(false,true),after:worktops(false,true)},
    {target:'right',label:'Use the meter',measure:true,instruction:'Now measure across the lit right strip.',changed:'The right strip still has its own feed from the driver.',before:worktops(false,true),after:worktops(false,true)},
    {target:'right-switch',label:'Use the right switch',instruction:'Turn off the right worktop light.',changed:'Both strips are off.',before:worktops(false,true),after:worktops(false,false)},
    {target:'left-switch',label:'Use the left switch',instruction:'Leave the right light off. Switch the left light back on.',changed:'Only the left strip came back on.',before:worktops(false,false),after:worktops(true,false)},
  ]},
  {lesson:36,title:'Check the bathroom fan timer',request:'The timer in this job is set to five seconds so you can watch the fan stop.',done:'You saw the fan run on after the light went out, checked that it stopped, and switched off the fan without losing the light.',steps:[
    {target:'light-switch',label:'Use the light switch',instruction:'Switch the bathroom light off. Watch the fan.',changed:'The light went out. The timer kept the fan running.',before:bathroom(true,true),after:bathroom(false,true)},
    {target:'light-switch',label:'Confirm the fan stopped',waitForFan:true,instruction:'Leave the light off. Confirm when the fan stops.',changed:'The timer finished and the fan stopped.',before:bathroom(false,true),after:bathroom(false,false)},
    {target:'light-switch',label:'Use the light switch',instruction:'Switch the bathroom light back on. Does the fan start too?',changed:'The light and fan came back on together.',before:bathroom(false,false),after:bathroom(true,true)},
    {target:'fan-isolation',label:'Use the fan isolator',instruction:'Leave the light on. Turn the fan isolator off.',changed:'The fan stopped. The light stayed on.',before:bathroom(true,true),after:bathroom(true,false,true)},
    {target:'fan-isolation',label:'Use the fan isolator',instruction:'Switch the fan isolator back on.',changed:'The light switch was still on, so the fan started again.',before:bathroom(true,false,true),after:bathroom(true,true)},
  ]},
];

export const callActivityId = (id:number,step:number) => 'book:'+id+':call-'+step;
export function houseStepId(call:HouseCall,index:number){
  return (index===call.steps.length?call.finishedId:call.steps[index]?.savedId)??callActivityId(call.lesson,index);
}
export function nextHouseCall(call:HouseCall,progress:StudyProgress){
  const start=HOUSE_CALLS.indexOf(call);
  for(let offset=1;offset<HOUSE_CALLS.length;offset++){
    const candidate=HOUSE_CALLS[(start+offset)%HOUSE_CALLS.length];
    if(!progress.learning[candidate.lesson]?.activityIds.includes(houseStepId(candidate,candidate.steps.length-1)))return candidate;
  }
}
/** Old lesson copies named the supply breaker in each load's label. Keep user labels. */
export function houseJobLabels(doc:CircuitDocument):CircuitDocument{
  if(doc.lessonId===9)return {...doc,components:doc.components.map(c=>{
    if(c.id==='near'&&c.label==='Two-way switch A')return {...c,label:'Downstairs switch'};
    if(c.id==='far'&&c.label==='Two-way switch B')return {...c,label:'Landing switch'};
    return c;
  })};
  if(doc.lessonId!==2)return doc;
  return {...doc,components:doc.components.map(c=>{
    if(c.id==='load1'&&c.label==='Lamp on breaker 1')return {...c,label:'Lamp'};
    if(c.id==='load2'&&c.label==='Socket on breaker 2')return {...c,label:'Kitchen socket'};
    return c;
  })};
}
export function savedCallStep(call:HouseCall,id?:string) {
  return Array.from({length:call.steps.length+1},(_,index)=>index).find(index=>houseStepId(call,index)===id);
}
export interface CallOperation { component:string; activity:string; before:CircuitDocument; reading?:SimulationResult }
export interface CallSample {activity:string; evidence:MeasurementEvidence}

export function checkCallSample(call:HouseCall,index:number,doc:CircuitDocument,result:SimulationResult|undefined,sample?:CallSample){
  const step=call.steps[index];
  if(!step?.measure||!sample||sample.activity!==houseStepId(call,index)||doc.lessonId!==call.lesson||!result?.converged||result.revision!==doc.revision)return;
  const entry=currentEvidence(doc,result,[sample.evidence])[0];
  if(!entry)return;
  const side=step.target==='left'?'left':'right';
  if(entry.mode!=='voltage'||entry.instrument&&entry.instrument.method!=='probe-voltage')return {pass:false,message:'Choose volts and use the two probes.'};
  if(entry.assisted!==false)return {pass:false,message:'Choose each pad yourself, then record the reading again.'};
  const pads=[entry.a?.terminal,entry.b?.terminal];
  if(entry.a?.component!==step.target||entry.b?.component!==step.target||!pads.includes('L')||!pads.includes('N')){
    const other=side==='left'?'right':'left';
    const measured=entry.a?.component===other&&entry.b?.component===other?'You measured the '+other+' strip. ':'';
    return {pass:false,message:measured+'Put one probe on + and the other on −, both on the '+side+' strip. Either way round works.'};
  }
  if(result.deviceStates[step.target]?.reverseBlocked)
    return {pass:false,message:'The strip is wired backwards. Check which driver wire reaches the + pad on the strip.'};
  if(entry.value===null||!doc.supply.enabled||!callReadings(step.before,doc,result)?.every(r=>r.matches))
    return {pass:false,message:'Check the switches first. The left strip should be off and the right strip on.'};
  if(['L','N'].some(pad=>result.terminalVoltages[step.target+'.'+pad]?.frequency!==0))
    return {pass:false,message:'Check what feeds this strip. Both worktops use the 24 V DC output of the driver.'};
  const displayed=entry.instrument?.displayed??entry.value.toLocaleString('en-IE',{maximumFractionDigits:1});
  return {pass:true,message:'The meter read '+displayed+' V on the '+side+' strip. '+(entry.value< -1?'The minus sign means the red probe is on the negative pad.':step.changed)};
}

export function callReadings(points:CallReading[],doc:CircuitDocument,result?:SimulationResult) {
  if(!result?.converged || result.revision!==doc.revision) return;
  const readings=points.map(point=>{
    const [a,b]=point.pair??['L','N'];
    const value=measureVoltage(result,{component:point.id,terminal:a},{component:point.id,terminal:b}).value;
    const threshold=point.nominal??(point.dc?24:doc.supply.voltage);
    const powered=value===null||!Number.isFinite(value)?undefined:value>=threshold*.9?true:value<=1?false:undefined;
    const call=point.call?result.deviceStates[point.id]?.call:undefined;
    const inRange=point.nominal===undefined || (value!==null && value<=point.nominal*1.1);
    const lit=point.emitter?result.deviceStates[point.id]?.energized:undefined;
    const isolated=point.id==='fan'&&result.deviceStates['fan-isolation']?.closed===false&&result.deviceStates.runon?.energized===false&&lit===false&&(value===null||value<=1);
    const voltageMatches=point.isolated?isolated:powered===point.on && inRange;
    return {label:point.label,value,powered,lit,isolated,call,matches:voltageMatches && (!point.emitter||lit===point.on) && (!point.call || call===point.call)};
  });
  return readings;
}

export type StairPin='T1'|'T2';
export type StairChoice={circuitId:string;revision:number;activity:string;pin:StairPin};
const strapperPins:readonly StairPin[]=['T1','T2'];

/** Fixed meter leads in the learning display use the actual lamp neutral as their reference. */
export function stairReadings(side:'near'|'far',doc:CircuitDocument,result?:SimulationResult){
  const fitting=doc.components.find(c=>c.id===side&&c.type==='switch2');
  if(doc.lessonId!==9||!fitting||!result?.converged||result.revision!==doc.revision)return;
  const neutral={component:'light',terminal:'N'},common={component:side,terminal:'COM'};
  const commonVoltage=measureVoltage(result,common,neutral).value;
  const wires=strapperPins.map(pin=>{
    const end={component:side,terminal:pin};
    return {pin,mark:describeEndpoint(doc,end)?.pointLabel??pin,value:measureVoltage(result,end,neutral).value,
      acrossContact:measureVoltage(result,common,end).value};
  });
  const live=wires.filter(w=>w.value!==null&&w.value>=doc.supply.voltage*.9);
  // Comparing voltages alone cannot identify a closed contact if the two wires have been linked.
  const contact:StairPin=Number(fitting.params.position??0)===0?'T1':'T2';
  const selected=wires.find(w=>w.pin===contact&&w.acrossContact!==null&&w.acrossContact<=1);
  const other=wires.find(w=>w.pin!==contact);
  const lampVoltage=measureVoltage(result,{component:'light',terminal:'L'},neutral).value;
  const dark=result.deviceStates.light?.energized===false&&lampVoltage!==null&&lampVoltage<=1;
  const comparable=doc.supply.enabled&&dark&&commonVoltage!==null&&wires.every(w=>w.value!==null)&&live.length===1;
  let answer:typeof selected;
  if(comparable&&selected){
    if(side==='near'&&live[0].pin===contact&&commonVoltage>=doc.supply.voltage*.9)answer=selected;
    if(side==='far'&&typeof other?.acrossContact==='number'&&other.acrossContact>=doc.supply.voltage*.9)answer=selected;
  }
  return {wires,commonVoltage,lampVoltage,answer,dark};
}

export function checkStairChoice(call:HouseCall,index:number,doc:CircuitDocument,result:SimulationResult|undefined,choice?:StairChoice){
  const side=call.steps[index]?.stairCheck;
  if(!side||!choice||choice.circuitId!==doc.id||choice.revision!==doc.revision||choice.activity!==houseStepId(call,index))return;
  const reading=stairReadings(side,doc,result);
  if(!reading?.answer)return;
  const picked=reading.wires.find(w=>w.pin===choice.pin);
  if(!picked||picked.value===null)return;
  const volts=(v:number)=>new Intl.NumberFormat('en-IE',{maximumFractionDigits:1}).format(v)+' V';
  if(picked.pin!==reading.answer.pin)return {pass:false,message:side==='near'
    ?picked.mark+' reads '+volts(picked.value)+'. Which wire has close to '+volts(doc.supply.voltage)+'?'
    :'COM reads '+volts(reading.commonVoltage!)+'. Compare that with each wire.'};
  return {pass:true,message:side==='near'
    ?picked.mark+' is at '+volts(picked.value)+' to neutral. The downstairs switch is feeding that wire.'
    :'COM and '+picked.mark+' are at the same voltage. The landing switch has joined those two terminals.'};
}

export function verifiedCallStep(call:HouseCall,index:number,doc:CircuitDocument,result:SimulationResult|undefined,action?:CallOperation){
  const step=call.steps[index];
  if(!step || step.measure || step.waitForFan || step.stairCheck || !action || !doc.supply.enabled || !action.before.supply.enabled || action.activity!==houseStepId(call,index)
    || doc.lessonId!==call.lesson || doc.id!==action.before.id || doc.revision!==action.before.revision+1) return false;
  const allowed = call.breakers ? call.breakers.some(b=>b.id===action.component) : action.component===step.target;
  if(!allowed)return false;
  // Each entrance must work on its own, including when a broken input hides a held button.
  if(call.bellPushes?.some(push=>push.id!==step.target && [action.before,doc].some(d=>d.components.find(c=>c.id===push.id)?.params.pressed)))return false;
  const type=doc.components.find(c=>c.id===action.component)?.type;
  const key=type==='pushbutton'?'pressed':type==='switch2'?'position':'closed';
  const setting=(d:CircuitDocument)=>d.components.find(c=>c.id===action.component)?.params[key];
  const before=callReadings(step.before,action.before,action.reading), after=callReadings(step.after,doc,result);
  return setting(doc)!==setting(action.before) && (step.pressed===undefined || setting(doc)===step.pressed) && !!before?.every(r=>r.matches) && !!after?.every(r=>r.matches);
}

/** The timer must continue to power the fan after a real switch-off, then reach its delay on the same unchanged circuit. */
export function fanRunPhase(call:HouseCall,doc:CircuitDocument,result:SimulationResult|undefined,action?:CallOperation){
  if(call.lesson!==36||doc.lessonId!==36||!action||action.component!=='light-switch'||![0,1].some(i=>action.activity===callActivityId(36,i))
    ||action.before.id!==doc.id||action.before.revision+1!==doc.revision||!doc.supply.enabled||!result?.converged||result.revision!==doc.revision)return;
  if(doc.components.find(c=>c.id==='light-switch')?.params.closed!==false||action.before.components.find(c=>c.id==='light-switch')?.params.closed!==true
    ||!callReadings(call.steps[0].before,action.before,action.reading)?.every(r=>r.matches))return;
  const timer=result.deviceStates.runon,delay=Number(doc.components.find(c=>c.id==='runon')?.params.delay);
  if(!timer?.energized||timer.command||!Number.isFinite(delay)||delay<=0)return;
  if(timer.closed&&timer.elapsed<delay&&callReadings(call.steps[0].after,doc,result)?.every(r=>r.matches))return 'running';
  if(!timer.closed&&timer.elapsed>=delay&&callReadings(call.steps[1].after,doc,result)?.every(r=>r.matches))return 'stopped';
}

export function onlyCallControlsChanged(call:HouseCall,doc:CircuitDocument,original:CircuitDocument){
  if(doc.lessonId!==call.lesson || original.lessonId!==call.lesson)return false;
  const targets=new Set([...call.steps.filter(s=>!s.measure).map(s=>s.target),...(call.breakers??[]).map(b=>b.id)]);
  function key(d:CircuitDocument){
    const normal=validateCircuit(houseJobLabels(d));
    return JSON.stringify({...normal,id:original.id,revision:0,components:normal.components.map(c=>{
      if(!targets.has(c.id))return c;
      const params={...c.params};
      delete params[c.type==='pushbutton'?'pressed':c.type==='switch2'?'position':'closed'];
      return {...c,params};
    })});
  }
  // An unfinished edit that cannot be restored from a save still gets the replacement prompt.
  try{return key(doc)===key(original);}catch{return false;}
}
