import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Mesh,MeshStandardMaterial,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {DIN_BENCH_LIFT,DIN_UNIT} from '../lib/din-devices';
import {getLesson} from '../lib/lessons';
import {simulate} from '../lib/simulation';
import type {DeviceState} from '../lib/types';

async function device(type:string,suffix:string){
  const file=readFileSync(new URL('../public/models/'+type+'_default'+suffix+'.glb',import.meta.url));
  return (await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'')).scene;
}
function faceRay(xMm:number,yMm:number,meshes:Mesh[]){
  const origin=new Vector3(xMm*DIN_UNIT,DIN_BENCH_LIFT+yMm*DIN_UNIT,1.6);
  const [hit]=new Raycaster(origin,new Vector3(0,0,-1)).intersectObjects(meshes,false);
  assert.ok(hit,'missing physical target at '+[xMm,yMm]);return hit.object as Mesh;
}
function material(mesh:Mesh){
  assert.ok(mesh.material instanceof MeshStandardMaterial);
  return mesh.material;
}

test('each domestic DIN handle presents I below when raised and O above when lowered in both shipped meshes',async()=>{
  const doc=structuredClone(getLesson(2)!.circuit);
  for(const c of doc.components.filter(c=>c.id==='group'||c.id==='branch1')){
    const x=c.type==='rcd'?-8.75:0;
    for(const suffix of ['', '.low']){
      const m=prepareBlenderModel(await device(c.type,suffix),!!suffix);
      for(const closed of [true,false]){
        c.params.closed=closed;
        const s=simulate(doc).deviceStates[c.id];
        presentBlenderModel(m,'normal',c,s);animateBlenderModel(m,c,s,0,true);m.scene.updateMatrixWorld(true);
        const meshes=m.meshes.map(mesh=>mesh.node).filter(node=>node.visible);
        const theta=closed?-.52:.56;
        const grip=faceRay(x,41.1-13.40*Math.sin(theta),meshes);
        assert.deepEqual(semanticOwner(grip),{part:'actuator',detail:'din-paddle'});
        const alpha=closed?-1.285:1.30,markX=x+(closed?0:1.66);
        const y=41.1+8.18*Math.sin(alpha-theta);
        const marking=faceRay(markX,y,meshes);
        assert.equal(material(marking).name,closed?'Raised I marking':'Lowered O marking',c.type+suffix+' visible marking');
        assert.ok(closed?y<41.1:y>41.1);
        const hiddenAngle=closed?1.30:-1.285,hiddenY=41.1+8.18*Math.sin(hiddenAngle-theta);
        assert.notEqual(material(faceRay(x+(closed?1.66:0),hiddenY,meshes)).name,closed?'Lowered O marking':'Raised I marking');
        if(c.type==='rcd'){
          const testKey=faceRay(7.4,52.2,meshes);
          assert.equal(semanticOwner(testKey).part,'test');
          assert.equal(semanticOwner(faceRay(7.5,33.5,meshes)).detail,'residual-trip-window');
        }
      }
      c.params.closed=true;
      m.owned.forEach(mat=>mat.dispose());
    }
  }
});

test('the RCCB shows an open contact on manual OFF, and a separate yellow flag only when the powered residual trip latches',async()=>{
  const doc=structuredClone(getLesson(2)!.circuit),c=doc.components.find(c=>c.id==='group')!;
  const source=await device(c.type,'');
  const a=prepareBlenderModel(source),b=prepareBlenderModel(source);
  const read=(m:typeof a,s:DeviceState)=>{
    presentBlenderModel(m,'normal',c,s);
    const contact=m.meshes.find(mesh=>mesh.contactFlag)!.light!,trip=m.meshes.find(mesh=>mesh.residualTripFlag)!.light!;
    assert.equal(contact.emissive.getHex(),0);assert.equal(trip.emissive.getHex(),0);
    return [contact.color.getHexString(),trip.color.getHexString()];
  };
  let states=simulate(doc).deviceStates;
  assert.deepEqual(read(b,states.group),['b33529','515654']);
  c.params.closed=false;states=simulate(doc,states).deviceStates;
  assert.deepEqual(read(a,states.group),['417f49','515654']);
  c.params.closed=true;c.params.testPressed=true;states=simulate(doc,states).deviceStates;
  assert.equal(states.group.tripped,true);
  assert.deepEqual(read(a,states.group),['417f49','e8b632']);
  assert.equal(b.meshes.find(mesh=>mesh.residualTripFlag)!.light!.color.getHexString(),'515654','clones keep their own indication');
  c.params.testPressed=false;states=simulate(doc,states).deviceStates;
  assert.deepEqual(read(a,states.group),['417f49','e8b632']);
  c.params.resetToken=1;states=simulate(doc,states).deviceStates;
  assert.deepEqual(read(a,states.group),['b33529','515654']);
  doc.supply.enabled=false;c.params.testPressed=true;states=simulate(doc,states).deviceStates;
  assert.deepEqual(read(a,states.group),['b33529','515654']);
  for(const m of [a,b])m.owned.forEach(mat=>mat.dispose());
});
