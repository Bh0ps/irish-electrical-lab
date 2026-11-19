import { worktopFaultTitle } from '../../lib/fault-practice';
import { useEffect,useLayoutEffect,useMemo,useRef,useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../ui/button';
import MeterHistory from './MeterHistory';
import type { LessonActivity, MeasurementEvidence } from '../../lib/learning';
import type { CircuitDocument, SimulationResult } from '../../lib/types';
import { callActivityId, callReadings, checkCallSample, fanRunPhase, savedCallStep, verifiedCallStep, type CallOperation, type CallSample, type HouseCall } from '../../lib/house-calls';

interface Props {
  context?:ReactNode; closeTools:()=>void;
  call:HouseCall; document:CircuitDocument; result?:SimulationResult; operation?:CallOperation; sample?:CallSample; openMeter:()=>void; meterHistory?:MeasurementEvidence[];
  start?:string; onActivity:(activity:LessonActivity)=>void; onCredit:(id:string,next:string)=>Promise<void>;
  operate:(id:string)=>void; locate:(id:string)=>void; restart:()=>void; choose:()=>void; undo:()=>void;
  worktopFault?:()=>void; nextJob?:{ title:string; open:()=>void }; startFault:()=>void;
}
export function HouseCallPanel(props:Props){
  const {call,document:doc,result,operation,onActivity,onCredit}=props;
  const index=savedCallStep(call,props.start)??0;
  const [observation,setObservation]=useState('');
  const [seenRun,setSeenRun]=useState<number>();
  const [confirmedStop,setConfirmedStop]=useState<number>();
  const credited=useRef('');
  const heading=useRef<HTMLHeadingElement>(null);
  const keyboardControl=useRef<HTMLButtonElement|null>(null);
  const previousStep=useRef(index);
  const toolsOpen=Boolean(props.context);
  const hadTools=useRef(toolsOpen);
  useLayoutEffect(()=>{
    if(hadTools.current !== toolsOpen){
      const sheet=heading.current?.closest('.learn-column');
      if(sheet)sheet.scrollTop=0;
    }
    if(hadTools.current && !toolsOpen){
      heading.current?.focus({preventScroll:true});
      heading.current?.scrollIntoView({block:'nearest',behavior:'instant'});
    }
    hadTools.current=toolsOpen;
  },[toolsOpen]);
  const step=call.steps[index];
  const activity=useMemo<LessonActivity>(()=>({
    id:callActivityId(call.lesson,index),kind:step?.measure?'measure':'operate',title:call.title,
    instruction:step?.instruction??call.done,explanation:step?.changed??call.done,
    component:step&&call.breakers?'course-enclosure':step?.target,competency:'house-call',part:step?.measure?'terminals':step&&!call.breakers?'actuator':undefined,
  }),[call,index,step]);
  useEffect(()=>onActivity(activity),[onActivity,activity]);
  const sample=checkCallSample(call,index,doc,result,props.sample);
  const bathroom=call.lesson===36;
  const runPhase=bathroom&&index<=1?fanRunPhase(call,doc,result,operation):undefined;
  useEffect(()=>{
    if(runPhase!=='running'||globalThis.document.hidden||toolsOpen)return;
    const frame=requestAnimationFrame(()=>setSeenRun(doc.revision));
    return ()=>cancelAnimationFrame(frame);
  },[runPhase,doc.revision,toolsOpen]);
  const witnessed=seenRun===doc.revision;
  const confirmable=runPhase==='stopped'&&witnessed;
  const verified=step?.measure?sample?.pass:step?.waitForFan?confirmable&&confirmedStop===doc.revision:
    (!bathroom||index!==0||runPhase==='running'&&witnessed)&&verifiedCallStep(call,index,doc,result,operation);
  const observed=sample?.pass?sample.message:step?.changed??'';
  useEffect(()=>{
    if(!step || !verified || credited.current===activity.id)return;
    credited.current=activity.id;
    void onCredit(activity.id,callActivityId(call.lesson,index+1)).then(()=>{
      setObservation(observed);
    });
  },[activity.id,call,index,verified,step,onCredit,observed]);
  const readings=callReadings(step?.before??call.steps[call.steps.length-1].after,doc,result);
  const ready=readings?.every(r=>r.matches) && doc.supply.enabled;
  const wasTried=step && operation?.activity===activity.id && operation.component===step.target && operation.before.id===doc.id && operation.before.revision+1===doc.revision;
  const recentAction=operation?.activity===activity.id && operation.before.id===doc.id && operation.before.revision+1===doc.revision ? operation : undefined;
  const usedCandidate=call.breakers?.some(b=>b.id===recentAction?.component);
  const otherPush=call.bellPushes?.find(push=>push.id!==step?.target && doc.components.find(c=>c.id===push.id)?.params.pressed);
  const targetDoor=call.bellPushes?.find(push=>push.id===step?.target)?.door;
  const usedBell=call.bellPushes?.some(push=>push.id===recentAction?.component);
  const worktops=call.steps.some(s=>s.measure);
  const otherControl=step && recentAction && recentAction.component!==step.target && !usedCandidate && !usedBell
    ? doc.components.find(c=>c.id===recentAction.component)?.label : undefined;
  const wrongState=step && readings && !ready && !verified;
  const [lamp,socket]=readings??[];
  const chimeStatus=!lamp || lamp.powered===undefined || typeof lamp.call!=='string' ? 'No reading'
    : !lamp.powered ? 'No supply' : ({Idle:'No call',Front:'Front door',Rear:'Back door',Both:'Both doors'} as Record<string,string>)[lamp.call]??'No reading';
  let bellFeedback='';
  const targetWasUsed=step && wasTried && step.pressed===Boolean(doc.components.find(c=>c.id===step.target)?.params.pressed);
  if(step && call.bellPushes && !otherControl && readings && (wrongState || targetWasUsed || otherPush) && !verified){
    if(!doc.supply.enabled)bellFeedback='Switch the bench supply on to try the buttons.';
    else if(lamp?.powered!==true || (lamp.value??0)>12*1.1)bellFeedback='Check the chime supply between AC1 and AC2. It should be about 12 V AC.';
    else if(otherPush)bellFeedback='Let go of the '+otherPush.door+' button, then try the '+targetDoor+' button.';
    else if(targetWasUsed && lamp.call!==step.after[0].call)bellFeedback='Look at the '+targetDoor+' input under “See the voltages”. Does its voltage change when you press the button?';
    else bellFeedback=step.pressed?'Let go of the '+targetDoor+' button, then try it again.':'Hold the '+targetDoor+' button first. Then let it go and watch the chime.';
  }
  let boardFeedback='';
  if(call.breakers && step && doc.supply.enabled && !otherControl && socket?.powered===false){
    if(lamp?.powered===true)boardFeedback='The lamp is still on. Put the socket breaker back on.';
    if(lamp?.powered===false)boardFeedback='Both readings are zero. Put back the last switch you moved, then try one breaker at a time.';
  }else if(call.breakers && index===0 && ready && recentAction && usedCandidate){
    const previous=callReadings(step.before,recentAction.before,recentAction.reading);
    if(previous?.[1]?.powered===false)boardFeedback='Both have power again. Try the other breaker.';
  }
  const unresolved=step && result?.revision===doc.revision && (!readings || readings.some(r=>r.value===null&&!r.isolated));
  const restoreFan=bathroom&&doc.supply.enabled&&step?.target==='light-switch'&&!step.waitForFan&&!unresolved&&socket?.isolated;
  const undoIsolator=restoreFan&&recentAction?.component==='fan-isolation';
  const feedbackBreaker=usedCandidate?recentAction?.component:
    call.breakers?.find(b=>doc.components.find(c=>c.id===b.id)?.params.closed===false)?.id??call.breakers?.[0]?.id;
  function operateFromButton(event:MouseEvent<HTMLButtonElement>,component:string){
    if(!readings)return;
    keyboardControl.current=event.detail===0?event.currentTarget:null;
    props.operate(component);
  }
  const fanTimer=result?.revision===doc.revision?result.deviceStates.runon:undefined;
  const delay=Number(doc.components.find(c=>c.id==='runon')?.params.delay);
  const remaining=fanTimer&&Number.isFinite(delay)?Math.max(0,Math.ceil(delay-fanTimer.elapsed)):undefined;
  const isolatorOpen=bathroom&&doc.components.find(c=>c.id==='fan-isolation')?.params.closed===false;
  const lampSwitchOn=bathroom&&doc.components.find(c=>c.id==='light-switch')?.params.closed===true;
  function confirmOrRepeat(event:MouseEvent<HTMLButtonElement>){
    if(confirmable){keyboardControl.current=event.currentTarget;setConfirmedStop(doc.revision);return;}
    operateFromButton(event,isolatorOpen?'fan-isolation':'light-switch');
  }
  useLayoutEffect(()=>{
    const changed=previousStep.current!==index;
    previousStep.current=index;
    if(changed)heading.current?.closest('.learn-column')?.scrollTo({top:0,behavior:'instant'});
    const button=keyboardControl.current;
    if(!button)return;
    const focused=globalThis.document.activeElement;
    if(focused!==button && !(!button.isConnected && focused===globalThis.document.body)){
      keyboardControl.current=null;
      return;
    }
    if(changed){
      heading.current?.focus({preventScroll:true});
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
  return <section className="active-task house-call" data-house-tools={toolsOpen||undefined} data-house-call={call.lesson} data-call-step={index} aria-label="House call">
    <div className="task-topline"><span>Oakfield house</span><b>{step?'Check '+(index+1)+' of '+call.steps.length:'Job complete'}</b></div>
    <div className={'house-job-heading'+(sample&&!sample.pass?' with-reading-feedback':'')}><h3 ref={heading} tabIndex={-1} aria-live="polite">{step?step.instruction:'What you checked'}</h3>
      {toolsOpen&&<Button variant="ghost" size="sm" onClick={props.closeTools}>Back to job</Button>}
      {sample&&!sample.pass&&<p className="task-feedback attention" role="status">{sample.message}</p>}
    </div>
    {props.context}
    {!toolsOpen&&<>
    {!index&&<p>{call.request}</p>}
    {observation&&step&&!bellFeedback&&!restoreFan&&<p className="task-feedback success" role="status">{observation}</p>}
    {!step&&<p className="task-instruction">{call.done}</p>}
    {!step&&worktops&&props.meterHistory&&<MeterHistory circuit={doc} readings={props.meterHistory.filter(r=>r.circuitId===doc.id)}/>}
    {call.bellPushes && <p className="call-chime" role="status">Chime <strong>{readings?chimeStatus:result?.revision===doc.revision?'No reading':'Waiting…'}</strong></p>}
    {bathroom?<><dl className="call-readings" aria-label="Bathroom light and fan">{readings?.map((r,i)=><div key={r.label}><dt>{r.label}</dt><dd>{r.lit===undefined?'No reading':i===1?(r.lit?'Running':'Stopped'):(r.lit?'Lit':'Dark')}</dd></div>)}</dl>
      {step?.waitForFan&&<p role="status">{runPhase==='running'?'Timer running · '+remaining+' s left':confirmable?'The timer finished. Check the fan indicator.':isolatorOpen?'Switch the fan isolator back on to try the timer.':lampSwitchOn?'Switch the light off to start the timer.':'Try the timing check again. Switch the light on first.'}</p>}</>:worktops?<dl className="call-readings" aria-label="Worktop lights">{readings?.map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.lit===undefined?'No reading':r.lit?'Lit':'Dark'}</dd></div>)}</dl>:call.bellPushes?<details className="call-bell-readings"><summary>See the voltages</summary>{voltageReadings()}</details>:voltageReadings()}
    {restoreFan?<p className="task-feedback attention" role="status">{undoIsolator?'You used '+otherControl+'. ':''}The fan isolator is off. The fan has stopped{lamp?.lit?' and the light is still on':''}. Switch the isolator back on to try the light switch.</p>:otherControl&&<div className="task-feedback attention" role="status"><p>You used {otherControl}. Try the fitting named in the job.</p><Button variant="outline" size="sm" onClick={props.undo}>Undo that change</Button></div>}
    {unresolved&&<p className="task-feedback attention" role="status">The lab couldn’t get a reading. Check the wiring at the fitting, or open Help to start this job again.</p>}
    {(bellFeedback||wrongState)&&!step?.waitForFan&&!otherControl&&!boardFeedback&&!unresolved&&!restoreFan&&<p className="task-feedback attention" role="status">{bellFeedback||(!doc.supply.enabled?'The supply is off. Switch it on to try the job.':wasTried?'The readings didn’t change as expected. Try the control again to return to the starting position.':'Return the controls to their starting positions, or start this job again.')}</p>}
    {step?<>{restoreFan?<Button className="primary-button full" onClick={e=>undoIsolator?props.undo():operateFromButton(e,'fan-isolation')}>{undoIsolator?'Undo that change':'Switch fan isolator on'}</Button>:step.waitForFan?<Button className="primary-button full" disabled={!readings||runPhase==='running'} onClick={confirmOrRepeat}>{runPhase==='running'?'Waiting for fan':confirmable?step.label:isolatorOpen?'Switch fan isolator on':lampSwitchOn?'Switch the light off again':'Switch the light back on to repeat'}</Button>:step.measure?<Button className="primary-button full" onClick={props.openMeter}>{step.label}</Button>:call.bellPushes?<div className="call-breakers call-bell-buttons" role="group" aria-label="Doorbell buttons">{call.bellPushes.map(push=>{
      const fitting=doc.components.find(c=>c.id===push.id),held=Boolean(fitting?.params.pressed);
      return <div className="call-breaker-choice" key={push.id}><Button variant="outline" disabled={!fitting} aria-pressed={held} aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,push.id)}>{held?'Let go of ':'Hold '}{push.door} button</Button></div>;
    })}</div>:call.breakers?<div className="call-breakers" role="group" aria-label="Breakers on the board">{call.breakers.map(b=>{
        const fitting=doc.components.find(c=>c.id===b.id);
        const position=result?.revision===doc.revision && result.deviceStates[b.id]?.tripped?'Tripped':fitting?.params.closed?'On':'Off';
        const hint=feedbackBreaker===b.id?boardFeedback:'';
        return <div className="call-breaker-choice" key={b.id}><Button variant="outline" aria-label={b.label+', '+position} aria-describedby={hint?'call-board-feedback':undefined} disabled={!fitting} aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,b.id)}>{b.label}<span>{position}</span></Button>
          {hint&&<p id="call-board-feedback" className="task-feedback attention" role="status">{hint}</p>}</div>;
      })}</div>:<Button className="primary-button full" aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,step.target)}>{step.label}</Button>}
      <div className="task-support-actions">{step.waitForFan&&confirmable&&<Button variant="ghost" onClick={e=>operateFromButton(e,'light-switch')}>Watch it again</Button>}<Button variant="ghost" onClick={()=>props.locate(call.breakers?'course-enclosure':step.target)}>{call.breakers?'Show the board':'Show me where'}</Button></div>
      <details className="lesson-more-detail"><summary>Help</summary><p>{bathroom?'The wall switch controls the light and starts the timer. The fan isolator switches off the timer and the fan, so you can still use the light.':step.measure?'Find the two copper pads at the end of the strip. Put a probe on each one, or choose the strip and its + and − pads by name. Then choose Record reading.':worktops?'Use the switch named above, or find it in the equipment list. Look at which strip goes dark.':call.bellPushes?'Choose a button once to hold it down. Choose it again to let go. You can use the buttons here, at the doors or in the equipment list. The chime marks the back door REAR.':'Try the fitting in the room or use the button above. The numbers show the voltage across the fitting in the lab.'}</p><Button variant="outline" onClick={props.restart}>Start this job again</Button>{props.worktopFault&&<Button variant="ghost" onClick={props.worktopFault}>{worktopFaultTitle}</Button>}</details>
    </>:<><Button className="primary-button full" onClick={props.nextJob?.open??props.startFault}>{props.nextJob?'Next job · '+props.nextJob.title:'Try a fault on this circuit'}</Button>{props.worktopFault&&<Button variant="outline" onClick={props.worktopFault}>{worktopFaultTitle}</Button>}<Button variant="ghost" onClick={props.choose}>Choose another job</Button></>}
    </>}
  </section>;
  function voltageReadings(){
    const points=readings??(step??call.steps[call.steps.length-1]).after.map(p=>({label:p.label,value:null}));
    return <dl className="call-readings" aria-label={call.bellPushes?'Voltage at the chime':'Voltage across each fitting'}>{points.map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.value===null?(result?.revision===doc.revision?'No reading':'Waiting…'):r.value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V'}</dd></div>)}</dl>;
  }
}
