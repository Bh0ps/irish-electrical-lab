import { measureVoltage } from './simulation';
import { validateCircuit } from './storage';
import type { StudyProgress } from './progress';
import type { CircuitDocument, SimulationResult } from './types';

type DoorCall='Idle'|'Front'|'Rear'|'Both';
interface CallReading { id: string; label: string; on: boolean; dc?: boolean; pair?:[string,string]; nominal?:number; call?:DoorCall }
export interface CallStep {
  target: string; label: string; instruction: string; changed: string;
  before: CallReading[]; after: CallReading[];
  /** The learner deliberately holds or lets go of a momentary control. */
  pressed?:boolean;
}
export interface HouseCall {
  lesson: number; title: string; request: string; done: string; steps: CallStep[];
  breakers?: readonly { id:string; label:string }[];
  bellPushes?:readonly { id:string; door:string }[];
}

const lamp = (on:boolean):CallReading => ({id:'light',label:'Stair light',on});
const strip = (on:boolean):CallReading => ({id:'strip',label:'Cupboard strip',on,dc:true});
const branches = (on:boolean):CallReading[] => [{id:'load1',label:'Lamp',on},{id:'load2',label:'Socket',on:true}];
const chime = (call:DoorCall):CallReading[] => [
  {id:'chime',label:'Chime supply · AC1 to AC2',pair:['AC1','AC2'],nominal:12,on:true,call},
  {id:'chime',label:'Front · FRONT to AC2',pair:['FRONT','AC2'],nominal:12,on:call==='Front'||call==='Both'},
  {id:'chime',label:'Back · REAR to AC2',pair:['REAR','AC2'],nominal:12,on:call==='Rear'||call==='Both'},
];

export const HOUSE_CALLS:HouseCall[] = [
  {lesson:65,title:'Check the cupboard light',request:'The cupboard light should come on when you reach for the shelf.',done:'The strip went out with the door shut and lit again when you opened it.',steps:[
    {target:'door',label:'Move the cupboard door',instruction:'Shut the cupboard door. Does the strip go out?',changed:'The strip went out when the magnet reached the door contact.',before:[strip(true)],after:[strip(false)]},
    {target:'door',label:'Move the cupboard door',instruction:'Open the door and check that the shelf lights up again.',changed:'Opening the door moved the magnet away and the strip came back on.',before:[strip(false)],after:[strip(true)]},
  ]},
  {lesson:9,title:'Try both stair switches',request:'There’s one stair light and a switch at each end. Try them as you would on the way to bed.',done:'You switched one light from both ends of the stairs.',steps:[
    {target:'near',label:'Press switch A',instruction:'Use switch A to turn off the stair light.',changed:'Switch A broke the path to the light.',before:[lamp(true)],after:[lamp(false)]},
    {target:'far',label:'Press switch B',instruction:'Leave A alone. Use switch B to turn the light back on.',changed:'Switch B joined the path again, with A still where you left it.',before:[lamp(false)],after:[lamp(true)]},
  ]},
  {lesson:2,title:'Find the lighting breaker',request:'There are two breakers in the board. The lamp is on and the kitchen socket has power.',done:'You found the breaker that switches off just the lamp, then put it back on.',breakers:[{id:'branch1',label:'Breaker 1'},{id:'branch2',label:'Breaker 2'}],steps:[
    {target:'branch1',label:'Choose a breaker',instruction:'Which breaker turns off the lamp and leaves the socket on?',changed:'The lamp went out. The socket still has power.',before:branches(true),after:branches(false)},
    {target:'branch1',label:'Restore the lighting breaker',instruction:'Switch the lamp back on at the board. Check both readings.',changed:'The lamp and the socket have power again.',before:branches(false),after:branches(true)},
  ]},
  {lesson:72,title:'Check both doorbell buttons',request:'One chime serves both doors. In this job, press once to hold a button down and again to let go.',done:'The chime showed the right door for each button and cleared when you let go.',
    bellPushes:[{id:'front',door:'front'},{id:'back',door:'back'}],steps:[
      {target:'front',pressed:true,label:'Hold front button',instruction:'Hold the front doorbell button. Watch the chime.',changed:'The chime picked up the front-door call.',before:chime('Idle'),after:chime('Front')},
      {target:'front',pressed:false,label:'Let go of front button',instruction:'Let go of the front button. Does the call clear?',changed:'The front call cleared. The chime still has its own supply.',before:chime('Front'),after:chime('Idle')},
      {target:'back',pressed:true,label:'Hold back button',instruction:'Now ring from the back door. Which call shows?',changed:'The back button put voltage on the terminal marked REAR.',before:chime('Idle'),after:chime('Rear')},
      {target:'back',pressed:false,label:'Let go of back button',instruction:'Let go of the back button and check the chime again.',changed:'The back call cleared.',before:chime('Rear'),after:chime('Idle')},
    ]},
];

export const callActivityId = (id:number,step:number) => 'book:'+id+':call-'+step;
export function nextHouseCall(call:HouseCall,progress:StudyProgress){
  const start=HOUSE_CALLS.indexOf(call);
  for(let offset=1;offset<HOUSE_CALLS.length;offset++){
    const candidate=HOUSE_CALLS[(start+offset)%HOUSE_CALLS.length];
    if(!progress.learning[candidate.lesson]?.activityIds.includes(callActivityId(candidate.lesson,candidate.steps.length-1)))return candidate;
  }
}
/** Old lesson copies named the supply breaker in each load's label. Keep user labels. */
export function houseJobLabels(doc:CircuitDocument):CircuitDocument{
  if(doc.lessonId!==2)return doc;
  return {...doc,components:doc.components.map(c=>{
    if(c.id==='load1'&&c.label==='Lamp on breaker 1')return {...c,label:'Lamp'};
    if(c.id==='load2'&&c.label==='Socket on breaker 2')return {...c,label:'Kitchen socket'};
    return c;
  })};
}
export function savedCallStep(call:HouseCall,id?:string) {
  return Array.from({length:call.steps.length+1},(_,index)=>index).find(index=>callActivityId(call.lesson,index)===id);
}
export interface CallOperation { component:string; activity:string; before:CircuitDocument; reading?:SimulationResult }

export function callReadings(points:CallReading[],doc:CircuitDocument,result?:SimulationResult) {
  if(!result?.converged || result.revision!==doc.revision) return;
  const readings=points.map(point=>{
    const [a,b]=point.pair??['L','N'];
    const value=measureVoltage(result,{component:point.id,terminal:a},{component:point.id,terminal:b}).value;
    const threshold=point.nominal??(point.dc?24:doc.supply.voltage);
    const powered=value===null||!Number.isFinite(value)?undefined:value>=threshold*.9?true:value<=1?false:undefined;
    const call=point.call?result.deviceStates[point.id]?.call:undefined;
    const inRange=point.nominal===undefined || (value!==null && value<=point.nominal*1.1);
    return {label:point.label,value,powered,call,matches:powered===point.on && inRange && (!point.call || call===point.call)};
  });
  return readings;
}

export function verifiedCallStep(call:HouseCall,index:number,doc:CircuitDocument,result:SimulationResult|undefined,action?:CallOperation){
  const step=call.steps[index];
  if(!step || !action || !doc.supply.enabled || !action.before.supply.enabled || action.activity!==callActivityId(call.lesson,index)
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

export function onlyCallControlsChanged(call:HouseCall,doc:CircuitDocument,original:CircuitDocument){
  if(doc.lessonId!==call.lesson || original.lessonId!==call.lesson)return false;
  const targets=new Set([...call.steps.map(s=>s.target),...(call.breakers??[]).map(b=>b.id)]);
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
