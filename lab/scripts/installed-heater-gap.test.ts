import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getLesson} from '../lib/lessons';
import {looseHeaterPoint} from '../lib/heater-flex-point';
import {measureResistance} from '../lib/simulation';
import {describeEndpoint} from '../lib/endpoint-description';
import {installedTestFittings,siteContacts} from '../lib/site-meter';
import {jobSite} from '../lib/job-site';
import type {Endpoint} from '../lib/types';

const clamp=(terminal:string):Endpoint=>({component:'fcu-switch',terminal});
function job(){
  const doc=structuredClone(getLesson(20)!.circuit);
  const wire=doc.wires.find(w=>w.from.component==='fcu-switch'&&w.from.terminal==='LOUT')!;
  doc.supply.enabled=false;
  doc.faults=[{type:'open-live',enabled:true,wire:wire.id,looseEnd:{...wire.from}}];
  return {doc,wire,tip:looseHeaterPoint(doc)!};
}

test('the loose copper retains the real core resistance and the meter follows alternate paths',()=>{
  const {doc,tip,wire}=job(),load=clamp('LOUT');
  assert.equal(measureResistance(doc,tip,load).reason,'open');
  assert.ok(measureResistance(doc,clamp('LIN'),load).value!<.01);
  wire.resistance=.31;
  assert.ok(Math.abs(measureResistance(doc,tip,wire.to).value!-.31)<1e-6);
  doc.wires.push({...wire,id:'alternative',cable:undefined,resistance:7.25});
  assert.ok(Math.abs(measureResistance(doc,tip,load).value!-7.56)<1e-4);
  assert.ok(Math.abs(measureResistance(doc,load,tip).value!-7.56)<1e-4);
  doc.faults.push({type:'open-wire',wire:wire.id,enabled:true});
  assert.equal(measureResistance(doc,tip,load).reason,'open');
});

test('a closed fitting, live supply, broken wire of unknown location, or repaired end cannot pose as an exposed dead point',()=>{
  const {doc,tip}=job();
  const fitting=installedTestFittings(doc,jobSite(doc)).find(f=>f.kind==='fcu')!;
  assert.deepEqual(siteContacts(fitting,false),[]);
  assert.equal(siteContacts(fitting,true).find(p=>p.endpoint.terminal===tip.terminal)?.label,'Loose brown wire');
  assert.equal(describeEndpoint(doc,tip)?.pointLabel,'Loose brown wire');
  assert.equal(installedTestFittings(doc,jobSite(doc)).some(f=>f.component.id==='fixed'),false);
  doc.supply.enabled=true;assert.equal(measureResistance(doc,tip,clamp('LOUT')).reason,'supply-on');
  doc.supply.enabled=false;doc.components.push({...doc.components[0],type:'battery',id:'backup',params:{on:true}});
  assert.equal(measureResistance(doc,tip,clamp('LOUT')).reason,'supply-on');doc.components.pop();
  delete doc.faults[0].looseEnd;assert.equal(looseHeaterPoint(doc),undefined);
  assert.deepEqual(measureResistance(doc,tip,tip).value,null);
  doc.faults=[];assert.equal(describeEndpoint(doc,tip),undefined);
  assert.equal(installedTestFittings(doc,jobSite(doc)).find(f=>f.kind==='fcu')?.looseCore,undefined);
});
