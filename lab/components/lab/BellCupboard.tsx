'use client';
import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {BELL_CUPBOARD as b,type BellServicePart} from '../../lib/bell-cupboard';
import type {Vec3} from '../../lib/types';

const white='#e9e8df',edge='#a4aba8',metal='#a3aaa9',dark='#485456';
function Block({at,size,colour}:{at:Vec3;size:Vec3;colour:string}){
  return <mesh position={at} castShadow receiveShadow>
    <boxGeometry args={size}/><meshStandardMaterial color={colour} roughness={.6}/>
  </mesh>;
}
function Pipe({at,r,length,axis='y',colour}:{at:Vec3;r:number;length:number;axis?:'x'|'y'|'z';colour:string}){
  return <mesh position={at} rotation={[axis==='z'?Math.PI/2:0,0,axis==='x'?Math.PI/2:0]} castShadow>
    <cylinderGeometry args={[r,r,length,16]}/><meshStandardMaterial color={colour} roughness={.52}/>
  </mesh>;
}
function Label({at,width,height,lines}:{at:Vec3;width:number;height:number;lines:string}){
  const texture=useMemo(()=>{
    const paper=document.createElement('canvas');paper.width=512;paper.height=160;
    const ink=paper.getContext('2d')!;
    ink.fillStyle='#f1f0e7';ink.fillRect(0,0,512,160);ink.fillStyle='#27332e';ink.textBaseline='middle';
    const [main,second]=lines.split('|');ink.font='bold 53px Arial';ink.fillText(main,18,second?52:80,476);
    if(second){ink.font='37px Arial';ink.fillText(second,18,116,476);}
    const t=new THREE.CanvasTexture(paper);t.colorSpace=THREE.SRGBColorSpace;return t;
  },[lines]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={at}><planeGeometry args={[width,height]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
function SurfaceConduit({x,start,colour}:{x:number;start:number;colour:string}){
  const end=2.88-b.y;
  return <>
    <Pipe at={[x,(start+end)/2,b.conduitZ]} r={.008} length={end-start} colour={colour}/>
    <Pipe at={[x,start+.009,b.conduitZ]} r={.012} length={.018} colour={edge}/>
    {[.36,.88,1.30].map(y=><group key={y}>
      <Block at={[x,y,.018]} size={[.034,.011,.034]} colour={white}/>
      <Pipe at={[x,y,b.conduitZ]} r={.010} length={.011} colour={white}/>
    </group>)}
  </>;
}
/** A wall fixing for the simulated supply, breaker or transformer. Following a wire
 * opens only its enclosures in the site view. The workbench retains the original models. */
export default function BellCupboard({part,trace,select}:{part:BellServicePart;trace:boolean;select:()=>void}){
  const tx=part==='tx',w=tx?b.transformerSize[0]:b.breakerSize[0],h=tx?b.transformerSize[1]:b.breakerSize[1],d=tx?b.transformerSize[2]:b.breakerSize[2];
  const colour=tx?'#c5cbc8':white,clamp=b.conduitY,z=b.conduitZ;
  return <group position={[b.x+(tx?b.transformerOffset:0),b.y,b.z]} userData={{partId:'body'}}
    onClick={e=>{e.stopPropagation();select();}}>
    {part==='supply'?<>
      <SurfaceConduit x={b.feedX} start={b.breakerSize[1]/2} colour="#b5bbb7"/>
      <Label at={[b.feedX,.135,z+.009]} width={.030} height={.010} lines="SUPPLY"/>
    </>:<>
      <Block at={[0,0,.003]} size={[w,h,.006]} colour={edge}/>
      {[-1,1].map(side=><group key={side}>
        <Block at={[side*(w/2-.002),0,d/2]} size={[.004,h,d]} colour={colour}/>
        <Block at={[0,side*(h/2-.002),d/2]} size={[w-.005,.004,d]} colour={colour}/>
      </group>)}
      {tx?<>
        <SurfaceConduit x={b.secondaryX} start={h/2} colour="#e1dfd3"/>
        <Label at={[b.secondaryX,.127,z+.009]} width={.032} height={.010} lines="12 V AC"/>
        <Pipe at={[-w/2-(b.transformerOffset-w/2-b.breakerSize[0]/2)/2,clamp,z]} axis="x" r={.009} length={b.transformerOffset-w/2-b.breakerSize[0]/2} colour="#bdc2bb"/>
        {[-w/2-.009,-b.transformerOffset+b.breakerSize[0]/2+.009].map(x=><Pipe key={x} at={[x,clamp,z]} axis="x" r={.013} length={.018} colour={edge}/>)}
        {!trace&&<>
          <Block at={[0,0,d-.004]} size={[w,h,.003]} colour={dark}/>
          <Block at={[0,0,d]} size={[w+.002,h+.002,.005]} colour={colour}/>
          {[-1,1].flatMap(x=>[-1,1].map(y=><group key={x+','+y} position={[x*(w/2-.012),y*(h/2-.012),d+.003]}>
            <Pipe at={[0,0,.001]} r={.0053} length={.002} axis="z" colour={edge}/>
            <Pipe at={[0,0,.0025]} r={.0039} length={.0015} axis="z" colour={metal}/>
            <Block at={[0,0,.0035]} size={[.005,.0008,.0003]} colour={dark}/>
          </group>))}
          <Label at={[0,.012,d+.0031]} width={.106} height={.034} lines="BELL TRANSFORMER|T1   ·   12 V AC"/>
        </>}
      </>:!trace&&<>
        {[-1,1].map(s=><Block key={s} at={[0,s*(h/4+.0115),d-.005]} size={[w,h/2-.023,.010]} colour={white}/>)}
        <Block at={[-.0455,0,d-.006]} size={[.019,.046,.008]} colour={white}/>
        <Block at={[.029,0,d-.006]} size={[.052,.046,.008]} colour={white}/>
        {[.015,.032].map(x=><Block key={x} at={[x,0,d-.001]} size={[.0009,.041,.001]} colour={edge}/>)}
        <Label at={[0,-.051,d+.0003]} width={.075} height={.020} lines="BELL SUPPLY   QF1"/>
        {[-1,1].map(s=><Pipe key={s} at={[s*.041,.068,d]} r={.0045} length={.002} axis="z" colour={edge}/>)}
      </>}
    </>}
  </group>;
}
