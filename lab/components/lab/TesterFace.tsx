import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Parameters, Vec3 } from '../../lib/types';

const noPick:THREE.Mesh['raycast']=()=>{};
type Face='markings'|'rear'|'keys'|'lcd'|'hold';
function Layer({kind,value='',signal='',held=false,referenced=false,backlight=false,hazard=false,off=false}:{kind:Face;value?:string;signal?:string;held?:boolean;referenced?:boolean;backlight?:boolean;hazard?:boolean;off?:boolean}){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=kind==='markings'?950:kind==='rear'?460:kind==='keys'?180:260;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    function print(text:string,x:number,y:number,size:number,color:string,font='Arial'){
      ctx!.font='bold '+size+'px '+font;ctx!.textAlign='center';ctx!.textBaseline='middle';ctx!.fillStyle=color;ctx!.fillText(text,x,y);
    }
    if(kind==='markings'){
      const white='#eeeae1';
      print('Ω  )))',84,55,36,white);print('2000 Ω',88,86,19,white);
      print('A~',64,208,33,white);print('V~',119,208,31,'#e6bd36');print('FieldSense',91,245,20,white);
      print('V',214,325,38,white);print('AC / DC',215,358,21,white);print('OFF',345,343,29,white);
      print('T6-600',254,555,76,white);print('ELECTRICAL TESTER',254,620,28,white);
      print('600 V CAT III',254,784,34,white);print('+',122,885,31,white);print('COM',383,885,25,white);
    }else if(kind==='rear'){
      print('GROUND',256,67,54,'#352c1d');print('CONTACT',256,123,55,'#352c1d');print('2 × AA',256,416,44,'#352c1d');
    }else if(kind==='keys'){
      print('☼',70,93,63,'#eeece2');print('ϟ',448,96,54,hazard?'#ff5b37':'#f3e5c9');
    }else if(kind==='hold'){
      print('HOLD',256,135,144,'#f1ebee');
    }else{
      ctx.fillStyle=referenced?'#b8d88b':backlight?'#dee9cf':'#bdc6b0';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      if(!off){
        const ink='#263022';
        print(held?'HOLD':'',64,37,33,ink);print(signal,455,41,37,ink);
        print(hazard?'ϟ':'',29,137,47,ink);
        const parts=value.trim().split(/\s+/),last=parts.at(-1),unit=last&&['V','A','Ω'].includes(last)?parts.pop():'';
        ctx.font='bold 119px monospace';ctx.textAlign='right';ctx.fillStyle=ink;ctx.textBaseline='middle';
        ctx.fillText(parts.join(' '),425,145,363);print(unit??'',464,141,46,ink);
      }
    }
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
  },[kind,value,signal,held,referenced,backlight,hazard,off]);
  useEffect(()=>()=>texture?.dispose(),[texture]);
  if(!texture)return null;
  const position:Vec3=kind==='lcd'?[0,1.285,.200]:kind==='hold'?[-.139,.982,held?.186:.192]:kind==='keys'?[-.004,1.084,.182]:kind==='rear'?[0,.820,-.176]:[0,.521,.160];
  const dimensions:[number,number]=kind==='lcd'?[.354,.210]:kind==='hold'?[.066,.029]:kind==='keys'?[.35,.1]:kind==='rear'?[.159,.75]:[.390,.638];
  return <mesh position={position} rotation={[0,kind==='rear'?Math.PI:0,0]} raycast={noPick}><planeGeometry args={dimensions}/><meshBasicMaterial map={texture} transparent={kind!=='lcd'} depthWrite={kind==='lcd'} toneMapped={false}/></mesh>;
}
export function TesterFace({params}:{params:Parameters}){
  return <group><Layer kind="markings"/><Layer kind="rear"/><Layer kind="keys" hazard={params.hazard===true}/><Layer kind="hold" held={params.held===true}/>
    <Layer kind="lcd" value={String(params.reading??'')} signal={String(params.signal??'')} held={params.held===true} referenced={params.validReference===true} backlight={params.backlight===true} hazard={params.hazard===true} off={!params.dialPosition}/></group>;
}
