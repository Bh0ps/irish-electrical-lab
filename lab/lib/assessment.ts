import { COMPONENTS } from './components';
import { runLessonScenarios } from './scenarios';
import { matchLessonWires } from './wire-connections';
import { endpointKey, type CircuitDocument, type SimulationResult, type Wire } from './types';

export interface AssessmentCheck {
  id: string; category: 'operation' | 'protection' | 'objectives' | 'model';
  status: 'pass' | 'fail' | 'not-run' | 'unresolved'; title: string; explanation: string; component?: string; wire?: string;
}
export interface BuildAssessment {
  revision: number; circuitId: string; passed: boolean; summary: string; checks: AssessmentCheck[];
}
function terminalName(document: CircuitDocument, key: string) {
  const item = document.components.find(c => key.startsWith(c.id + '.'));
  if (!item) return key;
  return `${item.label} · ${key.slice(item.id.length + 1)}`;
}
function wireName(document: CircuitDocument, wire: Wire) {
  return [terminalName(document, endpointKey(wire.from)), terminalName(document, endpointKey(wire.to))].join(' ↔ ');
}

/** Exact guided-template matching is separate from electrical operating behaviour. */
export function assessConnections(document: CircuitDocument, expected: CircuitDocument): AssessmentCheck[] {
  const checks: AssessmentCheck[] = [];
  const check = (id: string, passed: boolean, title: string, explanation: string, target: {component?: string; wire?: string} = {}) => checks.push({id, category:'objectives', status: passed ? 'pass' : 'fail', title, explanation, ...target});
  for (const c of expected.components) check(`equipment:${c.id}`, document.components.some(x => x.id === c.id && x.type === c.type), `${c.label}: equipment`, document.components.some(x => x.id === c.id && x.type === c.type) ? 'The required lesson equipment is present.' : `Restore the required ${COMPONENTS[c.type]?.name ?? c.type}.`, {component:c.id});
  const { matches, extras } = matchLessonWires(document.wires, expected.wires);
  for (const { expected: w, actual: present } of matches) {
    check(`connection:${w.id}`, !!present, 'Required terminal connection', present ? wireName(document, present) : `Missing: ${wireName(expected, w)}.`, {component:w.to.component, wire:present?.id});
    if (present && present.role !== w.role) check(`identity:${present.id}`, false, 'Conductor identification differs from the lesson', `${wireName(document, present)} is identified as ${present.role}; the lesson uses ${w.role}. Changing identification does not change the connected terminals or interrupt current.`, {wire:present.id});
  }
  for (const w of extras) check(`extra:${w.id}`, false, 'Extra connection in the guided circuit', `${wireName(document, w)} is not part of this lesson. Extra connections can bypass controls or join neutral to earth; remove it or investigate its effect.`, {wire:w.id});
  for (const f of document.faults.filter(f => f.enabled)) check(`fault:${f.type}:${f.wire ?? f.component}`, false, 'Study fault is still enabled', `Repair the injected ${f.type} fault before completing the build.`, {wire:f.wire, component:f.component});
  return checks;
}

/** Run in the simulation worker. Experiments never alter the learner's controls or trips. */
export function assessBuild(document: CircuitDocument, result: SimulationResult, expected?: CircuitDocument): BuildAssessment {
  const checks: AssessmentCheck[] = [];
  const check = (id: string, category: AssessmentCheck['category'], passed: boolean, title: string, explanation: string, target: {component?: string; wire?: string} = {}) =>
    checks.push({id, category, status: passed ? 'pass' : 'fail', title, explanation, ...target});
  const current = result.revision === document.revision;
  check('solution', 'model', current && result.converged, 'Electrical calculation', !current ? 'The result belongs to an older circuit edit. Run the test again.' : result.converged ? 'The current terminal network has a resolved electrical result.' : 'Resolve the model findings before interpreting an operating result.');
  check('supply', 'operation', document.supply.enabled, 'Simulated supply', document.supply.enabled ? `Supply is enabled at ${document.supply.voltage} V.` : 'Turn the simulated supply on to test operation.');
  if (current) {
    const failures = result.diagnostics.filter(d => d.severity !== 'info');
    for (const d of failures) check(`finding:${d.id}`, d.category, false, d.title, d.explanation, {component:d.component, wire:d.wire});
    const protective = failures.filter(d => d.category === 'protection');
    if (!protective.length) check('protective-paths', 'protection', true, 'Protective-path findings', 'No protective-path defect was reported by this teaching model.');
  }
  if (expected) {
    checks.push(...assessConnections(document,expected));
  }
  if(current&&result.converged){const experiments=runLessonScenarios(document,result.deviceStates);for(const c of experiments){if(document.lessonId===7&&c.id==='scenario:7:0:0')c.id='switch-off';if(document.lessonId===7&&c.id==='scenario:7:1:0')c.id='switch-on';}checks.push(...experiments);}
  else checks.push({id:'scenario:not-current',category:'objectives',status:'not-run',title:'Operating experiments',explanation:'Resolve the current electrical result before running the operating sequence.'});
  const failed = checks.filter(c => c.status === 'fail').length, unresolved=checks.filter(c=>c.status==='unresolved').length, notRun=checks.filter(c=>c.status==='not-run').length;
  const passed=failed===0&&unresolved===0&&(!document.lessonId||notRun===0);
  return {revision:document.revision,circuitId:document.id,passed,summary:failed?`Test failed: ${failed} ${failed===1?'check needs':'checks need'} attention.`:unresolved?'Test incomplete: operating measurements could not be resolved.':document.lessonId&&notRun?'Test incomplete: lesson operating objectives have not run.':document.lessonId?'Test passed: guided connections, authored operating sequence and reported protective paths pass.':'Electrical model resolved: no reported protective defect. No lesson operating objective was assessed.',checks};
}
