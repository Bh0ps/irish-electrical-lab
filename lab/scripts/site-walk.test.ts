import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons';
import {jobSite} from '../lib/job-site';
import {homeRoomAt,STAIR_EYE,STAIR_TOP} from '../lib/home-floorplan';
import {SiteWalkInput,standingView,walkStick} from '../lib/site-walk';

test('the touch stick ignores small jitter and limits diagonal travel to the walking pace',()=>{
  assert.deepEqual(walkStick(1,-2,48),[0,0]);
  assert.deepEqual(walkStick(0,-48,48),[0,1]);
  const [side,forward]=walkStick(60,-60,48);
  assert.ok(Math.abs(side-forward)<1e-8&&Math.abs(Math.hypot(side,forward)-1)<1e-8);
});

test('turning the head keeps the other thumb walking; releasing or interrupting stops travel',()=>{
  const rig=new SiteWalkInput();let frames=0;rig.setWake(()=>frames++);
  rig.moveThumb(.25,1);rig.turnBy(30,-10);rig.consumeMotion();
  assert.deepEqual(rig.stick,[.25,1]);assert.equal(rig.thumb,true);assert.deepEqual(rig.turn,[0,0]);assert.equal(frames,2);
  rig.liftThumb();assert.deepEqual(rig.stick,[0,0]);assert.equal(rig.thumb,false);
  rig.keys.add('up');rig.moveThumb(1,0);rig.step('down');rig.turnBy(2,3);rig.zoomBy(.2);rig.stop();
  assert.deepEqual([rig.stick,rig.nudge,rig.turn,rig.zoom,rig.keys.size,rig.thumb],[[0,0],[0,0],[0,0],0,0,false]);
});

test('walking starts in clear standing space in the selected room and on the right stair level',()=>{
  const ring=jobSite(getLesson(19)!.circuit),socket=ring.items.find(item=>item.id==='socket-a')!;
  const start=standingView(ring,socket);
  assert.equal(homeRoomAt(start.position[0],start.position[2]),socket.room);
  assert.ok(Math.hypot(start.position[0]-socket.position[0],start.position[2]-socket.position[2])>.75);
  const stairs=jobSite(getLesson(9)!.circuit);
  assert.equal(standingView(stairs,stairs.items.find(i=>i.id==='near')).position[1],STAIR_EYE);
  assert.equal(standingView(stairs,stairs.items.find(i=>i.id==='far')).position[1],STAIR_EYE+STAIR_TOP);
});
