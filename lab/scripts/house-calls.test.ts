import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_CALLS, callActivityId, callReadings, savedCallStep, onlyCallControlsChanged, verifiedCallStep } from '../lib/house-calls';
import { getCoursebookActivities, completedCoursebookLesson } from '../lib/coursebook';
import { LESSONS } from '../lib/lessons';
import { simulate } from '../lib/simulation';
import { validateBookmark } from '../lib/lesson-bookmark';
import type { CircuitDocument } from '../lib/types';

for(const call of HOUSE_CALLS){
  test(call.title+' uses both real circuit states and a fresh action at the named fitting',()=>{
    let doc:CircuitDocument=structuredClone(LESSONS.find(l=>l.id===call.lesson)!.circuit);
    for(const [index,step] of call.steps.entries()){
      const reading=simulate(doc);
      assert.ok(callReadings(step.before,doc,reading)?.every(r=>r.matches));
      const id=callActivityId(call.lesson,index);
      const action={component:step.target,activity:id,before:doc,reading};
      const after={...doc,revision:doc.revision+1,components:doc.components.map(c=>{
        if(c.id!==step.target)return c;
        const p={...c.params};if(c.type==='switch2')p.position=Number(p.position)===0?1:0;else p.closed=!p.closed;
        return {...c,params:p};
      })};
      assert.ok(onlyCallControlsChanged(call,after,doc));
      assert.equal(onlyCallControlsChanged(call,{...after,wires:after.wires.slice(1)},doc),false);
      const solved=simulate(after);
      assert.equal(verifiedCallStep(call,index,after,solved,action),true);
      assert.equal(verifiedCallStep(call,index,after,reading,action),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,component:'supply'}),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,activity:callActivityId(call.lesson,index+1)}),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,reading:undefined}),false);
      assert.equal(verifiedCallStep(call,index,after,{...solved,converged:false},action),false);
      const restored=validateBookmark({version:1,circuit:after,activityId:callActivityId(call.lesson,index+1),path:'coursebook',mode:'explore'});
      assert.equal(savedCallStep(call,restored.activityId),index+1);
      doc=after;
    }
  });
}

test('chapter progress requires the practical work and allows learners to try before predicting',()=>{
  for(const lesson of LESSONS){
    const activities=getCoursebookActivities(lesson);
    const earned=activities.filter(a=>['connect','operate','measure','explain','retest'].includes(a.kind)).map(a=>a.id);
    assert.ok(completedCoursebookLesson(lesson,earned));
    assert.equal(completedCoursebookLesson(lesson,earned.slice(1)),false);
    assert.equal(completedCoursebookLesson(lesson,activities.filter(a=>a.kind==='predict'||a.kind==='inspect').map(a=>a.id)),false);
  }
});
