'use client';
import {useEffect,useRef} from 'react';
import { cableCores, cableKinds, CABLE_CORE_LABEL, CABLE_LABEL, type CableChoice } from '../../lib/cables';
import type { CableKind, CircuitDocument } from '../../lib/types';
import './cable-picker.css';

const descriptions:Record<CableKind,string> = {
  'bell-pair':'Two small solid cores in a pale sheath. This sample uses a red and a white core.',
  'led-pair':'Two flexible stranded cores in a narrow flat profile. Read the pad markings before connecting.',
  'multi-strip':'Four cores in a ribbon. The common and two channel returns can share a cable. Leave the spare core open.',
  single: 'One insulated conductor.',
  flat: 'Three insulated cores in a flat, grey sheath.',
  flex: 'Three fine-stranded cores in a round, flexible sheath.',
};

/** A cross-section of the sample is shown alongside the name. Core position,
 * cross-section, copper strand pattern and text survive greyscale display. */
function CableSample({kind}:{kind:CableKind}) {
  return <span className={'cable-sample cable-sample-'+kind} aria-hidden="true">
    {cableCores(kind).map(core=><i className={'cable-core cable-'+core} key={core}><b/></i>)}
  </span>;
}

export function CablePicker({document: circuit,value,onChange,onSelectWire,onRemoveEmptyRun}:{
  document:CircuitDocument; value:CableChoice; onChange:(choice:CableChoice)=>void;
  onSelectWire?:(id:string)=>void; onRemoveEmptyRun?:(id:string)=>void;
}) {
  const runs=(circuit.cableRuns??[]).filter(run=>run.kind===value.kind);
  const selected=runs.find(run=>run.id===value.runId);
  const list=selected?circuit.wires.filter(wire=>wire.cable?.runId===selected.id):[];
  const label=(id:string)=>circuit.components.find(c=>c.id===id)?.label??id;
  const disclosure=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(value.runId&&!value.core&&disclosure.current)disclosure.current.open=true;},[value.runId,value.core]);
  return <details ref={disclosure} className="cable-picker" key={circuit.id}>
    <summary><CableSample kind={value.kind}/><span>Cable · <strong>{CABLE_LABEL[value.kind]}</strong></span></summary>
    <div className="cable-choices" role="group" aria-label="Cable construction">
      {cableKinds.map(kind=><button type="button" key={kind}
        aria-pressed={value.kind===kind} onClick={()=>onChange({kind})}>
        <CableSample kind={kind}/><span>{CABLE_LABEL[kind]}</span></button>)}
    </div>
    <p>{descriptions[value.kind]}</p>
    {value.kind!=='single'&&<>
      {runs.length>0&&<label>Which cable?
        <select aria-label="Which cable?" value={selected?.id??(value.newRun?'new':'auto')} onChange={event=>onChange({kind:value.kind,
          ...(event.target.value==='new'?{newRun:true}:event.target.value==='auto'?{}:{runId:event.target.value})})}>
          <option value="auto">Match the two pieces of equipment</option><option value="new">Start another cable</option>
          {runs.map((run,i)=><option key={run.id} value={run.id}>{i+1}. {label(run.from.component)} ↔ {label(run.to.component)}</option>)}
        </select>
      </label>}
      <label>Core for the next connection
        <select aria-label="Core for the next connection" value={value.core??''} onChange={event=>onChange({...value,core:cableCores(value.kind).find(c=>c===event.target.value)})}>
          <option value="">Suggest from terminal markings</option>
          {cableCores(value.kind).map(core=><option key={core} value={core} disabled={list.some(w=>w.cable?.core===core)}>{CABLE_CORE_LABEL[core]}</option>)}
        </select>
      </label>
      {selected&&<ul className="cable-core-list" aria-label="Cores in this cable">
        {cableCores(value.kind).map(core=>{const wire=list.find(w=>w.cable?.core===core);
          return <li key={core}><span>{CABLE_CORE_LABEL[core]}</span>{wire&&onSelectWire
            ?<button type="button" onClick={()=>onSelectWire(wire.id)}>Inspect connected core</button>
            :<small>{wire?'Connected':'Open at both ends'}</small>}</li>;})}
      </ul>}
      {selected&&list.length===0&&onRemoveEmptyRun&&<button type="button" onClick={()=>{onRemoveEmptyRun(selected.id);onChange({kind:value.kind});}}>Remove empty sheath</button>}
    </>}
  </details>;
}
