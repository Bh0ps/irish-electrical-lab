import { COMPONENTS } from './components.ts';
import { elvProbePair } from './elv-coursebook.ts';
import type { CircuitDocument, Endpoint } from './types';

const measurableLoads = new Set(['lamp','led','socket','shaveroutlet','socket3','heater','motor','motor3','pump','fan','cooker','shower','boiler','heatpump','chime','emergency','alarm','indicator','ev']);

/** Keep the printed probe instructions and the pair that earns credit together. */
export function lessonProbePoints(id:number, circuit:CircuitDocument): {a:Endpoint;b:Endpoint} | undefined {
  const specified = elvProbePair(id);
  if (specified) return specified;
  const pair = (component:string, first:string, second:string) => ({
    a:{component,terminal:first}, b:{component,terminal:second},
  });
  for (const item of circuit.components) {
    if (!measurableLoads.has(item.type)) continue;
    const terminals = COMPONENTS[item.type].terminals;
    for (const [first,second] of [['L','N'],['U1','U2'],['L1','N']]) {
      if ([first,second].every(id=>terminals.some(t=>t.id===id))) return pair(item.id,first,second);
    }
  }
  const source = circuit.components.find(item=>item.type==='source'||item.type==='source3');
  return source ? pair(source.id,source.type==='source3'?'L1':'L','N') : undefined;
}
