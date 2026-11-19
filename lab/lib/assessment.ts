import { COURSE_BOARD_ID,COURSE_BOND_ID } from './board-examples';
import { COMPONENTS } from './components';
import { getComponentTerminals } from './terminal-layout';
import { runLessonScenarios } from './scenarios';
import { matchLessonWires } from './wire-connections';
import { endpointKey, type CircuitDocument, type SimulationResult, type Wire } from './types';

export interface CheckReading { value:number; unit:'V'|'A'|'W' }
export interface AssessmentCheck {
  id: string; category: 'operation' | 'protection' | 'objectives' | 'model';
  status: 'pass' | 'fail' | 'not-run' | 'unresolved'; title: string; explanation: string; component?: string; wire?: string; reading?:CheckReading;
}
export interface BuildAssessment {
  revision: number; circuitId: string; passed: boolean; summary: string; checks: AssessmentCheck[];
}
function terminalName(document: CircuitDocument, key: string) {
  const item = document.components.find(c => key.startsWith(c.id + '.'));
  if (!item) return key;
  const id=key.slice(item.id.length + 1), terminal=getComponentTerminals(item,COMPONENTS[item.type]).find(t=>t.id===id);
  return `${item.label} · ${terminal?.label??id}`;
}
function wireName(document: CircuitDocument, wire: Wire) {
  return [terminalName(document, endpointKey(wire.from)), terminalName(document, endpointKey(wire.to))].join(' ↔ ');
}

/** Exact guided-template matching is separate from electrical operating behaviour. */
export function assessConnections(document: CircuitDocument, expected: CircuitDocument): AssessmentCheck[] {
  const checks: AssessmentCheck[] = [];
  const check = (id: string, passed: boolean, title: string, explanation: string, target: {component?: string; wire?: string} = {}) => checks.push({id, category:'objectives', status: passed ? 'pass' : 'fail', title, explanation, ...target});
  for (const c of expected.components.filter(c=>c.id!==COURSE_BOARD_ID)) check(`equipment:${c.id}`, document.components.some(x => x.id === c.id && x.type === c.type), `${c.label}: equipment`, document.components.some(x => x.id === c.id && x.type === c.type) ? 'This fitting is on the bench.' : `Restore the required ${COMPONENTS[c.type]?.name ?? c.type}.`, {component:c.id});
  const { matches, extras } = matchLessonWires(document.wires, expected.wires.filter(w=>w.id!==COURSE_BOND_ID||document.components.some(c=>c.id===COURSE_BOARD_ID)));
  for (const { expected: w, actual: present } of matches) {
    check(`connection:${w.id}`, !!present, 'Required terminal connection', present ? wireName(document, present) : `Missing: ${wireName(expected, w)}.`, {component:w.to.component, wire:present?.id});
    if (present && present.role !== w.role) check(`identity:${present.id}`, false, 'Check the wire marking', `${wireName(document, present)} is marked ${present.role}. This step calls for ${w.role}. The two ends are in the right place.`, {wire:present.id});
  }
  for (const w of extras) check(`extra:${w.id}`, false, 'Extra connection in the guided circuit', `Your wire joins ${wireName(document, w)}. The lesson drawing leaves this connection out.`, {wire:w.id});
  for (const f of document.faults.filter(f => f.enabled)) check(`fault:${f.type}:${f.wire ?? f.component}`, false, 'Study fault is still enabled', `Repair the injected ${f.type} fault before completing the build.`, {wire:f.wire, component:f.component});
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
  checks.push({id:'solution',category:'model',status:resolved?'pass':'unresolved',title:'Circuit calculation',
    explanation:!current?'The wiring changed during the test. Test it again.':resolved?'The bench calculated voltage and current for this wiring.':'The bench could not calculate reliable readings for this wiring.'});
  const freeBuild=!document.lessonId && !expected;
  const hasMains=document.components.some(c=>c.type==='source'||c.type==='source3');
  const localSupply=freeBuild && resolved && document.components.some(c=>['battery','pv'].includes(c.type) && (result.branchCurrents[c.id+'.dcSource'] || result.branchCurrents[c.id+'.backupSource']));
  if(freeBuild && !localSupply && (!hasMains || !document.supply.enabled)){
    checks.push({id:'supply',category:'operation',status:'not-run',title:hasMains?'Bench supply is off':'No bench supply connected',
      explanation:hasMains?'Turn the supply on to try the circuit. Leave it off for a resistance check.':'You can check continuity with the power off. Add a supply to try the circuit under power.'});
  }else{
    check('supply','operation',document.supply.enabled||localSupply,'Simulated supply',localSupply?'A local source is supplying voltage.':document.supply.enabled?`The supply is on at ${document.supply.voltage} V.`:'Turn the bench supply on to test operation.');
  }
  if (current) {
    const failures = result.diagnostics.filter(d => d.severity !== 'info');
    for (const d of failures) check(`finding:${d.id}`, d.category, false, d.title, d.explanation, {component:d.component, wire:d.wire});
    const protective = failures.filter(d => d.category === 'protection');
    if (!protective.length) check('protective-paths', 'protection', true, 'Earth path check', 'The simulator found no fault in the earth paths it checks.');
  }
  if (expected) {
    checks.push(...assessConnections(document,expected));
  }
  if(current&&result.converged){const experiments=runLessonScenarios(document,result.deviceStates);for(const c of experiments){if(document.lessonId===7&&c.id==='scenario:7:0:0')c.id='switch-off';if(document.lessonId===7&&c.id==='scenario:7:1:0')c.id='switch-on';}checks.push(...experiments);}
  else checks.push({id:'scenario:not-current',category:'objectives',status:'not-run',title:'Operating experiments',explanation:'The bench needs a reading from this wiring before it can try the controls.'});
  const failed = checks.filter(c => c.status === 'fail').length, unresolved=checks.filter(c=>c.status==='unresolved').length, notRun=checks.filter(c=>c.status==='not-run').length;
  const powerNotTested=checks.some(c=>c.id==='supply'&&c.status==='not-run');
  const passed=failed===0&&unresolved===0&&!powerNotTested&&(!document.lessonId||notRun===0);
  const summary=unresolved?'Test incomplete. Some readings are unknown.':failed?`Test failed. ${failed} ${failed===1?'check needs':'checks need'} attention.`:powerNotTested?'Still to test under power':document.lessonId&&notRun?'Some lesson checks still need to run.':document.lessonId?'Test passed':'Circuit checked. These tests found no wiring fault.';
  return {revision:document.revision,circuitId:document.id,passed,summary,checks};
}
