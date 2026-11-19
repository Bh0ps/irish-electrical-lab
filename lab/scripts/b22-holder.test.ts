import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {Mesh,Raycaster,Vector3} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {b22WireSeats,extendToB22Seats} from '../lib/b22-wire-seats';
import {prepareBlenderModel,presentBlenderModel,semanticOwner} from '../lib/blender-model';
import {getLesson} from '../lib/lessons';
import {probeContact,routeCircuit,terminalPosition} from '../lib/routing';
import {measureVoltage,simulate} from '../lib/simulation';
import {connectedRockerTerminals} from '../lib/wall-rocker';
import type {Vec3} from '../lib/types';

const doc=getLesson(7)!.circuit, lamp=doc.components.find(c=>c.id==='light')!;
const source=JSON.stringify(doc);
const vec=(p:Vec3)=>new Vector3(...p);
const normal=new Vector3(0,0,-1);

test('both B22 meshes expose the recessed screws, separate earth lug, switched wire seats and moving bulb internals',async()=>{
  for(const suffix of ['','.low']){
    const bytes=readFileSync(new URL('../public/models/lamp_bulb'+suffix+'.glb',import.meta.url));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const model=prepareBlenderModel(scene,suffix!==''),glass=model.meshes.find(m=>m.node.userData.lampEnvelope)!.node;
    const filament=model.meshes.find(m=>m.filament)!.node,projection=new Vector3();
    const ray=(origin:Vector3,dir:Vector3)=>{
      const active:Mesh[]=[];model.scene.traverseVisible(n=>{if(n instanceof Mesh)active.push(n);});
      return new Raycaster(origin,dir).intersectObjects(active,false)[0];
    };
    const seats=b22WireSeats(doc).get('light')!;
    const local=(p:Vec3)=>vec(p).sub(vec(lamp.position));
    for(const wired of ['', 'L','N','PE','L N PE']){
      presentBlenderModel(model,'normal',lamp,undefined,undefined,wired);model.scene.updateMatrixWorld(true);
      assert.deepEqual(model.receptacles.filter(r=>r.node.visible).map(r=>r.terminal).sort(),wired.split(' ').filter(Boolean).sort());
      for(const [id,{seat,entry}] of seats){
        const ep={component:'light',terminal:id},at=local(probeContact(doc,ep).position);
        const screw=ray(at.clone().addScaledVector(normal,.65),normal.clone().negate());
        assert.equal(semanticOwner(screw.object).terminal,id);
        assert.ok(screw.point.distanceTo(at)<.001,'probe tip sits on metal beside the slot for '+id);
        const core=ray(local(entry).addScaledVector(normal,.60),normal.clone().negate());
        assert.equal(semanticOwner(core.object).terminal,id);
        const material=(core.object as Mesh).material;
        assert.ok(!Array.isArray(material));
        if(wired.split(' ').includes(id)){
          assert.equal(material.name,'B22 seated copper');assert.ok(core.point.distanceTo(local(seat))<.001);
        }else{
          assert.notEqual(material.name,'B22 seated copper');assert.ok(core.point.z>local(seat).z+.025,'empty pillar has depth');
        }
      }
    }
    // A bulb taken out as one part keeps its filament and support stem inside
    // the same glass envelope. The two spring contacts stay in the fixed socket.
    let normalPos:Vector3|undefined,initialRelation:Vector3|undefined;
    for(const view of ['normal','open','exploded','cutaway'] as const){
      presentBlenderModel(model,view,lamp,undefined,undefined,'L N PE');model.scene.updateMatrixWorld(true);
      const centre=projection.fromBufferAttribute(filament.geometry.attributes.position,0).applyMatrix4(filament.matrixWorld).clone();
      const relative=glass.worldToLocal(centre.clone());
      if(initialRelation)assert.ok(relative.distanceTo(initialRelation)<.0001);else initialRelation=relative;
      if(view==='normal')normalPos=centre;
      if(view==='open'){
        assert.ok(centre.distanceTo(normalPos!)>.25);
        const axis=new Vector3(0,Math.SQRT1_2,Math.SQRT1_2),base=new Vector3(0,.306,-.068);
        for(const [x,id] of [[-.0574,'L'],[.0574,'N']] as const){
          const origin=base.clone().add(new Vector3(x,0,0)).addScaledVector(axis,.5);
          const hit=ray(origin,axis.clone().negate());
          assert.equal(semanticOwner(hit.object).terminal,id,'a separate button remains in the socket');
        }
        // The protective lug belongs on the shell. Look through the full
        // socket opening after the bulb is out: it must have just two contacts.
        const across=new Vector3(1,0,0),up=new Vector3(0,Math.SQRT1_2,-Math.SQRT1_2);
        for(let x=-.104;x<=.104;x+=.013)for(let y=-.104;y<=.104;y+=.013){
          if(Math.hypot(x,y)>.110)continue;
          const origin=base.clone().addScaledVector(across,x).addScaledVector(up,y).addScaledVector(axis,.45);
          const visible=semanticOwner(ray(origin,axis.clone().negate()).object);
          assert.notEqual(visible.terminal,'PE');assert.notEqual(visible.detail,'b22-earth-bond');
        }
        const floor=ray(base.clone().add(new Vector3(.084,0,0)).addScaledVector(axis,.5),axis.clone().negate());
        assert.equal(semanticOwner(floor.object).detail,'ceramic-terminal-insert');
      }
    }
    for(const material of model.owned)material.dispose();
  }
});

test('hall lamp dressing follows actual wire, colour and endpoint through rotation, removal and restoration',()=>{
  for(const rotation of [0,.67,Math.PI/2,Math.PI]){
    const d=structuredClone(doc);
    d.components.find(c=>c.id==='light')!.rotation=rotation;
    const lampSeats=b22WireSeats(d).get('light')!,routes=routeCircuit(d);
    assert.deepEqual(routes.issues,[]);
    for(const w of d.wires.filter(w=>w.to.component==='light'||w.from.component==='light')){
      const atStart=w.from.component==='light',ep=atStart?w.from:w.to,seat=lampSeats.get(ep.terminal)!;
      const points=routes.routes.get(w.id)!,dressed=extendToB22Seats(points,seat);
      assert.deepEqual(terminalPosition(d,ep),seat.entry);
      assert.deepEqual(atStart?points[0]:points.at(-1),seat.entry);
      assert.deepEqual(atStart?dressed[0]:dressed.at(-1),seat.seat);
      assert.deepEqual(atStart?dressed[1]:dressed.at(-2),seat.entry);
      assert.ok(vec(seat.seat).distanceTo(vec(probeContact(d,ep).position))>.043);
      assert.equal(connectedRockerTerminals(lamp,d.wires.filter(wire=>wire.id!==w.id))?.split(' ').includes(ep.terminal),false);
      assert.equal(connectedRockerTerminals(lamp,d.wires),'L N PE');
    }
    const openTail:Vec3[]=[[7,2,8],[8,3,8]];
    assert.equal(extendToB22Seats(openTail,lampSeats.get('L')),openTail);
    for(const closed of [true,false]){
      d.components.find(c=>c.id==='switch')!.params.closed=closed;
      const r=simulate(d);
      const volts=measureVoltage(r,{component:'light',terminal:'L'},{component:'light',terminal:'N'}).value;
      assert.equal(r.deviceStates.light.energized,closed);
      assert.ok(volts!==null&&(closed?volts>235:volts<1));
    }
  }
  assert.equal(JSON.stringify(doc),source);
});
