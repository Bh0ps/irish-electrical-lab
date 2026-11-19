import {Quaternion,Vector3} from 'three';
import {siteProbeSegments} from '../../lib/site-probe-shape';
import type {Vec3} from '../../lib/types';

/** Geometry in metres, with the exposed metal point at the group origin. */
export function MeterProbe({direction,red,tail=true}:{direction:Vec3;red:boolean;tail?:boolean}){
  const orientation=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),new Vector3(...direction).normalize());
  const grip=red?'#9b302b':'#282c31';
  return <group quaternion={orientation}>{siteProbeSegments.map(({start,end,base,top,facets})=>
    (tail||start<81)&&<mesh key={start} position={[0,(start+end)/2000,0]} raycast={()=>{}}>
      <cylinderGeometry args={[top/1000,base/1000,(end-start)/1000,facets]}/>
      {start===0?<meshStandardMaterial color="#a6acae" metalness={.76} roughness={.31}/>:<meshStandardMaterial color={grip}/>}
    </mesh>)}</group>;
}
