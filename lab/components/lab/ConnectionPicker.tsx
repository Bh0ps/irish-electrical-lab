'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

function focusFirstResult(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.repeat) return;
  const first = event.currentTarget.closest('.point-picker')?.querySelector('.point-list > :first-child');
  const button = first instanceof HTMLButtonElement ? first :
    first?.querySelector<HTMLButtonElement>('.point-list-terminals button') ?? first?.querySelector<HTMLButtonElement>('button');
  if (button) {
    event.preventDefault();
    button.focus();
  }
}

type Probe = 'red' | 'black';
type ProbePoints = Partial<Record<Probe, Endpoint>>;

export function ProbePicker({ circuit, points, active, onProbe, onPick, defaultOpen=false }: {
  circuit: CircuitDocument;
  points: ProbePoints;
  active: Probe;
  onProbe: (probe: Probe) => void;
  onPick: (endpoint: Endpoint) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className="meter-probes">
    <div className="meter-leads" role="group" aria-label="Place meter probes">
      {(['red', 'black'] as const).map(probe => {
        const expanded = open && probe === active;
        return <button type="button" key={probe} aria-controls={id} aria-pressed={active===probe} aria-expanded={expanded} className={'meter-lead '+probe} onClick={() => {
          onProbe(probe);
          setOpen(!expanded);
        }}>
          <strong>{probe === 'red' ? 'Red (+)' : 'Black (COM)'}</strong>
          <span>{describeEndpoint(circuit, points[probe])?.label ?? 'Place probe'}</span>
        </button>;
      })}
    </div>
    <div id={id} hidden={!open}>
      {open && <TerminalPicker circuit={circuit} label={active+' probe terminal'} probes={points} activeProbe={active} onPick={onPick}/>}
    </div>
  </div>;
}

export function TerminalPicker({ circuit, label, onPick, from, nextFitting=false, probes, activeProbe }: {
  circuit: CircuitDocument;
  label: string;
  from?: Endpoint;
  nextFitting?: boolean;
  probes?: ProbePoints;
  activeProbe?: Probe;
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
    <div className={activeProbe ? 'probe-search' : undefined}>
      {activeProbe && <span role="status">{activeProbe === 'red' ? 'Red probe' : 'Black probe'}</span>}
      <Input type="search" enterKeyHint="next" aria-label={activeProbe ? 'Find a terminal for the '+activeProbe+' probe' : 'Search equipment and terminals'} placeholder={activeProbe ? 'Find a terminal' : 'Search equipment or terminal'} value={query}
        onKeyDown={focusFirstResult} onChange={event => { setQuery(event.target.value); setOpenId(undefined); }} />
    </div>
    {groups.length === 0 && <p role="status">{circuit.components.length?'No terminals match. Try the fitting name or a marking such as COM.':'Add a fitting to the bench to see its terminals.'}</p>}
    <div className="point-list">
      {groups.map(({ component, terminals }) => {
        const open = openId === component.id || (openId === undefined && groups.length === 1);
        return <div key={component.id}>
          <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? '' : component.id)}>
            {component.label}<span>{terminals.length} {terminals.length === 1 ? 'terminal' : 'terminals'}</span>
          </button>
          {open && <div className="point-list-terminals">{terminals.map(terminal => {
            const leads = probes && (['red','black'] as const).filter(probe =>
              probes[probe]?.component === component.id && probes[probe]?.terminal === terminal.id);
            return <button type="button" key={terminal.id} aria-pressed={from ? from.component===component.id && from.terminal===terminal.id : undefined} onClick={() => select({ component: component.id, terminal: terminal.id })}>
              <b>{terminal.label}</b><span>{shortRole(component.type,terminal)}{from?.component===component.id&&from.terminal===terminal.id&&<small> · first end</small>}{component.type==='switch2'&&terminal.id.startsWith('T') && <small> · {terminal.id} on drawing</small>}</span>
              {!!leads?.length && <small className="terminal-leads">{leads.length === 2 ? 'Both probes' : leads[0] === 'red' ? 'Red probe' : 'Black probe'}</small>}
            </button>;
          })}</div>}
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
    <Input type="search" enterKeyHint="next" aria-label="Search conductors" placeholder="Search conductors" value={query} onKeyDown={focusFirstResult} onChange={event => setQuery(event.target.value)} />
    {choices.length === 0 && <p role="status">{circuit.wires.length?'No wires match. Try a fitting name or a wire marking.':'There are no connected wires yet. Choose Connect to add one.'}</p>}
    <div className="point-list">{choices.map(({ wire, from, to,core }) =>
      <button type="button" key={wire.id} aria-pressed={wire.id === selected} onClick={() => onPick(wire.id)}>
        <b>{['control','output'].includes(wire.role)?wireNames[wire.role]:wire.role+' · '+wireNames[wire.role]}</b><span>{core&&<small>{core} core · </small>}{from} → {to}</span>
      </button>)}</div>
  </section>;
}
