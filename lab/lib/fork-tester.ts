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
  if(Math.abs(value)>limit)return {status:'overrange',value:null,shown:unit==='Ω'?'OL':'— — —',unit,signal,explanation:'This value exceeds the instrument range of '+limit+' '+unit+'.'};
  const shown=(Math.round(value*10**places)/10**places).toFixed(places);
  return {status:'value',value,shown,unit,signal,explanation};
}
export const forkMode=(method:ForkMethod):'voltage'|'current'|'resistance'=>method==='resistance'?'resistance':method==='fork-current'?'current':'voltage';
export const forkDial=(method:ForkMethod)=>method==='off'?0:method==='probe-voltage'?1:method.startsWith('fork')?2:3;
export function forkRead(doc:CircuitDocument,r:SimulationResult|undefined,input:ForkSetup,ohms?:{value:number|null;explanation:string;status?:'value'|'open'|'unresolved'},solveOhms=false):ForkReading {
  const {method,a,b}=input;
  if(method==='off')return {status:'off',value:null,shown:'',unit:'',explanation:'Turn the dial to begin.'};
  if(!r || r.revision!==doc.revision)return wait('Waiting for the circuit reading…');
  if(!r.converged)return wait('The bench could not calculate a reading. Open Test circuit to check the wiring.');
  if(method==='resistance'){
    if(!a||!b)return wait(a?'Put the black probe on the other end of the part.':b?'Put the red probe on the other end of the part.':'Put one probe on each end of the part.','Ω');
    if(doc.supply.enabled || doc.components.some(c=>['battery','pv'].includes(c.type)&&c.params.on!==false))return wait('Switch off the bench supply and any battery or solar supply before using Ω.','Ω');
    const sample=ohms??(solveOhms?measureResistance(doc,a,b):undefined);
    if(!sample)return wait('Measuring resistance…','Ω');
    if(sample.value===null)return (ohms ? ohms.status==='open' : 'reason' in sample && sample.reason==='open')?{status:'open',value:null,shown:'OL',unit:'Ω',explanation:'Open circuit. The test current cannot get from one probe to the other.'}:wait(sample.explanation,'Ω');
    const reading=number(sample.value,'Ω',undefined,2000,0,sample.value<.5?'The display rounds to 0 ohms. There is a path between the probes.':'Resistance between the probes, in ohms.');
    if(reading.status==='value')reading.beeps=sample.value<40;
    return reading;
  }
  if(method==='probe-voltage'){
    if(!a||!b)return wait(a?'Put the black probe on the point you want to compare.':b?'Put the red probe on the point you want to compare.':'Put the red probe on one point and the black probe on the other.','V');
    const sample=measureVoltage(r,a,b);
    if(sample.value===null)return wait(sample.explanation,'V');
    const va=r.terminalVoltages[endpointKey(a)],vb=r.terminalVoltages[endpointKey(b)];
    if(!va||!vb)return wait('Check that both probes are on terminals with a connection to the circuit.','V');
    if(driveOutput(doc,r,va.reference))return wait('The bench simplifies the motor drive output. Use the study meter to see the calculated voltage.','V');
    if(va.frequency===undefined||vb.frequency===undefined)return wait('The bench cannot tell whether the voltage here is AC or DC. Check the supply feeding these points.','V');
    if(va.frequency!==vb.frequency)return wait('The two probes are on different signals. Try two terminals on the same supply.', 'V');
    if(va.frequency!==0&&(va.frequency<45||va.frequency>66))return wait('This AC supply is outside the tester’s 45–66 Hz range. Check the supply frequency.','V');
    const dc=va.frequency===0;
    const value=dc?va.re-vb.re:sample.value;
    const volts=Math.abs(Math.round(value));
    const meaning=volts===0?'The display rounds to zero volts between these points.':dc
      ? 'The red probe is '+volts+' volts '+(value<0?'below':'above')+' the black probe.'
      : 'There are '+volts+' AC volts between the probes.';
    return number(value,'V',dc?'DC':'AC',600,0,meaning);
  }
  const wire=doc.wires.find(w=>w.id===input.wire),unit=method==='fork-current'?'A':'V';
  if(!wire)return wait('Put one insulated core in the bottom of the open fork.',unit);
  if(r.pwmWires?.includes(wire.id)||[wire.from,wire.to].some(e=>r.pwmTerminals?.includes(endpointKey(e))))return wait('This wire switches on and off too quickly for the bench fork. Measure the supply going into the controller, or check the LED power.',unit);
  if(method==='fork-voltage'&&!r.branchCurrents['wire:'+wire.id])return wait('There is a break in this wire. Set the dial to V and put one probe on each end.',unit);
  const va=r.terminalVoltages[endpointKey(wire.from)],vb=r.terminalVoltages[endpointKey(wire.to)];
  if(!va||!vb||va.reference!==vb.reference)return wait('The bench cannot get a reading on this wire. Follow both ends and check where they connect.',unit);
  if(driveOutput(doc,r,va.reference))return wait('The bench simplifies the motor drive output. Try the fork on a wire feeding the drive.',unit);
  if(!va.frequency||va.frequency<45||va.frequency>66)return wait('The fork measures AC at 45–66 Hz. For DC voltage, use the two probes.',unit);
  if(method==='fork-current'){
    const i=r.wireCurrents[wire.id];
    return i?number(Math.hypot(i.re,i.im),'A','AC',200,1,'AC current through this wire, in amps.'):wait('The bench has no current reading for this signal wire.','A');
  }
  let zr=0,zi=0;
  if(input.reference==='none')return wait('Touch the pad on the back, or put the black probe on an earth terminal that has a path back to the supply.','V');
  if(va.reference!=='mains')return wait('This output is isolated from earth. Compare its two terminals with the probes.','V');
  if(input.reference==='black'){
    const grounded=b&&r.terminalVoltages[endpointKey(b)];
    if(!b||!grounded||grounded.reference!==va.reference||!r.bondedEarthTerminals?.includes(endpointKey(b)))return wait('Put the black probe on an earth terminal with a path back to the supply.','V');
    zr=grounded.re;zi=grounded.im;
  }
  const volts=Math.hypot((va.re+vb.re)/2-zr,(va.im+vb.im)/2-zi);
  if(volts<16)return wait('Below the 16 V FieldSense range. Use the probes for a voltage reading.','V');
  return number(volts,'V','AC',600,0,'Volts between this wire and earth. On the bench the wire sits in the bottom of the fork.');
}
export function instrumentData(setup:ForkSetup,reading:ForkReading):InstrumentEvidence|undefined{
  if(setup.method==='off'||!['value','open'].includes(reading.status))return undefined;
  return {model:'T6-600',method:setup.method,reference:setup.method==='fork-voltage'?setup.reference:'none',displayed:reading.shown,signal:reading.signal,held:false};
}
