import { validateCircuit } from './storage';
import type { CircuitDocument } from './types';

/** A lesson keeps its working copy when the same bench is used for Sandbox. */
export interface LessonBookmark {
  version: 1;
  circuit: CircuitDocument;
  activityId: string;
  path: 'coursebook' | 'full';
  mode: 'explore' | 'build' | 'challenges';
  fault?: { hints: number; accepted: boolean; repaired: boolean; scored: boolean };
}

export function validateBookmark(value: unknown): LessonBookmark {
  const b = value as Partial<LessonBookmark> | null;
  if (!b || b.version !== 1 || !['coursebook', 'full'].includes(b.path ?? '') ||
      !['explore', 'build', 'challenges'].includes(b.mode ?? '') ||
      typeof b.activityId !== 'string' || !b.activityId.length || b.activityId.length > 256) {
    throw new Error('The saved lesson position could not be read.');
  }
  const circuit = validateCircuit(b.circuit);
  if (!circuit.lessonId || !new RegExp('^(book|lesson):'+circuit.lessonId+':[a-zA-Z0-9:_-]+$').test(b.activityId)) throw new Error('The saved lesson is missing its course.');
  const fault = b.fault;
  if (fault && (!Number.isInteger(fault.hints) || fault.hints < 0 || fault.hints > 100 ||
      [fault.accepted, fault.repaired, fault.scored].some(flag => typeof flag !== 'boolean') ||
      (fault.repaired && !fault.accepted) || b.mode !== 'challenges')) throw new Error('Invalid saved fault exercise.');
  return { version: 1, circuit, activityId: b.activityId, path: b.path!, mode: b.mode!, ...(fault ? { fault: { ...fault } } : {}) };
}
