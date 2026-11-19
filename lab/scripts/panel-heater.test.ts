import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEquipmentVariant} from '../lib/components';
import {getLesson} from '../lib/lessons';
import {simulate} from '../lib/simulation';
import {PLX_DEFAULTS,panelThermostat} from '../lib/panel-heater';

test('the panel draws element power only on heat demand, at the actual voltage across its flex',()=>{
  for(const v of [230,240]){
    const doc=structuredClone(getLesson(20)!.circuit);doc.supply.voltage=v;
    const heater=doc.components.find(c=>c.id==='fixed')!;
    assert.equal(heater.variant,'plx050e');
    const measure=()=>{doc.revision++;const result=simulate(doc);assert.ok(result.converged);return result;};
    const live=measure(),resistance=240**2/500;
    const line=live.terminalVoltages['fixed.L'],neutral=live.terminalVoltages['fixed.N'];
    const actual=Math.hypot(line.re-neutral.re,line.im-neutral.im);
    assert.ok(Math.abs(Number(live.deviceStates.fixed.elementWatts)-actual**2/resistance)<.01);
    heater.params.setpoint=18;
    const satisfied=measure().deviceStates.fixed;
    assert.equal(satisfied.heaterSupplied,true);assert.equal(satisfied.elementWatts,0);
    heater.params.setpoint=21;
    doc.components.find(c=>c.id==='fcu-switch')!.params.closed=false;
    const isolated=measure().deviceStates.fixed;
    assert.equal(isolated.heaterSupplied,false);assert.equal(isolated.elementWatts,0);
    doc.components.find(c=>c.id==='fcu-switch')!.params.closed=true;
    const neutralWire=doc.wires.find(w=>w.to.component==='fixed'&&w.to.terminal==='N')!;
    doc.faults=[{wire:neutralWire.id,type:'open-neutral',enabled:true}];
    assert.ok(Number(measure().deviceStates.fixed.elementWatts)<.001);
  }
});

test('the named panel uses its declared rating; earlier combined wall-switch examples retain their loads',()=>{
  for(const [id,watts] of [[19,400],[20,300]]){
    const doc=structuredClone(getLesson(id)!.circuit),heater=doc.components.find(c=>c.id==='fixed')!;
    delete heater.variant;heater.params={watts,power:watts};
    assert.equal(getLesson(id,doc)!.circuit.components.find(c=>c.id==='fixed')!.params.watts,watts);
    const panel=applyEquipmentVariant({...heater,params:{...heater.params,ohms:12}},'plx050e');
    assert.equal(panel.params.watts,PLX_DEFAULTS.watts);assert.equal(panel.params.ohms,undefined);
    assert.equal(panelThermostat(panel.params).calling,true);
    const other=applyEquipmentVariant(panel,'storage');
    assert.equal(other.params.setpoint,undefined);
  }
});
