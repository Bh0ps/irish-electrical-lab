'use client';
import React, { Suspense, useLayoutEffect, useMemo, useRef, useEffect } from 'react';
import { Environment, useGLTF } from '@react-three/drei';
import { SiteFinishes } from './SiteFinishes';
import { publicAssetUrl } from '../../web/asset-url';
import { CUPBOARD_HINGE, CUPBOARD_SWING } from '../../lib/site-fixtures';
import * as THREE from 'three';
import { createSurfaceTextures, type SurfacePattern } from '../../lib/scene-materials';
import { BACK, FRONT, ROOM_CENTRES, ROOM_WALLS, DOOR_Z, DOOR_WIDTH, type JobSite } from '../../lib/job-site';
import type { Vec3 } from '../../lib/types';

type Shape='box'|'cylinder'|'ball';
interface Piece {shape:Shape; surface:string; p:Vec3; s:Vec3; rotation:Vec3}
const spec:Record<string,[string,SurfacePattern?,number?]>={
  oak:['#ae9470','timber'],walnut:['#8e7055','timber'],white:['#eeeae2'],cream:['#d9d3bd'],sage:['#73877b'],tile:['#dce1dc','tiles'],
  metal:['#a6aeb0','brushed',.65],iron:['#454f50','brushed',.45],black:['#303736'],glass:['#bed6dc'],blue:['#4e8196'],yellow:['#deae46'],
  concrete:['#a3a7a4','concrete'],brick:['#ac8270','brick'],paving:['#a3a198','paving'],green:['#608365'],linen:['#b1b9ad'],
  brass:['#b1965e','brushed',.52],trim:['#91a39b'],paint:['#c2cbbd'],paper:['#eee7d7'],foliage:['#536955'],steel:['#737f82','brushed',.6],copper:['#b77e57','brushed',.6],rubber:['#4a5556','rubber'],red:['#af584c'],
};
function installation(site:JobSite){
  const parts:Piece[]=[];
  const add=(p:Vec3,s:Vec3,surface:string,shape:Shape='box',rotation:Vec3=[0,0,0])=>parts.push({shape,surface,p,s,rotation});
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:string)=>add([x,y,z],[w,h,d],m);
  const pipe=(x:number,y:number,z:number,r:number,h:number,m:string,rot=0)=>add([x,y,z],[r,h,r],m,'cylinder',[0,0,rot]);
  const beam=(x:number,y:number,z:number,w:number,h:number,d:number,m:string)=>box(x,y,z,w,h,d,m);
  const furniture=(x:number,z:number,width:number,colour='sage')=>{
    box(x,.45,z,width,.86,.57,colour);box(x,.91,z,width+.035,.055,.63,'cream');
    box(x,.065,z+.01,width-.08,.11,.50,'black');
    const n=Math.max(1,Math.round(width/.49));
    for(let i=0;i<n;i++){const px=x+(i-(n-1)/2)*width/n;box(px,.48,z+.288,width/n-.015,.73,.022,colour);box(px+.1,.76,z+.315,.11,.014,.026,'metal');}
  };
  const frame=(x:number,y:number,z:number,w:number,h:number,mat='white')=>{
    box(x,y-h/2,z,w+.075,.046,.075,mat);box(x,y+h/2,z,w+.075,.046,.075,mat);
    for(const s of [-1,1])box(x+s*w/2,y,z,.046,h,.075,mat);
  };
  const sink=(x:number,z:number)=>{
    box(x,.95,z,.52,.026,.37,'metal');box(x,.965,z,.43,.02,.29,'steel');
    pipe(x+.16,1.05,z-.14,.017,.23,'metal');box(x+.16,1.16,z-.08,.034,.03,.15,'metal');
  };
  const shelf=(x:number,y:number,z:number,w:number)=>{
    box(x,y,z,w,.042,.32,'oak');for(const k of [-1,1]){box(x+k*w*.34,y-.11,z-.11,.027,.22,.045,'iron');box(x+k*w*.34,y-.031,z,.027,.03,.28,'iron');}
  };
  const cylinderTank=(x:number,z:number)=>{
    pipe(x,.84,z,.34,1.4,'metal');add([x,1.54,z],[.335,.13,.335],'metal','ball');
    for(const k of [-1,1]){pipe(x+k*.23,.14,z,.03,.28,'iron');pipe(x+k*.18,1.91,z,.024,.52,'copper');}
    for(const y of [.42,1.29])pipe(x,y,z,.349,.033,'iron');
    box(x,1.13,z+.342,.16,.12,.012,'white');
  };
  const rack=(x:number,z:number)=>{
    for(const a of [-.65,.65])for(const b of [-.24,.24])box(x+a,1.0,z+b,.038,2.0,.038,'steel');
    for(const y of [.24,.82,1.4,1.96])box(x,y,z,1.36,.037,.54,'metal');
    for(let i=0;i<5;i++){const xx=x+(i%3-1)*.40,y=i<3?.40:1.01;box(xx,y,z,.34,.28,.37,i%2?'cream':'oak');box(xx,y,z+.191,.13,.057,.005,'white');}
  };
  const table=(x:number,z:number,w:number,m='walnut')=>{
    box(x,.89,z,w,.06,.74,m);for(const a of [-1,1])for(const b of [-1,1])box(x+a*(w/2-.09),.44,z+b*.28,.06,.88,.06,'iron');
    box(x,.28,z,w-.15,.03,.47,'steel');
  };
  box(0,-.15,-.1,13.45,.28,5.95,'concrete');
  box(0,-.16,4.65,19,.22,3.8,'paving');
  const industrial=site.kind==='works'||site.kind==='workshop',home=site.kind==='home';
  ROOM_CENTRES.forEach((x,i)=>{
    box(x,1.43,BACK-.08,4.4,2.86,.14,'wall'+i);
    const wood=home&&i!==2&&site.building.rooms[i]!=='Bathroom';
    if(wood){for(let k=0;k<19;k++)box(x-2.09+k*.232,-.018,0,.229,.034,5.58,k%4===0?'walnut':'oak');}
    else box(x,-.015,0,4.39,.035,5.59,(home||site.kind==='shop')?'tile':'concrete');
    box(x,2.91,0,4.39,.06,5.59,home?'cream':'concrete');
    box(x,.07,BACK+.013,4.39,.13,.035,home?'white':'iron');
    for(const edge of [BACK+.2,FRONT-.42]){box(x,2.86,edge,4.38,.10,.11,home?'white':'steel');}
    // Entrance windows and their two solid wall sections keep the glazing at a real opening.
    if(i!==1){
      box(x,.42,FRONT,4.38,.84,.13,'wall'+i);box(x,2.58,FRONT,4.38,.56,.13,'wall'+i);
      for(const s of [-1,1])box(x+s*1.6,1.58,FRONT,1.18,1.53,.13,'wall'+i);
      box(x,1.58,FRONT,2.02,1.42,.015,'glass');frame(x,1.58,FRONT-.07,2.03,1.43);box(x,1.58,FRONT-.085,.035,1.43,.07,'white');
      box(x,.84,FRONT-.04,2.17,.05,.25,'oak');
    } else {
      for(const s of [-1,1])box(s*1.47,1.39,FRONT,1.46,2.78,.15,home?'brick':'metal');
      box(0,2.54,FRONT,1.54,.54,.16,home?'brick':'metal');
      for(const s of [-1,1])box(.74*s,1.12,FRONT-.015,.055,2.24,.17,'oak');
      box(0,2.24,FRONT,1.54,.065,.17,'oak');
      box(-.75,1.09,FRONT-.70,.060,2.18,1.4,home?'sage':'steel');box(-.70,1.04,FRONT-1.29,.069,.035,.13,'metal');
      box(0,.015,FRONT+.36,1.34,.025,.56,'rubber');
    }
  });
  for(const x of [ROOM_WALLS[0],ROOM_WALLS[3]])box(x,1.43,0,.12,2.86,5.7,'wall2');
  for(const x of ROOM_WALLS.slice(1,3)){
    const start=DOOR_Z-DOOR_WIDTH/2,end=DOOR_Z+DOOR_WIDTH/2;
    box(x,1.42,(BACK+start)/2,.12,2.84,start-BACK,'wall1');box(x,1.42,(end+FRONT)/2,.12,2.84,FRONT-end,'wall1');
    box(x,2.54,DOOR_Z,.12,.59,DOOR_WIDTH,'wall1');
    for(const z of [start,end])box(x,1.12,z,.18,2.24,.055,'white');box(x,2.25,DOOR_Z,.18,.065,DOOR_WIDTH+.08,'white');
  }
  if(home){
    const entrance=site.building.rooms[0]==='Back entrance';
    furniture(entrance?-3.57:-4.4,-2.49,entrance?1.53:3.65);if(!entrance)sink(-5.62,-2.46);
    shelf(entrance?-3.26:-5.8,1.43,-2.63,.87);
    if(entrance){frame(-5.58,1.03,-2.70,.86,2.06,'white');box(-5.58,1.03,-2.72,.84,2.04,.07,'sage');frame(-5.58,1.46,-2.66,.61,.66);box(-5.58,1.46,-2.672,.59,.64,.015,'glass');box(-5.25,1.02,-2.638,.10,.019,.021,'metal');}
    if(/abinet|upboard|orktop|unable-white/.test(site.name)){
      for(const x of [-4.65,-3.83]){
        const workingDoor=site.name==='Cupboard lighting'&&x===-4.65;
        box(x,1.92,-2.748,.79,.78,.034,'cream');
        for(const side of [-1,1])box(x+side*.382,1.92,-2.56,.026,.78,.39,'cream');
        for(const h of [1.54,1.89,2.296])box(x,h,-2.56,.75,.026,.39,'cream');
        if(workingDoor){for(const v of [-4.87,-4.63]){pipe(v,1.65,-2.55,.055,.17,'white');pipe(v,1.738,-2.55,.057,.013,'oak');}}
        else{box(x,1.92,-2.35,.76,.75,.032,'sage');box(x+.27,1.69,-2.323,.02,.13,.035,'metal');}
      }
    }
    for(const x of [-6.05,-5.8,-5.55]){pipe(x,1.57,-2.58,.06,.22,'cream');pipe(x,1.69,-2.58,.062,.022,'oak');}
    furniture(5.6,-2.49,1.39,'white');rack(3.13,-.65);
    if(site.building.rooms[1]==='Bathroom'){furniture(1.32,-2.47,1.30,'white');sink(1.32,-2.46);frame(1.34,1.63,-2.69,.89,.70,'metal');box(1.34,1.63,-2.735,.87,.68,.02,'glass');}
    else if(site.building.rooms[1]==='Stair hall'){
      for(let k=0;k<8;k++){box(-1.74,(k+1)*.085,1.19-k*.29,.75,(k+1)*.17,.3,'oak');pipe(-1.37,(k+1)*.17+.4,1.19-k*.29,.018,.8,'white');}
      add([-1.37,1.56,.18],[.055,.07,2.5],'oak','box',[.52,0,0]);
    }else{
      // Shallow hall cupboard, moulded panels and latch. Its leaf is on the back wall.
      box(-.95,1.05,-2.715,.95,2.10,.061,'white');
      box(-.95,1.02,-2.677,.82,2.01,.040,'trim');
      for(const x of [-1.158,-.742])for(const [y,h] of [[.51,.78],[1.46,.84]]){
        box(x,y,-2.65,.318,h,.023,'paint');
        frame(x,y,-2.632,.325,h,'trim');
      }
      box(-.62,.99,-2.61,.043,.137,.017,'brass');box(-.67,1.01,-2.588,.12,.02,.028,'brass');
      // Tongue-and-groove panelling and a capped dado, with a gap at the cupboard.
      for(const [xx,w] of [[-1.80,.80],[.866,2.65]]){
        box(xx,.49,-2.72,w,.98,.05,'trim');
        for(let i=1;i<w/.145;i++)box(xx-w/2+i*.145,.48,-2.689,.008,.94,.009,'paint');
        box(xx,.985,-2.68,w,.05,.072,'paint');box(xx,1.014,-2.673,w,.016,.09,'cream');
      }
      // The runner, individual drawer fronts and recessed edges give familiar scale.
      box(.03,.003,-1.06,.84,.013,2.48,'linen');
      for(const x of [-.34,.40])box(x,.012,-1.06,.017,.003,2.38,'green');
      table(1.00,-2.48,.96,'walnut');box(1.0,.78,-2.48,.94,.18,.65,'walnut');
      for(const x of [.77,1.23]){box(x,.78,-2.145,.43,.15,.025,'oak');pipe(x,.78,-2.114,.018,.026,'brass');}
      frame(-1.47,1.60,-2.72,.48,.64,'oak');box(-1.47,1.60,-2.75,.47,.63,.02,'linen');
    }
    for(const x of [-1.72,1.72]){box(x,.20,3.39,.38,.39,.38,'walnut');add([x,.55,3.39],[.25,.34,.23],'green','ball');}
  }else if(site.kind==='plant'){
    cylinderTank(-1.33,-2.15);cylinderTank(1.33,-2.15);rack(5.83,-.70);
    for(let i=0;i<4;i++){pipe(-4.15+i*.22,.64,-2.55,.027,1.18,'copper');pipe(-4.15+i*.22,1.16,-2.55,.047,.085,'red');}
    for(const y of [2.28,2.44])pipe(0,y,-2.63,.044,12.8,'copper',Math.PI/2);
  }else if(site.kind==='shop'){
    rack(-5.84,-2.43);furniture(-3.1,-2.49,1.35,'sage');rack(5.68,-.70);
    for(const x of [-1.63,1.58])box(x,1.04,-2.62,.44,2.08,.23,'metal');
    box(4.4,.15,3.85,2.0,.3,.8,'concrete');
  }else{
    table(-5.40,-2.30,1.9);rack(5.68,-.70);table(.80,-2.30,1.9,'metal');
    for(const x of [-6.4,-2.38,2.38,6.4]){box(x,1.52,-2.66,.11,3.03,.13,'steel');box(x,2.98,0,.10,.12,5.61,'steel');}
    if(industrial){
      for(let n=0;n<11;n++)box(4.65, .14+n*.19,FRONT+.09,2.75,.177,.027,'steel');
      for(const x of [-4.8,-3.7]){pipe(x,.41,3.67,.052,.82,'yellow');pipe(x,.59,3.67,.054,.13,'black');}
    }
  }
  return parts;
}
const skip:THREE.Mesh['raycast']=()=>{};
function Batch({items,g,m}:{items:Piece[];g:THREE.BufferGeometry;m:THREE.Material}){
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const obj=new THREE.Object3D(),mesh=ref.current;if(!mesh)return;items.forEach((v,i)=>{obj.position.set(...v.p);obj.scale.set(...v.s);obj.rotation.set(...v.rotation);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();},[items]);
  return <instancedMesh ref={ref} args={[g,m,items.length]} onClick={e=>e.stopPropagation()} receiveShadow castShadow dispose={null}/>;
}
// A missing decorative download must never take the operating equipment out of service.
class SceneryBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?null:this.props.children;}
}
function HallPlant(){
  const asset=useGLTF(publicAssetUrl('/site-assets/potted-plant.glb'),false,false);
  const plant=useMemo(()=>{const copy=asset.scene.clone(true);copy.traverse(node=>{
    if(node instanceof THREE.Mesh){node.castShadow=true;node.receiveShadow=true;node.raycast=skip;}
  });return copy;},[asset.scene]);
  return <primitive object={plant} dispose={null} position={[1.17,.92,-2.46]}/>;
}
export default function InstallationRoom({site,economy,cupboardOpen,operateCupboard}:{site:JobSite;economy:boolean;cupboardOpen:boolean;operateCupboard:()=>void}){
  const {kind,building,name}=site;
  const batches=useMemo(()=>{const map=new Map<string,Piece[]>();for(const piece of installation(site)){const k=piece.shape+'/'+piece.surface;if(!map.has(k))map.set(k,[]);map.get(k)!.push(piece);}return map;},[kind,name,building.rooms.join('/')]);
  const res=useMemo(()=>{
    const maps=new Map<SurfacePattern,ReturnType<typeof createSurfaceTextures>>();
    const materials:Record<string,THREE.Material>={};
    for(const [id,[color,pattern,metalness=0]] of Object.entries(spec)){
      if(pattern&&!maps.has(pattern))maps.set(pattern,createSurfaceTextures(pattern,economy?128:256));const tex=pattern&&maps.get(pattern);
      materials[id]=new THREE.MeshStandardMaterial({color,metalness,roughness:metalness?.42:.84,map:tex?tex.color:null,normalMap:tex?tex.normal:null,normalScale:new THREE.Vector2(.13,.13)});
    }
    const brick=maps.get('brick');if(brick){brick.color.repeat.set(2,4);brick.normal.repeat.set(2,4);}
    const plaster=createSurfaceTextures('plaster',economy?128:256);maps.set('plaster',plaster);
    plaster.color.repeat.set(4,3);plaster.normal.repeat.set(4,3);
    building.walls.forEach((color,i)=>{materials['wall'+i]=new THREE.MeshStandardMaterial({color,roughness:.94,map:plaster.color,normalMap:plaster.normal,normalScale:new THREE.Vector2(.10,.10)});});
    return {materials,maps,geo:{box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,20),ball:new THREE.SphereGeometry(1,16,10)}};
  },[kind,economy]);
  useEffect(()=>()=>{for(const m of Object.values(res.materials))m.dispose();for(const g of Object.values(res.geo))g.dispose();for(const t of res.maps.values())t.dispose();},[res]);
  return <group name={'Installation · '+building.name}>
    <SceneryBoundary><Suspense fallback={null}><Environment files={publicAssetUrl('/site-assets/daylight.hdr')} environmentIntensity={.65}/></Suspense></SceneryBoundary>
    <SceneryBoundary><Suspense fallback={null}><SiteFinishes materials={res.materials}/></Suspense></SceneryBoundary>
    {site.name==='Cupboard lighting'&&<group position={CUPBOARD_HINGE} rotation={[0,cupboardOpen?CUPBOARD_SWING:0,0]} onClick={e=>{e.stopPropagation();operateCupboard();}}>
      <mesh position={[.38,0,0]} material={res.materials.sage} geometry={res.geo.box} scale={[.76,.75,.032]} castShadow receiveShadow/>
      <mesh position={[.66,-.16,.036]} material={res.materials.metal} geometry={res.geo.box} scale={[.024,.12,.04]}/>
    </group>}
    {kind==='home'&&!['Bathroom','Stair hall'].includes(building.rooms[1])&&<SceneryBoundary><Suspense fallback={null}><HallPlant/></Suspense></SceneryBoundary>}
    {[...batches].map(([key,items])=><Batch key={key} items={items} g={res.geo[items[0].shape]} m={res.materials[items[0].surface]}/>)}</group>;
}
