import { COMPONENTS } from './components';
import { getComponentTerminals } from './terminal-layout';
import type { CircuitDocument, Endpoint, TerminalRole } from './types';

export interface EndpointDescription {
  endpoint: Endpoint;
  equipmentName: string;
  terminalLabel: string;
  /** Includes its bank when two terminals carry the same printed mark. */
  pointLabel: string;
  role: TerminalRole;
  purpose: string;
  group?: string;
  label: string;
}

/** Describe the physical endpoint being considered, without predicting a connection. */
export function describeEndpoint(document: CircuitDocument, endpoint?: Endpoint): EndpointDescription | undefined {
  if (!endpoint) return undefined;
  const component = document.components.find(item => item.id === endpoint.component);
  const definition = component && COMPONENTS[component.type];
  if (!component || !definition) return undefined;
  const terminals = getComponentTerminals(component, definition);
  const terminal = terminals.find(item => item.id === endpoint.terminal);
  if (!terminal) return undefined;
  const sameMark = terminals.filter(t=>t.label===terminal.label);
  const bank = terminal.group&&sameMark.filter(t=>t.group===terminal.group).length===1 ? terminal.group : terminal.id;
  const pointLabel = sameMark.length>1 ? `${terminal.label} · ${bank}` : terminal.label;
  return {
    endpoint: { ...endpoint }, equipmentName: component.label, terminalLabel: terminal.label, pointLabel,
    role: terminal.role, purpose: terminal.purpose, ...(terminal.group ? { group: terminal.group } : {}),
    label: `${component.label} · ${pointLabel}`,
  };
}
