import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE_CALLS, houseStepId, stairReadings, checkStairChoice, callActivityId, callReadings, checkCallSample, savedCallStep, houseJobLabels, nextHouseCall, onlyCallControlsChanged, verifiedCallStep } from '../lib/house-calls';
import { captureMeasurement } from '../lib/learning';
import { forkRead, instrumentData } from '../lib/fork-tester';
import { migrateProgress, recordActivity } from '../lib/progress';
import { getCoursebookActivities, completedCoursebookLesson } from '../lib/coursebook';
import { LESSONS } from '../lib/lessons';
import { simulate } from '../lib/simulation';
import { validateBookmark } from '../lib/lesson-bookmark';
import { validateCircuit } from '../lib/storage';
import type { CircuitDocument } from '../lib/types';

for(const call of HOUSE_CALLS){
  if(call.steps.some(s=>s.waitForFan))continue; // The timed job is exercised with the same live timer throughout in bathroom-fan.test.
  test(call.title+' uses both real circuit states and a fresh action at the named fitting',()=>{
    let doc:CircuitDocument=structuredClone(LESSONS.find(l=>l.id===call.lesson)!.circuit);
    for(const [index,step] of call.steps.entries()){
      const reading=simulate(doc);
      assert.ok(callReadings(step.before,doc,reading)?.every(r=>r.matches));
      const id=houseStepId(call,index);
      const action={component:step.target,activity:id,before:doc,reading};
      if(step.stairCheck){
        const view=stairReadings(step.stairCheck,doc,reading);
        assert.ok(view?.answer);
        assert.ok(checkStairChoice(call,index,doc,reading,{activity:id,revision:doc.revision,circuitId:doc.id,pin:view.answer.pin})?.pass);
        assert.equal(verifiedCallStep(call,index,doc,reading,action),false);
        continue;
      }
      if(step.measure){
        const [pin,reference]=step.chimeReading?[step.chimeReading==='supply'?'AC1':'FRONT','AC2']:['L','N'];
        const evidence={...captureMeasurement(doc,reading,{mode:'voltage',a:{component:step.target,terminal:pin},b:{component:step.target,terminal:reference}}),assisted:false};
        assert.equal(checkCallSample(call,index,doc,reading,{activity:id,evidence})?.pass,true);
        assert.equal(verifiedCallStep(call,index,doc,reading,action),false);
        continue;
      }
      const after={...doc,revision:doc.revision+1,components:doc.components.map(c=>{
        if(c.id!==step.target)return c;
        const p={...c.params};if(c.type==='switch2')p.position=Number(p.position)===0?1:0;else if(c.type==='pushbutton')p.pressed=!p.pressed;else p.closed=!p.closed;
        return {...c,params:p};
      })};
      assert.ok(onlyCallControlsChanged(call,after,doc));
      assert.equal(onlyCallControlsChanged(call,{...after,wires:after.wires.slice(1)},doc),false);
      const solved=simulate(after);
      assert.equal(verifiedCallStep(call,index,after,solved,action),true);
      assert.equal(verifiedCallStep(call,index,after,reading,action),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,component:'supply'}),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,activity:houseStepId(call,index+1)}),false);
      assert.equal(verifiedCallStep(call,index,after,solved,{...action,reading:undefined}),false);
      assert.equal(verifiedCallStep(call,index,after,{...solved,converged:false},action),false);
      const restored=validateBookmark({version:1,circuit:after,activityId:houseStepId(call,index+1),path:'coursebook',mode:'explore'});
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

test('the board job follows the connected branch, including a board with the feeds exchanged',()=>{
  const call=HOUSE_CALLS.find(c=>c.lesson===2)!;
  const original=structuredClone(LESSONS.find(l=>l.id===2)!.circuit);
  const circuit=houseJobLabels(original);
  assert.ok(onlyCallControlsChanged(call,circuit,original));
  assert.ok(onlyCallControlsChanged(call,validateCircuit(circuit),original));
  assert.equal(circuit.components.find(c=>c.id==='load2')?.label,'Kitchen socket');
  const named={...circuit,components:circuit.components.map(c=>c.id==='load2'?{...c,label:'Utility socket'}:c)};
  assert.equal(houseJobLabels(named).components.find(c=>c.id==='load2')?.label,'Utility socket');
  const exchange=(end:{component:string;terminal:string})=>end.terminal==='OUT'&&['branch1','branch2'].includes(end.component)
    ?{...end,component:end.component==='branch1'?'branch2':'branch1'}:end;
  const exchanged={...circuit,wires:circuit.wires.map(w=>({...w,from:exchange(w.from),to:exchange(w.to)}))};
  assert.equal(onlyCallControlsChanged(call,exchanged,original),false);
  const setBreaker=(doc:CircuitDocument,id:string,closed:boolean)=>({...doc,revision:doc.revision+1,components:doc.components.map(c=>c.id===id?{...c,params:{...c.params,closed}}:c)});
  const check=(index:number,before:CircuitDocument,after:CircuitDocument,component:string)=>verifiedCallStep(call,index,after,simulate(after),{
    component,activity:callActivityId(2,index),before,reading:simulate(before),
  });
  for(const [board,lighting,sockets] of [[circuit,'branch1','branch2'],[exchanged,'branch2','branch1']] as const){
    const wrong=setBreaker(board,sockets,false);
    assert.deepEqual(callReadings(call.steps[0].after,wrong,simulate(wrong))?.map(r=>r.powered),[true,false]);
    assert.equal(check(0,board,wrong,sockets),false);
    const restored=setBreaker(wrong,sockets,true);
    assert.equal(check(0,wrong,restored,sockets),false);
    const lampOff=setBreaker(restored,lighting,false);
    assert.equal(check(0,restored,lampOff,lighting),true);
    assert.equal(check(1,lampOff,setBreaker(lampOff,lighting,true),lighting),true);
  }
});

test('the next house job skips demonstrated jobs and keeps an unfinished job available',()=>{
  const [cupboard,stairs,board,bell,worktops,fan]=HOUSE_CALLS;
  let progress=migrateProgress(undefined);
  assert.equal(nextHouseCall(board,progress),bell);
  progress=recordActivity(progress,bell.lesson,houseStepId(bell,bell.steps.length-1),'house-call',true);
  assert.equal(nextHouseCall(board,progress),worktops);
  progress=recordActivity(progress,worktops.lesson,callActivityId(worktops.lesson,worktops.steps.length-1),'house-call',true);
  assert.equal(nextHouseCall(board,progress),fan);
  progress=recordActivity(progress,fan.lesson,callActivityId(fan.lesson,fan.steps.length-1),'house-call',true);
  assert.equal(nextHouseCall(board,progress),cupboard);
  progress=recordActivity(progress,cupboard.lesson,callActivityId(cupboard.lesson,0),'house-call',true);
  assert.equal(nextHouseCall(board,progress),cupboard);
  for(const job of [cupboard,stairs]){
    progress=recordActivity(progress,job.lesson,houseStepId(job,job.steps.length-1),'house-call',true);
  }
  assert.equal(nextHouseCall(board,progress),undefined);
});

test('worktop checks require fresh probes on the named strip and accept either polarity',()=>{
  const call=HOUSE_CALLS.find(c=>c.lesson===66)!;
  const original=LESSONS.find(l=>l.id===66)!.circuit;
  const doc={...original,revision:11,components:original.components.map(c=>c.id==='left-switch'?{...c,params:{...c.params,closed:false}}:c)};
  const result=simulate(doc);
  function mark(index:number,a:string,b:string,reverse=false){
    const setup={method:'probe-voltage' as const,reference:'none' as const,a:{component:a,terminal:reverse?'N':'L'},b:{component:b,terminal:reverse?'L':'N'}};
    const instrument=instrumentData(setup,forkRead(doc,result,setup));
    const evidence={...captureMeasurement(doc,result,{mode:'voltage',a:setup.a,b:setup.b,instrument}),assisted:false};
    return {activity:callActivityId(66,index),evidence};
  }
  for(const [i,id,expected] of [[1,'left',0],[2,'right',24]] as const){
    for(const reverse of [true,false]){
      const sample=mark(i,id,id,reverse);
      assert.ok(Math.abs(Math.abs(sample.evidence.value!)-expected)<.1);
      assert.equal(checkCallSample(call,i,doc,result,sample)?.pass,true);
      assert.ok(checkCallSample(call,i,doc,result,sample)?.message.includes(sample.evidence.instrument!.displayed+' V'));
      assert.equal(checkCallSample(call,i,doc,result,{...sample,evidence:{...sample.evidence,assisted:true}})?.pass,false);
      assert.equal(checkCallSample(call,i,doc,result,{...sample,evidence:{...sample.evidence,assisted:undefined}})?.pass,false);
      assert.equal(checkCallSample(call,i,doc,result,{...sample,evidence:{...sample.evidence,value:90}}),undefined);
      assert.equal(checkCallSample(call,i,doc,{...result,revision:12},sample),undefined);
      assert.equal(checkCallSample(call,i,doc,result,{...sample,evidence:{...sample.evidence,circuitId:'another draft'}}),undefined);
      assert.equal(checkCallSample(call,i,doc,result,{...sample,activity:callActivityId(66,0)}),undefined);
      const saved=JSON.parse(JSON.stringify(sample));
      saved.evidence.instrument.held=true;
      assert.equal(checkCallSample(call,i,doc,result,saved),undefined);
    }
    assert.equal(checkCallSample(call,i,doc,result,mark(i,'left','right'))?.pass,false);
  }
  const otherState={...doc,components:doc.components.map(c=>c.id==='right-switch'?{...c,params:{...c.params,closed:false}}:c)};
  const fresh=simulate(otherState);
  const wrongState={activity:callActivityId(66,1),evidence:{...captureMeasurement(otherState,fresh,{mode:'voltage',a:{component:'left',terminal:'L'},b:{component:'left',terminal:'N'}}),assisted:false}};
  assert.equal(checkCallSample(call,1,otherState,fresh,wrongState)?.pass,false);
  const wrongSupply={...doc,components:doc.components.map(c=>c.id==='driver'?{...c,type:'transformer'}:c)};
  const ac=simulate(wrongSupply);
  const right={...captureMeasurement(wrongSupply,ac,{mode:'voltage',a:{component:'right',terminal:'L'},b:{component:'right',terminal:'N'}}),assisted:false};
  assert.ok(right.value!>23 && right.value!<25);
  assert.equal(checkCallSample(call,2,wrongSupply,ac,{activity:callActivityId(66,2),evidence:right})?.pass,false);
  const backwards={...doc,wires:doc.wires.map(w=>w.to.component==='right'?{...w,to:{...w.to,terminal:w.to.terminal==='L'?'N':'L'}}:w)};
  const blocked=simulate(backwards);
  const dark=callReadings(call.steps[2].after,backwards,blocked)![1];
  assert.ok(dark.value!>23&&dark.value!<25);
  assert.equal(dark.lit,false);
  assert.equal(dark.matches,false);
  const reversed={...captureMeasurement(backwards,blocked,{mode:'voltage',a:{component:'right',terminal:'L'},b:{component:'right',terminal:'N'}}),assisted:false};
  assert.equal(checkCallSample(call,2,backwards,blocked,{activity:callActivityId(66,2),evidence:reversed})?.pass,false);
});

test('the doorbell job watches each chime input and its live supply during a hold and after release',()=>{
  const call=HOUSE_CALLS.find(c=>c.lesson===72)!;
  const job=structuredClone(LESSONS.find(l=>l.id===72)!.circuit);
  function change(doc:CircuitDocument,target:string,pressed:boolean){
    return {...doc,revision:doc.revision+1,components:doc.components.map(c=>c.id===target?{...c,params:{...c.params,pressed}}:c)};
  }
  function attempt(index:number,before:CircuitDocument,after:CircuitDocument,component:string){
    const activity=callActivityId(72,index);
    return verifiedCallStep(call,savedCallStep(call,activity)!,after,simulate(after),{component,activity,before,reading:simulate(before)});
  }
  const front=change(job,'front',true),both=change(front,'back',true),rear=change(job,'back',true),idle=change(front,'front',false);
  const values=(d:CircuitDocument)=>callReadings(call.steps[0].before,d,simulate(d))!.map(r=>Math.round(r.value!));
  assert.deepEqual(values(job),[12,0,0]);assert.deepEqual(values(front),[12,12,0]);assert.deepEqual(values(idle),[12,0,0]);assert.deepEqual(values(both),[12,12,12]);
  assert.equal(attempt(0,job,rear,'back'),false);assert.equal(attempt(1,front,both,'back'),false);
  assert.equal(attempt(0,rear,change(rear,'front',true),'front'),false);
  const damaged={...job,wires:job.wires.filter(w=>!(w.to.component==='chime'&&w.to.terminal==='FRONT'))};
  assert.equal(attempt(0,damaged,change(damaged,'front',true),'front'),false);
  const brokenFrontHeld=change(damaged,'front',true);
  assert.equal(attempt(2,brokenFrontHeld,change(brokenFrontHeld,'back',true),'back'),false);
  const cross={...job,wires:job.wires.map(w=>w.to.component==='chime'&&['FRONT','REAR'].includes(w.to.terminal)?{...w,to:{...w.to,terminal:w.to.terminal==='FRONT'?'REAR':'FRONT'}}:w)};
  assert.equal(attempt(0,cross,change(cross,'front',true),'front'),false);
  const unpowered={...job,wires:job.wires.filter(w=>!(w.to.component==='chime'&&w.to.terminal==='AC1'))};
  assert.equal(attempt(3,change(unpowered,'back',true),change(change(unpowered,'back',true),'back',false),'back'),false);
  const wrongVoltage={...job,components:job.components.map(c=>c.id==='tx'?{...c,params:{...c.params,outputVoltage:24}}:c)};
  assert.equal(attempt(0,wrongVoltage,change(wrongVoltage,'front',true),'front'),false);
  assert.equal(verifiedCallStep(call,0,front,simulate(front)),false);
  const saved=validateBookmark({version:1,circuit:front,activityId:callActivityId(72,1),path:'coursebook',mode:'explore'});
  assert.equal(saved.circuit.components.find(c=>c.id==='front')?.params.pressed,true);
  assert.ok(attempt(1,saved.circuit,change(saved.circuit,'front',false),'front'));
});
