import {useEffect,useRef,type PointerEvent} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,RotateCcw,RotateCw} from 'lucide-react';
import {walkStick} from '../../lib/site-walk';

const directions=[['up',ArrowUp],['left',ArrowLeft],['right',ArrowRight],['down',ArrowDown]] as const;
type Direction=typeof directions[number][0];
interface Press {id:number; x:number; y:number; direction?:Direction; hold?:ReturnType<typeof setTimeout>}

export function SiteWalkPad({move,release,nudge,steering}:{move:(x:number,forward:number)=>void;release:()=>void;nudge:(direction:Direction)=>void;steering:boolean}){
  const active=useRef<Press|undefined>(undefined);
  const keyboard=useRef(false),pad=useRef<HTMLDivElement>(null);
  function vector(x:number,y:number){
    const r=pad.current!.getBoundingClientRect();
    const [side,forward]=walkStick(x-r.left-r.width/2,y-r.top-r.height/2,Math.min(r.width,r.height)*.355);
    pad.current!.style.setProperty('--thumb-x',side*30+'px');
    pad.current!.style.setProperty('--thumb-y',-forward*30+'px');
    move(side,forward);
  }
  function start(e:PointerEvent<HTMLDivElement>){
    if(active.current||e.button!==0)return;
    const direction=(e.target as Element).closest<HTMLElement>('[data-direction]')?.dataset.direction as Direction|undefined;
    const press:Press={id:e.pointerId,x:e.clientX,y:e.clientY,direction};
    active.current=press;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.pressed='true';
    if(!direction){vector(press.x,press.y);return;}
    move(0,0);
    // A quick tap must still move the camera when no render frame falls between down and up.
    press.hold=setTimeout(()=>{
      if(active.current===press){press.hold=undefined;vector(press.x,press.y);}
    },150);
  }
  function drag(e:PointerEvent<HTMLDivElement>){
    const press=active.current;
    if(press?.id!==e.pointerId)return;
    if(press.hold!==undefined){
      if(Math.hypot(e.clientX-press.x,e.clientY-press.y)<6)return;
      clearTimeout(press.hold);press.hold=undefined;
    }
    vector(e.clientX,e.clientY);
  }
  function finish(id:number,tap=false){
    const press=active.current;
    if(!press||press.id!==id)return;
    active.current=undefined;
    if(press.hold!==undefined)clearTimeout(press.hold);
    if(pad.current)delete pad.current.dataset.pressed;
    release();
    if(tap&&press.hold!==undefined&&press.direction)nudge(press.direction);
  }
  useEffect(()=>{
    function cancel(){
      const press=active.current;
      if(press?.hold!==undefined)clearTimeout(press.hold);
      active.current=undefined;
      if(pad.current)delete pad.current.dataset.pressed;
    }
    const hidden=()=>{if(document.hidden)cancel();};
    window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',hidden);
    return ()=>{cancel();window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  return <div ref={pad} className="site-walk-stick" role="group" aria-label="Walk controls"
    onPointerDown={start} onPointerMove={drag} onPointerUp={e=>finish(e.pointerId,true)}
    onPointerCancel={e=>finish(e.pointerId)} onLostPointerCapture={e=>finish(e.pointerId)}
    onBlur={e=>{if(keyboard.current&&!e.currentTarget.contains(e.relatedTarget)){keyboard.current=false;release();}}}>
    <i aria-hidden="true"/><span aria-hidden="true">{steering?'Steer':'Move'}</span>
    {directions.map(([dir,Arrow])=>{
      const turning=steering&&(dir==='left'||dir==='right');
      const Icon=turning?(dir==='left'?RotateCcw:RotateCw):Arrow;
      return <button key={dir} type="button" data-direction={dir} aria-label={(turning?'Turn ':'Walk ')+dir}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboard.current=true;nudge(dir);}}}
        onKeyUp={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();keyboard.current=false;release();}}}
        onClick={e=>{if(!e.detail&&!keyboard.current)nudge(dir);}}><Icon size={19} aria-hidden="true"/></button>;
    })}
  </div>;
}
