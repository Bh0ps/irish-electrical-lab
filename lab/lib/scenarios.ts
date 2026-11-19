import { describeEndpoint } from './endpoint-description.ts';
import { getLesson, LESSONS, olderTimerFan } from './lessons.ts';
import { simulate, measureVoltage } from './simulation.ts';
import { endpointKey, type CircuitDocument, type DeviceState, type Endpoint, type Parameters, type SimulationResult } from './types.ts';
import type { AssessmentCheck, CheckReading } from './assessment.ts';

export type ScenarioExpectation = { title: string } & (
  | { kind: 'power'; component: string; min?: number; max?: number; relative?: { step: number; component?: string; multiplier: number; offset?: number } }
  | { kind: 'state'; component: string; key: string; equals: string | number | boolean; tolerance?: number }
  | { kind: 'parameter'; component: string; key: string; equals: string | number | boolean }
  | { kind: 'voltage'; a: Endpoint; b: Endpoint; min?: number; max?: number; expected?: number; tolerance?: number; supplyScale?: number }
  | { kind:'isolated'; a:Endpoint; b:Endpoint }
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
const on = (component: string, title = ''): ScenarioExpectation => ({kind:'power',component,min:1,title});
const off = (component: string, title = ''): ScenarioExpectation => ({kind:'power',component,max:.05,min:-.05,title});
const state = (component:string,key:string,equals:string|number|boolean,title:string):ScenarioExpectation => ({kind:'state',component,key,equals,title,tolerance:1e-5});
const close = (component:string,equals:boolean,title='') => state(component,'closed',equals,title);
const patch = (component:string,key:string,value:string|number|boolean) => ({component,params:{[key]:value}});
const step = (title:string,patches:ScenarioStep['patches']=[],expectations:ScenarioExpectation[]=[],ticks=24):ScenarioStep => ({title,patches,expectations,dt:.25,ticks});
const pulse = (component:string,press:string,release:string):ScenarioStep[] => [
  step(press,[patch(component,'pressed',true)],[],3),
  step(release,[patch(component,'pressed',false)],[],3)
];
const toggled = (control:string,load:string,turnOff:string,turnOn:string):ScenarioStep[] => [step('Check the circuit with the control on',[],[on(load)]),step(turnOff,[patch(control,'closed',false)],[off(load)]),step(turnOn,[patch(control,'closed',true)],[on(load)])];
const starter = (start:string,stop:string,k:string,motor:string):ScenarioStep[] => [step('Check the motor before pressing Start',[],[close(k,false),off(motor)]),...pulse(start,start.endsWith('-a')?'Press Start at station A':start.endsWith('-b')?'Press Start at station B':'Press Start','Let go of Start'),step('Release Start and see whether the motor keeps running',[],[on(motor),close(k,true)]),...pulse(stop,stop.endsWith('-a')?'Press Stop at station A':stop.endsWith('-b')?'Press Stop at station B':'Press Stop','Let go of Stop'),step('Release Stop and check that the motor stays off',[],[off(motor),close(k,false)])];
function authored(id:number):ScenarioStep[] {
  const s=step, p=patch;
  switch(id) {
    case 1:return toggled('main','light','Open the main switch','Close the main switch');
    case 2:return [s('Try the lamp and socket together',[],[on('load1'),on('load2')]),s('Switch off the first breaker',[p('branch1','closed',false)],[off('load1'),on('load2','The other circuit stays on')])];
    case 3:return [s('Try both circuits with their breakers on',[],[on('load1'),on('load2')]),s('Switch off the first RCBO',[p('branch1','closed',false)],[off('load1'),on('load2','The other circuit stays on')])];
    case 4:return toggled('remote','load','Switch off the remote board','Switch the remote board back on');
    case 5:return [s('Check the surge protector with the load on',[],[on('load'),{kind:'power',component:'spd',min:-.05,max:.05,title:'The surge protector draws almost no power in normal use'}])];
    case 6:return [s('Run both loads',[],[on('priority'),on('secondary')]),s('Give the priority load first call on the supply',[p('monitor','active',true)],[on('priority'),off('secondary')])];
    case 7:return [s('Turn the wall switch off',[p('switch','closed',false)],[off('light'),{kind:'voltage',a:ep('light','L'),b:ep('light','N'),min:0,max:1,title:'Voltage across the lamp falls close to zero'}]),s('Turn the wall switch on',[p('switch','closed',true)],[on('light'),{kind:'voltage',a:ep('light','L'),b:ep('light','N'),supplyScale:1,tolerance:.1,title:'Voltage across the lamp rises close to the supply voltage'}])];
    case 8:return [s('Measure across each lamp',[],[on('light-a'),on('light-b'),on('light-c'),{kind:'voltage-spread',pairs:['light-a','light-b','light-c'].map(c=>({a:ep(c,'L'),b:ep(c,'N')})),maximum:.1,title:'All three lamps have nearly the same voltage'}])];
    case 9:return [s('Check the lamp before moving either switch',[],[on('light')]),s('Flip the switch at the foot of the stairs',[p('near','position',1)],[off('light')]),s('Flip the landing switch',[p('far','position',1)],[on('light')]),s('Flip the first switch again',[p('near','position',0)],[off('light')])];
    case 10:return [s('Check the lamp before moving a switch',[],[on('light')]),s('Flip the middle switch',[p('middle','position',1)],[off('light')]),s('Flip the far switch',[p('far','position',1)],[on('light')]),s('Flip the near switch',[p('near','position',1)],[off('light')])];
    case 11:return [s('Turn both lights on',[],[on('zone-a'),on('zone-b')]),s('Turn off switch A',[p('gang-a','closed',false)],[off('zone-a'),on('zone-b')])];
    case 12:return [s('Turn the dimmer down to 25%',[p('dimmer','level',.25)],[on('light')]),s('Turn the dimmer up to 90%',[p('dimmer','level',.9)],[{kind:'power',component:'light',relative:{step:0,multiplier:2},title:'The lamp draws more watts at the higher setting'}])];
    case 13:return [s('Measure the output of the LED driver',[],[on('led'),{kind:'voltage',a:ep('driver','+'),b:ep('driver','-'),expected:24,tolerance:.1,title:'Driver output measures 24 V across its own pair'}])];
    case 14:return [s('Move in front of the detector',[],[on('light')]),s('Stop the movement and watch the lamp',[p('pir','active',false)],[on('light')],2),s('Wait four seconds and check the lamp again',[],[off('light')])];
    case 15:return [s('Try the light after dark',[],[on('light')]),s('Let daylight reach the sensor',[p('photo','active',false)],[off('light')])];
    case 16:return toggled('manual','light','Turn the wall switch off','Turn the wall switch on');
    case 17:return [s('Check the three sockets on the radial',[],[on('socket-a'),on('socket-b'),on('socket-c'),{kind:'current',a:ep('protect','LOUT'),b:ep('socket-a','L'),greaterThan:{a:ep('socket-b','L'),b:ep('socket-c','L')},title:'The feed to the first socket carries more current than the last length of cable'}])];
    case 18:return [s('Check the two ends of the ring at the board',[],[on('socket-a'),on('socket-b'),on('socket-c'),{kind:'current',a:ep('socket-c','L'),b:ep('protect','LOUT'),min:.1,title:'Current flows in the line wire returning to the board'}])];
    case 19:return [s('Check the appliance and the socket',[],[on('fixed'),on('socket-a')]),s('Switch off the fused branch',[p('branch-fuse','closed',false)],[off('fixed'),on('socket-a')])];
    case 20:return toggled('fcu-switch','fixed','Turn off the fused switch','Turn the fused switch back on');
    case 21:return [s('Check the two kitchen outlets',[],[on('outlet-a'),on('outlet-b')]),s('Switch off appliance A at the wall',[p('grid-a','closed',false)],[off('outlet-a'),on('outlet-b')])];
    case 22:return toggled('local','appliance','Turn off the cooker isolator','Turn the cooker isolator back on');
    case 23:return toggled('flow-permission','appliance','Stop the water flow','Restore the water flow');
    case 24:return [s('Try the shaver outlet',[],[on('shaver'),{kind:'voltage',a:ep('isolation','+'),b:ep('isolation','-'),supplyScale:230/240,tolerance:.005,title:'The voltage across the outlet follows the transformer ratio'}])];
    case 25:return [s('Call for heat with the cut-out closed',[],[on('element')]),s('Turn down the immersion thermostat',[p('stat','closed',false)],[off('element')]),s('Open the cut-out while the thermostat calls for heat',[p('stat','closed',true),p('safety','closed',false)],[off('element')])];
    case 26:return [s('Try the sink setting',[],[on('sink'),off('bath')]),s('Switch to Bath',[p('selector','position',1)],[off('sink'),on('bath')])];
    case 27:return [s('Turn the timer and boost off',[p('schedule','on',false),p('boost','closed',false)],[off('element')]),s('Turn boost back on',[p('boost','closed',true)],[on('element')])];
    case 28:return toggled('room','boiler','Turn the room thermostat down','Turn the room thermostat up');
    case 29:return [s('Call for heat in both zones',[],[on('boiler')]),s('Call for heating only',[p('cylinder','closed',false)],[close('heating-valve',true),close('water-valve',false),on('boiler')]),s('Turn down both thermostats',[p('room','closed',false)],[off('boiler')])];
    case 30:return [s('Call for heating and hot water together',[],[state('mid-valve','level',.5,'With both thermostats calling, the valve sits midway')]),s('Call for hot water only',[p('room','closed',false)],[state('mid-valve','level',0,'The valve opens to hot water only'),on('boiler')]),s('Call for heating only',[p('room','closed',true),p('cylinder','closed',false)],[state('mid-valve','level',1,'The valve opens to heating only'),on('boiler')]),s('Turn down both thermostats',[p('room','closed',false)],[off('boiler')])];
    case 31:return [s('Call for heat with the floor cool',[],[on('mat')]),s('Raise the floor temperature above the limit',[p('probe','sensorValue',40)],[off('mat')])];
    case 32:return [s('Turn down the thermostat in room A',[p('room-a','closed',false)],[close('actuator-a',false),close('actuator-b',true),on('pump')]),s('Turn down the other room thermostat',[p('room-b','closed',false)],[off('pump')])];
    case 33:return [s('Let the off-peak charging period end',[p('offpeak','on',false)],[off('store'),on('day')]),s('Switch off the daytime fan',[p('release','closed',false)],[off('day')])];
    case 34:return toggled('local','unit','Turn off the local switch','Turn the local switch back on');
    case 35:return toggled('switch','fan','Turn off the fan switch','Turn the fan switch back on');
    case 36:return [s('Check the bathroom light and fan',[],[on('fan'),on('light')]),s('Turn the light off and watch the fan',[p('light-switch','closed',false)],[on('fan'),off('light')],2),s('Wait for the fan timer to finish',[],[off('fan'),off('light')]),s('Turn the light back on',[p('light-switch','closed',true)],[on('fan'),on('light')]),s('Switch off the fan isolator',[p('fan-isolation','closed',false)],[off('fan'),on('light'),state('runon','energized',false,'The fan timer loses its supply')]),s('Restore the fan isolator',[p('fan-isolation','closed',true)],[on('fan'),on('light')])];
    case 37:return [s('Set the sensor to dry and turn off the override',[p('humidity','active',false),p('override','closed',false)],[off('fan')]),s('Try the fan override',[p('override','closed',true)],[on('fan')])];
    case 38:case 39:return [s(id===38?'Raise the float':'Lower the water pressure',[],[on('pump')]),s(id===38?'Lower the float':'Raise the pressure',[p('request','active',false)],[off('pump')])];
    case 40:return starter('start','stop','starter','motor');
    case 41:return [s('Raise the shutter',[],[close('up',true),close('down',false)]),s('Lower the shutter',[p('direction','position',1)],[close('up',false),close('down',true)]),s('Reach the lower limit switch',[p('limit-down','closed',false)],[off('operator')])];
    case 42:return [s('Trigger one interlinked alarm',[p('smoke','alarm',true)],[state('heat','level',1,'The heat alarm sounds too')]),{...s('Disconnect the wire linking the alarms',[],[state('heat','level',0,'The heat alarm stops receiving the signal')]),openSignal:{a:ep('smoke','LINK'),b:ep('heat','LINK')}}];
    case 43:return [s('Check the bell before pressing the button',[],[off('chime')]),...pulse('push','Press the bell button','Let go of the bell button'),s('Check the bell with the button released',[],[off('chime')]),s('Hold the bell button down',[p('push','pressed',true)],[on('chime')])];
    case 44:return [s('Check the lamp with mains power on',[],[state('emergency','energized',false,'The lamp stays dark on standby')]),{...s('Switch off the mains supply to the fitting',[],[state('emergency','emergencyActive',true,'The battery takes over'),state('emergency','energized',true,'The emergency lamp lights')]),supplyEnabled:false}];
    case 45:return [s('Turn the normal light switch on',[],[state('emergency','normalActive',true,'The lamp lights on mains power')]),s('Turn the normal light switch off',[p('normal-switch','closed',false)],[state('emergency','energized',false,'The lamp goes out'),state('emergency','emergencyActive',false,'With mains still present, the battery stays on standby')]),{...s('Cut mains power with the light switch off',[],[state('emergency','emergencyActive',true,'The lamp comes on from its battery')]),supplyEnabled:false}];
    case 46:return [s('Allow the car to charge',[],[on('evse')]),s('Pause charging at the load controller',[p('load-control','active',false)],[off('evse')])];
    case 47:return [s('Check grid power with the solar panels generating'),s('Try the same load with no sunlight',[p('inverter','availability',0)],[{kind:'total-power',relative:{step:0,multiplier:1,offset:400},title:'With the panels shaded, the house takes more power from the grid'}]),{...s('Switch off the grid supply',[],[state('inverter','gridPresent',false,'The inverter detects the loss of mains'),off('home')]),supplyEnabled:false}];
    case 48:return [{...s('Switch off the mains and try the backup supply',[],[on('essential'),off('ordinary')]),supplyEnabled:false}];
    case 49:return [s('Try the shop sign during opening hours',[],[on('letters-a'),on('letters-b')]),s('Set the clock to closing time',[p('hours','on',false)],[off('letters-a'),off('letters-b')])];
    case 50:return [s('Normal cooling',[],[on('compressor'),off('defrost-heat')]),s('Set the timer to defrost',[p('defrost-clock','on',true)],[off('compressor'),on('defrost-heat')])];
    case 51:return [s('Compressor running',[],[on('compressor'),off('unloader')]),s('Raise the pressure to the cut-off point',[p('pressure','active',false)],[off('compressor'),on('unloader')])];
    case 52:return toggled('beam','operator','Break the safety beam','Clear the safety beam');
    case 53:return [s('Check one load on each phase',[],[on('phase-load1'),on('phase-load2'),on('phase-load3'),{kind:'voltage-ratio',a:ep('supply','L1'),b:ep('supply','L2'),c:ep('supply','L1'),d:ep('supply','N'),minimum:1.7,title:'Expect about 400 V between phases and 230 V from phase to neutral'}])];
    case 54:return [s('Check the three-phase socket with its switch on',[],[state('socket','energized',true,'All three phases reach the socket')]),s('Turn off the socket isolator',[p('socket-isolation','closed',false)],[state('socket','energized',false,'The socket loses power on all three phases')])];
    case 55:return starter('start','stop','starter','motor');
    case 56:return [s('Check the motor before selecting a direction',[],[off('motor')]),...pulse('start','Start forward','Let go of Start'),s('Check which way the motor turns',[],[state('motor','direction',1,'The motor runs forwards'),close('forward',true),close('reverse',false)]),...pulse('stop','Stop before reversal','Let go of Stop'),s('Select reverse',[p('direction','position',1)]),...pulse('start','Start reverse','Let go of Start'),s('Check the motor in reverse',[],[state('motor','direction',-1,'The motor runs in reverse'),close('forward',false),close('reverse',true),{kind:'parameter',component:'reverse',key:'mechanicallyInterlockedWith',equals:'forward',title:'The reverse contactor is linked to the forward contactor'}, {kind:'parameter',component:'forward',key:'mechanicallyInterlockedWith',equals:'reverse',title:'The forward contactor is linked to the reverse contactor'}])];
    case 57:return [s('Press Start and watch the star contactor',[p('start','pressed',true)],[close('star',true),close('delta',false)],2),s('Release Start and wait for the timer',[p('start','pressed',false)],[close('star',false),close('delta',true),on('motor'),{kind:'parameter',component:'motor',key:'windingVoltage',equals:400,title:'Each motor winding is rated for 400 V'}])];
    case 58:return [s('Run the motor with the drive set to 35 Hz',[],[on('motor'),{kind:'state',component:'motor',key:'frequency',equals:35,tolerance:.01,title:'The drive supplies the motor at 35 Hz'}]),s('Open the switch between RUN and COM',[p('run','closed',false)],[off('motor')])];
    case 59:return [s('Switch off heater stage two',[p('demand-b','closed',false)],[close('stage-a',true),close('stage-b',false)]),s('Trip the cut-out for both heaters',[p('safety','closed',false)],[close('stage-a',false),close('stage-b',false)])];
    case 60:return [...starter('start-a','stop-b','starter','motor'),...starter('start-b','stop-a','starter','motor')];
    case 61:return [...pulse('start-b','Try starting the feed belt first','Let go of the feed belt Start button'),s('Check the feed belt with the receiving belt stopped',[],[close('upstream',false)]),...pulse('start-a','Start the receiving belt','Let go of the receiving belt Start button'),...pulse('start-b','Start the feed belt','Let go of the feed belt Start button'),s('Check that both belts are running',[],[close('downstream',true),close('upstream',true)]),...pulse('stop-a','Stop the receiving belt','Let go of the receiving belt Stop button'),s('Check the feed belt after stopping the receiving belt',[],[close('downstream',false),close('upstream',false)])];
    case 62:return [s('Try pump A first',[],[state('pump-a','energized',true,'Pump A runs'),state('pump-b','energized',false,'Pump B stays off')]),s('Select pump B',[p('duty','position',1)],[state('pump-a','energized',false,'Pump A stops'),state('pump-b','energized',true,'Pump B runs on its own')]),s('Lift the high-level float',[p('float-high','active',true)],[state('pump-a','energized',true,'Pump A runs with the float up'),state('pump-b','energized',true,'Pump B runs with the float up')])];
    case 63:return [s('Give the controller both start signals',[],[on('motor')]),s('Remove one of the two start signals',[p('present','active',false)],[off('motor'),on('ol-status','The other status light stays on')])];
    case 64:return [s('Check the relay before Reset',[],[close('safety-relay',false)]),...pulse('reset','Press Reset with the motor stopped','Let go of Reset'),s('Check the motor after Reset',[],[close('safety-relay',true),close('starter',false)]),...pulse('start','Press Start','Let go of Start'),s('Check that the motor is running',[],[on('motor')]),s('Open one safety contact',[p('channel-a','pressed',true)],[off('motor'),close('safety-relay',false)]),s('Close the safety contact again',[p('channel-a','pressed',false)]),...pulse('reset','Press Reset again','Let go of Reset'),s('Check that the motor still waits for Start',[],[close('starter',false),off('motor')])];
    case 65:return [s('Close the cupboard door',[p('door','closed',false)],[off('strip')]),s('Open the cupboard door',[p('door','closed',true)],[on('strip')])];
    case 66:return [s('Light the right worktop only',[p('left-switch','closed',false)],[off('left'),on('right')]),s('Swap the lit worktop',[p('left-switch','closed',true),p('right-switch','closed',false)],[on('left'),off('right')])];
    case 67:return [s('Check the far end of the strip with one feed',[p('inject','closed',false)],[{kind:'voltage',a:ep('far','L'),b:ep('far','N'),min:21,max:22.7,title:'The voltage drops towards the far end of the strip'}]),s('Connect the second feed',[p('inject','closed',true)],[{kind:'voltage',a:ep('far','L'),b:ep('far','N'),min:23.8,max:24.1,title:'The far end now reads close to the driver voltage'}])];
    case 68:return [s('Set the dimmer to 25%',[p('pwm','level',.25)],[{kind:'power',component:'strip',min:2.9,max:3.1,title:'At 25%, the strip uses about 3 W'}]),s('Set the dimmer to 75%',[p('pwm','level',.75)],[{kind:'power',component:'strip',min:8.8,max:9.1,title:'At 75%, the strip uses about 9 W'}])];
    case 69:return [s('Light the warm LEDs',[p('controller','mix',0)],[on('tape'),state('tape','coolWatts',0,'Cool channel off')]),s('Light the cool LEDs',[p('controller','mix',1)],[on('tape'),state('tape','warmWatts',0,'Warm channel off')]),s('Mix both channels equally',[p('controller','mix',.5)],[{kind:'state',component:'tape',key:'warmWatts',equals:6,tolerance:.15,title:'Warm channel delivers about 6 W'},{kind:'state',component:'tape',key:'coolWatts',equals:6,tolerance:.15,title:'Cool channel delivers about 6 W'}])];
    case 70:return [s('Take a reading with both LEDs on',[],[on('first'),on('second'),{kind:'current',a:ep('link','OUT'),b:ep('second','L'),min:.347,title:'The same current flows through both LEDs'},{kind:'voltage',a:ep('first','L'),b:ep('first','N'),min:8.9,max:9.1,title:'The meter reads about 9 V across the first LED'}]),s('Open the series link',[p('link','closed',false)],[off('first'),off('second')]),s('Close the link to light both LEDs again',[p('link','closed',true)],[on('first'),on('second')])];
    case 71:return [s('Press the front push',[p('front','pressed',true)],[on('bell')]),s('Release the front push',[p('front','pressed',false)],[off('bell')]),s('Press the rear push',[p('rear','pressed',true)],[on('bell')]),s('Release the rear push',[p('rear','pressed',false)],[off('bell')])];
    case 72:return [s('Press the front door button',[p('front','pressed',true)],[state('chime','call','Front','The chime shows Front')]),s('Let go of the front button',[p('front','pressed',false)],[state('chime','call','Idle','The call clears')]),s('Press the back door button',[p('back','pressed',true)],[state('chime','call','Rear','The chime shows a call from the back door')])];
    case 73:return [s('Press the call button',[p('call','pressed',true)],[on('beacon')],2),s('Let go and watch the light',[p('call','pressed',false)],[on('beacon')],2),s('Wait four seconds and check the light',[],[off('beacon')],20)];
    case 74:return [s('Open the door',[p('door','closed',true)],[on('lamp'),on('buzzer')]),s('Acknowledge the warning',[p('ack','pressed',true)],[on('lamp'),off('buzzer')]),s('Let go of the Acknowledge button',[p('ack','pressed',false)],[close('memory',true),off('buzzer')]),s('Close the door to reset the warning',[p('door','closed',false)],[close('memory',false),off('lamp')]),s('Open for a fresh warning',[p('door','closed',true)],[on('lamp'),on('buzzer')])];
    case 75:return [s('Turn the room thermostat up',[p('stat','closed',true)],[close('interface',true),on('call'),{kind:'isolated',a:ep('supply-a','-'),b:ep('equipment','-'),title:'The two control supplies stay electrically separate'}]),s('Turn the room thermostat down',[p('stat','closed',false)],[close('interface',false),off('call')])];
    case 76:return [s('Open the valve',[p('enable','closed',true),p('direction','position',0)],[state('actuator','level',1,'The valve is fully open')]),s('Start closing the valve',[p('direction','position',1)],[state('actuator','direction',-1,'The valve starts to close')],8),s('Hold at the current position',[p('enable','closed',false)],[state('actuator','direction',0,'The control has stopped driving the valve'),state('actuator','moving',false,'The valve stays where it stopped')]),s('Let the valve close the rest of the way',[p('enable','closed',true)],[state('actuator','level',0,'The valve is fully closed')])];
    case 77:return [s('Check the controls with the water at its normal level',[p('float','position',0)],[on('permit'),off('alarm')]),s('Raise the float',[p('float','position',1)],[off('permit'),on('alarm')]),s('Lower the float',[p('float','position',0)],[on('permit'),off('alarm')])];
    case 78:return [s('Bring metal to the sensor',[p('sensor','active',true)],[on('pilot')]),s('Move the target away',[p('sensor','active',false)],[off('pilot'),state('sensor','energized',true,'The sensor still has power')])];
    case 79:return [s('Remove the beacon fuse',[p('beacon-fuse','closed',false)],[off('beacon'),on('instrument')]),s('Put the beacon fuse back',[p('beacon-fuse','closed',true)],[on('beacon'),on('instrument')])];
    case 80:return [s('Press the entrance push',[p('push','pressed',true)],[on('bell'),close('interface',true),on('courtesy'),{kind:'isolated',a:ep('tx','-'),b:ep('driver','-'),title:'The bell and the light still have separate supplies'}]),s('Release the entrance push',[p('push','pressed',false)],[off('bell'),close('interface',false),off('courtesy')])];
    default:return [];
  }
}
export function lessonCompetency(id:number):string {
  if(id>=65)return id<=70?'extra-low-voltage-lighting':id<=74?'extra-low-voltage-signalling':'extra-low-voltage-controls';if(id<=6)return 'distribution-protection';if(id<=16)return 'lighting-control';if(id<=24)return 'power-isolation';if(id<=34)return 'heating-permissions';if(id<=43)return 'control-and-metering';if(id<=48)return 'backup-and-energy';if(id<=52)return 'commercial-interlocks';return 'industrial-sequencing';
}
const SCENARIOS: LessonScenario[] = LESSONS.map(lesson => {
  const steps = authored(lesson.id);
  for (const step of steps) for (const check of step.expectations) {
    if (check.title || !('component' in check)) continue;
    const name = lesson.circuit.components.find(c => c.id === check.component)?.label ?? check.component;
    if (check.kind === 'power') check.title = name + (check.max === undefined ? ' draws power' : ' stops drawing power');
    if (check.kind === 'state' && check.key === 'closed') check.title = name + (check.equals ? ' closes' : ' opens');
  }
  return {lessonId: lesson.id, title: lesson.title, competency: lessonCompetency(lesson.id), steps};
});
export function getScenario(id:number,doc?:CircuitDocument):LessonScenario|undefined{
  const scenario=SCENARIOS.find(s=>s.lessonId===id);
  return id===36&&scenario&&olderTimerFan(doc)?{...scenario,steps:scenario.steps.slice(0,3).map((step,i)=>({...step,title:['Check that the fan is running','Turn the wall switch off','Wait for the fan to stop'][i],expectations:step.expectations.slice(0,1)}))}:scenario;
}
const CONTROL_KEYS=new Set(['closed','on','active','demand','pressed','position','alarm','availability','level','mix','sensorValue']);
function same(a:Endpoint,b:Endpoint){return endpointKey(a)===endpointKey(b);}
function findWire(doc:CircuitDocument,a:Endpoint,b:Endpoint){return doc.wires.find(w=>same(w.from,a)&&same(w.to,b)||same(w.from,b)&&same(w.to,a));}
function current(result:SimulationResult,doc:CircuitDocument,a:Endpoint,b:Endpoint):number|null {const w=findWire(doc,a,b),n=w&&result.wireCurrents[w.id];return n?Math.hypot(n.re,n.im):null;}
export function evaluateScenarioExpectation(e:ScenarioExpectation,doc:CircuitDocument,r:SimulationResult,history:SimulationResult[]=[]):{pass:boolean|null;detail:string;reading?:CheckReading} {
  let value:number|string|boolean|undefined|null;let pass:boolean|null=false;
  switch(e.kind){
    case 'power':{value=doc.components.some(c=>c.id===e.component)?r.componentPower[e.component]??0:undefined;const prior=e.relative&&history[e.relative.step];const bound=e.relative&&prior?((e.relative.component?prior.componentPower[e.relative.component]:prior.componentPower[e.component])??0)*e.relative.multiplier+(e.relative.offset??0):undefined;pass=value===undefined||e.relative&&!prior?null:(e.min===undefined||value>=e.min)&&(e.max===undefined||value<=e.max)&&(bound===undefined||value>bound);break;}
    case 'state':value=r.deviceStates[e.component]?.[e.key];pass=value===undefined?null:typeof e.equals==='number'&&typeof value==='number'?Math.abs(value-e.equals)<=(e.tolerance??1e-6):value===e.equals;break;
    case 'parameter':value=doc.components.find(c=>c.id===e.component)?.params[e.key];pass=value===undefined?null:value===e.equals;break;
    case 'voltage':{value=measureVoltage(r,e.a,e.b).value;const expected=e.supplyScale!==undefined?doc.supply.voltage*e.supplyScale:e.expected;const tolerance=e.supplyScale!==undefined?doc.supply.voltage*(e.tolerance??.1):(e.tolerance??1);pass=value===null?null:(e.min===undefined||value>=e.min)&&(e.max===undefined||value<=e.max)&&(expected===undefined||Math.abs(value-expected)<=tolerance);break;}
    case 'isolated':{const a=r.terminalVoltages[endpointKey(e.a)],b=r.terminalVoltages[endpointKey(e.b)];value=a&&b?a.reference!==b.reference:null;pass=value;break;}
    case 'voltage-ratio':{const a=measureVoltage(r,e.a,e.b).value,b=measureVoltage(r,e.c,e.d).value;value=a===null||b===null||b<1e-8?null:a/b;pass=value===null?null:value>e.minimum;break;}
    case 'voltage-spread':{const values=e.pairs.map(p=>measureVoltage(r,p.a,p.b).value);value=values.some(n=>n===null)?null:Math.max(...values as number[])-Math.min(...values as number[]);pass=value===null?null:value<e.maximum;break;}
    case 'current':{value=current(r,doc,e.a,e.b);const other=e.greaterThan?current(r,doc,e.greaterThan.a,e.greaterThan.b):undefined;pass=value===null||other===null?null:(e.min===undefined||value>e.min)&&(other===undefined||value>other);break;}
    case 'total-power':{value=r.totalPower;const prior=history[e.relative.step];pass=prior?value>prior.totalPower*e.relative.multiplier+e.relative.offset:null;break;}
  }
  const unit = e.kind === 'voltage' ? 'V' : e.kind === 'current' ? 'A' : e.kind === 'power' || e.kind === 'total-power' ? 'W' : undefined;
  const reading = unit && typeof value === 'number' && Number.isFinite(value) && r.converged ? {value,unit} as CheckReading : undefined;
  return {pass, detail: describeReading(e, value, doc), ...(reading ? {reading} : {})};
}
function describeReading(check: ScenarioExpectation, value: number | string | boolean | null | undefined, doc: CircuitDocument): string {
  if (value == null) return 'No reading yet. Check the connections and try the circuit again.';
  const number = (n: number) => Number(n.toPrecision(4)).toString();
  if (check.kind === 'isolated') return value ? 'The two supplies are electrically separate.' : 'There is a connection between the two supplies.';
  if (check.kind === 'parameter' && check.key === 'mechanicallyInterlockedWith') {
    const partner = doc.components.find(c => c.id === value);
    return partner ? 'Linked to ' + partner.label + '.' : 'Check the mechanical link between the two contactors.';
  }
  if (check.kind === 'state') {
    if (check.key === 'closed') return value ? 'The contact is closed.' : 'The contact is open.';
    if (check.key === 'moving') return value ? 'The valve is moving.' : 'The valve is still.';
    if (check.key === 'gridPresent') return value ? 'Mains power is on.' : 'Mains power is off.';
    if (check.key === 'emergencyActive') return value ? 'The backup light is on.' : 'The backup light is off.';
    if (check.key === 'normalActive') return value ? 'The mains light is on.' : 'The mains light is off.';
    if (check.key === 'energized') {
      const fitting=doc.components.find(c=>c.id===check.component);
      if(fitting?.type==='pump')return fitting.label+(value?' is running.':' is stopped.');
      return (fitting?.label??'The fitting')+(value?' is on.':' is off.');
    }
    if (check.key === 'direction') {
      if (doc.components.find(c => c.id === check.component)?.type === 'floatvalve') return value === 0 ? 'The valve is still.' : value === 1 ? 'The valve is opening.' : 'The valve is closing.';
      return value === 0 ? 'The motor is stopped.' : value === 1 ? 'The motor turns forwards.' : 'The motor turns in reverse.';
    }
    if (check.key === 'level' && typeof value === 'number') {
      if (doc.components.find(c => c.id === check.component)?.type === 'alarm') return value ? 'The alarm is sounding.' : 'The alarm is quiet.';
      return 'The valve is ' + number(value * 100) + '% open.';
    }
    if (check.key === 'call') {
      if (value === 'Idle') return 'The chime is quiet.';
      if (value === 'Both') return 'Both door buttons are calling.';
      return value === 'Front' ? 'The front door is calling.' : value === 'Rear' ? 'The back door is calling.' : 'The chime has no clear call reading.';
    }
  }
  const unit = check.kind === 'current' ? ' A' : ['voltage', 'voltage-spread'].includes(check.kind) || check.kind === 'parameter' && check.key === 'windingVoltage' ? ' V'
    : check.kind === 'state' && check.key === 'frequency' ? ' Hz' : ['power','total-power'].includes(check.kind) || check.kind === 'state' && ['warmWatts','coolWatts'].includes(check.key) ? ' W' : '';
  if (typeof value === 'number') {
    if (check.kind === 'voltage-ratio') return 'Line-to-line voltage is ' + number(value) + ' times line-to-neutral voltage.';
    if (check.kind === 'voltage-spread') return 'The highest and lowest readings are ' + number(value) + ' V apart.';
    if (check.kind === 'power') {
      const fitting=doc.components.find(c=>c.id===check.component);
      return (fitting?.label??'The fitting')+' drew '+number(value)+' W.';
    }
    if (check.kind === 'voltage') {
      const a=describeEndpoint(doc,check.a), b=describeEndpoint(doc,check.b);
      if(a&&b)return number(value)+' V between '+a.label+' and '+(a.endpoint.component===b.endpoint.component?b.pointLabel:b.label)+'.';
    }
    return number(value) + unit + '.';
  }
  return String(value) + '.';
}

/** Execute authored experiments against the learner's actual topology. No source document/state is changed. */
export function runLessonScenarios(document:CircuitDocument,previousStates:Record<string,DeviceState>={}):AssessmentCheck[]{
  const scenario=document.lessonId&&getScenario(document.lessonId,document),canonical=document.lessonId&&getLesson(document.lessonId,document);
  if(!scenario||!canonical)return [{id:'scenario:unassigned',category:'objectives',status:'not-run',title:'Lesson controls',explanation:'You built this circuit in Sandbox. Open Live readings to see what it does.'}];
  if(!document.supply.enabled)return [{id:'scenario:supply-off',category:'objectives',status:'not-run',title:'Lesson controls',explanation:'Turn on the bench supply and test the circuit again.'}];
  const doc=structuredClone(document),checks:AssessmentCheck[]=[],history:SimulationResult[]=[];
  // Normalize only demonstrated operator controls. Keep learner wiring, ratings,
  // device modes, protection, converter parameters and mechanical pairing intact.
  for(const c of doc.components){const original=canonical.circuit.components.find(x=>x.id===c.id&&x.type===c.type);if(original)for(const [k,v]of Object.entries(original.params))if(CONTROL_KEYS.has(k))c.params[k]=v;}
  let states:Record<string,DeviceState>={};for(const [id,s]of Object.entries(previousStates))if(s.tripped)states[id]=structuredClone(s);
  const add=(id:string,status:AssessmentCheck['status'],title:string,explanation:string,component?:string,reading?:CheckReading)=>checks.push({id,category:'objectives',status,title,explanation,...(component?{component}:{}),...(reading?{reading}:{})});
  let initial:SimulationResult|undefined;
  for(let i=0;i<24;i++){initial=simulate(doc,states,.25);states=initial.deviceStates;}
  for(const [index,action]of scenario.steps.entries()){
    const prefix=`scenario:${scenario.lessonId}:${index}`;
    const missing=action.patches.filter(p=>!doc.components.some(c=>c.id===p.component));
    if(missing.length){add(prefix+':targets','unresolved',action.title,`Required control is missing: ${missing.map(p=>canonical.circuit.components.find(c=>c.id===p.component)?.label ?? p.component).join(', ')}.`);continue;}
    for(const p of action.patches){const c=doc.components.find(c=>c.id===p.component)!;Object.assign(c.params,p.params);if('closed'in p.params&&'on'in c.params)c.params.on=p.params.closed;if('pressed'in p.params&&'on'in c.params)c.params.on=p.params.pressed;}
    if(action.supplyEnabled!==undefined)doc.supply.enabled=action.supplyEnabled;
    if(action.openSignal){const w=findWire(doc,action.openSignal.a,action.openSignal.b);if(!w){add(prefix+':signal','unresolved',action.title,'The signal wire for this step is missing. Check the link between the two fittings.');continue;}doc.faults.push({type:'wrong-control',wire:w.id,enabled:true});}
    let r=initial!;for(let i=0;i<action.ticks;i++){r=simulate(doc,states,action.dt);states=r.deviceStates;}
    history[index]=r;
    const error=r.diagnostics.find(d=>d.severity==='error');
    add(prefix+':model',r.converged&&!error?'pass':'unresolved',action.title+' · readings',r.converged&&!error?`Readings taken after ${Number((action.ticks*action.dt).toFixed(2))} seconds on the bench.`:error?.explanation??'The readings kept changing. Check the control wiring and try again.');
    const trips=doc.components.filter(c=>r.deviceStates[c.id]?.tripped).map(c=>c.label);
    add(prefix+':protection',trips.length?'fail':'pass',action.title+' · trip check',trips.length?`Tripped: ${trips.join(', ')}. Repair the fault, then reset and test again.`:'No breaker or other protection is tripped.');
    for(const [j,e]of action.expectations.entries()){const value=evaluateScenarioExpectation(e,doc,r,history);add(prefix+':'+j,!r.converged||value.pass===null?'unresolved':value.pass?'pass':'fail',e.title,`${action.title}. ${value.detail}`, 'component'in e?e.component:'a'in e?e.a.component:undefined,value.reading);}
  }
  return checks;
}
