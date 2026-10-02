import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../lib/lessons.ts';
import { getLessonActivities, evaluateActivity, captureMeasurement } from '../lib/learning.ts';
import { LESSON_STAGE_ORDER, activityCheckKey, getActivityStage, getLessonPrimaryAction, getLessonStages, getStageProgress } from '../lib/lesson-stages.ts';
import { emptyLearningRecord } from '../lib/progress.ts';
import { simulate } from '../lib/simulation.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LearningPanel from '../components/lab/LearningPanel.tsx';

test('all 64 courses retain all 2021 activity IDs exactly once in six stable ordered groups', () => {
  let count = 0;
  for (const lesson of LESSONS) {
    const original = getLessonActivities(lesson), before = structuredClone(original), stages = getLessonStages(lesson);
    assert.deepEqual(stages.map(stage => stage.id), LESSON_STAGE_ORDER);
    const grouped = stages.flatMap(stage => stage.activities);
    assert.equal(grouped.length, original.length);
    assert.equal(new Set(grouped.map(activity => activity.id)).size, original.length);
    assert.deepEqual(new Set(grouped.map(activity => activity.id)), new Set(original.map(activity => activity.id)));
    for (const stage of stages) {
      assert.ok(stage.activities.length > 0, `${lesson.id}: empty ${stage.id}`);
      assert.deepEqual(stage.activities, original.filter(activity => getActivityStage(activity) === stage.id));
    }
    assert.deepEqual(original, before);
    count += grouped.length;
  }
  assert.equal(count, 2021);
});

test('past stage achievements remain historical and do not provide a current verification', () => {
  const lesson = LESSONS.find(item => item.id === 7)!, stage = getLessonStages(lesson)[0], record = emptyLearningRecord();
  record.activityIds = stage.activities.map(activity => activity.id);
  const before = structuredClone(record);
  assert.deepEqual(getStageProgress(stage, record.activityIds), { demonstrated: stage.activities.length, total: stage.activities.length });
  assert.equal(getLessonPrimaryAction(stage.activities[0], { currentAccepted: false, mode: 'explore', challengeStarted: false, assessmentCurrent: false }), 'check');
  const activity = stage.activities[0], document = structuredClone(lesson.circuit);
  const key = activityCheckKey(document, activity);
  document.revision++;
  assert.notEqual(activityCheckKey(document, activity), key);
  document.revision--;
  document.id = 'another-circuit';
  assert.notEqual(activityCheckKey(document, activity), key);
  assert.notEqual(activityCheckKey(lesson.circuit, stage.activities[1]), key);
  assert.deepEqual(record, before);
});

test('the one primary action handles prerequisites without automatically crediting any step', () => {
  const activities = getLessonActivities(LESSONS.find(item => item.id === 7)!);
  const base = { currentAccepted: false, mode: 'explore', challengeStarted: false, assessmentCurrent: false };
  const connection = activities.find(activity => activity.kind === 'connect')!;
  assert.equal(getLessonPrimaryAction(connection, base), 'build');
  assert.equal(getLessonPrimaryAction(connection, { ...base, mode: 'build' }), 'check');
  const repair = activities.find(activity => activity.kind === 'repair')!;
  assert.equal(getLessonPrimaryAction(repair, base), 'challenge');
  assert.equal(getLessonPrimaryAction(repair, { ...base, challengeStarted: true }), 'check');
  const retest = activities.find(activity => activity.kind === 'retest')!;
  assert.equal(getLessonPrimaryAction(retest, base), 'test');
  assert.equal(getLessonPrimaryAction(retest, { ...base, assessmentCurrent: true }), 'check');
  assert.equal(getLessonPrimaryAction(retest, { ...base, currentAccepted: true }), 'next');
  const dimmer = getLessonActivities(LESSONS.find(item => item.id === 12)!).find(activity => activity.expectedObservations?.some(observation => observation.kind === 'power' && observation.relative))!;
  assert.equal(getLessonPrimaryAction(dimmer, base), 'test');
  assert.equal(getLessonPrimaryAction(dimmer, { ...base, assessmentCurrent: true }), 'check');
});

test('stage presentation preserves isolated connections, real readings and fault-evidence gates', () => {
  const lesson = LESSONS.find(item => item.id === 7)!, stages = getLessonStages(lesson), document = structuredClone(lesson.circuit);
  const connection = stages.find(stage => stage.id === 'build')!.activities[0];
  assert.equal(evaluateActivity(connection, document, simulate(document)).status, 'not-run');
  document.supply.enabled = false;
  assert.equal(evaluateActivity(connection, document, simulate(document)).status, 'pass');
  document.supply.enabled = true;
  const result = simulate(document), measurement = stages.find(stage => stage.id === 'measure')!.activities.find(activity => activity.measurement?.mode === 'voltage')!;
  assert.equal(evaluateActivity(measurement, document, result).status, 'not-run');
  const reading = captureMeasurement(document, result, measurement.measurement!);
  assert.equal(evaluateActivity(measurement, document, result, [reading]).status, 'pass');
  document.revision++;
  assert.equal(evaluateActivity(measurement, document, simulate(document), [reading]).status, 'not-run');
  const repair = stages.find(stage => stage.id === 'fix')!.activities[0];
  assert.equal(evaluateActivity(repair, document, simulate(document)).status, 'not-run');
  assert.equal(evaluateActivity(repair, document, simulate(document), [], undefined, { challengeStarted: true, diagnosisAccepted: false, repairVerified: true }).status, 'not-run');
});

test('measurement primary records actual target evidence before an explicit check and rejects stale or unrelated readings', () => {
  const lesson = LESSONS.find(item => item.id === 7)!, document = structuredClone(lesson.circuit), result = simulate(document);
  const activity = getLessonActivities(lesson).find(item => item.measurement?.mode === 'voltage')!;
  const state = { currentAccepted: false, mode: 'build', challengeStarted: false, assessmentCurrent: false, canRecord: true };
  const action = (evidence: ReturnType<typeof captureMeasurement>[]) => getLessonPrimaryAction(activity, {
    ...state, measurementRecorded: evaluateActivity(activity, document, result, evidence).status === 'pass',
  });
  assert.equal(action([]), 'record');
  const unrelated = captureMeasurement(document, result, { mode: 'current', wire: document.wires[0].id });
  assert.equal(action([unrelated]), 'record');
  const target = captureMeasurement(document, result, activity.measurement!);
  assert.equal(action([target]), 'check');
  assert.equal(getLessonPrimaryAction(activity, { ...state, measurementRecorded: true, currentAccepted: true }), 'next');
  document.revision++;
  assert.equal(action([target]), 'record');
  assert.equal(getLessonPrimaryAction(activity, { ...state, canRecord: false }), 'check');
});

test('the lesson keeps its instruction alongside context with one primary action and six stage choices', () => {
  const lesson = LESSONS.find(item => item.id === 7)!, noop = () => undefined;
  const html = renderToStaticMarkup(createElement(LearningPanel, {
    lesson, document: lesson.circuit, selectedPart: 'body', record: emptyLearningRecord(), evidence: [],
    depth: 'foundation', challengeStarted: false, mode: 'explore', diagnosisAccepted: false, challengeRepaired: false,
    onActivityChange: noop, onTarget: noop, onAttempt: noop, onMeasure: noop,
    onBuild: noop, onTest: noop, onChallenge: noop, onStudied: noop, onReference: noop,
    context: createElement('div', { 'data-test-context': true }, 'Contextual equipment controls'),
  }));
  assert.equal((html.match(/data-lesson-stage=/g) ?? []).length, 6);
  assert.equal((html.match(/data-learning-primary=/g) ?? []).length, 1);
  assert.ok(html.indexOf('task-instruction') < html.indexOf('data-test-context'));
  assert.ok(html.indexOf('data-test-context') < html.indexOf('data-learning-primary'));
  assert.match(html, /data-stage-id="look"/);
  assert.match(html, /<summary>More detail<\/summary>/);
  assert.doesNotMatch(html, /<h2>/);
});
