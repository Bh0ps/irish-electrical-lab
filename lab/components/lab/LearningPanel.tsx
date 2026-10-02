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
}
const stageIcons:Record<LessonStageId,LucideIcon>={look:Eye,predict:Lightbulb,build:Cable,try:Power,measure:Gauge,fix:Wrench};

export default function LearningPanel(props: Props) {
  const activities = useMemo(() => getLessonActivities(props.lesson), [props.lesson]);
  const stages = useMemo(() => groupLessonActivities(activities), [activities]);
  const [index, setIndex] = useState(0), [answer, setAnswer] = useState(''), [feedback, setFeedback] = useState(''), [accepted, setAccepted] = useState(false);
  const [checkedState, setCheckedState] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');
  const seenWireAddition = useRef(props.wireAddition?.sequence ?? 0);
  const currentDocument = useRef(props.document);
  const navigationSequence = useRef(0);
  const seenGuidedSession = useRef(props.guidedSession);
  const { wireAddition, guidedSession, document: documentState, mode: activityMode, onAttempt } = props;
  const activity = activities[Math.min(index, activities.length - 1)];
  const stageId = activity ? getActivityStage(activity) : 'look';
  const stage = stages.find(candidate => candidate.id === stageId)!;
  const stateKey = activity ? activityCheckKey(props.document, activity) : '';
  const currentAccepted = accepted && checkedState === stateKey;
  const assessmentCurrent = props.assessment?.circuitId === props.document.id && props.assessment.revision === props.document.revision;
  const canRecord = typeof props.onRecord === 'function';
  const measurementRecorded = useMemo(() => canRecord && activity?.kind === 'measure'
    && evaluateActivity(activity, props.document, props.result, props.evidence).status === 'pass',
  [canRecord, activity, props.document, props.result, props.evidence]);
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
        setIndex(previous => previous === index ? Math.min(previous + 1, activities.length - 1) : previous);
        setAnswer(''); setAccepted(false); setCheckedState('');
        setFeedback(''); setConnectionNotice('Connection checked. Continue with the next step.');
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
    setConnectionNotice('');
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
    const inspected = props.selected ? [`${props.selected}.${props.selectedPart}`] : [];
    const selectedEquipment = props.document.components.find(component => component.id === props.selected);
    if (selectedEquipment && COMPONENTS[selectedEquipment.type]?.terminals.some(terminal => terminal.id === props.selectedPart)) inspected.push(`${props.selected}.terminals`);
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
  const primaryLabel = primaryAction === 'next' ? (last ? 'Review lesson' : 'Next step')
    : primaryAction === 'build' ? 'Start guided build'
      : primaryAction === 'challenge' ? 'Start fault exercise'
        : primaryAction === 'test' ? 'Run operating tests'
          : primaryAction === 'record' ? 'Record reading'
          : activity.kind === 'predict' || activity.kind === 'explain' ? 'Check answer'
            : activity.kind === 'measure' ? 'Check recorded reading'
              : activity.kind === 'repair' ? 'Check repair'
                : activity.kind === 'retest' ? 'Check test result' : activity.kind === 'connect' ? 'Check connection' : 'Check this step';
  function primary() {
    if (primaryAction === 'next') go(last ? 0 : index + 1);
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

  return <>
    <div className="lesson-heading"><span className="section-label">GUIDED PRACTICE</span></div>
    <nav className="lesson-stage-nav" aria-label="Lesson stages">
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
    </nav>
    <section className="active-task" aria-label="Active lesson activity" data-stage-id={stageId} data-activity-id={activity.id} data-activity-kind={activity.kind}>
      <div className="task-topline"><span>{stage.title}</span><b>Step {stageStep} of {stage.activities.length}</b></div>
      <h3>{activity.title}</h3><p className="task-instruction">{activity.instruction}</p>
      {!!activity.options?.length && <div className="prediction-options">{activity.options.map(option => <button type="button" key={option.id} aria-pressed={answer === option.id} className={answer === option.id ? 'chosen' : ''} onClick={() => { setAnswer(option.id); setAccepted(false); setFeedback(''); }}>{option.label}</button>)}</div>}
      <div className="task-support-actions">
        <Button onClick={() => go(index - 1)} disabled={index === 0} variant="ghost" size="sm"><ArrowLeft size={14} />Back</Button>
        {(activity.component || activity.endpoints?.length) && <Button variant="ghost" size="sm" onClick={() => props.onTarget(activity)}><Eye size={14} />Show me where</Button>}
        {activity.kind === 'measure' && <Button onClick={() => props.onMeasure(activity)} variant="link" size="sm"><Gauge size={14}/>Set up reading</Button>}
      </div>
      {props.context && <div className="lesson-context">{props.context}</div>}
      <Button onClick={primary} className="primary-button full" data-learning-primary={primaryAction}>
        {primaryAction === 'next' ? <ArrowRight size={15} /> : <CheckCircle2 size={15} />}{primaryLabel}
      </Button>
      {connectionNotice && <div className="task-feedback success" role="status" data-guided-connection-checked>{connectionNotice}</div>}
      {feedback && <div className={`task-feedback ${currentAccepted ? 'success' : 'attention'}`} role="status">
        {accepted && !currentAccepted ? 'The circuit changed. Check this step again with its current state.' : feedback}
      </div>}
      {savedAchievement && !currentAccepted && <p className="task-saved-progress">Previously demonstrated. Check the current circuit to continue.</p>}
    </section>
    <details className="lesson-more-detail">
      <summary>More detail</summary>
      <p className="small-copy">{stage.description} You can jump to any stage or try a different step. Moving ahead does not mark it as demonstrated.</p>
      {!last && <Button variant="outline" size="sm" onClick={() => go(index + 1)}><ArrowRight size={14}/>Skip to the next step</Button>}
      {(currentAccepted || props.depth === 'apprentice' && !props.challengeStarted) && <details className="task-explanation"><summary><Lightbulb size={14} />Why this matters</summary><p>{activity.explanation}</p></details>}
      {(activity.kind === 'retest' || activity.kind === 'operate') && <Button variant="outline" size="sm" onClick={props.onTest}><Power size={14}/>Run operating tests again</Button>}
      <details className="activity-outline"><summary>All steps · {completed} of {activities.length} demonstrated previously</summary>
        {stages.map(candidate => <details className="lesson-stage-outline" key={candidate.id}>
          <summary>{candidate.title} · {candidate.activities.length} steps</summary>
          {candidate.activities.map((child, childIndex) => <button type="button" className={child.id === activity.id ? 'active' : ''} key={child.id} onClick={() => go(activities.findIndex(item => item.id === child.id))}>
            <span>{props.record.activityIds.includes(child.id) ? '✓' : childIndex + 1}</span>{child.title}
          </button>)}
        </details>)}
      </details>
      <details className="reference-notes"><summary>Lesson notes</summary>
        <p>{props.lesson.summary}</p><span className="context-tag">{props.lesson.tag}</span>
        {visibleSections.map(section => <details className="lesson-section" key={section.title}>
          <summary>{section.title}</summary><p>{section.beginner}</p>
          <details className="apprentice-detail"><summary>Apprentice explanation</summary><p className="apprentice-copy">{section.apprentice}</p></details>
        </details>)}
      </details>
      <div className="lesson-secondary-actions">
        <Button onClick={props.onBuild} variant="outline" className="full"><Cable size={14}/>Start a new guided build</Button>
        <Button onClick={props.onStudied} variant="outline" className="full"><CheckCircle2 size={14}/>Mark reading as studied</Button>
        <p className="small-copy">Reading progress is separate from demonstrated builds and fault repairs.</p>
      </div>
      <details className="references"><summary>Sources and model limits</summary>{props.lesson.references.map(reference => <button type="button" key={reference.url} onClick={() => props.onReference(reference.url)}>{reference.title}</button>)}<p>This learning model does not certify a real installation.</p></details>
    </details>
  </>;
}
