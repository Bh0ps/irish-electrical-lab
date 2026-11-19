import { COURSE_BOARD_ID,COURSE_BOND_ID } from './board-examples';
import { describeEndpoint } from './endpoint-description';
import { runLessonScenarios } from './scenarios';
import { getLesson, olderTimerFan } from './lessons';
import { matchLessonWires } from './wire-connections';
import { endpointKey, type CircuitDocument, type Diagnostic, type SimulationResult, type Wire } from './types';

export interface CheckReading { value:number; unit:'V'|'A'|'W' }
export interface AssessmentCheck {
  id: string; category: 'operation' | 'protection' | 'objectives' | 'model';
  status: 'pass' | 'fail' | 'not-run' | 'unresolved'; title: string; explanation: string; component?: string; wire?: string; reading?:CheckReading;
}
export interface BuildAssessment {
  revision: number; circuitId: string; passed: boolean; summary: string; checks: AssessmentCheck[];
}
function wireEnds(document: CircuitDocument, wire: Wire) {
  return [wire.from, wire.to].map(end => describeEndpoint(document, end)?.label ?? endpointKey(end)).join(' to ');
}

/** An earth-path warning and the lamp's operating state answer different questions. */
export function explainFinding(document: CircuitDocument, result: SimulationResult, finding: Diagnostic): string {
  if (!finding.id.startsWith('cpc:')) return finding.explanation;
  const item = document.components.find(c => c.id === finding.component);
  if (!item) return finding.explanation;
  const power = result.deviceStates[item.id]?.lightOutputPower;
  const path = 'Its earth terminal (PE) has no path back to the supply earth.';
  if (result.revision === document.revision && result.converged && typeof power === 'number' && Number.isFinite(power)) {
    if (power === 0) return `${item.label} is off. ${path}`;
    const watts = power < .1 ? 'less than 0.1' : Number(power.toFixed(1));
    return `${item.label} is drawing ${watts} W. ${path}`;
  }
  return `${item.label} has no path from its earth terminal (PE) back to the supply earth.`;
}

/** Exact guided-template matching is separate from electrical operating behaviour. */
export function assessConnections(document: CircuitDocument, expected: CircuitDocument): AssessmentCheck[] {
  const checks: AssessmentCheck[] = [];
  const check = (id: string, passed: boolean, title: string, explanation: string, target: {component?: string; wire?: string} = {}) => checks.push({id, category:'objectives', status: passed ? 'pass' : 'fail', title, explanation, ...target});
  for (const c of expected.components.filter(c=>c.id!==COURSE_BOARD_ID)) {
    const present = document.components.some(x => x.id === c.id && x.type === c.type);
    check(`equipment:${c.id}`, present, c.label, present ? 'On the bench.' : `This build is missing ${c.label}.`, {component:c.id});
  }
  const { matches, extras } = matchLessonWires(document.wires, expected.wires.filter(w=>w.id!==COURSE_BOND_ID||document.components.some(c=>c.id===COURSE_BOARD_ID)));
  for (const { expected: w, actual: present } of matches) {
    check(`connection:${w.id}`, !!present, present ? 'Wire connected' : 'Wire missing', present ? wireEnds(document, present) : `Connect ${wireEnds(expected, w)}.`, {component:w.to.component, wire:present?.id});
    if (present && present.role !== w.role) check(`identity:${present.id}`, false, 'Check the wire marking', `The wire from ${wireEnds(document, present)} is in the right place. It’s marked ${present.role}. The drawing calls for ${w.role}.`, {wire:present.id});
  }
  for (const w of extras) check(`extra:${w.id}`, false, 'Extra connection', `Your wire runs from ${wireEnds(document, w)}. There’s no wire between these terminals in the lesson drawing.`, {wire:w.id});
  for (const f of document.faults.filter(f => f.enabled)) check(`fault:${f.type}:${f.wire ?? f.component}`, false, 'Practice fault still present', 'Repair the fault, then run Test circuit again.', {wire:f.wire, component:f.component});
  return checks;
}

/** Run in the simulation worker. Experiments never alter the learner's controls or trips. */
export function assessBuild(document: CircuitDocument, result: SimulationResult, expected?: CircuitDocument): BuildAssessment {
  if (!expected && !document.lessonId && document.wires.length === 0) {
    const blank = document.components.length === 0;
    return {
      revision: document.revision, circuitId: document.id, passed: false,
      summary: blank ? 'Your bench is empty' : 'Nothing is wired yet',
      checks: [{
        id: 'setup:wiring', category: 'operation', status: 'not-run',
        title: blank ? 'Add your first piece of equipment' : 'Connect two terminals',
        explanation: blank ? 'Choose Add equipment to start your circuit.' : 'Choose Connect, then pick the two ends of a wire.',
      }],
    };
  }
  const checks: AssessmentCheck[] = [];
  const check = (id: string, category: AssessmentCheck['category'], passed: boolean, title: string, explanation: string, target: {component?: string; wire?: string} = {}) =>
    checks.push({id, category, status: passed ? 'pass' : 'fail', title, explanation, ...target});
  const current = result.revision === document.revision;
  const resolved=current && result.converged;
  checks.push({id:'solution',category:'model',status:resolved?'pass':'unresolved',title:'Voltage and current',
    explanation:!current?'The wiring changed during the test. Test it again.':resolved?'The bench has a reading for this version of the circuit.':'The bench could not calculate reliable readings for this wiring.'});
  const freeBuild=!document.lessonId && !expected;
  const hasMains=document.components.some(c=>c.type==='source'||c.type==='source3');
  const localSupply=freeBuild && resolved && document.components.some(c=>['battery','pv'].includes(c.type) && (result.branchCurrents[c.id+'.dcSource'] || result.branchCurrents[c.id+'.backupSource']));
  if(freeBuild && !localSupply && (!hasMains || !document.supply.enabled)){
    checks.push({id:'supply',category:'operation',status:'not-run',title:hasMains?'Bench supply is off':'No bench supply connected',
      explanation:hasMains?'Turn the supply on to try the circuit. Leave it off for a resistance check.':'You can check continuity with the power off. Add a supply to try the circuit under power.'});
  }else{
    check('supply','operation',document.supply.enabled||localSupply,'Simulated supply',localSupply?'The circuit has voltage from its own battery or solar supply.':document.supply.enabled?`The supply is on at ${document.supply.voltage} V.`:'Switch on the bench supply to try the circuit.');
  }
  if (current) {
    const failures = result.diagnostics.filter(d => d.severity !== 'info');
    for (const d of failures) check(`finding:${d.id}`, d.category, false, d.title, explainFinding(document, result, d), {component:d.component, wire:d.wire});
    const protective = failures.filter(d => d.category === 'protection');
    if (!protective.length) check('protective-paths', 'protection', true, 'Earth path check', 'The bench found no break or wrong connection in the earth paths it checked.');
  }
  if (expected) {
    checks.push(...assessConnections(document,expected.lessonId===36&&olderTimerFan(document)?getLesson(36,document)!.circuit:expected));
  }
  if(current&&result.converged){const experiments=runLessonScenarios(document,result.deviceStates);for(const c of experiments){if(document.lessonId===7&&c.id==='scenario:7:0:0')c.id='switch-off';if(document.lessonId===7&&c.id==='scenario:7:1:0')c.id='switch-on';}checks.push(...experiments);}
  else checks.push({id:'scenario:not-current',category:'objectives',status:'not-run',title:'Control checks',explanation:'Test the current wiring again so the bench can try the controls.'});
  const failed = checks.filter(c => c.status === 'fail').length, unresolved=checks.filter(c=>c.status==='unresolved').length, notRun=checks.filter(c=>c.status==='not-run').length;
  const powerNotTested=checks.some(c=>c.id==='supply'&&c.status==='not-run');
  const passed=failed===0&&unresolved===0&&!powerNotTested&&(!document.lessonId||notRun===0);
  const summary=unresolved?'Test incomplete. The bench couldn’t get all the readings.':failed?`Test failed. ${failed} ${failed===1?'check needs':'checks need'} attention.`:powerNotTested?'Still to test under power':document.lessonId&&notRun?'Some lesson checks still need to run.':document.lessonId?'Test passed':'Circuit checked. These tests found no wiring fault.';
  return {revision:document.revision,circuitId:document.id,passed,summary,checks};
}
