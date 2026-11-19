import type {Object3D} from 'three';
import type {SiteItem} from './job-site';
import type {ComponentInstance,Vec3} from './types';

/** The D814 has two interchangeable screws. These are locations on the back,
 * in bench units of 50 mm. The screw shoulder stays clear of the landed wire. */
export function sesameProbeContact(id:string,alternate=false):{position:Vec3;normal:Vec3;approach:Vec3}|undefined {
  if(id!=='COM'&&id!=='NO')return;
  const outside=id==='COM'?1:-1;
  const axis:Vec3=[alternate?-.37:.37,.27*outside,-1];
  return {position:[alternate?-.021:.021,.55+outside*(15.1+.9)/50,.0421],normal:[0,0,-1],approach:axis.map(n=>n/Math.hypot(...axis)) as Vec3};
}

export function sesameProbeScrew(hit:Object3D,materialName:string|undefined):string|undefined {
  if(materialName!=='Zinc screw head'&&materialName!=='Zinc screw head.001')return;
  for(let owner:Object3D|null=hit;owner;owner=owner.parent){
    const id=owner.userData.terminalId;
    if(id==='COM'||id==='NO')return id;
  }
}

type Pose=Pick<SiteItem,'position'|'rotation'>;
// Wall coordinates are metres. The training house leaves slack behind its push.
function fromWall(item:Pose,[x,y,z]:Vec3):Vec3 {
  const cos=Math.cos(item.rotation),sin=Math.sin(item.rotation);
  return [item.position[0]+x*cos+z*sin,item.position[1]+y,item.position[2]+z*cos-x*sin];
}

/** Both fixings come out before turning the wired base over. This is a
 * presentation position, not a hinge in the D814. Up remains up. */
export function sesameServicePose(item:Pose,withdrawn:boolean):Pose {
  return withdrawn?{position:fromWall(item,[.038,0,.062]),rotation:item.rotation+Math.PI-.16}:item;
}

/** The insulation stops at the GLB's formed copper. Give the two tails their
 * own loops, then carry both through the original hole in the door surround. */
export function sesameServiceLead(item:SiteItem,component:ComponentInstance,id:string,withdrawn:boolean):Vec3[] {
  if(!item.fixture?.bellPush||component.type!=='pushbutton'||component.variant!=='sesame'||(id!=='COM'&&id!=='NO'))return [];
  const sign=id==='COM'?1:-1,y=id==='COM'?.80:.30;
  const pose=sesameServicePose(item,withdrawn),scale=item.fixture.scale;
  const pin=(point:Vec3)=>fromWall(pose,point.map((v,i)=>v*scale[i]) as Vec3);
  const wall=(x:number,y:number,z:number)=>fromWall(item,[x,y,z]);
  const entry=wall(sign*.001,.0275+sign*.001,-.005),mouth=pin([.035,y,.054]);
  if(!withdrawn)return [mouth,entry];
  return [mouth,pin([.035,y,-.003]),pin([.046,y,-.064]),pin([.092,y,-.121]),
    wall(.025,.0275+sign*.012,.070),wall(.013,.0275+sign*.013,.063),
    wall(.005,.0275+sign*.011,.049),wall(sign*.001,.0275+sign*.006,.027),entry];
}
