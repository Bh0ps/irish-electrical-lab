import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {getLesson} from '../lib/lessons';
import {jobSite} from '../lib/job-site';
import {sesameCallWiring} from '../lib/bell-meter-site';
import {installedTestFittings,padCamera,siteContacts,sesameSiteProbe} from '../lib/site-meter';
import type {Wire} from '../lib/types';

const fresh=()=>structuredClone(getLesson(72)!.circuit);
test('the door meter follows the complete isolated winding and either landing of an unmarked push',()=>{
  const doc=fresh();doc.faults=[{type:'open-wire',wire:'w11',enabled:true}];
  assert.equal(sesameCallWiring(doc,'back')?.call.terminal,'NO');
  for(const w of doc.wires)for(const e of [w.from,w.to]){
    if(e.component==='back')e.terminal=e.terminal==='NO'?'COM':'NO';
    if(e.component==='tx'&&['+','-'].includes(e.terminal))e.terminal=e.terminal==='+'?'-':'+';
  }
  assert.equal(sesameCallWiring(doc,'back')?.call.terminal,'COM');
  assert.equal(sesameCallWiring(doc,'back')?.feed.terminal,'NO');
  assert.equal(sesameCallWiring(doc,'front')?.call.terminal,'NO');
});

test('edited circuits with an unknown source or return, a primary crossfeed or an over-rated winding use bench points',()=>{
  const extras:Wire['to'][]=[{component:'supply',terminal:'L'},{component:'tx',terminal:'N'},{component:'another-source',terminal:'+'}];
  for(const end of extras){const doc=fresh();doc.wires.push({...doc.wires[0],id:'extra',from:{component:'chime',terminal:'V'},to:end});assert.equal(sesameCallWiring(doc,'back'),undefined);}
  for(const endpoint of ['L','+']){const doc=fresh();doc.wires.find(w=>w.id==='w7')!.from.terminal=endpoint;assert.equal(sesameCallWiring(doc,'back'),undefined);}
  const rated=fresh();rated.components.find(c=>c.id==='tx')!.params.outputVoltage=230;assert.equal(sesameCallWiring(rated,'back'),undefined);
  const primary=fresh();primary.components.find(c=>c.id==='tx')!.params.nominalVoltage=12;assert.equal(sesameCallWiring(primary,'back'),undefined);
  const addedFeed=fresh();addedFeed.wires.push({...addedFeed.wires[2],id:'other-feed',from:{component:'boost',terminal:'+'}});assert.equal(sesameCallWiring(addedFeed,'back'),undefined);
  const fault=fresh();fault.faults=[{type:'earth-fault',component:'back',enabled:true}];assert.equal(sesameCallWiring(fault,'back'),undefined);
});

test('both rear screw shoulders stay on the proper face of each entrance and within the meter shot',()=>{
  const doc=fresh();for(const fitting of installedTestFittings(doc,jobSite(doc)).filter(f=>f.kind==='sesame')){
    assert.deepEqual(siteContacts(fitting,false),[]);
    const contacts=siteContacts(fitting,true);assert.deepEqual(contacts.map(c=>c.label),['Upper screw','Lower screw']);
    assert.ok(contacts[0].position[1]>contacts[1].position[1]);
    for(const aspect of [.42,.75,1.5,3.5]){
      const view=padCamera(fitting,true,true,undefined,aspect),camera=new PerspectiveCamera(49,aspect,.012,55);
      camera.zoom=2;camera.updateProjectionMatrix();camera.position.set(...view.position);camera.rotation.set(view.pitch,view.yaw,0,'YXZ');camera.updateMatrixWorld();
      for(const c of contacts){const p=new Vector3(...c.position).project(camera);assert.ok(p.z>0&&p.z<1&&Math.abs(p.x)<.93&&Math.abs(p.y)<.95);
        assert.notDeepEqual(sesameSiteProbe(fitting.item,fitting.component,c.endpoint.terminal,true)?.position,c.position);}
    }
  }
});
