import type { MeasurementEvidence } from './learning';
import type { LessonBookmark } from './lesson-bookmark';

export const worktopFaultTitle='One worktop stays dark';
export const faultScore=(hints:number)=>Math.max(40,100-hints*15);
export type FaultStage='measure'|'diagnose'|'repair'|'retest'|'done';

export function faultStage(fault:NonNullable<LessonBookmark['fault']>,hasReadings:boolean):FaultStage{
  if(fault.completed)return 'done';
  if(fault.repaired)return 'retest';
  if(fault.accepted)return 'repair';
  return hasReadings?'diagnose':'measure';
}
export function faultStageId(id:number,stage:FaultStage){
  return 'lesson:'+id+':'+(stage==='repair'||stage==='retest'?stage:'fault:'+stage);
}
export function worktopComparisonReady(samples:{strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence}){
  const strip=samples.strip?.value,output=samples.switchOutput?.value;
  return typeof strip==='number'&&Math.abs(strip)<1&&typeof output==='number'&&Math.abs(output)>1;
}
export function shownVolts(reading:MeasurementEvidence){
  if(reading.value===null)return 'No reading';
  const displayed=reading.instrument?.displayed??new Intl.NumberFormat('en-IE',{maximumFractionDigits:1}).format(reading.value);
  return displayed+' V'+(reading.instrument?.signal?' '+reading.instrument.signal:'');
}
export const faultChoices=[
  ['open-wire','Break in a wire'],['open-live','Break in the line wire (L)'],['open-neutral','Break in the neutral (N)'],
  ['missing-earth','Missing earth wire (PE)'],['short-circuit','Short between line and neutral'],['earth-fault','Current leaking to earth'],
  ['overload','Overload · too much current'],['wrong-control','Fault in the control wiring'],['phase-loss','One phase missing'],
];

export function lessonFaultChoices(id:number):string[][] {
  if(id===13)return [
    ['open-live','Break in the positive wire to the LED light'],
    ['open-neutral','Break in the negative wire back to the driver'],
    ['overload','The light is drawing too much current'],
  ];
  if(id===24)return [
    ['open-live','Break in the wire from SEC 1 to the outlet'],
    ['open-neutral','Break in the wire from SEC 2 to the outlet'],
    ['overload','The shaver is drawing too much current'],
  ];
  if(id===43)return [
    ['open-neutral','Break in the wire from the chime back to the transformer'],
    ['overload','The chime is drawing too much current'],
    ['open-live','Break in the wire from the transformer to the push'],
  ];
  if(id>=65)return [
    ['wrong-control','The control is stuck in one position'],
    ['open-wire','A break in one of the wires'],
    ['short-circuit','A short between the two supply wires'],
    ['overload','The load is drawing too much current'],
  ];
  return faultChoices.filter(([value])=>value!=='open-wire'&&(value!=='phase-loss'||id>=53));
}
export const kitchenFaultChoices=[
  ['wrong-control','The right switch has not closed'],['open-wire','A break between the right switch and the strip'],
  ['open-neutral','A break in the wire back from the strip to the driver'],
];
