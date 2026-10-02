import { evaluateActivity, type ActivityOutcome, type LessonActivity } from './learning.ts';
import { connectionKey } from './wire-connections.ts';
import type { CircuitDocument } from './types.ts';

/** A deliberate terminal-to-terminal addition, separate from loaded/undone graphs. */
export interface GuidedWireAddition {
  sequence: number;
  circuitId: string;
  revision: number;
  wireId: string;
}

/** Start wiring with every represented source isolated, preserving the example. */
export function createIsolatedGuidedBuild(example: CircuitDocument, id: string): CircuitDocument {
  const document = structuredClone(example);
  document.id = id;
  document.supply.enabled = false;
  document.wires = [];
  document.faults = [];
  for (const component of document.components) if (component.type === 'pv' || component.type === 'battery') {
    component.params.on = false;
  }
  return document;
}

/** Validate only the wire just added against the currently displayed build task.
 * The panel consumes each event once; navigation and existing example wires do
 * not produce events. Connection evidence uses the original activity evaluator.
 */
export function evaluateGuidedWireAddition(
  activity: LessonActivity | undefined,
  document: CircuitDocument,
  event: GuidedWireAddition | undefined,
  mode: string,
): ActivityOutcome | undefined {
  if (mode !== 'build' || activity?.kind !== 'connect' || !event
    || event.circuitId !== document.id || event.revision !== document.revision) return undefined;
  const wire = document.wires.find(candidate => candidate.id === event.wireId);
  const [a, b] = activity.endpoints ?? [];
  if (!wire || !a || !b) return undefined;
  if (connectionKey(wire.from, wire.to) !== connectionKey(a, b)) return undefined;

  const outcome = evaluateActivity(activity, document, undefined);
  // Whole-graph matching can find an older correct duplicate. Auto feedback
  // must describe the actual addition, while retaining the isolation guard.
  if (outcome.status === 'pass' && wire.role !== activity.expectedRole) return {
    status: 'fail', explanation: 'The endpoints match, but conductor identification differs from this lesson.',
  };
  return outcome;
}
