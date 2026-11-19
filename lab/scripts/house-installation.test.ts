import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS} from '../lib/lessons';
import {COMPONENTS} from '../lib/components';
import {HOME_BACK,HOME_DOORS,HOME_WALLS,STAIR_TOP,stairFloor} from '../lib/home-floorplan';
import {jobSite} from '../lib/job-site';
import {houseFixing,installedWireRoute} from '../lib/house-installation';
import {getComponentTerminals} from '../lib/terminal-layout';
import {fixturePoint} from '../lib/site-fixtures';
import {electricalKey} from '../lib/simulation-identity';
import {runLessonScenarios} from '../lib/scenarios';
import type {Endpoint,Vec3} from '../lib/types';

const lesson=(id:number)=>LESSONS.find(l=>l.id===id)!.circuit;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
test('socket plates sit on the correct face with clear wall above and rear pins behind it',()=>{
  for(const id of [17,18,19,21]){
    const doc=lesson(id),site=jobSite(doc);
    for(const c of doc.components.filter(c=>c.type==='socket')){
      const fixture=houseFixing(id,c)!,item=site.items.find(i=>i.id===c.id)!;
      const n=[Math.sin(item.rotation),0,Math.cos(item.rotation)],cross=n[0]===0?0:2;
      const faceDistance=(p:Vec3)=>(p[0]-fixture.face[0])*n[0]+(p[2]-fixture.face[2])*n[2];
      assert.ok(near(faceDistance(item.position),.0001));
      for(const terminal of getComponentTerminals(c,COMPONENTS[c.type])){
        assert.ok(faceDistance(fixturePoint(item.position,item.scale,item.fixture,c,terminal.anchor,item.rotation))<0);
      }
      const walls=HOME_WALLS.filter(w=>Math.abs(w.fixed-fixture.face[cross===0?2:0])<.08&&w.axis===(cross===0?'x':'z'));
      assert.ok(walls.some(w=>fixture.face[cross]>=w.start&&fixture.face[cross]<=w.end));
      for(const door of HOME_DOORS.filter(d=>walls.some(w=>w.id===d.wall))){
        assert.ok(Math.abs(fixture.face[cross]-door.centre)>door.width/2+.08);
      }
      if(fixture.room>=4){
        assert.ok(near(fixture.face[2],HOME_BACK-.01));
        const [centre,width]=fixture.room===4?[-3.7,2.05]:[5.57,1.28];
        assert.ok(Math.abs(fixture.face[0]-centre)>width/2+.1);
      }
    }
  }
  const site=jobSite(lesson(18));
  assert.deepEqual(site.items.filter(i=>i.id.startsWith('socket-')).map(i=>site.location(i.room)),['Sitting room','Sitting room','Bedroom']);
  assert.deepEqual(jobSite(lesson(7)).items.find(i=>i.id==='switch')!.position.slice(0,2),[0,1.24]);
});
test('installed runs follow the actual terminals, turn at fitted walls and remain independent of the solver',()=>{
  for(const {circuit:doc} of LESSONS){
    const fingerprint=electricalKey(doc),site=jobSite(doc);
    const anchor=(end:Endpoint)=>{
      const c=doc.components.find(c=>c.id===end.component)!,item=site.items.find(i=>i.id===c.id)!;
      return fixturePoint(item.position,item.scale,item.fixture,c,getComponentTerminals(c,COMPONENTS[c.type]).find(t=>t.id===end.terminal)!.anchor,item.rotation);
    };
    for(const wire of doc.wires){
      const path=installedWireRoute(doc,site,wire)!;
      assert.deepEqual(path[0],anchor(wire.from));assert.deepEqual(path.at(-1),anchor(wire.to));
      for(let i=1;i<path.length;i++)assert.equal(path[i].filter((v,k)=>!near(v,path[i-1][k])).length,1);
    }
    assert.equal(electricalKey(doc),fingerprint);
  }
  const doc=structuredClone(lesson(18)),site=jobSite(doc);
  const leg=doc.wires.find(w=>w.from.component==='socket-a'&&w.to.component==='socket-b'&&w.role==='L')!;
  const incoming=doc.wires.find(w=>w.to.component==='socket-a'&&w.role==='L')!;
  const returning=doc.wires.find(w=>w.from.component==='socket-c'&&w.role==='L')!;
  const incomingPath=installedWireRoute(doc,site,incoming)!,returnPath=installedWireRoute(doc,site,returning)!;
  assert.ok(incomingPath.some(p=>p[0]===-.6&&p[1]>2.9));
  assert.ok(returnPath.some(p=>p[0]===3.6&&p[1]>2.9));
  const initial=installedWireRoute(doc,site,leg)!;
  leg.to={component:'socket-c',terminal:'PE'};
  assert.notDeepEqual(installedWireRoute(doc,site,leg)!.at(-1),initial.at(-1));
  assert.ok(runLessonScenarios(lesson(17)).every(c=>c.status==='pass'));
  assert.ok(runLessonScenarios(lesson(18)).every(c=>c.status==='pass'));
  assert.ok(runLessonScenarios(lesson(19)).every(c=>c.status==='pass'));
});
test('the two-way switch rockers face separate level landings at the same local height',()=>{
  const doc=lesson(9),site=jobSite(doc),heights:number[]=[];
  for(const [id,level,name] of [['near',0,'Stair hall'],['far',STAIR_TOP,'First-floor landing']] as const){
    const c=doc.components.find(c=>c.id===id)!,item=site.items.find(i=>i.id===id)!;
    assert.equal(site.location(item.room),name);
    const face=houseFixing(9,c)!.face;
    const standingX=face[0]+Math.sin(item.rotation)*.45;
    assert.equal(stairFloor(standingX,face[2]-.1),level);
    assert.equal(stairFloor(standingX,face[2]+.1),level);
    const height=fixturePoint(item.position,item.scale,item.fixture,c,[0,COMPONENTS[c.type].size[1]/2,.2],item.rotation)[1]-level;
    assert.ok(height>1.00&&height<1.20);heights.push(height);
  }
  assert.ok(near(heights[0],heights[1]));assert.ok(runLessonScenarios(doc).every(r=>r.status==='pass'));
});
