import { getLessonActivities, type LessonActivity } from './learning.ts';
import type { CircuitDocument, ConfigurationLesson } from './types.ts';

export type LessonStageId = 'look' | 'predict' | 'build' | 'try' | 'measure' | 'fix';
export interface LessonStage {
  id: LessonStageId;
  title: string;
  description: string;
  activities: LessonActivity[];
}

export const LESSON_STAGE_ORDER: readonly LessonStageId[] = ['look', 'predict', 'build', 'try', 'measure', 'fix'];
const STAGES: Record<LessonStageId, { title: string; description: string }> = {
  look: { title: 'Look', description: 'Find the equipment and learn what its parts do.' },
  predict: { title: 'Predict', description: 'Decide what you expect before trying it.' },
  build: { title: 'Build', description: 'Connect the actual terminals with the simulated sources isolated.' },
  try: { title: 'Try', description: 'Operate the controls and observe their response.' },
  measure: { title: 'Measure', description: 'Record real simulated readings and explain what they show.' },
  fix: { title: 'Fix', description: 'Investigate a fault, repair its cause and retest.' },
};
const ACTIVITY_STAGE: Record<LessonActivity['kind'], LessonStageId> = {
  inspect: 'look', predict: 'predict', connect: 'build', operate: 'try',
  measure: 'measure', explain: 'measure', repair: 'fix', retest: 'fix',
};

export function getActivityStage(activity: Pick<LessonActivity, 'kind'>): LessonStageId {
  return ACTIVITY_STAGE[activity.kind];
}

/** Presentation groups retain every original task and its evidence contract. */
export function groupLessonActivities(activities: readonly LessonActivity[]): LessonStage[] {
  return LESSON_STAGE_ORDER.map(id => ({
    id, ...STAGES[id], activities: activities.filter(activity => getActivityStage(activity) === id),
  }));
}

export function getLessonStages(lesson: ConfigurationLesson): LessonStage[] {
  return groupLessonActivities(getLessonActivities(lesson));
}

/** These are past achievements, never evidence that a current circuit was checked. */
export function getStageProgress(stage: LessonStage, activityIds: readonly string[]): { demonstrated: number; total: number } {
  const achieved = new Set(activityIds);
  return { demonstrated: stage.activities.filter(activity => achieved.has(activity.id)).length, total: stage.activities.length };
}

export function activityCheckKey(document: Pick<CircuitDocument, 'id' | 'revision'>, activity: Pick<LessonActivity, 'id'>): string {
  return `${document.id}:${document.revision}:${activity.id}`;
}

export type LessonPrimaryAction = 'next' | 'build' | 'challenge' | 'test' | 'record' | 'check';
export function getLessonPrimaryAction(activity: LessonActivity, state: {
  currentAccepted: boolean; mode: string; challengeStarted: boolean; assessmentCurrent: boolean;
  canRecord?: boolean; measurementRecorded?: boolean;
}): LessonPrimaryAction {
  if (state.currentAccepted) return 'next';
  if (activity.kind === 'connect' && state.mode !== 'build') return 'build';
  if (activity.kind === 'repair' && !state.challengeStarted) return 'challenge';
  if (activity.kind === 'measure' && state.canRecord && !state.measurementRecorded) return 'record';
  const comparison = activity.kind === 'operate' && activity.expectedObservations?.some(observation => observation.kind === 'total-power' || observation.kind === 'power' && observation.relative);
  if ((activity.kind === 'retest' || comparison) && !state.assessmentCurrent) return 'test';
  return 'check';
}
