import {currentEvidence, type MeasurementEvidence} from './learning';
import {endpointKey, type CircuitDocument, type Endpoint, type SimulationResult} from './types';

/** Current, independently placed probe readings taken against the same terminal. */
export function voltagesFromCommon(doc:CircuitDocument,result:SimulationResult|undefined,evidence:MeasurementEvidence[],common:Endpoint) {
  const found=new Map<string,MeasurementEvidence>();
  if(!result?.converged||result.revision!==doc.revision)return found;
  const probes=evidence.filter(sample=>sample?.mode==='voltage'&&sample.assisted===false&&
    (!sample.instrument||sample.instrument.method==='probe-voltage'));
  const reference=endpointKey(common);
  for(const sample of currentEvidence(doc,result,probes)){
    if(!sample.a||!sample.b||sample.value===null)continue;
    const a=endpointKey(sample.a),b=endpointKey(sample.b);
    if(a===reference||b===reference){
      const other=a===reference?b:a;
      if(!found.has(other))found.set(other,sample);
    }
  }
  return found;
}
