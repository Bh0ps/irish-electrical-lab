import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Raycaster,Vector3,type Mesh} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateBlenderModel,prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {definitionFor} from '../lib/components';
import {getLesson} from '../lib/lessons';
import {auditRoutes,probeContact,routeCircuit,terminalPosition} from '../lib/routing';
import {simulate} from '../lib/simulation';
import {getComponentTerminals} from '../lib/terminal-layout';
import {bg812Contact,connectedRockerTerminals} from '../lib/wall-rocker';

const doc=getLesson(9)!.circuit,near=doc.components.find(c=>c.id==='near')!;
const before=JSON.stringify(doc);
const v=(arr:number[])=>new Vector3().fromArray(arr);
const bounds=(list:Mesh[])=>list.reduce((box,node)=>box.union(new Box3().setFromObject(node,true)),new Box3());

test('the 812 plate, moving rocker and fixing pitch match the maker’s drawing at full and Economy detail',async()=>{
  for(const suffix of ['', '.low']){
    const bytes=readFileSync(new URL('../public/models/switch2_single-rocker'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const m=prepareBlenderModel(scene,suffix==='.low');
    const hit=(p:Vector3,dir:Vector3)=>new Raycaster(p,dir).intersectObject(m.scene,true)[0];
    const labelled=getComponentTerminals(near,definitionFor(near));
    assert.deepEqual(labelled.map(t=>[t.id,t.label.split(' ')[0]]),[['COM','COM'],['T1','L1'],['T2','L2']]);
    for(const terminal of ['', 'COM','T1','T2','COM T1 T2']){
      presentBlenderModel(m,'normal',near,undefined,undefined,terminal);animateBlenderModel(m,near,undefined,0,true);m.scene.updateMatrixWorld(true);
      const attached=m.receptacles.filter(end=>end.node.visible).map(end=>end.terminal).sort();
      assert.deepEqual(attached,terminal?terminal.split(' '):[]);
      const face=bounds(m.meshes.filter(s=>s.part==='cover').map(s=>s.node)).getSize(new Vector3());
      assert.ok(Math.abs(face.x-.86)<.002&&Math.abs(face.y-.86)<.002);
      const cap=bounds(m.meshes.filter(s=>s.part==='actuator').map(s=>s.node)).getSize(new Vector3());
      assert.ok(Math.abs(cap.x-.136)<.002&&Math.abs(cap.y-.270)<.003,'narrow rocker seated in matching reveal');
      const depth=bounds(m.meshes.filter(s=>s.node.visible).map(s=>s.node)).getSize(new Vector3()).z;
      assert.ok(Math.abs(depth-.233)<.0035,'complete 23.3 mm side profile');
      for(const x of [-.3015,.3015])assert.equal(semanticOwner(hit(new Vector3(x,.651,1),new Vector3(0,0,-1)).object).detail,'faceplate-fixing');
      assert.equal(semanticOwner(hit(new Vector3(0,.651,1),new Vector3(0,0,-1)).object).part,'actuator');
      for(const t of labelled){
        const at=bg812Contact(t.id)!,dir=v(at.normal);
        const screw=hit(v(at.position).addScaledVector(dir,.55),dir.clone().negate());
        assert.equal(semanticOwner(screw.object).terminal,t.id);
        assert.ok(screw.point.distanceTo(v(at.position))<.0008,'probe touches the head at the end of the case');
        const rear=hit(v(t.anchor).add(new Vector3(0,0,-.17)),new Vector3(0,0,1));
        if(terminal.split(' ').includes(t.id)){
          assert.equal(semanticOwner(rear.object).terminal,t.id);
          const material=(rear.object as Mesh).material;
          assert.ok(!Array.isArray(material)&&material.name==='BG812 stripped solid copper');
          assert.ok(rear.point.z>=t.anchor[2]&&rear.point.z<t.anchor[2]+.002,'no bare tail projects behind the case');
        }
      }
    }
    for(const [x,y] of [[-.077,.897],[.090,.897],[.006,.450]]){
      const fixed=semanticOwner(hit(new Vector3(x,y,-1),new Vector3(0,0,1)).object);
      assert.equal(fixed.detail,'switch-case-fixings');assert.equal(fixed.terminal,undefined);
    }
    const moving=m.motions.find(m=>m.node.name.startsWith('Moving_strapper_tongue'))!;
    assert.ok(moving);
    const tip=m.meshes.find(s=>s.node.name.startsWith('Moving_silver_contact'))!.node;
    presentBlenderModel(m,'cutaway',near);
    for(const position of [0,1]){
      animateBlenderModel(m,{...near,params:{...near.params,position}},undefined,0,true);m.scene.updateMatrixWorld(true);
      const contact=bounds([tip]).getCenter(new Vector3());
      assert.ok(position===0?contact.x<-.038:contact.x>.038,'moving tongue reaches the selected fixed strapper');
      assert.equal(tip.visible,true);
    }
    m.owned.forEach(mat=>mat.dispose());
  }
});

test('each stair switch retains independent wire seats, screw probes and two-way circuit operation',()=>{
  assert.equal(connectedRockerTerminals(near,doc.wires),'COM T1 T2');
  for(const id of ['COM','T1','T2']){
    const ep={component:'near',terminal:id};
    const contains=(e:typeof ep)=>e.component===ep.component&&e.terminal===id;
    const wire=doc.wires.find(w=>contains(w.from)||contains(w.to))!;
    const remaining=doc.wires.filter(w=>w.id!==wire.id);
    assert.equal(connectedRockerTerminals(near,remaining)?.includes(id),false);
    assert.equal(connectedRockerTerminals(near,[...remaining,wire]),'COM T1 T2');
    for(const angle of [0,.5,Math.PI/2,Math.PI]){
      const rotated={...doc,components:doc.components.map(c=>c.id==='near'?{...c,rotation:angle}:c)};
      const screw=probeContact(rotated,ep),mouth=terminalPosition(rotated,ep);
      const expected=v(bg812Contact(id)!.position).applyAxisAngle(new Vector3(0,1,0),angle).add(v(near.position));
      assert.ok(v(screw.position).distanceTo(expected)<1e-8);
      assert.ok(v(mouth).distanceTo(expected)>.08,'a seated wire leaves access to the end screw');
      const routed=routeCircuit(rotated),points=[...routed.routes.get(wire.id)!];
      if(wire.to.component===near.id)points.reverse();
      assert.deepEqual(routed.issues,[]);assert.deepEqual(points[0],mouth);
      const outward=new Vector3(0,0,-.115).applyAxisAngle(new Vector3(0,1,0),angle);
      assert.ok(v(points[1]).sub(v(points[0])).distanceTo(outward)<1e-7);
    }
  }
  for(const n of [0,1])for(const f of [0,1]){
    const d=structuredClone(doc);
    d.components.find(c=>c.id==='near')!.params.position=n;
    d.components.find(c=>c.id==='far')!.params.position=f;
    const r=simulate(d);assert.equal(r.converged,true);assert.equal(r.deviceStates.light.energized,n===f);
  }
  assert.equal(JSON.stringify(doc),before);
});

test('a second learner connection to the same rear terminal still receives its own path',()=>{
  const d=structuredClone(doc);
  const outlet={...d.components.find(c=>c.id==='light')!,id:'extra',position:[-.5,0,3] as [number,number,number]};
  d.components.push(outlet);
  d.wires.push({id:'extra-line',from:{component:'near',terminal:'T1'},to:{component:'extra',terminal:'L'},role:'L',resistance:.04,bends:[]});
  const routes=routeCircuit(d);
  assert.deepEqual(routes.issues,[]);assert.deepEqual(auditRoutes(d,routes),[]);
  assert.ok(routes.routes.get('extra-line')!.length>1);
});
