import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_BACK,HOME_POINTS,HOME_ROOMS,HOME_VISITS,HOUSE_FURNITURE,homeRoomAt,walkHome } from '../lib/home-floorplan.ts';
import type {Vec3} from '../lib/types.ts';

test('a learner can walk from the entrance to every room through the visible doors',()=>{
  for(const bathroom of [false,true]){
    const start:Vec3=[0,1.56,3.2],seen=new Set<string>(),rooms=new Set<number>();
    const queue:[number,number][]=[[0,0]],step=.20;
    for(let index=0;index<queue.length;index++){
      const [i,j]=queue[index],key=i+','+j;if(seen.has(key))continue;seen.add(key);
      const p:Vec3=[start[0]+i*step,1.56,start[2]+j*step];rooms.add(homeRoomAt(p[0],p[2]));
      for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const target=walkHome(p,di*step,dj*step,bathroom,false,false);
        if(Math.abs(target[0]-p[0]-di*step)<.0001&&Math.abs(target[2]-p[2]-dj*step)<.0001&&!seen.has((i+di)+','+(j+dj)))queue.push([i+di,j+dj]);
      }
    }
    assert.deepEqual([...rooms].sort(),HOME_ROOMS.map(r=>r.id));
    const hallDoor:Vec3=[1.6,1.56,-2.42];
    assert.equal(walkHome(hallDoor,0,-.78,bathroom,false,false)[2]<-2.8,!bathroom);
  }
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
  assert.ok(walkHome([-3,1.56,-5],0,-8,false,false,false)[2]>HOME_BACK);
  assert.ok(walkHome([-5.25,1.56,-5.5],-.95,0,false,false,false)[0]>-5.5);
});
