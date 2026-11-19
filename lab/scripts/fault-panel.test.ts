import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement, type ComponentProps} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FaultPracticePanel} from '../components/lab/FaultPracticePanel';
import HeaterFlexChoice,{flexClue,type FlexLanding} from '../components/lab/HeaterFlexChoice';
import {getLesson} from '../lib/lessons';
import type {MeasurementEvidence} from '../lib/learning';

const lesson=getLesson(66)!;
const idle=()=>{};
const base:Omit<ComponentProps<typeof FaultPracticePanel>,'switchOn'>={
  lesson,doc:lesson.circuit,stage:'measure',worktop:false,scored:false,hints:0,clue:'',feedback:'',
  diagnosis:'',setDiagnosis:idle,submit:idle,checking:false,repair:idle,test:idle,testing:false,failed:false,
  openReport:idle,showClue:idle,closeTools:idle,openMeter:idle,next:idle,readings:{},samples:[],missing:'',
  wrongPoints:false,scoreThis:idle,operateSwitch:idle,
};
const show=(change:Partial<typeof base>)=>{
  const props={...base,...change};
  const switchId=props.heater?'fcu-switch':'right-switch';
  const switchOn=props.doc.components.find(c=>c.id===switchId)?.params.closed===true;
  return renderToStaticMarkup(createElement(FaultPracticePanel,{...props,switchOn}));
};
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
  assert.match(html,/Keep red on the strip’s − pad\. Move black to terminal 1 on the right switch/);
  assert.match(html,/Right strip · <b>0 V/);
  assert.match(html,/Show a clue/);
  assert.doesNotMatch(html,/Repair fault|Check my diagnosis|Use the meter|Your saved readings/);
});

test('the right worktop job identifies the actual measured point and keeps the repair separate from the readings',()=>{
  const left={...reading('wrong','Left strip',24),a:{component:'left',terminal:'L'},b:{component:'left',terminal:'N'}};
  const strip={...reading('strip','Dark strip',0),a:{component:'right',terminal:'N'},b:{component:'right',terminal:'L'}};
  const feed={...reading('incoming','Right switch input',-24),a:strip.a,b:{component:'right-switch',terminal:'COM'}};
  assert.match(show({worktop:true,wrongPoints:true,wrongSample:left}),/That’s the left strip/);
  const html=show({worktop:true,wrongPoints:true,wrongSample:feed,readings:{strip}});
  assert.match(html,/feed from the driver at 2\. Move black to terminal 1/);
  assert.doesNotMatch(html,/Reconnect strip wire|You found voltage at the switch/);
  const changedCommon=show({worktop:true,wrongPoints:true,wrongSample:{...feed,a:left.b},readings:{strip}});
  assert.match(changedCommon,/Put red back on the − pad of the right strip/);
  const old=structuredClone(lesson.circuit);
  delete old.components.find(c=>c.id==='right-switch')!.variant;
  const saved=getLesson(66,old)!;
  const olderCard=show({lesson:saved,doc:saved.circuit,worktop:true,readings:{strip}});
  assert.match(olderCard,/terminal L1 on the right switch/);
  assert.doesNotMatch(olderCard,/terminal 1 on the right switch/);
  const checked=show({worktop:true,stage:'retest',worktopStatus:'Left strip lit · Right strip lit'});
  assert.equal(checked.match(/Left strip lit · Right strip lit/g)?.length,1);
  assert.doesNotMatch(checked,/You restored the feed/);
  assert.match(show({worktop:true,stage:'done'}),/You restored the feed to the right worktop light and tested the repair/);
});

test('the strip landing uses its own blade markings and leaves the heater and chime instructions intact',()=>{
  const landing:FlexLanding={point:{component:'right-switch',terminal:'OUT'},rockerTerminals:[['COM','2'],['OUT','1']],connect:()=>false};
  assert.match(renderToStaticMarkup(createElement(HeaterFlexChoice,{landing})),/Reconnect strip wire/);
  assert.match(flexClue('COM',landing),/driver already feeds 2/);
  assert.doesNotMatch(flexClue('COM',landing),/heater|earth|neutral|door/);
  assert.match(flexClue('NOUT'),/neutral/);
  assert.match(flexClue('FRONT',{...landing,rockerTerminals:undefined,chimeTerminals:[['REAR','C2']]}),/front door call/);
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
  for(const [lesson,point] of [[current,/LOAD L on the wall switch/],[legacy,/OUT on the separate fuse/]] as const){
    const open=structuredClone(lesson.circuit);
    open.components.find(c=>c.id==='fcu-switch')!.params.closed=false;
    const first=show({lesson,doc:open,heater:{}});
    assert.match(first,/Turn the heater on at the wall/);
    assert.match(first,/Turn heater switch on/);
    assert.match(first,/I’ve tried the wall switch/);
    assert.doesNotMatch(first,/Choose the fault|Repair this wire|The flex has lost/);
    const switched=show({lesson,doc:lesson.circuit,heater:{}});
    assert.match(switched,/On the bench, check L to N at the heater/);
    assert.match(switched,/Use the bench meter/);
    const props={lesson,doc:lesson.circuit,heater:{heater},context:createElement('div',null,'Open meter')};
    const html=show(props);
    assert.match(html,/Leave red on heater N. Move black/);assert.match(html,point);
    assert.match(html,/At the heater · <b>0 V/);
    const wrongSample={...heater,a:{component:'supply',terminal:'N'}};
    const wrong=show({...props,wrongPoints:true,wrongSample});
    assert.match(wrong,/Put red back on N at the heater/);
    assert.doesNotMatch(wrong,/Repair this wire|You found the fault/);
  }
});
