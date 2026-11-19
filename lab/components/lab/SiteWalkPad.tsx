import {useCallback,useEffect,useLayoutEffect,useRef,type PointerEvent as ReactPointerEvent} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,RotateCcw,RotateCw} from 'lucide-react';
import {WALK_DRAG_SLOP,walkPadVector,type WalkDirection} from '../../lib/site-walk';

const directions=[['up',ArrowUp],['left',ArrowLeft],['right',ArrowRight],['down',ArrowDown]] as const;
interface Press {
  id:number; startX:number; startY:number; centreX:number; centreY:number; radius:number;
  direction?:WalkDirection; hold?:ReturnType<typeof setTimeout>;
}
interface Props {move:(x:number,forward:number)=>void;release:()=>void;nudge:(direction:WalkDirection)=>void;steering:boolean}

export function SiteWalkPad({move,release,nudge,steering}:Props){
  const active=useRef<Press|undefined>(undefined);
  const keyboard=useRef(false),pad=useRef<HTMLDivElement>(null);
  const actions=useRef({move,release,nudge});
  useLayoutEffect(()=>{actions.current={move,release,nudge};},[move,release,nudge]);

  const vector=useCallback((press:Press,x:number,y:number)=>{
    const node=pad.current;
    if(!node)return;
    const [side,forward]=walkPadVector(press.direction,press.startX-press.centreX,press.startY-press.centreY,
      x-press.centreX,y-press.centreY,press.radius);
    node.style.setProperty('--thumb-x',side*30+'px');
    node.style.setProperty('--thumb-y',-forward*30+'px');
    node.style.setProperty('--walk-bearing',Math.atan2(side,forward)+'rad');
    node.toggleAttribute('data-moving',Boolean(side||forward));
    actions.current.move(side,forward);
  },[]);

  const finish=useCallback((tap=false)=>{
    const press=active.current;
    if(!press)return;
    active.current=undefined;
    const shortPress=press.hold!==undefined;
    if(press.hold!==undefined)clearTimeout(press.hold);
    const node=pad.current;
    if(node){
      delete node.dataset.pressed;delete node.dataset.moving;
      if(node.hasPointerCapture(press.id))node.releasePointerCapture(press.id);
    }
    actions.current.release();
    if(tap&&shortPress&&press.direction)actions.current.nudge(press.direction);
  },[]);

  function start(e:ReactPointerEvent<HTMLDivElement>){
    if(active.current||e.button!==0)return;
    const node=e.currentTarget,rect=node.getBoundingClientRect();
    const direction=(e.target as Element).closest<HTMLElement>('[data-direction]')?.dataset.direction as WalkDirection|undefined;
    const press:Press={id:e.pointerId,startX:e.clientX,startY:e.clientY,direction,centreX:rect.left+rect.width/2,centreY:rect.top+rect.height/2,radius:Math.min(rect.width,rect.height)*.355};
    active.current=press;
    // A system gesture can take ownership before capture. It must not start a delayed step.
    try{node.setPointerCapture(e.pointerId);}catch{finish();return;}
    node.dataset.pressed='true';
    node.style.removeProperty('--thumb-x');node.style.removeProperty('--thumb-y');
    if(!direction){vector(press,e.clientX,e.clientY);return;}
    actions.current.move(0,0);
    press.hold=setTimeout(()=>{
      if(active.current===press){press.hold=undefined;vector(press,press.startX,press.startY);}
    },150);
  }

  useEffect(()=>{
    function drag(e:PointerEvent){
      const press=active.current;
      if(press?.id!==e.pointerId)return;
      if(e.pointerType==='mouse'&&!e.buttons||!document.elementFromPoint(e.clientX,e.clientY)){finish();return;}
      if(press.hold!==undefined){
        if(Math.hypot(e.clientX-press.startX,e.clientY-press.startY)<=WALK_DRAG_SLOP)return;
        clearTimeout(press.hold);press.hold=undefined;
      }
      vector(press,e.clientX,e.clientY);
    }
    function end(e:PointerEvent){
      const press=active.current;
      if(press?.id===e.pointerId)finish(e.type==='pointerup'&&Math.hypot(e.clientX-press.startX,e.clientY-press.startY)<=WALK_DRAG_SLOP);
    }
    function cancel(){keyboard.current=false;finish();}
    const hidden=()=>{if(document.hidden)cancel();};
    // A keyboard, page zoom or orientation change can relocate the pad under a held thumb.
    const viewport=window.visualViewport;
    window.addEventListener('pointermove',drag,true);
    window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true);
    window.addEventListener('blur',cancel);window.addEventListener('pagehide',cancel);window.addEventListener('resize',cancel);
    viewport?.addEventListener('resize',cancel);viewport?.addEventListener('scroll',cancel);
    document.addEventListener('visibilitychange',hidden);
    return ()=>{
      cancel();
      window.removeEventListener('pointermove',drag,true);
      window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);
      window.removeEventListener('blur',cancel);window.removeEventListener('pagehide',cancel);window.removeEventListener('resize',cancel);
      viewport?.removeEventListener('resize',cancel);viewport?.removeEventListener('scroll',cancel);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[finish,vector]);

  return <div ref={pad} className="site-walk-stick" role="group" aria-label="Walk controls"
    onPointerDown={start} onLostPointerCapture={e=>{if(active.current?.id===e.pointerId)finish();}}
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
