'use client';
import type { BuildAssessment, AssessmentCheck } from '../../lib/assessment';
import { findingPriority, nextCheckForFinding } from '../../lib/build-hints';

const statusLabel = { pass: 'PASS', fail: 'FAIL', 'not-run': 'NOT RUN', unresolved: 'No result' };

function sampleChecks(passed: AssessmentCheck[]) {
  const steps = passed.filter(c => /^scenario:\d+:\d+:\d+$/.test(c.id));
  if (!steps.length) return [];
  const first = steps[0], firstStep = first.id.slice(0,first.id.lastIndexOf(':')+1);
  const next = steps.find(c => c.component===first.component && !c.id.startsWith(firstStep));
  return next ? [first,next] : [first];
}

function LampReadings({off,on}:{off:AssessmentCheck;on:AssessmentCheck}) {
  return <><dl className="switch-readings">{[off,on].map((check,i)=><div key={check.id}>
    <dt>{i===0?'Switch off':'Switch on'}</dt>
    <dd>{check.status!=='unresolved'&&check.reading?.unit==='V'?Number(check.reading.value.toPrecision(4))+' V':'No reading'}</dd>
  </div>)}</dl><small>The test tried both positions on a copy of your wiring.</small></>;
}

export default function TestReport({assessment, running, stale, onSelect, recordedAt, undoWire}:{
  assessment?:BuildAssessment; running:boolean; stale:boolean; onSelect:(check:AssessmentCheck)=>void; recordedAt?:number;
  undoWire?:{id:string; undo:()=>void};
}) {
  if (running) return <section className="finding info" role="status"><b>Testing your circuit…</b></section>;
  if (!assessment) return <section className="finding info"><b>Ready to test</b><p>Choose Test circuit to check your wiring.</p></section>;
  const passed = assessment.checks.filter(check=>check.status==='pass');
  const findings = assessment.checks.filter(check=>check.status!=='pass').sort((a,b)=>findingPriority(a)-findingPriority(b));
  const examples = assessment.passed && !stale ? sampleChecks(passed) : [];
  const first = findings.find(check=>check.id!=='scenario:unassigned');
  const off = assessment.checks.find(c=>c.id==='scenario:7:0:1'), on = assessment.checks.find(c=>c.id==='scenario:7:1:1');
  const lampComparison = !stale && !findings.some(c=>c.category==='model') && off && on ? <LampReadings off={off} on={on}/> : undefined;
  const setup = first?.id==='setup:wiring';
  const canFind = (check:AssessmentCheck)=>Boolean(check.component||check.wire);
  return <section className="findings-group" aria-label="Circuit test report" aria-live="polite">
    <h3>{stale?'Circuit changed. Test it again.':assessment.summary}</h3>
    {!stale && first && <section className={'finding '+(first.status==='fail'?'warning':'info')} aria-label="First test finding">
      <b>{setup?first.title:statusLabel[first.status]+' · '+first.title}</b><p>{first.explanation}</p>
      {!setup&&first.id!=='practice:protection'&&<p>{nextCheckForFinding(first)}</p>}
      {canFind(first)&&<div className="report-actions"><button type="button" className="quiet-button" onClick={()=>onSelect(first)}>{first.wire?'Show connection':'Show on bench'}</button>
        {undoWire&&first.wire===undoWire.id&&<button type="button" className="quiet-button" onClick={undoWire.undo}>Undo this wire</button>}</div>}
    </section>}
    {lampComparison && (!first || first.id==='switch-off' || first.id==='switch-on' ?
      <section className="test-observations" aria-label="Voltage across the lamp"><h4>Voltage across the lamp</h4>{lampComparison}</section> :
      <details className="test-observations"><summary>Voltage across the lamp</summary>{lampComparison}</details>)}
    {!first && !lampComparison && examples.length>0 && <section className="test-observations" aria-label="What the circuit did">
      <h4>What the circuit did</h4>
      {examples.map(check=><p key={check.id}><strong>{check.title}</strong><br/>{check.explanation}</p>)}
      <small>The test tried these settings on a copy of your circuit.</small>
    </section>}
    {(!setup || stale) && <details className="all-test-checks"><summary>{stale?'Previous result':'All checks'} ({assessment.checks.length})</summary>
      <p className="small-copy">{passed.length} passed checks{recordedAt?' · '+new Date(recordedAt).toLocaleString('en-IE'):''}</p>
      {[...findings,...passed].map(check=><div key={check.id} className={'finding '+(check.status==='fail'?'warning':'info')}>
        <b>{statusLabel[check.status]} · {check.title}</b><p>{check.explanation}</p>
        {canFind(check)&&!stale&&<button type="button" className="quiet-button" onClick={()=>onSelect(check)}>Show on bench</button>}
      </div>)}
    </details>}
  </section>;
}
