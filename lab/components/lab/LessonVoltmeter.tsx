import { useState, type ReactNode } from 'react';
import { describeEndpoint } from '../../lib/endpoint-description';
import { definitionFor } from '../../lib/components';
import { getComponentTerminals } from '../../lib/terminal-layout';
import type { CircuitDocument, Endpoint } from '../../lib/types';

type Lead = 'red' | 'black';
interface Props {
  circuit: CircuitDocument; startAt?: string; active: Lead; red?: Endpoint; black?: Endpoint;
  display?: string; message: string; adjust?: {label:string; action:()=>void};
  fixedFitting?: string; covered?:boolean; record?: ()=>void;
  chooseLead: (lead:Lead)=>void; place: (point:Endpoint)=>void; controls:ReactNode;
}

export function LessonVoltmeter({circuit,startAt,active,red,black,display,message,adjust,fixedFitting,covered,record,chooseLead,place,controls}:Props) {
  const [chosen,setChosen] = useState(startAt);
  const [more,setMore] = useState(false);
  const fittings = circuit.components.filter(part=>definitionFor(part).terminals.length);
  const fitting = fittings.find(part=>part.id===(fixedFitting??chosen)) ?? fittings[0];
  const points = {red,black};
  return <section className="lesson-voltmeter" aria-label="Measure voltage">
    <output aria-live="polite">{display ?? 'No reading yet'}</output>
    {adjust ? <button type="button" className="book-link" onClick={adjust.action}>{adjust.label}</button> :
      <>
        {!fixedFitting && <label>Fitting<select value={fitting?.id??''} onChange={e=>setChosen(e.target.value)}>
          {fittings.map(part=><option key={part.id} value={part.id}>{part.label}</option>)}
        </select></label>}
        <div className="lesson-meter-leads" role="group" aria-label="Choose a probe">
          {(['red','black'] as const).map(lead=>{
            const point=describeEndpoint(circuit,points[lead]);
            return <button type="button" key={lead} aria-pressed={active===lead} onClick={()=>chooseLead(lead)}>
              <b>{lead==='red'?'Red probe':'Black probe'}</b>
              <span>{point ? point.endpoint.component===fitting?.id ? point.pointLabel : point.label : 'In hand'}</span>
            </button>;
          })}
        </div>
        {fitting && <fieldset><legend>Touch the {active} probe to</legend><div>
          {getComponentTerminals(fitting,definitionFor(fitting)).map(t=>{
            const point={component:fitting.id,terminal:t.id};
            const label=describeEndpoint(circuit,point)?.pointLabel??t.label;
            return <button type="button" key={t.id} aria-label={'Place '+active+' probe on '+label}
              aria-pressed={points[active]?.component===fitting.id && points[active]?.terminal===t.id}
              onClick={()=>place(point)}>{label}</button>;
          })}
        </div></fieldset>}
        {covered && <p>Choosing a screw opens the chime cover.</p>}
        {red && black && message && <p>{message}</p>}
      </>}
    {record && !more && <button type="button" className="book-primary" disabled={!display || !!adjust} onClick={record}>Record reading</button>}
    <details onToggle={event=>setMore(event.currentTarget.open)}><summary>Meter controls</summary>{more && controls}</details>
  </section>;
}
