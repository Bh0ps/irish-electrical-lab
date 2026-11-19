import {voltagesFromCommon} from './fault-probes';
import {isPanelHeater,panelThermostat} from './panel-heater';
import type {MeasurementEvidence} from './learning';
import {endpointKey, type CircuitDocument, type Endpoint, type SimulationResult} from './types';

export const heaterFaultTitle='The heater stays cold';
export const heaterFaultActivity='lesson:20:fault:heater';
export const heaterLine:Endpoint={component:'fixed',terminal:'L'};
export const heaterNeutral:Endpoint={component:'fixed',terminal:'N'};

export interface HeaterRun {
  runningBefore:number;
  stopped:number;
  offRevision:number;
  runningAfter?:number;
  onRevision?:number;
}
export interface HeaterSwitchPress {circuit:string;revision:number;toOn:boolean;before:number}

export function hasPanelHeater(doc:CircuitDocument){
  return doc.lessonId===20&&doc.components.some(c=>c.id==='fixed'&&isPanelHeater(c));
}

/** An isolated element can draw zero watts even when its terminals float. */
export function elementWatts(doc:CircuitDocument,result:SimulationResult|undefined){
  if(!hasPanelHeater(doc)||!result?.converged||result.revision!==doc.revision)return;
  const watts=result.deviceStates.fixed?.elementWatts;
  return typeof watts==='number'&&Number.isFinite(watts)&&watts>=0?watts:undefined;
}

export function startHeaterPress(doc:CircuitDocument,result:SimulationResult|undefined,control:string):HeaterSwitchPress|undefined {
  if(control!=='fcu-switch'||!doc.supply.enabled||doc.faults.some(f=>f.enabled))return;
  const before=elementWatts(doc,result);
  if(before===undefined)return;
  return {circuit:doc.id,revision:doc.revision+1,toOn:!doc.components.find(c=>c.id===control)?.params.closed,before};
}

export function finishHeaterPress(doc:CircuitDocument,result:SimulationResult|undefined,press:HeaterSwitchPress,previous?:HeaterRun):HeaterRun|undefined {
  if(press.circuit!==doc.id||press.revision!==doc.revision||!doc.supply.enabled||doc.faults.some(f=>f.enabled))return previous;
  const watts=elementWatts(doc,result),closed=doc.components.find(c=>c.id==='fcu-switch')?.params.closed===true;
  if(watts===undefined||closed!==press.toOn)return previous;
  if(!closed&&press.before>1&&watts<1)return {runningBefore:press.before,stopped:watts,offRevision:doc.revision};
  if(closed&&press.before<1&&watts>1&&previous?.offRevision===doc.revision-1){
    return {...previous,onRevision:doc.revision,runningAfter:watts};
  }
  return previous;
}

export function heaterRunReady(doc:CircuitDocument,result:SimulationResult|undefined,run?:HeaterRun){
  const watts=elementWatts(doc,result);
  return !!run&&run.onRevision===doc.revision&&run.runningAfter!==undefined&&watts!==undefined&&watts>1&&doc.supply.enabled;
}

export function isHeaterRun(value:unknown,revision:number):value is HeaterRun {
  if(!value||typeof value!=='object')return false;
  const r=value as HeaterRun;
  if(!Number.isFinite(r.runningBefore)||r.runningBefore<=1||!Number.isFinite(r.stopped)||r.stopped<0||r.stopped>=1||
      !Number.isInteger(r.offRevision)||r.offRevision<0||r.offRevision>revision)return false;
  return r.onRevision===undefined&&r.runningAfter===undefined||
    r.onRevision===r.offRevision+1&&r.onRevision<=revision&&Number.isFinite(r.runningAfter)&&r.runningAfter!>1;
}

export function heaterHandoverStep(doc:CircuitDocument,result:SimulationResult|undefined,run?:HeaterRun,solverError=false) {
  const panel=doc.components.find(c=>c.id==='fixed'&&isPanelHeater(c));
  if(!panel||!doc.supply.enabled||heaterRunReady(doc,result,run))return;
  const watts=elementWatts(doc,result);
  if(watts===undefined){
    const failed=solverError||result?.revision===doc.revision;
    return {action:'test',label:failed?'Check the circuit':'Waiting for the reading…',disabled:!failed,
      instruction:failed?'Check the heater supply and connections.':'Wait for the heater reading.',reading:'No power reading yet.'} as const;
  }
  const closed=doc.components.find(c=>c.id==='fcu-switch')?.params.closed===true;
  const reading='Heater element · '+Math.round(watts)+' W',thermostat=panelThermostat(panel.params);
  if(closed&&!thermostat.calling)return {action:'raise',label:'Raise heater setting 1 °C',disabled:false,
    instruction:'The room is '+thermostat.temperature+' °C. Raise the heater setting above that to call for heat.',
    reading:reading+' · Set to '+thermostat.setpoint+' °C'} as const;
  if(closed&&watts<=1)return {action:'test',label:'Check the circuit',disabled:false,
    instruction:'The wall switch is on but the element has no power. Check the feed to the heater.',reading} as const;
  return {action:'operate',label:closed?'Switch heater off at the wall':'Switch heater on at the wall',disabled:false,reading,
    instruction:closed?'Switch the heater off. Watch its power reading.':run?.offRevision===doc.revision?
      'Switch it back on. Does the element draw power again?':'Switch the heater on for a starting reading.'} as const;
}

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
