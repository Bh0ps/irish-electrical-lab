import {voltagesFromCommon} from './fault-probes';
import type {MeasurementEvidence} from './learning';
import {endpointKey, type CircuitDocument, type Endpoint, type SimulationResult} from './types';
import {worktopLooseEnd} from './worktop-connector';
import {resistanceSupplyWarning} from './simulation';
export {worktopLooseEnd} from './worktop-connector';

const stripReturn:Endpoint={component:'right',terminal:'N'};
export const worktopFaultPoints={
  strip:{a:{component:'right',terminal:'L'},b:stripReturn},
  switchOutput:{a:{component:'right-switch',terminal:'OUT'},b:stripReturn},
};

/** Reseating a push-on restores just that lead. Existing protection states
 * and unrelated faults are retained for the subsequent electrical test. */
export function reseatWorktopConnector(doc:CircuitDocument, wireId:string, chosen:Endpoint):CircuitDocument|undefined {
  if(resistanceSupplyWarning(doc))return;
  const wire=doc.wires.find(entry=>entry.id===wireId);
  const loose=wire&&worktopLooseEnd(doc,wire);
  if(!loose||loose.component!==chosen.component||loose.terminal!==chosen.terminal)return;
  return {...doc, faults:doc.faults.filter(fault=>!(fault.enabled&&fault.type==='open-wire'&&fault.wire===wireId))};
}

export function worktopLampStatus(doc:CircuitDocument,result?:SimulationResult):string|undefined {
  if(doc.lessonId!==66||!result?.converged||result.revision!==doc.revision)return;
  const left=result.deviceStates.left?.energized,right=result.deviceStates.right?.energized;
  if(typeof left!=='boolean'||typeof right!=='boolean')return;
  return 'Left strip '+(left?'lit':'dark')+' · Right strip '+(right?'lit':'dark');
}

/** Return the actual two-probe samples, keeping the learner's probe order and
 * the reading shown on their chosen instrument. Looking at a pad earns nothing. */
export function worktopFaultReadings(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[]){
  const found:{strip?:MeasurementEvidence;switchOutput?:MeasurementEvidence}={};
  if(doc.lessonId!==66)return found;
  const probes=voltagesFromCommon(doc,result,evidence,stripReturn);
  const strip=probes.get(endpointKey(worktopFaultPoints.strip.a)),output=probes.get(endpointKey(worktopFaultPoints.switchOutput.a));
  if(strip)found.strip=strip;
  if(output)found.switchOutput=output;
  return found;
}
