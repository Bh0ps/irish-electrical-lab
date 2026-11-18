import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Point = [number, number, number];
const amber = '#f3af1b', rubber = '#20262a', trim = '#42484b', steel = '#a5aaac';
const materials = new Map<string,THREE.MeshStandardMaterial>();
const geometry = new Map<string,THREE.BufferGeometry>();
function material(color:string){
  if (!materials.has(color)) materials.set(color,new THREE.MeshStandardMaterial({
    color,roughness:color===steel?.32:.54,metalness:color===steel?.8:.04,
  }));
  return materials.get(color)!;
}
function cached(key:string, make:()=>THREE.BufferGeometry) {
  if(!geometry.has(key))geometry.set(key,make());
  return geometry.get(key)!;
}
function Box({p,s,c,r=.013,angle=0}:{p:Point;s:Point;c:string;r?:number;angle?:number}){
  const g=cached('box'+s.join('/')+'/'+r,()=>new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(v=>v*.45))));
  return <mesh position={p} rotation={[0,0,angle]} geometry={g} material={material(c)}/>;
}
function Disk({p,r,d,c}:{p:Point;r:number;d:number;c:string}){
  const g=cached('disc'+r+'/'+d,()=>new THREE.CylinderGeometry(r,r,d,24));
  return <mesh position={p} rotation={[Math.PI/2,0,0]} geometry={g} material={material(c)}/>;
}
function Cord({points,r,c}:{points:Point[];r:number;c:string}){
  const g=cached('cord'+points.join('/')+r,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),28,r,8,false));
  return <mesh geometry={g} material={material(c)}/>;
}
function Stud({x,y,z}:{x:number;y:number;z:number}){
  return <group><Disk p={[x,y,z]} r={.018} d={.008} c={steel}/><Box p={[x,y,z+.005]} s={[.024,.004,.003]} c={rubber}/></group>;
}
// Original interpretation of Fluke's T6-600 front/rear photographs and QRG.
// Proportions follow 259.3 × 61.1 × 43.8 mm. Leads are stowed on the back.
function ForkTester({dialPosition,held,redOut,blackOut}:{dialPosition:number;held:boolean;redOut:boolean;blackOut:boolean}) {
  return <>
    <group userData={{partId:'body'}}>
      <Box p={[0,.64,0]} s={[.454,1.13,.291]} c={rubber} r={.07}/>
      <Box p={[0,.86,.012]} s={[.481,.86,.308]} c={amber} r={.064}/>
      <Box p={[0,.44,.037]} s={[.436,.73,.26]} c={amber} r={.053}/>
      {[-1,1].map(side=><group key={side}>
        <Box p={[side*.217,.59,.012]} s={[.036,.64,.245]} r={.017} c={rubber}/>
        {Array.from({length:6},(_,i)=><Box key={i} p={[side*.224,.38+i*.072,.008]} s={[.015,.023,.221]} c={trim}/>)}
      </group>)}
      <Box p={[0,1.263,0]} s={[.494,.067,.319]} c={rubber} r={.024}/>
      <Box p={[0,.786,.18]} s={[.405,.259,.035]} c={trim} r={.022}/>
      <Box p={[0,.72,-.161]} s={[.35,.80,.025]} c={trim} r={.025}/>
      {[[-.135,.37],[.135,.37]].map(([x,y])=><Stud key={x} x={x} y={y} z={.172}/>)}
    </group>
    <group userData={{partId:'sensing'}}>
      <Box p={[0,1.403,0]} s={[.39,.28,.233]} c={amber} r={.057}/>
      {[-1,1].map(side=><group key={side}>
        <Box p={[side*.13,1.698,0]} s={[.101,.46,.195]} c={amber} r={.039} angle={-side*.021}/>
        <Box p={[side*.135,1.927,.002]} s={[.099,.10,.173]} c={rubber} r={.038}/>
        <Box p={[side*.126,1.586,.101]} s={[.052,.017,.007]} c={trim}/>
      </group>)}
    </group>
    <group userData={{partId:'display'}}><Box p={[0,.795,.203]} s={[.346,.165,.014]} r={.006} c="#a9bc96"/></group>
    <group userData={{partId:'mode'}}><Disk p={[-.103,.61,.186]} r={.048} d={.024} c={trim}/><Disk p={[-.103,.61,.201]} r={.037} d={.009} c={amber}/></group>
    <group userData={{partId:'hold'}}><Box p={[.089,.61,held?.197:.208]} s={[.12,.066,.026]} c={trim} r={.019}/><Box p={[.089,.61,held?.212:.223]} s={[.065,.010,.005]} c="#dddcd4"/></group>
    <group userData={{partId:'actuator',animation:'testerDial',axis:'z'}} position={[0,.39,.18]} rotation={[0,0,-dialPosition*.59]}>
      <Disk p={[0,0,0]} r={.133} d={.046} c={rubber}/><Box p={[0,.012,.036]} s={[.076,.20,.047]} c={trim} r={.025}/>
      <Box p={[0,.078,.063]} s={[.045,.026,.005]} c="#eee9d8"/>
    </group>
    <group userData={{partId:'ground'}}><Disk p={[0,.72,-.183]} r={.086} d={.015} c={rubber}/><Disk p={[0,.72,-.194]} r={.055} d={.009} c="#a4a5a2"/></group>
    <group userData={{partId:'probes'}}>
      {[-1,1].map(side=><group key={side}>
        <Box p={[side*.14,1.01,-.185]} s={[.08,.21,.06]} c={rubber}/>
        <group userData={{probeSide:side>0?'red':'black',partId:'probes'}} visible={side>0?!redOut:!blackOut}>
        <Box p={[side*.14,.946,-.215]} s={[.069,.26,.05]} r={.023} c={side>0?'#ad322b':rubber}/>
        <Box p={[side*.14,.775,-.21]} s={[.018,.087,.016]} c={steel}/>
        <Cord points={[[side*.14,1.07,-.21],[side*.202,1.10,-.20],[side*.212,.66,-.18],[side*.204,.16,-.105],[side*.15,.082,-.033],[side*.138,.142,0]]} r={.013} c={side>0?'#a02a28':rubber}/></group>
      </group>)}
    </group>
  </>;
}
type Outline=readonly (readonly [number,number])[];
function Plate({outline,depth,color,z=0,bore}:{outline:Outline;depth:number;color:string;z?:number;bore?:number}){
  const shape=cached('plate'+JSON.stringify([outline,depth,bore]),()=>{
    const path=new THREE.Shape(outline.map(([x,y])=>new THREE.Vector2(x,y)));path.closePath();
    if(bore){const hole=new THREE.Path();hole.moveTo(-bore,.216-bore);hole.lineTo(-bore,.216+bore);hole.lineTo(bore,.216+bore);hole.lineTo(bore,.216-bore);hole.closePath();path.holes.push(hole);}
    return new THREE.ExtrudeGeometry(path,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.004,bevelThickness:.003,steps:1});
  });
  return <mesh geometry={shape} material={material(color)} position={[0,0,z-depth/2]}/>;
}
// Open V cutters and a knurled stop, as on the Knipex universal manual stripper.
const cutter:Outline=[[.006,-.058],[.066,-.022],[.106,.158],[.108,.288],[.012,.288],[.012,.246],[.061,.214],[.012,.181],[.023,.144],[-.021,.051]];
// Lateral ferrule entry passes through the square opening and the four die faces.
const crimpHead:Outline=[[-.091,-.074],[-.143,.015],[-.164,.197],[-.128,.289],[-.051,.329],[.096,.305],[.159,.238],[.145,.082],[.065,-.061]];
function Pliers({crimp,closed}:{crimp:boolean;closed:boolean}) {
  return <group position={[0,.88,0]}>
    {[-1,1].map(side=><group key={side} rotation={[0,0,side*(closed ? -.085 : .035)]}>
      <group userData={{partId:'body'}}>
        <group scale={[side,1,1]}><Plate outline={[[.001,.013],[.039,.002],[.108,-.223],[.036,-.239],[-.026,-.038]]} depth={.068} z={side*.017} color={steel}/></group>
        <Box p={[side*.116,-.374,0]} s={[.09,.62,.066]} c={steel} angle={side*.25}/>
        <Box p={[side*.149,-.504,0]} s={[.125,.63,.105]} r={.045} c={crimp?'#22587a':'#ab3930'} angle={side*.25}/>
        <Box p={[side*.160,-.551,.049]} s={[.08,.44,.023]} c={rubber} angle={side*.25}/>
        <Box p={[side*.100,-.248,.016]} s={[.145,.087,.117]} c={crimp?'#205678':'#a63427'} r={.024} angle={side*.25}/>
      </group>
      {!crimp&&<group userData={{partId:'actuator'}} scale={[side,1,1]}>
        <Plate outline={cutter} depth={.076} color={steel} z={side*.012}/>
        <Box p={[.061,.274,.047]} s={[.074,.010,.008]} c={trim}/>
      </group>}
    </group>)}
    {crimp&&<group userData={{partId:'actuator'}}>
      <Plate outline={crimpHead} depth={.094} color="#373d41" bore={.086}/>
      <Plate outline={crimpHead} depth={.014} z={.061} color="#50585b" bore={.082}/>
      {Array.from({length:4},(_,i)=><group key={i} position={[0,.216,.011]} rotation={[0,0,i*Math.PI/2]}>
        <Plate outline={[[.08,-.072],[.08,.08],[closed?.031:.045,closed?.031:.045],[closed?.031:.045,-.021]]} depth={.086} color={steel}/>
      </group>)}
      {[[-.091,.146],[.096,.131],[-.044,.285]].map(([x,y])=><Stud key={x} x={x} y={y} z={.071}/>)}
    </group>}
    <group userData={{partId:'mechanism'}}><Disk p={[0,0,.067]} r={.052} d={.028} c={steel}/>
      <Box p={[0,0,.083]} s={[.052,.008,.004]} c={rubber}/>
      {crimp?<><Box p={[.039,-.166,.043]} s={[.037,.273,.037]} c={trim} angle={-.30}/>
        {Array.from({length:7},(_,i)=><Box key={i} p={[.052-i*.006,-.276+i*.022,.065]} s={[.035,.013,.012]} c={steel} angle={-.25}/>)}
        <Disk p={[.074,-.284,.056]} r={.027} d={.026} c={steel}/></>:
        <><Cord points={[[-.063,-.204,0],[-.037,-.168,.023],[0,-.219,0],[.037,-.168,.023],[.072,-.204,0]]} r={.009} c={steel}/>
        <group position={[0,.119,0]} rotation={[0,0,Math.PI/2]}><mesh material={material(steel)}><cylinderGeometry args={[.014,.014,.265,12]}/></mesh>
          <mesh position={[0,-.135,0]} material={material('#9b8a61')}><cylinderGeometry args={[.044,.044,.036,18]}/></mesh>
          {Array.from({length:12},(_,i)=><Box key={i} p={[.042*Math.cos(i*Math.PI/6),-.135,.042*Math.sin(i*Math.PI/6)]} s={[.008,.032,.008]} c={trim} r={.002}/>)}
        </group></>}
    </group>
  </group>;
}
function Driver() {
  return <group>
    <group userData={{partId:'body'}}><Box p={[0,.33,0]} s={[.226,.63,.223]} c="#a33531" r={.084}/>
      {[-1,1].map(s=><Box key={s} p={[s*.086,.33,0]} s={[.062,.44,.155]} c={rubber} r={.025}/>)}
    </group>
    <group userData={{partId:'actuator'}}><Box p={[0,.65,0]} s={[.214,.084,.212]} c={amber} r={.028}/>
      <Box p={[0,.655,.107]} s={[.086,.038,.009]} c="#e3dfd1"/></group>
    <group userData={{partId:'mechanism'}}><Box p={[0,.889,0]} s={[.067,.414,.067]} c="#ae3029" r={.016}/>
      <Box p={[0,1.143,0]} s={[.044,.108,.036]} c={steel} r={.009}/><Box p={[0,1.209,0]} s={[.038,.036,.015]} c={steel}/></group>
  </group>;
}
export function ToolGeometry({type,dialPosition=0,held=false,jawClosed=false,redOut=false,blackOut=false}:{type:string;dialPosition?:number;held?:boolean;jawClosed?:boolean;redOut?:boolean;blackOut?:boolean}){
  if(type==='forktester')return <ForkTester dialPosition={dialPosition} held={held} redOut={redOut} blackOut={blackOut}/>;
  if(type==='torquedriver')return <Driver/>;
  return <Pliers crimp={type==='crimper'} closed={jawClosed}/>;
}
