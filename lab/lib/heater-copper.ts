import {BufferGeometry,Float32BufferAttribute,Matrix4,Vector3} from 'three';
import type {Vec3} from './types';

// The PLXE Series C manual specifies H05VV-F, 3 × 1 mm² stranded flex.
// This representative lay gives 1.005 mm². The 5.5 mm exposed in this
// scene is the length of the existing 851 model's copper inside the clamp.
const stripLength=.0055,filamentRadius=.000100;
const layers=[{count:3,radius:.000116},{count:11,radius:.000355},{count:18,radius:.000583}];
const twist=(fraction:number)=>(fraction-.48)*.56;
const vector=(v:Vec3)=>new Vector3(...v);
export function heaterCopperFrame(end:Vec3,insulation:Vec3,rear:Vec3):Matrix4 {
  const axis=vector(insulation).sub(vector(end)).normalize();
  const right=axis.clone().cross(vector(rear)).normalize();
  const front=right.clone().cross(axis);
  return new Matrix4().makeBasis(right,axis,front).setPosition(vector(end));
}
export function heaterInsulationStart(frame:Matrix4):Vec3 {
  return new Vector3(0,stripLength,0).applyMatrix4(frame).toArray();
}
export function heaterCopperLanding(frame:Matrix4,second=false):{position:Vec3;approach:Vec3} {
  const fraction=second?.83:.24;
  const angle=twist(fraction)+(second?-1:1)*Math.PI/9;
  const radial=new Vector3(Math.sin(angle),0,Math.cos(angle));
  const position=radial.clone().multiplyScalar(layers[2].radius+filamentRadius);
  position.y=stripLength*fraction;
  // Offset the two insulated probe handles to opposite sides of the core.
  const approach=radial.clone().add(new Vector3(second?-.77:.77,second?.24:-.5,0)).normalize();
  return {position:position.applyMatrix4(frame).toArray(),approach:approach.transformDirection(frame).toArray()};
}
/** One draw call for the whole copper bundle; no solid invisible pick tube.
 * All the cut ends and the outer wires have real faces for the probe ray. */
export function makeHeaterCopperGeometry(){
  const positions:number[]=[],indices:number[]=[];
  const sides=8,rows=6;
  for(const layer of layers)for(let strand=0;strand<layer.count;strand++){
    const start=positions.length/3,baseAngle=2*Math.PI*strand/layer.count;
    for(let row=0;row<=rows;row++){
      const fraction=row/rows,angle=baseAngle+twist(fraction);
      for(let i=0;i<sides;i++){
        const rim=angle+2*Math.PI*i/sides;
        positions.push(layer.radius*Math.sin(angle)+filamentRadius*Math.sin(rim),
          fraction*stripLength,layer.radius*Math.cos(angle)+filamentRadius*Math.cos(rim));
      }
    }
    for(let row=0;row<rows;row++)for(let i=0;i<sides;i++){
      const a=start+row*sides+i,b=start+row*sides+(i+1)%sides;
      indices.push(a,b,a+sides,b,b+sides,a+sides);
    }
    for(let i=1;i<sides-1;i++){
      indices.push(start,start+i+1,start+i);
      const top=start+rows*sides;
      indices.push(top,top+i,top+i+1);
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
