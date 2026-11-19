import {looseHeaterWire} from './heater-connection';
import {resistanceSupplyWarning} from './simulation';
import {endpointKey,type CircuitDocument,type Endpoint,type FaultSetting} from './types';

/** Seat the identified free core in its own clamp. Preserve the fuse, device
 * settings and any other faults so the final test sees the actual circuit. */
export function reseatHeaterWire(doc:CircuitDocument,fault:FaultSetting,point:Endpoint):CircuitDocument|undefined {
  if(!fault.enabled||!fault.looseEnd||endpointKey(point)!==endpointKey(fault.looseEnd)||
    !doc.faults.includes(fault)||!fault.wire||looseHeaterWire({...doc,faults:[fault]})?.id!==fault.wire||resistanceSupplyWarning(doc))return;
  return {...doc,faults:doc.faults.filter(entry=>entry!==fault)};
}
