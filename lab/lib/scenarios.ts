import { LESSONS } from './lessons.ts';
import { simulate, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type DeviceState, type Endpoint, type Parameters, type SimulationResult } from './types.ts';
import type { AssessmentCheck } from './assessment.ts';

export type ScenarioExpectation = { title: string } & (
  | { kind: 'power'; component: string; min?: number; max?: number; relative?: { step: number; component?: string; multiplier: number; offset?: number } }
  | { kind: 'state'; component: string; key: string; equals: string | number | boolean; tolerance?: number }
  | { kind: 'parameter'; component: string; key: string; equals: string | number | boolean }
  | { kind: 'voltage'; a: Endpoint; b: Endpoint; min?: number; max?: number; expected?: number; tolerance?: number; supplyScale?: number }
  | { kind: 'voltage-ratio'; a: Endpoint; b: Endpoint; c: Endpoint; d: Endpoint; minimum: number }
  | { kind: 'voltage-spread'; pairs: { a: Endpoint; b: Endpoint }[]; maximum: number }
  | { kind: 'current'; a: Endpoint; b: Endpoint; min?: number; greaterThan?: { a: Endpoint; b: Endpoint } }
  | { kind: 'total-power'; relative: { step: number; multiplier: number; offset: number } }
);
export interface ScenarioStep {
  title: string; patches: { component: string; params: Parameters }[]; dt: number; ticks: number;
  supplyEnabled?: boolean; openSignal?: { a: Endpoint; b: Endpoint };
  expectations: ScenarioExpectation[];
}
export interface LessonScenario { lessonId: number; title: string; competency: string; steps: ScenarioStep[] }
const ep = (component: string, terminal: string): Endpoint => ({ component, terminal });
const on = (component: string, title = `${component} receives operating load power`): ScenarioExpectation => ({kind:'power',component,min:1,title});
const off = (component: string, title = `${component} operating load power stops`): ScenarioExpectation => ({kind:'power',component,max:.05,min:-.05,title});
const state = (component:string,key:string,equals:string|number|boolean,title:string):ScenarioExpectation => ({kind:'state',component,key,equals,title,tolerance:1e-5});
const close = (component:string,equals:boolean,title=`${component} contacts ${equals?'close':'open'}`) => state(component,'closed',equals,title);
const patch = (component:string,key:string,value:string|number|boolean) => ({component,params:{[key]:value}});
const step = (title:string,patches:ScenarioStep['patches']=[],expectations:ScenarioExpectation[]=[],ticks=24):ScenarioStep => ({title,patches,expectations,dt:.25,ticks});
const pulse = (component:string,title:string):ScenarioStep[] => [step(`${title}: press`,[patch(component,'pressed',true)],[],3),step(`${title}: release`,[patch(component,'pressed',false)],[],3)];
const toggled = (control:string,load:string):ScenarioStep[] => [step('Normal operating request',[],[on(load)]),step(`Open ${control}`,[patch(control,'closed',false)],[off(load)]),step(`Restore ${control}`,[patch(control,'closed',true)],[on(load)])];
const starter = (start:string,stop:string,k:string,motor:string):ScenarioStep[] => [step('Starter initially stopped',[],[close(k,false),off(motor)]),...pulse(start,`Start at ${start}`),step('Start released: auxiliary contact holds',[],[on(motor),close(k,true)]),...pulse(stop,`Stop at ${stop}`),step('Stop released: maintained request removed',[],[off(motor),close(k,false)])];
function authored(id:number):ScenarioStep[] {
  const s=step, p=patch;
  switch(id) {
    case 1:return toggled('main','light');
    case 2:return [s('Both shared-group branches operate',[],[on('load1'),on('load2')]),s('Open one outgoing MCB',[p('branch1','closed',false)],[off('load1'),on('load2','Other shared-group branch remains operating')])];
    case 3:return [s('Both independent RCBO branches operate',[],[on('load1'),on('load2')]),s('Open one independent RCBO',[p('branch1','closed',false)],[off('load1'),on('load2','Other independent RCBO branch remains operating')])];
    case 4:return toggled('remote','load');
    case 5:return [s('Normal operation with negligible SPD steady-state demand',[],[on('load'),{kind:'power',component:'spd',min:-.05,max:.05,title:'SPD is a negligible steady-state branch'}])];
    case 6:return [s('No shedding request',[],[on('priority'),on('secondary')]),s('Request priority shedding',[p('monitor','active',true)],[on('priority'),off('secondary')])];
    case 7:return [s('Switch OFF: lamp stops',[p('switch','closed',false)],[off('light'),{kind:'voltage',a:ep('light','L'),b:ep('light','N'),min:0,max:1,title:'Switch OFF: lamp voltage collapses'}]),s('Switch ON: lamp receives supply',[p('switch','closed',true)],[on('light'),{kind:'voltage',a:ep('light','L'),b:ep('light','N'),supplyScale:1,tolerance:.1,title:'Switch ON: lamp receives selected supply voltage'}])];
    case 8:return [s('Parallel luminaires share their supply',[],[on('light-a'),on('light-b'),on('light-c'),{kind:'voltage-spread',pairs:['light-a','light-b','light-c'].map(c=>({a:ep(c,'L'),b:ep(c,'N')})),maximum:.1,title:'Parallel luminaires receive nearly equal voltages'}])];
    case 9:return [s('Initial traveller route',[],[on('light')]),s('Change first two-way switch',[p('near','position',1)],[off('light')]),s('Change second two-way switch',[p('far','position',1)],[on('light')]),s('Check remaining traveller combination',[p('near','position',0)],[off('light')])];
    case 10:return [s('Initial intermediate route',[],[on('light')]),s('Cross intermediate travellers',[p('middle','position',1)],[off('light')]),s('Change end switch with crossed travellers',[p('far','position',1)],[on('light')]),s('Change near switch',[p('near','position',1)],[off('light')])];
    case 11:return [s('Both lighting gangs operate',[],[on('zone-a'),on('zone-b')]),s('Open only gang A',[p('gang-a','closed',false)],[off('zone-a'),on('zone-b')])];
    case 12:return [s('Low dimmer level',[p('dimmer','level',.25)],[on('light')]),s('High dimmer level',[p('dimmer','level',.9)],[{kind:'power',component:'light',relative:{step:0,multiplier:2},title:'Higher level increases connected lamp power'}])];
    case 13:return [s('Driver supplies its actual isolated secondary',[],[on('led'),{kind:'voltage',a:ep('driver','+'),b:ep('driver','-'),expected:24,tolerance:.1,title:'Driver output measures 24 V across its own pair'}])];
    case 14:return [s('Occupancy request operates light',[],[on('light')]),s('Remove motion request within run-on',[p('pir','active',false)],[on('light')],2),s('Allow four-second occupancy run-on to expire',[],[off('light')])];
    case 15:return [s('Darkness request operates light',[],[on('light')]),s('Remove photocell demand',[p('photo','active',false)],[off('light')])];
    case 16:return toggled('manual','light');
    case 17:return [s('Radial sockets receive operating power',[],[on('socket-a'),on('socket-b'),on('socket-c'),{kind:'current',a:ep('protect','LOUT'),b:ep('socket-a','L'),greaterThan:{a:ep('socket-b','L'),b:ep('socket-c','L')},title:'First radial segment carries more current than the last segment'}])];
    case 18:return [s('Intact ring has two current-carrying line legs',[],[on('socket-a'),on('socket-b'),on('socket-c'),{kind:'current',a:ep('socket-c','L'),b:ep('protect','LOUT'),min:.1,title:'Returning ring line leg carries current'}])];
    case 19:return [s('Fused branch and socket operate',[],[on('fixed'),on('socket-a')]),s('Open only fused branch',[p('branch-fuse','closed',false)],[off('fixed'),on('socket-a')])];
    case 20:return toggled('fcu-switch','fixed');
    case 21:return [s('Remote outlets operate',[],[on('outlet-a'),on('outlet-b')]),s('Isolate remote appliance A only',[p('grid-a','closed',false)],[off('outlet-a'),on('outlet-b')])];
    case 22:return toggled('local','appliance');
    case 23:return toggled('flow-permission','appliance');
    case 24:return [s('Separated shaver secondary operates',[],[on('shaver'),{kind:'voltage',a:ep('isolation','+'),b:ep('isolation','-'),supplyScale:230/240,tolerance:.005,title:'Secondary voltage follows the declared transformer ratio across its own isolated pair'}])];
    case 25:return [s('Both thermal permissions present',[],[on('element')]),s('Remove ordinary thermostat demand',[p('stat','closed',false)],[off('element')]),s('Independent thermal limit opens with demand present',[p('stat','closed',true),p('safety','closed',false)],[off('element')])];
    case 26:return [s('Sink selection',[],[on('sink'),off('bath')]),s('Select bath element',[p('selector','position',1)],[off('sink'),on('bath')])];
    case 27:return [s('Remove both immersion requests',[p('schedule','on',false),p('boost','closed',false)],[off('element')]),s('Restore manual boost only',[p('boost','closed',true)],[on('element')])];
    case 28:return toggled('room','boiler');
    case 29:return [s('Both zone demands',[],[on('boiler')]),s('Heating demand only',[p('cylinder','closed',false)],[close('heating-valve',true),close('water-valve',false),on('boiler')]),s('Remove both zone demands',[p('room','closed',false)],[off('boiler')])];
    case 30:return [s('Combined valve demand',[],[state('mid-valve','level',.5,'Combined demand selects mid position')]),s('Hot-water demand only',[p('room','closed',false)],[state('mid-valve','level',0,'HW-only selects position zero'),on('boiler')]),s('Heating demand only',[p('room','closed',true),p('cylinder','closed',false)],[state('mid-valve','level',1,'Heating-only selects position one'),on('boiler')]),s('Remove both demands',[p('room','closed',false)],[off('boiler')])];
    case 31:return [s('Floor condition permits heating',[],[on('mat')]),s('Floor condition exceeds setpoint',[p('probe','sensorValue',40)],[off('mat')])];
    case 32:return [s('Remove room A demand only',[p('room-a','closed',false)],[close('actuator-a',false),close('actuator-b',true),on('pump')]),s('Remove both manifold demands',[p('room-b','closed',false)],[off('pump')])];
    case 33:return [s('Charge-window permission removed',[p('offpeak','on',false)],[off('store'),on('day')]),s('Separate daytime release removed',[p('release','closed',false)],[off('day')])];
    case 34:return toggled('local','unit');
    case 35:return toggled('switch','fan');
    case 36:return [s('Light request operates fan',[],[on('fan')]),s('Remove trigger within five-second run-on',[p('light-switch','closed',false)],[on('fan')],2),s('Allow fan run-on to expire',[],[off('fan')])];
    case 37:return [s('Remove humidity and manual requests',[p('humidity','active',false),p('override','closed',false)],[off('fan')]),s('Manual override only',[p('override','closed',true)],[on('fan')])];
    case 38:case 39:return [s('Level or pressure demand operates pump',[],[on('pump')]),s('Remove demand',[p('request','active',false)],[off('pump')])];
    case 40:return starter('start','stop','starter','motor');
    case 41:return [s('Up command',[],[close('up',true),close('down',false)]),s('Down command',[p('direction','position',1)],[close('up',false),close('down',true)]),s('Selected down limit opens',[p('limit-down','closed',false)],[off('operator')])];
    case 42:return [s('Trigger one interlinked alarm',[p('smoke','alarm',true)],[state('heat','level',1,'Wired peer receives conceptual interlink request')]),{...s('Open actual interlink signal conductor',[],[state('heat','level',0,'Separated peer loses interlink request')]),openSignal:{a:ep('smoke','LINK'),b:ep('heat','LINK')}}];
    case 43:return [s('Idle doorbell push',[],[off('chime')]),...pulse('push','Doorbell push'),s('Push released',[],[off('chime')]),s('Hold doorbell push',[p('push','pressed',true)],[on('chime')])];
    case 44:return [s('Non-maintained standby',[],[state('emergency','energized',false,'Standby is not illuminated')]),{...s('Remove monitored emergency supply',[],[state('emergency','emergencyActive',true,'Backup illumination begins'),state('emergency','energized',true,'Emergency lamp illuminates')]),supplyEnabled:false}];
    case 45:return [s('Maintained SL request',[],[state('emergency','normalActive',true,'Maintained request illuminates normally')]),s('Remove normal-light SL request',[p('normal-switch','closed',false)],[state('emergency','energized',false,'Normal light stops'),state('emergency','emergencyActive',false,'Mains remains: backup stays inactive')]),{...s('Remove monitored mains with SL off',[],[state('emergency','emergencyActive',true,'Backup remains independently available')]),supplyEnabled:false}];
    case 46:return [s('Charge permission present',[],[on('evse')]),s('Remove charge permission',[p('load-control','active',false)],[off('evse')])];
    case 47:return [s('Generation offsets import'),s('Remove solar availability',[p('inverter','availability',0)],[{kind:'total-power',relative:{step:0,multiplier:1,offset:400},title:'Removing generation increases net grid import'}]),{...s('Remove external grid',[],[state('inverter','gridPresent',false,'Grid-following inverter detects external-grid absence'),off('home')]),supplyEnabled:false}];
    case 48:return [{...s('Grid absent with backup battery available',[],[on('essential'),off('ordinary')]),supplyEnabled:false}];
    case 49:return [s('Trading-hours permission',[],[on('letters-a'),on('letters-b')]),s('Remove hours permission',[p('hours','on',false)],[off('letters-a'),off('letters-b')])];
    case 50:return [s('Normal cooling',[],[on('compressor'),off('defrost-heat')]),s('Request defrost mode',[p('defrost-clock','on',true)],[off('compressor'),on('defrost-heat')])];
    case 51:return [s('Compressor running',[],[on('compressor'),off('unloader')]),s('Pressure satisfied',[p('pressure','active',false)],[off('compressor'),on('unloader')])];
    case 52:return toggled('beam','operator');
    case 53:return [s('Three phase-to-neutral demands',[],[on('phase-load1'),on('phase-load2'),on('phase-load3'),{kind:'voltage-ratio',a:ep('supply','L1'),b:ep('supply','L2'),c:ep('supply','L1'),d:ep('supply','N'),minimum:1.7,title:'Phase-to-phase voltage exceeds phase-neutral voltage by about √3'}])];
    case 54:return [s('Complete five-contact outlet',[],[state('socket','energized',true,'All active phases are available')]),s('Open linked socket isolation',[p('socket-isolation','closed',false)],[state('socket','energized',false,'Linked isolation removes outlet operating state')])];
    case 55:return starter('start','stop','starter','motor');
    case 56:return [s('Direction starter begins stopped',[],[off('motor')]),...pulse('start','Start forward'),s('Forward operation',[],[state('motor','direction',1,'Forward phase sequence is observed'),close('forward',true),close('reverse',false)]),...pulse('stop','Stop before reversal'),s('Select reverse',[p('direction','position',1)]),...pulse('start','Start reverse'),s('Reverse operation',[],[state('motor','direction',-1,'Reverse phase sequence is observed'),close('forward',false),close('reverse',true),{kind:'parameter',component:'reverse',key:'mechanicallyInterlockedWith',equals:'forward',title:'Reverse has the actual mechanical pairing'}, {kind:'parameter',component:'forward',key:'mechanicallyInterlockedWith',equals:'reverse',title:'Forward has reciprocal mechanical pairing'}])];
    case 57:return [s('Start before star–delta delay',[p('start','pressed',true)],[close('star',true),close('delta',false)],2),s('Advance star–delta transition',[p('start','pressed',false)],[close('star',false),close('delta',true),on('motor'),{kind:'parameter',component:'motor',key:'windingVoltage',equals:400,title:'Motor has the declared 400 V winding eligibility'}])];
    case 58:return [s('Drive operates at selected fundamental',[],[on('motor'),{kind:'state',component:'motor',key:'frequency',equals:35,tolerance:.01,title:'Motor reports selected 35 Hz fundamental'}]),s('Open actual dry-contact RUN loop',[p('run','closed',false)],[off('motor')])];
    case 59:return [s('Remove second heater-stage request',[p('demand-b','closed',false)],[close('stage-a',true),close('stage-b',false)]),s('Open common heater safety limit',[p('safety','closed',false)],[close('stage-a',false),close('stage-b',false)])];
    case 60:return [...starter('start-a','stop-b','starter','motor'),...starter('start-b','stop-a','starter','motor')];
    case 61:return [...pulse('start-b','Try upstream before downstream'),s('Invalid start sequence remains inhibited',[],[close('upstream',false)]),...pulse('start-a','Start downstream'),...pulse('start-b','Start permitted upstream'),s('Valid running sequence',[],[close('downstream',true),close('upstream',true)]),...pulse('stop-a','Stop downstream'),s('Downstream stop removes upstream permission',[],[close('downstream',false),close('upstream',false)])];
    case 62:return [s('Default duty A',[],[state('pump-a','energized',true,'Duty A operates'),state('pump-b','energized',false,'Duty B stays stopped')]),s('Transfer duty to B',[p('duty','position',1)],[state('pump-a','energized',false,'Duty A releases'),state('pump-b','energized',true,'Duty B operates without backfeed')]),s('High-level assist',[p('float-high','active',true)],[state('pump-a','energized',true,'Separate assist contact requests A'),state('pump-b','energized',true,'Separate assist contact requests B')])];
    case 63:return [s('Both PLC AND permissions',[],[on('motor')]),s('Remove one PLC AND permissive',[p('present','active',false)],[off('motor'),on('ol-status','Other status channel remains independent')])];
    case 64:return [s('Safety relay initially unarmed',[],[close('safety-relay',false)]),...pulse('reset','Arm stopped machine'),s('Reset arms without starting',[],[close('safety-relay',true),close('starter',false)]),...pulse('start','Start armed machine'),s('Armed machine operates',[],[on('motor')]),s('Open one safety-input channel',[p('channel-a','pressed',true)],[off('motor'),close('safety-relay',false)]),s('Restore safety channel',[p('channel-a','pressed',false)]),...pulse('reset','Rearm after restoration'),s('Rearming does not restart',[],[close('starter',false),off('motor')])];
    default:return [];
  }
}
export function lessonCompetency(id:number):string {
  if(id<=6)return 'distribution-protection';if(id<=16)return 'lighting-control';if(id<=24)return 'power-isolation';if(id<=34)return 'heating-permissions';if(id<=43)return 'control-and-metering';if(id<=48)return 'backup-and-energy';if(id<=52)return 'commercial-interlocks';return 'industrial-sequencing';
}
const SCENARIOS:LessonScenario[]=LESSONS.map(l=>({lessonId:l.id,title:l.title,competency:lessonCompetency(l.id),steps:authored(l.id)}));
export function getScenario(id:number):LessonScenario|undefined{return SCENARIOS.find(s=>s.lessonId===id);}
const CONTROL_KEYS=new Set(['closed','on','active','demand','pressed','position','alarm','availability','level','sensorValue']);
function same(a:Endpoint,b:Endpoint){return endpointKey(a)===endpointKey(b);}
function findWire(doc:CircuitDocument,a:Endpoint,b:Endpoint){return doc.wires.find(w=>same(w.from,a)&&same(w.to,b)||same(w.from,b)&&same(w.to,a));}
function current(result:SimulationResult,doc:CircuitDocument,a:Endpoint,b:Endpoint):number|null {const w=findWire(doc,a,b),n=w&&result.wireCurrents[w.id];return n?Math.hypot(n.re,n.im):null;}
export function evaluateScenarioExpectation(e:ScenarioExpectation,doc:CircuitDocument,r:SimulationResult,history:SimulationResult[]=[]):{pass:boolean|null;detail:string} {
  let value:number|string|boolean|undefined|null;let pass:boolean|null=false;
  switch(e.kind){
    case 'power':{value=doc.components.some(c=>c.id===e.component)?r.componentPower[e.component]??0:undefined;const prior=e.relative&&history[e.relative.step];const bound=e.relative&&prior?((e.relative.component?prior.componentPower[e.relative.component]:prior.componentPower[e.component])??0)*e.relative.multiplier+(e.relative.offset??0):undefined;pass=value===undefined||e.relative&&!prior?null:(e.min===undefined||value>=e.min)&&(e.max===undefined||value<=e.max)&&(bound===undefined||value>bound);break;}
    case 'state':value=r.deviceStates[e.component]?.[e.key];pass=value===undefined?null:typeof e.equals==='number'&&typeof value==='number'?Math.abs(value-e.equals)<=(e.tolerance??1e-6):value===e.equals;break;
    case 'parameter':value=doc.components.find(c=>c.id===e.component)?.params[e.key];pass=value===undefined?null:value===e.equals;break;
    case 'voltage':{value=measureVoltage(r,e.a,e.b).value;const expected=e.supplyScale!==undefined?doc.supply.voltage*e.supplyScale:e.expected;const tolerance=e.supplyScale!==undefined?doc.supply.voltage*(e.tolerance??.1):(e.tolerance??1);pass=value===null?null:(e.min===undefined||value>=e.min)&&(e.max===undefined||value<=e.max)&&(expected===undefined||Math.abs(value-expected)<=tolerance);break;}
    case 'voltage-ratio':{const a=measureVoltage(r,e.a,e.b).value,b=measureVoltage(r,e.c,e.d).value;value=a===null||b===null||b<1e-8?null:a/b;pass=value===null?null:value>e.minimum;break;}
    case 'voltage-spread':{const values=e.pairs.map(p=>measureVoltage(r,p.a,p.b).value);value=values.some(n=>n===null)?null:Math.max(...values as number[])-Math.min(...values as number[]);pass=value===null?null:value<e.maximum;break;}
    case 'current':{value=current(r,doc,e.a,e.b);const other=e.greaterThan?current(r,doc,e.greaterThan.a,e.greaterThan.b):undefined;pass=value===null||other===null?null:(e.min===undefined||value>e.min)&&(other===undefined||value>other);break;}
    case 'total-power':{value=r.totalPower;const prior=history[e.relative.step];pass=prior?value>prior.totalPower*e.relative.multiplier+e.relative.offset:null;break;}
  }
  return {pass,detail:`Observed ${value===undefined||value===null?'unresolved':typeof value==='number'?Number(value.toFixed(5)):String(value)}${e.kind==='power'||e.kind==='total-power'?' W':e.kind==='voltage'?' V':e.kind==='current'?' A':''}.`};
}
/** Execute authored experiments against the learner's actual topology. No source document/state is changed. */
export function runLessonScenarios(document:CircuitDocument,previousStates:Record<string,DeviceState>={}):AssessmentCheck[]{
  const scenario=document.lessonId&&getScenario(document.lessonId),canonical=document.lessonId&&LESSONS.find(l=>l.id===document.lessonId);
  if(!scenario||!canonical)return [{id:'scenario:unassigned',category:'objectives',status:'not-run',title:'Lesson operating objectives',explanation:'This free build has no assigned lesson sequence. The live measurements and protective findings remain available.'}];
  if(!document.supply.enabled)return [{id:'scenario:supply-off',category:'objectives',status:'not-run',title:'Lesson operating objectives',explanation:'Enable the simulated supply before running operating experiments.'}];
  const doc=structuredClone(document),checks:AssessmentCheck[]=[],history:SimulationResult[]=[];
  // Normalize only demonstrated operator controls. Keep learner wiring, ratings,
  // device modes, protection, converter parameters and mechanical pairing intact.
  for(const c of doc.components){const original=canonical.circuit.components.find(x=>x.id===c.id&&x.type===c.type);if(original)for(const [k,v]of Object.entries(original.params))if(CONTROL_KEYS.has(k))c.params[k]=v;}
  let states:Record<string,DeviceState>={};for(const [id,s]of Object.entries(previousStates))if(s.tripped)states[id]=structuredClone(s);
  const add=(id:string,status:AssessmentCheck['status'],title:string,explanation:string,component?:string)=>checks.push({id,category:'objectives',status,title,explanation,...(component?{component}:{})});
  let initial:SimulationResult|undefined;
  for(let i=0;i<24;i++){initial=simulate(doc,states,.25);states=initial.deviceStates;}
  for(const [index,action]of scenario.steps.entries()){
    const prefix=`scenario:${scenario.lessonId}:${index}`;
    const missing=action.patches.filter(p=>!doc.components.some(c=>c.id===p.component));
    if(missing.length){add(prefix+':targets','unresolved',action.title,`Required control is missing: ${missing.map(p=>p.component).join(', ')}.`);continue;}
    for(const p of action.patches){const c=doc.components.find(c=>c.id===p.component)!;Object.assign(c.params,p.params);if('closed'in p.params&&'on'in c.params)c.params.on=p.params.closed;if('pressed'in p.params&&'on'in c.params)c.params.on=p.params.pressed;}
    if(action.supplyEnabled!==undefined)doc.supply.enabled=action.supplyEnabled;
    if(action.openSignal){const w=findWire(doc,action.openSignal.a,action.openSignal.b);if(!w){add(prefix+':signal','unresolved',action.title,'The authored signal conductor is missing.');continue;}doc.faults.push({type:'wrong-control',wire:w.id,enabled:true});}
    let r=initial!;for(let i=0;i<action.ticks;i++){r=simulate(doc,states,action.dt);states=r.deviceStates;}
    history[index]=r;
    const error=r.diagnostics.find(d=>d.severity==='error');
    add(prefix+':model',r.converged&&!error?'pass':'unresolved',action.title+': electrical result',r.converged&&!error?`Resolved after ${(action.ticks*action.dt).toFixed(2)} simulated seconds.`:error?.explanation??'The experiment did not converge.');
    const trips=Object.entries(r.deviceStates).filter(([,s])=>s.tripped).map(([id])=>id);
    add(prefix+':protection',trips.length?'fail':'pass',action.title+': protection remains available',trips.length?`Interrupted protection: ${trips.join(', ')}. Repair and reset the actual defect before claiming this operating objective.`:'No protective device is latched interrupted during this experiment.');
    for(const [j,e]of action.expectations.entries()){const value=evaluateScenarioExpectation(e,doc,r,history);add(prefix+':'+j,!r.converged||value.pass===null?'unresolved':value.pass?'pass':'fail',e.title,`${action.title}. ${value.detail} These measurements describe the declared teaching model.`, 'component'in e?e.component:'a'in e?e.a.component:undefined);}
  }
  return checks;
}
