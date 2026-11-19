import { HOME_STAIR, STAIR_FOOT, STAIR_HALF, STAIR_TOP } from '../../lib/home-floorplan';
import type { Vec3 } from '../../lib/types';

type Add = (position:Vec3, size:Vec3, material:string, shape?:'box', rotation?:Vec3)=>void;
type Frame = (x:number,y:number,z:number,width:number,height:number)=>void;

/** Finished floor, open stairwell and joinery all follow the walking plan. */
export function stairHall(add:Add,frame:Frame){
  const box=(x:number,y:number,z:number,width:number,height:number,depth:number,material:string)=>
    add([x,y,z],[width,height,depth],material);
  const s=HOME_STAIR,cap=STAIR_TOP+2.53;
  const lowerX=(s.west+s.divider)/2,upperX=(s.divider+s.east)/2;
  // A two-storey stairwell. The high window sits above the turning landing.
  box(-2.2,(2.86+cap)/2,(s.back+s.landingEnd)/2,.12,cap-2.86,s.landingEnd-s.back,'wall1');
  box(s.east,cap/2,(s.back+s.landingEnd)/2,.12,cap,s.landingEnd-s.back,'wall1');
  box((s.west+s.east)/2,(cap+2.86)/2,s.landingEnd,s.east-s.west,cap-2.86,.12,'wall1');
  box((s.west+s.east)/2,cap+.03,(s.back+s.landingEnd)/2,s.east-s.west,.06,s.landingEnd-s.back,'cream');
  const windowX=-.96,windowW=1.03,sill=3.81,head=4.97;
  for(const [a,b] of [[s.west,windowX-windowW/2],[windowX+windowW/2,s.east]])
    box((a+b)/2,(cap+2.86)/2,s.back-.08,b-a,cap-2.86,.14,'wall1');
  for(const [a,b] of [[2.86,sill],[head,cap]])box(windowX,(a+b)/2,s.back-.08,windowW,b-a,.14,'wall1');
  // The lower part of the same face carries the working lamp.
  frame(windowX,(sill+head)/2,s.back,windowW,head-sill);
  box(windowX,(sill+head)/2,s.back-.06,windowW,head-sill,.016,'pane');
  box(windowX,(sill+head)/2,s.back-.006,.035,head-sill,.045,'white');
  box(windowX,sill-.02,s.back+.025,windowW+.09,.042,.16,'oak');
  box((s.west+s.east)/2,(STAIR_HALF-.032)/2,(s.back+s.turn)/2,s.east-s.west,STAIR_HALF-.032,s.turn-s.back,'cream');
  box((s.west+s.east)/2,STAIR_HALF-.016,(s.back+s.turn)/2,s.east-s.west,.032,s.turn-s.back,'oak');
  const landingDepth=s.landingEnd-STAIR_FOOT;
  box(upperX,(STAIR_TOP-.032)/2,(s.landingEnd+STAIR_FOOT)/2,s.east-s.divider,STAIR_TOP-.032,landingDepth,'wall1');
  box(s.divider,STAIR_TOP/2,(s.landingEnd+STAIR_FOOT)/2,.07,STAIR_TOP,landingDepth,'wall1');
  box(upperX,STAIR_TOP-.016,(s.landingEnd+STAIR_FOOT)/2,s.east-s.divider,.032,landingDepth,'oak');
  box(s.divider,STAIR_TOP+.53,(s.landingEnd+STAIR_FOOT)/2,.07,1.06,landingDepth,'wall1');
  box(s.divider,STAIR_TOP+1.08,(s.landingEnd+STAIR_FOOT)/2,.086,.04,landingDepth,'oak');
  box(upperX,STAIR_TOP+1.025,s.landingEnd-.068,.82,2.05,.032,'sage');
  frame(upperX,STAIR_TOP+1.025,s.landingEnd-.095,.84,2.05);
  for(const y of [.51,1.51])box(upperX,STAIR_TOP+y,s.landingEnd-.093,.64,.78,.028,'paint');
  box(upperX-.28,STAIR_TOP+.98,s.landingEnd-.135,.096,.026,.052,'brass');
  const rail=(x:number,z1:number,y1:number,z2:number,y2:number)=>{
    add([x,(y1+y2)/2,(z1+z2)/2],[.052,.054,Math.hypot(z2-z1,y2-y1)],'oak','box',[-Math.atan2(y2-y1,z2-z1),0,0]);
  };
  for(let k=0;k<s.risersPerFlight-1;k++){
    const z=s.turn+(k+.5)*s.going;
    const lower=(s.risersPerFlight-k-1)*s.rise,upper=STAIR_HALF+(k+1)*s.rise;
    for(const [x,top,width] of [[lowerX,lower,s.divider-s.west],[upperX,upper,s.east-s.divider]]){
      box(x,(top-.034)/2,z,width,top-.034,s.going,'cream');
      box(x,top-.017,z,width,.034,s.going+.009,'oak');
    }
    for(const offset of [-.085,0,.085]){
      const length=.90+s.rise*(.5+offset/s.going)-.015;
      box(s.divider,upper+length/2,z+offset,.030,length,.030,'white');
    }
    if(k%3===0)for(const [wall,railX,top] of [[s.west,s.west+.084,lower],[s.east-.06,s.east-.133,upper]])
      box((wall+railX)/2,top+.91+s.rise/2-.031,z,Math.abs(wall-railX)+.012,.035,.036,'brass');
  }
  rail(s.west+.084,s.turn,STAIR_HALF+.91,STAIR_FOOT,s.rise+.91);
  rail(s.east-.133,s.turn,STAIR_HALF+s.rise+.91,STAIR_FOOT,STAIR_TOP+.91);
  rail(s.divider,s.turn,STAIR_HALF+s.rise+.90,STAIR_FOOT,STAIR_TOP+.90);
  const returnZ=s.back+.085,turnRail=STAIR_HALF+.91;
  rail(s.west+.084,returnZ,turnRail,s.turn,turnRail);
  box((s.west+.084+s.east-.133)/2,turnRail,returnZ,s.east-.133-(s.west+.084),.054,.052,'oak');
  rail(s.east-.133,returnZ,turnRail,s.turn-s.going,turnRail);
  rail(s.east-.133,s.turn-s.going,turnRail,s.turn,turnRail+s.rise);
  rail(s.east-.133,STAIR_FOOT,STAIR_TOP+.91,STAIR_FOOT+.22,STAIR_TOP+.91);
  for(const [z,top] of [[s.turn,STAIR_HALF],[STAIR_FOOT,STAIR_TOP]]){
    box(s.divider,top+.55,z,.075,1.10,.075,'white');
    box(s.divider,top+1.11,z,.085,.032,.085,'oak');
  }
  // Ground-floor ceiling around the opening.
  box((s.east+2.2)/2,2.91,0,2.2-s.east,.06,5.59,'cream');
  box((s.east-2.2)/2,2.91,(2.8+s.landingEnd)/2,s.east+2.2,.06,2.8-s.landingEnd,'cream');
  box((s.divider-2.2)/2,2.91,(s.landingEnd+STAIR_FOOT)/2,s.divider+2.2,.06,s.landingEnd-STAIR_FOOT,'cream');
}
