import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { CircuitDocument, ConfigurationLesson } from '../../lib/types';
import { describeEndpoint } from '../../lib/endpoint-description';
import type { MeasurementEvidence } from '../../lib/learning';
import { measurementPoints } from '../../lib/measurement-points';
import { faultScore, kitchenFaultChoices, lessonFaultChoices, shownVolts, type FaultStage } from '../../lib/fault-practice';
import { worktopFaultPoints } from '../../lib/worktop-fault';
import { Button } from '../ui/button';

interface Props {
  lesson:ConfigurationLesson; doc:CircuitDocument; stage:FaultStage; worktop:boolean; scored:boolean; hints:number; clue:string;
  feedback:string; diagnosis:string; setDiagnosis:(value:string)=>void; submit:()=>void; checking:boolean; repair:()=>void;
  test:()=>void; testing:boolean; failed:boolean; openReport:()=>void; showClue:()=>void; closeTools:()=>void; openMeter:()=>void;
  context?:ReactNode; next:()=>void; readings:{strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence};
  restoreSupply?:()=>void; samples:MeasurementEvidence[]; missing:string; wrongPoints:boolean; leftLit?:boolean; scoreThis:()=>void; switchOn:boolean; operateSwitch:()=>void;
}

const stages:Record<FaultStage,string> = {
  measure:'1 of 4 · Measure', diagnose:'2 of 4 · Find the fault', repair:'3 of 4 · Repair', retest:'4 of 4 · Test', done:'Complete',
};

function measurePrompt(props:Props) {
  if (!props.worktop) {
    if (props.wrongPoints && props.missing) return props.missing;
    if (props.samples.length===1) return 'One reading saved. Check a second pair of points.';
    return props.context ? 'Record two readings to find the fault.' : props.lesson.challenge.briefing;
  }
  if (!props.switchOn) return 'Turn on the right worktop switch.';
  const {strip,switchOutput}=props.readings;
  if (strip && switchOutput) return 'Check the driver supply, then take both readings again.';
  if (!strip) return 'Touch red to + and black to − on the right strip.';
  const out=describeEndpoint(props.doc,worktopFaultPoints.switchOutput.a)?.terminalLabel;
  const point=out && !['OUT','Output','Switched output'].includes(out) ? 'terminal '+out : 'the output';
  const reverse=strip.a?.terminal==='N';
  return 'Keep '+(reverse?'red':'black')+' on −. Move '+(reverse?'black':'red')+' to '+point+' on the right switch.';
}

function readingValue(sample:MeasurementEvidence) {
  if (sample.mode==='voltage') return shownVolts(sample);
  if (sample.status==='open') return 'OL · open circuit';
  const number=sample.instrument?.displayed ?? sample.value?.toLocaleString('en-IE',{maximumSignificantDigits:3});
  return number===undefined ? 'No reading' : number+' '+sample.unit+(sample.instrument?.signal?' '+sample.instrument.signal:'');
}

function FaultReadings({doc,samples,readings,worktop}:Pick<Props,'doc'|'samples'|'readings'|'worktop'>) {
  const rows=worktop
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
  const heading=useRef<HTMLHeadingElement>(null),lastStep=useRef(stage),hadTools=useRef(Boolean(context));
  useLayoutEffect(()=>{
    const toolsOpen=Boolean(context),changed=lastStep.current!==stage;
    // The simulator accepted the recordings. Put the answer choices in reach.
    if (lastStep.current==='measure' && stage==='diagnose' && toolsOpen) closeTools();
    if (changed || hadTools.current!==toolsOpen) heading.current?.closest('.learn-column')?.scrollTo({top:0,behavior:'instant'});
    if (changed || hadTools.current&&!toolsOpen) heading.current?.focus({preventScroll:true});
    lastStep.current=stage;
    hadTools.current=toolsOpen;
  },[stage,context,closeTools]);

  const headingText=stage==='measure'?measurePrompt(props)
    :stage==='diagnose'?'Which fault fits your readings?'
    :stage==='repair'?'You found the fault.'
    :stage==='retest'?props.restoreSupply?'Turn the supply back on before testing.':props.failed?'The circuit still has a fault.':'The repair is in. Does it work?'
    :'The repair passed.';
  const canAsk=stage==='measure'||stage==='diagnose';
  const choices=worktop?kitchenFaultChoices:lessonFaultChoices(lesson.id);
  const instrumentOpen=Boolean(context);
  const hasWorktopReading=Boolean(readings.strip||readings.switchOutput);
  return <section className="active-task house-call fault-practice" data-fault-stage={stage} data-house-tools={instrumentOpen||undefined} aria-label="Fault practice">
    <div className="task-topline">{!worktop&&<span>Fault practice</span>}<b>{stages[stage]}</b></div>
    <div className="house-job-heading"><h3 ref={heading} tabIndex={-1} aria-live="polite">{headingText}</h3>
      {instrumentOpen&&<Button variant="ghost" size="sm" onClick={closeTools} aria-label="Back to fault">Back</Button>}
    </div>
    {stage==='measure'&&!instrumentOpen&&!props.wrongPoints&&!props.samples.length&&(
      worktop?props.switchOn&&props.leftLit&&<p>The left strip is on. Check the one that stays dark.</p>
      :<p>Record two meter readings before choosing the fault.</p>
    )}
    {stage==='measure'&&worktop&&props.wrongPoints&&<p className="task-feedback attention" role="status">Reading saved. For this check, use the points named above.</p>}
    {props.feedback&&stage!=='done'&&<p className="task-feedback" role="status">{props.feedback}</p>}
    {stage==='diagnose'&&!instrumentOpen&&<FaultReadings {...props}/>}
    {!instrumentOpen&&<>
      {stage==='measure'&&<Button className="primary-button full" onClick={worktop&&!props.switchOn?props.operateSwitch:props.openMeter}>{worktop&&!props.switchOn?'Turn the right switch on':'Use the meter'}</Button>}
      {stage==='diagnose'&&<>
        <label className="field-label"><span className="sr-only">Your diagnosis</span>
          <select aria-label="Your diagnosis" value={props.diagnosis} onChange={e=>props.setDiagnosis(e.target.value)}>
            <option value="">Choose the fault</option>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <Button className="primary-button full" disabled={!props.diagnosis||props.checking} onClick={props.submit}>{props.checking?'Checking…':'Check my diagnosis'}</Button>
      </>}
      {stage==='repair'&&<><p>{worktop?'The break is between the right switch and the strip.':lesson.challenge.answer}</p>
        <Button className="primary-button full" onClick={props.repair}>Repair fault</Button></>}
      {stage==='retest'&&(props.restoreSupply?<Button className="primary-button full" onClick={props.restoreSupply}>Turn bench supply on</Button>:props.failed?<><Button className="primary-button full" onClick={props.openReport}>See test report</Button>
        <Button variant="ghost" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button></>
        :<Button className="primary-button full" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button>)}
      {stage==='done'&&<>{worktop&&<p>The two worktop lights now switch on and off separately.</p>}
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
    {worktop&&!instrumentOpen&&stage==='measure'&&hasWorktopReading&&<details className="fault-help"><summary>Your saved readings</summary><FaultReadings {...props}/></details>}
  </section>;
}
