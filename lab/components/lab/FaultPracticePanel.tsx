import type {BellReadings} from '../../lib/bell-fault';
import {chimeMark} from '../../lib/house-calls';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { CircuitDocument, ConfigurationLesson } from '../../lib/types';
import {faultReadingValue as readingValue, repairMeterPrompt} from '../../lib/repair-meter-guidance';
import type { MeasurementEvidence } from '../../lib/learning';
import { measurementPoints } from '../../lib/measurement-points';
import { faultScore, kitchenFaultChoices, lessonFaultChoices, type FaultStage } from '../../lib/fault-practice';
import { heaterFeed, type HeaterReadings, type HeaterRun } from '../../lib/heater-fault';
import { Button } from '../ui/button';
import HeaterFlexChoice,{type FlexLanding} from './HeaterFlexChoice';
import type {FieldAction} from './PhoneFieldControls';

interface Props {
  fieldTaskHost?:HTMLElement|null; openJob?:()=>void;
  flexLanding?:FlexLanding;
  wrongSample?:MeasurementEvidence; bell?:BellReadings; toggleDoor?:(door:'front'|'back')=>void;
  findRepair?:()=>void;
  isolateForRepair?:{label:string;run:()=>void};
  lesson:ConfigurationLesson; doc:CircuitDocument; stage:FaultStage; worktop:boolean; scored:boolean; hints:number; clue:string;
  feedback:string; diagnosis:string; setDiagnosis:(value:string)=>void; submit:()=>void; checking:boolean; repair:()=>void;
  test:()=>void; testing:boolean; failed:boolean; openReport:()=>void; showClue:()=>void; closeTools:()=>void; openMeter:()=>void;
  context?:ReactNode; next:()=>void; readings:{strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence}; heater?:HeaterReadings;
  heaterRun?:HeaterRun; heaterRunAction?:{label:string; instruction:string; reading:string; disabled:boolean; run:()=>void}; worktopStatus?:string;
  restoreSupply?:()=>void; samples:MeasurementEvidence[]; missing:string; wrongPoints:boolean; leftLit?:boolean; scoreThis:()=>void; switchOn:boolean; operateSwitch:()=>void;
}

const stages:Record<FaultStage,string> = {
  measure:'1 of 4 · Measure', diagnose:'2 of 4 · Find the fault', repair:'3 of 4 · Repair', retest:'4 of 4 · Test', done:'Complete',
};

function measurePrompt(props:Props,wrong?:MeasurementEvidence) {
  const namedJob=props.bell?'chime':props.heater?'heater':props.worktop?'worktop':undefined;
  if(namedJob)return repairMeterPrompt(props.doc,namedJob,props.readings,props.heater,props.bell,wrong);
  if(props.wrongPoints&&props.missing)return props.missing;
  if(props.samples.length===1)return 'One reading saved. Check a second pair of points.';
  return props.context?'Record two readings to find the fault.':props.lesson.challenge.briefing;
}

function FaultReadings({doc,samples,readings,worktop,heater,bell}:Pick<Props,'doc'|'samples'|'readings'|'worktop'|'heater'|'bell'>) {
  const rows=bell?[{label:chimeMark(doc,'REAR')+' to '+chimeMark(doc,'AC2'),sample:bell.call},{label:'Back button to '+chimeMark(doc,'AC2'),sample:bell.push}]:heater?[{label:'Across the heater',sample:heater.heater},{label:heaterFeed(doc)?.component==='fuse'?'Fuse OUT to heater N':'Wall switch LOAD L to heater N',sample:heater.output}]:worktop
    ? [{label:'Across the right strip',sample:readings.strip},{label:'Right switch to − pad',sample:readings.switchOutput}]
    : samples.map(sample=>({label:sample.measuredAt ?? measurementPoints(doc,sample),sample}));
  const table=(items:typeof rows)=><dl className="fault-readings" aria-label="Your fault readings">
    {items.map(({label,sample})=>sample&&<div key={sample.id}><dt>{label}</dt><dd>{readingValue(sample)}</dd></div>)}
  </dl>;
  return <>{table(rows.slice(-2))}
    {rows.length>2&&<details className="fault-help"><summary>Earlier readings ({rows.length-2})</summary>{table(rows.slice(0,-2))}</details>}
  </>;
}

export function FaultPracticePanel(props:Props) {
  const {lesson,stage,worktop,readings,context,closeTools}=props;
  const fieldHeading=useRef<HTMLElement>(null),fieldIntroduced=useRef(false),fieldPromptId=useId();
  useLayoutEffect(()=>{
    if(!props.fieldTaskHost||fieldIntroduced.current)return;
    const frame=requestAnimationFrame(()=>{
      if(!fieldHeading.current?.getClientRects().length)return;
      fieldIntroduced.current=true;
      fieldHeading.current.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[props.fieldTaskHost]);
  const heading=useRef<HTMLHeadingElement>(null),lastStep=useRef(stage),hadTools=useRef(Boolean(context));
  useLayoutEffect(()=>{
    const toolsOpen=Boolean(context),changed=lastStep.current!==stage;
    // The simulator accepted the recordings. Put the answer choices in reach.
    if (lastStep.current==='measure' && stage==='diagnose' && toolsOpen) closeTools();
    if (changed || hadTools.current!==toolsOpen) heading.current?.closest('.learn-column')?.scrollTo({top:0,behavior:'instant'});
    if (!props.fieldTaskHost&&(changed || hadTools.current&&!toolsOpen)) heading.current?.focus({preventScroll:true});
    lastStep.current=stage;
    hadTools.current=toolsOpen;
  },[stage,context,closeTools,props.fieldTaskHost]);

  const headingText=stage==='measure'?measurePrompt(props)
    :stage==='diagnose'?'Which fault fits your readings?'
    :stage==='repair'?worktop?'Check the wire from the right switch to the strip.':'You found the fault.'
    :stage==='retest'?props.restoreSupply?'Turn the supply back on before testing.':props.heaterRunAction?.instruction??(props.failed?'The circuit still has a fault.':worktop?'Check the two lights, then test the repair.':'The repair is in. Does it work?')
    :'The repair passed.';
  const canAsk=stage==='measure'||stage==='diagnose';
  const choices=props.bell?[
    ['wrong-control','The back button does not close'],
    ['open-wire','A break in the wire from the back button to the chime'],
    ['short-circuit','A short across the bell supply'],
  ]:props.heater?[
    ['overload','The heater is drawing too much current'],
    ['open-neutral','A break in the neutral going to the heater'],
    ['open-live','A break in the line going to the heater'],
  ]:worktop?kitchenFaultChoices:lessonFaultChoices(lesson.id);
  const frontHeld=Boolean(props.doc.components.find(c=>c.id==='front')?.params.pressed);
  const backHeld=Boolean(props.doc.components.find(c=>c.id==='back')?.params.pressed);
  const doorAction=props.bell&&(frontHeld||!backHeld)?{label:frontHeld?'Let go of front button':'Hold back button',run:()=>props.toggleDoor?.(frontHeld?'front':'back')}:undefined;
  const measureAction=doorAction??{
    label:props.bell?(props.bell.call?'Check the back button':'Check the chime'):props.heater?(props.switchOn?'Use the bench meter':'Turn heater switch on'):worktop&&!props.switchOn?'Turn the right switch on':'Use the meter',
    run:(worktop||props.heater)&&!props.switchOn?props.operateSwitch:props.openMeter,
  };
  const repairAction=props.findRepair?{label:'Find repair on site',run:props.findRepair}
    :props.isolateForRepair??{label:'Repair fault',run:props.repair};
  const retestAction:FieldAction=props.restoreSupply?{label:'Turn bench supply on',run:props.restoreSupply}
    :props.heaterRunAction??(props.failed?{label:'See test report',run:props.openReport}
    :{label:props.testing?'Testing…':'Test the repair',run:props.test,disabled:props.testing});
  const wrongReading=stage==='measure'&&props.wrongPoints&&(worktop||props.heater||props.bell)
    ?props.wrongSample?measurePrompt(props,props.wrongSample):'Reading saved. For this check, use the points named above.':undefined;
  const instrumentOpen=Boolean(context);
  const hasWorktopReading=Boolean(readings.strip||readings.switchOutput);
  const chooseLanding=!!props.flexLanding&&!props.findRepair&&!props.isolateForRepair;
  const fieldAction:{label:string;run?:(()=>void);disabled?:boolean}=stage==='measure'?measureAction:stage==='diagnose'?{label:'Choose the fault',run:props.openJob}
    :stage==='repair'?chooseLanding?{label:'Choose a terminal',run:props.openJob}:repairAction
    :stage==='retest'?retestAction:{label:'Choose another job',run:props.next};
  const fieldInstruction=stage==='measure'
    ?props.bell&&!frontHeld&&!backHeld?'The front doorbell rings. The back one is quiet.'
    :props.heater&&!props.switchOn?'The kitchen heater stays cold.'
    :worktop&&(!props.switchOn||(!hasWorktopReading&&!props.wrongPoints))?props.leftLit?'The left light works. The right one stays dark.':'The right worktop light stays dark.'
    :props.wrongSample&&wrongReading?wrongReading:headingText
    :stage==='repair'&&props.heater?'Find the broken feed to the heater.'
    :stage==='repair'&&props.bell?'Find the back-door wire at the hall chime.':headingText;
  return <section className="active-task house-call fault-practice" data-fault-stage={stage} data-house-tools={instrumentOpen||undefined} aria-label="Fault practice">
    {props.fieldTaskHost&&(worktop||props.heater||props.bell)&&createPortal(
      <section ref={fieldHeading} className="field-job-step" tabIndex={-1} aria-label="Current job step" aria-describedby={fieldPromptId} data-site-action={stage==='repair'||stage==='retest'||undefined}>
        <p id={fieldPromptId} aria-live="polite" aria-atomic="true">{fieldInstruction}</p>
        {fieldAction.run&&<button type="button" onClick={fieldAction.run} disabled={fieldAction.disabled}>{fieldAction.label}</button>}
      </section>,props.fieldTaskHost)}
    <div className="task-topline">{!worktop&&!props.heater&&!props.bell&&<span>Fault practice</span>}<b>{stages[stage]}</b></div>
    <div className="house-job-heading"><h3 ref={heading} tabIndex={-1} aria-live="polite">{headingText}</h3>
      {instrumentOpen&&<Button variant="ghost" size="sm" onClick={closeTools} aria-label="Back to fault">Back</Button>}
    </div>
    {stage==='measure'&&!instrumentOpen&&!props.wrongPoints&&!props.samples.length&&(
      props.bell?<p>The front doorbell rings in the hall. The back doorbell is quiet.</p>
      :props.heater?<p>{props.switchOn?'L is line and N is neutral. The training bench lets you check both without opening the heater.':'“I’ve tried the wall switch, but the kitchen heater stays cold.”'}</p>
      :worktop?<p>{props.leftLit?'“The light under the left cupboard works. The right one stays dark.”':'“The light under the right cupboard stays dark.”'}</p>
      :<p>Record two meter readings before choosing the fault.</p>
    )}
    {stage==='measure'&&props.heater?.heater&&!props.heater.output&&!props.wrongPoints&&
      <p role="status">At the heater · <b>{readingValue(props.heater.heater)}</b></p>}
    {stage==='measure'&&worktop&&readings.strip&&!readings.switchOutput&&!props.wrongPoints&&
      <p role="status">Right strip · <b>{readingValue(readings.strip)}</b></p>}
    {wrongReading&&<p className="task-feedback attention" role="status">{wrongReading}</p>}
    {props.feedback&&stage!=='done'&&<p className="task-feedback" role="status">{props.feedback}</p>}
    {stage==='diagnose'&&!instrumentOpen&&<FaultReadings {...props}/>}
    {!instrumentOpen&&<>
      {stage==='measure'&&<Button className="primary-button full" onClick={measureAction.run}>{measureAction.label}</Button>}
      {stage==='diagnose'&&<>
        <label className="field-label"><span className="sr-only">Your diagnosis</span>
          <select aria-label="Your diagnosis" value={props.diagnosis} onChange={e=>props.setDiagnosis(e.target.value)}>
            <option value="">Choose the fault</option>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <Button className="primary-button full" disabled={!props.diagnosis||props.checking} onClick={props.submit}>{props.checking?'Checking…':'Check my diagnosis'}</Button>
      </>}
      {stage==='repair'&&<><p>{worktop?'You found voltage at the switch and none across the strip. Turn the simulated supply off before opening the fitting.':lesson.challenge.answer}</p>
        {chooseLanding&&props.flexLanding?<HeaterFlexChoice landing={props.flexLanding}/>:
          <Button className="primary-button full" onClick={repairAction.run}>{repairAction.label}</Button>}</>}
      {stage==='retest'&&props.heaterRunAction&&<p role="status">{props.heaterRunAction.reading}</p>}
      {stage==='retest'&&worktop&&props.worktopStatus&&<p role="status">{props.worktopStatus}</p>}
      {stage==='retest'&&!props.restoreSupply&&!props.heaterRunAction&&props.heater&&props.heaterRun?.runningAfter!==undefined&&<p>Switch off · {Math.round(props.heaterRun.stopped)} W. Switch on · {Math.round(props.heaterRun.runningAfter)} W.</p>}
      {stage==='retest'&&<><Button className="primary-button full" disabled={retestAction.disabled} onClick={retestAction.run}>{retestAction.label}</Button>
        {props.failed&&!props.restoreSupply&&!props.heaterRunAction&&<Button variant="ghost" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button>}</>}
      {stage==='done'&&<>{props.bell&&<p>Both door buttons now send a call to the hall chime.</p>}{worktop&&<p>You restored the feed to the right worktop light and tested the repair.</p>}{props.heater&&<p>{props.heaterRun?.runningAfter!==undefined?'With the wall switch off, the element drew '+Math.round(props.heaterRun.stopped)+' W. With it back on, it drew '+Math.round(props.heaterRun.runningAfter)+' W.':'You found the break and tested the repaired heater feed.'}</p>}
        {props.scored&&<p>Your score <b>{faultScore(props.hints)}/100</b></p>}
        <Button className="primary-button full" onClick={props.next}>Choose another job</Button>
        <Button variant="ghost" onClick={props.openReport}>See test report</Button></>}
    </>}
    {canAsk&&<details className="fault-help"><summary>Help{props.scored?' and score':''}</summary>
      {!worktop&&headingText!==lesson.challenge.briefing&&<p>{lesson.challenge.briefing}</p>}
      {props.clue&&<p role="status">{props.clue}</p>}
      {props.scored&&<p>{faultScore(props.hints)} points available. Each clue costs 15.</p>}
      {props.hints<3&&<Button variant="outline" onClick={props.showClue}>{props.hints?'Next clue':'Show a clue'}</Button>}
      {!instrumentOpen&&stage==='diagnose'&&<Button variant="ghost" onClick={props.openMeter}>Check with the meter</Button>}
      {!props.scored&&<Button variant="ghost" onClick={props.scoreThis}>Restart for a score</Button>}
    </details>}
    {context}
    {!instrumentOpen&&stage==='measure'&&(worktop&&hasWorktopReading||props.heater?.heater||props.heater?.output||props.bell?.call||props.bell?.push)&&<details className="fault-help"><summary>Your saved readings</summary><FaultReadings {...props}/></details>}
  </section>;
}
