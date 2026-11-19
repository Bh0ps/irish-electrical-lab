import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_BACK,HOME_POINTS,HOME_ROOMS,HOME_VISITS,HOUSE_FURNITURE,GARDEN_DOOR,REAR_GARDEN,HOME_STAIR,STAIR_EYE,STAIR_FOOT,STAIR_HALF,STAIR_TOP,STAIR_LANDING,homeRoomAt,walkHome,stairFloor } from '../lib/home-floorplan.ts';
import {stairHall} from '../components/lab/StairHall.ts';
import type {Vec3} from '../lib/types.ts';

test('a learner can walk from the entrance to every room through the visible doors',()=>{
  for(const [bathroom,stair] of [[false,false],[true,false],[false,true]]){
    const start:Vec3=[0,1.56,3.2],seen=new Set<string>(),rooms=new Set<number>();
    const queue:[number,number][]=[[0,0]],step=.20;
    for(let index=0;index<queue.length;index++){
      const [i,j]=queue[index],key=i+','+j;if(seen.has(key))continue;seen.add(key);
      const p:Vec3=[start[0]+i*step,1.56,start[2]+j*step];rooms.add(homeRoomAt(p[0],p[2],stair));
      for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const target=walkHome(p,di*step,dj*step,bathroom,stair);
        if(Math.abs(target[0]-p[0]-di*step)<.0001&&Math.abs(target[2]-p[2]-dj*step)<.0001&&!seen.has((i+di)+','+(j+dj)))queue.push([i+di,j+dj]);
      }
    }
    assert.deepEqual([...rooms].sort(),HOME_ROOMS.map(r=>r.id).concat(stair?[STAIR_LANDING.id]:[]).sort());
    const hallDoor:Vec3=[1.6,1.56,-2.42];
    assert.equal(walkHome(hallDoor,0,-.78,bathroom,false)[2]<-2.8,!bathroom);
  }
});
test('both flights meet their landings with a solid tread and headroom at every walking height',()=>{
  const s=HOME_STAIR,mid=(s.back+s.turn)/2;
  const blocks:{p:Vec3;size:Vec3}[]=[];
  stairHall((p,size,_material,_shape,rotation)=>{if(!rotation)blocks.push({p,size});},()=>{});
  const lower=(s.west+s.divider)/2,upper=(s.divider+s.east)/2;
  let pos:Vec3=[lower,STAIR_EYE,STAIR_FOOT+.45];
  function walkTo(x:number,z:number){
    const prev=pos;pos=walkHome(pos,x-pos[0],z-pos[2],false,true);
    assert.ok(Math.hypot(pos[0]-x,pos[2]-z)<1e-8,'blocked on the walking route');
    const floor=pos[1]-STAIR_EYE;
    assert.ok(Math.abs(floor-stairFloor(x,z))<1e-8);
    assert.ok(Math.abs(prev[1]-pos[1])<=s.rise+1e-8,'skipped a riser');
    const overhead=blocks.filter(({p,size})=>Math.abs(p[0]-x)<size[0]/2&&Math.abs(p[2]-z)<size[2]/2);
    if(floor>1e-8)assert.ok(overhead.some(({p,size})=>Math.abs(p[1]+size[1]/2-floor)<1e-8),'no tread underfoot');
    assert.ok(overhead.every(({p,size})=>p[1]+size[1]/2<=floor+1e-8||p[1]-size[1]/2>=floor+2),'insufficient headroom');
  }
  const treads=Array.from({length:s.risersPerFlight-1},(_,k)=>s.turn+(k+.5)*s.going);
  for(const z of treads.toReversed())walkTo(lower,z);
  walkTo(lower,mid);walkTo(upper,mid);assert.ok(Math.abs(pos[1]-STAIR_EYE-STAIR_HALF)<1e-8);
  for(const z of treads)walkTo(upper,z);
  walkTo(upper,STAIR_FOOT+.45);assert.ok(Math.abs(pos[1]-STAIR_EYE-STAIR_TOP)<1e-8);
  assert.ok(walkHome(pos,-4,0,false,true)[0]>s.divider,'cannot fall through the landing edge');
  assert.ok(walkHome(pos,0,4,false,true)[2]<s.landingEnd,'cannot walk through the upstairs door');
  for(const z of treads.toReversed())walkTo(upper,z);
  walkTo(upper,mid);walkTo(lower,mid);
  for(const z of treads)walkTo(lower,z);
  walkTo(lower,STAIR_FOOT+.45);assert.ok(Math.abs(pos[1]-STAIR_EYE)<1e-8);
});
test('room arrivals, rear socket positions, furniture and wall stops agree with the plan',()=>{
  for(const [id,visit] of Object.entries(HOME_VISITS)){
    const [x,,z]=visit.position;
    assert.equal(homeRoomAt(x,z),Number(id));
    for(const b of Object.values(HOUSE_FURNITURE))assert.ok(Math.abs(x-b.x)>b.w/2+.16||Math.abs(z-b.z)>b.d/2+.16);
  }
  for(const fixing of Object.values(HOME_POINTS)){
    assert.equal(homeRoomAt(fixing.x,fixing.z+.01),fixing.room);
    assert.equal(fixing.z,HOME_BACK);
    for(const b of Object.values(HOUSE_FURNITURE))assert.ok(Math.abs(fixing.x-b.x)>b.w/2+.16||Math.abs(fixing.z+.55-b.z)>b.d/2+.16);
  }
  assert.ok(walkHome([-3,1.56,-5],0,-8,false,false)[2]>HOME_BACK);
  assert.ok(walkHome([-5.25,1.56,-5.5],-.95,0,false,false)[0]>-5.5);
});
test('the garden doorway opens onto paving and a walker can turn back at the fence',()=>{
  const x=GARDEN_DOOR.centre;
  const garden=walkHome([x,1.56,HOME_BACK+.65],0,-1.65,false,false);
  assert.equal(homeRoomAt(garden[0],garden[2]),REAR_GARDEN.id);
  const backInside=walkHome(garden,0,1.65,false,false);
  assert.equal(homeRoomAt(backInside[0],backInside[2]),4);
  assert.ok(walkHome(garden,0,-8,false,false)[2]>REAR_GARDEN.back);
  const wall=walkHome([x-.8,1.56,HOME_BACK-.65],0,1.65,false,false);
  assert.ok(wall[2]<HOME_BACK);
});
