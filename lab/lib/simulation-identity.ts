import type {CircuitDocument} from './types';

/** Geometry, labels and inspection are presentation. Electrical commands and
 * faults advance a separate generation so A → B → A cannot accept an old A. */
export function electricalKey(document:CircuitDocument):string {
  return JSON.stringify({id:document.id,lessonId:document.lessonId,supply:document.supply,
    components:document.components.map(c=>({id:c.id,type:c.type,params:c.params})),
    wires:document.wires.map(w=>({id:w.id,from:w.from,to:w.to,role:w.role,resistance:w.resistance})),
    faults:document.faults});
}
export function acceptsElectricalResult(current:{id:string;revision:number;generation:number},reply:{circuitId?:string;revision:number;electricalGeneration?:number}):boolean {
  if(reply.circuitId!==current.id)return false;
  return reply.electricalGeneration===undefined?reply.revision===current.revision:reply.electricalGeneration===current.generation;
}
