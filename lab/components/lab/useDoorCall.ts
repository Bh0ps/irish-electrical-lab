import {useCallback,useEffect,useRef,useState} from 'react';
import {beginDoorPress,finishDoorPress,playDoorTones,type DoorPress} from '../../lib/door-call-feedback';
import type {CircuitDocument,ComponentInstance,SimulationResult} from '../../lib/types';

export function useDoorCall(){
  const [muted,setMuted]=useState(false);
  const [message,setMessage]=useState<{circuit:string;text:string}>();
  const audio=useRef<AudioContext|undefined>(undefined),pending=useRef<DoorPress|undefined>(undefined);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const closeAudio=useCallback(()=>{
    const ctx=audio.current;audio.current=undefined;
    if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
  },[]);
  const clear=useCallback(()=>{
    pending.current=undefined;clearTimeout(timer.current);closeAudio();setMessage(undefined);
  },[closeAudio]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden)clear();};
    document.addEventListener('visibilitychange',hide);
    return ()=>{document.removeEventListener('visibilitychange',hide);clearTimeout(timer.current);closeAudio();};
  },[clear,closeAudio]);
  const changeMuted=useCallback((off:boolean)=>{setMuted(off);if(off)closeAudio();},[closeAudio]);
  function press(doc:CircuitDocument,result:SimulationResult|undefined,button:ComponentInstance){
    pending.current=beginDoorPress(doc,result,button);
    if(!pending.current||document.hidden)return;
    clearTimeout(timer.current);setMessage(undefined);
    if(!muted&&typeof AudioContext!=='undefined'){
      try{
        const ctx=audio.current??new AudioContext();
        audio.current=ctx;
        if(ctx.state!=='running')void ctx.resume().catch(()=>{});
      }catch{closeAudio();}
    }
    timer.current=setTimeout(clear,3500);
  }
  const receive=useCallback((doc:CircuitDocument,reading:SimulationResult)=>{
    const started=pending.current;
    if(!started||started.circuit===doc.id&&doc.revision<started.revision)return;
    pending.current=undefined;
    if(document.hidden)return;
    const response=finishDoorPress(started,doc,reading);
    if(!response)return;
    setMessage({circuit:doc.id,text:response.caption});
    if(response.tones.length&&audio.current?.state==='running')playDoorTones(audio.current,response.tones);
    clearTimeout(timer.current);timer.current=setTimeout(clear,3500);
  },[clear]);
  return {muted,changeMuted,message,press,receive,clear};
}
