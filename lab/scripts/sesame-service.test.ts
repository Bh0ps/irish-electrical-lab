import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {Box3,CatmullRomCurve3,Material,Mesh,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {installedEnd,installedWireRoute} from '../lib/house-installation';
import {jobSite} from '../lib/job-site';
import {getLesson} from '../lib/lessons';
import {sesameProbeContact,sesameProbeScrew,sesameServicePose} from '../lib/sesame-push';
import {siteProbeSegments} from '../lib/site-probe-shape';
import {CROMA_LOOSE_C2} from '../lib/croma-chime';
import type {Vec3} from '../lib/types';

test('both D814 models expose the two unmarked wire screws and keep mounting steel and copper out of the probe picker',async()=>{
  const c=getLesson(72)!.circuit.components.find(c=>c.id==='back')!;
  for(const lod of ['', '.low']){
    const file=await readFile(new URL('../public/models/pushbutton_sesame'+lod+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
    const m=prepareBlenderModel(scene);
    presentBlenderModel(m,'normal',c,undefined,undefined,'COM NO',false,undefined,true);
    m.scene.updateMatrixWorld(true);
    const ray=(p:Vec3,n:Vec3)=>new Raycaster(new Vector3(...p).addScaledVector(new Vector3(...n),.6),new Vector3(...n).negate()).intersectObject(m.scene,true)[0];
    const pick=(hit:ReturnType<typeof ray>)=>{
      const m=(hit.object as Mesh).material as Material|Material[];
      return sesameProbeScrew(hit.object,(Array.isArray(m)?m[hit.face?.materialIndex??0]:m).name);
    };
    const top=ray([0,.55,0],[0,0,1]);
    assert.equal(semanticOwner(top.object).detail,'sesame-plunger');assert.equal(pick(top),undefined);
    for(const id of ['COM','NO']){
      const hook=m.receptacles.find(r=>r.terminal===id)!;
      assert.ok(hook.node.visible);assert.ok(!new Box3().setFromObject(hook.node,true).isEmpty());
      hook.node.traverse(n=>{if(n instanceof Mesh)assert.equal(sesameProbeScrew(n,n.material.name),undefined)});
      for(const second of [false,true]){
        const s=sesameProbeContact(id,second)!,hit=ray(s.position,s.normal);
        assert.equal(pick(hit),id,lod+' '+id+' '+second);
        assert.ok(hit.point.distanceTo(new Vector3(...s.position))<.001);
        assert.equal(pick(ray(s.position,s.approach)),id,'probe clears the carrier at '+id);
      }
    }
    for(const part of ['mounting','cover']){
      assert.ok(m.meshes.some(row=>row.part===part));
      assert.ok(m.meshes.filter(row=>row.part===part).every(row=>!row.node.visible));
    }
    presentBlenderModel(m,'open',c,undefined,undefined,'COM');
    const fixing=ray([0,.55+.427,0],[0,0,1]);
    assert.equal(semanticOwner(fixing.object).part,'mounting');
    assert.equal(pick(fixing),undefined,'wall fixing is steel but is not a wire screw');
    assert.equal(m.receptacles.find(r=>r.terminal==='NO')!.node.visible,false);
  }
});

test('full-size probe grips clear the two service loops and each other at either rear screw',()=>{
  const doc=getLesson(72)!.circuit,site=jobSite(doc);
  const item=site.items.find(c=>c.id==='back')!,pose=sesameServicePose(item,true),up=new Vector3(0,1,0);
  const corePaths=doc.wires.filter(w=>w.from.component==='back'||w.to.component==='back').flatMap(w=>{
    const end=w.from.component==='back'?w.from:w.to;
    const vertices=installedEnd(doc,site,end,'back',w)!.lead!.map(p=>new Vector3(...p));
    return new CatmullRomCurve3(vertices).getSpacedPoints(420);
  });
  const probes=['COM','NO'].flatMap(id=>[false,true].map(second=>{
    const c=sesameProbeContact(id,second)!;
    const tip=new Vector3(...c.position).multiplyScalar(.05).applyAxisAngle(up,pose.rotation).add(new Vector3(...pose.position));
    const axis=new Vector3(...c.approach).applyAxisAngle(up,pose.rotation);
    const surface=siteProbeSegments.flatMap(({start,end,base,top})=>{
      const count=Math.ceil((end-start)/.55);
      return Array.from({length:count+1},(_,i)=>({point:tip.clone().addScaledVector(axis,(start+(end-start)*i/count)*.001),r:(base+(top-base)*i/count)*.001}));
    });
    for(const {point,r} of surface){
      assert.ok(corePaths.every(p=>p.distanceTo(point)>r+.00065+.00010),'probe clears the fitted bell wire at '+id+' '+second);
    }
    return {id,second,surface};
  }));
  for(const [i,a] of probes.entries())for(const b of probes.slice(i+1)){
    if(a.id!==b.id&&(a.second||b.second))continue;
    for(const p of a.surface)for(const q of b.surface)
      assert.ok(p.point.distanceToSquared(q.point)>(p.r+q.r+.00020)**2,'both probes can rest at '+[a.id,b.id]);
  }
});

test('with either D814 off the wall both insulated ends follow the two copper hooks while the wall bore and concealed route stay fixed',()=>{
  const doc=getLesson(72)!.circuit,site=jobSite(doc);
  for(const id of ['front','back']){
    const item=site.items.find(i=>i.id===id)!;
    assert.equal(sesameServicePose(item,false),item);
    const open=sesameServicePose(item,true);
    const dx=open.position[0]-item.position[0],dz=open.position[2]-item.position[2];
    assert.ok(Math.abs(dx*Math.sin(item.rotation)+dz*Math.cos(item.rotation)-.062)<.00001);
    const wired=doc.wires.filter(w=>w.from.component===id||w.to.component===id);
    assert.equal(wired.length,2);
    for(const wire of wired){
      const atFrom=wire.from.component===id,end=atFrom?wire.from:wire.to;
      const fitted=installedEnd(doc,site,end,undefined,wire)!,withdrawn=installedEnd(doc,site,end,id,wire)!;
      assert.ok(new Vector3(...fitted.pin).distanceTo(new Vector3(...withdrawn.pin))>.046);
      assert.deepEqual(withdrawn.chase,fitted.chase);
      assert.deepEqual(fitted.lead!.slice(-2),withdrawn.lead!.slice(-2));
      const normal=installedWireRoute(doc,site,wire)!,service=installedWireRoute(doc,site,wire,new Set([id]))!;
      if(!atFrom){normal.reverse();service.reverse()}
      assert.deepEqual(service[0],withdrawn.pin);assert.deepEqual(normal[0],fitted.pin);
      assert.deepEqual(service.slice(withdrawn.lead!.length-1),normal.slice(fitted.lead!.length-1));
    }
  }
});

test('only the explicitly detached C2 conductor withdraws from its side-entry cage',()=>{
  const lesson=getLesson(72)!,doc=structuredClone(lesson.circuit),site=jobSite(doc);
  const e={component:'chime',terminal:'REAR'},wire=doc.wires.find(w=>[w.from,w.to].some(p=>p.component===e.component&&p.terminal===e.terminal))!;
  doc.faults=[{enabled:true,type:'open-wire',wire:wire.id}];
  const old=installedEnd(doc,site,e,undefined,wire)!;
  assert.equal(old.bareTip,undefined);
  doc.faults[0].looseEnd=e;
  const loose=installedEnd(doc,site,e,undefined,wire)!;
  assert.ok(loose.bareTip);assert.ok(new Vector3(...old.pin).distanceTo(new Vector3(...loose.bareTip))>.0037);
  assert.ok(Math.abs(new Vector3(...loose.pin).distanceTo(new Vector3(...loose.bareTip))-.0068)<1e-8);
  assert.ok(CROMA_LOOSE_C2.tip[0]<.205);
  assert.deepEqual(loose.lead!.slice(-5),old.lead!.slice(-5),'the original rear feed-through remains fixed');
  const added={...wire,id:wire.id+'-other'};doc.wires.push(added);
  assert.deepEqual(installedEnd(doc,site,e,undefined,added),old,'a second lead at the same screw remains seated');
  doc.faults[0].enabled=false;
  assert.deepEqual(installedEnd(doc,site,e,undefined,wire),old,'the restored end enters the original cage');
});
