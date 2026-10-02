import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedGuidedBuild, evaluateGuidedWireAddition, type GuidedWireAddition } from '../lib/guided-build.ts';
import { evaluateActivity, getLessonActivities, type LessonActivity } from '../lib/learning.ts';
import { LESSONS } from '../lib/lessons.ts';
import { simulate } from '../lib/simulation.ts';
import type { CircuitDocument } from '../lib/types.ts';

function fixture() {
  const lesson = LESSONS.find(item => item.id === 7)!;
  const activity = getLessonActivities(lesson).find(item => item.kind === 'connect')!;
  const document = structuredClone(lesson.circuit);
  document.id = 'guided-one-way';
  document.revision = 4;
  document.supply.enabled = false;
  document.wires = [structuredClone(lesson.circuit.wires.find(wire => wire.id === activity.wire)!)];
  document.wires[0].id = 'learner-wire';
  const event: GuidedWireAddition = { sequence: 1, circuitId: document.id, revision: document.revision, wireId: document.wires[0].id };
  return { lesson, activity, document, event };
}

test('the current isolated connection accepts a real added wire without modifying its graph or activity', () => {
  const { activity, document, event } = fixture();
  const before = structuredClone({ activity, document, event });
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'pass');
  assert.deepEqual({ activity, document, event }, before);
});

test('a reversed terminal-click order demonstrates the same connection', () => {
  const { activity, document, event } = fixture();
  const wire = document.wires[0];
  [wire.from, wire.to] = [wire.to, wire.from];
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'pass');
});

test('a wrong explicit conductor identification produces feedback without acceptance', () => {
  const { activity, document, event } = fixture();
  document.wires[0].role = 'PE';
  const result = evaluateGuidedWireAddition(activity, document, event, 'build');
  assert.equal(result?.status, 'fail');
  assert.match(result!.explanation, /conductor identification differs/i);
});

test('an older correctly identified duplicate cannot disguise a wrong added conductor', () => {
  const { activity, document, event } = fixture();
  document.wires.unshift({ ...structuredClone(document.wires[0]), id: 'older-correct-wire' });
  document.wires[1].role = 'PE';
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'fail');
});

test('an older wrongly identified duplicate cannot substitute for the wire being demonstrated', () => {
  const { activity, document, event } = fixture();
  document.wires.unshift({ ...structuredClone(document.wires[0]), id: 'older-wrong-wire', role: 'PE' });
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'pass');
  // Whole-build assessment still detects the extra actual conductor separately.
  assert.equal(document.wires.length, 2);
  assert.equal(document.wires[0].role, 'PE');
});

test('external and available local sources retain the existing isolation evidence guard', () => {
  const { activity, document, event } = fixture();
  document.supply.enabled = true;
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'not-run');
  const lesson = LESSONS.find(item => item.id === 48)!;
  const backup = structuredClone(lesson.circuit);
  const connection = getLessonActivities(lesson).find(item => item.kind === 'connect')!;
  backup.supply.enabled = false;
  const added = { sequence: 2, circuitId: backup.id, revision: backup.revision, wireId: connection.wire! };
  assert.equal(evaluateGuidedWireAddition(connection, backup, added, 'build')?.status, 'not-run');
  backup.components.find(component => component.type === 'battery')!.params.on = false;
  assert.equal(evaluateGuidedWireAddition(connection, backup, added, 'build')?.status, 'pass');
});

test('stale revisions, replaced circuits, deleted wires and missing events do not demonstrate an activity', () => {
  const { activity, document, event } = fixture();
  for (const invalid of [undefined, { ...event, revision: event.revision - 1 }, { ...event, circuitId: 'replaced-circuit' }, { ...event, wireId: 'deleted-wire' }]) {
    assert.equal(evaluateGuidedWireAddition(activity, document, invalid, 'build'), undefined);
  }
  document.wires = [];
  assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build'), undefined);
});

test('other modes, non-connection steps and missing endpoint contracts cannot advance', () => {
  const { activity, document, event } = fixture();
  for (const mode of ['explore', 'challenges']) assert.equal(evaluateGuidedWireAddition(activity, document, event, mode), undefined);
  assert.equal(evaluateGuidedWireAddition(undefined, document, event, 'build'), undefined);
  assert.equal(evaluateGuidedWireAddition({ ...activity, kind: 'operate' }, document, event, 'build'), undefined);
  assert.equal(evaluateGuidedWireAddition({ ...activity, endpoints: [] }, document, event, 'build'), undefined);
});

test('an unrelated or out-of-order addition does not skip the displayed step even when it is already wired', () => {
  const { lesson, activity, document, event } = fixture();
  const later = lesson.circuit.wires.find(wire => wire.id !== activity.wire)!;
  document.wires.push({ ...structuredClone(later), id: 'later-wire' });
  const outOfOrder = { ...event, wireId: 'later-wire' };
  assert.equal(evaluateGuidedWireAddition(activity, document, outOfOrder, 'build'), undefined);
  assert.equal(document.wires[0].id, event.wireId);
});

test('every authored connection in all 64 lessons accepts its own isolated addition, retaining exact roles and endpoints', () => {
  let checked = 0;
  for (const lesson of LESSONS) {
    const document: CircuitDocument = createIsolatedGuidedBuild(lesson.circuit, `guided-${lesson.id}`);
    const activities: LessonActivity[] = getLessonActivities(lesson).filter(activity => activity.kind === 'connect');
    const completeWires = lesson.circuit.wires;
    for (const activity of activities) {
      const wire = structuredClone(completeWires.find(candidate => candidate.id === activity.wire)!);
      wire.id = `learner-${lesson.id}-${checked}`;
      document.wires.push(wire);
      document.revision++;
      const event = { sequence: ++checked, circuitId: document.id, revision: document.revision, wireId: wire.id };
      assert.equal(evaluateGuidedWireAddition(activity, document, event, 'build')?.status, 'pass', `${lesson.id}: ${activity.id}`);
      const next = activities[activities.indexOf(activity) + 1];
      if (next) assert.equal(evaluateGuidedWireAddition(next, document, event, 'build'), undefined, `${lesson.id}: event cannot credit next connection`);
    }
    assert.equal(document.wires.length, lesson.circuit.wires.length);
  }
  assert.equal(checked, 931);
});

test('guided setup isolates all represented sources without mutating equipment, examples or stored formats', () => {
  for (const lesson of LESSONS) {
    const before = structuredClone(lesson.circuit);
    const document = createIsolatedGuidedBuild(lesson.circuit, `isolated-${lesson.id}`);
    assert.equal(document.id, `isolated-${lesson.id}`);
    assert.equal(document.supply.enabled, false);
    assert.deepEqual(document.wires, []);
    assert.deepEqual(document.faults, []);
    assert.equal(document.version, lesson.circuit.version);
    assert.equal(document.revision, lesson.circuit.revision);
    assert.deepEqual(document.components, lesson.circuit.components.map(component => ['pv', 'battery'].includes(component.type)
      ? { ...component, params: { ...component.params, on: false } } : component));
    assert.deepEqual(lesson.circuit, before);
  }
});

test('PV and battery Try steps retain their IDs and require manual restoration of original local-source availability', () => {
  for (const id of [47, 48]) {
    const lesson = LESSONS.find(item => item.id === id)!;
    const activity = getLessonActivities(lesson).find(item => item.id === `lesson:${id}:operate:supply`)!;
    const document = createIsolatedGuidedBuild(lesson.circuit, `guided-energy-${id}`);
    document.wires = structuredClone(lesson.circuit.wires);
    const local = document.components.find(component => ['pv', 'battery'].includes(component.type))!;
    assert.deepEqual(activity.expectedControls, [{ component: local.id, params: { on: true } }]);
    assert.match(activity.instruction, /use Operate to enable its local source/);
    assert.ok(activity.instruction.includes(local.label));
    assert.equal(evaluateActivity(activity, document, simulate(document)).status, 'not-run');
    document.supply.enabled = true;
    assert.equal(evaluateActivity(activity, document, simulate(document)).status, 'not-run', 'External supply alone is not enough.');
    local.params.on = true;
    assert.equal(evaluateActivity(activity, document, simulate(document)).status, 'pass');
    assert.equal(document.wires.length, lesson.circuit.wires.length);
  }
});

test('source instructions follow the original example availability instead of enabling a deliberately disabled local source', () => {
  const lesson = structuredClone(LESSONS.find(item => item.id === 48)!);
  const local = lesson.circuit.components.find(component => component.type === 'battery')!;
  local.params.on = false;
  const activity = getLessonActivities(lesson).find(item => item.id === 'lesson:48:operate:supply')!;
  assert.equal(activity.expectedControls, undefined);
  assert.doesNotMatch(activity.instruction, /enable its local source/);
  const document = createIsolatedGuidedBuild(lesson.circuit, 'disabled-local-example');
  document.wires = structuredClone(lesson.circuit.wires);
  document.supply.enabled = true;
  assert.equal(evaluateActivity(activity, document, simulate(document)).status, 'pass');
  assert.equal(document.components.find(component => component.id === local.id)!.params.on, false);
});

test('isolation instructions retain all 2021 existing activity IDs and only extend two source operating contracts', () => {
  let count = 0;
  const localContracts: number[] = [];
  for (const lesson of LESSONS) {
    const activities = getLessonActivities(lesson);
    const supplyActivities = activities.filter(activity => activity.id.endsWith(':operate:supply'));
    assert.equal(supplyActivities.length, 1);
    assert.equal(supplyActivities[0].expectedSupplyEnabled, true);
    if (supplyActivities[0].expectedControls) localContracts.push(lesson.id);
    assert.equal(new Set(activities.map(activity => activity.id)).size, activities.length);
    count += activities.length;
  }
  assert.equal(count, 2021);
  assert.deepEqual(localContracts, [47, 48]);
});
