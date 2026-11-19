import { measureVoltage } from './simulation';
import type { CircuitDocument, SimulationResult } from './types';

interface CallReading { id: string; label: string; on: boolean; dc?: boolean }
export interface CallStep {
  target: string; label: string; instruction: string; changed: string;
  before: CallReading[]; after: CallReading[];
}
export interface HouseCall { lesson: number; title: string; request: string; done: string; steps: CallStep[] }

const lamp = (on:boolean):CallReading => ({id:'light',label:'Stair light',on});
const strip = (on:boolean):CallReading => ({id:'strip',label:'Cupboard strip',on,dc:true});
const branches = (on:boolean):CallReading[] => [{id:'load1',label:'Lamp',on},{id:'load2',label:'Socket',on:true}];

export const HOUSE_CALLS:HouseCall[] = [
  {lesson:65,title:'Check the cupboard light',request:'The cupboard light should come on when you reach for the shelf.',done:'The strip went out with the door shut and lit again when you opened it.',steps:[
    {target:'door',label:'Move the cupboard door',instruction:'Shut the cupboard door. Does the strip go out?',changed:'The strip went out when the magnet reached the door contact.',before:[strip(true)],after:[strip(false)]},
    {target:'door',label:'Move the cupboard door',instruction:'Open the door and check that the shelf lights up again.',changed:'Opening the door moved the magnet away and the strip came back on.',before:[strip(false)],after:[strip(true)]},
  ]},
  {lesson:9,title:'Try both stair switches',request:'There’s one stair light and a switch at each end. Try them as you would on the way to bed.',done:'You switched one light from both ends of the stairs.',steps:[
    {target:'near',label:'Press switch A',instruction:'Use switch A to turn off the stair light.',changed:'Switch A broke the path to the light.',before:[lamp(true)],after:[lamp(false)]},
    {target:'far',label:'Press switch B',instruction:'Leave A alone. Use switch B to turn the light back on.',changed:'Switch B joined the path again, with A still where you left it.',before:[lamp(false)],after:[lamp(true)]},
  ]},
  {lesson:2,title:'Find the lighting breaker',request:'The owner wants to know which breaker feeds the lamp. The socket needs to stay on.',done:'You identified the lighting breaker and restored the lamp. The socket kept its supply.',steps:[
    {target:'branch1',label:'Move breaker 1',instruction:'Switch off breaker 1. Check the lamp and the socket.',changed:'The lamp lost its supply. Breaker 2 kept the socket on.',before:branches(true),after:branches(false)},
    {target:'branch1',label:'Move breaker 1',instruction:'Switch breaker 1 back on and check both readings.',changed:'Both circuits have a supply again.',before:branches(false),after:branches(true)},
  ]},
];

export const callActivityId = (id:number,step:number) => 'book:'+id+':call-'+step;
export function savedCallStep(call:HouseCall,id?:string) {
  return Array.from({length:call.steps.length+1},(_,index)=>index).find(index=>callActivityId(call.lesson,index)===id);
}
export interface CallOperation { component:string; activity:string; before:CircuitDocument; reading?:SimulationResult }

export function callReadings(points:CallReading[],doc:CircuitDocument,result?:SimulationResult) {
  if(!result?.converged || result.revision!==doc.revision) return;
  const readings=points.map(point=>{
    const value=measureVoltage(result,{component:point.id,terminal:'L'},{component:point.id,terminal:'N'}).value;
    const threshold=point.dc?24:doc.supply.voltage;
    const matches=value!==null && Number.isFinite(value) && (point.on?value>=threshold*.9:value<=1);
    return {label:point.label,value,matches};
  });
  return readings;
}

export function verifiedCallStep(call:HouseCall,index:number,doc:CircuitDocument,result:SimulationResult|undefined,action?:CallOperation){
  const step=call.steps[index];
  if(!step || !action || !doc.supply.enabled || action.component!==step.target || action.activity!==callActivityId(call.lesson,index)
    || doc.lessonId!==call.lesson || doc.id!==action.before.id || doc.revision!==action.before.revision+1) return false;
  const key=step.target==='near'||step.target==='far'?'position':'closed';
  const setting=(d:CircuitDocument)=>d.components.find(c=>c.id===step.target)?.params[key];
  const before=callReadings(step.before,action.before,action.reading), after=callReadings(step.after,doc,result);
  return setting(doc)!==setting(action.before) && !!before?.every(r=>r.matches) && !!after?.every(r=>r.matches);
}

export function onlyCallControlsChanged(call:HouseCall,doc:CircuitDocument,original:CircuitDocument){
  if(doc.lessonId!==call.lesson || original.lessonId!==call.lesson)return false;
  const targets=new Set(call.steps.map(s=>s.target));
  const key=(d:CircuitDocument)=>JSON.stringify({...d,id:original.id,revision:0,components:d.components.map(c=>{
    if(!targets.has(c.id))return c;
    const { [c.type==='switch2'?'position':'closed']:setting,...params }=c.params;
    return {...c,params};
  })});
  return key(doc)===key(original);
}
