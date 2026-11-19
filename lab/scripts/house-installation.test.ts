import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSONS} from '../lib/lessons';
import {COMPONENTS} from '../lib/components';
import {heaterFlexRun,heaterFlexPath} from '../lib/fused-heater-site';
import {BELL_CUPBOARD as b} from '../lib/bell-cupboard';
import {CROMA_K1} from '../lib/croma-chime';
import {KITCHEN_LIGHTS as kitchen,stripLead,rockerPanelCentre,rockerPose,ROCKER_BOX} from '../lib/kitchen-lighting';
import {rockerProbeContact,rockerWireEntry} from '../lib/dc-rocker';
import {siteContacts,installedTestFittings} from '../lib/site-meter';
import {BATH_EXTRACT as bath,BATH_SHOWER,bathroomWireNote,outsideGrillePose} from '../lib/bathroom-extract';
import {GARDEN_DOOR,HOME_BACK,HOME_DOORS,HOME_WALLS,HOME_STAIR,REAR_GARDEN,STAIR_FOOT,STAIR_TOP,stairFloor,stairSwitchView} from '../lib/home-floorplan';
import {jobSite} from '../lib/job-site';
import {previousSiteView,type SavedSitePose} from '../lib/site-camera';
import {houseFixing,installedEnd,installedWireRoute} from '../lib/house-installation';
import {getComponentTerminals} from '../lib/terminal-layout';
import {fixturePoint,installedTerminalPoint} from '../lib/site-fixtures';
import {electricalKey} from '../lib/simulation-identity';
import {runLessonScenarios} from '../lib/scenarios';
import type {Endpoint,Vec3} from '../lib/types';

const lesson=(id:number)=>LESSONS.find(l=>l.id===id)!.circuit;
const near=(a:number,b:number)=>Math.abs(a-b)<1e-7;
test('a late frame from downstairs cannot replace the landing view, while saved walking and meter return views are kept',()=>{
  const lower:SavedSitePose={job:'home:9',focus:1,...stairSwitchView('near')};
  const landing={id:2,component:'far'};
  assert.equal(previousSiteView(lower,'home:9',landing),undefined);
  assert.equal(previousSiteView(lower,'home:17',{id:1}),undefined);
  assert.equal(previousSiteView(lower,'home:9',{id:1}),lower);
  const walked:SavedSitePose={...lower,position:[-.63,4.50,.82],focus:2};
  assert.equal(previousSiteView(walked,'home:9',landing),walked);
  const returnFromMeter={id:3,restore:walked};
  assert.equal(previousSiteView(lower,'home:9',returnFromMeter),walked);
  const resumed={...walked,focus:3,yaw:.2};
  assert.equal(previousSiteView(resumed,'home:9',returnFromMeter),resumed);
});
test('only the withdrawn worktop panel exposes its two real blade shoulders; flex follows the occupied crimp',()=>{
  const doc=lesson(66),before=electricalKey(doc),site=jobSite(doc),fittings=installedTestFittings(doc,site);
  assert.deepEqual(fittings.map(f=>f.component.id).sort(),['left','left-switch','right','right-switch']);
  const strip=fittings.find(f=>f.component.id==='right')!,rocker=fittings.find(f=>f.component.id==='right-switch')!;
  const {item,component}=rocker,open=rockerPose(item.position,true),fixed=rockerPanelCentre(item.position,false);
  assert.deepEqual(siteContacts(rocker,false),[]);
  assert.deepEqual(siteContacts(strip,false),siteContacts(strip,true));
  assert.ok(near(fixed[2]-kitchen.tileFace,ROCKER_BOX.depth));
  assert.deepEqual([ROCKER_BOX.cutWidth,ROCKER_BOX.cutHeight,ROCKER_BOX.panel],[.013,.0276,.0015]);
  for(const {endpoint,position} of siteContacts(rocker,true)){
    const expected=fixturePoint(open.position,item.scale,item.fixture,component,rockerProbeContact(endpoint.terminal),open.rotation);
    assert.deepEqual(position,expected);
    const closed=installedEnd(doc,site,endpoint)!,drawn=installedEnd(doc,site,endpoint,item.id)!;
    assert.deepEqual(drawn.pin,fixturePoint(open.position,item.scale,item.fixture,component,rockerWireEntry(endpoint.terminal),open.rotation));
    assert.deepEqual(closed.chase,drawn.chase);
    const length=(line:Vec3[])=>line.slice(1).reduce((total,p,i)=>total+Math.hypot(...p.map((n,k)=>n-line[i][k])),0);
    assert.ok(Math.abs(length(closed.lead!)-length(drawn.lead!))<.015);
    assert.ok(closed.pin[2]>kitchen.tileFace+.008&&closed.pin[2]<fixed[2]-.03);
    assert.ok(position[2]>fixed[2]+.08&&Math.hypot(...position.map((p,i)=>p-drawn.pin[i]))>.018);
    const connected=doc.wires.find(w=>[w.from,w.to].some(e=>e.component===item.id&&e.terminal===endpoint.terminal))!;
    const out=installedWireRoute(doc,site,connected,item.id)!;
    assert.deepEqual(connected.from.component===item.id?out[0]:out.at(-1),drawn.pin);
  }
  const legacy={...doc,components:doc.components.map(c=>c.type==='switch'?{...c,variant:undefined}:c)};
  assert.ok(installedTestFittings(legacy,jobSite(legacy)).every(f=>f.kind==='strip'));
  assert.equal(electricalKey(doc),before);
});
test('bathroom fittings face their own rooms and both fan cores pass through the separate rear cable inlet',()=>{
  const doc=lesson(36),site=jobSite(doc),item=(id:string)=>site.items.find(i=>i.id===id)!;
  const part=(id:string)=>doc.components.find(c=>c.id===id)!;
  const fan=item('fan'),light=item('light'),iso=item('fan-isolation'),timer=item('runon'),park=item('fan-cpc');
  assert.equal(item('protect').fixture?.bellService,'protect');
  const branch=doc.wires.find(w=>w.from.component==='protect'&&w.to.component==='fan-fcu')!;
  assert.ok(installedWireRoute(doc,site,branch)!.some(p=>near(p[0],b.x+bath.outgoingOffset)&&near(p[1],b.y+b.breakerSize[1]/2)&&near(p[2],b.z+b.conduitZ)));
  assert.equal(site.location(iso.room),'Service hall');
  for(const id of ['fan-fcu','light-switch','fan-isolation','runon']){
    assert.equal(item(id).room,2);
    assert.ok(item(id).position[0]>2.25);
    assert.ok(Math.abs(item(id).position[2]-.95)>.625);
  }
  assert.ok(near(fan.position[2],bath.wallInside));
  assert.equal(fan.rotation,Math.PI);
  assert.ok(Math.hypot(BATH_SHOWER.x-bath.fanX,BATH_SHOWER.z-bath.wallInside)>4);
  assert.ok(near(fixturePoint(fan.position,fan.scale,fan.fixture,part('fan'),[0,.88,0],fan.rotation)[1],bath.fanY));
  assert.ok(outsideGrillePose(true).position[2]>bath.wallOutside);
  assert.ok(bath.grilleWidth>2*bath.sleeveRadius&&bath.outletDrop>0);
  assert.ok(light.fixture?.ceilingLight&&light.fixture.tilt===Math.PI/2);
  for(const wire of doc.wires.filter(w=>w.to.component==='fan')){
    const end=wire.to.terminal;
    const grommet=fixturePoint(fan.position,fan.scale,fan.fixture,part('fan'),[end==='L'?-.615:-.575,.950,.011],fan.rotation);
    assert.ok(installedWireRoute(doc,site,wire)!.some(p=>p.every((n,i)=>near(n,grommet[i]))));
  }
  assert.deepEqual(doc.wires.filter(w=>[w.from.component,w.to.component].includes('fan')).map(w=>w.to.terminal).sort(),['L','N']);
  const parked=doc.wires.find(w=>w.to.component==='fan-cpc')!,terminus=installedWireRoute(doc,site,parked)!.at(-1)!;
  assert.equal(park.fixture?.serviceBox,'cpc');
  assert.ok(terminus[2]<bath.wallInside&&terminus[2]>bath.wallInside-bath.cpcSize[2]);
  assert.ok(Math.abs(terminus[0]-bath.fanX)>.15);
  for(const t of getComponentTerminals(part('runon'),COMPONENTS.timer)){
    const p=installedTerminalPoint(timer,part('runon'),t);
    assert.ok(p[0]>2.26&&p[0]<2.26+bath.timerSize[2]);
  }
  assert.match(bathroomWireNote(parked)!,/own connector/);
  assert.match(bathroomWireNote({...parked,from:parked.to,to:parked.from})!,/own connector/);
  assert.equal(bathroomWireNote({...parked,to:{component:'fan',terminal:'N'}}),undefined);
});
test('each worktop switch sits below its own light and the local cable enters the slotted end of that channel',()=>{
  const doc=lesson(66),site=jobSite(doc),get=(id:string)=>site.items.find(i=>i.id===id)!;
  for(const side of ['left','right']){
    const item=get(side),rocker=get(side+'-switch'),strip=doc.components.find(c=>c.id===side)!;
    assert.equal(item.position[0],rocker.position[0]);
    assert.ok(rocker.position[1]<kitchen.bottom&&rocker.position[1]>.94);
    assert.ok(item.fixture?.tapeProfile&&item.fixture.tape);
    for(const w of doc.wires.filter(w=>w.to.component===side)){
      const t=getComponentTerminals(strip,COMPONENTS.led).find(t=>t.id===w.to.terminal)!;
      const pin=installedTerminalPoint(item,strip,t),lead=stripLead(pin,item.position[0],t.id);
      const route=installedWireRoute(doc,site,w)!;
      assert.deepEqual(route.slice(-lead.length),lead.reverse());
      assert.ok(route.every(p=>p[1]<kitchen.top+.04&&p[0]>-5.1&&p[0]<-3.45));
      if(w.from.component===side+'-switch')assert.ok(route.every(p=>p[1]<kitchen.bottom));
    }
  }
  const driver=doc.components.find(c=>c.id==='driver')!,item=get('driver'),terminals=getComponentTerminals(driver,COMPONENTS.driver);
  assert.deepEqual(item.position,kitchen.driver);
  const pins=terminals.map(t=>installedTerminalPoint(item,driver,t));
  assert.ok(pins.slice(0,3).every(p=>p[0]<kitchen.driver[0]-kitchen.caseSize[0]/2&&p[1]>kitchen.top));
  assert.ok(pins.slice(3).every(p=>p[0]>kitchen.driver[0]+kitchen.caseSize[0]/2&&p[1]>kitchen.top));
  assert.equal(new Set(pins.map(String)).size,5);
});
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
test('the installed hall chime has five separate screw heads behind its door and four real wires through K1',()=>{
  const doc=lesson(72),site=jobSite(doc),signature=electricalKey(doc);
  const fittings=installedTestFittings(doc,site);assert.deepEqual(fittings.map(f=>f.component.id),['chime','front','back']);
  const [chime]=fittings,contacts=siteContacts(chime,true);
  assert.deepEqual(siteContacts(chime,false),[]);
  assert.deepEqual(contacts.map(p=>p.label),['=/~','8/12V','C1','C2','V']);
  const wires=doc.wires.filter(w=>[w.from,w.to].some(e=>e.component==='chime'));
  assert.equal(wires.length,4);
  const [x,y,z]=chime.item.position,ports=new Set<string>();
  for(const wire of wires){
    const end=wire.from.component==='chime'?wire.from:wire.to;
    const fitted=installedEnd(doc,site,end)!,core=fitted.lead!;
    assert.deepEqual(core[0],fitted.pin);assert.notEqual(end.terminal,'V');
    const screw=contacts.find(c=>c.endpoint.terminal===end.terminal)!;
    assert.ok(screw.position[2]>fitted.pin[2]&&core.at(-1)![2]<z);
    const entry=core.find((p,i)=>i&&p[2]<z&&core[i-1][2]>=z)!;
    assert.ok(Math.abs(entry[0]-x-CROMA_K1.centre[0]*.1)<CROMA_K1.width*.05);
    assert.ok(Math.abs(entry[1]-y-CROMA_K1.centre[1]*.1)<CROMA_K1.height*.05);
    ports.add(entry[0]+','+entry[1]);
  }
  assert.equal(ports.size,4);assert.equal(electricalKey(doc),signature);
  const old={...doc,components:doc.components.map(c=>c.id==='chime'?{...c,variant:undefined}:c)};
  assert.equal(installedTestFittings(old,jobSite(old)).length,0);
  assert.ok(runLessonScenarios(doc).every(r=>r.status==='pass'));
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
      return installedTerminalPoint(item,c,getComponentTerminals(c,COMPONENTS[c.type]).find(t=>t.id===end.terminal)!);
    };
    for(const wire of doc.wires){
      const path=installedWireRoute(doc,site,wire)!;
      assert.deepEqual(path[0],anchor(wire.from));assert.deepEqual(path.at(-1),anchor(wire.to));
      const flex=heaterFlexRun(doc);
      if(flex&&wire.cable?.runId===flex.id){
        const sheath=heaterFlexPath(site.items.find(i=>i.fixture?.fusedHeater)!,site.items.find(i=>i.id==='fixed')!,false);
        assert.ok(sheath.every(q=>path.some(p=>p.every((v,i)=>near(v,q[i])))));continue;
      }
      const [from,to]=[wire.from,wire.to].map(end=>installedEnd(doc,site,end,undefined,wire)!);
      const flexible=(end:typeof from)=>end.item.fixture?.worktopRocker||end.item.fixture?.croma||end.item.fixture?.fusedHeater||end.item.fixture?.bellPush&&end.component.variant==='sesame';
      const start=flexible(from)?from.lead!.length:1;
      const stop=flexible(to)?path.length-to.lead!.length+1:path.length;
      for(let i=start;i<stop;i++)assert.equal(path[i].filter((v,k)=>!near(v,path[i-1][k])).length,1);
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
    assert.deepEqual(item.fixture?.scale,[.1,.1,.1]);
    const wall=fixturePoint(item.position,item.scale,item.fixture,c,[0,.651,-.014],item.rotation);
    assert.ok(near(wall[0],face[0]));
    const view=stairSwitchView(id),[x,,z]=view.position;
    assert.equal(stairFloor(x,z),level);
    const standingX=face[0]+Math.sin(item.rotation)*.45;
    assert.equal(stairFloor(standingX,face[2]-.1),level);
    assert.equal(stairFloor(standingX,face[2]+.1),level);
    const height=fixturePoint(item.position,item.scale,item.fixture,c,[0,.651,.067],item.rotation)[1]-level;
    assert.ok(near(height,1.1051));heights.push(height);
  }
  assert.ok(near(heights[0],heights[1]));assert.ok(runLessonScenarios(doc).every(r=>r.status==='pass'));
});
test('both stair strappers cross in the landing floor; all other stair runs approach through the side wall',()=>{
  const doc=lesson(9),site=jobSite(doc);
  const straps=doc.wires.filter(w=>[w.from,w.to].every(e=>['near','far'].includes(e.component)));
  assert.equal(straps.length,2);
  for(const w of straps){
    const route=installedWireRoute(doc,site,w)!;
    assert.ok(route.every(p=>p[2]>STAIR_FOOT&&p[2]<HOME_STAIR.landingEnd));
    const crossing=route.find((p,i)=>i>0&&Math.abs(p[0]-route[i-1][0])>.9);
    assert.ok(crossing&&crossing[1]<STAIR_TOP&&crossing[1]>STAIR_TOP-.15);
  }
  for(const w of doc.wires){
    const route=installedWireRoute(doc,site,w)!;
    for(let i=1;i<route.length;i++){
      if(Math.abs(route[i][2]-route[i-1][2])>2&&near(route[i][1],STAIR_TOP-.075))
        assert.ok(route[i][0]>=HOME_STAIR.east-.001,'longitudinal crossing is inside the wall beside the flight');
    }
  }
  const edited={...doc,wires:doc.wires.filter(w=>w.id!==straps[0].id)};
  assert.deepEqual(installedWireRoute(edited,jobSite(edited),straps[1]),installedWireRoute(doc,site,straps[1]));
  const localLink={...straps[0],to:{component:'near',terminal:'T2'}};
  assert.ok(installedWireRoute(doc,site,localLink)!.every(p=>p[1]<1.2));
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
        const chase=path.findIndex(p=>(p[2]-fixing.face[2])*outward<-.06);
        assert.ok(chase>0&&chase<path.length-1);
        assert.ok(path[chase+1][1]>2.9);
        assert.ok(path.slice(1,chase+1).every(p=>(p[2]-fixing.face[2])*outward<0));
        if(name===backId)assert.ok(path.some(p=>near(p[2],HOME_BACK-.04)&&p[1]>2.9));
      }
    }
    assert.ok(runLessonScenarios(doc).every(step=>step.status==='pass'));
  }
});
