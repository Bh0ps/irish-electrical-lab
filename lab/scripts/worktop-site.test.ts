import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {getLesson} from '../lib/lessons';
import {jobSite} from '../lib/job-site';
import {worktopOverview,KITCHEN_LIGHTS,rockerPose} from '../lib/kitchen-lighting';
import {looseRockerView,installedTestFittings,siteContacts} from '../lib/site-meter';
import {rockerWireEntry} from '../lib/dc-rocker';
import {fixturePoint} from '../lib/site-fixtures';
import {standingView} from '../lib/site-walk';
import type {SitePose} from '../lib/site-camera';
import type {Vec3} from '../lib/types';

const circuit=getLesson(66)!.circuit,site=jobSite(circuit);
function projected(pose:SitePose,aspect:number,point:Vec3,zoom=1){
  const camera=new PerspectiveCamera(49,aspect,.012,55);
  camera.zoom=zoom;camera.updateProjectionMatrix();camera.position.set(...pose.position);
  camera.rotation.set(pose.pitch,pose.yaw,0,'YXZ');camera.updateMatrixWorld();
  return new Vector3(...point).project(camera);
}

test('both complete worktop strips, counters and switches are visible at kitchen arrival and in Walk',()=>{
  const k=KITCHEN_LIGHTS,item=site.items.find(i=>i.id==='right')!;
  for(const aspect of [.40,.51,.87,1.63,2.65,3.5])for(const standing of [false,true]){
    const pose=standing?standingView(site,item,aspect):worktopOverview(aspect);
    for(const x of [k.left,k.right])for(const point of [[x-.2525,k.bottom,k.profileZ],[x+.2525,k.bottom,k.profileZ],
      [x,k.switchHeight,k.tileFace],[x,.945,-2.44]] as Vec3[]){
      const {x:u,y:v,z}=projected(pose,aspect,point);
      assert.ok(z>0&&z<1&&Math.abs(u)<.95&&Math.abs(v)<.95,`worktop at ${aspect}: ${u}, ${v}`);
    }
  }
});

test('the actual two rear tabs and the detached receiver remain in the rocker view at both magnifications',()=>{
  const fitting=installedTestFittings(circuit,site).find(i=>i.item.id==='right-switch')!;
  const pose=rockerPose(fitting.item.position,true);
  const loose=fixturePoint(pose.position,fitting.item.scale,fitting.item.fixture,fitting.component,rockerWireEntry('OUT',true),pose.rotation);
  for(const aspect of [.43,.50,.85,1.7,3.5])for(const zoom of [1,2]){
    const camera=looseRockerView(fitting,aspect);
    for(const point of [loose,...siteContacts(fitting,true).map(c=>c.position)]){
      const {x,y,z}=projected(camera,aspect,point,zoom);
      assert.ok(z>0&&z<1&&Math.abs(x)<.95&&Math.abs(y)<.90,`contact at ${aspect}/${zoom}: ${x}, ${y}`);
    }
  }
});
