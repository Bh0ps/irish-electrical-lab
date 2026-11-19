import { describeEndpoint } from './endpoint-description.ts';
import type { LessonActivity } from './learning.ts';
import type { CircuitDocument, ConfigurationLesson, Endpoint, Wire } from './types.ts';

type Reading=NonNullable<LessonActivity['measurement']>;
interface Check { instruction:string; readings:Reading[]; powerOff?:boolean }
const point=(component:string,terminal:string):Endpoint=>({component,terminal});
const voltage=(a:Endpoint,b:Endpoint):Reading=>({mode:'voltage',a,b});
const ohms=(wire:Wire):Reading=>({mode:'resistance',a:wire.from,b:wire.to});

function pointName(doc:CircuitDocument,p:Endpoint) {
  const end=describeEndpoint(doc,p);
  const fitting=p.component==='supply'?'bench supply':end?.equipmentName.split(' · ')[0]??p.component;
  return fitting+' '+(end?.pointLabel??p.terminal);
}

// These fittings need a live voltage comparison. The bench ohmmeter leaves
// converter windings and electronic inputs out of its passive circuit.
const voltageReferences:Partial<Record<number,[string,string,string]>>={
  13:['driver','+','Leave the driver on.'],
  20:['fixed','N','Turn the heater switch on. Use the virtual bench meter.'],
  24:['isolation','+','Leave the shaver supply on.'],
  43:['tx','-','Hold the bell push down for both readings.'],
  47:['inverter','N','Leave the grid and inverter on, with the AC isolator closed.'],
  48:['inverter','BL','Leave the backup supply on.'],
  58:['drive','COM','Close the RUN switch.'],
  63:['plc','N','Turn both sensors on.'],
  64:['safety-relay','N','Leave the motor stopped with the safety inputs closed.'],
  65:['driver','-','Leave the cupboard door open.'],
  66:['right','N','Turn on the right worktop switch.'],
  72:['chime','AC2','Hold the back button down for both readings.'],
  78:['sensor','-','Bring the metal up to the sensor.'],
  80:['courtesy','N','Hold the entrance push down for both readings.'],
};

/** Two independent checks that can be made on this circuit in the same
 * control state. They describe where to measure, without placing probes or
 * counting progress. Saved fittings supply their own printed terminal names.
 */
export function faultMeterCheck(lesson:ConfigurationLesson,doc:CircuitDocument):Check|undefined {
  const id=lesson.id;
  if([2,3,19].includes(id)){
    const fittings=id===19?['fixed','socket-b']:['load1','load2'];
    return {instruction:id===19?'Leave the fuse as it is. Record L to N at the heater and at socket B. Then read the current in the fuse’s trip record.':'Leave the breakers as they are. Record L to N at the lamp and then at the socket. Which breaker shows a trip?',
      readings:fittings.map(f=>voltage(point(f,'L'),point(f,'N')))};
  }
  if(id===11){
    const line=doc.wires.find(w=>[w.from,w.to].some(e=>e.component==='zone-a'&&e.terminal==='L'));
    if(!line)return;
    return {instruction:'Record L to N at the bench supply and the amps in the wire to light A. Its current now and the current in the trip record tell you two different things.',
      readings:[voltage(point('supply','L'),point('supply','N')),{mode:'current',wire:line.id}]};
  }
  const wire=doc.wires.find(w=>w.id===lesson.challenge.wire);
  if(!wire)return;
  if(id===18){
    const other=doc.wires.find(w=>w.id!==wire.id&&w.role==='L'&&[w.from,w.to].some(e=>e.component==='protect'&&e.terminal==='LOUT'));
    if(!other)return;
    return {instruction:'Set the meter to amps. Record the line current from the breaker to socket A, then from socket C back to the breaker. Keep the sockets in use.',
      readings:[{mode:'current',wire:other.id},{mode:'current',wire:wire.id}]};
  }
  const reference=voltageReferences[id];
  if(reference){
    const common=point(reference[0],reference[1]);
    return {instruction:reference[2]+' Leave one probe on '+pointName(doc,common)+'. Record the volts at '+pointName(doc,wire.from)+', then at '+pointName(doc,wire.to)+'.',
      readings:[voltage(wire.from,common),voltage(wire.to,common)]};
  }
  const related=doc.wires.filter(w=>w.id!==wire.id&&[w.from,w.to].some(e=>e.component===wire.to.component||e.component===wire.from.component));
  const sameFittings=related.find(w=>[w.from,w.to].every(e=>e.component===wire.to.component||e.component===wire.from.component));
  const comparison=sameFittings??related.find(w=>w.role===wire.role)??related.find(w=>w.role==='N'||w.role==='DC-')??related[0];
  if(!comparison)return;
  return {powerOff:true,readings:[ohms(wire),ohms(comparison)],
    instruction:'Turn off the bench supply. Set the precision study meter to ohms. Check '+pointName(doc,wire.from)+' to '+pointName(doc,wire.to)+'. Compare with '+pointName(doc,comparison.from)+' to '+pointName(doc,comparison.to)+'.'};
}

export function faultClue(lesson:ConfigurationLesson,doc:CircuitDocument,hints:number,worktop:boolean,heaterField=false):string {
  if(hints<1)return '';
  if(heaterField){
    if(hints===1)return 'With the simulated supply off, check the switch and fuse first.';
    if(hints===2)return 'Use the two screws marked L. With the switch closed, a good path reads close to zero ohms.';
    return 'Leave one probe on LOAD L. Touch the other to the brown flex end. Is the wire actually touching that clamp?';
  }
  if(hints===1)return worktop?'The left strip lights. Check the one that stays dark.':lesson.challenge.firstCheck;
  if(hints===2)return worktop?'Keep one probe on the right strip’s − pad. Compare the voltage at its + pad with the voltage leaving the switch.':lesson.challenge.hint;
  return faultMeterCheck(lesson,doc)?.instruction??lesson.challenge.hint;
}
