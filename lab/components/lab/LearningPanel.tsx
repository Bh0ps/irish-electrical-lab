'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Cable, CheckCircle2, Eye, Gauge, Lightbulb, Power, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { TermsInThisStep } from './TermsInThisStep';
import { getLessonActivities, evaluateActivity, wireMarking, type LessonActivity, type MeasurementEvidence } from '../../lib/learning';
import { activityCheckKey, getActivityStage, getLessonPrimaryAction, getStageProgress, groupLessonActivities, type LessonStageId } from '../../lib/lesson-stages';
import type { LearningRecord } from '../../lib/progress';
import type { CircuitDocument, ConfigurationLesson, SimulationResult } from '../../lib/types';
import type { BuildAssessment } from '../../lib/assessment';
import { COMPONENTS, definitionFor } from '../../lib/components';
import { evaluateGuidedWireAddition, type GuidedWireAddition } from '../../lib/guided-build';
import { bookLampVoltage, chapterFor, getCoursebookActivities, nextCourseId } from '../../lib/coursebook';
import { COURSE_PAGES } from '../../lib/coursebook-content';
import { electricalKey } from '../../lib/simulation-identity';
import { checkSwitchPress, lessonSwitch, type LessonControlPress } from '../../lib/lesson-control';
import { describeEndpoint } from '../../lib/build-hints';

interface Props {
  onWorktopFault?:()=>void; onHeaterFault?:()=>void; onStairJob?:()=>void;
  lesson: ConfigurationLesson; document: CircuitDocument; result?: SimulationResult; selected?: string; selectedPart: string;
  record: LearningRecord; evidence: MeasurementEvidence[]; depth: 'foundation' | 'apprentice'; challengeStarted: boolean; mode: string;
  assessment?: BuildAssessment; diagnosisAccepted: boolean; challengeRepaired: boolean;
  onActivityChange: (activity: LessonActivity | undefined) => void; onTarget: (activity: LessonActivity) => void;
  onAttempt: (activity: LessonActivity, success: boolean) => void; onMeasure: (activity: LessonActivity) => void;
  onBuild: () => void; onTest: () => void; onChallenge: () => void; onStudied: () => void; onReference: (url: string) => void;
  onStageChange?: (stageId: LessonStageId, putToolsAway: boolean) => void;
  onRecord?: () => void;
  voltageMeter?: {open:boolean; ready:boolean; show:()=>void};
  wireAddition?: GuidedWireAddition;
  onUndoWire?: (addition: GuidedWireAddition) => boolean;
  wallSwitchPress?: {circuitId:string;revision:number};
  lessonControlPress?: LessonControlPress;
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
  const focusNextTask = useRef(false);
  const previousPointButton = useRef<HTMLElement | null>(null);
  const benchBaseline = useRef<{ activity: string; circuit: string; revision: number; rest: string } | undefined>(undefined);
  const claimedSwitch = useRef('');
  const [lowPower,setLowPower] = useState<{circuit:string;revision:number;graph:string;watts:number}>();
  const claimedComparison = useRef('');
  const [checkedState, setCheckedState] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const [wireToUndo, setWireToUndo] = useState<GuidedWireAddition>();
  const seenWireAddition = useRef(props.wireAddition?.sequence ?? 0);
  const currentDocument = useRef(props.document);
  const navigationSequence = useRef(0);
  const seenGuidedSession = useRef(props.guidedSession);
  const { wireAddition, guidedSession, document: documentState, mode: activityMode, onAttempt } = props;
  const activity = activities[Math.min(index, activities.length - 1)];
  useLayoutEffect(() => {
    const previous = previousPointButton.current;
    previousPointButton.current = null;
    if (focusNextTask.current || (previous && (!previous.isConnected || window.document.activeElement === window.document.body))) {
      focusNextTask.current = false;
      taskHeading.current?.focus({preventScroll:true});
      taskHeading.current?.closest('.learn-column')?.scrollTo({ top: 0 });
    }
  }, [activity?.id]);
  const stageId = activity ? getActivityStage(activity) : 'look';
  const stage = stages.find(candidate => candidate.id === stageId)!;
  const stateKey = activity ? activityCheckKey(props.document, activity) : '';
  const currentAccepted = accepted && checkedState === stateKey;
  const namedSwitch = useMemo(()=>props.onOperateComponent ? lessonSwitch(activity,props.document) : undefined,[activity,props.document,props.onOperateComponent]);
  const switchCheck = useMemo(()=>namedSwitch ? checkSwitchPress(activity,props.lessonControlPress,props.document,props.result) : undefined,
    [namedSwitch,activity,props.lessonControlPress,props.document,props.result]);
  const seenPress = useRef('');
  useEffect(()=>{
    if (switchCheck?.status !== 'pass' || seenPress.current === stateKey) return;
    seenPress.current = stateKey;
    onAttempt(activity,true);
    setCheckedState(stateKey); setAccepted(true); setFeedback(switchCheck.explanation);
  },[switchCheck,stateKey,activity,onAttempt]);
  const assessmentCurrent = props.assessment?.circuitId === props.document.id && props.assessment.revision === props.document.revision;
  const canRecord = typeof props.onRecord === 'function';
  const measurementRecorded = useMemo(() => canRecord && activity?.kind === 'measure'
    && evaluateActivity(activity, props.document, props.result, props.evidence).status === 'pass',
  [canRecord, activity, props.document, props.result, props.evidence]);
  // Only a reading recorded during this step can advance its primary action
  // automatically. Earlier evidence stays available for an explicit check.
  const previousReadings = useRef({ key: stateKey, evidence: props.evidence });
  useEffect(() => {
    const previous = previousReadings.current;
    previousReadings.current = { key: stateKey, evidence: props.evidence };
    if (activity?.kind !== 'measure' || currentAccepted || previous.key !== stateKey || previous.evidence === props.evidence) return;
    const seen = new Set(previous.evidence.map(reading => reading.id));
    const added = props.evidence.filter(reading => !seen.has(reading.id));
    if (!added.length) return;
    const checked = evaluateActivity(activity, props.document, props.result, added);
    if (checked.status === 'pass') {
      onAttempt(activity, true);
      setAccepted(true);
      setCheckedState(stateKey);
    }
    setFeedback(checked.explanation);
  }, [activity, currentAccepted, onAttempt, props.document, props.evidence, props.result, stateKey]);
  const lampVoltage = bookLampVoltage(props.document, props.result);
  const lampReadingPending = !props.result || props.result.revision !== props.document.revision;
  const wallSwitch = props.document.components.find(c => c.id === 'switch' && c.type === 'switch');
  const switchClosed = wallSwitch && Boolean(wallSwitch.params.closed ?? COMPONENTS.switch.defaults.closed);
  const switchStep = activity?.bookStep === 'switch-on' || activity?.bookStep === 'switch-off';
  const lampMeterStep = activity?.bookStep === 'meter-demo';
  const tryPredictionAtLamp = course && activity?.kind === 'predict' && activities[index+1]?.bookStep === 'meter-demo';
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
  const circuitApartFromSwitch = useMemo(() => !switchStep && !lampMeterStep ? '' : electricalKey({
    ...props.document, components: props.document.components.map(c => c.id === 'switch'
      ? {...c,params:{...c.params,closed:true}} : c),
  }), [switchStep, lampMeterStep, props.document]);
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
    if (props.wallSwitchPress?.circuitId!==props.document.id || props.wallSwitchPress.revision!==props.document.revision ||
      !atEnd || switchClosed === startingClosed || !baseline || baseline.activity !== activity.id ||
      baseline.circuit !== props.document.id || baseline.revision >= props.document.revision ||
      baseline.rest !== circuitApartFromSwitch || claimedSwitch.current === key) return;
    claimedSwitch.current = key;
    onAttempt(activity, true);
    setAccepted(true); setCheckedState(stateKey);
    setFeedback(startingClosed ? 'The lamp went dark.' : 'The lamp lit again.');
  }, [activity, switchStep, startingClosed, lampVoltage, switchClosed, props.document, props.wallSwitchPress, circuitApartFromSwitch, onAttempt, stateKey]);
  const onActivityChange = props.onActivityChange, onStageChange = props.onStageChange;
  const stageChangeRef = useRef(onStageChange);
  useLayoutEffect(() => { stageChangeRef.current = onStageChange; }, [onStageChange]);
  useLayoutEffect(() => { currentDocument.current = props.document; }, [props.document]);
  useEffect(() => { onActivityChange(activity); }, [activity, onActivityChange]);
  const putToolsAway = course && (activity?.kind === 'explain' || activity?.bookStep === 'finish');
  useEffect(() => { stageChangeRef.current?.(stageId,putToolsAway); }, [stageId,putToolsAway]);
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
    const evaluated = evaluateGuidedWireAddition(activity, documentState, addition, activityMode, props.lesson.circuit);
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
        setWireToUndo(undefined);
      } else {
        setConnectionNotice('');
        setWireToUndo(addition);
        setFeedback(evaluated.explanation); setAccepted(false); setCheckedState('');
        if (evaluated.status === 'fail') onAttempt(activity, false);
      }
    });
  }, [wireAddition, documentState, activityMode, onAttempt, activity, index, activities.length, props.lesson.circuit]);

  function go(next: number) {
    navigationSequence.current++;
    focusNextTask.current = true;
    setIndex(Math.max(0, Math.min(next, activities.length - 1)));
    setAnswer(''); setFeedback(''); setAccepted(false); setCheckedState('');
    setConnectionNotice(''); setWireToUndo(undefined); setHelpLevel(0); benchBaseline.current = undefined;
  }
  function goToStage(id: LessonStageId) {
    const next = activities.findIndex(candidate => getActivityStage(candidate) === id);
    if (next >= 0) go(next);
  }
  function verify() {
    if (!activity || currentAccepted) return;
    setWireToUndo(undefined);
    setConnectionNotice('');
    if (activity.kind === 'inspect' && activity.component && props.selected !== activity.component) {
      setFeedback('Pick '+(props.document.components.find(c=>c.id===activity.component)?.label ?? 'the fitting')+' on the bench or in the equipment list.'); return;
    }
    if (activity.kind === 'connect' && props.mode !== 'build') {
      setFeedback('Start the guided build to practise making this connection.'); return;
    }
    if (activity.kind === 'repair' && (!props.challengeStarted || !props.diagnosisAccepted || !props.challengeRepaired)) {
      setFeedback('Take the meter readings first. Check where you think the fault is, then use Repair.'); return;
    }
    const deliberate = props.manualInspection;
    const inspected = deliberate ? [`${deliberate.component}.${deliberate.part}`] : [];
    const selectedEquipment = props.document.components.find(component => component.id === deliberate?.component);
    if (selectedEquipment && definitionFor(selectedEquipment).terminals.some(terminal => terminal.id === deliberate?.part)) inspected.push(`${selectedEquipment.id}.terminals`);
    const evaluated = evaluateActivity(activity, props.document, props.result, props.evidence, answer, {
      inspected, assessment: props.assessment, challengeStarted: props.challengeStarted,
      diagnosisAccepted: props.diagnosisAccepted, repairVerified: props.challengeRepaired,
    });
    const success = evaluated.status === 'pass';
    const question = activity.kind === 'predict' || activity.kind === 'explain';
    setFeedback(question && tryPredictionAtLamp && evaluated.status === 'fail'
      ? 'Leave the probes on the lamp and try the switch. Watch the volts.'
      : evaluated.explanation);
    setAccepted(success); setCheckedState(stateKey);
    if (evaluated.status === 'pass' || evaluated.status === 'fail') props.onAttempt(activity, success);
  }
  if (!activity) return <p>No guided activity is available.</p>;

  const primaryAction = namedSwitch && !currentAccepted ? 'operate' : getLessonPrimaryAction(activity, { currentAccepted, mode: props.mode, challengeStarted: props.challengeStarted, assessmentCurrent, canRecord, measurementRecorded });
  const voltageMeter=activity.measurement?.mode==='voltage' ? props.voltageMeter : undefined;
  const showMeter=primaryAction==='record' && voltageMeter && !voltageMeter.open;
  const atRequestedPosition = namedSwitch && Object.entries(activity.expectedParams ?? {}).every(([k,v])=>namedSwitch.params[k]===v);
  const switchAction = namedSwitch?.type==='selector' ? 'Turn the selector' : namedSwitch && ['mcb','rcbo'].includes(namedSwitch.type) ? 'Move the breaker handle' :
    namedSwitch && ['isolator','isolator3'].includes(namedSwitch.type) ? 'Move the handle' : 'Press the switch';
  const switchTripped = namedSwitch && props.result?.revision===props.document.revision && props.result.deviceStates[namedSwitch.id]?.tripped;
  const last = index >= activities.length - 1;
  const nextLesson = nextCourseId(props.lesson.id);
  const starterText = switchStep && !currentAccepted && (switchClosed === startingClosed
    ? (startingClosed ? 'Turn the light off' : 'Turn the light on')
    : (startingClosed ? 'Turn on to try again' : 'Turn off to try again'));
  const bookReading = activity.bookStep === 'intro' || activity.bookStep === 'contact' || activity.bookStep === 'meter-demo';
  const question = activity.kind === 'predict' || activity.kind === 'explain';
  const stepWire = activity.kind==='connect' ? props.lesson.circuit.wires.find(w=>w.id===activity.wire) : undefined;
  const ends = stepWire && [stepWire.from,stepWire.to].map(e=>describeEndpoint(props.document,e));
  const namedEnds = ends?.length===2&&ends.every(e=>!!e);
  const taskTitle = switchStep ? (startingClosed ? 'Switch the hall light off' : 'Switch the hall light back on') : namedEnds && stepWire ? 'Connect the '+wireMarking[stepWire.role]+' wire' : question ? activity.instruction : activity.title;
  const stepNumber = course ? index + 1 : stage.activities.findIndex(candidate => candidate.id === activity.id) + 1;
  const stepCount = course ? activities.length : stage.activities.length;
  const primaryLabel = activity.bookStep === 'finish' ? (nextLesson ? `Next: ${COURSE_PAGES[nextLesson].title}` : 'Return to the first chapter')
    : starterText || (measuringDimmer && !currentAccepted ? (low ? 'Set dimmer to 90%' : 'Set dimmer to 25%')
    : bookReading ? (activity.bookStep === 'intro' ? 'Try the circuit' : lampMeterStep ? 'Try the probes yourself' : 'Continue')
    : primaryAction === 'operate' ? (atRequestedPosition ? 'Move the switch back' : switchAction)
    : primaryAction === 'next' ? (last ? 'Review lesson' : 'Next step')
    : primaryAction === 'build' ? 'Start guided build'
      : primaryAction === 'challenge' ? 'Start fault exercise'
        : primaryAction === 'test' ? 'Test circuit'
          : primaryAction === 'record' ? (showMeter?'Open meter':'Record reading')
          : activity.kind === 'predict' || activity.kind === 'explain' ? 'Check answer'
            : activity.kind === 'measure' ? 'Check recorded reading'
              : activity.kind === 'repair' ? 'Check repair'
                : activity.kind === 'retest' ? 'Check test result' : activity.kind === 'connect' ? 'Check connection' : activity.kind === 'inspect' ? 'Check my choice' : activity.kind === 'operate' ? 'Check the circuit now' : 'Check this step');
  function primary() {
    if (activity.bookStep === 'finish') props.onContinueLesson?.(nextLesson ?? 7);
    else if (bookReading) go(index + 1);
    else if (starterText) props.onOperateComponent?.('switch');
    else if (measuringDimmer && !currentAccepted) props.onSetDimmerLevel?.(low ? .9 : .25);
    else if (primaryAction === 'operate' && namedSwitch) props.onOperateComponent?.(namedSwitch.id);
    else if (primaryAction === 'next') go(last ? 0 : index + 1);
    else if (primaryAction === 'build') props.onBuild();
    else if (primaryAction === 'challenge') props.onChallenge();
    else if (primaryAction === 'test') props.onTest();
    else if (showMeter) voltageMeter.show();
    else if (primaryAction === 'record') props.onRecord?.();
    else verify();
  }
  const savedAchievement = props.record.activityIds.includes(activity.id);
  const completed = activities.filter(candidate => props.record.activityIds.includes(candidate.id)).length;
  const visibleSections = props.lesson.sections.filter(section => !props.challengeStarted || props.diagnosisAccepted || !section.title.toLowerCase().includes('fault'));
  const targetName = props.document.components.find(component => component.id === activity.component)?.label;
  const canLocate = Boolean(targetName || activity.endpoints?.length);
  const clue = activity.kind === 'connect' ? 'Find the first fitting. Look for the letters beside the terminal, or choose that marking from the list.'
    : activity.measurement?.mode === 'current' ? 'Choose one wire. The meter shows how many amps are flowing through it.'
    : activity.measurement?.mode === 'resistance' ? 'Switch off all supplies on the bench, including batteries. Put one probe on each end of the wire.'
    : activity.measurement?.mode === 'voltage' ? 'Choose a terminal for each probe. The number on the meter is the voltage between those two points.'
    : switchStep ? 'Press the white wall switch below the lamp, or use the on/off button here.'
    : activity.clue ? activity.clue
    : activity.kind === 'predict' ? 'You can try the circuit first if you’re unsure.'
    : activity.kind === 'explain' ? 'Think back to which control you moved and what changed on the bench.'
    : activity.kind === 'repair' ? 'Read the fault report. Use the meter to check the fitting that stopped working.'
    : activity.kind === 'retest' ? 'Run Test circuit again to check your repair.'
    : targetName ? `Look for ${targetName} in the equipment list.`
    : 'Use the equipment list to find a part by its name.';
  const showHelp = () => {
    const next = helpLevel === 1 && !canLocate ? 3 : Math.min(3,helpLevel + 1);
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
          aria-label={`${candidate.title}${demonstrated ? ' · completed before' : ''}`} data-lesson-stage={candidate.id} onClick={() => goToStage(candidate.id)}>
          <span aria-hidden="true" title={`${stageIndex+1}. ${candidate.title}`}><StageIcon size={12}/></span>{candidate.title}
        </button>;
      })}
    </nav>}
    <section className="active-task" aria-label="Active lesson activity" data-stage-id={stageId} data-activity-id={activity.id} data-activity-kind={activity.kind} data-reading-step={activity.bookStep}>
      <div className="task-topline"><span>{course ? chapterFor(props.lesson.id).title : stage.title}</span><b>Step {stepNumber} of {stepCount}</b></div>
      <progress className="course-position" aria-label={course ? 'Position in this lesson' : `Position in the ${stage.title} stage`} value={stepNumber} max={stepCount}/>
      <h3 id="current-task-title" ref={taskHeading} tabIndex={-1}>{taskTitle}</h3>
      {namedEnds&&stepWire?<div className="wiring-step">
        <p>With all supplies off, join these two terminals.</p>
        <ul aria-label="Terminals to connect">{ends.map(end=><li key={end!.endpoint.component+'.'+end!.endpoint.terminal}><b>{end!.pointLabel}</b><span>{end!.equipmentName}</span></li>)}</ul>
        {stepWire.resistance>.1&&<p>This length of wire adds {stepWire.resistance} Ω.</p>}
      </div>:!question && !switchStep && activity.instruction !== taskTitle+'.' && <p className="task-instruction">{activity.instruction}</p>}
      {switchStep && !currentAccepted && !props.document.supply.enabled && <p className="task-feedback attention" role="status">Switch the bench supply on to try the lamp.</p>}
      {switchStep && !currentAccepted && props.document.supply.enabled && lampVoltage === null && <p className="task-feedback" role="status">{lampReadingPending ? 'Waiting for a reading across the lamp.' : 'The meter can’t get a reading across the lamp. Test the circuit and check its line and neutral.'}</p>}
      {namedSwitch && !currentAccepted && <div role="status" className="small-copy">{switchTripped ? 'The breaker has tripped. Test the circuit and fix the fault before you reset it.' : switchCheck && switchCheck.status !== 'pass' ? switchCheck.explanation :
        !props.document.supply.enabled ? 'Turn on the bench supply to try this step.' : atRequestedPosition ? 'It’s already in that position. Move it back, then try the step.' : null}</div>}
      {!!activity.options?.length && <div className="prediction-options" role="group" aria-labelledby="current-task-title">{activity.options.map(option => <button type="button" key={option.id} aria-pressed={answer === option.id} className={answer === option.id ? 'chosen' : ''} onClick={() => { if (answer !== option.id) { setAnswer(option.id); setAccepted(false); setFeedback(''); } }}>{option.label}</button>)}</div>}
      {props.lesson.id>=65&&activity.kind==='operate'&&!!activity.expectedObservations?.length&&<ExtraLowVoltageReading lesson={props.lesson.id} activity={activity} doc={props.document} result={props.result} change={props.onPulseSetting}/>}
      {activity.bookStep === 'contact' && <ContactDiagram closed={switchClosed === true} lampLit={lampVoltage===null ? undefined : props.result?.deviceStates.light?.energized} onOperate={()=>props.onOperateComponent?.('switch')}/>}
      {measuringDimmer && <p className="meter-demo"><b>Lamp power</b><br/>25% · {low ? low.watts.toFixed(1)+' W' : 'Waiting for reading'}<br/>90% · {low && Math.abs(dimmerLevel-.9)<.001 && dimmerWatts!==undefined ? dimmerWatts.toFixed(1)+' W' : 'Waiting for reading'}</p>}
      {lampMeterStep && <LampMeterDemo key={circuitApartFromSwitch} volts={lampVoltage} pending={lampReadingPending}
        switchOn={switchClosed} supplyOn={props.document.supply.enabled}
        onOperate={() => props.onOperateComponent?.('switch')}/>}
      {connectionNotice && <div className="task-feedback success" role="status" data-guided-connection-checked>{connectionNotice}<span className="sr-only"> Next step: {activity.title}</span></div>}
      {props.context && voltageMeter?.open && <div className="lesson-context">{props.context}</div>}
      {feedback && (!namedSwitch || currentAccepted) && (!wireToUndo || wireToUndo.circuitId===props.document.id && wireToUndo.revision===props.document.revision) && <div className={`task-feedback ${currentAccepted ? 'success' : 'attention'}`} role="status">
        {accepted && !currentAccepted ? 'The circuit has changed. Check this step again.' : feedback}
        {wireToUndo?.circuitId===props.document.id && props.onUndoWire && <Button variant="outline" size="sm" onClick={()=>{
          if(!props.onUndoWire?.(wireToUndo))return;
          setWireToUndo(undefined);setFeedback('Wire removed. Try the connection again.');
          taskHeading.current?.focus({preventScroll:true});
        }}>Undo this wire</Button>}
      </div>}
      {props.context && !voltageMeter?.open && (!course || !activity.bookStep) && <div className="lesson-context">{props.context}</div>}
      <Button onClick={primary} disabled={primaryAction==='record' && voltageMeter?.open && !voltageMeter.ready || question && !answer || !!starterText && (lampVoltage === null || !props.document.supply.enabled) || primaryAction === 'operate' && (lampReadingPending || !props.document.supply.enabled || switchTripped)} className="primary-button full" data-learning-primary={primaryAction}>
        {primaryLabel}{primaryAction === 'next' || bookReading ? <ArrowRight size={15} aria-hidden="true"/> : null}
      </Button>
      <div className="task-support-actions">
        {index > 0 && <Button onClick={() => go(index - 1)} variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button>}
        {namedSwitch && !currentAccepted && <Button onClick={()=>props.onTarget(activity)} variant="ghost" size="sm"><Eye size={14}/>Find the switch</Button>}
        {activity.bookStep !== 'finish' && <Button variant="ghost" size="sm" onClick={helpLevel === 3 ? () => setHelpLevel(0) : showHelp}><Eye size={14}/>{helpLevel === 0 ? 'Help' : helpLevel === 1 && canLocate ? 'Show me where' : helpLevel < 3 ? 'Worked example' : 'Hide help'}</Button>}
        {activity.kind === 'predict' && !currentAccepted && <Button variant="link" size="sm" onClick={() => go(index+1)}>{tryPredictionAtLamp && feedback ? 'Try it on the meter' : 'I’m not sure — let me try'}</Button>}
      </div>
      {helpLevel > 0 && <p className="task-feedback" role="status">{helpLevel === 1 ? clue : helpLevel === 2 ? (targetName ? `Look for the highlighted part on ${targetName}.` : 'Look for the highlighted terminal.') : activity.explanation}</p>}
      <TermsInThisStep key={activity.id} text={[activity.title, activity.instruction, ...(activity.options ?? []).map(option=>option.label), feedback, helpLevel===1?clue:helpLevel===3?activity.explanation:''].join(' ')}/>
      {props.context && course && activity.bookStep && <div className="lesson-context">{props.context}</div>}
      {savedAchievement && !currentAccepted && <p className="task-saved-progress">Completed on an earlier try.</p>}
    </section>
    <details className="lesson-more-detail">
      <summary>More detail</summary>
      <p className="small-copy">{stage.description}{course?'':' You can go back to any step.'}</p>
      {!course && !last && <Button variant="outline" size="sm" onClick={() => go(index + 1)}><ArrowRight size={14}/>Skip to the next step</Button>}
      {(currentAccepted || props.depth === 'apprentice' && !props.challengeStarted) && <details className="task-explanation"><summary><Lightbulb size={14} />What happened?</summary><p>{activity.explanation}</p></details>}
      {(activity.kind === 'retest' || activity.kind === 'operate') && <Button variant="outline" size="sm" onClick={props.onTest}><Power size={14}/>Test the controls again</Button>}
      {!course && <details className="activity-outline"><summary>All steps · {completed} of {activities.length} completed before</summary>
        {stages.map(candidate => <details className="lesson-stage-outline" key={candidate.id}>
          <summary>{candidate.title} · {candidate.activities.length} steps</summary>
          {candidate.activities.map((child, childIndex) => <button type="button" className={child.id === activity.id ? 'active' : ''} key={child.id} onClick={() => go(activities.findIndex(item => item.id === child.id))}>
            <span>{props.record.activityIds.includes(child.id) ? '✓' : childIndex + 1}</span>{child.title}
          </button>)}
        </details>)}
      </details>}
      {course&&props.onStairJob&&<Button variant="outline" onClick={props.onStairJob}>Try both stair switches</Button>}
      {course&&(props.onWorktopFault?<Button variant="outline" onClick={props.onWorktopFault}>One worktop stays dark</Button>:props.onHeaterFault?<Button variant="outline" onClick={props.onHeaterFault}>The heater stays cold</Button>:<Button variant="outline" onClick={props.onChallenge}>Try a fault on this circuit</Button>)}
      {course && props.onFullExercises && <Button variant="outline" onClick={props.onFullExercises}>Open all six exercise stages</Button>}
      <details className="reference-notes"><summary>Lesson notes</summary>
        <p>{props.lesson.summary}</p><span className="context-tag">{props.lesson.tag}</span>
        {visibleSections.map(section => <details className="lesson-section" key={section.title}>
          <summary>{section.title}</summary><p>{section.beginner}</p>
          <details className="apprentice-detail"><summary>How it works</summary><p className="apprentice-copy">{section.apprentice}</p></details>
        </details>)}
      </details>
      <div className="lesson-secondary-actions">
        {!course && <Button onClick={props.onBuild} variant="outline" className="full"><Cable size={14}/>Start a new guided build</Button>}
        <Button onClick={props.onStudied} variant="outline" className="full"><CheckCircle2 size={14}/>Mark as read</Button>
      </div>
      <details className="references"><summary>Sources and model limits</summary>{props.lesson.references.map(reference => <button type="button" key={reference.url} onClick={() => props.onReference(reference.url)}>{reference.title}</button>)}<p>The checks in this lesson apply to the circuit on your bench.</p></details>
    </details>
  </>;
}

function LampMeterDemo({volts,pending,switchOn,supplyOn,onOperate}:{
  volts:number|null;pending:boolean;switchOn?:boolean;supplyOn:boolean;onOperate:()=>void;
}) {
  const [before,setBefore] = useState<{on:boolean;volts:number}>();
  const showVolts = (value:number) => value.toLocaleString('en-IE',{maximumFractionDigits:0});
  const compare = before && before.on !== switchOn && volts !== null;
  function pressSwitch() {
    if (switchOn === undefined) return;
    if (volts !== null) setBefore({on:switchOn,volts});
    onOperate();
  }
  return <div className="meter-demo lamp-meter">
    <p className="lamp-probe-key"><span>Red probe · <strong>L</strong> (line)</span><span>Black probe · <strong>N</strong> (neutral)</span></p>
    <div className="lamp-meter-result" aria-live="polite">
      {switchOn !== undefined && <span>Switch {switchOn ? 'on' : 'off'}</span>}
      <output>{volts === null ? pending ? 'Waiting for the meter' : 'Reading unavailable' : `${showVolts(volts)} volts (V)`}</output>
      {compare && <small>Switch {before.on ? 'on' : 'off'} was {showVolts(before.volts)} V.</small>}
    </div>
    {switchOn !== undefined && <Button variant="outline" size="sm" onClick={pressSwitch}>Turn the switch {switchOn ? 'off' : 'on'}</Button>}
    {!supplyOn ? <p>The bench supply is off.</p> : !pending && volts === null && <p>Check that both lamp terminals have a connection to the circuit.</p>}
    <details><summary>What does the reading mean?</summary><p>0 V means there’s no voltage difference between these two probe tips. It doesn’t prove the fitting is safe to touch. On the ohms setting, OL means the path is broken or the resistance is too high to read. If the bench can’t work out a voltage, it shows “Reading unavailable”.</p></details>
  </div>;
}

function ContactDiagram({closed,lampLit,onOperate}:{closed:boolean;lampLit?:boolean;onOperate:()=>void}) {
  return <div className="contact-demonstration contact-row">
    <div className="contact-diagram" role="img" aria-label={closed ? 'The two metal contacts touch.' : 'The two metal contacts are apart.'}>
      <span className="contact-pin"/><span className={'contact-leaf'+(closed?' closed':'')}/><span className="contact-pin"/>
    </div>
    <p role="status">{closed ? 'Contacts touching.' : 'Contacts apart.'} {lampLit===undefined ? '' : lampLit ? 'Lamp on.' : 'Lamp off.'}</p>
    <Button variant="outline" size="sm" onClick={onOperate}>Press the switch</Button>
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
      <label>{knob==='level'?'Brightness':'Cool LEDs in the mix'} · {percent}%
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
