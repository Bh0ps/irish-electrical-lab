import { useEffect,useLayoutEffect,useMemo,useRef,useState, type MouseEvent } from 'react';
import { Button } from '../ui/button';
import type { LessonActivity } from '../../lib/learning';
import type { CircuitDocument, SimulationResult } from '../../lib/types';
import { callActivityId, callReadings, savedCallStep, verifiedCallStep, type CallOperation, type HouseCall } from '../../lib/house-calls';

interface Props {
  call:HouseCall; document:CircuitDocument; result?:SimulationResult; operation?:CallOperation;
  start?:string; onActivity:(activity:LessonActivity)=>void; onCredit:(id:string,next:string)=>Promise<void>;
  operate:(id:string)=>void; locate:(id:string)=>void; restart:()=>void; choose:()=>void; undo:()=>void;
  nextJob?:{ title:string; open:()=>void }; startFault:()=>void;
}
export function HouseCallPanel(props:Props){
  const {call,document:doc,result,operation,onActivity,onCredit}=props;
  const index=savedCallStep(call,props.start)??0;
  const [observation,setObservation]=useState('');
  const credited=useRef('');
  const heading=useRef<HTMLHeadingElement>(null);
  const keyboardControl=useRef<HTMLButtonElement|null>(null);
  const previousStep=useRef(index);
  const step=call.steps[index];
  const activity=useMemo<LessonActivity>(()=>({
    id:callActivityId(call.lesson,index),kind:'operate',title:call.title,
    instruction:step?.instruction??call.done,explanation:step?.changed??call.done,
    component:step&&call.breakers?'course-enclosure':step?.target,competency:'house-call',part:step&&!call.breakers?'actuator':undefined,
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
  const recentAction=operation?.activity===activity.id && operation.before.id===doc.id && operation.before.revision+1===doc.revision ? operation : undefined;
  const usedCandidate=call.breakers?.some(b=>b.id===recentAction?.component);
  const otherControl=step && recentAction && recentAction.component!==step.target && !usedCandidate
    ? doc.components.find(c=>c.id===recentAction.component)?.label : undefined;
  const wrongState=step && readings && !ready && !verifiedCallStep(call,index,doc,result,operation);
  const [lamp,socket]=readings??[];
  let boardFeedback='';
  if(call.breakers && step && doc.supply.enabled && !otherControl && socket?.powered===false){
    if(lamp?.powered===true)boardFeedback='The lamp is still on. Put the socket breaker back on.';
    if(lamp?.powered===false)boardFeedback='Both readings are zero. Put back the last switch you moved, then try one breaker at a time.';
  }else if(call.breakers && index===0 && ready && recentAction && usedCandidate){
    const previous=callReadings(step.before,recentAction.before,recentAction.reading);
    if(previous?.[1]?.powered===false)boardFeedback='Both have power again. Try the other breaker.';
  }
  const unresolved=step && result?.revision===doc.revision && (!readings || readings.some(r=>r.value===null));
  const feedbackBreaker=usedCandidate?recentAction?.component:
    call.breakers?.find(b=>doc.components.find(c=>c.id===b.id)?.params.closed===false)?.id??call.breakers?.[0]?.id;
  function operateFromButton(event:MouseEvent<HTMLButtonElement>,component:string){
    if(!readings)return;
    keyboardControl.current=event.detail===0?event.currentTarget:null;
    props.operate(component);
  }
  useLayoutEffect(()=>{
    const changed=previousStep.current!==index;
    previousStep.current=index;
    const button=keyboardControl.current;
    if(!button)return;
    const focused=globalThis.document.activeElement;
    if(focused!==button && !(!button.isConnected && focused===globalThis.document.body)){
      keyboardControl.current=null;
      return;
    }
    if(changed){
      heading.current?.focus({preventScroll:true});
      heading.current?.scrollIntoView({block:'nearest',behavior:'instant'});
      keyboardControl.current=null;
    }else if(result?.revision===doc.revision){
      const controls=button.closest('.call-breaker-choice');
      const sheet=button.closest('.learn-column');
      if(!controls||!sheet)return;
      const clip=sheet.getBoundingClientRect();
      const header=sheet.querySelector('.phone-sheet-heading')?.getBoundingClientRect();
      const top=Math.max(clip.top,header?.bottom??0)+4;
      const bottom=clip.bottom-4;
      const pair=controls.getBoundingClientRect();
      const box=pair.height<=bottom-top?pair:button.getBoundingClientRect();
      if(box.top<top)sheet.scrollTop+=box.top-top;
      else if(box.bottom>bottom)sheet.scrollTop+=box.bottom-bottom;
    }
  },[index,doc.revision,result?.revision,boardFeedback]);
  return <section className="active-task house-call" data-house-call={call.lesson} data-call-step={index} aria-label="House call">
    <div className="task-topline"><span>Oakfield house</span><b>{step?'Check '+(index+1)+' of '+call.steps.length:'Job complete'}</b></div>
    <h3 ref={heading} tabIndex={-1} aria-live="polite">{step?step.instruction:'What you checked'}</h3>
    {!index&&<p>{call.request}</p>}
    {observation&&step&&<p className="task-feedback success" role="status">{observation}</p>}
    {!step&&<p className="task-instruction">{call.done}</p>}
    <dl className="call-readings" aria-label="Voltage across each fitting">{(readings??(step??call.steps[call.steps.length-1]).after.map(p=>({label:p.label,value:null}))).map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.value===null?(result?.revision===doc.revision?'No reading':'Waiting…'):r.value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V'}</dd></div>)}</dl>
    {otherControl&&<div className="task-feedback attention" role="status"><p>You used {otherControl}. Try the fitting named in the job.</p><Button variant="outline" size="sm" onClick={props.undo}>Undo that change</Button></div>}
    {unresolved&&<p className="task-feedback attention" role="status">The lab couldn’t get a reading. Check the wiring at the fitting, or open Help to start this job again.</p>}
    {wrongState&&!otherControl&&!boardFeedback&&!unresolved&&<p className="task-feedback attention" role="status">{!doc.supply.enabled?'The supply is off. Switch it on to try the job.':wasTried?'The readings didn’t change as expected. Try the control again to return to the starting position.':'Return the controls to their starting positions, or start this job again.'}</p>}
    {step?<>{call.breakers?<div className="call-breakers" role="group" aria-label="Breakers on the board">{call.breakers.map(b=>{
        const fitting=doc.components.find(c=>c.id===b.id);
        const position=result?.revision===doc.revision && result.deviceStates[b.id]?.tripped?'Tripped':fitting?.params.closed?'On':'Off';
        const hint=feedbackBreaker===b.id?boardFeedback:'';
        return <div className="call-breaker-choice" key={b.id}><Button variant="outline" aria-label={b.label+', '+position} aria-describedby={hint?'call-board-feedback':undefined} disabled={!fitting} aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,b.id)}>{b.label}<span>{position}</span></Button>
          {hint&&<p id="call-board-feedback" className="task-feedback attention" role="status">{hint}</p>}</div>;
      })}</div>:<Button className="primary-button full" aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,step.target)}>{step.label}</Button>}
      <div className="task-support-actions"><Button variant="ghost" onClick={()=>props.locate(call.breakers?'course-enclosure':step.target)}>{call.breakers?'Show the board':'Show me where'}</Button></div>
      <details className="lesson-more-detail"><summary>Help</summary><p>Try the fitting in the room or use the button above. The numbers show the voltage across the fitting in the lab.</p><Button variant="outline" onClick={props.restart}>Start this job again</Button></details>
    </>:<><Button className="primary-button full" onClick={props.nextJob?.open??props.startFault}>{props.nextJob?'Next job · '+props.nextJob.title:'Try a fault on this circuit'}</Button><Button variant="ghost" onClick={props.choose}>Choose another job</Button></>}
  </section>;
}
