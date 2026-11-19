import { Route, X } from 'lucide-react';
import { DRAWING_INK, shortPoint } from '../../lib/installation-drawing';
import {heaterFlexRun} from '../../lib/fused-heater-site';
import {bathroomWireNote} from '../../lib/bathroom-extract';
import {cromaTerminals} from '../../lib/croma-chime';
import type {JobSite} from '../../lib/job-site';
import type {CircuitDocument,Wire} from '../../lib/types';
import './site-cable-peek.css';

const names:Record<string,string>={L:'Line',N:'Neutral',PE:'Earth',control:'Control',output:'Output','DC+':'Positive DC','DC-':'Negative DC'};
interface Props {doc:CircuitDocument;site:JobSite;selected?:string;wireId?:string;onChange:(id?:string)=>void;visit:(id:string)=>void;plan:(wire:string)=>void}
export default function SiteCablePeek({doc,site,selected,wireId,onChange,visit,plan}:Props){
  const wires=doc.wires;
  const wire=wires.find(w=>w.id===wireId);
  const kitchen=site.items.some(item=>item.fixture?.kitchenDriver);
  const flex=heaterFlexRun(doc);
  const heaterCore=flex&&wire?.cable?.runId===flex.id;
  if(!wires.length)return null;
  // Pick the feed heading on from this fitting first. All installed wires are available in the list.
  const bathroom=doc.lessonId===36;
  const isStrapper=(w:Wire)=>doc.lessonId===9&&w.from.component!==w.to.component&&[w.from,w.to].every(e=>
    ['near','far'].includes(e.component)&&['T1','T2'].includes(e.terminal));
  const timedFeed=bathroom?wires.find(w=>bathroomWireNote(w)&&[w.from,w.to].some(e=>e.component===selected)&&(selected==='fan'?w.role==='L':w.role==='control')):undefined;
  const heaterFeed=flex&&wires.find(w=>w.cable?.runId===flex.id&&w.role==='L'&&[w.from,w.to].some(e=>e.component===selected));
  const suggested=heaterFeed??timedFeed??wires.find(w=>isStrapper(w)&&[w.from,w.to].some(e=>e.component===selected))??wires.find(w=>w.from.component===selected&&w.role==='L')
    ??wires.find(w=>w.to.component===selected||w.from.component===selected)??wires[0];
  if(!wire)return <button className="site-cable-toggle" aria-label={kitchen?'Follow a kitchen cable':flex?'Follow the heater cable':'See cable routes behind the walls'} onClick={()=>onChange(suggested.id)}><Route size={16}/>Cables</button>;
  const target=wire.from.component===selected?wire.to:wire.from;
  const room=(id:string)=>site.location(site.items.find(i=>i.id===id)?.room??site.room);
  const chimeEnd=[wire.from,wire.to].find(e=>site.items.some(i=>i.id===e.component&&i.fixture?.croma));
  const chimeMark=chimeEnd&&cromaTerminals().find(t=>t.id===chimeEnd.terminal)?.label;
  const text=(w:typeof wire)=>(isStrapper(w)?'Strapper':names[w.role]??w.role)+' · '+shortPoint(site,doc,w.from)+' → '+shortPoint(site,doc,w.to);
  return <aside className="site-cable-peek" aria-label={kitchen?'Kitchen cable route':flex?'Heater cable route':'Cable behind the walls'}>
    <div><strong><Route size={15}/>{kitchen||heaterCore?'Follow the cable':'Behind the walls'}</strong><button aria-label="Hide cable route" onClick={()=>onChange(undefined)}><X size={16}/></button></div>
    <select aria-label="Installed wire to follow" value={wire.id} onChange={e=>onChange(e.target.value)}>{wires.map(w=><option key={w.id} value={w.id}>{text(w)}</option>)}</select>
    {heaterCore&&<p className="bathroom-cable-note">The flex leaves the bottom of the switch and runs behind the heater. All three wires share this sheath.</p>}
    {bathroom&&bathroomWireNote(wire)&&<p className="bathroom-cable-note">{bathroomWireNote(wire)}</p>}
    {isStrapper(wire)&&<p className="bathroom-cable-note">This wire runs up behind the downstairs switch, under the landing and up to the other switch.</p>}
    {chimeMark&&<p className="bathroom-cable-note">This wire comes through K1 at the back of the chime and enters the clamp marked {chimeMark} from the left.</p>}
    <div><span><i style={{backgroundColor:DRAWING_INK[wire.role]}}/>{room(wire.from.component)}{room(wire.to.component)!==room(wire.from.component)&&' → '+room(wire.to.component)}</span>
      <button onClick={()=>plan(wire.id)}>Show on plan</button>
      <button onClick={()=>visit(target.component)}>Find {site.items.find(i=>i.id===target.component)?.ref}</button></div>
  </aside>;
}
