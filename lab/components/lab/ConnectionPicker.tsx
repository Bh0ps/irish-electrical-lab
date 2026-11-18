'use client';

import { useState } from 'react';
import { COMPONENTS } from '../../lib/components';
import { describeEndpoint } from '../../lib/build-hints';
import { getComponentTerminals } from '../../lib/terminal-layout';
import type { CircuitDocument, Endpoint } from '../../lib/types';
import { Input } from '../ui/input';
import type { ComponentInstance, TerminalDefinition, Vec3 } from '../../lib/types';

const terminalNames: Record<string,string> = {
  L:'Line', N:'Neutral', PE:'Protective earth', LIN:'Incoming line', NIN:'Incoming neutral',
  LOUT:'Outgoing line', NOUT:'Outgoing neutral', PEOUT:'Outgoing earth', COM:'Common contact',
  NO:'Normally open contact', NC:'Normally closed contact', A1:'Coil terminal', A2:'Coil return',
  T1:'First traveller', T2:'Second traveller', SL:'Switched line', '+':'Positive', '-':'Negative',
};
function shortRole(t:TerminalDefinition) {
  return terminalNames[t.id] ?? t.group ?? t.role;
}

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
      .filter(terminal => matches(query, component.label, component.id, terminal.label, terminal.id, shortRole(terminal), terminal.purpose)),
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
              <b>{terminal.label}</b><span>{shortRole(terminal)}{terminal.label!==terminal.id && <small> · {terminal.id}</small>}</span>
            </button>)}</div>}
        </div>;
      })}
    </div>
  </section>;
}

/** Uses the real housing footprint; placement via a list must also avoid occupied positions. */
export function nextFreePosition(doc: CircuitDocument, type: string): Vec3 {
  const size = COMPONENTS[type].size;
  const free = (x:number,z:number) => doc.components.every(c => {
    const [w,,d] = COMPONENTS[c.type].size;
    const cos = Math.abs(Math.cos(c.rotation)), sin = Math.abs(Math.sin(c.rotation));
    return Math.abs(x-c.position[0]) >= (size[0]+w*cos+d*sin)/2+.25 ||
      Math.abs(z-c.position[2]) >= (size[2]+d*cos+w*sin)/2+.25;
  });
  for (let radius=0; radius<=20; radius++) {
    for(let z=-radius;z<=radius;z++) for(let x=-radius;x<=radius;x++) {
      if(Math.max(Math.abs(x),Math.abs(z))===radius && free(2*x,2*z)) return [2*x,0,2*z];
    }
  }
  return [Math.max(0,...doc.components.map(c=>c.position[0]+Math.max(...COMPONENTS[c.type].size)))+size[0],0,0];
}

export function EquipmentList({circuit,onSelect,onOperate,operable,states}:{circuit:CircuitDocument;
  onSelect:(id:string)=>void;onOperate:(c:ComponentInstance)=>void;operable:(c:ComponentInstance)=>boolean;
  states:Record<string,string|undefined>}) {
  const [query,setQuery]=useState('');
  const items=circuit.components.filter(c=>matches(query,c.label,COMPONENTS[c.type].name));
  return <section aria-label="Equipment on the bench" className="equipment-list-view">
    <h2>Equipment on the bench</h2>
    <Input type="search" aria-label="Find equipment on the bench" placeholder="Find equipment" value={query} onChange={e=>setQuery(e.target.value)}/>
    <ul>{items.map(c=><li key={c.id}><div><strong>{c.label}</strong>{states[c.id]&&<small>{states[c.id]}</small>}</div>
      <button onClick={()=>onSelect(c.id)} aria-label={'Inspect '+c.label}>Inspect</button>
      {operable(c)&&<button onClick={()=>onOperate(c)} aria-label={'Operate '+c.label}>Operate</button>}</li>)}</ul>
    {!items.length&&<p>{circuit.components.length?'No matching equipment.':'Choose Add equipment to place your first item.'}</p>}
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
