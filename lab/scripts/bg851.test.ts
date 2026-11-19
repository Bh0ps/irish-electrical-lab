import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Line3,Mesh,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {fcuProbeContact,fcuProbeScrew} from '../lib/bg851';
import {describeEndpoint} from '../lib/endpoint-description';
import {getLesson} from '../lib/lessons';
import {probeContact,routeCircuit,terminalPosition} from '../lib/routing';
import {simulate} from '../lib/simulation';
import {connectedRockerTerminals} from '../lib/wall-rocker';
import {siteProbeSegments} from '../lib/site-probe-shape';
import {fusedIncomingLead,fusedPlatePose,gripEnd,heaterFlexPath,heaterFlexRoute} from '../lib/fused-heater-site';
import {jobSite} from '../lib/job-site';
import type {CircuitDocument,Vec3} from '../lib/types';

const doc=getLesson(20)!.circuit,item=doc.components.find(c=>c.type==='fcu')!;
const vec=(p:Vec3)=>new Vector3(...p),rear=new Vector3(0,0,-1),up=new Vector3(0,1,0);
const marks={LIN:'L · IN',NIN:'N · IN',LOUT:'L · LOAD',NOUT:'N · LOAD',PE:'E',PE2:'E2'};
const circuit=JSON.stringify(doc);
test('both original BG 851 meshes expose the marked mouths, metal screw heads and usable lower flex passage',async()=>{
  for(const suffix of ['', '.low']){
    const bytes=readFileSync(new URL('../public/models/fcu_default'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const m=prepareBlenderModel(scene,suffix!==''),standalone={...item,position:[0,0,0] as Vec3,rotation:0};
    const local={...doc,components:doc.components.map(c=>c.id===item.id?standalone:c)};
    const visible:Mesh[]=[];
    const cast=(from:Vector3,dir:Vector3,far=Infinity)=>new Raycaster(from,dir,0,far).intersectObjects(visible,false)[0];
    for(const wired of ['', Object.keys(marks).join(' ')]){
      presentBlenderModel(m,'normal',standalone,undefined,undefined,wired);m.scene.updateMatrixWorld(true);
      visible.length=0;m.scene.traverseVisible(n=>{if(n instanceof Mesh)visible.push(n);});
      assert.deepEqual(m.receptacles.filter(p=>p.node.visible).map(p=>p.terminal).sort(),wired.split(' ').filter(Boolean).sort());
      for(const [terminal,label] of Object.entries(marks)){
        const end={component:item.id,terminal};
        assert.equal(describeEndpoint(doc,end)?.pointLabel,label);
        for(const second of [false,true]){
          const contact=fcuProbeContact(terminal,second)!;
          const axis=vec(contact.approach),tip=vec(contact.position);
          const screw=cast(tip.clone().addScaledVector(axis,1.1),axis.clone().negate());
          assert.ok(screw,'unobstructed rear contact '+terminal);
          const steel=(screw.object as Mesh).material;
          assert.ok(!Array.isArray(steel));
          assert.equal(fcuProbeScrew(screw.object,steel.name),terminal,terminal+' screw hit '+screw.object.name);
          assert.ok(screw.point.distanceTo(tip)<.0012,terminal+' metal lands within 0.12 mm of the tip');
          if(wired){
            // Trace the actual guard and shaft envelope, not just the centre ray.
            const side=new Vector3().crossVectors(axis,up).normalize(),side2=new Vector3().crossVectors(axis,side);
            for(const section of siteProbeSegments)for(let i=0;i<16;i++){
              const radial=side.clone().multiplyScalar(Math.cos(i*Math.PI/8)).addScaledVector(side2,Math.sin(i*Math.PI/8));
              const edge=(distance:number,radius:number)=>tip.clone().addScaledVector(axis,distance*.01).addScaledVector(radial,radius*.01);
              const a=edge(section.end,section.top),b=edge(Math.max(.08,section.start),section.base).sub(a);
              const part=cast(a,b.clone().normalize(),b.length());
              if(part){
                const material=(part.object as Mesh).material;assert.ok(!Array.isArray(material));
                assert.equal(fcuProbeScrew(part.object,material.name),terminal,'obstruction at '+terminal+' '+part.object.name);
              }
            }
          }
        }
        const entry=vec(terminalPosition(local,end));const mouth=cast(entry.clone().addScaledVector(rear,.25),rear.clone().negate());
        assert.equal(semanticOwner(mouth.object).terminal,terminal,terminal+' wire entry hit '+mouth.object.name);
        const mat=(mouth.object as Mesh).material;assert.ok(!Array.isArray(mat));
        assert.equal(fcuProbeScrew(mouth.object,mat.name),undefined,'conductor entry is distinct from the test screw');
        if(wired)assert.equal(mat.name,'851 seated wire copper');
        else {assert.notEqual(mat.name,'851 seated wire copper');assert.ok(mouth.point.z>entry.z+.025,'empty cable throat '+terminal);}
        const front=cast(new Vector3(entry.x,entry.y,.75),rear);
        assert.notEqual(semanticOwner(front.object).part,'terminals','no rear hardware on front plate');
        assert.equal(fcuProbeScrew(front.object,'Zinc plated steel'),undefined,'visible fixing hardware cannot be selected as a test screw');
      }
    }
    // Sample a 6.4 mm diameter round flex through the knockout and cord grip.
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,src=new Vector3(-.160+.0318*Math.cos(a),-.03,.050+.0318*Math.sin(a));
      const hit=cast(src,up);
      assert.ok(!hit||hit.point.y>.204,'flex crosses the lower edge and both sides of its grip, obstruction '+hit?.object.name+' at '+hit?.point.y);
    }
    const flange=cast(new Vector3(-.212,-.1,.05),up);
    assert.equal(semanticOwner(flange.object).part,'cover','intact lower edge beside the knockout');
    for(const mat of m.owned)mat.dispose();
  }
});

test('both probe bodies clear the withdrawn fitting’s wires and one another, including on the same screw',()=>{
  const {challenge}=getLesson(20)!;
  const faulty:CircuitDocument={...doc,faults:[{wire:challenge.wire,type:challenge.fault,enabled:true,looseEnd:{component:item.id,terminal:'LOUT'}}]};
  const site=jobSite(doc),fcu=site.items.find(i=>i.id===item.id)!,heater=site.items.find(i=>i.id==='fixed')!;
  const pose=fusedPlatePose(fcu,true);
  const localMM=(p:Vec3)=>vec(p).sub(vec(pose.position)).applyAxisAngle(up,-pose.rotation).multiplyScalar(1000);
  const segmentsFor=(d:CircuitDocument)=>{
    const paths=[{points:[gripEnd(fcu,true),...heaterFlexPath(fcu,heater,true)],radius:3.2}];
    for(const wire of d.wires){
      const path=heaterFlexRoute(d,site,wire,true);
      if(path)paths.push({points:(wire.from.component===fcu.id?path:[...path].reverse()).slice(0,6),radius:1.05});
      else{
        const supply=fusedIncomingLead(d,fcu,wire,true);
        if(supply)paths.push({points:supply,radius:1.1});
      }
    }
    return paths.flatMap(({points,radius})=>points.slice(1).map((p,i)=>({line:new Line3(localMM(points[i]),localMM(p)),radius})));
  };
  const wires=[...segmentsFor(doc),...segmentsFor(faulty)],nearest=new Vector3();
  const tools=Object.keys(marks).flatMap(id=>[false,true].map(second=>{
    const contact=fcuProbeContact(id,second)!,tip=vec(contact.position).multiplyScalar(100),axis=vec(contact.approach);
    const samples=siteProbeSegments.flatMap(({start,end,base,top})=>{
      const count=Math.ceil((end-start)/.5);
      return Array.from({length:count+1},(_,i)=>({p:tip.clone().addScaledVector(axis,start+(end-start)*i/count),r:base+(top-base)*i/count}));
    });
    for(const {p,r} of samples)for(const {line,radius} of wires){
      assert.ok(line.closestPointToPoint(p,true,nearest).distanceTo(p)>r+radius+.3,'metal and insulation clear the fitted wiring at '+id);
    }
    return {samples,id,second};
  }));
  for(const [i,a] of tools.entries())for(const b of tools.slice(i+1)){
    if(a.id!==b.id&&(a.second||b.second))continue;
    for(const s of a.samples)for(const t of b.samples){
      assert.ok(s.p.distanceToSquared(t.p)>(s.r+t.r+.5)**2,'both grips clear at '+[a.id,b.id]);
    }
  }
  assert.equal(fcuProbeContact('__proto__'),undefined);
});

test('the fuse stays with its captive drawer, while the flag follows the physical rocker even after a trip',async()=>{
  for(const suffix of ['', '.low']){
    const b=readFileSync(new URL('../public/models/fcu_default'+suffix+'.glb',import.meta.url));const {scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
    const m=prepareBlenderModel(scene,suffix!==''),state=simulate(doc).deviceStates[item.id];
    const drawer=m.covers.find(d=>d.node.userData.captiveFcuCarrier)!;
    const rocker=m.motions.find(s=>s.node.userData.partId==='actuator')!;
    assert.ok(drawer&&rocker);
    let clickedAngle=0,closedPosition:Vector3|undefined;
    for(const rating of [3,5,13,9]){
      const c={...item,params:{...item.params,rating,closed:true}};
      for(const view of ['normal','open','exploded','normal'] as const){
        presentBlenderModel(m,view,c,{...state,closed:false,tripped:true});animateBlenderModel(m,c,{...state,closed:false,tripped:true},0,true);m.scene.updateMatrixWorld(true);
        const pos=drawer.node.getWorldPosition(new Vector3());
        if(!closedPosition)closedPosition=pos;
        assert.ok(Math.abs(pos.z-closedPosition.z-(view==='normal'?0:.132))<.0001);
        assert.equal(m.fuseMarkings.filter(n=>n.node.visible).length,rating===9?0:1);
        if(rating!==9)assert.equal(m.fuseMarkings.find(n=>n.node.visible)!.amps,rating);
        assert.equal(rocker.current,rocker.node.userData.onAngle);
        clickedAngle=rocker.current;
      }
      const released={...c,params:{...c.params,closed:false}};
      animateBlenderModel(m,released,{...state,closed:false,tripped:false},0,true);assert.notEqual(rocker.current,clickedAngle);
    }
    const cap=m.meshes.filter(e=>e.material instanceof Object&&!Array.isArray(e.material)&&e.material.name==='BS1362 nickel end cap');
    const size=cap.reduce((box,n)=>box.union(new Box3().setFromObject(n.node,true)),new Box3()).getSize(new Vector3());
    assert.ok(Math.abs(size.y-.254)<.001&&Math.abs(size.x-.063)<.001,'25.4 mm x 6.3 mm BS1362 cartridge');
    for(const mat of m.owned)mat.dispose();
  }
  for(const rotation of [0,.59,Math.PI/2,Math.PI]){
    const d={...doc,components:doc.components.map(c=>c.id===item.id?{...item,rotation}:c)};
    for(const pin of Object.keys(marks))for(const second of [false,true]){
      const end={component:item.id,terminal:pin},contact=fcuProbeContact(pin,second)!,probe=probeContact(d,end,second);
      assert.ok(vec(probe.position).distanceTo(vec(contact.position).applyAxisAngle(up,rotation).add(vec(item.position)))<1e-8);
      assert.ok(probe.approach&&vec(probe.approach).distanceTo(vec(contact.approach).applyAxisAngle(up,rotation))<1e-8);
      assert.ok(vec(probe.normal).distanceTo(vec(contact.normal).applyAxisAngle(up,rotation))<1e-8);
      assert.ok(vec(probe.position).distanceTo(vec(terminalPosition(d,end)))>.035);
    }
  }
  const used=connectedRockerTerminals(item,doc.wires)!;
  assert.ok(used.includes('LOUT'));
  const without=doc.wires.filter(w=>![w.from,w.to].some(p=>p.component===item.id&&p.terminal==='LOUT'));
  assert.ok(!connectedRockerTerminals(item,without)?.includes('LOUT'));
  assert.deepEqual(routeCircuit(doc).issues,[]);assert.equal(JSON.stringify(doc),circuit);
});
