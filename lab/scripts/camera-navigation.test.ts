import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CAMERA_MAX_SPEED, CAMERA_MIN_SPEED, DEFAULT_CAMERA_SPEED, cameraFarPlane, cameraHasMotion, cameraLookQuaternion,
  clampCameraSpeed, createCameraNavigationState, createCameraTransition, queueCameraGesture,
  sampleCameraTransition, stepCameraNavigation, stopCameraNavigation,
  type CameraInput, type CameraNavigationState, type CameraPose,
} from '../lib/camera-navigation.ts';
const viewport={height:800,fov:43},idle:CameraInput={forward:0,right:0,up:0};
const pose:CameraPose={position:[0,0,10],target:[0,0,0],quaternion:[0,0,0,1]};
const close=(actual:number,expected:number,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} ≈ ${expected}`);
const vector=(v:number[])=>new THREE.Vector3(...v);
function advance(state:CameraNavigationState,input:CameraInput,seconds:number,fps=60,mode:'orbit'|'free'='free',speed=DEFAULT_CAMERA_SPEED){for(let i=0;i<Math.round(seconds*fps);i++)state=stepCameraNavigation(state,mode,input,1/fps,viewport,speed);return state;}
function settle(state:CameraNavigationState,mode:'orbit'|'free'='free') {let frames=0;while(cameraHasMotion(state)&&frames++<600)state=stepCameraNavigation(state,mode,idle,1/60,viewport);assert.ok(frames<600,'camera must stop requesting frames');return state;}

test('free flight uses analytically integrated acceleration at 30,60,144 Hz',()=>{
  const expectedDistance=4*(1-(1-Math.exp(-10))/10);
  for(const fps of [30,60,144]){const state=advance(createCameraNavigationState(pose),{...idle,forward:1},1,fps);close(state.position[2],10-expectedDistance);close(state.velocity[2],-4*(1-Math.exp(-10)));close(state.position[0],0);close(state.position[1],0);}
});
test('release has a finite stopping distance and eventually idles at every tested frame rate',()=>{
  for(const fps of [30,60,144]){let state=advance(createCameraNavigationState(pose),{...idle,forward:1},1,fps);const releasePosition=state.position[2],releaseVelocity=state.velocity[2];state=advance(state,idle,2,fps);close(state.position[2],releasePosition+releaseVelocity/10,2e-5);state=settle(state);assert.equal(cameraHasMotion(state),false);assert.deepEqual(state.velocity,[0,0,0]);}
});
test('acceleration and release do not snap between rest and full speed',()=>{
  let state=stepCameraNavigation(createCameraNavigationState(pose),'free',{...idle,forward:1},1/60,viewport);assert.ok(Math.abs(state.velocity[2])>0&&Math.abs(state.velocity[2])<4);const velocity=state.velocity[2];state=stepCameraNavigation(state,'free',idle,1/60,viewport);assert.ok(Math.abs(state.velocity[2])>0&&Math.abs(state.velocity[2])<Math.abs(velocity));
});
test('diagonal motion never gives a faster translation than straight flight',()=>{
  const straight=advance(createCameraNavigationState(pose),{...idle,forward:1},1),diagonal=advance(createCameraNavigationState(pose),{forward:1,right:1,up:0},1);close(vector(straight.position).distanceTo(vector(pose.position)),vector(diagonal.position).distanceTo(vector(pose.position)));close(Math.abs(diagonal.position[0]),Math.abs(diagonal.position[2]-10));
});
test('flight follows the current camera direction, with world up available independently',()=>{
  const p:CameraPose={position:[0,-2,-10],target:[10,-2,-10],quaternion:cameraLookQuaternion([0,-2,-10],[10,-2,-10])};
  const forward=advance(createCameraNavigationState(p),{...idle,forward:1},1),down=advance(createCameraNavigationState(p),{...idle,up:-1},1);
  assert.ok(forward.position[0]>3.5);close(forward.position[2],-10);assert.ok(down.position[1]<-5.5,'free camera can travel below the workbench');close(down.position[2],-10);
});
test('Shift increases speed by the declared fast multiplier while speed settings are bounded',()=>{
  const normal=advance(createCameraNavigationState(pose),{...idle,right:1},1),fast=advance(createCameraNavigationState(pose),{...idle,right:1,fast:true},1);close(fast.position[0]/normal.position[0],3.5);assert.equal(clampCameraSpeed(NaN),DEFAULT_CAMERA_SPEED);assert.equal(clampCameraSpeed(-2),CAMERA_MIN_SPEED);assert.equal(clampCameraSpeed(1e8),CAMERA_MAX_SPEED);
});
test('long rendering stalls cannot teleport the camera',()=>{
  const state=stepCameraNavigation(createCameraNavigationState(pose),'free',{...idle,forward:1,fast:true},40,viewport,16);assert.ok(vector(state.position).distanceTo(vector(pose.position))<5.6);assert.equal(stepCameraNavigation(state,'free',idle,NaN,viewport),state);
});
test('look motion is smoothed, remains normalized, and stops once consumed',()=>{
  const queued=queueCameraGesture(createCameraNavigationState(pose),{look:[.8,.2]}),first=stepCameraNavigation(queued,'free',idle,1/60,viewport);assert.ok(first.look[0]>0&&first.look[0]<queued.look[0]);const final=settle(first);const euler=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...final.quaternion),'YXZ');close(euler.y,-.8,2e-5);close(euler.x,-.2,2e-5);close(new THREE.Quaternion(...final.quaternion).length(),1);assert.equal(cameraHasMotion(final),false);
});
test('free looking can face rear and underside without an orbit polar clamp',()=>{
  const state=settle(queueCameraGesture(createCameraNavigationState(pose),{look:[Math.PI,1.1]}));const forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...state.quaternion));assert.ok(forward.z>0);assert.ok(forward.y<-.8);assert.ok(state.target[2]>state.position[2]);
});
test('orbit mouse and wheel motion are gradual and preserve the orbit center',()=>{
  const state=createCameraNavigationState(pose),first=stepCameraNavigation(queueCameraGesture(state,{look:[.8,.2],wheel:200}),'orbit',idle,1/60,viewport);assert.ok(vector(first.position).distanceTo(vector(pose.position))>0);assert.ok(first.wheel>0&&first.wheel<200);assert.deepEqual(first.target,pose.target);const final=settle(first,'orbit');close(vector(final.position).distanceTo(vector(final.target)),10*Math.exp(.3),5e-5);assert.deepEqual(final.target,pose.target);assert.equal(cameraHasMotion(final),false);
});
test('free wheel dolly produces a bounded final displacement without an idle loop',()=>{
  const final=settle(queueCameraGesture(createCameraNavigationState(pose),{wheel:-120}));close(final.position[2],7.6,3e-5);close(vector(final.position).distanceTo(vector(final.target)),10);assert.equal(cameraHasMotion(final),false);
});
test('middle pan moves both position and target while preserving direction and distance',()=>{
  const final=settle(queueCameraGesture(createCameraNavigationState(pose),{pan:[100,-50]}));assert.ok(final.position[0]<0&&final.position[1]<0);close(vector(final.position).distanceTo(vector(final.target)),10);assert.deepEqual(final.quaternion,pose.quaternion);close(final.position[0],final.target[0]);close(final.position[1],final.target[1]);
});
test('changing mode and pausing an editing drag preserve exact position and orientation',()=>{
  const moving=stepCameraNavigation(queueCameraGesture(createCameraNavigationState(pose),{look:[.4,.2],wheel:50}),'free',{...idle,forward:1},1/60,viewport),paused=stopCameraNavigation(moving);
  assert.deepEqual(paused.position,moving.position);assert.deepEqual(paused.quaternion,moving.quaternion);assert.deepEqual(paused.target,moving.target);assert.equal(cameraHasMotion(paused),false);const orbit=stepCameraNavigation(paused,'orbit',idle,1/60,viewport);close(vector(orbit.position).distanceTo(vector(paused.position)),0);close(Math.abs(new THREE.Quaternion(...orbit.quaternion).dot(new THREE.Quaternion(...paused.quaternion))),1);
});
test('mode changes from a rear underside camera remain stationary',()=>{
  const p:CameraPose={position:[-2,-3,-5],target:[1,0,0],quaternion:cameraLookQuaternion([-2,-3,-5],[1,0,0])},state=createCameraNavigationState(p);for(const mode of ['free','orbit','free','orbit'] as const){const next=stepCameraNavigation(state,mode,idle,1/60,viewport);close(vector(next.position).distanceTo(vector(p.position)),0);close(Math.abs(new THREE.Quaternion(...next.quaternion).dot(new THREE.Quaternion(...p.quaternion))),1);}
});
test('front-to-rear preset arcs around the fixture and has continuous normalized orientation',()=>{
  const rear:CameraPose={position:[0,0,-10],target:[0,0,0],quaternion:cameraLookQuaternion([0,0,-10],[0,0,0])},transition=createCameraTransition(pose,rear);assert.deepEqual(sampleCameraTransition(transition,0),pose);assert.deepEqual(sampleCameraTransition(transition,transition.duration),rear);
  let previous=pose;for(let i=1;i<=80;i++){const sample=sampleCameraTransition(transition,transition.duration*i/80);close(vector(sample.position).distanceTo(vector(sample.target)),10);const q=new THREE.Quaternion(...sample.quaternion),prior=new THREE.Quaternion(...previous.quaternion);close(q.length(),1);assert.ok(q.angleTo(prior)<.08,'no orientation snap');assert.ok(vector(sample.position).distanceTo(vector(previous.position))<.8,'no positional snap');previous=sample;}
});
test('translated focus preset has exact endpoints and does not mutate caller poses',()=>{
  const to:CameraPose={position:[8,3,-4],target:[7,2,-2],quaternion:cameraLookQuaternion([8,3,-4],[7,2,-2])},before=structuredClone({pose,to}),transition=createCameraTransition(pose,to);const sample=sampleCameraTransition(transition,.4);assert.ok(sample.position.every(Number.isFinite));close(new THREE.Quaternion(...sample.quaternion).length(),1);assert.deepEqual(sampleCameraTransition(transition,10),to);assert.deepEqual({pose,to},before);sample.position[0]=999;assert.equal(pose.position[0],0);assert.equal(to.position[0],8);
});
test('resting state and empty gestures do not request additional frames',()=>{
  const state=createCameraNavigationState(pose);assert.equal(cameraHasMotion(state,idle),false);const next=stepCameraNavigation(state,'free',idle,1/60,viewport);assert.equal(cameraHasMotion(next,idle),false);assert.deepEqual(next,state);
});
test('idle mode changes preserve an extreme imported workbench pose exactly',()=>{
  const p:CameraPose={position:[80000,80000,80000],target:[9000,0,-9000],quaternion:cameraLookQuaternion([80000,80000,80000],[9000,0,-9000])},state=createCameraNavigationState(p);
  assert.equal(stepCameraNavigation(state,'orbit',idle,1/60,viewport),state);assert.equal(stepCameraNavigation(state,'free',idle,1/60,viewport),state);
});
test('distant free camera clipping contains the actual scene without moving the camera',()=>{
  const position:[number,number,number]=[600,-80,-900],bounds={min:[-8,-1,-6] as [number,number,number],max:[9,8,7] as [number,number,number]},before=structuredClone({position,bounds}),far=cameraFarPlane(position,bounds);
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])assert.ok(far>vector(position).distanceTo(new THREE.Vector3(x,y,z)));
  assert.ok(far<1400);assert.deepEqual({position,bounds},before);assert.equal(cameraFarPlane([0,0,10],bounds),140);assert.equal(cameraFarPlane([NaN,0,0],bounds),140);assert.equal(cameraFarPlane([1e308,1e308,1e308],bounds),1e7);
});
