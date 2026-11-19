import type {CircuitDocument,ComponentInstance,DeviceState,SimulationResult} from './types';

type Input='C1'|'C2';
export interface DoorPress {
  circuit:string; revision:number; button:string; bellButton:boolean;
  before:Map<string,DeviceState>|undefined;
}
export interface DoorResponse {caption:string;tones:Input[]}

function active(state:DeviceState,input:Input){
  return state.call==='Both'||state.call===(input==='C1'?'Front':'Rear');
}
export function beginDoorPress(doc:CircuitDocument,reading:SimulationResult|undefined,button:ComponentInstance):DoorPress|undefined {
  if(button.type!=='pushbutton'||button.params.pressed)return;
  const receivers=doc.components.filter(c=>c.type==='callchime');
  if(!receivers.length)return;
  const before=reading?.revision===doc.revision&&reading.converged
    ?new Map(receivers.map(c=>[c.id,reading.deviceStates[c.id]])):undefined;
  return {circuit:doc.id,revision:doc.revision+1,button:button.id,bellButton:button.variant==='sesame'||button.variant==='bell-push',before};
}
export function finishDoorPress(press:DoorPress,doc:CircuitDocument,reading:SimulationResult):DoorResponse|undefined {
  if(press.circuit!==doc.id||press.revision!==doc.revision||reading.revision!==doc.revision||
    !doc.components.find(c=>c.id===press.button)?.params.pressed)return;
  const quiet=(caption:string)=>press.bellButton?{caption,tones:[]}:undefined;
  if(!reading.converged||!press.before)return quiet('No confirmed reading. Release the button and try again.');
  const tones=new Set<Input>(),labels:string[]=[];
  let valid=0,ready=0,alreadyCalling=false;
  const receivers=doc.components.filter(c=>c.type==='callchime');
  for(const c of receivers){
    const state=reading.deviceStates[c.id],before=press.before.get(c.id);
    if(!state||!before)continue;
    valid++;
    if(state.supplyReady)ready++;
    for(const input of ['C1','C2'] as const){
      if(!active(state,input))continue;
      if(active(before,input)){alreadyCalling=true;continue;}
      tones.add(input);
      const name=input==='C1'?'Front call':'Back call';
      labels.push(c.label+' · '+name+(c.variant==='croma-100a'?' ('+input+')':''));
    }
  }
  if(tones.size)return {caption:labels.join('. '),tones:[...tones]};
  if(!valid)return quiet('No chime reading. Release the button and try again.');
  if(!ready)return quiet('Chime quiet. Check the supply at the chime.');
  return quiet(alreadyCalling?'No new call. A chime input is already active.':'Chime quiet. Check the call wire at the chime.');
}

// Two original short study tones. CROMA installations can assign their own melodies.
export function playDoorTones(ctx:BaseAudioContext,tones:Input[]){
  let t=ctx.currentTime+.01;
  for(const input of tones){
    for(const hz of input==='C1'?[784,622]:[523]){
      const voice=ctx.createOscillator(),envelope=ctx.createGain();
      voice.frequency.value=hz;
      envelope.gain.setValueAtTime(.0001,t);
      envelope.gain.exponentialRampToValueAtTime(.1,t+.012);
      envelope.gain.exponentialRampToValueAtTime(.0001,t+.36);
      voice.connect(envelope);envelope.connect(ctx.destination);
      voice.onended=()=>{voice.disconnect();envelope.disconnect();};
      voice.start(t);voice.stop(t+.37);t+=.21;
    }
  }
}
