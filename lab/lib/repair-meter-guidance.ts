import {bellPushTerminal,type BellReadings} from './bell-fault';
import {describeEndpoint} from './endpoint-description';
import {shownVolts} from './fault-practice';
import {heaterFeedMark, heaterProbeTip, type HeaterReadings} from './heater-fault';
import {chimeMark} from './house-calls';
import type {MeasurementEvidence} from './learning';
import type {CircuitDocument} from './types';
import {worktopFaultPoints} from './worktop-fault';

type RepairJob='heater'|'worktop'|'chime';
type WorktopReadings={strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence};

function worktopOutput(doc:CircuitDocument){
  const mark=describeEndpoint(doc,worktopFaultPoints.switchOutput.a)?.terminalLabel;
  return mark&&!['OUT','Output','Switched output'].includes(mark)?'terminal '+mark:'the output';
}

export function faultReadingValue(sample:MeasurementEvidence) {
  if(sample.mode==='voltage')return shownVolts(sample);
  if(sample.status==='open')return 'OL · open circuit';
  const number=sample.instrument?.displayed??sample.value?.toLocaleString('en-IE',{maximumSignificantDigits:3});
  return number===undefined?'No reading':number+' '+sample.unit+(sample.instrument?.signal?' '+sample.instrument.signal:'');
}

function backScrew(doc:CircuitDocument) {
  const pin=bellPushTerminal(doc),label=describeEndpoint(doc,pin)?.terminalLabel;
  if(label==='Top screw')return 'the upper screw';
  if(label==='Bottom screw')return 'the lower screw';
  return label??'the screw wired to the chime';
}

function bellProbeTip(doc:CircuitDocument,sample:MeasurementEvidence,rows:BellReadings){
  const points=[sample.a,sample.b];
  const value=faultReadingValue(sample)+'. ';
  const common=points.findIndex(p=>p?.component==='chime'&&p.terminal==='AC2');
  if(common<0)return value+'Put one probe on '+chimeMark(doc,'AC2')+' at the chime and leave it there.';
  const moving=common===0?'black':'red';
  if(rows.call){
    return value+'Keep one probe at the hall. Take '+moving+' to '+backScrew(doc)+' on the back button using the simulated long lead.';
  }
  const pin=points[1-common];
  if(pin?.component==='chime'&&pin.terminal==='FRONT')return value+'That’s the front door. Move '+moving+' to '+chimeMark(doc,'REAR')+' for the back door.';
  return value+'Move '+moving+' to '+chimeMark(doc,'REAR')+' to check the back call.';
}

function worktopProbeTip(doc:CircuitDocument,sample:MeasurementEvidence,strip?:MeasurementEvidence){
  if(sample.mode!=='voltage'||sample.instrument&&sample.instrument.method!=='probe-voltage')return 'Use the meter’s two voltage probes to compare these points.';
  if(sample.instrument?.held)return 'Turn Hold off and record what the probes are touching now.';
  if(sample.assisted)return 'Place both probes yourself, then record what the meter shows.';
  const pair=[sample.a,sample.b];
  if(!strip){
    if(pair.every(p=>p?.component==='left'))return 'That’s the left strip. Try the + and − pads on the right strip.';
    return 'Start at the right strip. Put one probe on + and the other on −.';
  }
  const common=pair.findIndex(p=>p?.component==='right'&&p.terminal==='N');
  if(common<0)return 'Put '+(strip.a?.terminal==='N'?'red':'black')+' back on the − pad of the right strip. Both checks use that same pad.';
  const moving=common===0?'black':'red',other=pair[1-common];
  if(other?.component==='right-switch'&&other.terminal==='COM'){
    const mark=describeEndpoint(doc,other)?.terminalLabel;
    return (mark?'That’s the feed from the driver at '+mark+'. ':'That’s the feed from the driver. ')+'Move '+moving+' to '+worktopOutput(doc)+' to check the wire going to the strip.';
  }
  return 'Keep the probe on the right strip’s − pad. Move '+moving+' to '+worktopOutput(doc)+' on the right switch.';
}

/** Course sheet, in-room brief and meter all describe the same recorded evidence. */
export function repairMeterPrompt(doc:CircuitDocument,job:RepairJob,worktop:WorktopReadings,heater?:HeaterReadings,bell?:BellReadings,wrong?:MeasurementEvidence):string {
  if(job==='chime'){
    if(doc.components.find(c=>c.id==='front')?.params.pressed)return 'Let go of the front button before checking the back door.';
    if(!doc.components.find(c=>c.id==='back')?.params.pressed)return 'Hold the back doorbell button.';
    if(wrong)return bellProbeTip(doc,wrong,bell??{});
    const common=chimeMark(doc,'AC2');
    if(!bell?.call)return 'At the hall chime, measure '+chimeMark(doc,'REAR')+' to '+common+' with the back button held.';
    if(bell.push)return 'Check that the bench supply is on and take both readings again.';
    const reverse=bell.call.a?.terminal==='AC2';
    const pin=backScrew(doc);
    return 'Leave '+(reverse?'red':'black')+' on '+common+' in the hall. Use the simulated long lead to move '+(reverse?'black':'red')+' to '+pin+' on the back button.';
  }
  if(job==='heater'){
    if(!doc.components.find(c=>c.id==='fcu-switch')?.params.closed)return 'Turn the heater on at the wall.';
    if(wrong)return heaterProbeTip(doc,wrong,heater??{});
    if(!heater?.heater)return 'On the bench, check L to N at the heater.';
    if(heater.output)return 'Check the bench supply and wall switch, then measure again.';
    const reverse=heater.heater.a?.terminal==='N';
    return 'Leave '+(reverse?'red':'black')+' on heater N. Move '+(reverse?'black':'red')+' to '+heaterFeedMark(doc)+'.';
  }
  if(!doc.components.find(c=>c.id==='right-switch')?.params.closed)return 'Turn on the right worktop switch.';
  if(wrong)return worktopProbeTip(doc,wrong,worktop.strip);
  const {strip,switchOutput}=worktop;
  if(strip&&switchOutput)return 'Check the driver supply, then take both readings again.';
  if(!strip)return 'Touch red to + and black to − on the right strip.';
  const reverse=strip.a?.terminal==='N';
  return 'Keep '+(reverse?'red':'black')+' on the strip’s − pad. Move '+(reverse?'black':'red')+' to '+worktopOutput(doc)+' on the right switch.';
}
