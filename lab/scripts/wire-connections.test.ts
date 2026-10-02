import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from '../lib/components.ts';
import { LESSONS } from '../lib/lessons.ts';
import { assessConnections } from '../lib/assessment.ts';
import { getBuildHint } from '../lib/build-hints.ts';
import { evaluateActivity, getLessonActivities } from '../lib/learning.ts';
import { connectionKey, matchLessonWires, suggestWireRole } from '../lib/wire-connections.ts';
import type { CircuitDocument, TerminalRole, Wire } from '../lib/types.ts';

const lesson = (id: number) => LESSONS.find(item => item.id === id)!;
const draft = (id: number): CircuitDocument => ({ ...structuredClone(lesson(id).circuit), id: 'learner-draft', wires: [], faults: [], supply: { ...lesson(id).circuit.supply, enabled: false } });
const wire = (id: string, role: TerminalRole): Wire => ({ id, role, from: { component: 'a', terminal: 'COM' }, to: { component: 'b', terminal: 'A1' }, resistance: .01, bends: [] });

test('all 64 guided builds infer authored conductor identification in either drawing direction without changing circuit data', () => {
  for (const item of LESSONS) for (const reverse of [false, true]) {
    const document = draft(item.id), before = structuredClone(item.circuit);
    for (const expected of item.circuit.wires) {
      const from = reverse ? expected.to : expected.from, to = reverse ? expected.from : expected.to;
      const prior = structuredClone(document);
      const role = suggestWireRole(document, from, to, item.circuit);
      assert.equal(role, expected.role, `${item.id}: ${expected.id}, reverse=${reverse}`);
      assert.deepEqual(document, prior, 'suggesting identification must not create or repair a connection');
      document.wires.push({ ...structuredClone(expected), id: `learner-${expected.id}`, from, to, role });
      const hint = getBuildHint({ document, expected: item.circuit });
      assert.notEqual(hint?.kind, 'different-from-lesson', `${item.id}: ${expected.id}: ${hint?.explanation}`);
    }
    assert.ok(assessConnections(document, item.circuit).every(check => check.status === 'pass'), `lesson ${item.id}`);
    assert.deepEqual(item.circuit, before);
  }
});

test('control feeds, PLC requests, interlinks and safety inputs pass connection activities even when started at line or DC supply terminals', () => {
  let oldLineInferenceFailures = 0;
  for (const id of [16, 29, 42, 55, 58, 63, 64]) {
    const expected = lesson(id).circuit;
    const activities = getLessonActivities(lesson(id));
    const controlWires = expected.wires.filter(item => item.role === 'control');
    assert.ok(controlWires.length, `lesson ${id} must exercise a control path`);
    for (const expectedWire of controlWires) for (const reverse of [false, true]) {
      const document = draft(id), from = reverse ? expectedWire.to : expectedWire.from, to = reverse ? expectedWire.from : expectedWire.to;
      const component = document.components.find(item => item.id === from.component)!;
      const firstRole = COMPONENTS[component.type].terminals.find(item => item.id === from.terminal)!.role;
      if (firstRole !== 'control') oldLineInferenceFailures++;
      const role = suggestWireRole(document, from, to, expected);
      document.wires.push({ ...structuredClone(expectedWire), id: 'new-control-wire', from, to, role });
      const activity = activities.find(item => item.wire === expectedWire.id && item.kind === 'connect')!;
      assert.equal(evaluateActivity(activity, document, undefined).status, 'pass', `${id}:${expectedWire.id}, reverse=${reverse}`);
    }
  }
  assert.ok(oldLineInferenceFailures > 10, 'the regression must cover many control wires whose first-terminal role differs');
});

test('an explicit wrong identification still fails the guided activity and reports a lesson difference without changing the endpoints', () => {
  for (const id of [55, 63, 64]) {
    const expected = lesson(id).circuit, control = expected.wires.find(item => item.role === 'control')!;
    const document = draft(id);
    document.wires.push({ ...structuredClone(control), id: 'deliberate-line-identification', role: 'L' });
    const activity = getLessonActivities(lesson(id)).find(item => item.kind === 'connect' && item.wire === control.id)!;
    const before = structuredClone(document);
    assert.equal(evaluateActivity(activity, document, undefined).status, 'fail');
    assert.equal(getBuildHint({ document, expected })?.kind, 'different-from-lesson');
    assert.ok(assessConnections(document, expected).some(check => check.id === 'identity:deliberate-line-identification' && check.status === 'fail'));
    assert.deepEqual(document, before);
  }
});

test('a plausible control identification never hides a wrong destination or an extra neutral-to-earth connection', () => {
  const expected = lesson(55).circuit, document = draft(55), control = expected.wires.find(item => item.role === 'control')!;
  const wrongDestination = { component: 'supply', terminal: 'PE' };
  const role = suggestWireRole(document, control.from, wrongDestination, expected);
  assert.equal(role, 'PE');
  document.wires.push({ ...structuredClone(control), id: 'wrong-destination', to: wrongDestination, role });
  const checks = assessConnections(document, expected);
  assert.ok(checks.some(check => check.id === 'extra:wrong-destination' && check.status === 'fail'));
  assert.ok(checks.some(check => check.id === `connection:${control.id}` && check.status === 'fail'));
});

test('only the attached lesson can influence identification, with metadata used on an unmatched pair', () => {
  const expected = lesson(55).circuit, control = expected.wires.find(item => item.role === 'control')!, document = draft(55);
  const fallback = suggestWireRole(document, control.from, control.to);
  assert.equal(suggestWireRole(document, control.from, control.to, { ...expected, lessonId: 64 }), fallback);
  delete document.lessonId;
  assert.equal(suggestWireRole(document, control.from, control.to, expected), fallback);
  const first = document.components.find(item => item.id === control.from.component)!;
  assert.equal(suggestWireRole(document, control.from), COMPONENTS[first.type].terminals.find(item => item.id === control.from.terminal)!.role);
});

test('matching is undirected, exact-role-first and duplicate-preserving regardless of wire order', () => {
  const expected = [wire('required-control', 'control')];
  for (const reverse of [false, true]) {
    const correct = wire('learner-correct', 'control'), wrong = wire('learner-wrong', 'L');
    if (reverse) [correct.from, correct.to] = [correct.to, correct.from];
    assert.equal(connectionKey(correct.from, correct.to), connectionKey(wrong.from, wrong.to));
    for (const actual of [[wrong, correct], [correct, wrong]]) {
      const before = structuredClone(actual), result = matchLessonWires(actual, expected);
      assert.equal(result.matches[0].actual?.id, correct.id);
      assert.deepEqual(result.extras.map(item => item.id), [wrong.id]);
      assert.deepEqual(actual, before);
    }
  }
});

test('parallel template wires of distinct identification cannot consume each other and hide mismatches', () => {
  const expected = [wire('required-control', 'control'), wire('required-line', 'L')];
  const actual = [wire('learner-line', 'L'), wire('learner-neutral', 'N')];
  const result = matchLessonWires(actual, expected);
  assert.equal(result.matches[0].actual?.role, 'N');
  assert.equal(result.matches[1].actual?.role, 'L');
  assert.deepEqual(result.extras, []);
  assert.equal(matchLessonWires([wire('learner-only', 'L')], expected).matches[0].actual, undefined);
});

test('correct control wire with an earlier wrong duplicate passes its endpoint activity while full matching still rejects the extra conductor', () => {
  const item = lesson(55), expected = item.circuit, control = expected.wires.find(w => w.role === 'control')!;
  const document = draft(55);
  document.wires = [{ ...structuredClone(control), id: 'wrong-first', role: 'L' }, { ...structuredClone(control), id: 'right-second' }];
  const activity = getLessonActivities(item).find(a => a.kind === 'connect' && a.wire === control.id)!;
  assert.equal(evaluateActivity(activity, document, undefined).status, 'pass');
  const checks = assessConnections(document, expected);
  assert.ok(checks.some(check => check.id === 'extra:wrong-first' && check.status === 'fail'));
  assert.ok(!checks.some(check => check.id === 'identity:right-second'));
});
