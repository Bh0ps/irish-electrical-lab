import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { LESSONS } from '../lib/lessons.ts';
import { getLessonActivities, type LessonActivity } from '../lib/learning.ts';
import { getLessonStages } from '../lib/lesson-stages.ts';

const approvedStages = ['look', 'predict', 'build', 'try', 'measure', 'fix'] as const;
const approvedKinds: Record<typeof approvedStages[number], LessonActivity['kind'][]> = {
  look: ['inspect'], predict: ['predict'], build: ['connect'], try: ['operate'],
  measure: ['measure', 'explain'], fix: ['repair', 'retest'],
};
const errors: string[] = [];
const lessons = LESSONS.map(lesson => {
  const original = getLessonActivities(lesson), stages = getLessonStages(lesson), grouped = stages.flatMap(stage => stage.activities);
  const byId = new Map(original.map(activity => [activity.id, activity]));
  const groupedIds = grouped.map(activity => activity.id), uniqueIds = new Set(groupedIds);
  const missingIds = original.filter(activity => !uniqueIds.has(activity.id)).map(activity => activity.id);
  const unknownIds = groupedIds.filter(id => !byId.has(id));
  const duplicateIds = groupedIds.filter((id, index) => groupedIds.indexOf(id) !== index);
  const recognizedStagesOnly = isDeepStrictEqual(stages.map(stage => stage.id), [...approvedStages]);
  const evaluatorContractsPreserved = grouped.every(activity => isDeepStrictEqual(activity, byId.get(activity.id)));
  const stageDetails = stages.map(stage => {
    const allowedKinds = approvedKinds[stage.id] ?? [];
    const expectedOrder = original.filter(activity => allowedKinds.includes(activity.kind)).map(activity => activity.id);
    const originalOrderPreserved = isDeepStrictEqual(stage.activities.map(activity => activity.id), expectedOrder);
    if (!stage.activities.length || !originalOrderPreserved) errors.push(`Lesson ${lesson.id}: empty or reordered ${stage.id} stage.`);
    return { id: stage.id, title: stage.title, count: stage.activities.length,
      activityKinds: [...new Set(stage.activities.map(activity => activity.kind))],
      activityIds: stage.activities.map(activity => activity.id), originalOrderPreserved };
  });
  const mappedExactlyOnce = grouped.length === original.length && uniqueIds.size === original.length && !missingIds.length && !unknownIds.length && !duplicateIds.length;
  if (!recognizedStagesOnly || !mappedExactlyOnce || !evaluatorContractsPreserved) errors.push(`Lesson ${lesson.id}: stage partition or evaluator contract changed.`);
  return { id: lesson.id, title: lesson.title, originalActivityCount: original.length, mappedActivityCount: grouped.length,
    recognizedStagesOnly, mappedExactlyOnce, evaluatorActivityIdsPreserved: mappedExactlyOnce, evaluatorContractsPreserved,
    stageCounts: Object.fromEntries(stageDetails.map(stage => [stage.id, stage.count])),
    missingIds, unknownIds, duplicateIds, stages: stageDetails };
});
const activityCount = lessons.reduce((count, lesson) => count + lesson.originalActivityCount, 0);
if (lessons.length !== 64 || activityCount !== 2021) errors.push(`Expected 64 lessons and 2021 activities; received ${lessons.length} and ${activityCount}.`);
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS',
  coverage: { lessons: lessons.length, stagesPerLesson: approvedStages.length, stageGroups: lessons.reduce((count, lesson) => count + lesson.stages.length, 0),
    originalActivities: activityCount, mappedActivities: lessons.reduce((count, lesson) => count + lesson.mappedActivityCount, 0),
    approvedStageIds: approvedStages, allIdsMappedExactlyOnce: lessons.every(lesson => lesson.mappedExactlyOnce),
    evaluatorActivityIdsPreserved: lessons.every(lesson => lesson.evaluatorActivityIdsPreserved),
    evaluatorContractsPreserved: lessons.every(lesson => lesson.evaluatorContractsPreserved),
    originalOrderPreservedWithinStages: lessons.every(lesson => lesson.stages.every(stage => stage.originalOrderPreserved)) },
  errors, lessons, limitations: [
    'This is a structural audit of course grouping and complete evaluator-input preservation; it does not replace electrical, measurement-evidence or installed interaction tests.',
    'Evaluator IDs are the existing LessonActivity.id values. The grouping introduces no separate evaluator or competence-completion IDs.',
    'Stage navigation and past achievement indicators do not provide evidence or credit for the current circuit.',
  ] };
const target = fileURLToPath(new URL('../../verification/lesson-stage-report.json', import.meta.url));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ target, status: report.status, coverage: report.coverage, errors }));
process.exitCode = errors.length ? 1 : 0;
