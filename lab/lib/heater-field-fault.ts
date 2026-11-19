import {looseHeaterPoint} from './heater-flex-point';
import {looseHeaterWire} from './heater-connection';
import type {MeasurementEvidence} from './learning';
import {resistanceSupplyWarning} from './simulation';
import type {CircuitDocument,Endpoint,SimulationResult} from './types';

export interface HeaterFieldReadings {pole?:MeasurementEvidence;gap?:MeasurementEvidence}
export const heaterIn:Endpoint={component:'fcu-switch',terminal:'LIN'};
export const heaterLoad:Endpoint={component:'fcu-switch',terminal:'LOUT'};
const same=(a:Endpoint|undefined,b:Endpoint)=>a?.component===b.component&&a.terminal===b.terminal;
const pair=(r:MeasurementEvidence,a:Endpoint,b:Endpoint)=>same(r.a,a)&&same(r.b,b)||same(r.a,b)&&same(r.b,a);

export function heaterFieldAvailable(doc:CircuitDocument){return !!looseHeaterPoint(doc);}

/** These samples come from the worker. The diagnosis worker independently replays
 * both on the same passive network before it accepts the learner's answer. */
export function heaterFieldReadings(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]):HeaterFieldReadings{
  const copper=looseHeaterPoint(doc),unit=doc.components.find(c=>c.id==='fcu-switch');
  if(!copper||!unit?.params.closed||!result?.converged||result.revision!==doc.revision||
     result.deviceStates[unit.id]?.tripped||resistanceSupplyWarning(doc))return {};
  const rows:HeaterFieldReadings={};
  for(const r of evidence){
    if(r.source!=='installed-fcu'||r.mode!=='resistance'||r.assisted!==false||r.instrument?.method!=='resistance'||
      r.instrument.held!==false||r.unit!=='Ω'||r.revision!==doc.revision||r.circuitId!==doc.id||r.lessonId!==20||
      r.controlState?.['supply.enabled']!==false||r.controlState?.['fcu-switch.closed']!==true)continue;
    if(pair(r,heaterIn,heaterLoad))rows.pole=r;
    else if(pair(r,heaterLoad,copper))rows.gap=r;
  }
  return rows;
}

export function heaterFieldReady(rows:HeaterFieldReadings){
  return rows.pole?.status==='value'&&typeof rows.pole.value==='number'&&rows.pole.value>=0&&rows.pole.value<1
    &&rows.gap?.status==='open'&&rows.gap.value===null;
}

export function provesHeaterGap(doc:CircuitDocument,result:SimulationResult|undefined,samples:MeasurementEvidence[],wireId?:string){
  return !!wireId&&looseHeaterWire(doc)?.id===wireId&&heaterFieldReady(heaterFieldReadings(doc,result,samples));
}

export function heaterFieldPrompt(doc:CircuitDocument,rows:HeaterFieldReadings,wrong?:MeasurementEvidence){
  if(!doc.components.find(c=>c.id==='fcu-switch')?.params.closed)return 'Turn the heater on at the wall.';
  if(doc.supply.enabled)return 'Switch off the bench supply to check the wall switch.';
  if(wrong?.source==='installed-fcu'&&wrong.revision===doc.revision&&wrong.id!==rows.pole?.id&&wrong.id!==rows.gap?.id){
    const points=[wrong.a,wrong.b];
    if(points.some(p=>p?.terminal==='PE'||p?.terminal==='PE2'))return 'That’s earth. For this check, use the two screws marked L.';
    if(points.some(p=>p?.terminal==='NIN'||p?.terminal==='NOUT'))return 'N is neutral. '+(rows.pole?'Compare LOAD L with the loose brown end.':'Choose L on the IN side and L on the LOAD side.');
  }
  if(rows.pole&&rows.pole.status!=='value')return 'There’s no path through the switch and fuse. Check that the wall switch is on.';
  if(!rows.pole)return 'Put one probe on IN L and the other on LOAD L. Record the resistance.';
  if(typeof rows.pole.value!=='number'||rows.pole.value>=1)return 'The path through the switch and fuse should be close to zero ohms. Check the two L screws.';
  if(rows.gap&&rows.gap.status!=='open')return 'The meter found another path. Check which two points you touched.';
  return 'Put one probe on LOAD L and touch the other to the bare end of the brown wire.';
}
