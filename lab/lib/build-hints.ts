import { assessConnections, type AssessmentCheck } from './assessment';
import { COMPONENTS } from './components';
import { getComponentTerminals } from './terminal-layout';
import type { CircuitDocument, Diagnostic, Endpoint, SimulationResult, TerminalRole } from './types';

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

export interface EndpointDescription {
  endpoint: Endpoint;
  equipmentName: string;
  terminalLabel: string;
  role: TerminalRole;
  purpose: string;
  group?: string;
  label: string;
}

/** Describe the physical endpoint being considered, without predicting a connection. */
export function describeEndpoint(document: CircuitDocument, endpoint?: Endpoint): EndpointDescription | undefined {
  if (!endpoint) return undefined;
  const component = document.components.find(item => item.id === endpoint.component);
  const definition = component && COMPONENTS[component.type];
  if (!component || !definition) return undefined;
  const terminal = getComponentTerminals(component, definition).find(item => item.id === endpoint.terminal);
  if (!terminal) return undefined;
  return {
    endpoint: { ...endpoint }, equipmentName: component.label, terminalLabel: terminal.label,
    role: terminal.role, purpose: terminal.purpose, ...(terminal.group ? { group: terminal.group } : {}),
    label: `${component.label} · ${terminal.label}`,
  };
}

type Finding = Pick<AssessmentCheck, 'id' | 'category' | 'status' | 'title' | 'explanation' | 'component' | 'wire'>;

/** A next inspection or measurement, never an automatic repair or inferred trip. */
export function nextCheckForFinding(finding: Finding): string {
  const id = finding.id;
  if (id === 'scenario:unassigned') return 'Open Live readings to check your own circuit.';
  if (finding.status === 'unresolved' || finding.category === 'model') return 'Open the circuit test, fix the first problem it shows and test again.';
  if (id.includes('neutralEarth:')) return 'Turn the simulated supply off. Follow the highlighted wire between neutral and earth.';
  if (id.includes('cpc:')) return 'Follow the wire from the earth terminal (PE) back to the supply earth.';
  if (id.includes('polarity:')) return 'Trace L back to line and N back to neutral.';
  if (id.includes('tripped:')) return 'Check the wiring and read what tripped. Repair the fault, reset the device and test again.';
  if (id.includes('mechanical:') || id.includes('interlock')) return 'Check which contactor is on before trying the other direction.';
  if (id.includes('neutral:')) return 'Measure across the load, then trace its return wire.';
  if (id.includes('phase:') || id.includes('windingVoltage:')) return 'Compare the actual phase paths and winding connections with the equipment rating.';
  if (id.startsWith('equipment:')) return 'Add or select the named lesson equipment, then inspect its purpose before connecting it.';
  if (id.startsWith('connection:')) return 'Choose Connect and select the two terminals named above.';
  if (id.startsWith('extra:')) return 'Select this conductor and compare both endpoints with the lesson. Keep it if you want to investigate its effect.';
  if (id.startsWith('identity:')) return 'Compare the marking on the wire with the one in the lesson.';
  if (id.startsWith('fault:')) return 'Take a reading at the fault. Repair it and test again.';
  if (id === 'supply') return 'Turn the bench supply on and test again.';
  if (finding.status === 'not-run') return 'Complete the required operating state or resolve the current calculation, then retest.';
  if (finding.category === 'protection') return 'Inspect the highlighted protective path and compare it with the operating current before resetting or retesting.';
  if (finding.category === 'operation') return 'Check the intended control state, then measure at the affected equipment and follow its supply and return paths.';
  return 'Compare the stated objective with the current connections and controls, then run the test again.';
}

/** Presentation priority; it does not change assessment status or suppress checks. */
export function findingPriority(finding: Pick<AssessmentCheck, 'category' | 'status'>): number {
  if (finding.category === 'model') return 0;
  if (finding.category === 'protection') return 1;
  if (finding.category === 'operation') return 2;
  return 3;
}

function diagnosticHint(diagnostic: Diagnostic): BuildHint {
  const category = diagnostic.category;
  const finding = { ...diagnostic, status: 'fail' as const };
  return {
    id: diagnostic.id, kind: category === 'model' ? 'unresolved' : category,
    severity: diagnostic.severity, title: diagnostic.title, explanation: diagnostic.explanation,
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
  if (diagnostic) return diagnosticHint(diagnostic);
  if (current && !current.converged) return {
    id: 'hint:unresolved', kind: 'unresolved', severity: 'error', title: 'Calculation is unresolved',
    explanation: 'The bench could not calculate a reliable reading.',
    nextCheck: 'Open Test circuit to find out why.',
  };
  if (!document.components.length) return {
    id: 'hint:empty', kind: 'incomplete', severity: 'info', title: 'Start with your equipment',
    explanation: 'Start with a supply.', nextCheck: 'Choose Add equipment to place it on the bench.',
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
    title: incomplete ? 'Lesson build is unfinished' : 'This differs from the lesson', explanation: check.explanation,
    nextCheck: nextCheckForFinding(check),
    ...(check.component ? { component: check.component } : {}), ...(check.wire ? { wire: check.wire } : {}),
  };
}
