'use client';
import type { BuildAssessment, AssessmentCheck } from '../../lib/assessment';
import { findingPriority, nextCheckForFinding } from '../../lib/build-hints';

const statusLabel = { pass: 'PASS', fail: 'FAIL', 'not-run': 'NOT RUN', unresolved: 'UNRESOLVED' };

function sampleChecks(passed: AssessmentCheck[]) {
  // These are the two voltage checks at the lamp, with the same probe points.
  const lamp = ['scenario:7:0:1','scenario:7:1:1'].map(id => passed.find(c=>c.id===id));
  if (lamp[0] && lamp[1]) return [lamp[0],lamp[1]];
  const steps = passed.filter(c => /^scenario:\d+:\d+:\d+$/.test(c.id));
  if (!steps.length) return [];
  const first = steps[0], firstStep = first.id.slice(0,first.id.lastIndexOf(':')+1);
  const next = steps.find(c => c.component===first.component && !c.id.startsWith(firstStep));
  return next ? [first,next] : [first];
}

export default function TestReport({assessment, running, stale, onSelect, recordedAt}:{
  assessment?:BuildAssessment; running:boolean; stale:boolean; onSelect:(check:AssessmentCheck)=>void; recordedAt?:number;
}) {
  if (running) return <section className="finding info" role="status"><b>Testing your circuit…</b></section>;
  if (!assessment) return <section className="finding info"><b>Ready to test</b><p>Choose Test circuit to check your wiring.</p></section>;
  const passed = assessment.checks.filter(check=>check.status==='pass');
  const findings = assessment.checks.filter(check=>check.status!=='pass').sort((a,b)=>findingPriority(a)-findingPriority(b));
  const examples = assessment.passed && !stale ? sampleChecks(passed) : [];
  const lampComparison = examples[0]?.id==='scenario:7:0:1' && examples.length===2 && examples.every(c=>c.reading?.unit==='V');
  const first = findings.find(check=>check.id!=='scenario:unassigned');
  const setup = first?.id==='setup:wiring';
  const canFind = (check:AssessmentCheck)=>Boolean(check.component||check.wire);
  return <section className="findings-group" aria-label="Circuit test report" aria-live="polite">
    <h3>{stale?'Circuit changed. Test it again.':assessment.summary}</h3>
    {!stale && first && <section className={'finding '+(first.status==='fail'?'warning':'info')} aria-label="First test finding">
      <b>{setup?first.title:statusLabel[first.status]+' · '+first.title}</b><p>{first.explanation}</p>
      {!setup&&<p>{nextCheckForFinding(first)}</p>}
      {canFind(first)&&<button type="button" className="quiet-button" onClick={()=>onSelect(first)}>Show on bench</button>}
    </section>}
    {!first && examples.length>0 && <section className="test-observations" aria-label="What the circuit did">
      <h4>{lampComparison?'Voltage across the lamp':'What the circuit did'}</h4>
      {lampComparison ? <dl className="switch-readings">{examples.map((check,i)=><div key={check.id}>
        <dt>{i===0?'Switch off':'Switch on'}</dt><dd>{Number(check.reading!.value.toPrecision(4))} V</dd>
      </div>)}</dl> : examples.map(check=><p key={check.id}><strong>{check.title}</strong><br/>{check.explanation}</p>)}
      <small>The test tried these settings on a copy of your circuit.</small>
    </section>}
    {!stale && !first && !examples.length && <p>Open All checks to see what the bench tested.</p>}
    {(!setup || stale) && <details className="all-test-checks"><summary>{stale?'Previous result':'All checks'} ({assessment.checks.length})</summary>
      <p className="small-copy">{passed.length} passed checks{recordedAt?' · '+new Date(recordedAt).toLocaleString('en-IE'):''}</p>
      {[...findings,...passed].map(check=><div key={check.id} className={'finding '+(check.status==='fail'?'warning':'info')}>
        <b>{statusLabel[check.status]} · {check.title}</b><p>{check.explanation}</p>
        {canFind(check)&&!stale&&<button type="button" className="quiet-button" onClick={()=>onSelect(check)}>Show on bench</button>}
      </div>)}
    </details>}
  </section>;
}
