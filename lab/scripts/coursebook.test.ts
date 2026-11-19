import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LearningPanel from '../components/lab/LearningPanel.tsx';
import QuickPracticePanel from '../components/lab/QuickPracticePanel.tsx';
import { CHAPTERS, bookLampVoltage, courseBuildWires, courseMatchesQuery, createCoursebookBuild, getCoursebookActivities } from '../lib/coursebook.ts';
import { COURSE_PAGES } from '../lib/coursebook-content.ts';
import { LESSONS } from '../lib/lessons.ts';
import { captureMeasurement, evaluateActivity, getLessonActivities } from '../lib/learning.ts';
import { emptyLearningRecord } from '../lib/progress.ts';
import { QUICK_PRACTICE_EXPERIMENTS, createQuickPracticeCircuit } from '../lib/quick-practice.ts';
import { measureVoltage, simulate } from '../lib/simulation.ts';

const lesson = (id: number) => LESSONS.find(l => l.id === id)!;
const noop = () => undefined;
function renderBook(id: number, activityId?:string) {
  const l=lesson(id);
  return renderToStaticMarkup(createElement(LearningPanel,{
    path:'coursebook', initialActivityId:activityId, lesson:l,document:l.circuit,result:simulate(l.circuit),
    selectedPart:'body',record:emptyLearningRecord(), evidence:[],depth:'foundation', challengeStarted:false,
    mode:'explore',diagnosisAccepted:false,challengeRepaired:false,onActivityChange:noop,onTarget:noop,
    onAttempt:noop,onMeasure:noop,onBuild:noop,onTest:noop,onChallenge:noop,onStudied:noop,onReference:noop,
  }));
}
test('the first practical starts with the lit lamp and uses real, fresh off and on observations',()=>{
  const l=lesson(7), doc=structuredClone(l.circuit), steps=getCoursebookActivities(l);
  assert.match(renderBook(7),/Turn the light off/);
  assert.doesNotMatch(renderBook(7),/data-lesson-stage=/);
  const initial=simulate(doc);assert.ok(bookLampVoltage(doc,initial)!>230);
  for (const [index,closed] of [false,true].entries()) {
    doc.components.find(c=>c.id==='switch')!.params.closed=closed;
    doc.revision++;
    assert.equal(bookLampVoltage(doc,initial),null);
    const fresh=simulate(doc);
    assert.equal(evaluateActivity(steps[index],doc,fresh).status,'pass');
    assert.ok(closed ? bookLampVoltage(doc,fresh)!>230 : bookLampVoltage(doc,fresh)!<1);
  }
  assert.match(renderBook(7,'book:7:contact'),/two metal contacts touch/i);
  assert.match(renderBook(7,'book:7:meter-demo'),/volts \(V\)/);
});
test('nine chapters cover every course once with authored questions, distinct finishes and accessible entry points',()=>{
  assert.equal(CHAPTERS.length,9);
  assert.deepEqual(CHAPTERS.flatMap(c=>c.lessons).sort((a,b)=>a-b),LESSONS.map(l=>l.id));
  for (const chapter of CHAPTERS) assert.equal(chapter.lessons.at(-1),chapter.practical);
  assert.equal(new Set(LESSONS.map(l=>COURSE_PAGES[l.id].prediction.prompt)).size,80);
  assert.equal(new Set(LESSONS.map(l=>COURSE_PAGES[l.id].explanation.prompt)).size,80);
  assert.equal(new Set(LESSONS.map(l=>COURSE_PAGES[l.id].outcome)).size,80);
  assert.ok(courseMatchesQuery(lesson(9),'stairs light'));
  assert.ok(courseMatchesQuery(lesson(55),'motor stays on after Start'));
  for (const l of LESSONS) {
    const activities=getCoursebookActivities(l);
    for(const a of activities) assert.ok(a.id && a.title && a.instruction);
    assert.equal(activities.at(-1)?.id,`book:${l.id}:finish`);
    assert.equal(activities.at(-1)?.instruction,COURSE_PAGES[l.id].outcome);
    assert.equal(new Set(activities.map(a=>a.id)).size, activities.length);
    const explain=getLessonActivities(l).find(a=>a.kind==='explain')!;
    assert.equal(explain.instruction,COURSE_PAGES[l.id].explanation.prompt);
    assert.equal(evaluateActivity(explain,l.circuit,undefined,[],explain.answer).status,'pass');
    assert.equal(evaluateActivity(explain,l.circuit,undefined,[],'alternative').status,'fail');
  }
  assert.match(renderBook(7,'lesson:7:predict'),/I’m not sure — let me try/);
  assert.match(renderBook(7,'book:7:finish'),/Control three lights with one switch/);
});
test('prepared work retains the genuine example wiring while every chapter milestone starts empty and isolated',()=>{
  for(const chapter of CHAPTERS)for (const id of chapter.lessons) {
    const l=lesson(id), original=structuredClone(l.circuit);
    const missing=courseBuildWires(l), starter=createCoursebookBuild(l,'practice-draft');
    assert.equal(starter.supply.enabled,false);
    for(const c of starter.components.filter(c=>['pv','battery'].includes(c.type))) assert.equal(c.params.on,false);
    assert.deepEqual(starter.wires,original.wires.filter(w=>!missing.some(m=>m.id===w.id)));
    assert.equal(getCoursebookActivities(l).filter(a=>a.kind==='connect').length,missing.length);
    if(id===chapter.practical)assert.equal(starter.wires.length,0);
    assert.deepEqual(l.circuit,original);
  }
});
test('assisted placement cannot demonstrate choosing probes, even when the reading itself is genuine',()=>{
  const l=lesson(7), task=getCoursebookActivities(l).find(a=>a.independentMeasurement)!;
  const doc=structuredClone(l.circuit), r=simulate(doc), reading=captureMeasurement(doc,r,task.measurement!);
  assert.equal(evaluateActivity(task,doc,r,[reading]).status,'not-run');
  assert.equal(evaluateActivity(task,doc,r,[{...reading,assisted:true}]).status,'not-run');
  const independent={...reading,assisted:false,id:'independent',recordedAt:reading.recordedAt+1};
  assert.equal(evaluateActivity(task,doc,r,[{...reading,assisted:true},independent]).status,'pass');
  assert.equal(evaluateActivity(task,{...doc,revision:doc.revision+1},r,[independent]).status,'not-run');
});
test('common course searches find the named equipment and ordinary plurals',()=>{
  assert.ok(courseMatchesQuery(lesson(43),'How do I wire a door bell?'));
  assert.ok(courseMatchesQuery(lesson(13),'LEDs'));
  assert.ok(courseMatchesQuery(lesson(1),'fuseboard'));
  assert.ok(courseMatchesQuery(lesson(9),'lights on stairs'));
  assert.ok(courseMatchesQuery(lesson(53),'3-phase'));
  assert.ok(courseMatchesQuery(lesson(17),'socket at the end is dead'));
  assert.ok(courseMatchesQuery(lesson(36),'the fan stays on after I turn the light off'));
  assert.ok(courseMatchesQuery(lesson(13),'under cupboard light'));
  assert.ok(!courseMatchesQuery(lesson(52),'socket at the end is dead'));
  assert.ok(!courseMatchesQuery(lesson(52),'LEDs'));
  assert.ok(!courseMatchesQuery(lesson(43),'???'));
});
test('the paused EV charger loses its terminal supply while the contactor input remains live',()=>{
  const doc=structuredClone(lesson(46).circuit);
  const request=doc.components.find(c=>c.id==='load-control')!;
  request.params.active=false; doc.revision++;
  const result=simulate(doc);
  const input=measureVoltage(result,{component:'permission',terminal:'1'},{component:'supply',terminal:'N'});
  const output=measureVoltage(result,{component:'evse',terminal:'L'},{component:'evse',terminal:'N'});
  assert.ok(input.value!==null && input.value>230);
  assert.ok(output.value!==null && Math.abs(output.value)<1);
});
test('all six quick experiments offer a route to operate without guessing',()=>{
  for(const experiment of QUICK_PRACTICE_EXPERIMENTS){
    const doc=createQuickPracticeCircuit(experiment,'quick-test');
    const html=renderToStaticMarkup(createElement(QuickPracticePanel,{experiment,document:doc,result:simulate(doc),onAttempt:noop,onTarget:noop,onExit:noop,onRestart:noop}));
    assert.match(html,/I’m not sure — let me try/);
  }
});
