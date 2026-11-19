import type {TerminalDefinition,Vec3} from './types';

// Grothe 43170 dimensional drawing. The open unit is measured from the
// centre of its back, at its lower edge. One bench unit represents 100 mm.
export const CROMA_ENVELOPE:Vec3=[1.63,1.90,.504];
export const CROMA_PINS=['AC2','AC1','FRONT','REAR','V'] as const;
export const CROMA_K1={centre:[-.04,.937,0] as Vec3,width:.160,height:.140};
const markings=['=/~','8/12V','C1','C2','V'];
const purposes=[
  'One side of the bell transformer. In this circuit, leave one probe here to compare either door signal with this same point.',
  'The other side of the 8–12 volt supply. It also feeds the two door buttons in this circuit.',
  'Call input 1. The front door button sends the transformer voltage here.',
  'Call input 2. The back door button sends the transformer voltage here.',
  'Common for the alternative contact-sensing connection. A button can join V to C1 or C2. This screw is unused when the buttons send their own voltage.'
];
const pinIndex=(id:string)=>CROMA_PINS.findIndex(pin=>pin===id);
const pinY=(i:number)=>1.080-i*.050;
export function cromaTerminals():TerminalDefinition[] {
  return CROMA_PINS.map((id,i)=>({id,label:markings[i],role:i<2?'output':'control',group:'K1 · Behind the front panel',
    purpose:purposes[i],anchor:[.205,pinY(i),.218],entryDirection:[-1,0,0],scale:.34}));
}
export function cromaProbeContact(id:string):{position:Vec3;normal:Vec3}|undefined {
  const i=pinIndex(id);
  if(i>=0)return {position:[.263,pinY(i)+.009,.295],normal:[0,0,1]};
}
/** Loose end in the training house: the 6.8 mm bare core has cleared its
 * side-entry cage. Coordinates use the same scale and axis as the landed GLB. */
export const CROMA_LOOSE_C2={insulation:[.100,.916,.262] as Vec3,tip:[.168,.916,.262] as Vec3};
export function looseCromaCallPath():Vec3[] {
  const [, , , ...entry]=cromaLeadPath('REAR');
  return [CROMA_LOOSE_C2.insulation,[.069,.916,.262],[.035,.917,.247],...entry];
}
export function cromaLeadPath(id:string):Vec3[] {
  const i=pinIndex(id);
  if(i<0)return [];
  const y=pinY(i),x=[-.092,.012,-.04,.012,-.092][i];
  // Each core enters the left side of its cage. All five can share the
  // 16 × 14 mm rear opening without borrowing an adjacent terminal.
  const throatY=[.983,.983,.937,.891,.891][i];
  const approachZ=i===2||i===4?.262:.209;
  return [[.205,y,.218],[.145,y,.218],[.085,y,approachZ],[x,y,approachZ],[x,throatY,.214],[x,throatY,.124],[x,throatY,-.060]];
}
