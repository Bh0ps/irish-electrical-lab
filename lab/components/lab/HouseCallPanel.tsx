import { useEffect,useMemo,useRef,useState } from 'react';
import { Button } from '../ui/button';
import type { LessonActivity } from '../../lib/learning';
import type { CircuitDocument, SimulationResult } from '../../lib/types';
import { callActivityId, callReadings, savedCallStep, verifiedCallStep, type CallOperation, type HouseCall } from '../../lib/house-calls';

interface Props {
  call:HouseCall; document:CircuitDocument; result?:SimulationResult; operation?:CallOperation;
  start?:string; onActivity:(activity:LessonActivity)=>void; onCredit:(id:string,next:string)=>Promise<void>;
  operate:(id:string)=>void; locate:(id:string)=>void; restart:()=>void; choose:()=>void; undo:()=>void;
}
export function HouseCallPanel(props:Props){
  const {call,document:doc,result,operation,onActivity,onCredit}=props;
  const index=savedCallStep(call,props.start)??0;
  const [observation,setObservation]=useState('');
  const credited=useRef('');
  const step=call.steps[index];
  const activity=useMemo<LessonActivity>(()=>({
    id:callActivityId(call.lesson,index),kind:'operate',title:call.title,
    instruction:step?.instruction??call.done,explanation:step?.changed??call.done,
    component:step?.target,competency:'house-call',part:step?'actuator':undefined,
  }),[call,index,step]);
  useEffect(()=>onActivity(activity),[onActivity,activity]);
  useEffect(()=>{
    if(!step || !verifiedCallStep(call,index,doc,result,operation) || credited.current===activity.id)return;
    credited.current=activity.id;
    void onCredit(activity.id,callActivityId(call.lesson,index+1)).then(()=>{
      setObservation(step.changed);
    });
  },[activity.id,call,index,doc,result,operation,step,onCredit]);
  const readings=callReadings(step?.before??call.steps[call.steps.length-1].after,doc,result);
  const ready=readings?.every(r=>r.matches) && doc.supply.enabled;
  const wasTried=step && operation?.activity===activity.id && operation.component===step.target && operation.before.id===doc.id && operation.before.revision+1===doc.revision;
  const otherControl=step && operation?.activity===activity.id && operation.before.id===doc.id && operation.before.revision+1===doc.revision && operation.component!==step.target
    ? doc.components.find(c=>c.id===operation.component)?.label : undefined;
  const wrongState=step && readings && !ready && !verifiedCallStep(call,index,doc,result,operation);
  return <section className="active-task house-call" data-house-call={call.lesson} data-call-step={index} aria-label="House call">
    <div className="task-topline"><span>Oakfield house</span><b>{step?'Check '+(index+1)+' of '+call.steps.length:'Job complete'}</b></div>
    <h3 aria-live="polite">{step?step.instruction:'What you checked'}</h3>
    {!index&&<p>{call.request}</p>}
    {observation&&step&&<p className="task-feedback success" role="status">{observation}</p>}
    {!step&&<p className="task-instruction">{call.done}</p>}
    <dl className="call-readings" aria-label="Voltage across each fitting">{(readings??(step??call.steps[call.steps.length-1]).after.map(p=>({label:p.label,value:null}))).map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.value===null?(result?.revision===doc.revision?'No reading':'Waiting…'):r.value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V'}</dd></div>)}</dl>
    {otherControl&&<div className="task-feedback attention" role="status"><p>You used {otherControl}. Try the fitting named in the job.</p><Button variant="outline" size="sm" onClick={props.undo}>Undo that change</Button></div>}
    {wrongState&&!otherControl&&<p className="task-feedback attention" role="status">{!doc.supply.enabled?'The supply is off. Switch it on to try the job.':wasTried?'The readings didn’t change as expected. Try the control again to return to the starting position.':'Return the controls to their starting positions, or start this job again.'}</p>}
    {step?<><Button className="primary-button full" disabled={!readings} onClick={()=>props.operate(step.target)}>{step.label}</Button>
      <div className="task-support-actions"><Button variant="ghost" onClick={()=>props.locate(step.target)}>Show me where</Button></div>
      <details className="lesson-more-detail"><summary>Help</summary><p>Try the fitting in the room or use the button above. The numbers show the voltage across the fitting in the lab.</p><Button variant="outline" onClick={props.restart}>Start this job again</Button></details>
    </>:<Button className="primary-button full" onClick={props.choose}>Choose another job</Button>}
  </section>;
}
