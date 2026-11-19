import test from 'node:test';
import assert from 'node:assert/strict';
import {getLesson} from '../lib/lessons';
import {jobSite,walkStep} from '../lib/job-site';
import {homeRoomAt} from '../lib/home-floorplan';
import {installedEnd,installedWireRoute} from '../lib/house-installation';
import {BOARD_STUDY_ID,UTILITY_BOARD,boardRiser,cupboardFaceVisible,cupboardFoot,cupboardLeaf,cupboardView,installedHandle} from '../lib/consumer-unit-site';
import {cupboardJoinery} from '../components/lab/CupboardJoinery';
import type {Vec3} from '../lib/types';

test('a visitor can walk from the hall to both fitted breakers without crossing the worktop or the open cupboard door',()=>{
  const doc=getLesson(2)!.circuit,site=jobSite(doc),board=site.items.find(i=>i.id===BOARD_STUDY_ID)!;
  const position=(id:string)=>installedHandle(site.items.find(i=>i.id===id)!,doc.components.find(c=>c.id===id)!);
  const [a,b]=['branch1','branch2'].map(position);
  assert.ok(Math.abs(b[0]-a[0]-.036)<1e-9&&a[1]===b[1],'the original two occupied ways remain two module pitches apart');
  assert.ok(Math.abs(position('group')[1]-a[1]-.125)<1e-9);
  let p:Vec3=[1.45,1.56,.95];
  for(const [x,z] of [[UTILITY_BOARD.x,.95],[UTILITY_BOARD.x,-2.20]]){
    p=walkStep(p,x-p[0],z-p[2],site);assert.equal(p[0],x);assert.ok(Math.abs(p[2]-z)<1e-8);
  }
  assert.equal(homeRoomAt(p[0],p[2]),2);
  assert.ok(Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2])<.85);
  assert.equal(cupboardFaceVisible(p,a),true);
  assert.equal(cupboardFaceVisible([cupboardLeaf.x+.25,1.50,cupboardLeaf.z],a),false);
  assert.equal(cupboardFaceVisible([a[0],1.50,UTILITY_BOARD.wall-.20],a),false);
  assert.ok(walkStep(p,2,0,site)[0]<cupboardLeaf.x-.16);
  assert.ok(walkStep(p,0,-1,site)[2]>=cupboardFoot.z+cupboardFoot.d/2+.16-.00001);
  for(const aspect of [.38,.49,1.28,2.52]){
    const pose=cupboardView(board,'ways',aspect,[a,b]);
    assert.ok(cupboardFaceVisible(pose.position,a)&&cupboardFaceVisible(pose.position,b));
    for(const h of [a,b])assert.ok(Math.abs((h[0]-pose.position[0])/(pose.position[2]-h[2])/(Math.tan(49*Math.PI/360)*aspect))<.8);
    const arrival=cupboardView(board,'walk',aspect).position;
    assert.ok(Math.abs(arrival[0]-cupboardLeaf.x)>cupboardLeaf.w/2+.16||arrival[2]>cupboardLeaf.z+cupboardLeaf.d/2+.16);
    const all=cupboardView(board,'board',aspect);
    // The Gamma cover hinges on the left and swings outward through 1.69 rad.
    const midX=board.position[0]+.05*(-2.5+.075+(2.5-.075)*Math.cos(-1.69));
    const midZ=board.position[2]+.05*(1.03-.016-(2.5-.075)*Math.sin(-1.69));
    assert.ok(Math.abs((midX-all.position[0])/(all.position[2]-midZ)/(Math.tan(49*Math.PI/360)*aspect))<.83,
      'the open cover can be tapped clear of the browser edge');
  }
});
test('each outgoing core follows its actual terminal into the top duct through the cupboard head',()=>{
  const doc=getLesson(2)!.circuit,site=jobSite(doc),board=site.items.find(i=>i.id===BOARD_STUDY_ID)!;
  const [cx,top,cz]=boardRiser(board);
  const shelf:{p:Vec3;s:Vec3}[]=[];
  cupboardJoinery((p,s)=>{if(p[1]>2.2)shelf.push({p,s});});
  for(const w of doc.wires){
    const pins=[w.from,w.to],inBoard=pins.filter(pin=>doc.components.find(c=>c.id===pin.component)?.mount?.board===board.id);
    if(inBoard.length!==1)continue;
    const end=installedEnd(doc,site,inBoard[0],undefined,w)!,entry=end.lead!.at(-1)!;
    assert.ok(Math.abs(entry[0]-cx)<UTILITY_BOARD.trunkWidth/2-.005&&entry[1]===top&&entry[2]===cz);
    assert.ok(entry[2]>UTILITY_BOARD.wall+.005&&entry[2]<UTILITY_BOARD.wall+UTILITY_BOARD.trunkDepth-.005);
    assert.ok(!shelf.some(({p,s})=>Math.abs(p[0]-entry[0])<s[0]/2+.003&&Math.abs(p[2]-entry[2])<s[2]/2+.003));
    const route=installedWireRoute(doc,site,w)!;
    assert.ok(route.some(p=>p.every((v,i)=>v===entry[i])));
    assert.ok(route.some(p=>p[1]>2.9&&p[0]===entry[0]&&p[2]===entry[2]));
  }
});
