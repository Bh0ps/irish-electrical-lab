import * as THREE from 'three';
import { CORE_COLOUR } from './cables';
import { bareRadius, cableProfile, coreRadius, profileScale, type CableFace } from './cable-form';
import type { CableCore, CableRun, Vec3 } from './types';

type Kind = CableRun['kind'];
type Ring = THREE.Vector2[];
type Frame = { point: THREE.Vector3; tangent: THREE.Vector3; across: THREE.Vector3; up: THREE.Vector3 };
const TAU = 2*Math.PI;
const circle = (radius:number, x=0, y=0, sides=16):Ring => Array.from({length:sides},(_,j)=>{
  const a=j*TAU/sides;
  return new THREE.Vector2(x+radius*Math.cos(a),y+radius*Math.sin(a));
});

// Every cross-section in one cable is drawn in a single indexed mesh. Keep cut
// faces separate from side vertices so their flat surface does not round over.
class Sweep {
  positions:number[]=[]; colours:number[]=[]; indices:number[]=[];
  vertex(frame:Frame, p:THREE.Vector2, colour:THREE.Color) {
    const {point,across,up}=frame;
    this.positions.push(point.x+across.x*p.x+up.x*p.y,point.y+across.y*p.x+up.y*p.y,point.z+across.z*p.x+up.z*p.y);
    this.colours.push(colour.r,colour.g,colour.b);
  }
  sides(frames:Frame[],ring:Ring,colour:THREE.Color) {
    const start=this.positions.length/3,n=ring.length;
    for(const frame of frames)for(const p of ring)this.vertex(frame,p,colour);
    for(let row=0;row<frames.length-1;row++)for(let j=0;j<n;j++){
      const a=start+row*n+j,b=start+row*n+(j+1)%n;
      this.indices.push(a,b,b+n,a,b+n,a+n);
    }
  }
  cap(frame:Frame,outline:Ring,holes:Ring[],colour:THREE.Color,reverse:boolean){
    const start=this.positions.length/3;
    for(const p of [...outline,...holes.flat()])this.vertex(frame,p,colour);
    for(const [a,b,c] of THREE.ShapeUtils.triangulateShape(outline,holes))this.indices.push(start+a,start+(reverse?c:b),start+(reverse?b:c));
  }
  mesh() {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(this.colours,3));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

function jacketRing(kind: Kind):Ring {
  const spec=cableProfile(kind),s=profileScale(kind),r=spec.height*s/2;
  if(spec.form==='round')return circle(r,0,0,24);
  const halfStraight=(spec.width-spec.height)*s/2;
  const ring:Ring=[];
  for(const sign of [1,-1])for(let i=0;i<=10;i++) {
    const angle=(sign===1?-.5:.5)*Math.PI+i*Math.PI/10;
    ring.push(new THREE.Vector2(sign*halfStraight+r*Math.cos(angle),r*Math.sin(angle)));
  }
  return ring;
}

export function cableMeshFrames(points:Vec3[],faces:[CableFace,CableFace],kind:Kind):Frame[] {
  const spine=points.map(p=>new THREE.Vector3(...p));
  const directions=spine.slice(1).map((p,i)=>p.clone().sub(spine[i]).normalize());
  const tangents=spine.map((_,i)=>i===0?directions[0]:i===spine.length-1?directions.at(-1)!:directions[i-1].clone().add(directions[i]).normalize());
  const profile=cableProfile(kind),twisted=profile.form==='twisted';
  const width=profile.width*profileScale(kind);
  // The reference bell pair has a three-inch lay, about 30 cable diameters.
  const pitch=30*width;
  const frames:Frame[]=[],distances:number[]=[];
  const quaternion=new THREE.Quaternion();
  let distance=0;
  function sample(point:THREE.Vector3,tangent:THREE.Vector3) {
    const prev=frames.at(-1);
    const across=prev ? prev.across.clone().applyQuaternion(quaternion.setFromUnitVectors(prev.tangent,tangent)) : new THREE.Vector3(...faces[0].across);
    const up=tangent.clone().cross(across).normalize();
    across.crossVectors(up,tangent).normalize();
    if(prev)distance+=prev.point.distanceTo(point);
    frames.push({point,tangent,across,up});distances.push(distance);
  }
  sample(spine[0],tangents[0]);
  for(let i=1;i<spine.length;i++){
    const length=spine[i-1].distanceTo(spine[i]);
    const subdivisions=Math.max(1,Math.ceil(length/(twisted?pitch/12:.55)));
    for(let j=1;j<=subdivisions;j++){
      const t=j/subdivisions;
      sample(spine[i-1].clone().lerp(spine[i],t),tangents[i-1].clone().lerp(tangents[i],t).normalize());
    }
  }
  const last=frames.at(-1)!,endAcross=new THREE.Vector3(...faces[1].across);
  const endRoll=Math.atan2(endAcross.dot(last.up),endAcross.dot(last.across));
  const turns=twisted?Math.round(-distance/pitch-endRoll/TAU):0;
  frames.forEach((frame,i)=>{
    const roll=(endRoll+TAU*turns)*distances[i]/(distance||1);
    frame.across.applyAxisAngle(frame.tangent,roll);
    frame.up.crossVectors(frame.tangent,frame.across).normalize();
  });
  return frames;
}

export function createCableMesh(kind:Kind,points:Vec3[],faces:[CableFace,CableFace]) {
  const spec=cableProfile(kind),scale=profileScale(kind),r=coreRadius(kind);
  const frames=cableMeshFrames(points,faces,kind),sweep=new Sweep();
  const cores=Object.entries(spec.centres).map(([key,centre])=>({key:key as CableCore,x:centre[0]*scale,y:centre[1]*scale}));
  if(spec.form==='flat'||spec.form==='round'){
    const ring=jacketRing(kind),shell=new THREE.Color(spec.form==='flat'?'#919998':'#e6e2d9');
    sweep.sides(frames,ring,shell);
    const holes=cores.map(({x,y})=>circle(r,x,y,12));
    sweep.cap(frames[0],ring,holes,shell,true);
    sweep.cap(frames.at(-1)!,ring,holes,shell,false);
  }else{
    for(const {key,x,y} of cores){
      const ring=circle(r,x,y,12),colour=new THREE.Color(CORE_COLOUR[key]);
      sweep.sides(frames,ring,colour);
      // The insulation continues directly into a dressed or loose tail.
      // A small web joins adjacent parallel cores on the bonded ribbon only.
      if(spec.form==='ribbon'&&x<Math.max(...cores.map(core=>core.x))){
        const inner=x+.86*r,outer=x+1.14*r,h=.18*r;
        sweep.sides(frames,[new THREE.Vector2(inner,-h),new THREE.Vector2(outer,-h),new THREE.Vector2(outer,h),new THREE.Vector2(inner,h)],colour);
      }
    }
  }
  return sweep.mesh();
}

// Use a compact strand bundle for the cut copper, even when looking at a very
// long run. Each loose end adds one draw call, independent of the strand count.
export function createBareTip(kind:Kind,core:CableCore,points:Vec3[]) {
  const end=new THREE.Vector3(...points.at(-1)!),prev=new THREE.Vector3(...points.at(-2)!);
  const tangent=end.clone().sub(prev).normalize(),across=new THREE.Vector3(0,Math.abs(tangent.z)>.9?1:0,Math.abs(tangent.z)>.9?0:1).cross(tangent).normalize(),up=tangent.clone().cross(across);
  const r=bareRadius(kind),jacket=coreRadius(kind),copper=new THREE.Color('#c88453');
  const a:Frame={point:end,tangent,across,up};
  const b:Frame={...a,point:end.clone().addScaledVector(tangent,r*2.6)};
  const sweep=new Sweep(),sleeve=circle(jacket);
  if(core==='green-yellow'){
    for(let half=0;half<2;half++){
      const halfRing=[new THREE.Vector2(0,0),...Array.from({length:9},(_,i)=>sleeve[(i+half*8)%16])];
      sweep.cap(a,halfRing,[],new THREE.Color(half?'#e9cd30':'#277540'),false);
    }
  }else sweep.cap(a,sleeve,[],new THREE.Color(CORE_COLOUR[core]),false);
  const strands=cableProfile(kind).stranded;
  const small=strands?r/5:r;
  const offsets=[new THREE.Vector2(0,0)];
  if(strands)for(const count of [6,12])offsets.push(...circle(count===6?2*small:4*small,0,0,count));
  for(const offset of offsets){
    const wire=circle(small,offset.x,offset.y,strands?8:16);
    sweep.sides([a,b],wire,copper);sweep.cap(b,wire,[],copper,false);
  }
  return sweep.mesh();
}
