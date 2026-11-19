import {useState} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '../ui/dialog';
import type {Endpoint} from '../../lib/types';

export interface FlexLanding {
  point:Endpoint;
  chimeTerminals?:[string,string][];
  rockerTerminals?:[string,string][];
  connect:(point:Endpoint)=>boolean;
}

const terminals=[
  ['LIN','IN L','Incoming line'],['NIN','IN N','Incoming neutral'],
  ['LOUT','LOAD L','Line to heater'],['NOUT','LOAD N','Neutral to heater'],
  ['PE','Earth 1','Earth strap'],['PE2','Earth 2','Earth strap'],
] as const;

export function flexClue(pin:string,landing?:FlexLanding){
  if(landing?.rockerTerminals){
    const mark=landing.rockerTerminals.find(([id])=>id===pin)?.[1];
    return pin==='COM'&&mark?'The driver already feeds '+mark+'. Look for the free blade that sends power to the right strip.':
      'Follow the loose wire from the right strip to the switch. Which blade is free?';
  }
  if(landing?.chimeTerminals){
    if(pin==='FRONT')return 'That screw takes the front door call. Look for the other call terminal.';
    if(pin==='V')return 'V is spare in this circuit. Look for the back call terminal.';
    return 'Those two screws feed the chime. The wire from the back button goes to a call terminal.';
  }
  if(pin==='PE'||pin==='PE2')return 'That screw is on the earth strap. The green and yellow wire goes there.';
  if(pin==='LIN'||pin==='NIN')return 'IN is the feed from the board. Follow the flex going to the heater.';
  return 'N is neutral. The blue wire already has its place. Look for the line terminal on the heater side.';
}

export default function HeaterFlexChoice({landing}:{landing:FlexLanding}){
  const [open,setOpen]=useState(false),[hint,setHint]=useState('');
  const chime=Boolean(landing.chimeTerminals),rocker=Boolean(landing.rockerTerminals);
  const options=landing.rockerTerminals?.map(([id,mark])=>[id,mark,id==='OUT'?'Outer blade':'Centre blade']).sort((a,b)=>a[1].localeCompare(b[1]))
    ??landing.chimeTerminals?.map(([id,mark])=>[id,mark,''])??terminals;
  return <><button type="button" className="site-repair flex-choice" aria-haspopup="dialog"
    onClick={()=>{setHint('');setOpen(true);}}>{rocker?'Reconnect strip wire':chime?'Reconnect back-door wire':'Reconnect flex'}</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="field-dialog"><DialogHeader>
      <DialogTitle>{rocker?'Where does the strip wire go?':chime?'Where does the back-door wire go?':'Where does the brown wire go?'}</DialogTitle></DialogHeader>
      <DialogDescription>{rocker?'The loose connector comes from the right strip. Choose a blade on the back of the switch.':chime?'Use the marking beside the chime screw.':'The loose wire comes from the heater flex. Choose the marking beside its terminal.'}</DialogDescription>
      <div className="flex-terminals">{options.map(([id,mark,meaning])=><button key={id} type="button" aria-label={rocker?mark+' · '+meaning:undefined}
        onClick={()=>{if(landing.connect({component:landing.point.component,terminal:id}))setOpen(false);else setHint(flexClue(id,landing));}}>
        <b>{mark}</b><span>{meaning}</span></button>)}</div>
      {hint&&<p className="task-feedback" role="status">{hint}</p>}
    </DialogContent></Dialog></>;
}
