'use client';
import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {ThreeEvent} from '@react-three/fiber';
import {driverContact,KITCHEN_LIGHTS as k,ROCKER_BOX,rockerPanelCentre} from '../../lib/kitchen-lighting';
import type {Vec3} from '../../lib/types';

const alloy='#b9bfc0',dark='#42494a',plastic='#e1e2dc';
function Block({at,size,colour,metal=0}:{at:Vec3;size:Vec3;colour:string;metal?:number}){
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={colour} metalness={metal} roughness={.55}/></mesh>;
}
function Screw({at,r=.0022}:{at:Vec3;r?:number}){
  return <group position={at}>
    <mesh><cylinderGeometry args={[r,r,.001,12]}/><meshStandardMaterial color="#929795" metalness={.55} roughness={.45}/></mesh>
    <Block at={[0,.00053,0]} size={[r*1.45,.0001,.0006]} colour={dark}/>
  </group>;
}
function Label({at,w,h,line,sub='',inverse=false}:{at:Vec3;w:number;h:number;line:string;sub?:string;inverse?:boolean}){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=inverse?'#424849':'#f5f1df';ctx.fillRect(0,0,512,160);
    ctx.fillStyle=inverse?'#fffaf0':'#283938';ctx.textBaseline='middle';ctx.font='bold 54px sans-serif';ctx.fillText(line,13,sub?48:80,485);
    if(sub){ctx.font='35px sans-serif';ctx.fillText(sub,13,118,485);}
    const result=new THREE.CanvasTexture(canvas);result.colorSpace=THREE.SRGBColorSpace;return result;
  },[line,sub,inverse]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={at} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w,h]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
function Cord({points,r,colour,blockProbes=false}:{points:Vec3[];r:number;colour:string;blockProbes?:boolean}){
  const curve=useMemo(()=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),[points]);
  return <mesh castShadow raycast={blockProbes?THREE.Mesh.prototype.raycast:()=>{}}><tubeGeometry args={[curve,Math.max(24,points.length*8),r,8,false]}/><meshStandardMaterial color={colour} roughness={.76}/></mesh>;
}

function SwitchPlate({width,height,depth,front}:{width:number;height:number;depth:number;front:boolean}){
  const shape=useMemo(()=>{
    const outline=new THREE.Shape(),a=width/2,b=height/2,r=.002;
    outline.moveTo(-a+r,-b);outline.lineTo(a-r,-b);outline.quadraticCurveTo(a,-b,a,-b+r);
    outline.lineTo(a,b-r);outline.quadraticCurveTo(a,b,a-r,b);outline.lineTo(-a+r,b);
    outline.quadraticCurveTo(-a,b,-a,b-r);outline.lineTo(-a,-b+r);outline.quadraticCurveTo(-a,-b,-a+r,-b);
    if(front){
      const cut=new THREE.Path(),x=ROCKER_BOX.cutWidth/2,y=ROCKER_BOX.cutHeight/2;
      cut.moveTo(-x,-y);cut.lineTo(-x,y);cut.lineTo(x,y);cut.lineTo(x,-y);cut.closePath();outline.holes.push(cut);
      for(const hand of [-1,1]){const hole=new THREE.Path();hole.absarc(hand*(a-.006),hand*(b-.006),.0015,0,2*Math.PI,true);outline.holes.push(hole);}
    }else{const hole=new THREE.Path();hole.absarc(-.012,-.015,.0041,0,2*Math.PI,true);outline.holes.push(hole);}
    return outline;
  },[width,height,front]);
  return <mesh castShadow receiveShadow position={[0,0,-depth]}><extrudeGeometry args={[shape,{depth,bevelEnabled:false,curveSegments:8}]}/><meshStandardMaterial color={front?'#dedfd7':plastic} roughness={.52}/></mesh>;
}

/** The lid and rocker withdraw together. The open aperture has no solid face
 * across it; the two wired blade terminals can only be reached from behind. */
export function RockerEnclosure({origin,open,select}:{origin:Vec3;open:boolean;select:()=>void}){
  const b=ROCKER_BOX,w=b.width,h=b.height,d=b.depth,t=b.wall;
  const screwSpots=[[w/2-.006,h/2-.006],[-w/2+.006,-h/2+.006]];
  return <group userData={{partId:'cover'}} onClick={e=>{e.stopPropagation();if((e.nativeEvent as PointerEvent).pointerType!=='touch')select();}}>
    <group position={rockerPanelCentre(origin,false)}>
      <group position={[0,0,-d+t]}><SwitchPlate width={w} height={h} depth={t} front={false}/></group>
      {[-1,1].map(i=><group key={i}>
        <Block at={[i*(w-t)/2,0,-d/2]} size={[t,h,d]} colour={plastic}/>
        <Block at={[0,i*(h-t)/2,-d/2]} size={[w-2*t,t,d]} colour={plastic}/>
      </group>)}
      {screwSpots.map(([x,y])=><group key={x} position={[x,y,-d/2]} rotation={[Math.PI/2,0,0]}>
        <mesh><cylinderGeometry args={[.0036,.0047,d-.003,14]}/><meshStandardMaterial color={plastic}/></mesh>
        <mesh position={[0,(d-.003)/2+.0001,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.0013,.0022,16]}/><meshStandardMaterial side={THREE.DoubleSide} color="#9c895c" metalness={.48}/></mesh>
      </group>)}
      <mesh position={[-.012,-.015,-d+t+.0002]}><ringGeometry args={[.0031,.006,20]}/><meshStandardMaterial color="#515554" side={THREE.DoubleSide}/></mesh>
    </group>
    <group position={rockerPanelCentre(origin,open)} rotation={[0,open?b.rearYaw:0,0]}>
      <SwitchPlate width={w} height={h} depth={b.panel} front/>
      {screwSpots.map(([x,y])=><group key={x} position={[x,y,open?0:.00025]} rotation={[Math.PI/2,0,0]}>
        {open?<mesh rotation={[-Math.PI/2,0,0]} position={[0,-b.panel-.0001,0]}><ringGeometry args={[.0015,.0027,12]}/><meshStandardMaterial side={THREE.DoubleSide} color="#b2b6af"/></mesh>:<Screw at={[0,0,0]} r={.0027}/>}
      </group>)}
    </group>
  </group>;
}
const cores:Record<string,string>={L:'#694029',N:'#306aab',PE:'#7e9a41','+':'#ae3433','-':'#303435'};

/** A sealed Class I driver has factory leads at opposite ends. The two
 * removable lids and test points are on the separate junction boxes. */
export function KitchenDriver({volts,open,pick,choose}:{volts:number;open:boolean;pick:(id:string)=>void;choose:()=>void}){
  const select=(event:ThreeEvent<MouseEvent>)=>{
    event.stopPropagation();
    if((event.nativeEvent as PointerEvent).pointerType==='touch')return;
    let node:THREE.Object3D|null=event.object;
    while(node&&!node.userData.terminalId)node=node.parent;
    if(node)pick(node.userData.terminalId);else choose();
  };
  return <group userData={{partId:'body'}} onClick={select}>
    <Block at={[0,.002,0]} size={[k.caseSize[0],.004,k.caseSize[2]]} colour={alloy} metal={.52}/>
    <Block at={[0,.020,0]} size={[.194,.0376,.067]} colour={alloy} metal={.52}/>
    <Label at={[0,.03885,0]} w={.115} h={.054} line="LED DRIVER" sub={volts+' V   ·   CONSTANT VOLTAGE'}/>
    <Label at={[-.075,.03885,0]} w={.032} h={.054} line="INPUT" sub="L / N / PE" inverse/>
    <Label at={[.075,.03885,0]} w={.032} h={.054} line="OUTPUT" sub="+ / −" inverse/>
    {[-1,1].map(hand=>{
      const x=hand*k.boxOffset,ids=hand<0?['L','N','PE']:['+','-'],wall=hand*(k.boxOffset-k.boxSize[0]/2);
      const start=k.boxZ-k.boxSize[2]/2,end=k.backGapZ-k.driver[2];
      return <group key={hand}>
        {[.008,.013,.018,.023,.028,.033].map(y=><Block key={y} at={[0,y,hand*.0337]} size={[.184,.001,.0016]} colour="#989f9f" metal={.52}/>)}
        {[-1,1].map(z=><Screw key={z} at={[hand*.103,.0043,z*.0246]}/>)}
        <Block at={[hand*.096,.020,0]} size={[.005,.034,.064]} colour="#969e9e" metal={.35}/>
        <Cord points={[[hand*.097,.020,0],[hand*.14,.009,.001],[hand*.18,.005,.016],[hand*.218,.007,.035],[wall,.013,.035]]} r={.0036} colour={dark}/>
        <Block at={[hand*.101,.020,0]} size={[.010,.012,.012]} colour={dark}/>
        <Block at={[x,.006,(start+end)/2]} size={[.014,.012,start-end]} colour={plastic}/>
        <Block at={[x,.0121,(start+end)/2]} size={[.015,.0012,start-end]} colour="#efeee4"/>
        <Block at={[x,.0025,k.boxZ]} size={[k.boxSize[0],.005,k.boxSize[2]]} colour={plastic}/>
        {[-1,1].map(side=><group key={side}>
          <Block at={[x+side*.038,.014,k.boxZ]} size={[.002,.024,.054]} colour={plastic}/>
          <Block at={[x,.014,k.boxZ+side*.026]} size={[.076,.024,.002]} colour={plastic}/>
        </group>)}
        {open?ids.map(id=>{
          const [px,y,z]=driverContact(id);
          return <group key={id} userData={{terminalId:id}}>
            <Block at={[px,.009,z]} size={[.027,.009,.009]} colour="#e0d8c1"/>
            <Block at={[px,.015,z]} size={[.014,.008,.007]} colour="#bba15f" metal={.55}/>
            <Screw at={[px,y,z]} r={.0025}/>
            <Cord points={[[wall,.012,k.boxZ],[wall+hand*.009,.012,k.boxZ],[px-hand*.018,.012,z],[px-hand*.006,.012,z]]} r={.00125} colour={cores[id]}/>
          </group>;
        }):<>
          <Block at={[x,.031,k.boxZ]} size={k.boxSize.map((n,i)=>i===1?.006:n) as Vec3} colour={plastic}/>
          <Label at={[x,.0341,k.boxZ]} w={.051} h={.018} line={hand<0?'SUPPLY':volts+' V DC'}/>
          {[-1,1].map(d=><Screw key={d} at={[x+d*.032,.0342,k.boxZ+d*.020]}/>)}
        </>}
      </group>;
    })}
  </group>;
}

/** The opal cover clips below the tape. Lift it when inspecting the pads. */
export function StripChannel({x,open,level,tint,select}:{x:number;open:boolean;level:number;tint:THREE.Color;select:()=>void}){
  const y=k.bottom,z=k.profileZ,w=k.profileWidth,h=k.profileHeight,len=.505;
  const target=useMemo(()=>{const o=new THREE.Object3D();o.position.set(0,-.588,.020);return o;},[]);
  return <group position={[x,y,z]} userData={{partId:'cover'}} onClick={e=>{e.stopPropagation();if((e.nativeEvent as PointerEvent).pointerType!=='touch')select();}}>
    <Block at={[0,-.0006,0]} size={[len,.0012,w]} colour={alloy} metal={.55}/>
    {[-1,1].map(i=><Block key={i} at={[0,-h/2,i*(w/2-.0006)]} size={[len,h,.0012]} colour={alloy} metal={.55}/>)}
    <Block at={[len/2,-h/2,0]} size={[.002,h,w]} colour={plastic}/>
    {[-1,1].map(i=><Block key={i} at={[-len/2,-h/2,i*.006]} size={[.002,h,.005]} colour={plastic}/>)}
    {[-.085,-.240].map(distance=><Block key={distance} at={[-.263,-.0055,distance]} size={[.012,.0013,.004]} colour={plastic}/>)}
    <primitive object={target}/>
    {level>0&&<spotLight position={[0,-h-.001,0]} target={target} intensity={1.65*level} color={tint} angle={.72} penumbra={.75} distance={1.30}/>}
    {!open&&<mesh position={[0,-h+.0004,0]}>
      <boxGeometry args={[len-.001,.0013,w-.002]}/>
      <meshStandardMaterial color={level>0?tint:'#c6c9c6'} emissive={tint} emissiveIntensity={level*.87} roughness={.53}/>
    </mesh>}
  </group>;
}

export function FittedWireTails({tails,blockProbes=false}:{tails:{points:Vec3[];colour:string;id:string;radius?:number;stripe?:string;flexible?:boolean}[];blockProbes?:boolean}){
  const raycast=blockProbes?THREE.Mesh.prototype.raycast:()=>{};
  return <group onPointerDown={blockProbes?e=>e.stopPropagation():undefined} onPointerUp={blockProbes?e=>e.stopPropagation():undefined} onClick={blockProbes?e=>e.stopPropagation():undefined}>
    {tails.map(tail=>tail.flexible?<Cord key={tail.id} points={tail.points} r={tail.radius??.0008} colour={tail.colour} blockProbes={blockProbes}/>:<group key={tail.id}>{tail.points.slice(1).map((p,i)=>{
    const a=new THREE.Vector3(...tail.points[i]),v=new THREE.Vector3(...p).sub(a),mid=a.addScaledVector(v,.5);
    const radius=tail.radius??.0008,length=v.length();
    if(length<.000001)return null;
    return <group key={i} position={mid} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize())}>
      <mesh raycast={raycast}><cylinderGeometry args={[radius,radius,length,10]}/><meshStandardMaterial color={tail.colour}/></mesh>
      {tail.stripe&&<mesh raycast={raycast}><cylinderGeometry args={[radius+.00002,radius+.00002,length,5,1,true,.5,2.8]}/><meshStandardMaterial color={tail.stripe}/></mesh>}
    </group>;
  })}</group>)}</group>;
}
