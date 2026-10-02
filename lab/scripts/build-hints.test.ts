import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEndpoint, getBuildHint } from '../lib/build-hints.ts';
import { LESSONS } from '../lib/lessons.ts';
import { simulate } from '../lib/simulation.ts';
import type { CircuitDocument } from '../lib/types.ts';

const expected = LESSONS.find(lesson => lesson.id === 7)!.circuit;
const circuit = () => structuredClone(expected);
function neutralEarth(closed: boolean): CircuitDocument {
  const document = circuit();
  document.components.find(component => component.id === 'switch')!.params.closed = closed;
  document.wires.push({ id: 'extra-n-pe', from: { component: 'supply', terminal: 'PE' }, to: { component: 'protect', terminal: 'NOUT' }, role: 'PE', resistance: .01, bends: [] });
  return document;
}

test('an empty or unfinished attached build receives an informational next step, not an incorrect verdict', () => {
  const empty = circuit(); empty.components = []; empty.wires = [];
  const first = getBuildHint({ document: empty, expected });
  assert.equal(first?.kind, 'incomplete'); assert.equal(first?.severity, 'info'); assert.match(first!.nextCheck, /Add equipment/);
  const unfinished = circuit(); unfinished.wires = unfinished.wires.slice(0, 2);
  const before = structuredClone(unfinished);
  const hint = getBuildHint({ document: unfinished, expected });
  assert.equal(hint?.kind, 'incomplete'); assert.equal(hint?.severity, 'info'); assert.match(hint!.explanation, /Missing:/);
  assert.doesNotMatch(hint!.title, /incorrect|fault|failed/i); assert.deepEqual(unfinished, before);
});

test('neutral-to-earth wiring remains a protective hint with the switch OFF without inventing a trip', () => {
  const document = neutralEarth(false), result = simulate(document), before = structuredClone({ document, result });
  assert.equal(result.deviceStates.protect.tripped, false);
  const hint = getBuildHint({ document, result, expected });
  assert.equal(hint?.kind, 'protection'); assert.match(hint!.id, /neutralEarth:/);
  assert.equal(hint?.wire, 'extra-n-pe'); assert.doesNotMatch(hint!.title, /trip|short/i);
  assert.match(hint!.explanation, /remains when the switch is off/);
  assert.deepEqual({ document, result }, before);
});

test('neutral-to-earth ON uses the actual protective result and prioritises the connection before its resulting interruption', () => {
  const document = neutralEarth(true), result = simulate(document);
  assert.equal(result.deviceStates.protect.tripped, true);
  const hint = getBuildHint({ document, result, expected });
  assert.equal(hint?.kind, 'protection'); assert.match(hint!.id, /neutralEarth:/); assert.equal(hint?.wire, 'extra-n-pe');
});

test('earlier-revision diagnostics cannot accuse the current build', () => {
  const earlier = neutralEarth(false), result = simulate(earlier), current = circuit(); current.revision++;
  assert.equal(getBuildHint({ document: current, result, expected }), undefined);
  current.wires = current.wires.slice(0, 2);
  assert.equal(getBuildHint({ document: current, result, expected })?.kind, 'incomplete');
});

test('template differences only apply to the attached lesson and remain distinct from free-building physics', () => {
  const document = circuit(); document.wires.push({ ...structuredClone(document.wires[3]), id: 'parallel-investigation' });
  const hint = getBuildHint({ document, expected });
  assert.equal(hint?.kind, 'different-from-lesson'); assert.equal(hint?.wire, 'parallel-investigation');
  assert.match(hint!.nextCheck, /Keep it if you want to investigate/);
  delete document.lessonId;
  assert.equal(getBuildHint({ document, result: simulate(document), expected }), undefined);
  const differentLesson = { ...expected, lessonId: 8 };
  document.lessonId = 7;
  assert.equal(getBuildHint({ document, expected: differentLesson }), undefined);
  const actualFault = neutralEarth(false); delete actualFault.lessonId;
  assert.equal(getBuildHint({ document: actualFault, result: simulate(actualFault), expected })?.kind, 'protection');
});

test('unresolved current calculations outrank protective and operating hints', () => {
  const document = circuit(), result = simulate(document);
  result.converged = false;
  result.diagnostics.unshift({ id: 'overload', category: 'protection', severity: 'warning', title: 'Protection', explanation: 'Protection finding.' }, { id: 'solve', category: 'model', severity: 'error', title: 'Unresolved model', explanation: 'No reliable result.' });
  const hint = getBuildHint({ document, result, expected });
  assert.equal(hint?.id, 'solve'); assert.equal(hint?.kind, 'unresolved'); assert.equal(hint?.severity, 'error');
  assert.match(hint!.nextCheck, /before interpreting readings/);
  result.diagnostics = [];
  assert.equal(getBuildHint({ document, result })?.kind, 'unresolved');
});

test('endpoint previews describe actual equipment terminals and safely omit missing endpoints', () => {
  const document = circuit(), before = structuredClone(document), source = { component: 'switch', terminal: 'COM' }, target = { component: 'light', terminal: 'N' };
  const from = describeEndpoint(document, source), to = describeEndpoint(document, target);
  assert.equal(from?.terminalLabel, 'COM'); assert.equal(from?.role, 'L'); assert.match(from!.purpose, /Common/);
  assert.equal(to?.role, 'N'); assert.equal(to?.equipmentName, document.components.find(component => component.id === 'light')!.label);
  assert.equal(to?.label, `${to?.equipmentName} · ${to?.terminalLabel}`);
  from!.endpoint.terminal = 'not-a-change'; assert.deepEqual(source, { component: 'switch', terminal: 'COM' });
  assert.equal(describeEndpoint(document), undefined); assert.equal(describeEndpoint(document, { component: 'missing', terminal: 'L' }), undefined);
  assert.equal(describeEndpoint(document, { component: 'switch', terminal: 'wrong' }), undefined); assert.deepEqual(document, before);
});
