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
  if(!Number.isFinite(value))return wait('The tester has no reading here.',unit);
  if(Math.abs(value)>limit)return {status:'overrange',value:null,shown:unit==='Ω'?'OL':'— — —',unit,signal,explanation:unit==='Ω'?`There is a path between the probes. Its resistance is above ${limit.toLocaleString('en-IE')} Ω, so this tester shows OL.`:'This is above the tester’s '+limit+' '+unit+' range.'};
  const shown=(Math.round(value*10**places)/10**places).toFixed(places);
  return {status:'value',value,shown,unit,signal,explanation};
}
export const forkMode=(method:ForkMethod):'voltage'|'current'|'resistance'=>method==='resistance'?'resistance':method==='fork-current'?'current':'voltage';
export const forkDial=(method:ForkMethod)=>method==='off'?0:method==='probe-voltage'?1:method.startsWith('fork')?2:3;
export function forkRead(doc:CircuitDocument,r:SimulationResult|undefined,input:ForkSetup,ohms?:{value:number|null;explanation:string;status?:'value'|'open'|'unresolved'},solveOhms=false):ForkReading {
  const {method,a,b}=input;
  if(method==='off')return {status:'off',value:null,shown:'',unit:'',explanation:'Turn the dial to begin.'};
  if(!r || r.revision!==doc.revision)return wait('Waiting for the circuit reading…');
  if(!r.converged)return wait('No reliable reading. Choose Test circuit to check the wiring.');
  if(method==='resistance'){
    if(!a||!b)return wait(a?'Put the black probe on the other end of the part.':b?'Put the red probe on the other end of the part.':'Put one probe on each end of the part.','Ω');
    if(doc.supply.enabled || doc.components.some(c=>['battery','pv'].includes(c.type)&&c.params.on!==false))return wait('Switch off the bench supply and any battery or solar supply before using Ω.','Ω');
    const sample=ohms??(solveOhms?measureResistance(doc,a,b):undefined);
    if(!sample)return wait('Measuring resistance…','Ω');
    if(sample.value===null)return (ohms ? ohms.status==='open' : 'reason' in sample && sample.reason==='open')?{status:'open',value:null,shown:'OL',unit:'Ω',explanation:'OL means open circuit here. There is no path between the probes for the tester’s current.'}:wait(sample.explanation,'Ω');
    const reading=number(sample.value,'Ω',undefined,2000,0,sample.value<.5?'The probes are joined by a path with so little resistance that the display reads 0 ohms.':'The resistance between these points is shown in ohms (Ω).');
    if(reading.status==='value')reading.beeps=sample.value<40;
    return reading;
  }
  if(method==='probe-voltage'){
    if(!a||!b)return wait(a?'Place the black probe on the second point.':b?'Place the red probe on the other point.':'Put the red probe on one point and the black probe on the other.','V');
    const sample=measureVoltage(r,a,b);
    if(sample.value===null)return wait(sample.explanation,'V');
    const va=r.terminalVoltages[endpointKey(a)],vb=r.terminalVoltages[endpointKey(b)];
    if(!va||!vb)return wait('Check that both probes are on terminals with a connection to the circuit.','V');
    if(driveOutput(doc,r,va.reference))return wait('The drive changes the shape of its output voltage. The bench shows an estimated voltage on the study meter.','V');
    if(va.frequency===undefined||vb.frequency===undefined)return wait('The bench cannot tell whether the voltage here is AC or DC. Check the supply feeding these points.','V');
    if(va.frequency!==vb.frequency)return wait('The two probe points have different frequencies. Try two terminals fed by the same supply.', 'V');
    if(va.frequency!==0&&(va.frequency<45||va.frequency>66))return wait('This AC supply is outside the tester’s 45–66 Hz range. Check the supply frequency.','V');
    const dc=va.frequency===0;
    const value=dc?va.re-vb.re:sample.value;
    const volts=Math.abs(Math.round(value));
    const meaning=volts===0?(value===0?'There are zero volts between the probes. Both points can still be live.':'This tester reads in whole volts. The difference between these points is small enough to show 0 V.'):dc
      ? 'The red probe is '+volts+' volts '+(value<0?'below':'above')+' the black probe.'
      : volts+' V AC between the probes.';
    return number(value,'V',dc?'DC':'AC',600,0,meaning);
  }
  const wire=doc.wires.find(w=>w.id===input.wire),unit=method==='fork-current'?'A':'V';
  if(!wire)return wait('Choose one insulated wire for the fork. Seat it in the bottom of the opening.',unit);
  if(r.pwmWires?.includes(wire.id)||[wire.from,wire.to].some(e=>r.pwmTerminals?.includes(endpointKey(e))))return wait('The controller pulses this wire on and off. The fork cannot give a reading here. Try the controller’s supply wires or check the LED power.',unit);
  if(method==='fork-voltage'&&!r.branchCurrents['wire:'+wire.id])return wait('There is a break in this wire. Set the dial to V and put one probe on each end.',unit);
  const va=r.terminalVoltages[endpointKey(wire.from)],vb=r.terminalVoltages[endpointKey(wire.to)];
  if(!va||!vb||va.reference!==vb.reference)return wait('The bench cannot get a reading on this wire. Follow both ends and check where they connect.',unit);
  if(driveOutput(doc,r,va.reference))return wait('The bench fork cannot measure the motor drive’s output. Try one of its incoming wires.',unit);
  if(!va.frequency||va.frequency<45||va.frequency>66)return wait('The fork measures AC at 45–66 Hz. For DC voltage, use the two probes.',unit);
  if(method==='fork-current'){
    const i=r.wireCurrents[wire.id];
    return i?number(Math.hypot(i.re,i.im),'A','AC',200,1,'AC current through this wire, in amps.'):wait('The bench has no current reading for this signal wire.','A');
  }
  let zr=0,zi=0;
  if(input.reference==='none')return wait('The fork needs an earth reference for voltage. Touch the pad on the back, or put the black probe on a connected earth terminal.','V');
  if(va.reference!=='mains')return wait('This output is isolated from earth. Compare its two terminals with the probes.','V');
  if(input.reference==='black'){
    const grounded=b&&r.terminalVoltages[endpointKey(b)];
    if(!b||!grounded||grounded.reference!==va.reference||!r.bondedEarthTerminals?.includes(endpointKey(b)))return wait('Put the black probe on an earth terminal with a path back to the supply.','V');
    zr=grounded.re;zi=grounded.im;
  }
  const volts=Math.hypot((va.re+vb.re)/2-zr,(va.im+vb.im)/2-zi);
  if(volts<16)return wait('The fork needs at least 16 V AC for FieldSense. Use both probes to read a lower voltage.','V');
  return number(volts,'V','AC',600,0,'AC voltage between the wire in the fork and earth.');
}
export function instrumentData(setup:ForkSetup,reading:ForkReading):InstrumentEvidence|undefined{
  if(setup.method==='off'||!['value','open'].includes(reading.status))return undefined;
  return {model:'T6-600',method:setup.method,reference:setup.method==='fork-voltage'?setup.reference:'none',displayed:reading.shown,signal:reading.signal,held:false};
}
