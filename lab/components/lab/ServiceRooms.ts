import {SERVICE_AREAS,serviceWalls,type ServiceKind} from '../../lib/service-floorplan';
import type {Vec3} from '../../lib/types';
import type {SiteItem} from '../../lib/job-site';

type Add=(position:Vec3,size:Vec3,material:string,shape?:'box'|'cylinder',rotation?:Vec3)=>void;
/** Architectural fittings and static station furniture use the shared instanced batches. */
export function serviceRoom(kind:ServiceKind,add:Add,items:SiteItem[]){
  const a=SERVICE_AREAS[kind],s=a.station,w=a.right-a.left,d=a.front-a.back,cx=(a.right+a.left)/2,cz=(a.front+a.back)/2;
  const box=(x:number,y:number,z:number,b:number,h:number,t:number,m:string)=>add([x,y,z],[b,h,t],m);
  const cyl=(x:number,y:number,z:number,r:number,h:number,m:string,rotation:Vec3=[0,0,0])=>add([x,y,z],[r,h,r],m,'cylinder',rotation);
  const cross:Vec3=[0,0,Math.PI/2],fore:Vec3=[Math.PI/2,0,0];
  box(cx,-.105,cz,w,.20,d,'concrete');
  box(cx,-.011,cz,w,.022,d,'concrete');
  for(const wall of serviceWalls(kind).annex)box(wall.x,1.43,wall.z,wall.w,2.86,wall.d,'wall2');
  const join=a.side*6.6;
  box(join,2.56,a.door,.12,.60,a.opening,'wall2');
  for(const side of [-1,1])box(join,1.13,a.door+side*a.opening/2,.17,2.26,.048,'steel');
  box(join,2.26,a.door,.17,.052,a.opening+.06,'steel');
  box(cx,2.91,cz,w,.07,d,'cream');
  for(const z of [a.back+1.0,a.front-.76]){
    box(cx,2.85,z,w,.085,.10,'steel');
    box(cx,2.79,z,1.21,.048,.11,'metal');box(cx,2.755,z,1.16,.025,.092,'white');
  }
  const x=s.x,z=s.z;
  const carton=(px:number,base:number,pz:number,w:number,h:number,d:number)=>{
    box(px,base+h/2,pz,w,h,d,'carton');
    box(px,base+h+.001,pz,.045,.003,d,'packingTape');box(px,base+h-.041,pz+d/2,.045,.08,.003,'packingTape');
    box(px-w*.23,base+h*.55,pz+d/2+.002,w*.22,h*.34,.002,'paper');
  };
  if(kind==='shop'){
    // Two wheeled stock cages parked beside the receiving route. Wanzl RC/N9 frame and belts.
    for(const offset of [-.49,.49]){
      const mid=x+offset;
      box(mid,.19,z,.71,.048,.82,'blue');
      for(const side of [-1,1]){
        const edge=mid+side*.353;
        for(const end of [-1,1]){
          const depth=z+end*.39;
          cyl(edge,.91,depth,.014,1.47,'metal');box(edge,.135,depth,.031,.09,.057,'steel');cyl(edge,.068,depth,.063,.028,'rubber',cross);
        }
        for(let row=0;row<=6;row++)box(edge,.34+row*.215,z,.015,.012,.78,'metal');
        for(let n=1;n<6;n++)cyl(edge,.98,z-.39+n*.13,.005,1.26,'steel');
      }
      for(const h of [.60,1.14])box(mid,h,z+.385,.70,.031,.011,'black');
      for(let level=0;level<2;level++)carton(mid,.215+level*.303,z,.58,.30,.59);
    }
    box(x,.008,z+.65,s.w+.22,.012,.055,'yellow');
  }else if(kind==='plant'){
    // Accessible pump plinth, paired headers, gauge tappings and isolating valves.
    box(x,.06,z,s.w,.12,s.d,'concrete');
    for(const h of [.60,.94]){
      cyl(x,h,z-.29,.060,s.w-.10,'metal',cross);
      for(const offset of [-.86,-.44,.44,.86]){
        cyl(x+offset,h,z-.29,.083,.037,'steel',cross);
        box(x+offset,h-.17,z-.30,.043,.29,.07,'iron');
      }
    }
    for(const offset of [-.62,.62]){
      cyl(x+offset,.40,z-.16,.049,.63,'metal');
      cyl(x+offset,.60,z-.222,.051,.14,'steel',fore);
      box(x+offset,.50,z-.08,.18,.023,.037,'red');
      cyl(x+offset,1.055,z-.29,.016,.15,'brass');cyl(x+offset,1.156,z-.27,.069,.035,'steel',fore);
      cyl(x+offset,1.156,z-.246,.057,.013,'white',fore);
      add([x+offset-.015,1.166,z-.236],[.036,.006,.006],'black','box',[0,0,-.53]);
    }
    const pump=items.find(i=>i.room===4&&i.id==='pump');
    if(pump){
      // The axial inlet flange and top discharge are measured from pump_default.glb.
      const [px,py,pz]=pump.position,k=pump.scale;
      const level=py+.53*k,depth=pz-.026*k,inlet=px+.955*k,outlet=px+.542*k,top=py+.96*k;
      cyl((inlet+x+.62)/2,level,depth,.025,x+.62-inlet,'metal',cross);
      cyl(x+.62,(level+.60)/2,depth,.025,.60-level,'metal');
      cyl(x+.62,.60,(depth+z-.29)/2,.025,depth-z+.29,'metal',fore);
      cyl(outlet,(top+.94)/2,depth,.022,.94-top,'metal');
      cyl(outlet,.94,(depth+z-.29)/2,.022,depth-z+.29,'metal',fore);
    }
  }else if(kind==='workshop'){
    // A source-capture bench and overhead rigid main, with a drop, gate and hood.
    box(x,.832,z,s.w,.056,s.d,'oak');
    for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*(s.w/2-.09),.41,z+sz*(s.d/2-.075),.072,.82,.072,'iron');
    box(x,.25,z,s.w-.09,.036,s.d-.13,'oak');
    cyl(cx,2.49,a.back+.32,.11,w-.3,'metal',cross);
    for(const offset of [-1.52,0,1.52]){cyl(cx+offset,2.49,a.back+.32,.117,.028,'steel',cross);box(cx+offset,2.70,a.back+.32,.02,.31,.04,'iron');}
    const hood=x-.80;
    cyl(hood,1.74,z-.29,.085,1.09,'metal');
    add([hood+.12,2.35,z-.29],[.085,.36,.085],'metal','cylinder',[0,0,-.77]);
    box(hood,1.84,z-.29,.245,.045,.24,'iron');box(hood+.15,1.85,z-.29,.15,.016,.14,'steel');
    box(hood,1.13,z-.29,.55,.21,.35,'steel');box(hood,1.11,z-.10,.48,.115,.018,'black');
  }else{
    // Roller frame with a clear pedestrian side and end access to the drive.
    for(const side of [-1,1]){
      box(x,.68,z+side*.41,s.w,.135,.056,'blue');
      for(const leg of [-1.62,0,1.62]){box(x+leg,.33,z+side*.39,.06,.65,.06,'steel');box(x+leg,.027,z+side*.39,.14,.05,.15,'iron');}
    }
    for(let i=0;i<38;i++)cyl(x-1.80+i*.097,.744,z,.031,.80,'metal',fore);
    if(items.some(i=>i.id==='motor-a'&&i.room===4)){
      box(x-1.51,.459,z+.67,.47,.026,.51,'steel');
      for(const side of [-1,1])box(x-1.51+side*.205,.35,z+.52,.034,.20,.25,'steel');
      box(x,1.135,a.back+.0635,.19,.11,.007,'steel');
    }
    for(const offset of [-.8,.47])carton(x+offset,.776,z,.49,.28,.37);
    box(x, .007,z+1.52,s.w+.32,.012,.055,'yellow');
    for(const offset of [-1.54,0,1.54]){
      cyl(x+offset,.47,z+1.28,.027,.92,'yellow');box(x+offset,.025,z+1.28,.12,.044,.12,'iron');
    }
    for(const h of [.48,.91])cyl(x,h,z+1.28,.024,3.09,'yellow',cross);
  }
}
