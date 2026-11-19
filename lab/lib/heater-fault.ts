import {voltagesFromCommon} from './fault-probes';
import type {MeasurementEvidence} from './learning';
import {endpointKey, type CircuitDocument, type Endpoint, type SimulationResult} from './types';

export const heaterFaultTitle='The heater stays cold';
export const heaterFaultActivity='lesson:20:fault:heater';
export const heaterLine:Endpoint={component:'fixed',terminal:'L'};
export const heaterNeutral:Endpoint={component:'fixed',terminal:'N'};

/** The older bench has a separate fuse between the switch and the heater. */
export function heaterFeed(doc:CircuitDocument):Endpoint|undefined {
  if(doc.lessonId!==20)return;
  const unit=doc.components.find(c=>c.id==='fcu-switch');
  const feed=unit?.type==='fcu'?{component:'fcu-switch',terminal:'LOUT'}:{component:'fuse',terminal:'OUT'};
  if(!doc.components.some(c=>c.id===feed.component))return;
  return doc.wires.some(w=>{
    const ends=[endpointKey(w.from),endpointKey(w.to)];
    return ends.includes(endpointKey(feed))&&ends.includes(endpointKey(heaterLine));
  })?feed:undefined;
}

export interface HeaterReadings { heater?:MeasurementEvidence; output?:MeasurementEvidence }
export function heaterFaultReadings(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):HeaterReadings {
  const readings:HeaterReadings={},feed=heaterFeed(doc);
  if(!feed)return readings;
  const probes=voltagesFromCommon(doc,result,evidence,heaterNeutral);
  const heater=probes.get(endpointKey(heaterLine)),output=probes.get(endpointKey(feed));
  if(heater)readings.heater=heater;
  if(output)readings.output=output;
  return readings;
}
export function heaterComparisonReady(doc:CircuitDocument,readings:HeaterReadings):boolean {
  if(!doc.supply.enabled||!doc.components.find(c=>c.id==='fcu-switch')?.params.closed)return false;
  return typeof readings.heater?.value==='number'&&Math.abs(readings.heater.value)<1
    &&typeof readings.output?.value==='number'&&Math.abs(readings.output.value)>doc.supply.voltage*.9;
}
