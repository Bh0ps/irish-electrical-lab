import {DIN_BENCH_LIFT,DIN_UNIT,dinPort} from './din-devices';
import type {SitePose} from './site-camera';
import type {ComponentInstance,Vec3} from './types';
import type {SiteItem} from './job-site';
import {fixturePoint} from './site-fixtures';

// Plaster face and original layout of the utility cupboard. The Gamma shell
// is 250 x 375 x 103 mm. The cupboard worktop starts at x=4.90 m.
export const UTILITY_BOARD={x:4.16,bottom:1.28,wall:-2.81,height:.375,trunkWidth:.074,trunkDepth:.067};
export const BOARD_STUDY_ID='course-enclosure';
export const utilityCupboard={
  x:UTILITY_BOARD.x,width:.84,depth:.245,height:2.30,plinth:.16,doorThickness:.031,
};
// Door standing open at 90 degrees on its right-hand hinges.
export const cupboardLeaf={x:utilityCupboard.x+utilityCupboard.width/2-.012,
  z:UTILITY_BOARD.wall+utilityCupboard.depth+utilityCupboard.width/2,
  w:utilityCupboard.doorThickness,d:utilityCupboard.width};
export const cupboardFoot={x:utilityCupboard.x,z:UTILITY_BOARD.wall+utilityCupboard.depth/2,w:utilityCupboard.width,d:utilityCupboard.depth};
/** Sightline to the operating face through the open cupboard. Its wooden door
 * and sides also block picks when the room is being drawn as instanced scenery. */
export function cupboardFaceVisible(eye:Vec3|undefined,target:Vec3){
  if(!eye||eye[2]<=target[2])return false;
  const front=UTILITY_BOARD.wall+utilityCupboard.depth;
  const t=Math.max(0,(eye[2]-front)/(eye[2]-target[2]));
  const x=eye[0]+(target[0]-eye[0])*t,y=eye[1]+(target[1]-eye[1])*t;
  if(Math.abs(x-utilityCupboard.x)>=utilityCupboard.width/2-.040||y<=utilityCupboard.plinth||y>=utilityCupboard.height-.077)return false;
  // The leaf is upright on the right jamb. A ray crossing its inner face
  // above the plinth cannot reach a handle through the panel.
  const edge=cupboardLeaf.x-cupboardLeaf.w/2;
  if(eye[0]<=edge)return true;
  const cross=(edge-eye[0])/(target[0]-eye[0]);
  const z=eye[2]+(target[2]-eye[2])*cross,h=eye[1]+(target[1]-eye[1])*cross;
  return z>cupboardLeaf.z+cupboardLeaf.d/2||h<.02||h>utilityCupboard.height-.02;
}
export function mountedStudyControl(c:ComponentInstance){
  return c.mount?.board===BOARD_STUDY_ID&&c.mount.row<2&&(c.type==='mcb'||c.type==='rcd');
}
export function installedHandle(item:SiteItem,c:ComponentInstance):Vec3{
  const x=c.type==='rcd'?-8.75:0;
  return fixturePoint(item.position,item.scale,item.fixture,c,[x*DIN_UNIT,DIN_BENCH_LIFT+41.1*DIN_UNIT,(68.3-30)*DIN_UNIT],item.rotation);
}
export function cupboardView(board:SiteItem,view:'walk'|'ways'|'group'|'board',aspect:number,points:Vec3[]=[]):SitePose {
  const [x,y,z]=board.position;
  const target:Vec3=view==='walk'?[x+.022,y+.080,z+.036]:points.length?
    points.reduce<Vec3>((sum,p)=>sum.map((a,i)=>a+p[i]/points.length) as Vec3,[0,0,0]):[x,y+.188,z+.037];
  // Include both lower toggles in one shot. The RCCB gets its own view so T
  // and the operating lever stay on screen together.
  const halfExtent=(axis:0|1)=>Math.max(0,...points.map(p=>Math.abs(p[axis]-target[axis])));
  const rowsDistance=Math.max(.175,(2*halfExtent(1)+.081)/.91,Math.max(.101,2*halfExtent(0)+.045)/(.91*aspect));
  const distance=view==='walk'?Math.min(2.9,Math.max(1.75,1.04/(.91*aspect))):view==='board'?Math.max(.58,.408/(.91*aspect)):
    view==='group'?Math.max(.124,.060/(.91*aspect)):rowsDistance;
  if(view==='group')target[0]+=.008;
  if(view==='board')target[0]-=.036;
  if(view==='ways')target[1]-=.010;
  const rise=view==='group'?.034:.006;
  const position:Vec3=[target[0]+(view==='walk'?.24:0),view==='walk'?1.56:target[1]+rise,target[2]+distance];
  const dx=target[0]-position[0],dz=target[2]-position[2];
  return {position,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(target[1]-position[1],Math.hypot(dx,dz)),fitOnResize:true};
}

export function boardRiser(board:SiteItem):Vec3{
  return [board.position[0]-.061,board.position[1]+UTILITY_BOARD.height,board.position[2]];
}
/** From each fitted terminal mouth to the top entry inside the visible trunking. */
export function outgoingBoardLead(board:SiteItem,part:ComponentInstance,pin:Vec3,id:string,role:string):Vec3[]|undefined{
  const terminal=dinPort(part.type,id);
  if(!terminal)return;
  const top=boardRiser(board),y=pin[1]+terminal.direction[1]*.009;
  // Between the rear of the devices and the enclosure wall, the risers follow
  // the left half of the top entry. The two branch cores use separate lanes.
  const lane=top[0]+((part.mount?.slot??0)-6)*.003+(role==='N'?.008:0);
  const back=board.position[2]-.040;
  return [pin,[pin[0],y,pin[2]],[pin[0],y,back],[lane,y,back],
    [lane,top[1]-.012,back],[lane,top[1]-.012,top[2]],[lane,top[1],top[2]]];
}
