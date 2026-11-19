import {useEffect,useMemo,useState,type RefObject} from 'react';
import {forkRead,instrumentData,type ForkReading,type ForkSetup} from '../../lib/fork-tester';
import {resistanceSupplyWarning} from '../../lib/simulation';
import type {CircuitDocument,Endpoint,SimulationResult} from '../../lib/types';
import {fcuWireMouths} from '../../lib/bg851';

type Lead='red'|'black';
interface Visit {circuit:string;device:string;revision?:number;lead:Lead;red?:Endpoint;black?:Endpoint}
export const switchMeasurement='installed-switch:';

/** An optional dead test has its own pair of leads, so visiting the wall never
 * moves the probes used to diagnose the heater on the training bench. */
export function useInstalledOhmmeter(doc:CircuitDocument,result:SimulationResult|undefined,worker:RefObject<Worker|null>){
  const [visit,setVisit]=useState<Visit>();
  const [preview,setPreview]=useState<{key:string;reading:ForkReading}>();
  const [saved,setSaved]=useState('');
  const [recording,setRecording]=useState('');
  const [placement,setPlacement]=useState(0);
  const active=!!visit&&visit.circuit===doc.id;
  const safe=!!result?.converged&&result.revision===doc.revision&&!resistanceSupplyWarning(doc);
  const open=active&&safe&&visit.revision===doc.revision;
  const red=open?visit.red:undefined,black=open?visit.black:undefined;
  const setup=useMemo<ForkSetup>(()=>({method:'resistance',reference:'none',a:red,b:black}),[red,black]);
  const key=switchMeasurement+JSON.stringify([doc.id,doc.revision,placement,red,black]);
  useEffect(()=>{
    const channel=worker.current;
    if(!open||!red||!black||!channel)return;
    const receive=({data}:MessageEvent)=>{
      if(data.circuitId!==doc.id||data.revision!==doc.revision)return;
      if(data.kind==='instrument-preview'&&data.key===key)setPreview({key,reading:data.reading});
      if(data.kind==='measurement'&&data.requestId===key){
        setRecording('');
        if(data.evidence&&data.evidence.status!=='unresolved')setSaved(key);
      }
      if(data.kind==='error'&&data.requestId===key){
        setRecording('');
        setPreview({key,reading:{status:'unresolved',value:null,shown:'— — —',unit:'Ω',
          explanation:'The meter could not take this reading. Choose the two screws again.'}});
      }
    };
    channel.addEventListener('message',receive);
    channel.postMessage({kind:'instrument-preview',key,requestId:key,document:doc,setup});
    return ()=>channel.removeEventListener('message',receive);
  },[open,red,black,worker,key,doc,setup]);
  const reading=open&&preview?.key===key?preview.reading:forkRead(doc,result,setup);
  const instrument=instrumentData(setup,reading);
  function record(){
    if(!open||!red||!black||!instrument||saved===key||recording===key||!worker.current)return;
    setRecording(key);
    worker.current.postMessage({kind:'measure',document:doc,mode:'resistance',a:red,b:black,instrument,assisted:false,requestId:key});
  }
  function setOpen(next:boolean){
    if(!active||next&&!safe)return;
    setSaved('');setPreview(undefined);setVisit({circuit:doc.id,device:visit.device,lead:'red',revision:next?doc.revision:undefined});
  }
  function pick(point:Endpoint){
    if(!open||point.component!==visit.device||!Object.hasOwn(fcuWireMouths,point.terminal))return;
    setSaved('');
    setPlacement(previous=>previous+1);
    setVisit({...visit,[visit.lead]:point,lead:visit.lead==='red'?'black':visit.red?'black':'red'});
  }
  return {active,device:active?visit.device:undefined,safe,open,red,black,lead:active?visit.lead:'red' as Lead,
    start:(device:string)=>{setVisit({circuit:doc.id,device,lead:'red'});setPreview(undefined);setSaved('');},
    finish:()=>setVisit(undefined),setOpen,pick,choose:(lead:Lead)=>setVisit(v=>v&&({...v,lead})),
    reading,record,canRecord:open&&!!instrument&&saved!==key&&recording!==key,recorded:open&&saved===key};
}
