import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '../ui/dialog';
import type {Endpoint} from '../../lib/types';

export interface FlexLanding {
  point:Endpoint;
  connect:(point:Endpoint)=>boolean;
}

const terminals=[
  ['LIN','IN L','Incoming line'],['NIN','IN N','Incoming neutral'],
  ['LOUT','LOAD L','Line to heater'],['NOUT','LOAD N','Neutral to heater'],
  ['PE','Earth 1','Earth strap'],['PE2','Earth 2','Earth strap'],
] as const;

export function flexClue(pin:string){
  if(pin==='PE'||pin==='PE2')return 'That screw is on the earth strap. The green and yellow wire goes there.';
  if(pin==='LIN'||pin==='NIN')return 'IN is the feed from the board. Follow the flex going to the heater.';
  return 'N is neutral. The blue wire already has its place. Look for the line terminal on the heater side.';
}

export default function HeaterFlexChoice({landing}:{landing:FlexLanding}){
  const [open,setOpen]=useState(false),[hint,setHint]=useState('');
  return <><button type="button" className="site-repair flex-choice" aria-haspopup="dialog"
    onClick={()=>{setHint('');setOpen(true);}}>Reconnect flex</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="field-dialog"><DialogHeader>
      <DialogTitle>Where does the brown wire go?</DialogTitle></DialogHeader>
      <p>The loose wire comes from the heater flex. Choose the marking beside its terminal.</p>
      <div className="flex-terminals">{terminals.map(([id,mark,meaning])=><button key={id} type="button"
        onClick={()=>{if(landing.connect({component:landing.point.component,terminal:id}))setOpen(false);else setHint(flexClue(id));}}>
        <b>{mark}</b><span>{meaning}</span></button>)}</div>
      {hint&&<p className="task-feedback" role="status">{hint}</p>}
    </DialogContent></Dialog></>;
}
