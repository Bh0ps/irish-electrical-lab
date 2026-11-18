import { measureResistance, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type Endpoint, type SimulationResult } from './types.ts';

export type ForkMethod = 'off'|'probe-voltage'|'fork-current'|'fork-voltage'|'resistance';
export type ForkReference = 'none'|'pad'|'black';
export interface ForkSetup { method: ForkMethod; reference: ForkReference; a?:Endpoint; b?:Endpoint; wire?:string }
export interface ForkReading {
  status:'value'|'open'|'overrange'|'unresolved'|'off'; value:number|null; shown:string;
  unit:string; signal?:'AC'|'DC'; explanation:string; beeps?:boolean;
}
export interface InstrumentEvidence {
  model:'T6-600'; method:Exclude<ForkMethod,'off'>; displayed:string; reference:ForkReference; signal?:'AC'|'DC';
  held:false;
}
const wait=(explanation:string,unit=''):ForkReading=>({status:'unresolved',value:null,shown:'— — —',unit,explanation});
function driveOutput(doc:CircuitDocument,result:SimulationResult,reference:string|undefined){
  return reference!==undefined&&reference!=='mains'&&doc.components.some(c=>c.type==='vfd'&&['U','V','W'].some(t=>result.terminalVoltages[c.id+'.'+t]?.reference===reference));
}
function number(value:number,unit:string,signal:'AC'|'DC'|undefined,limit:number,places:number,explanation:string):ForkReading {
  if(!Number.isFinite(value))return wait('The simulator could not resolve a value.',unit);
  if(Math.abs(value)>limit)return {status:'overrange',value:null,shown:unit==='Ω'?'OL':'— — —',unit,signal,explanation:'This value exceeds the instrument range of '+limit+' '+unit+'.'};
  const shown=(Math.round(value*10**places)/10**places).toFixed(places);
  return {status:'value',value,shown,unit,signal,explanation};
}
export const forkMode=(method:ForkMethod):'voltage'|'current'|'resistance'=>method==='resistance'?'resistance':method==='fork-current'?'current':'voltage';
export const forkDial=(method:ForkMethod)=>method==='off'?0:method.startsWith('fork')?1:method==='probe-voltage'?2:3;
export function forkRead(doc:CircuitDocument,r:SimulationResult|undefined,input:ForkSetup,ohms?:{value:number|null;explanation:string},solveOhms=false):ForkReading {
  const {method,a,b}=input;
  if(method==='off')return {status:'off',value:null,shown:'',unit:'',explanation:'Turn the dial to begin.'};
  if(!r?.converged || r.revision!==doc.revision)return wait('Wait for the current circuit calculation.');
  if(method==='resistance'){
    if(!a||!b)return wait('Place both probes across the part.','Ω');
    if(doc.supply.enabled || doc.components.some(c=>['battery','pv'].includes(c.type)&&c.params.on!==false))return wait('Isolate the bench supply and any local sources before checking resistance.','Ω');
    const sample=ohms??(solveOhms?measureResistance(doc,a,b):undefined);
    if(!sample)return wait('Measuring resistance…','Ω');
    if(sample.value===null)return sample.explanation.startsWith('Open circuit:')?{status:'open',value:null,shown:'OL',unit:'Ω',explanation:'Open circuit. The model found no conductive path between the probes.'}:wait(sample.explanation,'Ω');
    const reading=number(sample.value,'Ω',undefined,2000,0,'Resistance between the two probes.');
    if(reading.status==='value')reading.beeps=sample.value<40;
    return reading;
  }
  if(method==='probe-voltage'){
    if(!a||!b)return wait('Place red and black on the two points to compare.','V');
    const sample=measureVoltage(r,a,b);
    if(sample.value===null)return wait(sample.explanation,'V');
    const va=r.terminalVoltages[endpointKey(a)],vb=r.terminalVoltages[endpointKey(b)];
    if(!va||!vb)return wait('The simulator cannot establish this voltage.','V');
    if(driveOutput(doc,r,va.reference))return wait('The drive model only provides the fundamental waveform. See the drive settings and the study meter for the calculated value.','V');
    if(va.frequency===undefined||vb.frequency===undefined)return wait('The waveform is undetermined at these points.','V');
    if(va.frequency!==vb.frequency)return wait('These terminals do not have a shared AC or DC waveform.', 'V');
    if(va.frequency!==0&&(va.frequency<45||va.frequency>66))return wait('The AC waveform is outside the specified 45–66 Hz measuring band.','V');
    const dc=va.frequency===0;
    return number(dc?va.re-vb.re:sample.value,'V',dc?'DC':'AC',600,0,dc?'Signed DC voltage from red to black.':'AC voltage between the two probes.');
  }
  const wire=doc.wires.find(w=>w.id===input.wire),unit=method==='fork-current'?'A':'V';
  if(!wire)return wait('Put one insulated core in the bottom of the open fork.',unit);
  if(r.pwmWires?.includes(wire.id)||[wire.from,wire.to].some(e=>r.pwmTerminals?.includes(endpointKey(e))))return wait('This core carries a pulsed waveform. Compare the steady input or the calculated channel power.',unit);
  if(method==='fork-voltage'&&!r.branchCurrents['wire:'+wire.id])return wait('The core is interrupted. Place the probes on the two ends to locate the break.',unit);
  const va=r.terminalVoltages[endpointKey(wire.from)],vb=r.terminalVoltages[endpointKey(wire.to)];
  if(!va||!vb||va.reference!==vb.reference)return wait('This conductor has no resolved common reference.',unit);
  if(driveOutput(doc,r,va.reference))return wait('The drive output waveform is simplified. Check its steady input or inspect the calculated fundamental. ',unit);
  if(!va.frequency||va.frequency<45||va.frequency>66)return wait('The fork measures AC at 45–66 Hz. For DC voltage, use the two probes.',unit);
  if(method==='fork-current'){
    const i=r.wireCurrents[wire.id];
    return i?number(Math.hypot(i.re,i.im),'A','AC',200,1,'AC current through the selected core.'):wait('There is no measured current for this signal conductor.','A');
  }
  let zr=0,zi=0;
  if(input.reference==='none')return wait('Choose the rear reference pad or connect the black probe to a bonded earth point.','V');
  if(va.reference!=='mains')return wait('This output is isolated from earth. Compare its two terminals with the probes.','V');
  if(input.reference==='black'){
    const grounded=b&&r.terminalVoltages[endpointKey(b)];
    if(!b||!grounded||grounded.reference!==va.reference||!r.bondedEarthTerminals?.includes(endpointKey(b)))return wait('The black reference probe needs a connected protective earth point.','V');
    zr=grounded.re;zi=grounded.im;
  }
  const volts=Math.hypot((va.re+vb.re)/2-zr,(va.im+vb.im)/2-zi);
  if(volts<16)return wait('Below the 16 V FieldSense range. Use the probes for a voltage reading.','V');
  return number(volts,'V','AC',600,0,'Earth-referenced AC voltage at the middle of this single core. The bench assumes a centred fork and models a valid pad contact when selected.');
}
export function instrumentData(setup:ForkSetup,reading:ForkReading):InstrumentEvidence|undefined{
  if(setup.method==='off'||!['value','open'].includes(reading.status))return undefined;
  return {model:'T6-600',method:setup.method,reference:setup.method==='fork-voltage'?setup.reference:'none',displayed:reading.shown,signal:reading.signal,held:false};
}
