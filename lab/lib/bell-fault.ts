import {voltagesFromCommon} from './fault-probes';
import type {MeasurementEvidence} from './learning';
import {endpointKey,type CircuitDocument,type SimulationResult} from './types';

export const bellFaultTitle='The back doorbell is quiet';
export const bellFaultActivity='lesson:72:fault:back-call';
export const bellReturn={component:'chime',terminal:'AC2'};
export const bellInput={component:'chime',terminal:'REAR'};
export const backPushOutput={component:'back',terminal:'NO'};
export type BellReadings={call?:MeasurementEvidence;push?:MeasurementEvidence};

export function bellReadings(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):BellReadings {
  if(doc.lessonId!==72||!doc.supply.enabled||doc.components.find(c=>c.id==='front')?.params.pressed||
    doc.components.find(c=>c.id==='back')?.params.pressed!==true)return {};
  const probes=voltagesFromCommon(doc,result,evidence,bellReturn);
  return {call:probes.get(endpointKey(bellInput)),push:probes.get(endpointKey(backPushOutput))};
}
export function bellComparisonReady(readings:BellReadings){
  return typeof readings.call?.value==='number'&&Math.abs(readings.call.value)<1&&
    typeof readings.push?.value==='number'&&Math.abs(readings.push.value)>=10.8&&Math.abs(readings.push.value)<=13.2;
}
