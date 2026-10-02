import { simulate } from './simulation';
import { assessBuild } from './assessment';
import { assessFaultDiagnosis } from './fault-diagnosis';
import { captureMeasurement, needsSimulationTick } from './learning';
import type { CircuitDocument, DeviceState, Endpoint } from './types';
let states:Record<string,DeviceState>={};let circuitId='';
self.onmessage=(event:MessageEvent)=>{
  const m=event.data;
  try {
    const doc=m.document as CircuitDocument;
    if(doc.id!==circuitId||m.reset){states={};circuitId=doc.id;}
    if(m.kind==='measure'){
      const result=simulate(doc,states,0);
      const evidence=captureMeasurement(doc,result,{mode:m.mode??'resistance',a:m.a as Endpoint,b:m.b as Endpoint,wire:m.wire});
      self.postMessage({kind:'measurement',requestId:m.requestId,electricalGeneration:m.electricalGeneration,circuitId:doc.id,revision:doc.revision,mode:evidence.mode,a:evidence.a,b:evidence.b,wire:evidence.wire,value:evidence.value,explanation:evidence.explanation,evidence});return;
    }
    const result=simulate(doc,states,m.dt??.1);states=result.deviceStates;
    self.postMessage({kind:'result',result,circuitId:doc.id,electricalGeneration:m.electricalGeneration,needsTick:needsSimulationTick(doc,result)});
    if(m.kind==='test')self.postMessage({kind:'assessment',requestId:m.requestId,electricalGeneration:m.electricalGeneration,assessment:assessBuild(doc,result,m.expected)});
    if(m.kind==='diagnose')self.postMessage({kind:'diagnosis',requestId:m.requestId,electricalGeneration:m.electricalGeneration,revision:doc.revision,circuitId:doc.id,...assessFaultDiagnosis(doc,result,m.diagnosis,m.observations,m.challenge,m.evidence??[])});
  }catch(error){self.postMessage({kind:'error',requestId:m.requestId,electricalGeneration:m.electricalGeneration,revision:m.document?.revision,circuitId:m.document?.id,message:error instanceof Error?error.message:String(error)});}
};
