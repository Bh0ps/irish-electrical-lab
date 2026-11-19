import {useRef,type PointerEvent} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp} from 'lucide-react';
import {walkStick} from '../../lib/site-walk';

const directions=[['up',ArrowUp],['left',ArrowLeft],['right',ArrowRight],['down',ArrowDown]] as const;
export function SiteWalkPad({move,release,nudge}:{move:(x:number,forward:number)=>void;release:()=>void;nudge:(direction:string)=>void}){
  const active=useRef<number|undefined>(undefined);
  const keyboard=useRef(false),pad=useRef<HTMLDivElement>(null);
  function drag(e:PointerEvent<HTMLDivElement>){
    if(active.current!==e.pointerId)return;
    const r=e.currentTarget.getBoundingClientRect(),radius=Math.min(r.width,r.height)/2;
    const [x,y]=walkStick(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,radius*.71);
    e.currentTarget.style.setProperty('--thumb-x',x*30+'px');
    e.currentTarget.style.setProperty('--thumb-y',-y*30+'px');
    e.currentTarget.dataset.pressed='true';
    move(x,y);
  }
  function finish(id:number){
    if(active.current!==id)return;
    active.current=undefined;
    if(pad.current)delete pad.current.dataset.pressed;
    release();
  }
  return <div ref={pad} className="site-walk-stick" role="group" aria-label="Walk controls"
    onPointerDown={e=>{if(active.current!==undefined||e.button!==0)return;active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);drag(e);}}
    onPointerMove={drag} onPointerUp={e=>finish(e.pointerId)} onPointerCancel={e=>finish(e.pointerId)}
    onLostPointerCapture={e=>finish(e.pointerId)} onBlur={e=>{if(keyboard.current&&!e.currentTarget.contains(e.relatedTarget)){keyboard.current=false;release();}}}>
    <i aria-hidden="true"/><span aria-hidden="true">Move</span>
    {directions.map(([dir,Icon])=><button key={dir} type="button" data-direction={dir} aria-label={'Walk '+dir}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboard.current=true;move(dir==='left'?-1:dir==='right'?1:0,dir==='up'?1:dir==='down'?-1:0);}}}
      onKeyUp={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboard.current=false;release();}}}
      onClick={e=>{if(!e.detail&&!keyboard.current)nudge(dir);}}><Icon size={19} aria-hidden="true"/></button>)}
  </div>;
}
