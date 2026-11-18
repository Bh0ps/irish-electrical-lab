'use client';
import type { BuildAssessment, AssessmentCheck } from '../../lib/assessment';
import { findingPriority, nextCheckForFinding } from '../../lib/build-hints';

const statusLabel = { pass: 'PASS', fail: 'FAIL', 'not-run': 'NOT RUN', unresolved: 'UNRESOLVED' };

export default function TestReport({assessment, running, stale, onSelect, recordedAt}:{
  assessment?:BuildAssessment; running:boolean; stale:boolean; onSelect:(check:AssessmentCheck)=>void; recordedAt?:number;
}) {
  if (running) return <section className="finding info" role="status"><b>Testing your circuit…</b></section>;
  if (!assessment) return <section className="finding info"><b>Ready to test</b><p>Choose Test circuit to check your wiring.</p></section>;
  const passed = assessment.checks.filter(check=>check.status==='pass');
  const findings = assessment.checks.filter(check=>check.status!=='pass').sort((a,b)=>findingPriority(a)-findingPriority(b));
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
    {!stale && !first && <p>Open the checks below to see what was tested.</p>}
    {(!setup || stale) && <details className="all-test-checks"><summary>{stale?'Previous result':'All checks'} ({assessment.checks.length})</summary>
      <p className="small-copy">{passed.length} passed checks{recordedAt?' · '+new Date(recordedAt).toLocaleString('en-IE'):''}</p>
      {[...findings,...passed].map(check=><div key={check.id} className={'finding '+(check.status==='fail'?'warning':'info')}>
        <b>{statusLabel[check.status]} · {check.title}</b><p>{check.explanation}</p>
        {canFind(check)&&!stale&&<button type="button" className="quiet-button" onClick={()=>onSelect(check)}>Show on bench</button>}
      </div>)}
    </details>}
  </section>;
}
