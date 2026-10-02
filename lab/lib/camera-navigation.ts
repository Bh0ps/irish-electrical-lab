import * as THREE from 'three';
import type { Vec3 } from './types';

export type CameraMode = 'orbit' | 'free';
export type CameraQuaternion = [number, number, number, number];
export const DEFAULT_CAMERA_SPEED = 4;
export const CAMERA_MIN_SPEED = .25;
export const CAMERA_MAX_SPEED = 16;
export interface CameraPose { position:Vec3; quaternion:CameraQuaternion; target:Vec3 }
export interface CameraNavigationState extends CameraPose {
  velocity:Vec3;
  /** Unconsumed mouse motion. It decays to zero rather than running a perpetual loop. */
  look:[number,number]; pan:[number,number]; wheel:number;
}
export interface CameraInput { forward:number; right:number; up:number; fast?:boolean }
export interface CameraViewport { height:number; fov:number }
export interface CameraTransition { from:CameraPose; to:CameraPose; elapsed:number; duration:number }
const worldUp=new THREE.Vector3(0,1,0);
const vector=(v:Vec3)=>new THREE.Vector3(...v);
const tuple=(v:THREE.Vector3):Vec3=>v.toArray() as Vec3;
const quat=(q:CameraQuaternion)=>new THREE.Quaternion(...q).normalize();
const qtuple=(q:THREE.Quaternion):CameraQuaternion=>q.toArray() as CameraQuaternion;
const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
const settle=(v:number,tolerance=1e-5)=>Math.abs(v)<tolerance?0:v;
const copyPose=(p:CameraPose):CameraPose=>({position:[...p.position],quaternion:[...p.quaternion],target:[...p.target]});

export function clampCameraSpeed(speed=DEFAULT_CAMERA_SPEED):number {
  return THREE.MathUtils.clamp(finite(speed,DEFAULT_CAMERA_SPEED),CAMERA_MIN_SPEED,CAMERA_MAX_SPEED);
}
/** Fit/rear targets are artificial navigation anchors. Far clipping follows the
 * actual scene bounds too, so flying away and looking back does not hide it. */
export function cameraFarPlane(position:Vec3,bounds:{min:Vec3;max:Vec3}):number {
  if(![...position,...bounds.min,...bounds.max].every(Number.isFinite))return 140;
  const axes=position.map((p,i)=>Math.max(Math.abs(p-bounds.min[i]),Math.abs(p-bounds.max[i])));
  return THREE.MathUtils.clamp((Math.hypot(...axes)+30)*1.2,140,1e7);
}
export function cameraLookQuaternion(position:Vec3,target:Vec3):CameraQuaternion {
  const from=vector(position),to=vector(target);
  if(from.distanceToSquared(to)<1e-12)return [0,0,0,1];
  return qtuple(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from,to,worldUp)));
}
export function createCameraNavigationState(pose:CameraPose):CameraNavigationState {
  return {...copyPose(pose),velocity:[0,0,0],look:[0,0],pan:[0,0],wheel:0};
}
/** Changing mode changes input interpretation only; it never moves the camera. */
export function stopCameraNavigation(state:CameraNavigationState):CameraNavigationState {
  return createCameraNavigationState(state);
}
export function queueCameraGesture(state:CameraNavigationState,gesture:{look?:[number,number];pan?:[number,number];wheel?:number}):CameraNavigationState {
  return {...state,look:[state.look[0]+finite(gesture.look?.[0]??0),state.look[1]+finite(gesture.look?.[1]??0)],pan:[state.pan[0]+finite(gesture.pan?.[0]??0),state.pan[1]+finite(gesture.pan?.[1]??0)],wheel:state.wheel+finite(gesture.wheel??0)};
}
export function cameraHasMotion(state:CameraNavigationState,input?:CameraInput):boolean {
  return state.velocity.some(v=>v!==0)||state.look.some(v=>v!==0)||state.pan.some(v=>v!==0)||state.wheel!==0||!!input&&(input.forward!==0||input.right!==0||input.up!==0);
}
/** Exact integration of a first-order velocity response. Frame rate does not change acceleration or stopping distance. */
export function stepCameraNavigation(state:CameraNavigationState,mode:CameraMode,input:CameraInput,seconds:number,viewport:CameraViewport,speed=DEFAULT_CAMERA_SPEED):CameraNavigationState {
  const dt=THREE.MathUtils.clamp(finite(seconds),0,.1);
  if(!dt||!cameraHasMotion(state,mode==='free'?input:undefined))return state;
  const position=vector(state.position),target=vector(state.target),orientation=quat(state.quaternion);
  const alpha=1-Math.exp(-18*dt),look=state.look.map(v=>v*alpha) as [number,number],pan=state.pan.map(v=>v*alpha) as [number,number],wheel=state.wheel*alpha;
  let distance=Math.max(.15,position.distanceTo(target));
  if(mode==='orbit') {
    const offset=position.clone().sub(target),spherical=new THREE.Spherical().setFromVector3(offset);
    spherical.radius=wheel?THREE.MathUtils.clamp(distance*Math.exp(THREE.MathUtils.clamp(wheel*.0015,-2,2)),.15,1e6):distance;
    spherical.theta-=look[0];spherical.phi=THREE.MathUtils.clamp(spherical.phi-look[1],.001,Math.PI-.001);
    position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    orientation.copy(quat(cameraLookQuaternion(tuple(position),tuple(target))));distance=spherical.radius;
  } else if(look[0]||look[1]) {
    const euler=new THREE.Euler().setFromQuaternion(orientation,'YXZ');
    euler.y-=look[0];euler.x=THREE.MathUtils.clamp(euler.x-look[1],-Math.PI/2+.001,Math.PI/2-.001);euler.z=0;
    orientation.setFromEuler(euler);target.copy(position).add(new THREE.Vector3(0,0,-distance).applyQuaternion(orientation));
  }
  const right=new THREE.Vector3(1,0,0).applyQuaternion(orientation),up=new THREE.Vector3(0,1,0).applyQuaternion(orientation),forward=new THREE.Vector3(0,0,-1).applyQuaternion(orientation);
  const pixelScale=2*distance*Math.tan(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(finite(viewport.fov,43),1,175))/2)/Math.max(1,finite(viewport.height,800));
  const shift=right.clone().multiplyScalar(-pan[0]*pixelScale).addScaledVector(up,pan[1]*pixelScale);
  if(mode==='free'&&wheel)shift.addScaledVector(forward,-wheel*.002*THREE.MathUtils.clamp(distance,.3,30));
  position.add(shift);target.add(shift);
  const desired=mode==='free'?forward.multiplyScalar(finite(input.forward)).addScaledVector(right,finite(input.right)).addScaledVector(worldUp,finite(input.up)):new THREE.Vector3();
  // Diagonal motion has the same speed as a single direction. Opposing keys cancel.
  if(desired.lengthSq()>1)desired.normalize();
  desired.multiplyScalar(clampCameraSpeed(speed)*(input.fast?3.5:1));
  const velocity=vector(state.velocity),decay=Math.exp(-10*dt);
  const displacement=desired.clone().multiplyScalar(dt).addScaledVector(velocity.clone().sub(desired),(1-decay)/10);
  position.add(displacement);target.add(displacement);
  velocity.sub(desired).multiplyScalar(decay).add(desired);
  const nextVelocity=tuple(velocity).map(v=>settle(v,1e-4)) as Vec3;
  return {position:tuple(position),target:tuple(target),quaternion:qtuple(orientation),velocity:nextVelocity,look:[settle(state.look[0]-look[0]),settle(state.look[1]-look[1])],pan:[settle(state.pan[0]-pan[0],.001),settle(state.pan[1]-pan[1],.001)],wheel:settle(state.wheel-wheel,.001)};
}
export function createCameraTransition(from:CameraPose,to:CameraPose,duration=.8):CameraTransition {
  return {from:copyPose(from),to:copyPose(to),elapsed:0,duration:THREE.MathUtils.clamp(finite(duration,.8),.1,4)};
}
/** Presets travel around their target; a front-to-rear command does not cut straight through the fixture. */
export function sampleCameraTransition(transition:CameraTransition,elapsed:number):CameraPose {
  const t=THREE.MathUtils.clamp(finite(elapsed)/transition.duration,0,1);
  if(t===0)return copyPose(transition.from);
  if(t===1)return copyPose(transition.to);
  const ease=t*t*t*(t*(t*6-15)+10),a=transition.from,b=transition.to,target=vector(a.target).lerp(vector(b.target),ease);
  const offsetA=vector(a.position).sub(vector(a.target)),offsetB=vector(b.position).sub(vector(b.target)),radius=THREE.MathUtils.lerp(Math.max(.001,offsetA.length()),Math.max(.001,offsetB.length()),ease);
  const directionA=offsetA.lengthSq()?offsetA.normalize():new THREE.Vector3(0,0,1),directionB=offsetB.lengthSq()?offsetB.normalize():new THREE.Vector3(0,0,1);
  let rotation:THREE.Quaternion;
  if(directionA.dot(directionB)<-.9999){const axis=worldUp.clone().addScaledVector(directionA,-worldUp.dot(directionA));if(axis.lengthSq()<1e-8)axis.set(1,0,0);rotation=new THREE.Quaternion().setFromAxisAngle(axis.normalize(),Math.PI);}
  else rotation=new THREE.Quaternion().setFromUnitVectors(directionA,directionB);
  const direction=directionA.applyQuaternion(new THREE.Quaternion().slerp(rotation,ease));
  return {position:tuple(target.clone().addScaledVector(direction,radius)),target:tuple(target),quaternion:qtuple(quat(a.quaternion).slerp(quat(b.quaternion),ease))};
}
