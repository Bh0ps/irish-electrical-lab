'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Cable, CheckCircle2, Eye, Gauge, Lightbulb, Power, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { getLessonActivities, evaluateActivity, type LessonActivity, type MeasurementEvidence } from '../../lib/learning';
import { activityCheckKey, getActivityStage, getLessonPrimaryAction, getStageProgress, groupLessonActivities, type LessonStageId } from '../../lib/lesson-stages';
import type { LearningRecord } from '../../lib/progress';
import type { CircuitDocument, ConfigurationLesson, SimulationResult } from '../../lib/types';
import type { BuildAssessment } from '../../lib/assessment';
import { COMPONENTS } from '../../lib/components';
import { evaluateGuidedWireAddition, type GuidedWireAddition } from '../../lib/guided-build';
import { bookLampVoltage, chapterFor, getCoursebookActivities, nextCourseId } from '../../lib/coursebook';
import { COURSE_PAGES } from '../../lib/coursebook-content';
import { electricalKey } from '../../lib/simulation-identity';

interface Props {
  lesson: ConfigurationLesson; document: CircuitDocument; result?: SimulationResult; selected?: string; selectedPart: string;
  record: LearningRecord; evidence: MeasurementEvidence[]; depth: 'foundation' | 'apprentice'; challengeStarted: boolean; mode: string;
  assessment?: BuildAssessment; diagnosisAccepted: boolean; challengeRepaired: boolean;
  onActivityChange: (activity: LessonActivity | undefined) => void; onTarget: (activity: LessonActivity) => void;
  onAttempt: (activity: LessonActivity, success: boolean) => void; onMeasure: (activity: LessonActivity) => void;
  onBuild: () => void; onTest: () => void; onChallenge: () => void; onStudied: () => void; onReference: (url: string) => void;
  onStageChange?: (stageId: LessonStageId) => void;
  onRecord?: () => void;
  wireAddition?: GuidedWireAddition;
  guidedSession?: string;
  context?: ReactNode;
  path?: 'coursebook' | 'full';
  initialActivityId?: string;
  onContinueLesson?: (id: number) => void;
  onOperateComponent?: (id: string) => void;
  onPulseSetting?:(id:string,parameter:'level'|'mix',value:number)=>void;
  onSetDimmerLevel?: (level: number) => void;
  onFullExercises?: () => void;
  manualInspection?: { component: string; part: string };
}
const stageIcons:Record<LessonStageId,LucideIcon>={look:Eye,predict:Lightbulb,build:Cable,try:Power,measure:Gauge,fix:Wrench};

export default function LearningPanel(props: Props) {
  const course = props.path === 'coursebook';
  const activities = useMemo(() => course ? getCoursebookActivities(props.lesson) : getLessonActivities(props.lesson), [props.lesson, course]);
  const stages = useMemo(() => groupLessonActivities(activities), [activities]);
  const [index, setIndex] = useState(() => Math.max(0, activities.findIndex(a => a.id === props.initialActivityId))), [answer, setAnswer] = useState(''), [feedback, setFeedback] = useState(''), [accepted, setAccepted] = useState(false);
  const [helpLevel, setHelpLevel] = useState(0);
  const taskHeading = useRef<HTMLHeadingElement>(null);
  const previousPointButton = useRef<HTMLElement | null>(null);
  const benchBaseline = useRef<{ activity: string; circuit: string; revision: number; rest: string } | undefined>(undefined);
  const claimedSwitch = useRef('');
  const [lowPower,setLowPower] = useState<{circuit:string;revision:number;graph:string;watts:number}>();
  const claimedComparison = useRef('');
  const [checkedState, setCheckedState] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const seenWireAddition = useRef(props.wireAddition?.sequence ?? 0);
  const currentDocument = useRef(props.document);
  const navigationSequence = useRef(0);
  const seenGuidedSession = useRef(props.guidedSession);
  const { wireAddition, guidedSession, document: documentState, mode: activityMode, onAttempt } = props;
  const activity = activities[Math.min(index, activities.length - 1)];
  useLayoutEffect(() => {
    const previous = previousPointButton.current;
    previousPointButton.current = null;
    if (previous && (!previous.isConnected || window.document.activeElement === window.document.body)) {
      taskHeading.current?.focus({preventScroll:true});
    }
  }, [activity?.id]);
  const stageId = activity ? getActivityStage(activity) : 'look';
  const stage = stages.find(candidate => candidate.id === stageId)!;
  const stateKey = activity ? activityCheckKey(props.document, activity) : '';
  const currentAccepted = accepted && checkedState === stateKey;
  const assessmentCurrent = props.assessment?.circuitId === props.document.id && props.assessment.revision === props.document.revision;
  const canRecord = typeof props.onRecord === 'function';
  const measurementRecorded = useMemo(() => canRecord && activity?.kind === 'measure'
    && evaluateActivity(activity, props.document, props.result, props.evidence).status === 'pass',
  [canRecord, activity, props.document, props.result, props.evidence]);
  const lampVoltage = bookLampVoltage(props.document, props.result);
  const switchClosed = props.document.components.find(c => c.id === 'switch')?.params.closed;
  const switchStep = activity?.bookStep === 'switch-on' || activity?.bookStep === 'switch-off';
  const startingClosed = activity?.bookStep === 'switch-off';
  const measuringDimmer = activity?.bookStep === 'dimmer';
  const dimmerLevel = Number(props.document.components.find(c => c.id === 'dimmer')?.params.level);
  const dimmerGraph = useMemo(() => !measuringDimmer ? '' : electricalKey({
    ...props.document,components:props.document.components.map(c=>c.id==='dimmer'?{...c,params:{...c.params,level:0}}:c),
  }),[measuringDimmer,props.document]);
  const dimmerWatts = props.result?.converged && props.result.revision===props.document.revision
    && props.document.supply.enabled ? props.result.componentPower.light : undefined;
  const low = lowPower?.circuit === props.document.id && lowPower.graph === dimmerGraph ? lowPower : undefined;
  useEffect(()=>{
    if (!measuringDimmer || dimmerWatts === undefined || !Number.isFinite(dimmerWatts) || dimmerWatts<=0) return;
    if (Math.abs(dimmerLevel-.25)<.001) {
      if (low?.revision!==props.document.revision) setLowPower({circuit:props.document.id,revision:props.document.revision,graph:dimmerGraph,watts:dimmerWatts});
    } else if (low && props.document.revision>low.revision && Math.abs(dimmerLevel-.9)<.001 && dimmerWatts>low.watts && claimedComparison.current!==stateKey) {
      claimedComparison.current=stateKey; onAttempt(activity,true); setAccepted(true);setCheckedState(stateKey);
      setFeedback(`Lamp power increased from ${low.watts.toFixed(1)} to ${dimmerWatts.toFixed(1)} watts.`);
    }
  },[measuringDimmer,dimmerWatts,dimmerLevel,low,props.document,dimmerGraph,stateKey,activity,onAttempt]);
  const circuitApartFromSwitch = useMemo(() => !switchStep ? '' : electricalKey({
    ...props.document, components: props.document.components.map(c => c.id === 'switch'
      ? {...c,params:{...c.params,closed:true}} : c),
  }), [switchStep, props.document]);
  useEffect(() => {
    if (!switchStep || lampVoltage === null || !props.document.supply.enabled) return;
    const atStart = startingClosed ? lampVoltage >= props.document.supply.voltage * .9 : lampVoltage <= 1;
    const atEnd = startingClosed ? lampVoltage <= 1 : lampVoltage >= props.document.supply.voltage * .9;
    if (atStart && switchClosed === startingClosed) {
      benchBaseline.current = {activity:activity.id,circuit:props.document.id,revision:props.document.revision,rest:circuitApartFromSwitch};
      return;
    }
    const baseline = benchBaseline.current;
    const key = [activity.id,props.document.id,props.document.revision].join('/');
    if (!atEnd || switchClosed === startingClosed || !baseline || baseline.activity !== activity.id ||
      baseline.circuit !== props.document.id || baseline.revision >= props.document.revision ||
      baseline.rest !== circuitApartFromSwitch || claimedSwitch.current === key) return;
    claimedSwitch.current = key;
    onAttempt(activity, true);
    setAccepted(true); setCheckedState(stateKey);
    setFeedback(startingClosed ? 'The lamp went dark.' : 'The lamp lit again.');
  }, [activity, switchStep, startingClosed, lampVoltage, switchClosed, props.document, circuitApartFromSwitch, onAttempt, stateKey]);
  const onActivityChange = props.onActivityChange, onStageChange = props.onStageChange;
  const stageChangeRef = useRef(onStageChange);
  useLayoutEffect(() => { stageChangeRef.current = onStageChange; }, [onStageChange]);
  useLayoutEffect(() => { currentDocument.current = props.document; }, [props.document]);
  useEffect(() => { onActivityChange(activity); }, [activity, onActivityChange]);
  useEffect(() => { stageChangeRef.current?.(stageId); }, [stageId]);
  useEffect(() => {
    if (!guidedSession || guidedSession === seenGuidedSession.current) return;
    seenGuidedSession.current = guidedSession;
    const firstConnection = activities.findIndex(candidate => candidate.kind === 'connect');
    if (firstConnection < 0) return;
    navigationSequence.current++;
    queueMicrotask(() => {
      if (currentDocument.current.id !== guidedSession) return;
      setIndex(firstConnection); setAnswer(''); setFeedback(''); setAccepted(false); setCheckedState(''); setConnectionNotice('');
    });
  }, [guidedSession, activities]);
  useEffect(() => {
    const addition = wireAddition;
    if (!addition || addition.sequence <= seenWireAddition.current) return;
    seenWireAddition.current = addition.sequence;
    const evaluated = evaluateGuidedWireAddition(activity, documentState, addition, activityMode);
    if (!evaluated) return;
    const navigation = navigationSequence.current;
    queueMicrotask(() => {
      if (navigationSequence.current !== navigation || currentDocument.current.id !== addition.circuitId || currentDocument.current.revision !== addition.revision) return;
      if (evaluated.status === 'pass') {
        onAttempt(activity, true);
        const focused = window.document.activeElement;
        previousPointButton.current = focused instanceof HTMLElement && focused.closest('.point-picker') ? focused : null;
        setIndex(previous => previous === index ? Math.min(previous + 1, activities.length - 1) : previous);
        setAnswer(''); setAccepted(false); setCheckedState('');setHelpLevel(0);
        setFeedback(''); setConnectionNotice('Connection checked.');
      } else {
        setConnectionNotice('');
        setFeedback(evaluated.explanation); setAccepted(false); setCheckedState('');
        if (evaluated.status === 'fail') onAttempt(activity, false);
      }
    });
  }, [wireAddition, documentState, activityMode, onAttempt, activity, index, activities.length]);

  function go(next: number) {
    navigationSequence.current++;
    setIndex(Math.max(0, Math.min(next, activities.length - 1)));
    setAnswer(''); setFeedback(''); setAccepted(false); setCheckedState('');
    setConnectionNotice(''); setHelpLevel(0); benchBaseline.current = undefined;
  }
  function goToStage(id: LessonStageId) {
    const next = activities.findIndex(candidate => getActivityStage(candidate) === id);
    if (next >= 0) go(next);
  }
  function verify() {
    if (!activity || currentAccepted) return;
    setConnectionNotice('');
    if (activity.kind === 'inspect' && activity.component && props.selected !== activity.component) {
      setFeedback('Select the highlighted equipment first, then inspect its purpose.'); return;
    }
    if (activity.kind === 'connect' && props.mode !== 'build') {
      setFeedback('Start the guided build to practise making this connection.'); return;
    }
    if (activity.kind === 'repair' && (!props.challengeStarted || !props.diagnosisAccepted || !props.challengeRepaired)) {
      setFeedback('Record the fault measurements, have your diagnosis checked, then repair the defect using the fault controls.'); return;
    }
    const deliberate = props.manualInspection;
    const inspected = deliberate ? [`${deliberate.component}.${deliberate.part}`] : [];
    const selectedEquipment = props.document.components.find(component => component.id === deliberate?.component);
    if (selectedEquipment && COMPONENTS[selectedEquipment.type]?.terminals.some(terminal => terminal.id === deliberate?.part)) inspected.push(`${selectedEquipment.id}.terminals`);
    const evaluated = evaluateActivity(activity, props.document, props.result, props.evidence, answer, {
      inspected, assessment: props.assessment, challengeStarted: props.challengeStarted,
      diagnosisAccepted: props.diagnosisAccepted, repairVerified: props.challengeRepaired,
    });
    const success = evaluated.status === 'pass';
    setFeedback(evaluated.explanation); setAccepted(success); setCheckedState(stateKey);
    if (evaluated.status === 'pass' || evaluated.status === 'fail') props.onAttempt(activity, success);
  }
  if (!activity) return <p>No guided activity is available.</p>;

  const primaryAction = getLessonPrimaryAction(activity, { currentAccepted, mode: props.mode, challengeStarted: props.challengeStarted, assessmentCurrent, canRecord, measurementRecorded });
  const last = index >= activities.length - 1;
  const nextLesson = nextCourseId(props.lesson.id);
  const starterText = switchStep && !currentAccepted && (switchClosed === startingClosed
    ? (startingClosed ? 'Turn the light off' : 'Turn the light on')
    : (startingClosed ? 'Turn on to try again' : 'Turn off to try again'));
  const bookReading = activity.bookStep === 'intro' || activity.bookStep === 'contact' || activity.bookStep === 'meter-demo';
  const primaryLabel = activity.bookStep === 'finish' ? (nextLesson ? `Next: ${COURSE_PAGES[nextLesson].title}` : 'Return to the first chapter')
    : starterText || (measuringDimmer && !currentAccepted ? (low ? 'Set dimmer to 90%' : 'Set dimmer to 25%')
    : bookReading ? (activity.bookStep === 'intro' ? 'Try the circuit' : 'Continue')
    : primaryAction === 'next' ? (last ? 'Review lesson' : 'Next step')
    : primaryAction === 'build' ? 'Start guided build'
      : primaryAction === 'challenge' ? 'Start fault exercise'
        : primaryAction === 'test' ? 'Run operating tests'
          : primaryAction === 'record' ? 'Record reading'
          : activity.kind === 'predict' || activity.kind === 'explain' ? 'Check answer'
            : activity.kind === 'measure' ? 'Check recorded reading'
              : activity.kind === 'repair' ? 'Check repair'
                : activity.kind === 'retest' ? 'Check test result' : activity.kind === 'connect' ? 'Check connection' : 'Check this step');
  function primary() {
    if (activity.bookStep === 'finish') props.onContinueLesson?.(nextLesson ?? 7);
    else if (bookReading) go(index + 1);
    else if (starterText) props.onOperateComponent?.('switch');
    else if (measuringDimmer && !currentAccepted) props.onSetDimmerLevel?.(low ? .9 : .25);
    else if (primaryAction === 'next') go(last ? 0 : index + 1);
    else if (primaryAction === 'build') props.onBuild();
    else if (primaryAction === 'challenge') props.onChallenge();
    else if (primaryAction === 'test') props.onTest();
    else if (primaryAction === 'record') props.onRecord?.();
    else verify();
  }
  const savedAchievement = props.record.activityIds.includes(activity.id);
  const stageStep = stage.activities.findIndex(candidate => candidate.id === activity.id) + 1;
  const completed = activities.filter(candidate => props.record.activityIds.includes(candidate.id)).length;
  const visibleSections = props.lesson.sections.filter(section => !props.challengeStarted || props.diagnosisAccepted || !section.title.toLowerCase().includes('fault'));
  const clue = activity.kind === 'connect' ? 'Read the small marking beside each connection point. The two ends must match the names in this step.'
    : activity.kind === 'measure' ? 'Voltage compares two points. Choose the first probe, then the second one, and record the result.'
    : switchStep ? 'Look for the wall switch beside the lamp. You can also operate it using the labelled button.'
    : activity.kind === 'predict' ? 'Picture which equipment will change and which equipment can still get power.'
    : 'Focus on the one part that changes in this step. You can open the equipment list to find it by name.';
  const showHelp = () => {
    const next = Math.min(3,helpLevel + 1);
    setHelpLevel(next);
    if (next === 2 && (activity.component || activity.endpoints?.length)) props.onTarget(activity);
    if (next === 3 && activity.kind === 'measure') props.onMeasure(activity);
  };

  return <>
    {!course && <nav className="lesson-stage-nav" aria-label="Lesson stages">
      {stages.map((candidate, stageIndex) => {
        const progress = getStageProgress(candidate, props.record.activityIds);
        const demonstrated = progress.total > 0 && progress.demonstrated === progress.total;
        const StageIcon=demonstrated?CheckCircle2:stageIcons[candidate.id];
        return <button type="button" key={candidate.id} className={`lesson-stage-button${candidate.id === stageId ? ' active' : ''}${demonstrated ? ' complete' : ''}`}
          aria-current={candidate.id === stageId ? 'step' : undefined} disabled={!candidate.activities.length}
          aria-label={`${candidate.title}${demonstrated ? ' · demonstrated previously' : ''}`} data-lesson-stage={candidate.id} onClick={() => goToStage(candidate.id)}>
          <span aria-hidden="true" title={`${stageIndex+1}. ${candidate.title}`}><StageIcon size={12}/></span>{candidate.title}
        </button>;
      })}
    </nav>}
    <section className="active-task" aria-label="Active lesson activity" data-stage-id={stageId} data-activity-id={activity.id} data-activity-kind={activity.kind}>
      <div className="task-topline"><span>{course ? chapterFor(props.lesson.id).title : stage.title}</span><b>{course ? `${index + 1} / ${activities.length}` : `Step ${stageStep} of ${stage.activities.length}`}</b></div>
      <h3 ref={taskHeading} tabIndex={-1}>{activity.title}</h3><p className="task-instruction">{activity.instruction}</p>
      {!!activity.options?.length && <div className="prediction-options">{activity.options.map(option => <button type="button" key={option.id} aria-pressed={answer === option.id} className={answer === option.id ? 'chosen' : ''} onClick={() => { setAnswer(option.id); setAccepted(false); setFeedback(''); }}>{option.label}</button>)}</div>}
      {props.lesson.id>=65&&activity.kind==='operate'&&!!activity.expectedObservations?.length&&<ExtraLowVoltageReading lesson={props.lesson.id} activity={activity} doc={props.document} result={props.result} change={props.onPulseSetting}/>}
      {activity.bookStep === 'contact' && <ContactDiagram closed={switchClosed === true} onOperate={()=>props.onOperateComponent?.('switch')}/>}
      {measuringDimmer && <p className="meter-demo"><b>Lamp power</b><br/>25% · {low ? low.watts.toFixed(1)+' W' : 'Waiting for reading'}<br/>90% · {low && Math.abs(dimmerLevel-.9)<.001 && dimmerWatts!==undefined ? dimmerWatts.toFixed(1)+' W' : 'Waiting for reading'}</p>}
      {activity.bookStep === 'meter-demo' && <div className="meter-demo"><p><strong>L</strong> · lamp line &nbsp; ↔ &nbsp; <strong>N</strong> · lamp neutral</p>
        <output>{lampVoltage === null ? 'Reading unavailable' : `${lampVoltage.toLocaleString('en-IE',{maximumFractionDigits:1})} volts (V)`}</output>
        <p>{lampVoltage === null ? 'The simulator cannot compare these points in the current circuit. Check the connections.' : lampVoltage <= 1 ? 'These points are at about the same voltage.' : 'These points have a voltage difference.'}</p>
        <details><summary>Zero, OL and an unavailable reading</summary><p>Zero volts means the meter found no voltage difference between these points. In the resistance range, OL means it found an open path. An unavailable reading means the simulator could not establish a value.</p></details></div>}
      {props.context && (!course || !activity.bookStep) && <div className="lesson-context">{props.context}</div>}
      <Button onClick={primary} disabled={!!starterText && (lampVoltage === null || !props.document.supply.enabled)} className="primary-button full" data-learning-primary={primaryAction}>
        {primaryAction === 'next' ? <ArrowRight size={15} /> : <CheckCircle2 size={15} />}{primaryLabel}
      </Button>
      <div className="task-support-actions">
        {index > 0 && <Button onClick={() => go(index - 1)} variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button>}
        {activity.bookStep !== 'finish' && <Button variant="ghost" size="sm" onClick={showHelp}><Eye size={14}/>{helpLevel === 0 ? 'Help' : helpLevel === 1 ? 'Show me where' : 'Worked example'}</Button>}
        {activity.kind === 'predict' && !currentAccepted && <Button variant="link" size="sm" onClick={() => go(index+1)}>I’m not sure — let me try</Button>}
      </div>
      {helpLevel > 0 && <p className="task-feedback" role="status">{helpLevel === 1 ? clue : helpLevel === 2 ? (activity.component || activity.endpoints?.length ? 'Find the selected part on the bench or in the list.' : props.lesson.context) : activity.explanation}</p>}
      {connectionNotice && <div className="task-feedback success" role="status" data-guided-connection-checked>{connectionNotice}<span className="sr-only"> Next step: {activity.title}</span></div>}
      {feedback && <div className={`task-feedback ${currentAccepted ? 'success' : 'attention'}`} role="status">
        {accepted && !currentAccepted ? 'The circuit changed. Check this step again with its current state.' : feedback}
      </div>}
      {props.context && course && activity.bookStep && <div className="lesson-context">{props.context}</div>}
      {savedAchievement && !currentAccepted && <p className="task-saved-progress">Previously demonstrated. Check the current circuit to continue.</p>}
    </section>
    <details className="lesson-more-detail">
      <summary>More detail</summary>
      <p className="small-copy">{stage.description}{course?'':' You can revisit any stage.'}</p>
      {!course && !last && <Button variant="outline" size="sm" onClick={() => go(index + 1)}><ArrowRight size={14}/>Skip to the next step</Button>}
      {(currentAccepted || props.depth === 'apprentice' && !props.challengeStarted) && <details className="task-explanation"><summary><Lightbulb size={14} />Why this matters</summary><p>{activity.explanation}</p></details>}
      {(activity.kind === 'retest' || activity.kind === 'operate') && <Button variant="outline" size="sm" onClick={props.onTest}><Power size={14}/>Run operating tests again</Button>}
      {!course && <details className="activity-outline"><summary>All steps · {completed} of {activities.length} demonstrated previously</summary>
        {stages.map(candidate => <details className="lesson-stage-outline" key={candidate.id}>
          <summary>{candidate.title} · {candidate.activities.length} steps</summary>
          {candidate.activities.map((child, childIndex) => <button type="button" className={child.id === activity.id ? 'active' : ''} key={child.id} onClick={() => go(activities.findIndex(item => item.id === child.id))}>
            <span>{props.record.activityIds.includes(child.id) ? '✓' : childIndex + 1}</span>{child.title}
          </button>)}
        </details>)}
      </details>}
      {course && props.onFullExercises && <Button variant="outline" onClick={props.onFullExercises}>Open all six exercise stages</Button>}
      <details className="reference-notes"><summary>Lesson notes</summary>
        <p>{props.lesson.summary}</p><span className="context-tag">{props.lesson.tag}</span>
        {visibleSections.map(section => <details className="lesson-section" key={section.title}>
          <summary>{section.title}</summary><p>{section.beginner}</p>
          <details className="apprentice-detail"><summary>Apprentice explanation</summary><p className="apprentice-copy">{section.apprentice}</p></details>
        </details>)}
      </details>
      <div className="lesson-secondary-actions">
        {!course && <Button onClick={props.onBuild} variant="outline" className="full"><Cable size={14}/>Start a new guided build</Button>}
        <Button onClick={props.onStudied} variant="outline" className="full"><CheckCircle2 size={14}/>Mark reading as studied</Button>
        <p className="small-copy">Reading progress is separate from demonstrated builds and fault repairs.</p>
      </div>
      <details className="references"><summary>Sources and model limits</summary>{props.lesson.references.map(reference => <button type="button" key={reference.url} onClick={() => props.onReference(reference.url)}>{reference.title}</button>)}<p>This learning model does not certify a real installation.</p></details>
    </details>
  </>;
}

function ContactDiagram({closed,onOperate}:{closed:boolean;onOperate:()=>void}) {
  return <div className="contact-demonstration">
    <div className="contact-diagram" role="img" aria-label={closed ? 'The two metal contacts touch.' : 'The two metal contacts are apart.'}>
      <span className="contact-pin"/><span className={'contact-leaf'+(closed?' closed':'')}/><span className="contact-pin"/>
    </div>
    <p>{closed ? 'The contacts touch. The path is closed.' : 'There is a gap. The path is open.'}</p>
    <Button variant="outline" size="sm" onClick={onOperate}>Move the switch</Button>
  </div>;
}

function ExtraLowVoltageReading({lesson,activity,doc,result,change}:{lesson:number;activity:LessonActivity;doc:CircuitDocument;result?:SimulationResult;change?:Props['onPulseSetting']}){
  const item=doc.components.find(c=>c.id===activity.component);
  const fresh=result?.converged&&result.revision===doc.revision?result:undefined;
  const knob=lesson===68?'level':lesson===69?'mix':undefined;
  if(knob&&item?.type==='pwmcontrol'){
    const percent=Math.round(Number(item.params[knob]??.5)*100);
    const watts=(v:number)=>v.toLocaleString('en-IE',{maximumFractionDigits:1})+' W';
    const tape=fresh?.deviceStates.tape;
    return <div className="pulse-experiment">
      <label>{knob==='level'?'Brightness':'Cool channel share'} · {percent}%
        <input aria-label={knob==='level'?'Practice brightness':'Practice cool channel share'} type="range" min="0" max="100" step="1" value={percent} onChange={e=>change?.(item.id,knob,Number(e.target.value)/100)}/>
      </label>
      <output>{!fresh?'Waiting for the circuit':knob==='level'?'Strip power · '+watts(fresh.componentPower.strip??0):tape?'Warm · '+watts(Number(tape.warmWatts))+'   Cool · '+watts(Number(tape.coolWatts)):'Strip unavailable'}</output>
    </div>;
  }
  if(!fresh)return null;
  if(lesson===72)return <output className="elv-reading">Entrance call · {String(fresh.deviceStates.chime?.call??'Unavailable')}</output>;
  if(lesson===76&&fresh.deviceStates.actuator)return <output className="elv-reading">Valve position · {Math.round(fresh.deviceStates.actuator.level*100)}% open</output>;
  return null;
}
