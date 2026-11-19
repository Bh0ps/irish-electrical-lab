import type {CircuitDocument, Endpoint, FaultSetting, Wire} from './types';
import {resistanceSupplyWarning} from './simulation';

const isRear=(point:Endpoint)=>point.component==='chime'&&point.terminal==='REAR';

function backCallWire(doc:CircuitDocument,fault:FaultSetting):Wire|undefined {
  if(doc.lessonId!==72||!fault.enabled||fault.type!=='open-wire'||(fault.component!==undefined&&fault.component!=='chime'))return;
  const wire=doc.wires.find(w=>w.id===fault.wire);
  if(!wire)return;
  const push=isRear(wire.to)?wire.from:isRear(wire.from)?wire.to:undefined;
  if(push?.component==='back'&&(push.terminal==='NO'||push.terminal==='COM'))return wire;
}

/** Only an explicitly detached end is visible. An open-wire reading alone
 * cannot distinguish a loose end from a break inside an insulated run. */
export function looseBellWire(doc:CircuitDocument):Wire|undefined {
  if(!doc.components.some(c=>c.id==='chime'&&c.type==='callchime'&&c.variant==='croma-100a')||
    !doc.components.some(c=>c.id==='back'&&c.type==='pushbutton'&&c.variant==='sesame'))return;
  for(const fault of doc.faults){
    if(fault.looseEnd&&isRear(fault.looseEnd)){
      const wire=backCallWire(doc,fault);
      if(wire)return wire;
    }
  }
}

export function reseatBellWire(doc:CircuitDocument,fault:FaultSetting,chosen:Endpoint):CircuitDocument|undefined {
  if(!isRear(chosen)||resistanceSupplyWarning(doc)||!doc.faults.includes(fault)||!backCallWire(doc,fault))return;
  if(fault.looseEnd&&!isRear(fault.looseEnd))return;
  return {...doc,faults:doc.faults.filter(f=>f!==fault)};
}
