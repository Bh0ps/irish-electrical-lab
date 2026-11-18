import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Parameters } from '../../lib/types';

const noPick:THREE.Mesh['raycast']=()=>{};
type Face='model'|'dial'|'lcd'|'hold';
function Layer({kind,value='',signal='',held=false,referenced=false}:{kind:Face;value?:string;signal?:string;held?:boolean;referenced?:boolean}){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=kind==='dial'?512:208;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.textAlign='center';ctx.fillStyle='#292c28';
    if(kind==='model'){
      ctx.font='bold 79px Arial';ctx.fillText('T6-600',256,80);ctx.font='bold 39px Arial';ctx.fillText('ELECTRICAL TESTER',256,139);
    }else if(kind==='hold'){
      ctx.fillStyle='#30373a';ctx.fillRect(0,0,512,208);ctx.fillStyle='#e7e9da';ctx.font='bold 147px Arial';ctx.fillText('HOLD',256,157,500);
    }else if(kind==='dial'){
      ctx.font='bold 30px Arial';ctx.fillText('OFF',256,65);ctx.fillText('A/V',376,96);ctx.fillText('V',437,174);ctx.fillText('Ω',447,275);
    }else{
      ctx.fillStyle=referenced?'#baddaa':'#b7c6a0';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#203224';ctx.font='bold 36px Arial';ctx.fillText([held?'HOLD':'',signal].filter(Boolean).join(' · '),256,48);
      ctx.font='bold 95px monospace';ctx.fillText(value.trim(),256,165,482);
    }
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
  },[kind,value,signal,held,referenced]);
  useEffect(()=>()=>texture?.dispose(),[texture]);
  if(!texture)return null;
  const position: [number,number,number]=kind==='lcd'?[0,.795,.214]:kind==='hold'?[.089,.61,held ? .228 : .233]:kind==='dial'?[0,.382,.176]:[0,1.008,.172];
  const dimensions: [number,number]=kind==='lcd'?[.336,.154]:kind==='hold'?[.099,.042]:kind==='dial'?[.413,.44]:[.34,.138];
  return <mesh position={position} raycast={noPick}><planeGeometry args={dimensions}/><meshBasicMaterial map={texture} transparent={kind!=='lcd'} depthWrite={kind==='lcd'} toneMapped={false}/></mesh>;
}
export function TesterFace({params}:{params:Parameters}){
  return <group><Layer kind="model"/><Layer kind="dial"/><Layer kind="hold" held={params.held===true}/><Layer kind="lcd" value={String(params.reading??'—')} signal={String(params.signal??'')} held={params.held===true} referenced={params.validReference===true}/></group>;
}
