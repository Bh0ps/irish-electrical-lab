'use client';

import { useState } from 'react';
import { COMPONENTS } from '../../lib/components';
import { describeEndpoint } from '../../lib/build-hints';
import { getComponentTerminals } from '../../lib/terminal-layout';
import type { CircuitDocument, Endpoint } from '../../lib/types';
import { Input } from '../ui/input';

function matches(query: string, ...text: string[]) {
  return query.trim().toLowerCase().split(/\s+/).every(word => text.join(' ').toLowerCase().includes(word));
}

export function TerminalPicker({ circuit, label, onPick }: {
  circuit: CircuitDocument;
  label: string;
  onPick: (endpoint: Endpoint) => void;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string>();
  const groups = circuit.components.map(component => ({
    component,
    terminals: getComponentTerminals(component, COMPONENTS[component.type])
      .filter(terminal => matches(query, component.label, component.id, terminal.label, terminal.id, terminal.purpose)),
  })).filter(group => group.terminals.length > 0);

  return <section className="point-picker" aria-label={label}>
    <Input type="search" aria-label="Search equipment and terminals" placeholder="Search equipment or terminal" value={query} onChange={event => setQuery(event.target.value)} />
    {groups.length === 0 && <p>No matching terminals.</p>}
    <div className="point-list">
      {groups.map(({ component, terminals }) => {
        const open = openId === component.id || (openId === undefined && groups.length === 1);
        return <div key={component.id}>
          <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? '' : component.id)}>
            {component.label}<span>{terminals.length} {terminals.length === 1 ? 'terminal' : 'terminals'}</span>
          </button>
          {open && <div className="point-list-terminals">{terminals.map(terminal =>
            <button type="button" key={terminal.id} onClick={() => onPick({ component: component.id, terminal: terminal.id })}>
              <b>{terminal.label}</b><span>{terminal.purpose}</span>
            </button>)}</div>}
        </div>;
      })}
    </div>
  </section>;
}

export function ConductorPicker({ circuit, selected, onPick }: {
  circuit: CircuitDocument;
  selected?: string;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const choices = circuit.wires.map(wire => ({
    wire,
    from: describeEndpoint(circuit, wire.from)?.label ?? wire.from.terminal,
    to: describeEndpoint(circuit, wire.to)?.label ?? wire.to.terminal,
  })).filter(({ wire, from, to }) => matches(query, wire.role, from, to));

  return <section className="point-picker" aria-label="Choose a conductor">
    <Input type="search" aria-label="Search conductors" placeholder="Search conductors" value={query} onChange={event => setQuery(event.target.value)} />
    {choices.length === 0 && <p>No matching conductors.</p>}
    <div className="point-list">{choices.map(({ wire, from, to }) =>
      <button type="button" key={wire.id} aria-pressed={wire.id === selected} onClick={() => onPick(wire.id)}>
        <b>{wire.role}</b><span>{from} → {to}</span>
      </button>)}</div>
  </section>;
}
