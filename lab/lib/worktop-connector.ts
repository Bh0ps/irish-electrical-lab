import type {CircuitDocument, Endpoint, Wire} from './types';

/** The loose push-on belongs to the strip lead. Terminal 1 on the rocker
 * stays part of the switch, so a probe can still read its output voltage. */
export function worktopLooseEnd(doc:CircuitDocument, wire?:Wire):Endpoint|undefined {
  if(doc.lessonId!==66)return;
  for(const fault of doc.faults){
    if(!fault.enabled||fault.type!=='open-wire'||!fault.wire)continue;
    if(wire&&wire.id!==fault.wire)continue;
    const lead=doc.wires.find(entry=>entry.id===fault.wire);
    if(!lead)continue;
    const [switchEnd,stripEnd]=lead.from.component==='right-switch'?[lead.from,lead.to]:[lead.to,lead.from];
    if(switchEnd.component!=='right-switch'||switchEnd.terminal!=='OUT'||stripEnd.component!=='right'||stripEnd.terminal!=='L')continue;
    const rocker=doc.components.find(part=>part.id===switchEnd.component);
    const strip=doc.components.find(part=>part.id===stripEnd.component);
    if(rocker?.type==='switch'&&rocker.variant==='dc-rocker'&&strip?.type==='led'&&strip.variant==='strip')return switchEnd;
  }
}
