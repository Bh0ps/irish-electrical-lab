import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS } from '../lib/lessons';
import { COMPONENTS } from '../lib/components';
import { equipmentAsset, equipmentAssetKey } from '../lib/equipment-assets';
import { lessonMenuEquipment } from '../lib/menu-equipment';

test('all 64 course icons use real, distinct rendered equipment forms without changing examples',()=>{
  for(const lesson of LESSONS){const before=structuredClone(lesson.circuit),icons=lessonMenuEquipment(lesson);assert.ok(icons.length>0&&icons.length<=2);const keys=icons.map(component=>equipmentAssetKey(component,COMPONENTS[component.type]));assert.equal(new Set(keys).size,keys.length);assert.ok(icons.every(component=>lesson.circuit.components.includes(component)&&equipmentAsset(component,COMPONENTS[component.type])));assert.deepEqual(lesson.circuit,before);}
});
test('representative menus identify specific course equipment rather than only a generic category',()=>{
  assert.equal(lessonMenuEquipment(LESSONS.find(lesson=>lesson.id===12)!)[0].type,'dimmer');
  assert.equal(lessonMenuEquipment(LESSONS.find(lesson=>lesson.id===58)!)[0].type,'vfd');
  assert.equal(lessonMenuEquipment(LESSONS.find(lesson=>lesson.id===64)!)[0].type,'safetyRelay');
});
