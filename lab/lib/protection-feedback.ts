import type {CircuitDocument,SimulationResult} from './types';

export interface ProtectionAction {
  circuit:string;
  revision:number;
  ids:string[];
  kind:'lever'|'test'|'reset';
  wasTripped:boolean;
}

/** Read the actual contact position after the worker has applied this operation. */
export function protectionFeedback(action:ProtectionAction,doc:CircuitDocument,result:SimulationResult):string|undefined {
  if(action.circuit!==doc.id||action.revision!==doc.revision||result.revision!==doc.revision)return;
  if(!result.converged)return 'Reading unresolved. Check the circuit.';
  const devices=doc.components.filter(c=>action.ids.includes(c.id));
  if(!devices.length||devices.some(c=>!result.deviceStates[c.id]))return;
  const device=devices.find(c=>result.deviceStates[c.id].tripped)??devices[0];
  const state=result.deviceStates[device.id];
  if(action.kind==='test'){
    if(action.wasTripped&&state.tripped)return device.label+' was already tripped.';
    if(state.tripped)return device.label+' tripped. Contacts open.';
    return state.closed?'T did not trip. Check the supply.':'T did not trip. The lever is off.';
  }
  if(state.tripped)return device.label+(action.kind==='reset'?' tripped again. Check the fault.':' tripped. Contacts open.');
  if(devices.length>1)return devices.every(c=>result.deviceStates[c.id].closed)?'Reset complete. Contacts closed.':'A contact is still open.';
  return device.label+(state.closed?' · Contacts closed':' · Contacts open');
}
