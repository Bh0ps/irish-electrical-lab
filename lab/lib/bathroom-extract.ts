import type {Vec3,Wire} from './types';

/** Metres in the Oakfield house. Positive z points out through the front wall. */
export const BATH_EXTRACT={
  wallInside:2.65, wallOutside:2.95, fanX:1.43, fanY:2.30, outletDrop:.005,
  sleeveRadius:.051, grilleWidth:.140, lightX:.85, lightZ:2.23, ceiling:2.88,
  window:{x:-.46,y:1.69,width:.96,height:.62},
  timerSize:[.055,.160,.082] as Vec3, timerOffset:.060,
  cpcSize:[.075,.075,.038] as Vec3, cpcOffset:.020,
  switchZ:.19, circuitHeight:2.955,
  outgoingOffset:.025,
};

export const BATH_SHOWER={x:-1.44,z:-2.25,w:1.10,d:.94};
export const BATH_KITCHEN_COUNTER={x:-4.94,z:-2.49,w:2.57,d:.59};
export const BATH_RACK={x:5.21,z:-.65,w:1.36,d:.54};

export function outsideGrillePose(touch:boolean){
  const b=BATH_EXTRACT,distance=touch?.43:.52;
  return {position:[b.fanX+.09,b.fanY+.055,b.wallOutside+distance] as Vec3,yaw:Math.atan2(.09,distance),pitch:-.11};
}

/** Describe only the two ends the learner actually connected, in either direction. */
export function bathroomWireNote(wire:Wire){
  const ends=[wire.from,wire.to].map(e=>e.component+'.'+e.terminal);
  const connects=(a:string,b:string)=>ends.includes(a)&&ends.includes(b);
  if(connects('light-switch.OUT','fan-isolation.L2IN'))return 'This is the signal from the light switch. Follow it through the isolator to the timer.';
  if(connects('fan-isolation.L2OUT','runon.IN'))return 'When the bathroom light goes off, this signal drops out and the timer starts counting.';
  if(connects('fan-isolation.L1OUT','runon.L'))return 'This feed keeps the timer powered after the light goes off.';
  if(connects('runon.OUT','fan.L'))return 'This wire feeds the fan while the timer is running.';
  if(connects('fan-fcu.PE2','fan-cpc.1'))return 'The earth wire ends in its own connector beside the fan. The fan itself has only L and N.';
  if(connects('light-switch.OUT','light.L'))return 'This wire goes straight from the light switch to the lamp.';
}
