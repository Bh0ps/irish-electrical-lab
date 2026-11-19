import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS} from '../lib/lessons';
import {COMPONENTS} from '../lib/components';
import {BELL_CUPBOARD as b} from '../lib/bell-cupboard';
import {GARDEN_DOOR,HOME_BACK,HOME_DOORS,HOME_WALLS,REAR_GARDEN,STAIR_TOP,stairFloor} from '../lib/home-floorplan';
import {jobSite} from '../lib/job-site';
import {houseFixing,installedWireRoute} from '../lib/house-installation';
import {getComponentTerminals} from '../lib/terminal-layout';
import {fixturePoint} from '../lib/site-fixtures';
import {electricalKey} from '../lib/simulation-identity';
import {runLessonScenarios} from '../lib/scenarios';
import type {Endpoint,Vec3} from '../lib/types';

const lesson=(id:number)=>LESSONS.find(l=>l.id===id)!.circuit;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
test('the bell transformer supply cores share the side conduit and the chime circuit leaves at its own top entry',()=>{
  for(const id of [71,72]){
    const doc=lesson(id),site=jobSite(doc),before=electricalKey(doc);
    for(const wire of doc.wires){
      const nearTx=wire.from.component==='tx'||wire.to.component==='tx';
      const txTerminal=wire.from.component==='tx'?wire.from.terminal:wire.to.terminal;
      const isPrimary=nearTx&&['L','N','PE'].includes(txTerminal);
      const route=installedWireRoute(doc,site,wire)!;
      if(isPrimary){
        for(const x of [b.x+b.breakerSize[0]/2,b.x+b.transformerOffset-b.transformerSize[0]/2]){
          assert.ok(route.some(p=>near(p[0],x)&&near(p[1],b.y+b.conduitY)&&near(p[2],b.z+b.conduitZ)),wire.id);
        }
        assert.ok(route.every(p=>p[1]<b.y+.09));
      }else if(nearTx){
        assert.ok(route.some(p=>near(p[0],b.x+b.transformerOffset+b.secondaryX)&&near(p[1],b.y+b.transformerSize[1]/2)&&near(p[2],b.z+b.conduitZ)));
        assert.ok(route.some(p=>near(p[0],b.x+b.transformerOffset+b.secondaryX)&&p[1]>2.9));
      }else if(wire.from.component==='supply')assert.ok(route.every(p=>Math.abs(p[0]-b.x)<.055&&Math.abs(p[1]-b.y)<.09));
    }
    assert.equal(electricalKey(doc),before);
  }
});
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
test('visitors press each bell from outside and both wires enter through the wall behind the push',()=>{
  for(const [id,backId] of [[71,'rear'],[72,'back']] as const){
    const doc=lesson(id),site=jobSite(doc);
    assert.equal(site.location(0),'Kitchen');
    for(const name of ['front',backId]){
      const c=doc.components.find(c=>c.id===name)!,item=site.items.find(i=>i.id===name)!;
      const fixing=houseFixing(id,c)!,outward=Math.cos(item.rotation);
      assert.ok(item.fixture?.bellPush);
      assert.equal(item.room,name==='front'?3:REAR_GARDEN.id);
      assert.equal(outward,name==='front'?1:-1);
      assert.equal(c.variant,'sesame');
      assert.ok(near(item.fixture!.scale[1]*1.10,.055));
      assert.ok(near(item.position[2],fixing.face[2]));
      if(name===backId){
        assert.ok(fixing.face[2]<HOME_BACK);
        assert.ok(GARDEN_DOOR.centre-GARDEN_DOOR.width/2-fixing.face[0]>.06);
        assert.ok(fixing.face[0]>-3.7+2.05/2+.06);
      }
      const wires=doc.wires.filter(w=>w.from.component===name||w.to.component===name);
      assert.equal(wires.length,2);
      for(const w of wires){
        const path=installedWireRoute(doc,site,w)!;
        if(w.to.component===name)path.reverse();
        assert.ok((path[1][2]-fixing.face[2])*outward<-.06);
        assert.ok(path[2][1]>2.9);
        if(name===backId)assert.ok(path.some(p=>near(p[2],HOME_BACK-.04)&&p[1]>2.9));
      }
    }
    assert.ok(runLessonScenarios(doc).every(step=>step.status==='pass'));
  }
});
