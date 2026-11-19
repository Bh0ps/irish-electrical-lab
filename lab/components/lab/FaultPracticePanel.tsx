import type {BellReadings} from '../../lib/bell-fault';
import {chimeMark} from '../../lib/house-calls';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { CircuitDocument, ConfigurationLesson } from '../../lib/types';
import { describeEndpoint } from '../../lib/endpoint-description';
import type { MeasurementEvidence } from '../../lib/learning';
import { measurementPoints } from '../../lib/measurement-points';
import { faultScore, kitchenFaultChoices, lessonFaultChoices, shownVolts, type FaultStage } from '../../lib/fault-practice';
import { worktopFaultPoints } from '../../lib/worktop-fault';
import { heaterFeed, heaterFeedMark, heaterProbeTip, type HeaterReadings, type HeaterRun } from '../../lib/heater-fault';
import { Button } from '../ui/button';
import HeaterFlexChoice,{type FlexLanding} from './HeaterFlexChoice';

interface Props {
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

function worktopOutput(doc:CircuitDocument){
  const mark=describeEndpoint(doc,worktopFaultPoints.switchOutput.a)?.terminalLabel;
  return mark&&!['OUT','Output','Switched output'].includes(mark)?'terminal '+mark:'the output';
}

function measurePrompt(props:Props) {
  if(props.bell){
    if(props.doc.components.find(c=>c.id==='front')?.params.pressed)return 'Let go of the front button before checking the back door.';
    if(!props.doc.components.find(c=>c.id==='back')?.params.pressed)return 'Hold the back doorbell button.';
    const common=chimeMark(props.doc,'AC2');
    if(!props.bell.call)return 'At the hall chime, measure '+chimeMark(props.doc,'REAR')+' to '+common+' with the back button held.';
    if(props.bell.push)return 'Check that the bench supply is on and take both readings again.';
    const reverse=props.bell.call.a?.terminal==='AC2';
    const pin=props.doc.components.find(c=>c.id==='back')?.variant==='sesame'?'the lower screw':'NO';
    return 'Leave '+(reverse?'red':'black')+' on '+common+'. On the virtual bench, move '+(reverse?'black':'red')+' to '+pin+' on the back button.';
  }
  if(props.heater){
    if(!props.switchOn)return 'Turn the heater on at the wall.';
    if(!props.heater.heater)return 'On the bench, check L to N at the heater.';
    if(props.heater.output)return 'Check the bench supply and wall switch, then measure again.';
    const reverse=props.heater.heater.a?.terminal==='N';
    return 'Leave '+(reverse?'red':'black')+' on heater N. Move '+(reverse?'black':'red')+' to '+heaterFeedMark(props.doc)+'.';
  }
  if (!props.worktop) {
    if (props.wrongPoints && props.missing) return props.missing;
    if (props.samples.length===1) return 'One reading saved. Check a second pair of points.';
    return props.context ? 'Record two readings to find the fault.' : props.lesson.challenge.briefing;
  }
  if (!props.switchOn) return 'Turn on the right worktop switch.';
  const {strip,switchOutput}=props.readings;
  if (strip && switchOutput) return 'Check the driver supply, then take both readings again.';
  if (!strip) return 'Touch red to + and black to − on the right strip.';
  const reverse=strip.a?.terminal==='N';
  return 'Keep '+(reverse?'red':'black')+' on the strip’s − pad. Move '+(reverse?'black':'red')+' to '+worktopOutput(props.doc)+' on the right switch.';
}

function readingValue(sample:MeasurementEvidence) {
  if (sample.mode==='voltage') return shownVolts(sample);
  if (sample.status==='open') return 'OL · open circuit';
  const number=sample.instrument?.displayed ?? sample.value?.toLocaleString('en-IE',{maximumSignificantDigits:3});
  return number===undefined ? 'No reading' : number+' '+sample.unit+(sample.instrument?.signal?' '+sample.instrument.signal:'');
}

function bellProbeTip(doc:CircuitDocument,sample:MeasurementEvidence,rows:BellReadings){
  const points=[sample.a,sample.b];
  const value=readingValue(sample)+'. ';
  const common=points.findIndex(p=>p?.component==='chime'&&p.terminal==='AC2');
  if(common<0)return value+'Put one probe on '+chimeMark(doc,'AC2')+' at the chime and leave it there.';
  const moving=common===0?'black':'red';
  if(rows.call){
    const button=doc.components.find(c=>c.id==='back'),mark=button?.variant==='sesame'?'bottom screw':'NO';
    return value+'Move '+moving+' to the '+mark+' on the back button. That’s the wire going back to the hall.';
  }
  const pin=points[1-common];
  if(pin?.component==='chime'&&pin.terminal==='FRONT')return value+'That’s the front door. Move '+moving+' to '+chimeMark(doc,'REAR')+' for the back door.';
  return value+'Move '+moving+' to '+chimeMark(doc,'REAR')+' to check the back call.';
}

function worktopProbeTip(doc:CircuitDocument,sample:MeasurementEvidence,strip?:MeasurementEvidence){
  if(sample.mode!=='voltage'||sample.instrument&&sample.instrument.method!=='probe-voltage')return 'Use the meter’s two voltage probes to compare these points.';
  if(sample.instrument?.held)return 'Turn Hold off and record what the probes are touching now.';
  if(sample.assisted)return 'Place both probes yourself, then record what the meter shows.';
  const pair=[sample.a,sample.b];
  if(!strip){
    if(pair.every(p=>p?.component==='left'))return 'That’s the left strip. Try the + and − pads on the right strip.';
    return 'Start at the right strip. Put one probe on + and the other on −.';
  }
  const common=pair.findIndex(p=>p?.component==='right'&&p.terminal==='N');
  if(common<0)return 'Put '+(strip.a?.terminal==='N'?'red':'black')+' back on the − pad of the right strip. Both checks use that same pad.';
  const moving=common===0?'black':'red',other=pair[1-common];
  if(other?.component==='right-switch'&&other.terminal==='COM'){
    const mark=describeEndpoint(doc,other)?.terminalLabel;
    return (mark?'That’s the feed from the driver at '+mark+'. ':'That’s the feed from the driver. ')+'Move '+moving+' to '+worktopOutput(doc)+' to check the wire going to the strip.';
  }
  return 'Keep the probe on the right strip’s − pad. Move '+moving+' to '+worktopOutput(doc)+' on the right switch.';
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
  const instrumentOpen=Boolean(context);
  const hasWorktopReading=Boolean(readings.strip||readings.switchOutput);
  return <section className="active-task house-call fault-practice" data-fault-stage={stage} data-house-tools={instrumentOpen||undefined} aria-label="Fault practice">
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
    {stage==='measure'&&(worktop||props.heater||props.bell)&&props.wrongPoints&&<p className="task-feedback attention" role="status">{props.bell&&props.wrongSample?bellProbeTip(props.doc,props.wrongSample,props.bell):
      worktop&&props.wrongSample?worktopProbeTip(props.doc,props.wrongSample,readings.strip):
      props.heater&&props.wrongSample?heaterProbeTip(props.doc,props.wrongSample,props.heater):'Reading saved. For this check, use the points named above.'}</p>}
    {props.feedback&&stage!=='done'&&<p className="task-feedback" role="status">{props.feedback}</p>}
    {stage==='diagnose'&&!instrumentOpen&&<FaultReadings {...props}/>}
    {!instrumentOpen&&<>
      {stage==='measure'&&<Button className="primary-button full" onClick={doorAction?.run??((worktop||props.heater)&&!props.switchOn?props.operateSwitch:props.openMeter)}>{doorAction?.label??(props.bell?(props.bell.call?'Check the back button':'Check the chime'):props.heater?(props.switchOn?'Use the bench meter':'Turn heater switch on'):worktop&&!props.switchOn?'Turn the right switch on':'Use the meter')}</Button>}
      {stage==='diagnose'&&<>
        <label className="field-label"><span className="sr-only">Your diagnosis</span>
          <select aria-label="Your diagnosis" value={props.diagnosis} onChange={e=>props.setDiagnosis(e.target.value)}>
            <option value="">Choose the fault</option>{choices.map(([id,label])=><option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <Button className="primary-button full" disabled={!props.diagnosis||props.checking} onClick={props.submit}>{props.checking?'Checking…':'Check my diagnosis'}</Button>
      </>}
      {stage==='repair'&&<><p>{worktop?'You found voltage at the switch and none across the strip. Turn the simulated supply off before opening the fitting.':lesson.challenge.answer}</p>
        {props.flexLanding&&!props.findRepair&&!props.isolateForRepair?<HeaterFlexChoice landing={props.flexLanding}/>:
          <Button className="primary-button full" onClick={props.findRepair??props.isolateForRepair?.run??props.repair}>
            {props.findRepair?'Find repair on site':props.isolateForRepair?.label??'Repair fault'}</Button>}</>}
      {stage==='retest'&&props.heaterRunAction&&<p role="status">{props.heaterRunAction.reading}</p>}
      {stage==='retest'&&worktop&&props.worktopStatus&&<p role="status">{props.worktopStatus}</p>}
      {stage==='retest'&&!props.restoreSupply&&!props.heaterRunAction&&props.heater&&props.heaterRun?.runningAfter!==undefined&&<p>Switch off · {Math.round(props.heaterRun.stopped)} W. Switch on · {Math.round(props.heaterRun.runningAfter)} W.</p>}
      {stage==='retest'&&(props.restoreSupply?<Button className="primary-button full" onClick={props.restoreSupply}>Turn bench supply on</Button>:props.heaterRunAction?<Button className="primary-button full" disabled={props.heaterRunAction.disabled} onClick={props.heaterRunAction.run}>{props.heaterRunAction.label}</Button>:props.failed?<><Button className="primary-button full" onClick={props.openReport}>See test report</Button>
        <Button variant="ghost" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button></>
        :<Button className="primary-button full" disabled={props.testing} onClick={props.test}>{props.testing?'Testing…':'Test the repair'}</Button>)}
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
