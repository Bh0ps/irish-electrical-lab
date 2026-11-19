import { COURSE_BOND_ID } from './board-examples.ts';
import { describeEndpoint } from './build-hints.ts';
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
  document.wires = document.wires.filter(w=>w.id===COURSE_BOND_ID);
  delete document.cableRuns;
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
  example?: CircuitDocument,
): ActivityOutcome | undefined {
  if (mode !== 'build' || activity?.kind !== 'connect' || !event
    || event.circuitId !== document.id || event.revision !== document.revision) return undefined;
  const wire = document.wires.find(candidate => candidate.id === event.wireId);
  const [a, b] = activity.endpoints ?? [];
  if (!wire || !a || !b) return undefined;
  const addedPair = connectionKey(wire.from, wire.to);
  if (addedPair !== connectionKey(a, b)) {
    if (!example || example.lessonId !== document.lessonId) return undefined;
    const elsewhere = example.wires.some(w => connectionKey(w.from, w.to) === addedPair && w.role === wire.role);
    if (elsewhere) return { status: 'not-run', explanation: 'That wire belongs to another step. You can leave it in place and make the connection shown above.' };
    const from = describeEndpoint(document, wire.from), to = describeEndpoint(document, wire.to);
    if (!from || !to) return { status: 'unresolved', explanation: 'The lab can’t find both ends of this wire. Undo it and pick the terminals again.' };
    const roles = [from.role, to.role];
    const reason = roles.includes('N') && roles.includes('PE') ? 'That joins neutral to earth.' : 'This step uses a different pair.';
    return { status: 'fail', explanation: `Your wire joins ${from.label} to ${to.label}. ${reason}` };
  }

  const outcome = evaluateActivity(activity, document, undefined);
  // Whole-graph matching can find an older correct duplicate. Auto feedback
  // must describe the actual addition, while retaining the isolation guard.
  if (outcome.status === 'pass' && wire.role !== activity.expectedRole) return {
    status: 'fail', explanation: 'The wire joins the right terminals. Check its marking against the one in this step.',
  };
  return outcome;
}
