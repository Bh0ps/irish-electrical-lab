import type { Vec3 } from './types';

// Hager NBN, CDA and ADA forms. Physical dimensions are millimetres.
// The bench holds loose devices above the mat for access to the lower bank.
export const DIN_UNIT = .014;
export const DIN_BENCH_LIFT = .52;
const forms = {
  mcb:  { upper:['IN'], lower:['OUT'], upperMark:['1'], lowerMark:['2'], depth:70 },
  mcb3: { upper:['L1IN','L2IN','L3IN'], lower:['L1OUT','L2OUT','L3OUT'], upperMark:['1','3','5'], lowerMark:['2','4','6'], depth:70 },
  rcd:  { upper:['LIN','NIN'], lower:['LOUT','NOUT'], upperMark:['1','3'], lowerMark:['2','4'], depth:70 },
  rcd3: { upper:['L1IN','L2IN','L3IN','NIN'], lower:['L1OUT','L2OUT','L3OUT','NOUT'], upperMark:['1','3','5','N'], lowerMark:['2','4','6','N'], depth:70 },
  rcbo: { upper:['LIN','NIN'], lower:['LOUT','NOUT'], upperMark:['1','N'], lowerMark:['2','N'], depth:68 },
};
export function dinForm(type:string) { return Object.hasOwn(forms,type) ? forms[type as keyof typeof forms] : undefined; }
export function dinDimensions(type:keyof typeof forms):Vec3 {
  return [forms[type].upper.length*17.5*DIN_UNIT, DIN_BENCH_LIFT+83*DIN_UNIT, forms[type].depth*DIN_UNIT];
}
export function dinPort(type:string,id:string) {
  const form=dinForm(type);
  if(!form)return;
  const upper=form.upper.includes(id), poles=upper?form.upper:form.lower, index=poles.indexOf(id);
  if(index<0)return;
  return {
    anchor:[(index-(poles.length-1)/2)*17.5*DIN_UNIT,DIN_BENCH_LIFT+(upper?83:0)*DIN_UNIT,(26-30)*DIN_UNIT] as Vec3,
    direction:[0,upper?1:-1,0] as Vec3, marking:(upper?form.upperMark:form.lowerMark)[index]
  };
}
