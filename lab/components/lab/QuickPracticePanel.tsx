'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import { Button } from '../ui/button';
import {
  observeQuickPractice, prepareQuickPractice,
  type PracticeReading, type PracticeSequence, type QuickPracticeBaseline,
  type QuickPracticeExperiment, type QuickPracticeObservation,
} from '../../lib/quick-practice';
import type { CircuitDocument, SimulationResult } from '../../lib/types';

interface Props {
  experiment: QuickPracticeExperiment;
  document: CircuitDocument;
  result?: SimulationResult;
  simulationError?: string;
  onAttempt: (success: boolean) => void;
  onTarget: () => void;
  onTrace?: () => void;
  onRestart: () => void;
  onExit: () => void;
  onPromptChange?: (phase: 'predict' | 'operate' | 'compare', message: string) => void;
  context?: ReactNode;
}

function formatReading(reading: PracticeReading): string {
  if (typeof reading.value === 'string') return reading.value;
  return `${reading.value.toLocaleString('en-IE', { maximumFractionDigits: reading.unit === 'V' ? 1 : 2 })} ${reading.unit}`;
}

const EMPTY_SEQUENCE: PracticeSequence = {};
type Comparison = Extract<QuickPracticeObservation, { status: 'complete' }>;

export default function QuickPracticePanel(props: Props) {
  const { experiment, document, result, simulationError, onAttempt, onPromptChange } = props;
  const [answer, setAnswer] = useState('');
  const [baseline, setBaseline] = useState<QuickPracticeBaseline>();
  const [sequence, setSequence] = useState<PracticeSequence>(EMPTY_SEQUENCE);
  const [comparison, setComparison] = useState<Comparison>();
  const recorded = useRef(false);

  const start = useMemo(() => baseline ? undefined : prepareQuickPractice(experiment, document, result), [baseline, experiment, document, result]);
  const observation = useMemo(() => baseline && !comparison ? observeQuickPractice(experiment, baseline, sequence, document, result) : undefined,
    [baseline, comparison, experiment, sequence, document, result]);

  useEffect(() => {
    if (!observation || simulationError) return;
    if (observation.status === 'complete' && !recorded.current) {
      recorded.current = true;
      onAttempt(answer === experiment.answer);
      setComparison(observation);
    } else if (observation.sequence !== sequence) {
      setSequence(observation.sequence);
    }
  }, [answer, experiment.answer, observation, onAttempt, sequence, simulationError]);

  const correct = answer === experiment.answer;
  const message = simulationError ? 'The live reading is unavailable. Restart to check the circuit again.'
    : start && start.status !== 'ready' ? start.message
      : observation && observation.status !== 'complete' ? observation.message : '';
  const showRestart = !!comparison || !!simulationError || start?.status === 'unresolved' || observation?.status === 'unresolved';
  const statusClass = showRestart ? 'attention' : '';
  const phase = comparison ? 'compare' : baseline ? 'operate' : 'predict';
  const prompt = comparison ? 'Compare the readings from the bench.' : baseline ? experiment.instruction : experiment.question;
  useEffect(() => { onPromptChange?.(phase, prompt); }, [phase, prompt, onPromptChange]);

  return <section className="active-task quick-practice" aria-label="Quick practice" data-practice-id={experiment.id} data-practice-phase={phase}>
    <div className="task-topline"><span>Quick practice</span><b>{comparison ? '3 · Compare' : baseline ? '2 · Operate' : '1 · Predict'}</b></div>
    <h3>{experiment.title}</h3>
    {!baseline && <>
      <p className="task-instruction">{experiment.question}</p>
      <div className="prediction-options" aria-label="Choose your prediction">
        {experiment.options.map(option => <button type="button" key={option.id} aria-pressed={answer === option.id}
          className={answer === option.id ? 'chosen' : ''} onClick={() => setAnswer(option.id)}>{option.label}</button>)}
      </div>
      <Button className="primary-button full" disabled={!answer || start?.status !== 'ready' || !!simulationError}
        onClick={() => { if (start?.status === 'ready') setBaseline(start.baseline); }}>Lock in prediction</Button>
    </>}
    {baseline && !comparison && <>
      <p className="task-instruction">{experiment.instruction}</p>
      <Button variant="outline" size="sm" onClick={props.onTarget}><Eye size={14}/>Show me where</Button>
      {props.context && <div className="lesson-context">{props.context}</div>}
    </>}
    {message && <p className={`task-feedback ${statusClass}`} role="status">{message}</p>}
    {comparison && baseline && <div className="practice-result">
      <p className={`task-feedback ${correct ? 'success' : 'attention'}`} role="status">
        {correct ? 'Your prediction matches the reading.' : 'Your prediction differed from the reading.'} {experiment.explanation}
      </p>
      {comparison.revision !== document.revision && <p className="small-copy">These readings are from your completed comparison.</p>}
      <table className="practice-comparison">
        <thead><tr><th scope="col">Reading</th><th scope="col">Before</th>{comparison.sequence.during && <th scope="col">Run-on</th>}<th scope="col">After</th></tr></thead>
        <tbody>{comparison.readings.map((reading, index) => <tr key={reading.label}>
          <th scope="row">{reading.label}</th><td>{formatReading(baseline.readings[index])}</td>
          {comparison.sequence.during && <td>{formatReading(comparison.sequence.during[index])}</td>}
          <td>{formatReading(reading)}</td>
        </tr>)}</tbody>
      </table>
      {experiment.trace && props.onTrace && <Button variant="outline" size="sm" onClick={props.onTrace}>Trace path</Button>}
    </div>}
    <div className="task-support-actions">
      <Button variant="ghost" size="sm" onClick={props.onExit}><ArrowLeft size={14} />Back to lesson</Button>
      {showRestart && <Button variant="ghost" size="sm" onClick={props.onRestart}>{comparison ? 'Try again' : 'Restart experiment'}</Button>}
    </div>
  </section>;
}
