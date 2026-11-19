'use client';
import React, { Suspense, useLayoutEffect, useMemo, useRef, useEffect } from 'react';
import { Environment, useGLTF } from '@react-three/drei';
import { SiteFinishes } from './SiteFinishes';
import { publicAssetUrl } from '../../web/asset-url';
import { CUPBOARD_HINGE, CUPBOARD_SWING } from '../../lib/site-fixtures';
import {KITCHEN_LIGHTS as kitchen} from '../../lib/kitchen-lighting';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createSurfaceTextures, type SurfacePattern } from '../../lib/scene-materials';
import { BACK, FRONT, ROOM_CENTRES, ROOM_WALLS, DOOR_Z, DOOR_WIDTH, type JobSite } from '../../lib/job-site';
import type { Vec3 } from '../../lib/types';
import { GARDEN_DOOR,HOME_BACK,HOME_ROOMS,HOME_WALLS,HOUSE_FURNITURE,REAR_GARDEN,alignWall,doorsOn,doorLeaf,wallSpans,type FloorWall } from '../../lib/home-floorplan';
import {SERVICE_AREAS} from '../../lib/service-floorplan';
import {serviceRoom} from './ServiceRooms';
import {stairHall} from './StairHall';
import {frontDoorway,doorbellGrounds} from './DoorstepExterior';
import {cupboardJoinery} from './CupboardJoinery';
import {BathroomFabric,bathFurniture} from './BathroomExtract';
import {BATH_KITCHEN_COUNTER,BATH_RACK} from '../../lib/bathroom-extract';

type Shape='box'|'cylinder'|'ball'|'cushion'|'gable';
interface Piece {shape:Shape; surface:string; p:Vec3; s:Vec3; rotation:Vec3}
const spec:Record<string,[string,SurfacePattern?,number?]>={
  carton:['#bd9869'],packingTape:['#c4b28d'],
  oak:['#ae9470','timber'],walnut:['#8e7055','timber'],white:['#eeeae2'],cream:['#d9d3bd'],sage:['#73877b'],tile:['#dce1dc','tiles'],
  metal:['#a6aeb0','brushed',.65],iron:['#454f50','brushed',.45],black:['#303736'],glass:['#bed6dc'],blue:['#4e8196'],yellow:['#deae46'],
  concrete:['#a3a7a4','concrete'],brick:['#ac8270','brick'],paving:['#a3a198','paving'],green:['#608365'],linen:['#b1b9ad'],
  brass:['#b1965e','brushed',.52],trim:['#91a39b'],paint:['#c2cbbd'],paper:['#eee7d7'],foliage:['#536955'],steel:['#737f82','brushed',.6],copper:['#b77e57','brushed',.6],rubber:['#4a5556','rubber'],red:['#af584c'],
  curtain:['#c2ac91'],pane:['#c1e3ea'],fabric:['#a57c64'],lawn:['#81916c'],
  doorBlue:['#345c66'],doorRecess:['#2e515a'],slate:['#515c65'],gutter:['#465256'],opal:['#d3d9d1'],
  stoneFlag:['#aba797'],stoneFlagLight:['#b5b2a3'],boundary:['#8a8771'],
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
  if(!site.doorsteps)box(0,-.16,4.65,19,.22,3.8,'paving');
  const industrial=site.kind==='works'||site.kind==='workshop',home=site.kind==='home';
  const bathroom=site.building.rooms[1]==='Bathroom';
  const vent=bathroom&&site.name==='Timed extract';
  const stair=home&&site.building.rooms[1]==='Stair hall';
  function wallPart(wall:FloorWall,along:number,y:number,recess:number,length:number,height:number,thickness:number,material:string){
    const b=alignWall(wall,along,recess,length,thickness);box(b.x,y,b.z,b.w,height,b.d,material);
  }
  function partition(wall:FloorWall,material:string,frontRow=false){
    const depth=frontRow?-.08:0;
    for(const [a,b] of wallSpans(wall,bathroom,stair)){
      wallPart(wall,(a+b)/2,1.43,depth,b-a,2.86,frontRow?.14:.12,material);
      for(const side of [-1,1])wallPart(wall,(a+b)/2,.068,depth+side*.067,b-a,.136,.04,'white');
    }
    for(const door of doorsOn(wall,bathroom,stair)){
      wallPart(wall,door.centre,2.49,depth,door.width,.74,.14,material);
      for(const side of [-1,1])wallPart(wall,door.centre+side*door.width/2,1.06,depth,.055,2.12,.17,'white');
      wallPart(wall,door.centre,2.12,depth,door.width+.10,.07,.17,'white');
      const leaf=doorLeaf(wall,door);box(leaf.x,1.035,leaf.z,leaf.w,2.07,leaf.d,'cream');
      const hinge=door.centre+door.hinge*(door.width/2-.022);
      for(const y of [.63,1.54])wallPart(wall,hinge-door.hinge*.026,y,door.side*door.width*.5,.014,.72,door.width*.76,'paper');
      wallPart(wall,hinge-door.hinge*.045,.98,door.side*door.width*.83,.055,.10,.035,'metal');
      wallPart(wall,hinge-door.hinge*.072,.99,door.side*door.width*.78,.022,.02,.12,'metal');
    }
  }
  ROOM_CENTRES.forEach((x,i)=>{
    if(home)partition(HOME_WALLS.find(w=>w.id===['kitchen-back','hall-back','utility-back'][i])!,'wall'+i,true);
    else box(x,1.43,BACK-.08,4.4,2.86,.14,'wall'+i);
    const wood=home&&i!==2&&site.building.rooms[i]!=='Bathroom';
    if(wood){for(let k=0;k<19;k++)box(x-2.09+k*.232,-.018,0,.229,.034,5.58,k%4===0?'walnut':'oak');}
    else box(x,-.015,0,4.39,.035,5.59,(home||site.kind==='shop')?'tile':'concrete');
    if(i!==1||(!stair&&!vent))box(x,2.91,0,4.39,.06,5.59,home?'cream':'concrete');
    if(!home)box(x,.07,BACK+.013,4.39,.13,.035,'iron');
    for(const edge of [BACK+.2,FRONT-.42]){
      if(stair&&i===1&&edge<0)continue;
      box(x,2.86,edge,4.38,.10,.11,home?'white':'steel');
    }
    // Entrance windows and their two solid wall sections keep the glazing at a real opening.
    if(bathroom&&i===1){
      // BathroomFabric has real openings for the privacy window and wall sleeve.
    }else if(bathroom&&i===2){
      const front={...HOME_WALLS.find(w=>w.id==='front')!,start:2.2,end:6.6};
      partition(front,'wall2');
      const centre=doorsOn(front,true)[0].centre;
      box(centre,.015,FRONT+.36,.96,.025,.56,'rubber');
    }else if(i!==1){
      box(x,.42,FRONT,4.38,.84,.13,'wall'+i);box(x,2.58,FRONT,4.38,.56,.13,'wall'+i);
      for(const s of [-1,1])box(x+s*1.6,1.58,FRONT,1.18,1.53,.13,'wall'+i);
      box(x,1.58,FRONT,2.02,1.42,.015,'glass');frame(x,1.58,FRONT-.07,2.03,1.43);box(x,1.58,FRONT-.085,.035,1.43,.07,'white');
      box(x,.84,FRONT-.04,2.17,.05,.25,'oak');
    } else if(stair){
      const front={...HOME_WALLS.find(w=>w.id==='front')!,start:-2.2,end:2.2};
      partition(front,'brick');
      box(doorsOn(front,false,true)[0].centre,.015,FRONT+.36,.91,.025,.56,'rubber');
    } else if(site.doorsteps){
      frontDoorway(add);
    } else {
      for(const s of [-1,1])box(s*1.47,1.39,FRONT,1.46,2.78,.15,home?'brick':'metal');
      box(0,2.54,FRONT,1.54,.54,.16,home?'brick':'metal');
      for(const s of [-1,1])box(.74*s,1.12,FRONT-.015,.055,2.24,.17,'oak');
      box(0,2.24,FRONT,1.54,.065,.17,'oak');
      box(-.75,1.09,FRONT-.70,.060,2.18,1.4,home?'sage':'steel');box(-.70,1.04,FRONT-1.29,.069,.035,.13,'metal');
      box(0,.015,FRONT+.36,1.34,.025,.56,'rubber');
    }
  });
  for(const x of [ROOM_WALLS[0],ROOM_WALLS[3]]){
    if(site.kind!=='home'&&x===SERVICE_AREAS[site.kind].side*6.6)continue;
    box(x,1.43,0,.12,2.86,5.7,'wall2');
  }
  if(site.kind!=='home')serviceRoom(site.kind,add,site.items);
  for(const x of ROOM_WALLS.slice(1,3)){
    if(home){partition(HOME_WALLS.find(w=>w.id===(x<0?'kitchen-hall':'hall-utility'))!,'wall1');continue;}
    const start=DOOR_Z-DOOR_WIDTH/2,end=DOOR_Z+DOOR_WIDTH/2;
    box(x,1.42,(BACK+start)/2,.12,2.84,start-BACK,'wall1');box(x,1.42,(end+FRONT)/2,.12,2.84,FRONT-end,'wall1');
    box(x,2.54,DOOR_Z,.12,.59,DOOR_WIDTH,'wall1');
    for(const z of [start,end])box(x,1.12,z,.18,2.24,.055,'white');box(x,2.25,DOOR_Z,.18,.065,DOOR_WIDTH+.08,'white');
  }
  if(home){
    if(site.cupboardBoard)cupboardJoinery(add);
    if(site.doorsteps)doorbellGrounds(add);
    box(0,-.15,(HOME_BACK+BACK)/2,13.45,.28,BACK-HOME_BACK,'concrete');
    for(const room of HOME_ROOMS.filter(r=>r.id>=4&&r.id!==REAR_GARDEN.id)){
      const x=(room.left+room.right)/2,z=(room.front+room.back)/2;
      box(x,-.02,z,room.right-room.left-.015,.04,room.front-room.back-.015,room.id===5?'linen':room.id===6?'tile':'oak');
      box(x,2.91,z,room.right-room.left,.07,room.front-room.back,'white');
    }
    for(const name of ['sitting','bedroom','study'])partition(HOME_WALLS.find(w=>w.id===name)!,'wall1');
    for(const edge of [-6.6,6.6]){
      box(edge,1.43,(HOME_BACK+BACK)/2,.12,2.86,BACK-HOME_BACK,'wall0');
      box(edge-Math.sign(edge)*.072,.068,(HOME_BACK+BACK)/2,.03,.136,BACK-HOME_BACK,'white');
    }
    // Three glazed openings above the furniture. Leave clear wall drops for the actual fittings.
    box(0,-.12,HOME_BACK-4.35,22,.22,8.8,'lawn');
    box(0,.74,HOME_BACK-3.95,20,1.43,.07,'trim');
    for(let i=-9;i<=9;i++){
      box(i,.80,HOME_BACK-3.88,.066,1.60,.10,'sage');
      if(i%2===0){pipe(i-1,1.25,HOME_BACK-4.81,.105,2.50,'walnut');
        add([i-1,2.20+Math.sin(i)*.22,HOME_BACK-4.82],[.92,1.24,.75],'foliage','ball');
        add([i-.57,2.05,HOME_BACK-4.65],[.65,.74,.58],'green','ball');}
    }
    const rearWall=HOME_WALLS.find(w=>w.id==='rear')!;
    for(const [left,right,cx,w,sill] of [[-6.6,-.6,-3.70,2.05,.90],[-.6,3.6,.46,1.63,1.09],[3.6,6.6,5.57,1.28,1.30]]){
      const roof=2.33,cz=HOME_BACK-.08,mid=(sill+roof)/2;
      box((left+right)/2,(roof+2.86)/2,cz,right-left,2.86-roof,.14,'wall0');
      for(const [start,end] of wallSpans(rearWall,false)){
        const a=Math.max(start,left),b=Math.min(end,right);
        if(b<=a)continue;
        box((a+b)/2,sill/2,cz,b-a,sill,.14,'wall0');
        box((a+b)/2,.070,HOME_BACK+.012,b-a,.14,.032,'white');
        box((a+b)/2,.115,HOME_BACK-.156,b-a,.23,.025,'concrete');
        for(const [lo,hi] of [[a,Math.min(b,cx-w/2)],[Math.max(a,cx+w/2),b]]){
          if(hi>lo)box((lo+hi)/2,mid,cz,hi-lo,roof-sill,.14,'wall0');
        }
      }
      box(cx,mid,cz,w,roof-sill,.016,'pane');frame(cx,mid,HOME_BACK-.008,w,roof-sill);
      frame(cx,mid,HOME_BACK-.144,w,roof-sill);
      box(cx,mid,HOME_BACK+.014,.041,roof-sill,.06,'white');
      box(cx,sill,HOME_BACK+.055,w+.16,.045,.23,'paint');
      box(cx,roof+.069,HOME_BACK+.11,w+.34,.035,.035,'metal');
      for(const sign of [-1,1])for(let k=0;k<4;k++){
        const px=cx+sign*(w/2+.10-k*.047);
        box(px,(roof+sill-.13)/2,HOME_BACK+.095+(k%2)*.025,.052,roof-sill+.15,.048,k%2?'curtain':'cream');
      }
    }
    // The glazed garden door stands open into the sitting room. Its frame, sill,
    // open leaf and walking gap use the same doorway that appears on the plan.
    const {centre,width}=GARDEN_DOOR,head=2.09,leaf=doorLeaf(rearWall,GARDEN_DOOR);
    box(centre,(head+2.33)/2,HOME_BACK-.08,width,2.33-head,.14,'wall0');
    for(const hand of [-1,1])box(centre+hand*width/2,head/2,HOME_BACK-.08,.065,head,.19,'white');
    box(centre,head,HOME_BACK-.08,width+.07,.065,.19,'white');
    box(centre,.014,HOME_BACK-.09,width,.028,.20,'metal');
    const doorPart=(y:number,z:number,h:number,d:number,thickness:number,finish:string)=>
      box(leaf.x,y,leaf.z+z,thickness,h,d,finish);
    doorPart(.34,0,.66,width,.052,'sage');
    doorPart(1.99,0,.15,width,.052,'sage');
    doorPart(1.295,0,1.25,width-.14,.016,'pane');
    for(const s of [-1,1])doorPart(1.295,s*(width/2-.045),1.25,.09,.052,'sage');
    for(const hand of [-1,1]){
      const x=leaf.x+hand*.031,z=leaf.z+.33;
      box(x,1.02,z,.012,.159,.034,'metal');
      box(x+hand*.018,1.06,z,.043,.018,.019,'metal');
      box(x+hand*.040,1.06,z-.045,.021,.018,.11,'metal');
    }
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)
      box(centre+(i-1)*.59,.002,HOME_BACK-.46-j*.59,.58,.021,.58,'paving');
    box(centre,.021,HOME_BACK-.52,.71,.016,.40,'rubber');
    box(0,2.89,HOME_BACK-.19,13.30,.11,.42,'white');
    pipe(0,2.92,HOME_BACK-.405,.055,13.31,'iron',Math.PI/2);
    pipe(-5.92,1.37,HOME_BACK-.223,.041,2.62,'iron');
    for(const y of [.57,1.89]){pipe(-5.92,y,HOME_BACK-.223,.046,.031,'iron');box(-5.92,y,HOME_BACK-.171,.05,.04,.063,'steel');}
    box(-5.92,2.71,HOME_BACK-.31,.08,.13,.25,'iron');
    // Upholstered seats face the TV. Furniture feet, cushions, duvet, and a desk lamp
    // reuse the same instanced geometry and small material set throughout the house.
    const f=HOUSE_FURNITURE,s=f.sofa,b=f.bed,t=f.television,d=f.desk,ward=f.wardrobe;
    const pad=(x:number,y:number,z:number,w:number,h:number,depth:number,m:string,tilt=0)=>add([x,y,z],[w,h,depth],m,'cushion',[0,0,tilt]);
    for(const x of [s.x-.29,s.x+.29])for(const z of [s.z-.88,s.z+.88])box(x,.09,z,.065,.18,.065,'walnut');
    pad(s.x,.27,s.z,s.w,.29,s.d,'sage');pad(s.x-.36,.61,s.z,.20,.65,s.d,'sage',.08);
    for(const sign of [-1,1]){
      pad(s.x+.04,.45,s.z+sign*.48,.70,.16,.91,'trim');
      pad(s.x+.02,.54,s.z+sign*1.03,.89,.49,.15,'sage');
      pad(s.x-.20,.67,s.z+sign*.56,.19,.38,.40,sign===1?'cream':'fabric',-.12);
    }
    // Two framed botanical prints above the sofa. Relief is slight so they read as paper.
    for(const z of [s.z-.48,s.z+.48]){
      box(-6.514,1.52,z,.048,.78,.58,'walnut');box(-6.485,1.52,z,.011,.72,.52,'paper');
      add([-6.473,1.51,z],[.008,.015,.46],'sage','box',[-1.28,0,0]);
      for(let n=0;n<4;n++)for(const hand of [-1,1]){
        const y=1.38+n*.085,offset=.04+(n%2)*.014;
        add([-6.469,y,z+hand*offset+(y-1.51)*.29],[.005,.020,.105],'foliage','box',[hand*-.55,0,0]);
      }
    }
    const coffee=f.coffee;
    box(coffee.x,.41,coffee.z,coffee.w,.07,coffee.d,'walnut');
    for(const i of [-1,1])for(const j of [-1,1])box(coffee.x+i*.24,.20,coffee.z+j*.44,.049,.40,.049,'iron');
    box(coffee.x,.457,coffee.z-.17,.24,.029,.31,'sage');box(coffee.x,.48,coffee.z-.17,.21,.021,.27,'paper');
    pipe(coffee.x+.12,.49,coffee.z+.25,.047,.084,'cream');
    box(t.x,.32,t.z,t.w,.50,t.d,'walnut');
    for(const sign of [-1,1]){box(t.x-.224,.32,t.z+sign*.39,.022,.37,.73,'oak');box(t.x-.24,.40,t.z+sign*.39,.028,.026,.12,'metal');}
    box(t.x,.608,t.z,.26,.04,.44,'iron');box(t.x,.69,t.z,.057,.17,.063,'black');
    box(t.x,.997,t.z,.056,.61,1.11,'black');box(t.x-.031,1.00,t.z,.008,.57,1.065,'iron');
    box(-4.68,.008,-5.15,1.68,.014,2.41,'linen');
    for(const z of [-6.26,-4.04])box(-4.68,.018,z,1.58,.006,.035,'green');
    box(b.x,.23,b.z,b.w,.34,b.d,'walnut');pad(b.x,.45,b.z,b.w+.02,.23,b.d+.02,'paper');
    box(b.x,.55,b.z-.99,b.w+.06,.94,.075,'oak');pad(b.x,.58,b.z+.25,1.49,.18,1.56,'linen');
    pad(b.x,.67,b.z+.70,1.48,.085,.48,'blue');for(const sign of [-1,1])pad(b.x+sign*.345,.63,b.z-.70,.62,.13,.38,'cream');
    box(ward.x,1.01,ward.z,ward.w,2.02,ward.d,'oak');
    for(const sign of [-1,1]){box(ward.x+sign*.355,1.02,ward.z-.271,.685,1.89,.031,'cream');box(ward.x+sign*.075,1.06,ward.z-.301,.025,.14,.027,'brass');}
    box(d.x,.89,d.z,d.w,.06,d.d,'oak');
    for(const i of [-1,1])for(const j of [-1,1])box(d.x+i*(d.w/2-.08),.44,d.z+j*.23,.045,.88,.045,'iron');
    box(d.x,.95,d.z,.38,.028,.27,'iron');
    add([d.x,1.065,d.z-.125],[.38,.24,.023],'black','box',[-.12,0,0]);
    pipe(d.x+.49,.945,d.z,.085,.025,'brass');pipe(d.x+.49,1.12,d.z,.012,.35,'brass');
    add([d.x+.49,1.30,d.z],[.091,.12,.091],'green','cylinder',[0,0,-.20]);
    const chair=f.deskChair;pad(chair.x,.46,chair.z,.48,.09,.47,'trim');
    for(const i of [-1,1])for(const j of [-1,1])box(chair.x+i*.19,.23,chair.z+j*.19,.034,.46,.034,'oak');
    box(chair.x,.68,chair.z+.20,.44,.41,.052,'oak');
    const books=f.bookcase;box(books.x+.18,.85,books.z,.025,1.70,books.d,'walnut');
    for(const sign of [-1,1])box(books.x,.85,books.z+sign*.55,books.w,1.70,.033,'oak');
    for(let row=0;row<4;row++){const y=.13+row*.44;box(books.x,y,books.z,books.w,.027,books.d,'oak');
      for(let k=0;k<5;k++)box(books.x-.024,y+.13,books.z-.41+k*.11,.22,.23+(k%3)*.03,.075,['sage','blue','cream','walnut','paint'][(row+k)%5]);}
    const locker=f.locker;box(locker.x,.28,locker.z,locker.w,.50,locker.d,'oak');
    box(locker.x,.36,locker.z+.20,.34,.21,.025,'cream');pipe(locker.x,.37,locker.z+.222,.021,.026,'brass');
    box(locker.x,.555,locker.z,.24,.033,.19,'blue');box(locker.x,.580,locker.z,.22,.018,.17,'paper');
    const shoe=f.shoeBench;box(shoe.x,.46,shoe.z,shoe.w,.054,shoe.d,'oak');
    for(const hand of [-1,1])box(shoe.x+hand*.45,.25,shoe.z,.044,.46,.31,'sage');
    box(shoe.x,.15,shoe.z,.93,.033,.29,'sage');box(shoe.x,1.64,-4.918,1.12,.11,.032,'oak');
    for(const offset of [-.38,0,.38]){box(shoe.x+offset,1.64,-4.873,.028,.023,.073,'brass');box(shoe.x+offset,1.67,-4.84,.028,.071,.023,'brass');}
    for(const x of [-.26,-.12,.14,.28])pad(shoe.x+x,.21,shoe.z+.02,.105,.10,.22,x<0?'iron':'fabric');
    if(bathroom)furniture(BATH_KITCHEN_COUNTER.x,BATH_KITCHEN_COUNTER.z,BATH_KITCHEN_COUNTER.w);
    else furniture(-4.4,-2.49,3.65);
    sink(-5.62,-2.46);
    shelf(-5.8,1.43,-2.63,.87);
    if(/abinet|upboard|orktop|unable-white/.test(site.name)){
      if(site.name==='Worktop lighting'){
        // The two switch plates sit against this finished tile face.
        for(let row=0;row<5;row++){
          for(let col=0;col<12;col++){
            const a=Math.max(-5.25,-5.25+col*.20-(row%2)*.10);
            const b=Math.min(-3.12,-5.25+(col+1)*.20-(row%2)*.10);
            if(b-a>.004)box((a+b)/2,1.00+row*.12,kitchen.tileFace-.0035,b-a-.002,.118,.007,'white');
          }
        }
        box(kitchen.left,.946,-2.44,.32,.017,.19,'oak');
        for(const h of [.945,.955,.965])pipe(kitchen.right+.04,h,-2.44,.081,.009,'white');
      }
      if(site.items.some(i=>i.fixture?.tapeProfile)){
        const left=kitchen.left-.28,right=kitchen.right+.18;
        box((left+right)/2,kitchen.railY+.001,kitchen.railZ,right-left,.009,.012,'cream');
      }
      for(const x of [kitchen.left,kitchen.right]){
        const workingDoor=site.name==='Cupboard lighting'&&x===-4.65;
        box(x,1.92,-2.748,.79,.78,.034,'cream');
        for(const side of [-1,1])box(x+side*.382,1.92,-2.56,.026,.78,.39,'cream');
        for(const h of [1.54,1.89,2.296])box(x,h,-2.56,.75,.026,.39,'cream');
        if(workingDoor){for(const v of [-4.87,-4.63]){pipe(v,1.65,-2.55,.055,.17,'white');pipe(v,1.738,-2.55,.057,.013,'oak');}}
        else{box(x,1.92,-2.35,.76,.75,.032,'sage');box(x+.27,1.69,-2.323,.02,.13,.035,'metal');}
      }
    }
    for(const x of [-6.05,-5.8,-5.55]){pipe(x,1.57,-2.58,.06,.22,'cream');pipe(x,1.69,-2.58,.062,.022,'oak');}
    furniture(5.6,-2.49,1.39,'white');rack(bathroom?BATH_RACK.x:3.13,-.65);
    if(bathroom){bathFurniture(add);furniture(1.32,-2.47,1.30,'white');sink(1.32,-2.46);frame(1.34,1.63,-2.69,.89,.70,'metal');box(1.34,1.63,-2.735,.87,.68,.02,'glass');}
    else if(stair)stairHall(add,frame);
    else{
      // Shallow hall cupboard, moulded panels and latch. Its leaf is on the back wall.
      box(-.95,1.05,-2.715,.95,2.10,.061,'white');
      box(-.95,1.02,-2.677,.82,2.01,.040,'trim');
      for(const x of [-1.158,-.742])for(const [y,h] of [[.51,.78],[1.46,.84]]){
        box(x,y,-2.65,.318,h,.023,'paint');
        frame(x,y,-2.632,.325,h,'trim');
      }
      box(-.62,.99,-2.61,.043,.137,.017,'brass');box(-.67,1.01,-2.588,.12,.02,.028,'brass');
      // Tongue-and-groove panelling and a capped dado, with a gap at the cupboard.
      for(const [xx,w] of [[-1.80,.80],[.31,1.57],[2.15,.09]]){
        box(xx,.49,-2.72,w,.98,.05,'trim');
        for(let i=1;i<w/.145;i++)box(xx-w/2+i*.145,.48,-2.689,.008,.94,.009,'paint');
        box(xx,.985,-2.68,w,.05,.072,'paint');box(xx,1.014,-2.673,w,.016,.09,'cream');
      }
      // The runner, individual drawer fronts and recessed edges give familiar scale.
      box(.03,.003,-1.06,.84,.013,2.48,'linen');
      for(const x of [-.34,.40])box(x,.012,-1.06,.017,.003,2.38,'green');
      table(.64,-2.48,.80,'walnut');box(.64,.78,-2.48,.78,.18,.65,'walnut');
      for(const x of [.45,.83]){box(x,.78,-2.145,.35,.15,.025,'oak');pipe(x,.78,-2.114,.018,.026,'brass');}
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
  return <instancedMesh ref={ref} args={[g,m,items.length]} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} receiveShadow castShadow dispose={null}/>;
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
  return <primitive object={plant} dispose={null} position={[.83,.92,-2.46]}/>;
}
export default function InstallationRoom({site,economy,cupboardOpen,operateCupboard}:{site:JobSite;economy:boolean;cupboardOpen:boolean;operateCupboard:()=>void}){
  const {kind,building,name}=site;
  const batches=useMemo(()=>{const map=new Map<string,Piece[]>();for(const piece of installation(site)){const k=piece.shape+'/'+piece.surface;if(!map.has(k))map.set(k,[]);map.get(k)!.push(piece);}return map;},[kind,name,site.cupboardBoard,building.rooms.join('/')]);
  const res=useMemo(()=>{
    const maps=new Map<SurfacePattern,ReturnType<typeof createSurfaceTextures>>();
    const materials:Record<string,THREE.Material>={};
    for(const [id,[color,pattern,metalness=0]] of Object.entries(spec)){
      if(pattern&&!maps.has(pattern))maps.set(pattern,createSurfaceTextures(pattern,economy?128:256));const tex=pattern&&maps.get(pattern);
      materials[id]=new THREE.MeshStandardMaterial({color,metalness,roughness:metalness?.42:.84,map:tex?tex.color:null,normalMap:tex?tex.normal:null,normalScale:new THREE.Vector2(.13,.13)});
    }
    const pane=materials.pane;pane.transparent=true;pane.opacity=.16;pane.depthWrite=false;
    const brick=maps.get('brick');if(brick){brick.color.repeat.set(2,4);brick.normal.repeat.set(2,4);}
    const plaster=createSurfaceTextures('plaster',economy?128:256);maps.set('plaster',plaster);
    plaster.color.repeat.set(4,3);plaster.normal.repeat.set(4,3);
    building.walls.forEach((color,i)=>{materials['wall'+i]=new THREE.MeshStandardMaterial({color,roughness:.94,map:plaster.color,normalMap:plaster.normal,normalScale:new THREE.Vector2(.10,.10)});});
    const triangle=new THREE.Shape();
    triangle.moveTo(-.5,-.5);triangle.lineTo(.5,-.5);triangle.lineTo(0,.5);triangle.closePath();
    const gable=new THREE.ExtrudeGeometry(triangle,{depth:1,bevelEnabled:false}).translate(0,0,-.5).rotateY(Math.PI/2);
    return {materials,maps,geo:{gable,box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,20),ball:new THREE.SphereGeometry(1,16,10),cushion:new RoundedBoxGeometry(1,1,1,economy?1:2,.12)}};
  },[kind,economy]);
  useEffect(()=>()=>{for(const m of Object.values(res.materials))m.dispose();for(const g of Object.values(res.geo))g.dispose();for(const t of res.maps.values())t.dispose();},[res]);
  return <group name={'Installation · '+building.name}>
    <SceneryBoundary><Suspense fallback={null}><Environment files={publicAssetUrl('/site-assets/daylight.hdr')} environmentIntensity={.65}/></Suspense></SceneryBoundary>
    <SceneryBoundary><Suspense fallback={null}><SiteFinishes materials={res.materials}/></Suspense></SceneryBoundary>
    {kind==='home'&&building.rooms[1]==='Bathroom'&&<BathroomFabric vent={name==='Timed extract'} plaster={res.materials.wall0} masonry={res.materials.brick}/>}
    {site.name==='Cupboard lighting'&&<group position={CUPBOARD_HINGE} rotation={[0,cupboardOpen?CUPBOARD_SWING:0,0]} onClick={e=>{e.stopPropagation();operateCupboard();}}>
      <mesh position={[.38,0,0]} material={res.materials.sage} geometry={res.geo.box} scale={[.76,.75,.032]} castShadow receiveShadow/>
      <mesh position={[.66,-.16,.036]} material={res.materials.metal} geometry={res.geo.box} scale={[.024,.12,.04]}/>
    </group>}
    {kind==='home'&&!['Bathroom','Stair hall'].includes(building.rooms[1])&&<SceneryBoundary><Suspense fallback={null}><HallPlant/></Suspense></SceneryBoundary>}
    {[...batches].map(([key,items])=><Batch key={key} items={items} g={res.geo[items[0].shape]} m={res.materials[items[0].surface]}/>)}</group>;
}
