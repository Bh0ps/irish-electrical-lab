import { COMPONENTS } from './components';
import { getComponentTerminals } from './terminal-layout';
import { endpointKey, type CircuitDocument, type Endpoint, type TerminalRole, type Wire } from './types';

/** Conductors are undirected terminal pairs; drawing direction and IDs are presentation. */
export function connectionKey(from: Endpoint, to: Endpoint): string {
  return JSON.stringify([endpointKey(from), endpointKey(to)].sort());
}

export function matchingConnectionWires(wires: readonly Wire[], from: Endpoint, to: Endpoint): Wire[] {
  const key = connectionKey(from, to);
  return wires.filter(wire => connectionKey(wire.from, wire.to) === key);
}

export function findConnectionWire(wires: readonly Wire[], from: Endpoint, to: Endpoint, role?: string): Wire | undefined {
  const matches = matchingConnectionWires(wires, from, to);
  return (role === undefined ? undefined : matches.find(wire => wire.role === role)) ?? matches[0];
}

export interface LessonWireMatch { expected: Wire; actual?: Wire }

/**
 * Match the exact endpoint/identification multiset before reporting mismatched
 * identifications. Every actual conductor is consumed at most once; duplicates
 * remain extras rather than disappearing because another wire already matches.
 */
export function matchLessonWires(actual: readonly Wire[], expected: readonly Wire[]): { matches: LessonWireMatch[]; extras: Wire[] } {
  const available = new Map<string, Wire[]>();
  for (const wire of actual) {
    const key = connectionKey(wire.from, wire.to), bucket = available.get(key) ?? [];
    bucket.push(wire); available.set(key, bucket);
  }
  const matches: LessonWireMatch[] = expected.map(wire => ({ expected: wire }));
  for (const match of matches) {
    const bucket = available.get(connectionKey(match.expected.from, match.expected.to));
    const index = bucket?.findIndex(wire => wire.role === match.expected.role) ?? -1;
    if (bucket && index >= 0) match.actual = bucket.splice(index, 1)[0];
  }
  for (const match of matches) if (!match.actual) {
    match.actual = available.get(connectionKey(match.expected.from, match.expected.to))?.shift();
  }
  return { matches, extras: [...available.values()].flat() };
}

function terminalRole(document: CircuitDocument, endpoint: Endpoint): TerminalRole | undefined {
  const component = document.components.find(item => item.id === endpoint.component);
  const definition = component && COMPONENTS[component.type];
  return component && definition ? getComponentTerminals(component, definition).find(terminal => terminal.id === endpoint.terminal)?.role : undefined;
}

/**
 * Suggest identification for a NEW wire. An attached lesson's exact terminal
 * pair is authoritative: a control wire may start at a line supply or a COM
 * contact. This never edits existing wires and must only be used when the
 * learner has not explicitly chosen an identification for the pending wire.
 * A wrong pair stays wrong even when its identification is plausible.
 */
export function suggestWireRole(document: CircuitDocument, from: Endpoint, to?: Endpoint, expected?: CircuitDocument): TerminalRole {
  if (to && expected && document.lessonId !== undefined && document.lessonId === expected.lessonId) {
    const candidates = matchingConnectionWires(expected.wires, from, to);
    if (candidates.length) {
      const unmatched = matchLessonWires(document.wires, candidates).matches.find(match => !match.actual);
      return unmatched?.expected.role ?? candidates[0].role;
    }
  }
  const fromRole = terminalRole(document, from), toRole = to && terminalRole(document, to);
  if (!toRole) return fromRole ?? 'L';
  // Explicit protective terminals keep their identity even for an incorrect
  // N–PE link. The solver and matching checks still report the actual fault.
  if (fromRole === 'PE' || toRole === 'PE') return 'PE';
  if (fromRole === 'N' && toRole === 'N') return 'N';
  if (fromRole === 'control' || toRole === 'control') return 'control';
  return fromRole ?? toRole;
}
