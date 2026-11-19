import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeBlenderTerminalBatches, prepareBlenderModel, presentBlenderModel, semanticOwner } from '../lib/blender-model';
import type { ComponentInstance } from '../lib/types';

const component: ComponentInstance = { id:'c1', type:'contactor', label:'Contactor', position:[0,0,0], rotation:0, params:{} };

function visibleMeshes(scene:THREE.Group) {
  const visible:THREE.Mesh[]=[];
  scene.traverseVisible(node=>{
    if(node instanceof THREE.Mesh && (Array.isArray(node.material)?node.material:[node.material]).some(m=>m.visible))visible.push(node);
  });
  return visible;
}

function triangleCount(mesh:THREE.Mesh) {
  const g=mesh.geometry, n=g.index?.count??g.getAttribute('position').count;
  return Math.min(n-g.drawRange.start,g.drawRange.count)/3;
}

function sourceDigest(scene:THREE.Group) {
  const hash=createHash('sha256');
  scene.traverse(node=>{
    hash.update(JSON.stringify([node.name,node.parent?.uuid,node.visible,node.position,node.quaternion,node.scale]));
    if(!(node instanceof THREE.Mesh))return;
    const g=node.geometry;
    for(const a of [g.index,g.getAttribute('position'),g.getAttribute('normal')]){
      if(a)hash.update(new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    }
    for(const m of Array.isArray(node.material)?node.material:[node.material])hash.update(m.uuid);
  });
  return hash.digest('hex');
}

test('distance contactor draws fewer meshes and keeps the physical terminal hit, triangle and shared shading',async()=>{
  const buffer=await readFile(new URL('../public/models/contactor_default.low.glb',import.meta.url));
  const source=(await new GLTFLoader().parseAsync(new Uint8Array(buffer).buffer,'')).scene;
  const sourceBefore=sourceDigest(source);
  const sourceMeshes=visibleMeshes(source);
  const original=prepareBlenderModel(source), optimized=prepareBlenderModel(source,true), second=prepareBlenderModel(source,true);
  for(const model of [original,optimized,second])presentBlenderModel(model,'normal',component);
  const before=visibleMeshes(original.scene), after=visibleMeshes(optimized.scene);
  const batches=after.filter(m=>m.userData.terminalBatch);
  assert.ok(batches.length>0 && after.length<before.length);
  assert.equal(after.reduce((n,m)=>n+triangleCount(m),0),before.reduce((n,m)=>n+triangleCount(m),0));
  const originals=new Set(sourceMeshes.map(m=>m.material));
  for(const material of new Set(batches.map(m=>m.material))){
    assert.ok(originals.has(material),'batch uses its immutable source material');
    const triangles=(meshes:THREE.Mesh[])=>meshes.filter(m=>m.material===material).reduce((n,m)=>n+triangleCount(m),0);
    assert.equal(triangles(after),triangles(before),'all triangles retain their material');
  }
  const terminalHits=new Set<string>();
  for(const mesh of before){
    const id=semanticOwner(mesh).terminal;
    if(!id || terminalHits.has(id))continue;
    const g=mesh.geometry, p=g.getAttribute('position'), indices=g.index;
    // Shoot at a real triangle, including recessed clamps that a coarse screen grid would miss.
    for(let i=0;i+2<(indices?.count??p.count);i+=3){
      const vertex=(j:number)=>new THREE.Vector3().fromBufferAttribute(p,indices?.getX(j)??j).applyMatrix4(mesh.matrixWorld);
      const triangle=new THREE.Triangle(vertex(i),vertex(i+1),vertex(i+2));
      const normal=triangle.getNormal(new THREE.Vector3());
      if(!normal.lengthSq())continue;
      const start=triangle.getMidpoint(new THREE.Vector3()).addScaledVector(normal,.0001);
      const ray=new THREE.Raycaster(start,normal.negate(),0,.0002);
      const reference=ray.intersectObject(original.scene,true)[0];
      if(!reference||reference.object!==mesh)continue;
      const found=ray.intersectObject(optimized.scene,true)[0];
      assert.ok(found && found.object instanceof THREE.Mesh);
      assert.equal(semanticOwner(found.object).terminal,id);
      assert.equal(found.object.geometry,mesh.geometry,'ray still reaches the original physical mesh');
      assert.equal(found.faceIndex,reference.faceIndex);
      assert.ok(found.point.distanceTo(reference.point)<1e-8);
      terminalHits.add(id);
      break;
    }
  }
  assert.equal(terminalHits.size,new Set(before.map(m=>semanticOwner(m).terminal).filter(Boolean)).size);
  assert.ok(terminalHits.size>=6,'tested multiple distinct terminals on the contactor');
  assert.deepEqual(visibleMeshes(source),sourceMeshes,'source still renders every original mesh');
  assert.equal(sourceDigest(source),sourceBefore,'preparation and presentation preserve source transforms, meshes and materials');
  const geometries=new Set(batches.map(m=>m.geometry));
  const reused=visibleMeshes(second.scene).filter(m=>m.userData.terminalBatch);
  assert.equal(reused.length,batches.length);
  assert.ok(reused.every(m=>geometries.has(m.geometry)));
  let disposals=0,sourceDisposals=0;
  for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposals++);
  for(const mesh of sourceMeshes)mesh.geometry.addEventListener('dispose',()=>sourceDisposals++);
  for(const model of [original,optimized,second])for(const material of model.owned)material.dispose();
  disposeBlenderTerminalBatches(source);
  disposeBlenderTerminalBatches(source);
  assert.equal(disposals,geometries.size,'releasing the source disposes each cached batch once');
  assert.equal(sourceDisposals,0);
});

test('terminal mesh batching leaves moving, separately hidden and transparent surfaces on their own nodes',()=>{
  const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial(),glass=material.clone();
  glass.transparent=true;glass.opacity=.5;
  const geometry=new THREE.BoxGeometry(.2,.1,.1);
  geometry.clearGroups();
  const add=(parent:THREE.Object3D,id:string,x:number,surface=material)=>{
    const anchor=new THREE.Group();
    anchor.userData.terminalId=id;anchor.position.x=x;parent.add(anchor);
    const mesh=new THREE.Mesh(geometry,surface);
    mesh.name=id+' mesh';anchor.add(mesh);return mesh;
  };
  const fixed=new THREE.Group();fixed.position.set(.1,.4,0);fixed.rotation.z=Math.PI/2;scene.add(fixed);
  add(fixed,'A',-1);add(fixed,'B',1);
  const moving=new THREE.Group();moving.userData.animation='translate';scene.add(moving);add(moving,'moving',2);
  const shield=new THREE.Group();shield.userData.boardShield=true;scene.add(shield);add(shield,'shield',3);
  add(scene,'glass',4,glass);
  const ordinary=prepareBlenderModel(scene), batched=prepareBlenderModel(scene,true);
  presentBlenderModel(ordinary,'normal',component);presentBlenderModel(batched,'normal',component);
  const meshes=visibleMeshes(batched.scene);
  assert.equal(meshes.filter(m=>m.userData.terminalBatch).length,1);
  for(const id of ['moving','shield','glass'])assert.ok(meshes.some(m=>m.name===id+' mesh'),id);
  const batch=meshes.find(m=>m.userData.terminalBatch)!;
  const bounds=new THREE.Box3().setFromObject(batch,true),expected=new THREE.Box3();
  for(const mesh of visibleMeshes(ordinary.scene).filter(m=>['A','B'].includes(semanticOwner(m).terminal??'')))expected.expandByObject(mesh,true);
  assert.ok(bounds.min.distanceTo(expected.min)<1e-6 && bounds.max.distanceTo(expected.max)<1e-6);
  presentBlenderModel(batched,'normal',{...component,params:{frontOff:true}});
  assert.equal(visibleMeshes(batched.scene).some(m=>m.name==='shield mesh'),false);
  const ray=new THREE.Raycaster(new THREE.Vector3(3,0,1),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(batched.scene,true).length,0,'hidden shield cannot be picked');
  presentBlenderModel(batched,'open',component);
  assert.ok(!visibleMeshes(batched.scene).includes(batch));
  for(const id of ['A','B'])assert.equal((batched.scene.getObjectByName(id+' mesh') as THREE.Mesh).material,material);
  presentBlenderModel(batched,'normal',component);
  assert.ok(visibleMeshes(batched.scene).includes(batch),'returning from inspection restores batched drawing');
  for(const model of [ordinary,batched])for(const owned of model.owned)owned.dispose();
  disposeBlenderTerminalBatches(scene);
  geometry.dispose();material.dispose();glass.dispose();
});
