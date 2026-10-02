'use client';
import type { BuildAssessment, AssessmentCheck } from '../../lib/assessment';
import { findingPriority, nextCheckForFinding } from '../../lib/build-hints';

export default function TestReport({assessment, running, stale, onSelect, recordedAt}:{assessment?:BuildAssessment; running:boolean; stale:boolean; onSelect:(check:AssessmentCheck)=>void; recordedAt?:number}) {
  if (running) return <section className="finding info" role="status" aria-live="polite"><b>Testing your circuit…</b><p>Checking actual connections, protective findings and lesson objectives.</p></section>;
  if (!assessment) return <section className="finding info"><b>Ready to test</b><p>Run test shows a lasting pass/fail report here. A working lamp alone does not prove the connections are correct.</p></section>;
  const failed = assessment.checks.filter(c=>c.status==='fail');
  const passed = assessment.checks.filter(c=>c.status==='pass');
  const pending = assessment.checks.filter(c=>c.status==='not-run'||c.status==='unresolved');
  const findings = assessment.checks.filter(c=>c.status!=='pass').slice().sort((a,b)=>findingPriority(a)-findingPriority(b));
  const first = findings[0];
  const status = (c:AssessmentCheck) => c.status==='fail'?'FAIL':c.status==='pass'?'PASS':c.status==='not-run'?'NOT RUN':'UNRESOLVED';
  const item = (c:AssessmentCheck) => <button key={c.id} className={'finding '+(c.status==='fail'?'warning':'info')} onClick={()=>onSelect(c)} disabled={stale} style={{width:'100%',textAlign:'left'}}><b>{status(c)} · {c.title}</b><p>{c.explanation}</p></button>;
  return <section className="findings-group" aria-label="Circuit test report" aria-live="polite">
    <p className="small-copy">Last completed test{recordedAt?` · ${new Date(recordedAt).toLocaleString('en-IE')}`:''}</p>
    <h3>{stale?'Circuit changed — run test again':assessment.summary}</h3>
    {stale?<p>The report below belongs to the previous edit and does not assess the current circuit.</p>:<p>{passed.length} passed · {failed.length} failed{pending.length?` · ${pending.length} pending`:''} · operation, protective paths and lesson objectives checked separately.</p>}
    {first&&<section className={'finding '+(first.status==='fail'?'warning':'info')} aria-label="First test finding">
      <b>{status(first)} · {first.title}</b><p>{first.explanation}</p>
      <p><strong>Next check:</strong> {stale?'Run the test again before using this earlier finding to assess the current circuit.':nextCheckForFinding(first)}</p>
      {(first.component||first.wire)&&<button type="button" className="quiet-button" onClick={()=>onSelect(first)} disabled={stale}>Show on bench</button>}
    </section>}
    <details className="all-test-checks"><summary>All checks ({assessment.checks.length}) · {passed.length} passed checks</summary>
      {findings.map(item)}{passed.map(item)}
    </details>
  </section>;
}
