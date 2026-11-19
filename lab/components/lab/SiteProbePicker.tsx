import {Dialog,DialogContent,DialogHeader,DialogTitle} from '../ui/dialog';
import {siteContacts,type SiteTestFitting} from '../../lib/site-meter';
import type {Endpoint} from '../../lib/types';

interface Props {
  shown:boolean;close:()=>void;lead:'red'|'black';fittings:SiteTestFitting[];
  fitting?:SiteTestFitting;accessible:boolean;choose:(id:string)=>void;
  access?:{label:string;run?:()=>void};pick:(point:Endpoint)=>void;
}

export function SiteProbePicker({shown,close,lead,fittings,fitting,accessible,choose,access,pick}:Props){
  return <Dialog open={shown} onOpenChange={v=>{if(!v)close();}}><DialogContent className="field-points-dialog" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>Place the {lead} probe</DialogTitle></DialogHeader>
    {fittings.length>1?<label>Fitting<select value={fitting?.item.id??''} onChange={e=>choose(e.target.value)}>
      <option value="" disabled>Choose a fitting</option>{fittings.map(f=><option value={f.item.id} key={f.item.id}>{f.component.label}</option>)}
    </select></label>:<p>{fitting?.component.label}</p>}
    {fitting&&(accessible?<div className="field-points-options">{siteContacts(fitting,true).map(p=>
      <button type="button" key={p.endpoint.terminal} onClick={()=>{pick(p.endpoint);close();}}>{p.label}</button>)}</div>:
      access&&<button type="button" className="book-primary" disabled={!access.run} onClick={access.run}>{access.label}</button>)}
  </DialogContent></Dialog>;
}
