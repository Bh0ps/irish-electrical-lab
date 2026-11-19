import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { CircuitDocument, ConfigurationLesson } from '../../lib/types';
import { describeEndpoint } from '../../lib/endpoint-description';
import type { MeasurementEvidence } from '../../lib/learning';
import { faultChoices, faultScore, kitchenFaultChoices, shownVolts, worktopFaultTitle, type FaultStage } from '../../lib/fault-practice';
import { worktopFaultPoints } from '../../lib/worktop-fault';
import { Button } from '../ui/button';

interface Props {
  lesson:ConfigurationLesson; doc:CircuitDocument; stage:FaultStage; worktop:boolean; scored:boolean; hints:number; clue:string;
  feedback:string; diagnosis:string; setDiagnosis:(value:string)=>void; submit:()=>void; checking:boolean; repair:()=>void;
  test:()=>void; testing:boolean; failed:boolean; openReport:()=>void; showClue:()=>void; closeTools:()=>void; openMeter:()=>void;
   context?:ReactNode; next:()=>void; readings:{strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence};
  missing:string; recorded:number; wrongPoints:boolean; leftLit?:boolean; scoreThis:()=>void; switchOn:boolean; operateSwitch:()=>void;
}
export function FaultPracticePanel(props:Props){
  const {doc,lesson,stage,worktop,readings,context}=props;
  const heading=useRef<HTMLHeadingElement>(null),lastStep=useRef(stage),hadTools=useRef(Boolean(context));
  useLayoutEffect(()=>{
    const toolsOpen=Boolean(context),changed=lastStep.current!==stage;
    if(changed||hadTools.current!==toolsOpen)heading.current?.closest('.learn-column')?.scrollTo({top:0,behavior:'instant'});
    if(changed||hadTools.current&&!toolsOpen)heading.current?.focus({preventScroll:true});
    lastStep.current=stage;hadTools.current=toolsOpen;
  },[stage,context]);
  const out=describeEndpoint(doc,worktopFaultPoints.switchOutput.a)?.terminalLabel;
  const switchPoint=out && !['OUT','Output','Switched output'].includes(out)?'terminal '+out+' on the right switch':'the output of the right switch';
  const reverse=readings.strip&&readings.strip.a?.terminal==='N';
  const moveProbe=reverse?'Leave red on the strip’s − pad. Move black to ':'Leave black on the strip’s − pad. Move red to ';
  const instruction=stage==='measure'?(worktop?(!props.switchOn?'Switch the right worktop light on before testing.':readings.strip&&readings.switchOutput?'Check that the driver has power, then take both readings again.':readings.strip?moveProbe+switchPoint+'.':'Put red on the right strip’s + pad and black on its − pad.'):'Take two readings to find the fault.') :
    stage==='diagnose'?'What do your readings point to?':stage==='repair'?'Repair the fault you found.':stage==='retest'?'Test the repaired circuit.':'The repair passed.';
  const score=props.scored?' · '+faultScore(props.hints)+'/100':'';
  const choices=worktop?kitchenFaultChoices:faultChoices;
  return <section className="active-task house-call fault-practice" data-fault-stage={stage} data-house-tools={context?true:undefined} aria-label="Fault practice">
    <div className="task-topline"><span>{worktop?worktopFaultTitle:'Fault practice'}</span><b>{stage==='done'?'Complete'+score:({measure:'Measure',diagnose:'Find the fault',repair:'Repair',retest:'Retest'})[stage]}</b></div>
    <div className="house-job-heading"><h3 ref={heading} tabIndex={-1} aria-live="polite">{instruction}</h3>
      {context&&<Button variant="ghost" size="sm" onClick={props.closeTools}>Back to fault</Button>}
    </div>
    {stage==='measure'&&<p>{worktop?(readings.strip?'Record the voltage at the switch with the other probe still on the strip.':props.leftLit?'The left strip lights. Check the dark one with the meter.':'Check the right strip with both worktop switches on.') : lesson.challenge.briefing}</p>}
    {!worktop&&stage==='measure'&&props.recorded>0&&<p role="status">{props.recorded===1?'One reading saved. Check a second pair of points.':props.recorded+' different readings saved.'}</p>}
    {worktop&&(readings.strip||readings.switchOutput)&&<dl className="call-readings" aria-label="Your fault readings">
      {readings.strip&&<div><dt>Across the right strip</dt><dd>{shownVolts(readings.strip)}</dd></div>}
      {readings.switchOutput&&<div><dt>Switch output to strip −</dt><dd>{shownVolts(readings.switchOutput)}</dd></div>}
    </dl>}
    {stage==='measure'&&props.wrongPoints&&<p className="task-feedback attention" role="status">{worktop?'That reading is saved. Use the two points named above for this check.':props.missing}</p>}
    {props.feedback&&stage!=='done'&&<p className="task-feedback" role="status">{props.feedback}</p>}
    {context}
    {!context&&<>
      {stage==='measure'&&<Button className="primary-button full" onClick={worktop&&!props.switchOn?props.operateSwitch:props.openMeter}>{worktop&&!props.switchOn?'Turn the right switch on':'Use the meter'}</Button>}
      {stage==='diagnose'&&<>
        {!worktop&&<p>{lesson.challenge.briefing}</p>}
        <label className="field-label">Your diagnosis
          <select aria-label="Your diagnosis" value={props.diagnosis} onChange={e=>props.setDiagnosis(e.target.value)}>
            <option value="">Choose the fault</option>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <Button className="primary-button full" disabled={!props.diagnosis||props.checking} onClick={props.submit}>{props.checking?'Checking…':'Check my diagnosis'}</Button>
      </>}
      {stage==='repair'&&<><p>{worktop&&readings.strip&&readings.switchOutput?'You read '+shownVolts(readings.switchOutput)+' at the switch output and '+shownVolts(readings.strip)+' across the strip. The break is in the wire between them.':lesson.challenge.answer}</p><Button className="primary-button full" onClick={props.repair}>Repair fault</Button></>}
      {stage==='retest'&&<><p>{props.failed?'The circuit still has a problem. Check the test report, then test again.':'The repair is in. Run the controls again to check it worked.'}</p><Button className="primary-button full" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button></>}
      {stage==='done'&&<><p>{worktop?'The repaired wire carries power from the right switch to the strip. The test worked both lights separately.':'You found the fault, repaired it and checked the circuit with a fresh test.'}</p><Button className="primary-button full" onClick={props.next}>Choose another job</Button></>}
      {stage==='done'||stage==='retest'&&props.failed?<Button variant="ghost" onClick={props.openReport}>See test report</Button>:null}
      {stage==='measure'||stage==='diagnose'?<details className="lesson-more-detail"><summary>Help{props.scored?' and score':''}</summary>
        {props.clue&&<p>{props.clue}</p>}
        {props.hints<3&&<Button variant="outline" onClick={props.showClue}>{props.hints?'Next clue':'Show a clue'}</Button>}
        {props.scored?<p>{faultScore(props.hints)} points available. Each clue uses 15 points.</p>:<Button variant="ghost" onClick={props.scoreThis}>Start a scored attempt</Button>}
        {stage==='diagnose'&&<Button variant="ghost" onClick={props.openMeter}>Check with the meter</Button>}
      </details>:null}
    </>}
  </section>;
}
