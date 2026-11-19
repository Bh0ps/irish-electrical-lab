import type {CircuitDocument, Endpoint, Wire} from './types';

const isLoadLine=(point:Endpoint)=>point.component==='fcu-switch'&&point.terminal==='LOUT';
const isHeaterLine=(point:Endpoint)=>point.component==='fixed'&&point.terminal==='L';

/** Identify the line core of the installed BG 851 / PLX050E flex in either
 * wiring direction. A similar wire on an older bench has no physical end here. */
export function heaterFlexEnd(doc:CircuitDocument,wireId:string|undefined):Endpoint|undefined {
  if(doc.lessonId!==20||!wireId)return;
  const wire=doc.wires.find(w=>w.id===wireId);
  if(!wire||wire.role!=='L'||wire.cable?.core!=='brown')return;
  const outlet=isLoadLine(wire.from)&&isHeaterLine(wire.to)?wire.from:
    isLoadLine(wire.to)&&isHeaterLine(wire.from)?wire.to:undefined;
  if(!outlet||!doc.cableRuns?.some(run=>run.id===wire.cable!.runId&&run.kind==='flex'&&
    ((isLoadLine(run.from)&&isHeaterLine(run.to))||(isLoadLine(run.to)&&isHeaterLine(run.from)))))return;
  if(doc.components.some(c=>c.id===outlet.component&&c.type==='fcu'&&(!c.variant||c.variant==='default'))&&
    doc.components.some(c=>c.id==='fixed'&&c.type==='heater'&&c.variant==='plx050e'))return outlet;
}

/** A measured open does not locate a break. Only the named fault's explicitly
 * detached end exposes copper, at that end of that physical flex. */
export function looseHeaterWire(doc:CircuitDocument):Wire|undefined {
  for(const fault of doc.faults){
    if(!fault.enabled||!fault.looseEnd||!isLoadLine(fault.looseEnd)||
      (fault.type!=='open-live'&&fault.type!=='open-wire')||
      (fault.component!==undefined&&fault.component!=='fixed'&&fault.component!=='fcu-switch'))continue;
    if(heaterFlexEnd(doc,fault.wire))return doc.wires.find(w=>w.id===fault.wire);
  }
}
