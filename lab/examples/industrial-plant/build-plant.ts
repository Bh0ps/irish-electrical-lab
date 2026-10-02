import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENTS } from '../../lib/components.ts';
import { simulate, measureVoltage } from '../../lib/simulation.ts';
import { validateCircuit } from '../../lib/storage.ts';
import { routeCircuit, auditRoutes } from '../../lib/routing.ts';
import { equipmentAsset, equipmentAssetKey } from '../../lib/equipment-assets.ts';
import type { CircuitDocument, DeviceState, Endpoint, Parameters, TerminalRole, Vec3 } from '../../lib/types.ts';

const output = path.dirname(fileURLToPath(import.meta.url));
const phaseNeutral = 400 / Math.sqrt(3);
type Port = readonly [component: string, terminal: string];
const endpoint = ([component, terminal]: Port): Endpoint => ({ component, terminal });

/** Original custom plant; no curriculum IDs or lesson assemblies are imported. */
export function createIndustrialPlant(): CircuitDocument {
  const document: CircuitDocument = { version: 1, id: 'custom-industrial-process-plant-v1', name: 'Integrated process plant · 80 equipment', revision: 0,
    supply: { enabled: true, phase: 'three', voltage: 400, frequency: 50, sourceResistance: .08 }, components: [], wires: [], faults: [] };
  const zones: Record<string, Vec3> = { distribution: [-18,0,-14], process: [-6,0,-14], mixer: [6,0,-14], pumps: [18,0,-14], drive: [-18,0,2], heat: [-6,0,2], lighting: [6,0,2], yard: [18,0,2] };
  const indices: Record<string, number> = {};
  function add(zone: string, type: string, id: string, label: string, params: Parameters = {}, variant?: string) {
    const index = indices[zone] ?? 0; indices[zone] = index + 1;
    const center = zones[zone], position: Vec3 = [center[0] + (index % 3 - 1) * 3.2, 0, center[2] + Math.floor(index / 3) * 2.65];
    document.components.push({ id, type, label, position, rotation: 0, params: { ...COMPONENTS[type].defaults, ...params }, ...(variant ? { variant } : {}) });
  }
  function wire(from: Port, to: Port, role: TerminalRole = 'control') {
    document.wires.push({ id: `plant-wire-${String(document.wires.length + 1).padStart(3,'0')}`, from: endpoint(from), to: endpoint(to), role, resistance: .004, bends: [] });
  }
  const phase = (index: number): Port => [`bus-phase-${index}`, '2'];
  const neutral: Port = ['bus-neutral','2'], earth: Port = ['bus-earth','2'], positive: Port = ['control-supply','+'], negative: Port = ['control-supply','-'];
  function pe(id: string) { if (COMPONENTS[document.components.find(c => c.id === id)!.type].terminals.some(t => t.id === 'PE')) wire(earth,[id,'PE'],'PE'); }
  function dc(id: string) { wire(positive,[id,'L'],'DC+'); wire(negative,[id,'N'],'DC-'); pe(id); }
  function coil(id: string, feed: Port) { wire(feed,[id,'A1']); wire(negative,[id,'A2'],'DC-'); }
  function singleFeeder(id: string, phaseIndex: number) { wire(phase(phaseIndex),[id,'LIN'],`L${phaseIndex}` as TerminalRole); wire(neutral,[id,'NIN'],'N'); }
  function singleLoad(id: string, feed: Port, returnPort: Port = neutral) { wire(feed,[id,'L'],'L'); wire(returnPort,[id,'N'],returnPort===negative?'DC-':'N'); pe(id); }
  function threeFeeder(id: string) { for(let i=1;i<=3;i++)wire(phase(i),[id,`L${i}IN`],`L${i}` as TerminalRole); }
  function threeContacts(feeder: string, contactor: string, overload?: string, reverse = false) {
    for(let i=0;i<3;i++) {
      const phaseIndex=reverse?[1,0,2][i]:i;
      wire([feeder,`L${phaseIndex+1}OUT`],[contactor,String(i*2+1)],`L${phaseIndex+1}` as TerminalRole);
      if(overload)wire([contactor,String(i*2+2)],[overload,String(i*2+1)],`L${i+1}` as TerminalRole);
    }
  }
  function starMotor(id: string, feed: Port[]) {
    for(let i=0;i<3;i++)wire(feed[i],[id,['U1','V1','W1'][i]],`L${i+1}` as TerminalRole);
    wire([id,'U2'],[id,'V2'],'output'); wire([id,'V2'],[id,'W2'],'output'); pe(id);
  }
  const coilParams = { nominalVoltage: 24, coilWatts: 3 };
  const utilityVoltage = { nominalVoltage: 230 };

  // 1. Central customer-side distribution, separated mains/neutral/PE/24 V buses.
  add('distribution','source3','plant-supply','D01 · 400 V / 230.9 V plant supply');
  add('distribution','isolator3','plant-isolator','D02 · Master four-pole isolation');
  add('distribution','rcd3','plant-residual','D03 · Four-pole residual monitor · 30 mA',{tripMa:30});
  add('distribution','mcb3','plant-incomer','D04 · Linked 32 A incomer',{currentRating:32});
  for(let i=1;i<=3;i++)add('distribution','terminal',`bus-phase-${i}`,`D0${i+4} · L${i} distribution bank`);
  add('distribution','neutralbar','bus-neutral','D08 · Main neutral distribution bank');
  add('distribution','earthbar','bus-earth','D09 · Protective-earth distribution bank');
  add('distribution','mcb','control-feeder','D10 · 6 A control-supply feed',{currentRating:6});
  add('distribution','dcsupply','control-supply','D11 · Isolated regulated 24 V / 200 W',{nominalVoltage:230,outputVoltage:24,maxPower:200,outputCurrent:10,efficiency:.92});
  add('distribution','spd','plant-spd','D12 · Parallel surge-protection branch');
  for(const name of ['L1','L2','L3','N']) {
    wire(['plant-supply',name],['plant-isolator',`${name}IN`],name as TerminalRole);
    wire(['plant-isolator',`${name}OUT`],['plant-residual',`${name}IN`],name as TerminalRole);
    if(name==='N')wire(['plant-residual','NOUT'],neutral,'N');
    else { wire(['plant-residual',`${name}OUT`],['plant-incomer',`${name}IN`],name as TerminalRole); wire(['plant-incomer',`${name}OUT`],[`bus-phase-${name.at(-1)}`,'1'],name as TerminalRole); }
  }
  wire(['plant-supply','PE'],earth,'PE'); pe('plant-isolator'); pe('plant-residual');
  wire(phase(1),['control-feeder','IN'],'L1'); wire(['control-feeder','OUT'],['control-supply','L'],'L1'); wire(neutral,['control-supply','N'],'N'); pe('control-supply');
  wire(phase(1),['plant-spd','L'],'L1'); wire(neutral,['plant-spd','N'],'N'); pe('plant-spd');

  // 2. Safety permission, PLC guard/pressure permissives, and held conveyor.
  add('process','mcb3','conveyor-feeder','P01 · Conveyor three-pole 6 A feed',{currentRating:6});
  add('process','plc','process-plc','P02 · Wired guard AND pressure permissives',{nominalVoltage:24,controlVoltage:24,mode:'and'});
  add('process','switch','guard-permission','P03 · Process guard permission',{closed:true});
  add('process','sensor','pressure-permission','P04 · Process pressure condition',{nominalVoltage:24,controlVoltage:24,mode:'pressure',sensorValue:1,setpoint:.5,active:true,delay:0});
  add('process','safetyRelay','plant-safety','P05 · Manual-reset two-channel permission',{nominalVoltage:24,controlVoltage:24,mode:'manual'});
  add('process','pushbutton','emergency-channel-a','P06 · E-stop channel A · press to interrupt');
  add('process','pushbutton','emergency-channel-b','P07 · E-stop channel B · press to interrupt');
  add('process','pushbutton','plant-reset','P08 · Reset safety permission');
  add('process','pushbutton','conveyor-start','P09 · Conveyor START · momentary');
  add('process','pushbutton','conveyor-stop','P10 · Conveyor STOP · momentary');
  add('process','contactor','conveyor-contactor','P11 · Held conveyor contactor',coilParams);
  add('process','overload','conveyor-overload','P12 · Conveyor overload and coil inhibit',{currentRating:3});
  add('process','motor3','conveyor-motor','P13 · 750 W three-phase belt drive',{watts:750,nominalVoltage:400,windingVoltage:phaseNeutral,powerFactor:.82});
  threeFeeder('conveyor-feeder'); threeContacts('conveyor-feeder','conveyor-contactor','conveyor-overload');
  starMotor('conveyor-motor',[['conveyor-overload','2'],['conveyor-overload','4'],['conveyor-overload','6']]);
  dc('process-plc'); dc('pressure-permission'); dc('plant-safety');
  wire(positive,['guard-permission','COM']); wire(['guard-permission','OUT'],['process-plc','I1']);
  wire(positive,['pressure-permission','IN']); wire(['pressure-permission','OUT'],['process-plc','I2']);
  for(const [id,input] of [['emergency-channel-a','S1'],['emergency-channel-b','S2']]) { wire(positive,[id,'COM']); wire([id,'NC'],['plant-safety',input]); }
  wire(positive,['plant-reset','COM']); wire(['plant-reset','NO'],['plant-safety','RESET']);
  wire(positive,['conveyor-contactor','21']); wire(['conveyor-contactor','22'],['plant-safety','FB']);
  wire(positive,['plant-safety','COM']); wire(['plant-safety','OUT'],['process-plc','COM']);
  wire(['process-plc','Q1'],['conveyor-stop','COM']); wire(['conveyor-stop','NC'],['conveyor-overload','95']);
  wire(['conveyor-overload','96'],['conveyor-start','COM']); wire(['conveyor-start','NO'],['conveyor-contactor','A1']);
  wire(['conveyor-overload','96'],['conveyor-contactor','13']); wire(['conveyor-contactor','14'],['conveyor-contactor','A1']); wire(negative,['conveyor-contactor','A2'],'DC-');

  // 3. Mixer direction commands with external electrical and mechanical interlocks.
  add('mixer','mcb3','mixer-feeder','M01 · Mixer three-pole 6 A feed',{currentRating:6});
  add('mixer','contactor','mixer-forward','M02 · Mixer FORWARD interlocked contactor',{...coilParams,mechanicallyInterlockedWith:'mixer-reverse'});
  add('mixer','contactor','mixer-reverse','M03 · Mixer REVERSE interlocked contactor',{...coilParams,mechanicallyInterlockedWith:'mixer-forward'});
  add('mixer','overload','mixer-overload','M04 · Shared mixer overload',{currentRating:3});
  add('mixer','motor3','mixer-motor','M05 · Reversible 900 W process mixer',{watts:900,windingVoltage:phaseNeutral,nominalVoltage:400,powerFactor:.8});
  add('mixer','selector','mixer-direction','M06 · Direction selector · A forward / B reverse',{position:0});
  add('mixer','switch','mixer-forward-limit','M07 · Forward travel permissive',{closed:true});
  add('mixer','switch','mixer-reverse-limit','M08 · Reverse travel permissive',{closed:true});
  add('mixer','switch','mixer-enable','M09 · Mixer RUN enable',{closed:false});
  add('mixer','indicator','mixer-forward-indicator','M10 · Forward coil indication',{nominalVoltage:24,watts:1});
  add('mixer','indicator','mixer-reverse-indicator','M11 · Reverse coil indication',{nominalVoltage:24,watts:1});
  threeFeeder('mixer-feeder'); threeContacts('mixer-feeder','mixer-forward','mixer-overload'); threeContacts('mixer-feeder','mixer-reverse','mixer-overload',true);
  starMotor('mixer-motor',[['mixer-overload','2'],['mixer-overload','4'],['mixer-overload','6']]);
  wire(['process-plc','Q1'],['mixer-overload','95']); wire(['mixer-overload','96'],['mixer-enable','COM']); wire(['mixer-enable','OUT'],['mixer-direction','COM']);
  for(const [command,own,opposite,limit,indicator] of [['A','mixer-forward','mixer-reverse','mixer-forward-limit','mixer-forward-indicator'],['B','mixer-reverse','mixer-forward','mixer-reverse-limit','mixer-reverse-indicator']]) {
    wire(['mixer-direction',command],[opposite,'21']); wire([opposite,'22'],[limit,'COM']); wire([limit,'OUT'],[own,'A1']); wire(negative,[own,'A2'],'DC-');
    singleLoad(indicator,[own,'A1'],negative);
  }

  // 4. Duty-selected drainage pumps; a second level call provides real parallel assist.
  add('pumps','rcbo','pumps-feeder','W01 · Pump branch L2 / N · 10 A RCBO',{currentRating:10,tripMa:30});
  add('pumps','selector','pump-duty','W02 · Duty selector · A pump A / B pump B',{position:0});
  add('pumps','switch','normal-level','W03 · Normal liquid-level call',{closed:true});
  add('pumps','switch','high-level','W04 · High liquid-level assist',{closed:false});
  add('pumps','contactor','pump-a-contactor','W05 · Duty/assist pump A contactor',coilParams);
  add('pumps','contactor','pump-b-contactor','W06 · Duty/assist pump B contactor',coilParams);
  add('pumps','pump','pump-a','W07 · 250 W drainage pump A',{...utilityVoltage,watts:250,powerFactor:.85});
  add('pumps','pump','pump-b','W08 · 250 W drainage pump B',{...utilityVoltage,watts:250,powerFactor:.85});
  add('pumps','indicator','pump-a-indicator','W09 · Pump A coil indication',{nominalVoltage:24,watts:1});
  add('pumps','indicator','pump-b-indicator','W10 · Pump B coil indication',{nominalVoltage:24,watts:1});
  add('pumps','relay','pump-a-assist','W11 · High-level A request isolation relay',{nominalVoltage:24,coilWatts:1});
  add('pumps','relay','pump-b-assist','W12 · High-level B request isolation relay',{nominalVoltage:24,coilWatts:1});
  singleFeeder('pumps-feeder',2);
  wire(['plant-safety','OUT'],['normal-level','COM']); wire(['normal-level','OUT'],['pump-duty','COM']); wire(['plant-safety','OUT'],['high-level','COM']);
  for(const [id,selector,pump,indicator] of [['pump-a-contactor','A','pump-a','pump-a-indicator'],['pump-b-contactor','B','pump-b','pump-b-indicator']]) {
    coil(id,['pump-duty',selector]);
    const assist=pump==='pump-a'?'pump-a-assist':'pump-b-assist';
    coil(assist,['high-level','OUT']); wire(['plant-safety','OUT'],[assist,'COM']); wire([assist,'NO'],[id,'A1']);
    wire(['pumps-feeder','LOUT'],[id,'1'],'L2'); singleLoad(pump,[id,'2'],['pumps-feeder','NOUT']); singleLoad(indicator,[id,'A1'],negative);
  }

  // 5. Independent utility VFD, plus timed process ventilation from PLC Q2.
  add('drive','mcb3','drive-feeder','V01 · Utility VFD three-pole 6 A feed',{currentRating:6});
  add('drive','vfd','utility-drive','V02 · Variable-frequency utility drive',{frequency:35,on:true,maxPower:1600,outputVoltage:400,efficiency:.95});
  add('drive','motor3','utility-motor','V03 · 600 W variable-speed utility motor',{watts:600,windingVoltage:phaseNeutral,nominalVoltage:400,powerFactor:.85});
  add('drive','switch','drive-run','V04 · Independent utility-drive RUN',{closed:false});
  add('drive','indicator','plant-ready-indicator','V05 · Safety permission available',{nominalVoltage:24,watts:1});
  add('drive','timer','ventilation-delay','V06 · Pressure-permitted ventilation delay · 2 s',{nominalVoltage:24,controlVoltage:24,delay:2,on:true,demand:true});
  add('drive','sensor','airflow-permission','V07 · Ventilation environmental permission',{nominalVoltage:24,controlVoltage:24,mode:'humidity',sensorValue:.8,setpoint:.5,active:true,delay:0});
  add('drive','fan','ventilation-fan','V08 · 24 V / 12 W control-domain fan',{nominalVoltage:24,watts:12,powerFactor:.9});
  threeFeeder('drive-feeder'); for(let i=1;i<=3;i++)wire(['drive-feeder',`L${i}OUT`],['utility-drive',`L${i}`],`L${i}` as TerminalRole); pe('utility-drive');
  starMotor('utility-motor',[['utility-drive','U'],['utility-drive','V'],['utility-drive','W']]);
  wire(['utility-drive','COM'],['drive-run','COM']); wire(['drive-run','OUT'],['utility-drive','RUN']);
  singleLoad('plant-ready-indicator',['plant-safety','OUT'],negative); dc('ventilation-delay'); dc('airflow-permission');
  wire(['process-plc','Q2'],['ventilation-delay','IN']); wire(['ventilation-delay','OUT'],['airflow-permission','IN']); singleLoad('ventilation-fan',['airflow-permission','OUT'],negative);

  // 6. Three-phase heater bank only enabled by an opened 24 V water valve.
  add('heat','mcb3','heating-feeder','H01 · Three-phase heat branch · 6 A',{currentRating:6});
  add('heat','contactor','heating-contactor','H02 · Linked three-stage heater contactor',coilParams);
  for(let i=1;i<=3;i++)add('heat','heater',`heater-phase-${i}`,`H0${i+2} · 350 W heater phase L${i}`,{...utilityVoltage,watts:350},'heater-wall');
  add('heat','thermostat','heat-demand','H06 · Process-water thermostat',{temperature:18,setpoint:21,closed:true});
  add('heat','cutout','heat-limit','H07 · Independent 85 °C thermal limit',{temperature:20,setpoint:85,closed:true});
  add('heat','valve','heat-valve','H08 · 24 V valve with end-position proof',{nominalVoltage:24,delay:2,watts:4});
  add('heat','pump','heat-circulator','H09 · 24 V / 12 W circulation pump',{nominalVoltage:24,watts:12,powerFactor:.9});
  add('heat','indicator','heat-proven-indicator','H10 · Valve-open / heater-coil indication',{nominalVoltage:24,watts:1});
  threeFeeder('heating-feeder'); threeContacts('heating-feeder','heating-contactor');
  for(let i=1;i<=3;i++)singleLoad(`heater-phase-${i}`,['heating-contactor',String(i*2)]);
  wire(positive,['heat-demand','COM']); wire(['heat-demand','OUT'],['heat-limit','COM']); wire(['heat-limit','OUT'],['heat-valve','CALL']); dc('heat-valve');
  coil('heating-contactor',['heat-valve','END']); singleLoad('heat-circulator',['heat-valve','END'],negative); singleLoad('heat-proven-indicator',['heat-valve','END'],negative);

  // 7. Shared dimmer, isolated LED pair, and independent maintained emergency fixture.
  add('lighting','rcbo','lighting-feeder','L01 · Work-light branch L3 / N · 6 A',{currentRating:6,tripMa:30});
  add('lighting','dimmer','worklight-dimmer','L02 · Workbench lighting dimmer',{level:.78,closed:true,referenceOhms:960});
  add('lighting','lamp','worklight-a','L03 · 40 W workbench lamp A',{...utilityVoltage,watts:40},'lamp-bulb');
  add('lighting','lamp','worklight-b','L04 · 40 W workbench lamp B',{...utilityVoltage,watts:40},'lamp-batten');
  add('lighting','driver','inspection-driver','L05 · Isolated 24 V inspection-light driver',{nominalVoltage:230,outputVoltage:24,maxPower:30,efficiency:.92});
  add('lighting','led','inspection-led-a','L06 · 6 W low-voltage inspection lamp A',{nominalVoltage:24,watts:6});
  add('lighting','led','inspection-led-b','L07 · 6 W low-voltage inspection lamp B',{nominalVoltage:24,watts:6});
  add('lighting','emergency','plant-emergency','L08 · Maintained emergency exit light',{...utilityVoltage,watts:6,maintained:true,battery:true,batteryCharge:1});
  singleFeeder('lighting-feeder',3); wire(['lighting-feeder','LOUT'],['worklight-dimmer','COM'],'L3');
  for(const id of ['worklight-a','worklight-b'])singleLoad(id,['worklight-dimmer','OUT'],['lighting-feeder','NOUT']);
  singleLoad('inspection-driver',['lighting-feeder','LOUT'],['lighting-feeder','NOUT']);
  for(const id of ['inspection-led-a','inspection-led-b']) { wire(['inspection-driver','+'],[id,'L'],'DC+'); wire(['inspection-driver','-'],[id,'N'],'DC-'); }
  singleLoad('plant-emergency',['lighting-feeder','LOUT'],['lighting-feeder','NOUT']); wire(['lighting-feeder','LOUT'],['plant-emergency','SL'],'L3');

  // 8. Independent yard darkness condition, true alarm interlink, supply indication.
  add('yard','rcbo','yard-feeder','Y01 · Yard and alarm branch L1 / N · 6 A',{currentRating:6,tripMa:30});
  add('yard','sensor','yard-darkness','Y02 · Yard darkness threshold',{nominalVoltage:230,mode:'photocell',sensorValue:.8,setpoint:.5,active:true,delay:0});
  add('yard','lamp','yard-light','Y03 · 45 W external yard luminaire',{...utilityVoltage,watts:45},'lamp-outdoor');
  add('yard','alarm','plant-smoke-alarm','Y04 · Process smoke alarm with backup',{...utilityVoltage,watts:2,battery:true,batteryCharge:1,alarm:false});
  add('yard','alarm','plant-heat-alarm','Y05 · Interlinked heat alarm with backup',{...utilityVoltage,watts:2,battery:true,batteryCharge:1,alarm:false});
  add('yard','indicator','mains-indicator','Y06 · Yard/alarms mains available',{...utilityVoltage,watts:1});
  singleFeeder('yard-feeder',1); singleLoad('yard-darkness',['yard-feeder','LOUT'],['yard-feeder','NOUT']); wire(['yard-feeder','LOUT'],['yard-darkness','IN'],'L1');
  singleLoad('yard-light',['yard-darkness','OUT'],['yard-feeder','NOUT']);
  for(const id of ['plant-smoke-alarm','plant-heat-alarm','mains-indicator'])singleLoad(id,['yard-feeder','LOUT'],['yard-feeder','NOUT']);
  wire(['plant-smoke-alarm','LINK'],['plant-heat-alarm','LINK']);
  // Use the existing bars' distinct physical clamps rather than stacking every
  // conductor in one hole. All four clamps are real joined bar terminals.
  for(const id of ['bus-earth','bus-neutral','bus-phase-1','bus-phase-2','bus-phase-3']) {
    let slot=0;
    for(const item of document.wires)for(const end of [item.from,item.to])if(end.component===id)end.terminal=String(slot++%4+1);
  }
  // Controller power terminals are actual common feeder points. A bounded
  // branching tree keeps each +24 V / 0 V clamp below four outgoing wires;
  // resistive feeder drops remain part of the circuit that the solver sees.
  for(const terminal of ['+','-']) {
    const wires=document.wires.filter(item=>item.from.component==='control-supply'&&item.from.terminal===terminal);
    const available: Endpoint[]=[{component:'control-supply',terminal}];
    const use=new Map<string,number>();
    for(const item of wires) {
      const parent=available.find(end=>(use.get(`${end.component}.${end.terminal}`)??0)<3)!;
      item.from={...parent};use.set(`${parent.component}.${parent.terminal}`,(use.get(`${parent.component}.${parent.terminal}`)??0)+1);
      available.push({...item.to});
    }
  }
  {
    const available: Endpoint[]=[1,2,3,4].map(slot=>({component:'bus-earth',terminal:String(slot)})),use=new Map<string,number>();
    for(const item of document.wires.filter(item=>item.from.component==='bus-earth')) {
      const parent=available.find(end=>(use.get(`${end.component}.${end.terminal}`)??0)<3)!;
      item.from={...parent};use.set(`${parent.component}.${parent.terminal}`,(use.get(`${parent.component}.${parent.terminal}`)??0)+1);
      available.push({...item.to});
    }
  }
  return document;
}

export function validateIndustrialPlant(document: CircuitDocument) {
  const checks: {name: string; passed: boolean; detail: unknown}[] = [];
  const record = (name: string, passed: boolean, detail: unknown) => checks.push({name,passed,detail});
  const doc = structuredClone(document);
  let states: Record<string,DeviceState> = {}, last = simulate(doc,states,.1);
  let maxUnknowns=last.nodes;
  function tick(seconds=.1) { last = simulate(doc,states,seconds); states=last.deviceStates;maxUnknowns=Math.max(maxUnknowns,last.nodes);return last; }
  function patch(id: string, params: Parameters) { const c=doc.components.find(c=>c.id===id)!; c.params={...c.params,...params};doc.revision++;return tick(); }
  function healthy(label: string) { const findings=last.diagnostics.filter(d=>d.severity!=='info'); record(label,last.converged&&!findings.length,{nodes:last.nodes,elapsedMs:last.elapsedMs,findings}); }
  function active(id: string) { return !!last.deviceStates[id]?.energized; }
  function power(id: string) { return last.componentPower[id]??0; }
  function pulse(id: string) { patch(id,{pressed:true}); return patch(id,{pressed:false}); }
  record('original custom document has exactly 80 components and no lessonId',doc.components.length===80&&!('lessonId' in doc),{components:doc.components.length,wires:doc.wires.length});
  const imported=validateCircuit(doc); record('versioned circuit import accepts actual component/terminal limits',!!imported,{components:doc.components.length,wires:doc.wires.length});
  tick(3); healthy('initial standalone network resolves without electrical/protective findings');
  record('initial process is stopped while lighting and valve-proven heating operate',!active('conveyor-motor')&&!active('mixer-motor')&&!active('pump-a')&&power('heater-phase-1')>300&&power('worklight-a')>5,{conveyor:last.deviceStates['conveyor-motor'],heater:power('heater-phase-1'),lamp:power('worklight-a')});
  pulse('plant-reset'); healthy('manual safety reset arms actual wired permission');
  record('duty pump A operates while standby pump B is stopped',active('pump-a')&&!active('pump-b'),{a:power('pump-a'),b:power('pump-b')});
  pulse('conveyor-start'); healthy('conveyor START then release maintains the actual auxiliary holding loop');
  record('conveyor remains running after momentary START release',active('conveyor-motor')&&!doc.components.find(c=>c.id==='conveyor-start')!.params.pressed,last.deviceStates['conveyor-motor']);
  patch('mixer-enable',{closed:true}); record('mixer forward direction follows wired sequence',last.deviceStates['mixer-motor'].direction===1,last.deviceStates['mixer-motor']);
  patch('mixer-direction',{position:1}); healthy('direction transfer settles with interlocks preserving exclusive contact closure');
  record('reverse selector reverses winding sequence with only one contactor closed',last.deviceStates['mixer-motor'].direction===-1&&!last.deviceStates['mixer-forward'].closed&&last.deviceStates['mixer-reverse'].closed,last.deviceStates['mixer-motor']);
  patch('mixer-reverse-limit',{closed:false}); record('actual reverse limit interrupts motor power',!active('mixer-motor'),last.deviceStates['mixer-motor']); patch('mixer-enable',{closed:false});patch('mixer-reverse-limit',{closed:true});
  patch('pump-duty',{position:1});record('duty transfer stops pump A and starts pump B',!active('pump-a')&&active('pump-b'),{a:power('pump-a'),b:power('pump-b')});
  patch('high-level',{closed:true});record('high-level assist supplies both pump requests',active('pump-a')&&active('pump-b'),{a:power('pump-a'),b:power('pump-b')});patch('high-level',{closed:false});
  patch('drive-run',{closed:true});healthy('independent utility VFD run path and converter resolve');record('utility drive supplies the declared 35 Hz fundamental output',active('utility-motor')&&last.deviceStates['utility-motor'].frequency===35,{motor:last.deviceStates['utility-motor'],drive:last.deviceStates['utility-drive']});
  tick(3);record('wired delayed ventilation begins after the 2 s permission',active('ventilation-fan'),{timer:last.deviceStates['ventilation-delay'],fan:power('ventilation-fan')});
  patch('airflow-permission',{sensorValue:.1});record('sensor condition inhibits its downstream ventilation fan',!active('ventilation-fan'),last.deviceStates['airflow-permission']);patch('airflow-permission',{sensorValue:.8});
  const highLamp=power('worklight-a');patch('worklight-dimmer',{level:.2});record('dimmer changes actual lamp power through series resistance',power('worklight-a')<highLamp*.3,{high:highLamp,low:power('worklight-a')});patch('worklight-dimmer',{level:.78});
  patch('heat-demand',{temperature:25});tick(3);record('satisfied thermostat closes valve then removes heater and circulation demands',power('heater-phase-1')<.01&&!active('heat-circulator'),{heater:power('heater-phase-1'),valve:last.deviceStates['heat-valve']});patch('heat-demand',{temperature:18});tick(3);
  patch('plant-smoke-alarm',{alarm:true});record('actual interlink propagates alarm request to peer',last.deviceStates['plant-heat-alarm'].level===1,last.deviceStates['plant-heat-alarm']);patch('plant-smoke-alarm',{alarm:false});
  patch('guard-permission',{closed:false});record('missing guard permissive drops the held process conveyor',!active('conveyor-motor'),last.deviceStates['process-plc']);patch('guard-permission',{closed:true});pulse('conveyor-start');
  patch('emergency-channel-a',{pressed:true});record('one interrupted safety channel removes process permission and pump demands',!last.deviceStates['plant-safety'].closed&&!active('conveyor-motor')&&!active('pump-a')&&!active('pump-b'),last.deviceStates['plant-safety']);patch('emergency-channel-a',{pressed:false});
  record('released safety input cannot automatically rearm manual permission',!last.deviceStates['plant-safety'].closed,last.deviceStates['plant-safety']);pulse('plant-reset');
  pulse('conveyor-start');pulse('conveyor-stop');record('momentary STOP removes held conveyor request',!active('conveyor-motor'),last.deviceStates['conveyor-motor']);
  doc.supply.enabled=false;doc.revision++;tick();record('master supply loss removes external loads while emergency backup illuminates',!active('pump-b')&&last.deviceStates['plant-emergency'].emergencyActive===true,last.deviceStates['plant-emergency']);
  const baseline=simulate(document,{},3);const controlVoltage=measureVoltage(baseline,{component:'control-supply',terminal:'+'},{component:'control-supply',terminal:'-'});
  record('24 V control supply and independent protective network are resolved',controlVoltage.value!==null&&controlVoltage.value>23&&controlVoltage.value<24.1&&!baseline.diagnostics.some(d=>d.category==='protection'&&d.severity!=='info'),{controlVoltage,source:baseline.deviceStates['plant-supply'],control:baseline.deviceStates['control-supply'],totalPower:baseline.totalPower,totalCurrent:baseline.totalCurrent,nodes:baseline.nodes,elapsedMs:baseline.elapsedMs});
  record('every exercised operating state remains below the 512 MNA unknown limit',maxUnknowns<=512,{maximumUnknowns:maxUnknowns,solverLimit:512});
  const withoutEarth=structuredClone(document);withoutEarth.wires=withoutEarth.wires.filter(w=>!(w.role==='PE'&&w.to.component==='heater-phase-1'));
  const missingEarth=simulate(withoutEarth,{},3);record('actual missing protective wire is reported despite a working heater',missingEarth.diagnostics.some(d=>d.id==='cpc:heater-phase-1')&&(missingEarth.componentPower['heater-phase-1']??0)>300,{heater:missingEarth.componentPower['heater-phase-1'],findings:missingEarth.diagnostics.filter(d=>d.category==='protection')});
  const leakage=structuredClone(document);leakage.faults=[{type:'earth-fault',component:'heater-phase-1',enabled:true}];
  const earthFault=simulate(leakage,{},3);record('a real line-to-earth study fault trips the upstream residual monitor',earthFault.deviceStates['plant-residual'].tripped&&earthFault.diagnostics.some(d=>d.category==='protection'),{residual:earthFault.deviceStates['plant-residual'],preTrip:earthFault.preTrip});
  const routeStarted=performance.now(),routing=routeCircuit(document),issues=auditRoutes(document,routing);
  const routingReport={passed:issues.length===0&&routing.routes.size===document.wires.length,wires:document.wires.length,routed:routing.routes.size,elapsedMs:performance.now()-routeStarted,issues};
  record('every actual conductor routes with audited fixture/wire clearance',routingReport.passed,routingReport);
  const missingAssets=document.components.filter(c=>!equipmentAsset(c,COMPONENTS[c.type])).map(c=>({id:c.id,key:equipmentAssetKey(c,COMPONENTS[c.type])}));
  record('every equipment variant resolves to a bundled detailed model',!missingAssets.length,{equipment:document.components.length,missingAssets});
  return { passed:checks.every(c=>c.passed), components:document.components.length,wires:document.wires.length,maximumSolverUnknowns:maxUnknowns,configurationId:document.id,lessonIdPresent:'lessonId' in document,routingReport,checks,
    assumptions:'Original standalone 80-object training plant. Steady-state 400 V line-to-line, 230.94 V phase-to-neutral, isolated 24 V DC. Coil/thermal/timer/safety, VFD, backup and PLC are declared educational block models; no manufacturer safety performance or physical plant certification is claimed.' };
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const document=createIndustrialPlant(),report=validateIndustrialPlant(document);
  fs.writeFileSync(path.join(output,'industrial-plant.circuit.json'),JSON.stringify(document,null,2)+'\n');
  fs.writeFileSync(path.join(output,'validation-report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(output,'routing-report.json'),JSON.stringify(report.routingReport,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,components:report.components,wires:report.wires,checks:report.checks.length,failed:report.checks.filter(c=>!c.passed)},null,2));
  if(!report.passed)process.exitCode=1;
}
