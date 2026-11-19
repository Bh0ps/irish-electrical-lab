import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getLessonActivities } from '../lib/learning.ts';
import { LESSONS } from '../lib/lessons.ts';
import { checkSwitchPress, lessonSwitch, recordSwitchPress } from '../lib/lesson-control.ts';
import { simulate } from '../lib/simulation.ts';
import type { CircuitDocument } from '../lib/types.ts';

const stairs = LESSONS[8];
const steps = getLessonActivities(stairs);
const downstairs = steps.find(a=>a.id==='lesson:9:operate:sequence:1')!;
const landing = steps.find(a=>a.id==='lesson:9:operate:sequence:2')!;
function flip(doc: CircuitDocument, id: string): CircuitDocument {
  return {...doc, revision:doc.revision+1, components:doc.components.map(c=>c.id===id ?
    {...c,params:{...c.params,position:c.params.position===0?1:0}} : c)};
}

test('the stairs lesson needs a fresh click on the named switch and a real change at the lamp',()=>{
  let doc = structuredClone(stairs.circuit);
  let result = simulate(doc);
  assert.equal(recordSwitchPress(downstairs,'far',doc,result),undefined);
  for (const [activity,id,message] of [[downstairs,'near',/went out.*240 V to 0 V/],[landing,'far',/lit.*0 V to 240 V/]] as const) {
    const press=recordSwitchPress(activity,id,doc,result);
    assert.ok(press);
    doc=flip(doc,id);
    assert.equal(checkSwitchPress(activity,press,doc,result),undefined);
    result=simulate(doc);
    assert.equal(checkSwitchPress(activity,undefined,doc,result),undefined);
    assert.equal(checkSwitchPress(activity,{...press,circuit:'earlier-draft'},doc,result),undefined);
    const feedback=checkSwitchPress(activity,press,doc,result);
    assert.equal(feedback?.status,'pass'); assert.match(feedback!.explanation,message);
    assert.equal(checkSwitchPress(activity,press,{...doc,revision:doc.revision+1},result),undefined);
    assert.equal(checkSwitchPress(activity,{...press,activity:'another-step'},doc,result),undefined);
  }
});

test('a dead lamp, switched-off supply and missed reading cannot pass a switching step',()=>{
  for (const condition of ['broken wire','supply off','missing baseline','no new reading']) {
    let doc=structuredClone(stairs.circuit);
    if(condition==='broken wire')doc.wires=doc.wires.filter(w=>![w.from,w.to].some(e=>e.component==='light'&&e.terminal==='L'));
    if(condition==='supply off')doc.supply.enabled=false;
    const before=simulate(doc);
    const press=recordSwitchPress(downstairs,'near',doc,condition==='missing baseline'?undefined:before);
    doc=flip(doc,'near');
    const solved=simulate(doc);
    const checked=checkSwitchPress(downstairs,press,doc,condition==='no new reading'?{...solved,converged:false}:solved);
    assert.ok(checked); assert.notEqual(checked.status,'pass',condition);
  }
});

test('only one physical two-position control is offered and earlier lesson IDs stay the same',()=>{
  assert.equal(lessonSwitch(downstairs,stairs.circuit)?.id,'near');
  assert.equal(lessonSwitch({...downstairs,bookStep:'switch-off'},stairs.circuit),undefined);
  assert.equal(lessonSwitch({...downstairs,expectedControls:[]},stairs.circuit),undefined);
  assert.equal(lessonSwitch({...downstairs,expectedSupplyEnabled:false},stairs.circuit),undefined);
  const breaker=getLessonActivities(LESSONS[1]).find(a=>a.component==='branch1'&&a.scenarioStep!==undefined);
  assert.equal(lessonSwitch(breaker,LESSONS[1].circuit)?.id,'branch1');
});
