import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement, type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FaultPracticePanel} from '../components/lab/FaultPracticePanel';
import {getLesson} from '../lib/lessons';
import type {MeasurementEvidence} from '../lib/learning';

const lesson=getLesson(66)!;
const idle=()=>{};
const base:ComponentProps<typeof FaultPracticePanel>={
  lesson,doc:lesson.circuit,stage:'measure',worktop:false,scored:false,hints:0,clue:'',feedback:'',
  diagnosis:'',setDiagnosis:idle,submit:idle,checking:false,repair:idle,test:idle,testing:false,failed:false,
  openReport:idle,showClue:idle,closeTools:idle,openMeter:idle,next:idle,readings:{},samples:[],missing:'',
  wrongPoints:false,scoreThis:idle,switchOn:true,operateSwitch:idle,
};
const show=(change:Partial<typeof base>)=>renderToStaticMarkup(createElement(FaultPracticePanel,{...base,...change}));
const reading=(id:string,measuredAt:string,value:number|null,mode:MeasurementEvidence['mode']='voltage'):MeasurementEvidence=>({
  id,measuredAt,value,mode,unit:mode==='voltage'?'V':mode==='resistance'?'Ω':'A',
  circuitId:lesson.circuit.id,revision:lesson.circuit.revision,explanation:'',recordedAt:1,controlState:{},
});

test('fault question shows the measurements taken, including zero, signed volts and an open ohms reading',()=>{
  const html=show({stage:'diagnose',samples:[
    {...reading('a','Across the return',null,'resistance'),status:'open'},
    reading('b','At the strip',0),
    reading('c','At the switch',-23.98),
  ]});
  assert.match(html,/At the strip<\/dt><dd>0 V/);
  assert.match(html,/At the switch<\/dt><dd>-24 V/);
  assert.match(html,/Earlier readings \(1\)/);
  assert.match(html,/Across the return<\/dt><dd>OL · open circuit/);
  assert.doesNotMatch(html,/The break is between|Repair fault/);
});

test('fault practice keeps the probe that was used as the return when the learner swaps the leads',()=>{
  const strip={...reading('strip','Right strip',0),a:{component:'right',terminal:'N'}};
  const html=show({worktop:true,readings:{strip},samples:[strip],context:createElement('div',null,'Open meter')});
  assert.match(html,/Keep red on −\. Move black to terminal 1 on the right switch/);
  assert.match(html,/Show a clue/);
  assert.doesNotMatch(html,/Repair fault|Check my diagnosis|Use the meter|Your saved readings/);
});

test('the report comes first when a retest fails and points appear only after a scored repair passes',()=>{
  const failed=show({stage:'retest',failed:true,scored:true,hints:2});
  assert.ok(failed.indexOf('See test report')<failed.indexOf('Test the repair'));
  assert.doesNotMatch(failed,/Choose another job|70\/100/);
  assert.match(show({stage:'done',scored:true,hints:2}),/70\/100/);
  assert.doesNotMatch(show({stage:'done'}),/\/100/);
});

test('a powered-down repair asks to restore the supply before a fresh test',()=>{
  const html=show({stage:'retest',restoreSupply:idle});
  assert.match(html,/Turn bench supply on/);
  assert.doesNotMatch(html,/Test the repair|The repair passed/);
  assert.match(show({stage:'retest'}),/Test the repair/);
});

test('heater instructions follow the learner’s leads and name the fitting on this particular bench',()=>{
  const current=getLesson(20)!,older=structuredClone(current.circuit);
  older.components.find(c=>c.id==='fcu-switch')!.type='switch';
  const legacy=getLesson(20,older)!;
  const heater={...reading('load','Heater',0),a:{component:'fixed',terminal:'N'},b:{component:'fixed',terminal:'L'}};
  const first=show({lesson:current,doc:current.circuit,heater:{},switchOn:false});
  assert.match(first,/rocker on the white wall plate/);
  assert.doesNotMatch(first,/Choose the fault|Repair this wire|The flex has lost/);
  for(const [lesson,point] of [[current,/L terminal on the LOAD side/],[legacy,/OUT on the separate fuse/]] as const){
    const html=show({lesson,doc:lesson.circuit,heater:{heater},wrongPoints:true});
    assert.match(html,/Leave red on heater N. Move black/);assert.match(html,point);
    assert.match(html,/Reading saved. For this check/);
  }
});
