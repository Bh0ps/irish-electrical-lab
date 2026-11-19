import { Route, X } from 'lucide-react';
import { DRAWING_INK, shortPoint } from '../../lib/installation-drawing';
import type {JobSite} from '../../lib/job-site';
import type {CircuitDocument} from '../../lib/types';
import './site-cable-peek.css';

const names:Record<string,string>={L:'Line',N:'Neutral',PE:'Earth',control:'Control',output:'Output','DC+':'Positive DC','DC-':'Negative DC'};
interface Props {doc:CircuitDocument;site:JobSite;selected?:string;wireId?:string;onChange:(id?:string)=>void;visit:(id:string)=>void;plan:(wire:string)=>void}
export default function SiteCablePeek({doc,site,selected,wireId,onChange,visit,plan}:Props){
  const wires=doc.wires;
  const wire=wires.find(w=>w.id===wireId);
  if(!wires.length)return null;
  // Pick the feed heading on from this fitting first. All installed wires are available in the list.
  const suggested=wires.find(w=>w.from.component===selected&&w.role==='L')
    ??wires.find(w=>w.to.component===selected||w.from.component===selected)??wires[0];
  if(!wire)return <button className="site-cable-toggle" aria-label="See cable routes behind the walls" onClick={()=>onChange(suggested.id)}><Route size={16}/>Cables</button>;
  const target=wire.from.component===selected?wire.to:wire.from;
  const room=(id:string)=>site.location(site.items.find(i=>i.id===id)?.room??site.room);
  const text=(w:typeof wire)=>(names[w.role]??w.role)+' · '+shortPoint(site,doc,w.from)+' → '+shortPoint(site,doc,w.to);
  return <aside className="site-cable-peek" aria-label="Cable behind the walls">
    <div><strong><Route size={15}/>Behind the walls</strong><button aria-label="Hide cable route" onClick={()=>onChange(undefined)}><X size={16}/></button></div>
    <select aria-label="Installed wire to follow" value={wire.id} onChange={e=>onChange(e.target.value)}>{wires.map(w=><option key={w.id} value={w.id}>{text(w)}</option>)}</select>
    <div><span><i style={{backgroundColor:DRAWING_INK[wire.role]}}/>{room(wire.from.component)}{room(wire.to.component)!==room(wire.from.component)&&' → '+room(wire.to.component)}</span>
      <button onClick={()=>plan(wire.id)}>Show on plan</button>
      <button onClick={()=>visit(target.component)}>Find {site.items.find(i=>i.id===target.component)?.ref}</button></div>
  </aside>;
}
