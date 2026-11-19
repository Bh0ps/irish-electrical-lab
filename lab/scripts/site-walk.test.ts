import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons';
import {jobSite} from '../lib/job-site';
import {homeRoomAt,STAIR_EYE,STAIR_TOP} from '../lib/home-floorplan';
import {fittingZoom,SiteWalkInput,standingView,walkStick} from '../lib/site-walk';

test('a close-up can be enlarged and reset with one tap or pinched within its lens limits',()=>{
  const rig=new SiteWalkInput();rig.setZoom(2);
  const enlarged=fittingZoom(1,rig.zoom,rig.requestedZoom);assert.equal(enlarged,2);
  rig.consumeMotion();assert.equal(rig.requestedZoom,undefined);
  assert.equal(fittingZoom(enlarged,9),3);assert.equal(fittingZoom(enlarged,-9),1);
  rig.setZoom(1);assert.equal(fittingZoom(enlarged,0,rig.requestedZoom),1);
});

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

test('one-thumb steering turns while walking, releases cleanly and supports short taps',()=>{
  const rig=new SiteWalkInput();
  rig.moveThumb(.5,.5);
  assert.ok(Math.abs(rig.advanceSteering(1/60)*60-.9)<1e-9);
  assert.deepEqual(rig.stick,[.5,.5]);
  assert.equal(rig.advanceSteering(8),rig.advanceSteering(.045));
  rig.liftThumb();assert.equal(rig.advanceSteering(1/60),0);
  rig.turnStep(false);assert.ok(Math.abs(rig.turn[0]*.003+Math.PI/12)<1e-9);
  assert.deepEqual(rig.nudge,[0,0]);rig.consumeMotion();
  rig.step('up');assert.deepEqual(rig.nudge,[0,.25]);
  rig.stop();assert.equal(rig.advanceSteering(1),0);
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
