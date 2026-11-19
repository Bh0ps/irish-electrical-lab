import {looseHeaterWire} from './heater-connection.ts';
import type {CircuitDocument,Endpoint,Wire} from './types.ts';

/** A test point on the free end of the brown core. It is separate from both
 * the empty clamp and the far end still attached inside the appliance. */
export function heaterCopperEndpoint(wire:Wire):Endpoint {
  return {component:'fcu-switch',terminal:'loose-flex:'+wire.id};
}

export function looseHeaterPoint(doc:CircuitDocument):Endpoint|undefined {
  const wire=looseHeaterWire(doc);
  if(wire)return heaterCopperEndpoint(wire);
}
