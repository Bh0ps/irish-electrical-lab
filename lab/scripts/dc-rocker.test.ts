import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Box3,CatmullRomCurve3,Raycaster,TubeGeometry,Vector3,type Material,type Mesh} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {COMPONENTS,definitionFor} from '../lib/components';
import {connectedRockerTerminals,looseRockerPose,rockerBladeY,rockerLooseConnector,rockerProbeApproach,rockerProbeContact,rockerProbeTerminal,rockerWireEntry} from '../lib/dc-rocker';
import {worktopLooseEnd} from '../lib/worktop-connector';
import {installedEnd,installedWireRoute} from '../lib/house-installation';
import {jobSite} from '../lib/job-site';
import {rockerPose} from '../lib/kitchen-lighting';
import {fixturePoint} from '../lib/site-fixtures';
import {equipmentAsset,equipmentReferences} from '../lib/equipment-assets';
import {getLesson} from '../lib/lessons';
import {auditRoutes,probeContact,routeCircuit,terminalPosition} from '../lib/routing';
import {simulate} from '../lib/simulation';
import {validateCircuit} from '../lib/storage';
import {getComponentTerminals} from '../lib/terminal-layout';
import type {Endpoint,Vec3} from '../lib/types';

const original=getLesson(66)!.circuit;
const sw=original.components.find(c=>c.id==='right-switch')!;
const keys=['COM','OUT'];
const source=(file:string)=>new URL('../public/models/switch_dc-rocker'+file+'.glb',import.meta.url);
const bladeMaterial=(material:Material|Material[])=>!Array.isArray(material)&&material.name==='Plated male blade';

test('the new worktop example uses two rated DC rockers and keeps previous switches and saved wiring intact',()=>{
  const switches=original.components.filter(c=>c.type==='switch');
  assert.deepEqual(switches.map(c=>c.variant),['dc-rocker','dc-rocker']);
  const def=definitionFor(sw);
  assert.match(def.abstraction!,/10 A at 28 V DC/);
  assert.deepEqual(getComponentTerminals(sw,def).map(t=>[t.id,t.label,t.role]),[['COM','2','DC+'],['OUT','1','DC+']]);
  const refs=equipmentReferences(sw,def).map(r=>r.url),{allowedReference}=createRequire(import.meta.url)('../desktop/app/security.cjs');
  assert.equal(refs.length,2);assert.ok(refs.every(allowedReference));
  assert.equal(allowedReference('https://www.switchcomp.com/unrelated'),false);
  const legacy=structuredClone(original);
  for(const item of legacy.components.filter(c=>c.type==='switch'))delete item.variant;
  const restored=validateCircuit(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(restored.wires,validateCircuit(original).wires);
  assert.equal(equipmentAsset(restored.components.find(c=>c.id===sw.id)!,COMPONENTS.switch)?.galleryKey,'switch:single-rocker');
  for(const example of [original,restored]){
    for(const left of [true,false])for(const right of [true,false]){
      const doc=structuredClone(example);
      doc.components.find(c=>c.id==='left-switch')!.params.closed=left;
      doc.components.find(c=>c.id==='right-switch')!.params.closed=right;
      const result=simulate(doc);
      assert.equal(result.converged,true);
      assert.equal(result.deviceStates.left.energized,left);
      assert.equal(result.deviceStates.right.energized,right);
    }
  }
});

test('both GLBs expose a selectable rocker, the real numbered rear blades and independently fitted push-on terminals',async()=>{
  for(const suffix of ['', '.low']){
    const bytes=readFileSync(source(suffix)),loader=new GLTFLoader();
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const model=prepareBlenderModel(scene,suffix==='.low');
    const hits=(at:Vector3,direction:Vector3)=>new Raycaster(at,direction).intersectObject(model.scene,true);
    for(const connected of ['', 'COM', 'OUT', 'COM OUT']){
      presentBlenderModel(model,'normal',sw,undefined,undefined,connected);
      model.scene.updateMatrixWorld(true);
      assert.deepEqual(model.receptacles.filter(r=>r.node.visible).map(r=>r.terminal).sort(),connected.split(' ').filter(Boolean));
      const front=hits(new Vector3(0,.48,2),new Vector3(0,0,-1))[0];
      assert.equal(semanticOwner(front.object).part,'actuator','click on the working face');
      for(const key of keys){
        const shoulder=new Vector3(...rockerProbeContact(key)),normal=new Vector3(...rockerProbeApproach);
        const touch=hits(shoulder.clone().addScaledVector(normal,.36),normal.clone().negate())[0];
        assert.equal(semanticOwner(touch.object).terminal,key);
        assert.ok(model.meshes.some(m=>m.node===touch.object&&bladeMaterial(m.material)));
        assert.ok(touch.point.distanceTo(shoulder)<.0015,suffix+'/'+key+' probe lands on exposed metal, clear of the connector and the other blade');
        const blade=model.meshes.filter(m=>semanticOwner(m.node).terminal===key&&bladeMaterial(m.material));
        assert.ok(blade.length);
        const box=blade.reduce((b,m)=>b.union(new Box3().setFromObject(m.node,true)),new Box3());
        assert.ok(Math.abs(box.min.z+.7725)<.003 && Math.abs(box.getCenter(new Vector3()).y-rockerBladeY(key))<.001);
        if(connected.includes(key)){
          const sleeve=model.receptacles.find(r=>r.terminal===key)!.node;
          assert.ok(Math.abs(new Box3().setFromObject(sleeve,true).min.z-rockerWireEntry(key)[2])<.002);
        }
      }
      const cap=model.motions.find(m=>m.node.userData.partId==='actuator')!;
      animateBlenderModel(model,sw,undefined,.04,true);const on=cap.node.quaternion.clone();
      animateBlenderModel(model,{...sw,params:{...sw.params,closed:false}},undefined,.04,true);
      assert.ok(on.angleTo(cap.node.quaternion)>.3);
    }
    for(const m of model.owned)m.dispose();
  }
});

test('wired blades keep their independent sleeves, axial wire entry and a clear side approach at every bench rotation',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    const doc=structuredClone(original),item=doc.components.find(c=>c.id===sw.id)!;
    item.rotation=yaw;
    const plan=routeCircuit(doc);
    assert.deepEqual(auditRoutes(doc,plan),[]);
    assert.equal(connectedRockerTerminals(item,doc.wires),'COM OUT');
    for(const key of keys){
      const e:Endpoint={component:sw.id,terminal:key};
      const same=(p:Endpoint)=>p.component===e.component&&p.terminal===key;
      const w=doc.wires.find(w=>same(w.from)||same(w.to))!;
      const saved=doc.wires.filter(other=>other.id!==w.id);
      assert.equal(connectedRockerTerminals(item,saved),key==='COM'?'OUT':'COM');
      assert.equal(connectedRockerTerminals(item,[...saved,w]),'COM OUT');
      const axial=(p:Vec3)=>new Vector3(...p).applyAxisAngle(new Vector3(0,1,0),yaw).add(new Vector3(...item.position));
      const path=[...plan.routes.get(w.id)!];if(same(w.to))path.reverse();
      const tip=terminalPosition(doc,e),exit=rockerWireEntry(key);
      assert.deepEqual(tip,path[0]);assert.ok(new Vector3(...path[1]).distanceTo(axial([exit[0],exit[1],exit[2]-.075]))<1e-6);
      assert.ok(new Vector3(...probeContact(doc,e).position).distanceTo(axial(rockerProbeContact(key)))<1e-6);
    }
  }
});

test('the disconnected crimp remains on its wire, exposes the stationary tab, and seats again in both RG1 meshes',async()=>{
  const vec=(p:Vec3)=>new Vector3(...p);
  for(const suffix of ['','.low']){
    const bytes=readFileSync(source(suffix)),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const m=prepareBlenderModel(scene,!!suffix),output=m.receptacles.find(c=>c.terminal==='OUT')!.node,input=m.receptacles.find(c=>c.terminal==='COM')!.node;
    const show=(loose?:string)=>{
      presentBlenderModel(m,'normal',sw,undefined,undefined,'COM OUT',false,loose);m.scene.updateMatrixWorld(true);
    };
    show();
    const seated=output.matrixWorld.clone(),first=input.matrixWorld.clone();
    const barrelEnd=vec(rockerWireEntry('OUT')).applyMatrix4(seated.clone().invert());
    const terminal=m.meshes.find(e=>semanticOwner(e.node).terminal==='OUT'&&bladeMaterial(e.material))!.node;
    const stationary=terminal.matrixWorld.clone(),blade=new Box3().setFromObject(terminal,true);
    assert.ok(blade.intersectsBox(new Box3().setFromObject(output,true)),'seated contact overlaps the tab');
    for(const loose of [true,false,true]){
      show(loose?'OUT':undefined);
      assert.deepEqual(input.matrixWorld,first);assert.deepEqual(terminal.matrixWorld,stationary);
      assert.ok(barrelEnd.clone().applyMatrix4(output.matrixWorld).distanceTo(vec(rockerWireEntry('OUT',loose)))<1e-5);
      if(loose){
        const free=new Box3().setFromObject(output,true);
        assert.ok(free.min.x-blade.max.x>.09,'over 3.6 mm of side clearance between the separated metals');
      }else assert.deepEqual(output.matrixWorld,seated);
      for(const clip of [input,output])clip.traverse(n=>{
        const mesh=n as Mesh;if(!mesh.isMesh||Array.isArray(mesh.material))return;
        const id=clip.userData.matingBlade,moved=loose&&id==='OUT';
        assert.equal(rockerLooseConnector(mesh),moved?'OUT':undefined);
        assert.equal(rockerProbeTerminal(mesh,mesh.material.name),!moved&&mesh.material.name==='Tinned push-on tab spring'?id:undefined);
      });
      const shoulder=vec(rockerProbeContact('OUT')),approach=vec(rockerProbeApproach);
      const hit=new Raycaster(shoulder.clone().addScaledVector(approach,.35),approach.negate()).intersectObject(m.scene,true)[0];
      const mesh=hit.object as Mesh;assert.ok(!Array.isArray(mesh.material));
      assert.equal(rockerProbeTerminal(mesh,mesh.material.name),'OUT');assert.equal(rockerLooseConnector(mesh),undefined);
      assert.ok(hit.point.distanceTo(shoulder)<.0015);
    }
    // Test the eight-sided swept tube actually drawn in the installed room.
    // Both the pulled-out lead and the coil stowed in the box must clear the switch.
    const lesson=getLesson(66)!,w=original.wires.find(w=>w.id===lesson.challenge.wire)!;
    const doc={...original,faults:[{type:lesson.challenge.fault,wire:w.id,enabled:true}]};
    const site=jobSite(doc),item=site.items.find(i=>i.id===sw.id)!,end=worktopLooseEnd(doc,w)!;
    const meshes=m.meshes.filter(e=>e.node.visible).map(e=>e.node);
    for(const open of [false,true]){
      const pose=rockerPose(item.position,open),route=installedEnd(doc,site,end,open?sw.id:undefined,w)!.lead!;
      const local=route.map(p=>vec(p).sub(vec(pose.position)).applyAxisAngle(new Vector3(0,1,0),-pose.rotation).divideScalar(item.scale));
      const rings=Math.max(24,route.length*8),tube=new TubeGeometry(new CatmullRomCurve3(local),rings,.0008/item.scale,8,false);
      const vertices=tube.attributes.position,box=new Box3().setFromObject(m.scene,true);
      for(let i=0;i<rings;i++)for(let j=0;j<8;j++){
        const a=new Vector3().fromBufferAttribute(vertices,i*9+j),b=new Vector3().fromBufferAttribute(vertices,(i+1)*9+j);
        if(!box.intersectsBox(new Box3().setFromPoints([a,b])))continue;
        const dir=b.sub(a),length=dir.length();
        const hit=new Raycaster(a,dir.normalize(),.0002,length).intersectObjects(meshes,false)[0];
        assert.equal(hit?.object.name,undefined,'insulated wire crosses the '+(open?'withdrawn':'stowed')+' switch at '+i+','+j);
      }
      tube.dispose();
    }
    presentBlenderModel(m,'normal',sw,undefined,undefined,'COM',false,'OUT');assert.equal(output.visible,false);
    for(const mat of m.owned)mat.dispose();
  }
});

test('the installed fault moves the wire barrel and its actual trace together, with either wire direction',()=>{
  const lesson=getLesson(66)!,site=jobSite(original),item=site.items.find(c=>c.id===sw.id)!;
  const source=original.wires.find(w=>w.id===lesson.challenge.wire)!;
  const fault={type:lesson.challenge.fault,wire:source.id,enabled:true};
  for(const reverse of [false,true]){
    const wire=reverse?{...source,from:source.to,to:source.from}:source;
    const doc={...original,faults:[fault],wires:original.wires.map(w=>w.id===wire.id?wire:w)};
    const end=worktopLooseEnd(doc,wire)!;assert.deepEqual(end,{component:sw.id,terminal:'OUT'});
    const lengths:number[]=[];
    for(const open of [false,true]){
      const access=open?sw.id:undefined,pose=rockerPose(item.position,open),loc=installedEnd(doc,site,end,access,wire)!;
      const expected=fixturePoint(pose.position,item.scale,item.fixture,sw,rockerWireEntry(end.terminal,true),pose.rotation);
      assert.deepEqual(loc.pin,expected);assert.deepEqual(loc.lead![0],expected);
      const next=new Vector3(...loc.lead![1]).sub(new Vector3(...expected)).normalize();
      const yaw=pose.rotation+looseRockerPose.yaw;
      assert.ok(next.distanceTo(new Vector3(-Math.sin(yaw),0,-Math.cos(yaw)))<1e-5,'wire leaves its own crimp axially');
      const route=installedWireRoute(doc,site,wire,access)!;
      assert.deepEqual(wire.from.component===sw.id?route[0]:route.at(-1),expected);
      assert.deepEqual(installedWireRoute({...doc,faults:[]},site,wire,access),installedWireRoute(original,site,wire,access));
      for(const other of doc.wires.filter(w=>w.id!==wire.id)){
        assert.deepEqual(installedWireRoute(doc,site,other,access),installedWireRoute(original,site,other,access));
      }
      const input=doc.wires.find(w=>[w.from,w.to].some(e=>e.component===sw.id&&e.terminal==='COM'))!;
      const line=installedEnd(doc,site,{component:sw.id,terminal:'COM'},access,input)!.lead!;
      const curve=(lead:Vec3[])=>new CatmullRomCurve3(lead.map(p=>new Vector3(...p)));
      const outgoing=curve(loc.lead!);lengths.push(outgoing.getLength());
      const first=curve(line).getSpacedPoints(1200),second=outgoing.getSpacedPoints(1200);
      let distance=Infinity;
      for(const a of first)for(const b of second)distance=Math.min(distance,a.distanceToSquared(b));
      assert.ok(Math.sqrt(distance)>.002,'clearance beyond two 0.8 mm radii, including between samples');
    }
    assert.ok(Math.abs(lengths[0]-lengths[1])<.002,'opening the panel draws out the same service slack');
  }
});
