import {voltagesFromCommon} from './fault-probes';
import type {MeasurementEvidence} from './learning';
import {endpointKey, type CircuitDocument, type Endpoint, type SimulationResult} from './types';

const stripReturn:Endpoint={component:'right',terminal:'N'};
export const worktopFaultPoints={
  strip:{a:{component:'right',terminal:'L'},b:stripReturn},
  switchOutput:{a:{component:'right-switch',terminal:'OUT'},b:stripReturn},
};

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
