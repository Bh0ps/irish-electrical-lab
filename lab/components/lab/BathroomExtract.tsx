'use client';
import {useMemo} from 'react';
import * as THREE from 'three';
import {BATH_EXTRACT as bath,BATH_SHOWER} from '../../lib/bathroom-extract';
import type {Vec3} from '../../lib/types';

function rectangle(path:THREE.Path,left:number,bottom:number,right:number,top:number){
  path.moveTo(left,bottom);path.lineTo(left,top);path.lineTo(right,top);path.lineTo(right,bottom);path.closePath();
}

function Block({p,size,colour,tilt=0}:{p:Vec3;size:Vec3;colour:string;tilt?:number}){
  return <mesh position={p} rotation={[tilt,0,0]} castShadow receiveShadow>
    <boxGeometry args={size}/><meshStandardMaterial color={colour} roughness={.58}/>
  </mesh>;
}

const plastic='#eeeae1',edge='#b5b8ac';

/** The liner runs from the fan's spigot to the fixed blades on the outside.
 * Both ends are open. Neither the inside nor outside skin spans the bore. */
export function BathroomFabric({vent,plaster,masonry}:{vent:boolean;plaster:THREE.Material;masonry:THREE.Material}){
  const b=bath,w=b.window;
  const wall=useMemo(()=>{
    const shape=new THREE.Shape();rectangle(shape,-2.2,0,2.2,2.86);
    const window=new THREE.Path();rectangle(window,w.x-w.width/2,w.y-w.height/2,w.x+w.width/2,w.y+w.height/2);shape.holes.push(window);
    if(vent){const bore=new THREE.Path();bore.absarc(b.fanX,b.fanY-b.outletDrop/2,.057,0,2*Math.PI,true);shape.holes.push(bore);}
    return shape;
  },[vent,w,b]);
  const ceiling=useMemo(()=>{
    const shape=new THREE.Shape();rectangle(shape,-2.195,-2.795,2.195,2.795);
    const cut=new THREE.Path();cut.absarc(b.lightX,b.lightZ,.037,0,2*Math.PI,true);shape.holes.push(cut);return shape;
  },[b]);
  const liner=useMemo(()=>{
    const s=new THREE.Shape();s.absarc(0,0,b.sleeveRadius+.001,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,b.sleeveRadius,0,Math.PI*2,true);s.holes.push(hole);return s;
  },[b]);
  const length=b.wallOutside-b.wallInside,tilt=Math.atan2(b.outletDrop,length);
  return <group>
    <mesh position={[0,0,b.wallInside]} material={plaster} receiveShadow castShadow>
      <extrudeGeometry args={[wall,{depth:length,curveSegments:32,bevelEnabled:false}]}/>
    </mesh>
    <mesh position={[0,0,b.wallOutside+.0002]} material={masonry} receiveShadow>
      <shapeGeometry args={[wall,32]}/>
    </mesh>
    <group position={[w.x,w.y,b.wallInside+.07]}>
      <Block p={[0,0,.07]} size={[w.width,w.height,.018]} colour="#a9c7ca"/>
      {[-1,1].map(s=><group key={s}>
        <Block p={[s*(w.width/2-.023),0,0]} size={[.046,w.height,.13]} colour={plastic}/>
        <Block p={[0,s*(w.height/2-.023),0]} size={[w.width,.046,.13]} colour={plastic}/>
        <Block p={[s*(w.width/2-.052),0,-.023]} size={[.014,w.height-.085,.055]} colour={edge}/>
        <Block p={[0,s*(w.height/2-.052),-.023]} size={[w.width-.085,.014,.055]} colour={edge}/>
      </group>)}
      <Block p={[0,-w.height/2,-.072]} size={[w.width+.09,.034,.17]} colour={plastic}/>
      <Block p={[0,-w.height/2+.044,-.075]} size={[.076,.012,.026]} colour="#9fa7a3"/>
    </group>
    {vent&&<>
      <mesh position={[0,2.94,0]} rotation={[Math.PI/2,0,0]} receiveShadow castShadow>
        <extrudeGeometry args={[ceiling,{depth:.06,curveSegments:32,bevelEnabled:false}]}/><meshStandardMaterial color="#dad7c7"/>
      </mesh>
      <mesh position={[b.fanX,b.fanY,b.wallInside]} rotation={[tilt,0,0]}>
        <extrudeGeometry args={[liner,{depth:Math.hypot(length,b.outletDrop),curveSegments:36,bevelEnabled:false}]}/>
        <meshStandardMaterial color="#666e6e" roughness={.57}/>
      </mesh>
      <group position={[b.fanX,b.fanY-b.outletDrop,b.wallOutside]}>
        {[-1,1].map(s=><group key={s}>
          <Block p={[s*.066,0,.005]} size={[.008,b.grilleWidth,.012]} colour={plastic}/>
          <Block p={[0,s*.066,.005]} size={[b.grilleWidth-.016,.008,.012]} colour={plastic}/>
          <Block p={[s*.059,0,.004]} size={[.006,.121,.008]} colour={edge}/>
          <Block p={[0,s*.059,.004]} size={[.118,.006,.008]} colour={edge}/>
        </group>)}
        {Array.from({length:10},(_,i)=><Block key={i} p={[0,-.051+i*.0113,.008]} size={[.119,.0018,.017]} colour={plastic} tilt={.41}/>)}
        <Block p={[0,0,.009]} size={[.0021,.116,.014]} colour={plastic}/>
        {[-1,1].flatMap(x=>[-1,1].map(y=><mesh key={x+','+y} position={[x*.057,y*.056,.013]} >
          <circleGeometry args={[.0028,12]}/><meshStandardMaterial color="#929691"/>
        </mesh>))}
      </group>
    </>}
  </group>;
}

/** The timer's adjustment face remains visible through the enclosure opening.
 * The parked earth is in its own covered box with an independent cable entry. */
export function BathServiceBox({part,open,choose}:{part:'timer'|'cpc';open:boolean;choose:()=>void}){
  const timer=part==='timer',[w,h,d]=timer?bath.timerSize:bath.cpcSize;
  return <group position={[0,timer?.036:.005,-(timer?bath.timerOffset:bath.cpcOffset)]} userData={{partId:'cover'}} onClick={e=>{e.stopPropagation();choose();}}>
    <Block p={[0,0,.002]} size={[w,h,.004]} colour={edge}/>
    {[-1,1].map(s=><group key={s}>
      <Block p={[s*(w/2-.0015),0,d/2]} size={[.003,h,d]} colour={plastic}/>
      <Block p={[0,s*(h/2-.0015),d/2]} size={[w-.005,.003,d]} colour={plastic}/>
    </group>)}
    {!open&&<>
      {timer?<>
        {[-1,1].map(s=><group key={s}>
          <Block p={[0,s*(h/4+.0115),d-.003]} size={[w,h/2-.023,.006]} colour={plastic}/>
          <Block p={[s*(w/4+.009),0,d-.003]} size={[(w-.036)/2,.046,.006]} colour={plastic}/>
        </group>)}
      </>:<Block p={[0,0,d]} size={[w+.002,h+.002,.005]} colour={plastic}/>}
      {[-1,1].map(s=><group key={s} position={timer?[0,s*.061,d]:[s*.029,s*.029,d+.003]}>
        <mesh><circleGeometry args={[.003,16]}/><meshStandardMaterial color="#adb1ab" metalness={.5} roughness={.35}/></mesh>
        <Block p={[0,0,.0002]} size={[.0037,.0006,.0004]} colour="#647069"/>
      </group>)}
    </>}
  </group>;
}

type ScenePiece=(position:Vec3,size:Vec3,surface:string,shape?:'box'|'cylinder'|'ball'|'cushion',rotation?:Vec3)=>void;
export function bathFurniture(add:ScenePiece){
  const {x,z,w,d}=BATH_SHOWER;
  add([x,.045,z],[w,.09,d],'white','cushion');
  for(const s of [-1,1]){
    add([x+s*(w/2-.018),.095,z],[.035,.02,d-.036],'white');
    add([x,.095,z+s*(d/2-.018)],[w,.02,.035],'white');
  }
  add([x-.27,.093,z-.18],[.037,.003,.037],'steel','cylinder');
  for(let row=0;row<7;row++)for(let col=0;col<4;col++)
    add([x+(col-1.5)*.30,.22+row*.30,-2.796],[.297,.297,.024],'white');
  add([x+.26,1.61,-2.736],[.013,.88,.013],'metal','cylinder');
  add([x+.26,1.21,-2.75],[.17,.05,.055],'metal','cushion');
  add([x+.26,1.94,-2.68],[.019,.12,.019],'metal','cylinder',[-.67,0,0]);
  add([x+.26,1.975,-2.63],[.049,.020,.049],'metal','cylinder',[-.70,0,0]);
  add([x-w/2+.021,1.05,z],[.012,1.90,d],'pane');
  add([x-w/2+.021,1.05,z+d/2],[.016,1.90,.016],'metal');
  for(const s of [-1,1])add([-.59+s*.26,1.02,bath.wallInside-.058],[.024,.81,.037],'white','cushion');
  for(let i=0;i<9;i++)add([-.59,.69+i*.079,bath.wallInside-.058],[.51,.022,.029],'white','cushion');
  add([-.69,.87,bath.wallInside-.09],[.25,.43,.019],'linen','cushion');
  for(let row=0;row<5;row++)for(let col=0;col<11;col++)
    add([-2+col*.4,.125+row*.25,bath.wallInside-.004],[.397,.247,.008],'white');
  add([0,1.254,bath.wallInside-.007],[4.38,.014,.014],'trim');
}
