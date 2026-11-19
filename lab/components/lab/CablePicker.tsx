'use client';
import {useEffect,useRef,useState} from 'react';
import { cableCores, cableKinds, CABLE_CORE_LABEL, CABLE_LABEL, type CableChoice } from '../../lib/cables';
import type { CableKind, CircuitDocument } from '../../lib/types';
import {publicAssetUrl} from '../../web/asset-url';
import './cable-picker.css';

const descriptions:Record<CableKind,string> = {
  'bell-pair':'One red wire and one white wire twist together. Each has a solid copper centre.',
  'led-pair':'The red and black wires are joined side by side. Check the + and − marks on the LED strip.',
  'multi-strip':'Four wires lie side by side in a ribbon. Match the letters on the LED strip with the letters on the controller.',
  single: 'One copper wire with its own insulation. There are no other wires under the cover.',
  flat: 'Look at the cut end. The flat grey sheath is the outer cover. The green-and-yellow earth wire sits in the middle on this sample.',
  flex: 'The round sheath holds three wires. Look at a cut end and you’ll see the fine copper strands that let the flex bend.',
};

function CableSample({kind}:{kind:CableKind}) {
  return <img className="cable-sample" src={publicAssetUrl('cable-samples/'+kind+'.webp')} width={84} height={42} alt="" />;
}

export function CablePicker({document: circuit,value,onChange,onSelectWire,onRemoveEmptyRun}:{
  document:CircuitDocument; value:CableChoice; onChange:(choice:CableChoice)=>void;
  onSelectWire?:(id:string)=>void; onRemoveEmptyRun?:(id:string)=>void;
}) {
  const runs=(circuit.cableRuns??[]).filter(run=>run.kind===value.kind);
  const selected=runs.find(run=>run.id===value.runId);
  const list=selected?circuit.wires.filter(wire=>wire.cable?.runId===selected.id):[];
  const label=(id:string)=>circuit.components.find(c=>c.id===id)?.label??id;
  const [allTypes,setAllTypes]=useState(false);
  const lowVoltage = (circuit.lessonId ?? 0) >= 65 || circuit.lessonId === 43;
  const common: CableKind[] = lowVoltage ? ['single','bell-pair','led-pair','multi-strip'] : ['single','flat','flex'];
  const choices = allTypes ? [...common,...cableKinds.filter(kind=>!common.includes(kind))] : common.includes(value.kind) ? common : [...common,value.kind];
  const disclosure=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(value.runId&&!value.core&&disclosure.current)disclosure.current.open=true;},[value.runId,value.core]);
  return <details ref={disclosure} className="cable-picker" key={circuit.id}>
    <summary><CableSample kind={value.kind}/><span>Cable · <strong>{CABLE_LABEL[value.kind]}</strong></span></summary>
    <div className="cable-choices" role="group" aria-label="Cable construction">
      {choices.map(kind=><button type="button" key={kind}
        aria-pressed={value.kind===kind} onClick={()=>onChange({kind})}>
        <CableSample kind={kind}/><span>{CABLE_LABEL[kind]}</span></button>)}
    </div>
    <p>{descriptions[value.kind]}</p>
    <button type="button" className="more-cable-types" aria-expanded={allTypes} onClick={()=>setAllTypes(open=>!open)}>{allTypes?'Show fewer cable types':'More cable types'}</button>
    {value.kind!=='single'&&<>
      {runs.length>0&&<label>Which cable?
        <select aria-label="Which cable?" value={selected?.id??(value.newRun?'new':'auto')} onChange={event=>onChange({kind:value.kind,
          ...(event.target.value==='new'?{newRun:true}:event.target.value==='auto'?{}:{runId:event.target.value})})}>
          <option value="auto">Match the two pieces of equipment</option><option value="new">Start another cable</option>
          {runs.map((run,i)=><option key={run.id} value={run.id}>{i+1}. {label(run.from.component)} ↔ {label(run.to.component)}</option>)}
        </select>
      </label>}
      <label>Wire inside the cable (core)
        <select aria-label="Wire inside the cable (core)" value={value.core??''} onChange={event=>onChange({...value,core:cableCores(value.kind).find(c=>c===event.target.value)})}>
          <option value="">Use the terminal markings</option>
          {cableCores(value.kind).map(core=><option key={core} value={core} disabled={list.some(w=>w.cable?.core===core)}>{CABLE_CORE_LABEL[core]}</option>)}
        </select>
      </label>
      {selected&&<ul className="cable-core-list" aria-label="Cores in this cable">
        {cableCores(value.kind).map(core=>{const wire=list.find(w=>w.cable?.core===core);
          return <li key={core}><span>{CABLE_CORE_LABEL[core]}</span>{wire&&onSelectWire
            ?<button type="button" onClick={()=>onSelectWire(wire.id)}>Find on bench</button>
            :<small>{wire?'Connected':'Both ends loose'}</small>}</li>;})}
      </ul>}
      {selected&&list.length===0&&onRemoveEmptyRun&&<button type="button" onClick={()=>{onRemoveEmptyRun(selected.id);onChange({kind:value.kind});}}>Remove empty cable</button>}
    </>}
  </details>;
}
