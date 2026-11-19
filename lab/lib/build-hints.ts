import { assessConnections, explainFinding, type AssessmentCheck } from './assessment';
import type { CircuitDocument, Diagnostic, SimulationResult } from './types';
export { describeEndpoint, type EndpointDescription } from './endpoint-description';

export interface BuildHint {
  id: string;
  kind: 'incomplete' | 'different-from-lesson' | 'protection' | 'operation' | 'unresolved';
  severity: 'info' | 'warning' | 'error';
  title: string;
  explanation: string;
  nextCheck: string;
  component?: string;
  wire?: string;
}

export interface BuildHintInput {
  document: CircuitDocument;
  /** The accepted result for this document. Earlier revisions are ignored. */
  result?: SimulationResult;
  /** Only a lesson attached to the document may supply matching objectives. */
  expected?: CircuitDocument;
}

type Finding = Pick<AssessmentCheck, 'id' | 'category' | 'status' | 'title' | 'explanation' | 'component' | 'wire'>;

/** A next inspection or measurement, never an automatic repair or inferred trip. */
export function nextCheckForFinding(finding: Finding): string {
  const id = finding.id;
  if (id === 'scenario:unassigned') return 'Open Live readings to check your own circuit.';
  if (finding.status === 'unresolved' || finding.category === 'model') return 'Check the supply and the fittings shown on the bench. Then choose Test circuit again.';
  if (id.includes('neutralEarth:')) return finding.wire ? 'Switch off the bench supply and check both ends of this wire.' : 'Switch off the bench supply. Follow neutral and earth to find where they meet.';
  if (id.includes('cpc:')) return 'Follow the wire from the earth terminal (PE) back to the supply earth.';
  if (id.includes('polarity:')) return 'Follow the wire on L back to the line supply. Then do the same for N and neutral.';
  if (id.includes('tripped:')) return 'Look at the reading saved just before it tripped. Fix the fault, reset it and test again.';
  if (id.includes('mechanical:') || id.includes('interlock')) return 'Check which contactor is pulled in. Its partner must stay open.';
  if (id.includes('neutral:')) return 'Put the probes on L and N at the fitting, then follow N back to the supply.';
  if (id.includes('phase:') || id.includes('windingVoltage:')) return 'Check the voltage across each winding and compare it with the motor rating.';
  if (id.startsWith('equipment:')) return 'If you just removed it, choose Undo to put it back.';
  if (id.startsWith('connection:')) return 'Choose Connect and pick those two terminals.';
  if (id.startsWith('extra:')) return 'Select the wire and compare its two ends with the lesson drawing.';
  if (id.startsWith('identity:')) return 'Compare the marking on the wire with the one in the lesson.';
  if (id.startsWith('fault:')) return 'Record a reading at the fitting, then repair the fault and test again.';
  if (id==='switch-off') return 'Follow the wire on L at the lamp. See where it can still get a feed with the switch off.';
  if (id==='switch-on') return 'Check the feed leaving the switch, then the two connections at the lamp.';
  if (id === 'supply') return finding.title==='No bench supply connected' ? 'Choose Add equipment and pick a supply for your circuit.' : 'Turn the bench supply on and test again.';
  if (finding.status === 'not-run') return 'Try the control named in this step, then test again.';
  if (finding.category === 'protection') return 'Check the wiring at both ends before you reset the device or test again.';
  if (finding.category === 'operation') return 'Check the switch position. Measure across the fitting, then follow the feed and return wires.';
  return 'Compare your wiring with the drawing and test again.';
}

/** Presentation priority; it does not change assessment status or suppress checks. */
export function findingPriority(finding: Pick<AssessmentCheck, 'category' | 'status'> & {id?:string}): number {
  if (finding.category === 'model') return 0;
  if (finding.category === 'protection') return 1;
  if (finding.category === 'operation') return 2;
  return finding.id==='switch-off' ? 3 : 4;
}

function diagnosticHint(document: CircuitDocument, result: SimulationResult, diagnostic: Diagnostic): BuildHint {
  const category = diagnostic.category;
  const finding = { ...diagnostic, status: 'fail' as const };
  return {
    id: diagnostic.id, kind: category === 'model' ? 'unresolved' : category,
    severity: diagnostic.severity, title: diagnostic.title, explanation: explainFinding(document, result, diagnostic),
    nextCheck: nextCheckForFinding(finding),
    ...(diagnostic.component ? { component: diagnostic.component } : {}),
    ...(diagnostic.wire ? { wire: diagnostic.wire } : {}),
  };
}

/**
 * Select one hint from already accepted diagnostics and attached lesson matching.
 * This pure function never simulates a proposed connection, edits a document,
 * changes a verdict or treats an unfinished build as an incorrect circuit.
 */
export function getBuildHint({ document, result, expected }: BuildHintInput): BuildHint | undefined {
  const current = result?.revision === document.revision ? result : undefined;
  const diagnostics = current?.diagnostics.filter(item => item.severity !== 'info') ?? [];
  const diagnostic = diagnostics.slice().sort((a, b) => findingPriority({ ...a, status: 'fail' }) - findingPriority({ ...b, status: 'fail' }))[0];
  if (current && diagnostic) return diagnosticHint(document, current, diagnostic);
  if (current && !current.converged) return {
    id: 'hint:unresolved', kind: 'unresolved', severity: 'error', title: 'No reading yet',
    explanation: 'The bench could not calculate a reliable reading.',
    nextCheck: 'Open Test circuit to find out why.',
  };
  if (!document.components.length) return {
    id: 'hint:empty', kind: 'incomplete', severity: 'info', title: 'Empty bench',
    explanation: 'Place a supply, then add what you want it to run.', nextCheck: 'Choose Add equipment to place it on the bench.',
  };
  if (!expected || document.lessonId === undefined || document.lessonId !== expected.lessonId) return undefined;
  const checks = assessConnections(document, expected).filter(check => check.status !== 'pass');
  // A deviation is useful to investigate even while other lesson connections remain unfinished.
  const different = checks.find(check => check.id.startsWith('extra:') || check.id.startsWith('identity:') || check.id.startsWith('fault:'));
  const check = different ?? checks[0];
  if (!check) return undefined;
  const incomplete = check.id.startsWith('equipment:') || check.id.startsWith('connection:');
  return {
    id: check.id, kind: incomplete ? 'incomplete' : 'different-from-lesson', severity: incomplete ? 'info' : 'warning',
    title: incomplete ? check.title : 'Different from this lesson', explanation: check.explanation,
    nextCheck: nextCheckForFinding(check),
    ...(check.component ? { component: check.component } : {}), ...(check.wire ? { wire: check.wire } : {}),
  };
}
