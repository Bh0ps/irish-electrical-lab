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
// Original geometry shaped from Fluke's T6-600 photographs and Quick Reference Guide, pp. 1–2.
// This is the closed instrument. The fork throat, selector, buttons, dock and leads are separate parts.
function Shell({shape,depth,z,c}:{shape:THREE.Shape;depth:number;z:number;c:string}){
  const geo=cached('shell'+shape.uuid+depth,()=>new THREE.ExtrudeGeometry(shape,{
    depth,curveSegments:12,bevelEnabled:true,bevelSegments:3,bevelSize:.007,bevelThickness:.008,steps:1
  }));
  return <mesh geometry={geo} position={[0,0,z-depth/2]} material={material(c)}/>;
}
function testerHousing(top:number,bottom:number,waist:number){
  const s=new THREE.Shape();
  s.moveTo(-.136,bottom);s.quadraticCurveTo(-.17,bottom,-.177,bottom+.048);
  s.quadraticCurveTo(-waist,.57,-.224,1.20);s.lineTo(-.221,top-.035);
  s.quadraticCurveTo(-.218,top,-.186,top);s.lineTo(.186,top);
  s.quadraticCurveTo(.218,top,.221,top-.035);s.lineTo(.224,1.2);
  s.quadraticCurveTo(waist,.57,.177,bottom+.048);s.quadraticCurveTo(.17,bottom,.136,bottom);
  s.closePath();return s;
}
const housingShape=testerHousing(1.485,.157,.222), seamShape=testerHousing(1.478,.16,.224);
const forkShape=(()=>{
  const s=new THREE.Shape();
  s.moveTo(-.203,1.427);s.quadraticCurveTo(-.200,1.77,-.177,1.915);
  s.quadraticCurveTo(-.174,1.947,-.140,1.965);s.quadraticCurveTo(-.084,2.012,-.079,1.941);
  s.lineTo(-.079,1.641);s.absarc(0,1.641,.079,Math.PI,2*Math.PI,false);
  s.lineTo(.079,1.941);s.quadraticCurveTo(.084,2.012,.14,1.965);
  s.quadraticCurveTo(.174,1.947,.177,1.915);s.quadraticCurveTo(.20,1.77,.203,1.427);
  s.closePath();return s;
})();
const frontLabel:Outline=[[-.149,.202],[-.181,.53],[-.198,.817],[-.18,.849],[-.10,.852],[.045,.578],[.179,.613],[.151,.211],[.135,.195]];
const redLead='#bd362e', slate='#444546', testYellow='#f5b51d';
function Shaft({x,y,z,r1,r2,h,c}:{x:number;y:number;z:number;r1:number;r2:number;h:number;c:string}){
  const g=cached('shaft'+[r1,r2,h].join('/'),()=>new THREE.CylinderGeometry(r1,r2,h,18));
  return <mesh position={[x,y,z]} geometry={g} material={material(c)}/>;
}
function ForkTester({dialPosition,held,redOut,blackOut}:{dialPosition:number;held:boolean;redOut:boolean;blackOut:boolean}) {
  return <>
    <group userData={{partId:'body'}}>
      <Shell shape={seamShape} depth={.04} z={-.015} c="#825614"/>
      <Shell shape={housingShape} depth={.138} z={.071} c={testYellow}/>
      <Shell shape={housingShape} depth={.084} z={-.078} c="#e8a51a"/>
      <Box p={[0,1.408,.006]} s={[.476,.030,.288]} r={.013} c={testYellow}/>
      <Plate outline={frontLabel} depth={.007} z={.152} color={slate}/>
      <Box p={[0,.137,-.006]} s={[.30,.099,.229]} r={.033} c={rubber}/>
      <Box p={[0,.741,-.140]} s={[.211,1.065,.030]} r={.030} c="#a27323"/>
      <Box p={[0,.744,-.160]} s={[.203,1.049,.024]} r={.027} c={testYellow}/>
      <Box p={[0,1.304,-.136]} s={[.287,.119,.037]} r={.014} c={testYellow}/>
      <Box p={[0,1.317,-.162]} s={[.131,.035,.021]} r={.008} c="#c1891e"/>
      <Disk p={[0,.281,-.180]} r={.027} d={.012} c="#806225"/>
      <Box p={[0,.281,-.188]} s={[.035,.006,.006]} c={rubber} angle={.55}/>
      {[-1,1].map(side=><group key={side}>
        <Stud x={side*.151} y={1.485} z={-.101}/>
        <Shaft x={side*.062} y={.075} z={0} r1={.033} r2={.023} h={.116} c={rubber}/>
        <Box p={[side*.061,.203,.157]} s={[.084,.026,.009]} r={.004} c={side<0?redLead:rubber}/>
      </group>)}
    </group>
    <group userData={{partId:'sensing'}}>
      <Shell shape={forkShape} depth={.174} z={0} c={testYellow}/>
      <Cord points={[[-.104,1.664,.097],[-.097,1.598,.097],[-.062,1.553,.097],[0,1.531,.097],[.062,1.553,.097],[.097,1.598,.097],[.104,1.664,.097]]} r={.006} c={redLead}/>
    </group>
    <group userData={{partId:'display'}}>
      <Box p={[0,1.286,.153]} s={[.408,.266,.036]} r={.022} c="#b78622"/>
      <Box p={[0,1.285,.174]} s={[.386,.245,.024]} r={.015} c="#393a37"/>
      <Box p={[0,1.285,.190]} s={[.365,.222,.013]} r={.013} c="#beccaa"/>
    </group>
    <group userData={{partId:'backlight'}}><Box p={[-.133,1.084,.157]} s={[.085,.048,.023]} c={rubber}/></group>
    <group userData={{partId:'mode'}}><Box p={[-.018,1.084,.156]} s={[.090,.050,.025]} c="#9f751b"/><Box p={[-.018,1.084,.171]} s={[.073,.038,.012]} c={testYellow}/></group>
    <group userData={{partId:'display'}}><Plate outline={[[.087,1.061],[.125,1.115],[.163,1.061]]} depth={.008} z={.156} color={rubber}/></group>
    <group userData={{partId:'hold'}}><Disk p={[-.139,.982,.158]} r={.055} d={.024} c={rubber}/><Disk p={[-.139,.982,held?.174:.180]} r={.044} d={.019} c="#6d5185"/></group>
    <group userData={{partId:'actuator',animation:'testerDial',axis:'z'}} position={[.070,.837,.165]} rotation={[0,0,-dialPosition*.55]}>
      <Disk p={[0,0,0]} r={.155} d={.028} c="#72551d"/><Disk p={[0,0,.023]} r={.148} d={.030} c={testYellow}/>
      {Array.from({length:15},(_,i)=>{
        const a=-.51+i*.137;
        return <Disk key={i} p={[.130*Math.cos(a),.130*Math.sin(a),.043]} r={.0095} d={.010} c="#d79716"/>;
      })}
      <Disk p={[0,-.125,.047]} r={.017} d={.008} c="#6c551f"/><Disk p={[0,-.125,.053]} r={.012} d={.005} c="#f9c738"/>
    </group>
    <group userData={{partId:'ground'}}>
      <Disk p={[0,.916,-.180]} r={.083} d={.015} c={rubber}/>
      <Disk p={[0,.916,-.190]} r={.064} d={.008} c={testYellow}/><Disk p={[0,.916,-.200]} r={.042} d={.014} c="#525252"/>
      <Box p={[.024,.954,-.204]} s={[.014,.054,.005]} c={rubber} angle={-.48}/>
    </group>
    <group userData={{partId:'probes'}}>
      {[-1,1].map(side=>{
        const x=side*.149,col=side<0?redLead:rubber;
        return <group key={side}>
          <Box p={[x,.956,-.151]} s={[.079,.61,.063]} r={.025} c="#a67625"/>
          <Box p={[x,.525,-.155]} s={[.090,.162,.070]} r={.014} c={testYellow}/>
          <group userData={{probeSide:side<0?'red':'black',partId:'probes'}} visible={side<0?!redOut:!blackOut}>
            <Shaft x={x} y={.801} z={-.198} h={.552} r1={.029} r2={.030} c={col}/>
            <Shaft x={x} y={1.086} z={-.198} h={.023} r1={.043} r2={.041} c={col}/>
            <Shaft x={x} y={1.169} z={-.198} h={.152} r1={.011} r2={.023} c={col}/>
            <Shaft x={x} y={1.280} z={-.198} h={.070} r1={.003} r2={.009} c={steel}/>
            <Shaft x={x} y={.375} z={-.198} h={.304} r1={.034} r2={.025} c={rubber}/>
            {[0,1,2].map(i=><Shaft key={i} x={x} y={.471+i*.024} z={-.198} h={.009} r1={.036} r2={.036} c={trim}/>)}
            <Cord points={[[side*.062,.017,0],[side*.07,.010,-.12],[side*.119,.040,-.187],[x,.115,-.198],[x,.224,-.198]]} r={.015} c={rubber}/>
          </group>
        </group>;
      })}
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
