import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Line3,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {prepareBlenderModel,presentBlenderModel} from '../lib/blender-model';
import {getLesson} from '../lib/lessons';
import {heaterFlexEnd,looseHeaterWire} from '../lib/heater-connection';
import {heaterInsulationStart,makeHeaterCopperGeometry} from '../lib/heater-copper';
import {fusedPlatePose,heaterCopperContact,heaterExposedCopper,heaterFlexRoute} from '../lib/fused-heater-site';
import {jobSite} from '../lib/job-site';
import {fusedProbePose} from '../lib/site-meter';
import {siteProbeSegments} from '../lib/site-probe-shape';
import type {CircuitDocument,Vec3} from '../lib/types';

const lesson=getLesson(20)!,base=lesson.circuit,site=jobSite(base),end={component:'fcu-switch',terminal:'LOUT'};
const {fault:type,wire:id,component}=lesson.challenge;
const authored:CircuitDocument={...base,faults:[{wire:id,type,component,looseEnd:end,enabled:true}]};
const vec=(v:Vec3)=>new Vector3(...v);
test('only the identified installed brown core with a marked FCU end can be withdrawn',()=>{
  const wire=looseHeaterWire(authored)!;
  assert.deepEqual(heaterFlexEnd(base,id),end);
  assert.equal(wire.id,id);
  for(const doc of [base,{...authored,lessonId:19},
    {...authored,components:base.components.map(c=>c.id==='fixed'?{...c,variant:undefined}:c)},
    {...authored,components:base.components.map(c=>c.id==='fcu-switch'?{...c,variant:'other'}:c)},
    {...authored,cableRuns:[]}, {...authored,wires:base.wires.filter(w=>w!==wire)}]){
    assert.equal(looseHeaterWire(doc),undefined);
    assert.equal(heaterCopperContact(doc,site,true),undefined);
  }
  for(const change of [{enabled:false},{looseEnd:undefined},{looseEnd:{component:'fixed',terminal:'L'}},
      {type:'overload'},{wire:base.wires.find(w=>w.from.terminal==='NOUT'&&w.from.component===end.component)!.id}]){
    assert.equal(looseHeaterWire({...authored,faults:[{...authored.faults[0],...change}]}),undefined);
  }
  const reverse={...authored,wires:base.wires.map(w=>w===wire?{...w,from:w.to,to:w.from}:w)};
  assert.deepEqual(heaterCopperContact(reverse,site,true)?.position,heaterCopperContact(authored,site,true)?.position);
  assert.equal(heaterCopperContact(authored,site,false),undefined,'closed fitting exposes no copper contact');
  for(const unaffected of authored.wires.filter(w=>w!==wire)){
    assert.deepEqual(heaterFlexRoute(authored,site,unaffected,true),heaterFlexRoute(base,site,unaffected,true));
  }
});

test('two seated study probes touch the real bare strands beside the empty mouth and clear both insulated probes',()=>{
  const {frame,wire}=heaterExposedCopper(authored,site,true)!,fcu=site.items.find(i=>i.id===end.component)!;
  const geometry=makeHeaterCopperGeometry(),material=new MeshBasicMaterial(),metal=new Mesh(geometry,material);
  metal.matrix.copy(frame);metal.matrixAutoUpdate=false;metal.updateMatrixWorld(true);
  const cut=new Vector3().setFromMatrixPosition(frame),insulation=vec(heaterInsulationStart(frame)),length=cut.distanceTo(insulation);
  assert.ok(Math.abs(length-.0055)<1e-9,'stripped length matches the 851 copper inside the real model mouth');
  const route=heaterFlexRoute(authored,site,wire,true)!,healthy=heaterFlexRoute(base,site,wire,true)!;
  assert.ok(cut.distanceTo(vec(route[0]))<1e-8&&cut.distanceTo(vec(healthy[0]))>.01);
  const samples=(point:{position:Vec3;approach:Vec3})=>siteProbeSegments.flatMap(s=>{
    const n=Math.ceil((s.end-s.start)/1);
    return Array.from({length:n+1},(_,i)=>({p:vec(point.position).addScaledVector(vec(point.approach),(s.start+(s.end-s.start)*i/n)/1000),
      r:(s.base+(s.top-s.base)*i/n)/1000}));
  });
  const copperProbes=[false,true].map(second=>{
    const contact=heaterCopperContact(authored,site,true,second)!;
    const p=vec(contact.position),dir=vec(contact.approach);
    const hit=new Raycaster(p.clone().addScaledVector(dir,.02),dir.clone().negate()).intersectObject(metal)[0];
    assert.ok(hit&&hit.point.distanceTo(p)<.00002,'tip lands on the strand surface within 0.02 mm');
    const body=samples(contact);
    const flexSkin=new Line3(insulation,vec(route[1])),nearest=new Vector3();
    for(const sample of body){
      assert.ok(flexSkin.closestPointToPoint(sample.p,true,nearest).distanceTo(sample.p)>sample.r+.00105,'clear of brown insulation');
    }
    return body;
  });
  // Two probes on the loose wire or one on the wire and one on LOAD L.
  const plate=base.components.find(c=>c.id===fcu.id)!;
  const screws=['LOUT','NOUT','LIN','NIN','PE','PE2'].map(id=>samples(fusedProbePose(fcu,plate,id)!));
  for(const other of [copperProbes[1],...screws]){
    for(const a of copperProbes[0])for(const b of other){
      assert.ok(a.p.distanceToSquared(b.p)>(a.r+b.r)**2,'separate probe grips along their entire profile');
    }
  }
  geometry.dispose();material.dispose();
});
test('the two measured landings on the free core are accessible past all metal and plastic on both fitted 851 assets',async()=>{
  const item=site.items.find(i=>i.id===end.component)!,component=base.components.find(c=>c.id===item.id)!;
  const pose=fusedPlatePose(item,true);
  for(const suffix of ['', '.low']){
    const bytes=readFileSync(new URL('../public/models/fcu_default'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const part=prepareBlenderModel(scene,Boolean(suffix));
    presentBlenderModel(part,'normal',component,undefined,undefined,'LIN NIN NOUT PE PE2');
    part.scene.position.set(...pose.position);part.scene.rotation.y=pose.rotation;part.scene.scale.setScalar(item.scale);
    part.scene.updateMatrixWorld(true);
    const meshes:Mesh[]=[];part.scene.traverseVisible(n=>{if(n instanceof Mesh)meshes.push(n);});
    for(const alt of [false,true]){
      const contact=heaterCopperContact(authored,site,true,alt)!,point=vec(contact.position),axis=vec(contact.approach);
      const side=axis.clone().cross(new Vector3(0,1,0)).normalize(),across=axis.clone().cross(side);
      for(const s of siteProbeSegments)for(let i=0;i<12;i++){
        const radial=side.clone().multiplyScalar(Math.cos(i*Math.PI/6)).addScaledVector(across,Math.sin(i*Math.PI/6));
        const surface=(distance:number,radius:number)=>point.clone().addScaledVector(axis,distance*.001).addScaledVector(radial,radius*.001);
        const a=surface(s.start,s.base),b=surface(s.end,s.top).sub(a);
        const hit=new Raycaster(a,b.clone().normalize(),0,b.length()).intersectObjects(meshes,false)[0];
        assert.ok(!hit,'obstruction for loose copper probe on '+(suffix||'full')+': '+hit?.object.name);
      }
    }
    for(const mat of part.owned)mat.dispose();
  }
});
