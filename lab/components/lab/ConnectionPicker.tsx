'use client';

import { useMemo, useRef, useState } from 'react';
import { COMPONENTS } from '../../lib/components';
import { CABLE_CORE_LABEL } from '../../lib/cables';
import { describeEndpoint } from '../../lib/build-hints';
import { getComponentTerminals } from '../../lib/terminal-layout';
import type { CircuitDocument, Endpoint } from '../../lib/types';
import { Input } from '../ui/input';
import type { ComponentInstance, TerminalDefinition, TerminalRole, Vec3 } from '../../lib/types';

const terminalNames: Record<string,string> = {
  L:'Line', N:'Neutral', PE:'Protective earth', PE2:'Second earth terminal', LIN:'Incoming line', NIN:'Incoming neutral',
  LOUT:'Outgoing line', NOUT:'Outgoing neutral', PEOUT:'Outgoing earth', COM:'Common contact',
  NO:'Normally open contact', NC:'Normally closed contact', A1:'Coil terminal', A2:'Coil return',
  T1:'First strapper', T2:'Second strapper', SL:'Switched line', '+':'Positive', '-':'Negative',
};
const wireNames:Record<TerminalRole,string>={
  L:'Line',N:'Neutral',PE:'Protective earth',L1:'Phase 1',L2:'Phase 2',L3:'Phase 3',
  'DC+':'DC positive','DC-':'DC negative',control:'Control',output:'Output',
};
function shortRole(type:string,t:TerminalDefinition) {
  if(type==='shaveroutlet'||type==='transformer'&&t.role==='output')return 'Isolated AC output';
  if(type==='chime')return 'Bell connection';
  if(type==='vfd'&&t.id==='COM')return 'Control return';
  if(type==='floatvalve'&&t.id==='COM')return 'Common return';
  if(type==='rose')return t.group;
  if(t.role==='DC+')return 'DC positive';if(t.role==='DC-')return 'DC return';
  if(/^L[123](IN|OUT)$/.test(t.id))return (t.id.endsWith('IN')?'Incoming':'Outgoing')+' phase '+t.id[1];
  return terminalNames[t.id] ?? (t.group==='Connections'?undefined:t.group) ?? wireNames[t.role];
}

function matches(query: string, ...text: string[]) {
  return query.trim().toLowerCase().split(/\s+/).every(word => text.join(' ').toLowerCase().includes(word));
}

export function TerminalPicker({ circuit, label, onPick, from, nextFitting=false }: {
  circuit: CircuitDocument;
  label: string;
  from?: Endpoint;
  nextFitting?: boolean;
  onPick: (endpoint: Endpoint) => void;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string>();
  const list=useRef<HTMLElement>(null);
  function select(endpoint:Endpoint) {
    onPick(endpoint);
    if(!nextFitting)return;
    setQuery('');
    setOpenId('');
    // Keep keyboard users in this picker without bringing up a phone keyboard.
    list.current?.focus({preventScroll:true});
  }
  const groups = circuit.components.map(component => ({
    component,
    terminals: getComponentTerminals(component, COMPONENTS[component.type])
    .filter(terminal => matches(query, component.label, COMPONENTS[component.type].name, component.id, terminal.label, terminal.id, shortRole(component.type,terminal)??'', terminal.purpose)),
  })).filter(group => group.terminals.length > 0);

  return <section ref={list} tabIndex={-1} className="point-picker" aria-label={label}>
    <Input type="search" aria-label="Search equipment and terminals" placeholder="Search equipment or terminal" value={query} onChange={event => setQuery(event.target.value)} />
    {groups.length === 0 && <p role="status">{circuit.components.length?'No terminals match. Try the fitting name or a marking such as COM.':'Add a fitting to the bench to see its terminals.'}</p>}
    <div className="point-list">
      {groups.map(({ component, terminals }) => {
        const open = openId === component.id || (openId === undefined && groups.length === 1);
        return <div key={component.id}>
          <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? '' : component.id)}>
            {component.label}<span>{terminals.length} {terminals.length === 1 ? 'terminal' : 'terminals'}</span>
          </button>
          {open && <div className="point-list-terminals">{terminals.map(terminal =>
            <button type="button" key={terminal.id} aria-pressed={from ? from.component===component.id && from.terminal===terminal.id : undefined} onClick={() => select({ component: component.id, terminal: terminal.id })}>
              <b>{terminal.label}</b><span>{shortRole(component.type,terminal)}{from?.component===component.id&&from.terminal===terminal.id&&<small> · first end</small>}{component.type==='switch2'&&terminal.id.startsWith('T') && <small> · {terminal.id} on drawing</small>}</span>
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

export function EquipmentList({circuit,onSelect,onOperate,operable,states,tags,selected}:{circuit:CircuitDocument;tags?:Record<string,string>;selected?:string;
  onSelect:(id:string)=>void;onOperate:(c:ComponentInstance)=>void;operable:(c:ComponentInstance)=>boolean;
  states:Record<string,string|undefined>}) {
  const [query,setQuery]=useState('');
  const items=circuit.components.filter(c=>matches(query,c.label,COMPONENTS[c.type].name,tags?.[c.id]??''));
  return <section aria-label="Equipment on the bench" className="equipment-list-view">
    <h2>Equipment on the bench</h2>
    <Input type="search" aria-label="Find equipment on the bench" placeholder="Find equipment" value={query} onChange={e=>setQuery(e.target.value)}/>
    <ul>{items.map(c=><li key={c.id} data-picked={selected===c.id}><div>{tags?.[c.id]&&<small className="installation-tag">{tags[c.id]}</small>}<strong>{c.label}</strong>{states[c.id]&&<small>{states[c.id]}</small>}</div>
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
  const conductors = useMemo(()=>circuit.wires.map(wire => ({
    wire,
    from: describeEndpoint(circuit, wire.from)?.label ?? wire.from.terminal,
    to: describeEndpoint(circuit, wire.to)?.label ?? wire.to.terminal,
    core: wire.cable ? CABLE_CORE_LABEL[wire.cable.core] : '',
  })),[circuit]);
  const choices=conductors.filter(({wire,from,to,core})=>matches(query,wire.role,wireNames[wire.role],from,to,core));

  return <section className="point-picker" aria-label="Choose a conductor">
    <Input type="search" aria-label="Search conductors" placeholder="Search conductors" value={query} onChange={event => setQuery(event.target.value)} />
    {choices.length === 0 && <p role="status">{circuit.wires.length?'No wires match. Try a fitting name or a wire marking.':'There are no connected wires yet. Choose Connect to add one.'}</p>}
    <div className="point-list">{choices.map(({ wire, from, to,core }) =>
      <button type="button" key={wire.id} aria-pressed={wire.id === selected} onClick={() => onPick(wire.id)}>
        <b>{['control','output'].includes(wire.role)?wireNames[wire.role]:wire.role+' · '+wireNames[wire.role]}</b><span>{core&&<small>{core} core · </small>}{from} → {to}</span>
      </button>)}</div>
  </section>;
}
