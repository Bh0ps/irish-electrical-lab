import test from 'node:test';
import assert from 'node:assert/strict';
import { getLessonActivities, needsSimulationTick } from '../lib/learning.ts';
import { LESSONS } from '../lib/lessons.ts';
import { migrateProgress, recordActivity } from '../lib/progress.ts';
import {
  QUICK_PRACTICE_EXPERIMENTS, chooseQuickPractice, createQuickPracticeCircuit, practiceOnlyControlChanged,
  observeQuickPractice, prepareQuickPractice, type QuickPracticeExperiment,
} from '../lib/quick-practice.ts';
import { simulate } from '../lib/simulation.ts';
import type { CircuitDocument, Parameters } from '../lib/types.ts';

function change(document: CircuitDocument, component: string, params: Parameters): CircuitDocument {
  return { ...document, revision: document.revision + 1, components: document.components.map(item => item.id === component
    ? { ...item, params: { ...item.params, ...params } } : item) };
}

function start(experiment: QuickPracticeExperiment) {
  const initial = createQuickPracticeCircuit(experiment, `practice-${experiment.id}`);
  const solved = simulate(initial);
  const state = prepareQuickPractice(experiment, initial, solved);
  assert.equal(state.status, 'ready', `${experiment.id} starts from a solved example`);
  assert.ok('baseline' in state);
  return { initial, solved, baseline: state.baseline };
}

for (const [index, params, check] of [
  [0, { closed: false }, [0]],
  [1, { position: 1 }, [0, 'L2']],
  [2, { level: .3 }, [5.4]],
  [4, { closed: false }, [0, 240]],
] as const) {
  const experiment = QUICK_PRACTICE_EXPERIMENTS[index];
  test(`${experiment.id} requires a target action and a new, resolved comparison`, () => {
    const { initial, solved, baseline } = start(experiment);
    assert.equal(observeQuickPractice(experiment, baseline, {}, initial, solved).status, 'waiting');
    const moved = { ...initial, revision: initial.revision + 1 };
    assert.equal(observeQuickPractice(experiment, baseline, {}, moved, simulate(moved)).status, 'waiting');
    const next = change(initial, experiment.target, params);
    assert.equal(observeQuickPractice(experiment, baseline, {}, next, solved).status, 'waiting');
    const result = simulate(next, solved.deviceStates);
    assert.equal(observeQuickPractice(experiment, baseline, {}, next, { ...result, converged: false }).status, 'unresolved');
    const outcome = observeQuickPractice(experiment, baseline, {}, next, result);
    assert.equal(outcome.status, 'complete');
    assert.ok('readings' in outcome);
    assert.equal(outcome.revision, next.revision);
    assert.equal(outcome.readings.length, check.length);
    outcome.readings.forEach((reading, i) => {
      const expectation = check[i];
      if (typeof expectation === 'string') assert.equal(reading.value, expectation, reading.label);
      else assert.ok(Math.abs(Number(reading.value) - expectation) < 1, reading.label);
    });
    assert.equal(observeQuickPractice(experiment, baseline, {}, { ...next, id: 'other-circuit' }, result).status, 'unresolved');
    assert.equal(observeQuickPractice(experiment, baseline, {}, { ...next, supply: { ...next.supply, enabled: false } }, result).status, 'unresolved');
    assert.equal(observeQuickPractice(experiment, baseline, {}, { ...next, wires: next.wires.slice(1) }, result).status, 'unresolved');
    assert.equal(prepareQuickPractice(experiment, next, result).status, 'unresolved', 'cannot predict after performing the action');
  });
}

test('PIR comparison requires an observed held-on reading and measured expiry', () => {
  const experiment = QUICK_PRACTICE_EXPERIMENTS[3];
  const { initial, solved, baseline } = start(experiment);
  const edited = change(initial, experiment.target, { on: false, active: false, demand: false });
  let result = simulate(edited, solved.deviceStates, .05);
  const runOn = observeQuickPractice(experiment, baseline, {}, edited, result);
  assert.equal(runOn.status, 'waiting');
  assert.ok(Number(runOn.sequence.during?.[0].value) > 200);

  let ticks = 0;
  while (needsSimulationTick(edited, result) && ticks++ < 30) result = simulate(edited, result.deviceStates, .25);
  assert.ok(ticks >= 14 && ticks <= 18, `the four-second timer settled over ${ticks} ticks`);
  assert.equal(observeQuickPractice(experiment, baseline, {}, edited, result).status, 'unresolved');
  const completed = observeQuickPractice(experiment, baseline, runOn.sequence, edited, result);
  assert.equal(completed.status, 'complete');
  assert.ok('readings' in completed && Number(completed.readings[0].value) < 1);
});

test('a contactor must hold the motor on after the actual Start button is released', () => {
  const experiment = QUICK_PRACTICE_EXPERIMENTS[5];
  const { initial, solved, baseline } = start(experiment);
  const pressed = change(initial, experiment.target, { pressed: true });
  const started = simulate(pressed, solved.deviceStates);
  const held = observeQuickPractice(experiment, baseline, {}, pressed, started);
  assert.equal(held.status, 'waiting');
  assert.equal(held.sequence.pressedRevision, pressed.revision);

  const released = change(pressed, experiment.target, { pressed: false });
  const after = simulate(released, started.deviceStates);
  assert.equal(observeQuickPractice(experiment, baseline, {}, released, after).status, 'waiting', 'a latched motor is not proof of the learner pressing Start');
  assert.equal(observeQuickPractice(experiment, baseline, held.sequence, released, started).status, 'waiting', 'pressed readings cannot be reused');
  assert.equal(observeQuickPractice(experiment, baseline, held.sequence, released, simulate(released)).status, 'unresolved', 'motor did not hold');
  const completion = observeQuickPractice(experiment, baseline, held.sequence, released, after);
  assert.equal(completion.status, 'complete');
  assert.ok('readings' in completion && completion.readings[1].value === 'Running');
});

test('resetting a practice circuit ignores only its expected control adjustments', () => {
  const experiment = QUICK_PRACTICE_EXPERIMENTS[0];
  const { initial } = start(experiment);
  const operated = change(initial, experiment.target, { closed: false });
  assert.ok(practiceOnlyControlChanged(experiment, operated));
  assert.equal(practiceOnlyControlChanged(experiment, { ...operated, name: 'Edited example' }), false);
  assert.equal(practiceOnlyControlChanged(experiment, change(operated, 'light', { watts: 15 })), false);
  assert.equal(practiceOnlyControlChanged(experiment, { ...operated, wires: operated.wires.slice(1) }), false);
});

test('practice starts with one-way lighting, follows eligible reviews and leaves formal achievements separate', () => {
  const [first, second, dimmer] = QUICK_PRACTICE_EXPERIMENTS;
  const empty = migrateProgress(undefined);
  const due = recordActivity(empty, 12, 'lesson:12:predict', 'lighting-control', false);
  assert.equal(chooseQuickPractice(due).id, first.id);
  const firstCompleted = recordActivity(empty, first.lessonId, first.activityId, first.competency, true);
  assert.equal(chooseQuickPractice(firstCompleted).id, second.id);
  const reviewed = recordActivity(firstCompleted, 12, 'lesson:12:predict', 'lighting-control', false);
  assert.equal(chooseQuickPractice(reviewed).id, dimmer.id);
  const addressed = recordActivity(reviewed, dimmer.lessonId, dimmer.activityId, dimmer.competency, true);
  assert.equal(chooseQuickPractice(addressed).id, second.id, 'a completed practice addresses the prior formal review');
  assert.deepEqual(reviewed.builds, []);
  assert.deepEqual(reviewed.faults, []);
  assert.deepEqual(reviewed.lessons, []);
  const allRecent = [...QUICK_PRACTICE_EXPERIMENTS].reverse().reduce((progress, entry, index) =>
    recordActivity(progress, entry.lessonId, entry.activityId, entry.competency, true, Date.now() + index), empty);
  assert.equal(chooseQuickPractice(allRecent).id, QUICK_PRACTICE_EXPERIMENTS.at(-1)?.id);
});

test('lesson prediction cards keep stable IDs and vary answer position', () => {
  const positions = new Set<number>();
  for (const lesson of LESSONS) {
    const prediction = getLessonActivities(lesson).find(activity => activity.kind === 'predict');
    assert.equal(prediction?.id, `lesson:${lesson.id}:predict`);
    const answers = prediction.options?.filter(option => option.id === prediction.answer);
    assert.equal(answers?.length, 1);
    assert.ok(!prediction.instruction.includes(answers[0].label));
    positions.add(prediction.options!.findIndex(option => option.id === prediction.answer));
  }
  assert.deepEqual([...positions].sort(), [0, 1]);
  const oneWay = getLessonActivities(LESSONS[6]).find(activity => activity.kind === 'predict')!;
  assert.match(oneWay.instruction, /wall switch off/i);
  assert.match(oneWay.instruction, /voltage.*lamp/i);
  assert.doesNotMatch(oneWay.instruction, /lamp stops|zero volts|lamp goes (out|dark)/i);
});
