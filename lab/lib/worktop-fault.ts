import {currentEvidence, type MeasurementEvidence} from './learning';
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
  if(doc.lessonId!==66||!result?.converged||result.revision!==doc.revision)return found;
  const probes=evidence.filter(sample=>sample?.mode==='voltage'&&sample.assisted===false&&
    (!sample.instrument||sample.instrument.method==='probe-voltage'));
  for(const sample of currentEvidence(doc,result,probes)){
    if(!sample.a||!sample.b||sample.value===null)continue;
    const pair=[endpointKey(sample.a),endpointKey(sample.b)];
    if(!pair.includes(endpointKey(stripReturn)))continue;
    if(pair.includes(endpointKey(worktopFaultPoints.strip.a)))found.strip=sample;
    if(pair.includes(endpointKey(worktopFaultPoints.switchOutput.a)))found.switchOutput=sample;
  }
  return found;
}
