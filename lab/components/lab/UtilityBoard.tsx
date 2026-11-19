import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {UTILITY_BOARD,boardRiser,installedHandle} from '../../lib/consumer-unit-site';
import type {SiteItem} from '../../lib/job-site';
import type {ComponentInstance,Vec3} from '../../lib/types';

export function UtilityBoard({board,devices,shield}:{board:SiteItem;devices:{item:SiteItem;component:ComponentInstance}[];shield:boolean}){
  const [x,bottom]=boardRiser(board),{wall,trunkWidth:w,trunkDepth:d}=UTILITY_BOARD,top=2.878,height=top-bottom;
  return <group name="Utility cupboard containment">
    <mesh position={[x,bottom+height/2,wall+d/2]}><boxGeometry args={[w,height,d-.001]}/><meshStandardMaterial color="#d2cfc4" roughness={.77}/></mesh>
    <mesh position={[x,bottom+height/2,wall+d-.0002]}><boxGeometry args={[w-.003,height,.002]}/><meshStandardMaterial color="#eeebe2" roughness={.69}/></mesh>
    {shield&&devices.flatMap(({item,component})=>{
      const mark=component.id==='branch1'?'1':component.id==='branch2'?'2':component.id==='group'?'RCCB':undefined;
      if(!mark)return [];
      const [px,py]=installedHandle(item,component);
      return [<WayNumber key={item.id} mark={mark} position={[px+(mark==='RCCB'?.00875:0),py-.028,board.position[2]+.0365]}/>];
    })}
  </group>;
}
function WayNumber({mark,position}:{mark:string;position:Vec3}){
  const label=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=mark.length===1?154:307;canvas.height=96;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#f8f7ed';ctx.fillRect(0,0,canvas.width,96);ctx.fillStyle='#19241e';
    ctx.font='bold '+(mark.length===1?'86':'58')+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(mark,canvas.width/2,52);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[mark]);
  useEffect(()=>()=>label.dispose(),[label]);
  return <mesh position={position} raycast={()=>{}}><planeGeometry args={[mark.length===1?.016:.032,.010]}/><meshBasicMaterial map={label} toneMapped={false}/></mesh>;
}
