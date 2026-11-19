import {createPortal} from 'react-dom';
import { worktopFaultTitle } from '../../lib/fault-practice';
import { useEffect,useLayoutEffect,useMemo,useRef,useState, type MouseEvent, type ReactNode } from 'react';
import { Button } from '../ui/button';
import MeterHistory from './MeterHistory';
import type { LessonActivity, MeasurementEvidence } from '../../lib/learning';
import type { CircuitDocument, SimulationResult } from '../../lib/types';
import { houseStepId, callReadings, checkCallSample, chimeMark, chimeTask, chimeMeterControl, chimeProbeClue, checkBoardChoice, type BoardChoice, checkStairChoice, stairReadings, type StairChoice, fanRunPhase, savedCallStep, verifiedCallStep, type CallOperation, type CallSample, type HouseCall } from '../../lib/house-calls';

interface Props {
  context?:ReactNode; closeTools:()=>void;
  call:HouseCall; document:CircuitDocument; result?:SimulationResult; operation?:CallOperation; sample?:CallSample; openMeter:()=>void; meterHistory?:MeasurementEvidence[];
  start?:string; onActivity:(activity:LessonActivity)=>void; onCredit:(id:string,next:string)=>Promise<void>;
  operate:(id:string)=>void; locate:(id:string)=>void; restart:()=>void; choose:()=>void; undo:()=>void;
  field?:{host:HTMLElement;focused?:string;openJob:()=>void};
  earlierBoardDone?:boolean; continueBoard?:()=>void;
  bellFault?:()=>void; worktopFault?:()=>void; nextJob?:{ title:string; open:()=>void }; startFault:()=>void;
}
export function HouseCallPanel(props:Props){
  const {call,document:doc,result,operation,onActivity,onCredit}=props;
  const index=savedCallStep(call,props.start)??0;
  const [observation,setObservation]=useState('');
  const [boardChoice,setBoardChoice]=useState<BoardChoice>();
  const [pickedStrapper,setPickedStrapper]=useState<StairChoice>();
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
  const instruction=step?chimeTask(step,doc):props.earlierBoardDone?'You found the lighting breaker and put it back on.':call.done;
  const chimeCorrection=step&&chimeMeterControl(step,doc);
  const activity=useMemo<LessonActivity>(()=>({
    id:houseStepId(call,index),kind:step?.stairCheck||step?.boardQuestion?'explain':step?.measure?'measure':'operate',title:call.title,
    instruction,explanation:step?.changed??call.done,
    component:step&&call.breakers?'course-enclosure':step?.target,competency:step?.boardQuestion?'reading-branch-voltage':step?.stairCheck?'reading-switch-contacts':step?.chimeReading?'measuring-chime-voltage':'house-call',part:step?.measure||step?.stairCheck?'terminals':step&&!call.breakers?'actuator':undefined,
  }),[call,index,step,instruction]);
  useEffect(()=>onActivity(activity),[onActivity,activity]);
  const sample=checkCallSample(call,index,doc,result,props.sample);
  const previousCallReading=step?.chimeReading==='supply'&&toolsOpen&&!sample?observation:'';
  const stairs=call.lesson===9;
  const chimeWiring=call.bellPushes?'The transformer feeds '+chimeMark(doc,'AC1')+' and '+chimeMark(doc,'AC2')+'. The front button feeds '+chimeMark(doc,'FRONT')+' and the back button feeds '+chimeMark(doc,'REAR')+'.'+(doc.components.some(c=>c.id==='chime'&&c.variant==='croma-100a')?' The fifth screw, V, is spare here.':''):'';
  const stairView=stairs?stairReadings(step?.stairCheck??'far',doc,result):undefined;
  const stairAnswer=checkStairChoice(call,index,doc,result,pickedStrapper);
  const wrongWire=stairAnswer?.pass===false;
  useLayoutEffect(()=>{
    if(wrongWire)heading.current?.closest('.learn-column')?.scrollTo({top:0,behavior:'instant'});
  },[wrongWire,pickedStrapper]);
  const bathroom=call.lesson===36;
  const runPhase=bathroom&&index<=1?fanRunPhase(call,doc,result,operation):undefined;
  useEffect(()=>{
    if(runPhase!=='running'||globalThis.document.hidden||toolsOpen)return;
    const frame=requestAnimationFrame(()=>setSeenRun(doc.revision));
    return ()=>cancelAnimationFrame(frame);
  },[runPhase,doc.revision,toolsOpen]);
  const witnessed=seenRun===doc.revision;
  const confirmable=runPhase==='stopped'&&witnessed;
  const boardAnswer=checkBoardChoice(call,index,doc,result,boardChoice);
  const verified=step?.boardQuestion?boardAnswer?.pass:step?.stairCheck?stairAnswer?.pass:step?.measure?sample?.pass:step?.waitForFan?confirmable&&confirmedStop===doc.revision:
    (!bathroom||index!==0||runPhase==='running'&&witnessed)&&verifiedCallStep(call,index,doc,result,operation);
  const observed=boardAnswer?.pass?boardAnswer.message:stairAnswer?.pass?stairAnswer.message:sample?.pass?sample.message:step?.changed??'';
  useEffect(()=>{
    if(!step || !verified || credited.current===activity.id)return;
    credited.current=activity.id;
    void onCredit(activity.id,houseStepId(call,index+1)).then(()=>{
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
  const worktops=call.lesson===66;
  const otherControl=step && recentAction && recentAction.component!==step.target && !usedCandidate && !usedBell
    ? doc.components.find(c=>c.id===recentAction.component)?.label : undefined;
  const wrongState=step && readings && !ready && !verified;
  const [lamp,socket]=readings??[];
  const chimeStatus=!lamp || lamp.powered===undefined || typeof lamp.call!=='string' ? 'No reading'
    : !lamp.powered ? 'No supply' : ({Idle:'No call',Front:'Front door',Rear:'Back door',Both:'Both doors'} as Record<string,string>)[lamp.call]??'No reading';
  let bellFeedback='';
  const targetWasUsed=step && wasTried && step.pressed===Boolean(doc.components.find(c=>c.id===step.target)?.params.pressed);
  if(step && !step.chimeReading && call.bellPushes && !otherControl && readings && (wrongState || targetWasUsed || otherPush) && !verified){
    if(!doc.supply.enabled)bellFeedback='Switch the bench supply on to try the buttons.';
    else if(lamp?.powered!==true || (lamp.value??0)>12*1.1)bellFeedback='Check the chime supply between '+chimeMark(doc,'AC1')+' and '+chimeMark(doc,'AC2')+'. Look for about 12 V AC.';
    else if(otherPush)bellFeedback='Let go of the '+otherPush.door+' button, then try the '+targetDoor+' button.';
    else if(targetWasUsed && lamp.call!==step.after[0].call)bellFeedback='Look at the '+targetDoor+' input under “See the voltages”. Does its voltage change when you press the button?';
    else bellFeedback=step.pressed?'Let go of the '+targetDoor+' button, then try it again.':'Hold the '+targetDoor+' button first. Then let it go and watch the chime.';
  }
  let boardFeedback='';
  const sharedTripped=!!call.breakers&&result?.revision===doc.revision&&result.deviceStates.group?.tripped===true;
  const shared=doc.components.find(c=>c.id==='group'),sharedOpen=call.breakers&&shared?.params.closed===false;
  const branchesOff=call.breakers?.filter(b=>b.id!=='group'&&doc.components.find(c=>c.id===b.id)?.params.closed===false)??[];
  const sharedStep=step?.target==='group';
  const boardControls=call.breakers?.filter(b=>b.id==='group'?sharedStep||sharedOpen||sharedTripped:!sharedStep||branchesOff.length>0);
  if(call.breakers&&step&&readings&&doc.supply.enabled&&!verified){
    if(sharedTripped)boardFeedback='The shared switch has tripped. Reset its lever, then try the job again.';
    else if(sharedOpen&&!step.before[0].sharedOff)boardFeedback='The shared switch is off. Put it back on before trying one breaker.';
    else if(step.target==='group'&&branchesOff.length)boardFeedback='Put both numbered breakers on first. Then try the shared switch.';
    else if(!ready&&step.before[0].sharedOff&&lamp?.powered&&socket?.powered)
      boardFeedback='Both circuits are on. Switch the shared lever off, then put it back on.';
    else if(!ready&&step.boardQuestion&&lamp?.powered&&socket?.powered)
      boardFeedback='Both fittings have power. Switch off just the socket to compare their readings.';
    else if(!ready&&step.target!=='group'&&branchesOff.length){
      if(lamp?.powered===true&&socket?.powered===false)boardFeedback='The lamp is still on. Put the socket breaker back on.';
      else if(lamp?.powered===false&&socket?.powered===true)boardFeedback='The socket still has power. Put the lighting breaker back on.';
      else if(lamp?.powered===false&&socket?.powered===false)boardFeedback='Both fittings are off. Put the last breaker back on and try one at a time.';
    }else if(ready&&index===0&&usedCandidate&&recentAction&&callReadings(step.before,recentAction.before,recentAction.reading)?.[1]?.powered===false)
      boardFeedback='Both have power again. Try the other breaker.';
  }
  const unresolved=step&&result?.revision===doc.revision&&(!readings||readings.some(r=>r.value===null&&!r.isolated&&!r.disconnected));
  const restoreFan=bathroom&&doc.supply.enabled&&step?.target==='light-switch'&&!step.waitForFan&&!unresolved&&socket?.isolated;
  const undoIsolator=restoreFan&&recentAction?.component==='fan-isolation';
  const changedBreaker=sharedTripped||sharedOpen?'group':usedCandidate?recentAction?.component:
    call.breakers?.find(b=>doc.components.find(c=>c.id===b.id)?.params.closed===false)?.id??call.breakers?.[0]?.id;
  const feedbackBreaker=boardControls?.some(b=>b.id===changedBreaker)?changedBreaker:boardControls?.[0]?.id;
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
  const closeToTarget=step&&props.field?.focused===step.target;
  const chooseOnJob=Boolean(!step||restoreFan||step.boardQuestion||step.stairCheck||step.waitForFan||call.breakers||chimeCorrection);
  return <section className="active-task house-call" data-house-tools={toolsOpen||undefined} data-house-call={call.lesson} data-call-step={index} aria-label="House call">
    {props.field&&createPortal(<div className="field-job-step" aria-label="Current job">
      <p aria-live="polite">{instruction}</p>
      {chooseOnJob?<button type="button" onClick={props.field.openJob}>{step?.boardQuestion||step?.stairCheck?'Choose answer':step?'Open job':'Job summary'}</button>
        :step.measure?<button type="button" onClick={props.openMeter}>Take reading</button>
        :closeToTarget?<button type="button" onClick={()=>props.operate(step.target)}>{step.label}</button>
        :<button type="button" data-find-fitting onClick={()=>props.locate(step.target)}>Find fitting</button>}
    </div>,props.field.host)}
    <div className="task-topline"><span>Oakfield house</span><b>{step?'Check '+(index+1)+' of '+call.steps.length:'Job complete'}</b></div>
    <div className={'house-job-heading'+(sample&&!sample.pass||previousCallReading?' with-reading-feedback':'')}><h3 ref={heading} tabIndex={-1} aria-live="polite">{step?instruction:'What you checked'}</h3>
      {toolsOpen&&<Button variant="ghost" size="sm" onClick={props.closeTools}>Back to job</Button>}
      {previousCallReading&&<p className="task-feedback success" role="status">{previousCallReading}</p>}
      {sample&&!sample.pass&&<p className="task-feedback attention" role="status">{sample.message}</p>}
    </div>
    {props.context}
    {!toolsOpen&&<>
    {!index&&<p>{call.request}</p>}
    {observation&&step&&!step.stairCheck&&!step.boardQuestion&&!step.before[0].sharedOff&&!bellFeedback&&!boardFeedback&&(!call.breakers||ready)&&!restoreFan&&<p className="task-feedback success" role="status">{observation}</p>}
    {!step&&<p className="task-instruction">{instruction}</p>}
    {!step&&(worktops||call.bellPushes)&&props.meterHistory&&<MeterHistory circuit={doc} readings={props.meterHistory.filter(r=>r.circuitId===doc.id)}/>}
    {step?.stairCheck&&<>
      {stairAnswer&&!stairAnswer.pass?<p className="task-feedback attention" role="status">{stairAnswer.message}</p>
        :<p>{step.stairCheck==='near'?'The two wires between the switches are called strappers.':'COM joins one of these wires. Look for the same reading as COM.'}</p>}
      {wireReadings()}
    </>}
    {stairs&&!step&&<details className="lesson-more-detail"><summary>See the landing switch readings</summary>{wireReadings(true)}</details>}
    {call.bellPushes && <p className="call-chime" role="status">Call at the chime <strong>{readings?chimeStatus:result?.revision===doc.revision?'No reading':'Waiting…'}</strong></p>}
    {bathroom?<><dl className="call-readings" aria-label="Bathroom light and fan">{readings?.map((r,i)=><div key={r.label}><dt>{r.label}</dt><dd>{r.lit===undefined?'No reading':i===1?(r.lit?'Running':'Stopped'):(r.lit?'Lit':'Dark')}</dd></div>)}</dl>
      {step?.waitForFan&&<p role="status">{runPhase==='running'?'Timer running · '+remaining+' s left':confirmable?'The timer finished. Check the fan indicator.':isolatorOpen?'Switch the fan isolator back on to try the timer.':lampSwitchOn?'Switch the light off to start the timer.':'Try the timing check again. Switch the light on first.'}</p>}</>:worktops?<dl className="call-readings" aria-label="Worktop lights">{readings?.map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.lit===undefined?'No reading':r.lit?'Lit':'Dark'}</dd></div>)}</dl>:call.bellPushes?!step?.chimeReading&&<details className="call-bell-readings"><summary>See the voltages</summary>{voltageReadings()}</details>:!step?.stairCheck&&voltageReadings()}
    {restoreFan?<p className="task-feedback attention" role="status">{undoIsolator?'You used '+otherControl+'. ':''}The fan isolator is off. The fan has stopped{lamp?.lit?' and the light is still on':''}. Switch the isolator back on to try the light switch.</p>:otherControl&&<div className="task-feedback attention" role="status"><p>You used {otherControl}. Try the fitting named in the job.</p><Button variant="outline" size="sm" onClick={props.undo}>Undo that change</Button></div>}
    {unresolved&&!step?.stairCheck&&!boardFeedback&&<p className="task-feedback attention" role="status">The lab couldn’t get a reading. Check the wiring at the fitting, or open Help to start this job again.</p>}
    {(bellFeedback||wrongState)&&!step?.chimeReading&&!step?.stairCheck&&!step?.waitForFan&&!otherControl&&!boardFeedback&&!unresolved&&!restoreFan&&<p className="task-feedback attention" role="status">{bellFeedback||(!doc.supply.enabled?'The supply is off. Switch it on to try the job.':wasTried?'The readings didn’t change as expected. Try the control again to return to the starting position.':'Return the controls to their starting positions, or start this job again.')}</p>}
    {step?<>{step.boardQuestion&&ready?<><div className="call-breakers" role="group" aria-label="Which fitting has power?">{step.before.map(point=><Button key={point.id} variant="outline" onClick={e=>{
        keyboardControl.current=e.detail===0?e.currentTarget:null;
        setBoardChoice({activity:activity.id,circuitId:doc.id,revision:doc.revision,component:point.id});
      }}>{point.label}</Button>)}</div>{boardAnswer&&!boardAnswer.pass&&<p role="status" className="task-feedback attention">{boardAnswer.message}</p>}</>:step.stairCheck?<><div className="call-breakers stair-choices" role="group" aria-label={step.stairCheck==='near'?'Downstairs wire':'Landing contact'}>{(['T1','T2'] as const).map(pin=><Button key={pin} variant="outline" disabled={!stairView?.answer} onClick={e=>{
        keyboardControl.current=e.detail===0?e.currentTarget:null;
        setPickedStrapper({circuitId:doc.id,revision:doc.revision,activity:activity.id,pin});
      }}>{stairView?.wires.find(w=>w.pin===pin)?.mark??(pin==='T1'?'L1':'L2')}</Button>)}</div>
      {!stairView?.answer&&result?.revision===doc.revision&&!otherControl&&<p className="task-feedback attention" role="status">{!doc.supply.enabled?'Switch the bench supply on to compare the two wires.':!stairView||stairView.lampVoltage===null?'There’s no reading for this check. Check the switch and the neutral at the lamp.':!stairView.dark?'The stair light needs to be off for this check. Undo the last switch movement, or use Help to start again.':'These readings don’t show a single path. Check the two wires between the switches and the neutral at the lamp.'}</p>}
      {!stairView?.answer&&recentAction&&!otherControl&&<Button variant="outline" onClick={props.undo}>Undo that change</Button>}
    </>:restoreFan?<Button className="primary-button full" onClick={e=>undoIsolator?props.undo():operateFromButton(e,'fan-isolation')}>{undoIsolator?'Undo that change':'Switch fan isolator on'}</Button>:step.waitForFan?<Button className="primary-button full" disabled={!readings||runPhase==='running'} onClick={confirmOrRepeat}>{runPhase==='running'?'Waiting for fan':confirmable?step.label:isolatorOpen?'Switch fan isolator on':lampSwitchOn?'Switch the light off again':'Switch the light back on to repeat'}</Button>:step.measure?<Button className="primary-button full" onClick={e=>chimeCorrection?operateFromButton(e,chimeCorrection.id):props.openMeter()}>{chimeCorrection?.label??step.label}</Button>:call.bellPushes?<div className="call-breakers call-bell-buttons" role="group" aria-label="Doorbell buttons">{call.bellPushes.map(push=>{
      const fitting=doc.components.find(c=>c.id===push.id),held=Boolean(fitting?.params.pressed);
      return <div className="call-breaker-choice" key={push.id}><Button variant="outline" disabled={!fitting} aria-pressed={held} aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,push.id)}>{held?'Let go of ':'Hold '}{push.door} button</Button></div>;
    })}</div>:call.breakers?<div className="call-breakers" role="group" aria-label="Breakers on the board">{boardControls?.map(b=>{
        const fitting=doc.components.find(c=>c.id===b.id);
        const position=result?.revision===doc.revision && result.deviceStates[b.id]?.tripped?'Tripped':fitting?.params.closed?'On':'Off';
        const hint=feedbackBreaker===b.id?boardFeedback:'';
        return <div className="call-breaker-choice" key={b.id}><Button variant="outline" aria-label={b.label+', '+position} aria-describedby={hint?'call-board-feedback':undefined} disabled={!fitting} aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,b.id)}>{b.label}<span>{position}</span></Button>
          {hint&&<p id="call-board-feedback" className="task-feedback attention" role="status">{hint}</p>}</div>;
      })}</div>:<Button className="primary-button full" aria-disabled={!readings||undefined} onClick={e=>operateFromButton(e,step.target)}>{step.label}</Button>}
      <div className="task-support-actions">{step.waitForFan&&confirmable&&<Button variant="ghost" onClick={e=>operateFromButton(e,'light-switch')}>Watch it again</Button>}<Button variant="ghost" onClick={()=>props.locate(call.breakers?(step.target==='group'?'group':'branch1'):step.target)}>{call.breakers?(step.target==='group'?'Show the shared switch':'Show the two breakers'):'Show me where'}</Button></div>
      <details className="lesson-more-detail"><summary>Help</summary><p>{call.breakers?step.before[0].sharedOff?'Both loads draw zero amps. The shared switch opens line and neutral, so the lab has no voltage reading across the fittings.':'Each numbered breaker feeds one circuit. RCCB is the shared trip switch ahead of both. This job uses its lever. The T button is a separate test.':stairs?'Each switch joins COM to L1 or L2. Two wires run from the downstairs switch to the landing. The lamp lights when the landing switch connects it to the wire with the feed.':bathroom?'The wall switch controls the light and starts the timer. The fan isolator switches off the timer and the fan, so you can still use the light.':step.chimeReading?chimeProbeClue(step,doc)+' '+chimeWiring:step.measure?'Find the two copper pads at the end of the strip. Put a probe on each one, or choose the strip and its + and − pads by name. Then choose Record reading.':worktops?'Use the switch named above, or find it in the equipment list. Look at which strip goes dark.':call.bellPushes?'Choose a button once to hold it down. Choose it again to let go. You can use the buttons here, at the doors or in the equipment list. The back button feeds '+chimeMark(doc,'REAR')+'.':'Try the fitting in the room or use the button above. The numbers show the voltage across the fitting in the lab.'}</p><Button variant="outline" onClick={props.restart}>Start this job again</Button>{props.worktopFault&&<Button variant="ghost" onClick={props.worktopFault}>{worktopFaultTitle}</Button>}</details>
    </>:<><Button className="primary-button full" onClick={props.earlierBoardDone?props.continueBoard:props.bellFault??props.nextJob?.open??props.startFault}>{props.earlierBoardDone?'Try the socket and shared switch':props.bellFault?'Try the fault · The back doorbell is quiet':props.nextJob?'Next job · '+props.nextJob.title:'Try a fault on this circuit'}</Button>{props.worktopFault&&<Button variant="outline" onClick={props.worktopFault}>{worktopFaultTitle}</Button>}<Button variant="ghost" onClick={props.choose}>Choose another job</Button></>}
    </>}
  </section>;
  function wireReadings(includeCommon=step?.stairCheck==='far'){
    const format=(value:number|null|undefined)=>value===undefined&&result?.revision!==doc.revision?'Waiting…':value==null?'No reading':value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V';
    return <><span className="small-copy">Volts to N (neutral) at the lamp</span><dl className="call-readings" aria-label="Switch voltages to the lamp neutral">
      {includeCommon&&<div><dt>COM</dt><dd>{format(stairView?.commonVoltage)}</dd></div>}
      {(['T1','T2'] as const).map((pin,i)=><div key={pin}><dt>{stairView?.wires[i].mark??(i?'L2':'L1')}</dt><dd>{format(stairView?.wires[i].value)}</dd></div>)}
    </dl>{stairView?.wires.some(w=>w.value===null)&&<p className="small-copy">The lab has no steady voltage to show for that wire. An unused wire can float when neither switch connects it.</p>}</>;
  }
  function voltageReadings(){
    if(call.breakers){
      return <dl className="call-readings" aria-label="Lamp and socket readings">{(step??call.steps[call.steps.length-1]).before.map((point,i)=>{
        const row=readings?.[i],value=row?.value;
        const current=result?.revision===doc.revision&&result.converged?result.branchCurrents[point.id+'.load']:undefined;
        const reading=typeof value==='number'?value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V'
          :sharedOpen&&current?Math.hypot(current.re,current.im).toLocaleString('en-IE',{maximumFractionDigits:2})+' A'
          :result?.revision===doc.revision?'No reading':'Waiting…';
        return <div key={point.id}><dt>{point.label}</dt><dd>{reading}</dd></div>;
      })}</dl>;
    }
    if(stairs){
      const lamp=readings?.[0];
      const value=lamp?.value;
      const volts=typeof value==='number'?value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V':result?.revision===doc.revision?'No reading':'Waiting…';
      return <dl className="call-readings" aria-label="Stair light"><div><dt>Stair light</dt><dd>{typeof lamp?.lit==='boolean'&&<>{lamp.lit?'On':'Off'} · </>}{volts}</dd></div></dl>;
    }
    const points=readings??(step??call.steps[call.steps.length-1]).after.map(p=>({label:p.label,value:null}));
    return <dl className="call-readings" aria-label={call.bellPushes?'Voltage at the chime':'Voltage across each fitting'}>{points.map(r=><div key={r.label}><dt>{r.label}</dt><dd>{r.value===null?(result?.revision===doc.revision?'No reading':'Waiting…'):r.value.toLocaleString('en-IE',{maximumFractionDigits:1})+' V'}</dd></div>)}</dl>;
  }
}
