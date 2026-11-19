import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';

/** WebKit can replace the displayed WebGL backing surface after the resize frame.
 * Redraw once the viewport has settled; leave the rest of the session on demand. */
export function SettledCanvas({layout}:{layout?:boolean|string}) {
  const invalidate=useThree(s=>s.invalidate);
  const gl=useThree(s=>s.gl);
  const width=useThree(s=>s.size.width),height=useThree(s=>s.size.height),dpr=useThree(s=>s.viewport.dpr);
  useEffect(()=>{
    let frame=0,settle=0,last=0;
    const cancel=()=>{cancelAnimationFrame(frame);window.clearTimeout(settle);window.clearTimeout(last);};
    const paint=()=>{if(!document.hidden&&gl.domElement.isConnected&&!gl.getContext().isContextLost())invalidate();};
    const changed=()=>{
      cancel();
      if(document.hidden)return;
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(paint);});
      settle=window.setTimeout(paint,180);
      last=window.setTimeout(paint,500);
    };
    changed();
    window.addEventListener('pageshow',changed);
    window.addEventListener('resize',changed);
    window.visualViewport?.addEventListener('resize',changed);
    document.addEventListener('fullscreenchange',changed);
    document.addEventListener('visibilitychange',changed);
    return ()=>{
      cancel();window.removeEventListener('pageshow',changed);window.removeEventListener('resize',changed);
      window.visualViewport?.removeEventListener('resize',changed);
      document.removeEventListener('fullscreenchange',changed);document.removeEventListener('visibilitychange',changed);
    };
  },[gl,invalidate,width,height,dpr,layout]);
  return null;
}
