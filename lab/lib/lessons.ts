import type { CircuitDocument, ComponentInstance, ConfigurationLesson, Endpoint, Parameters, TerminalRole, Wire } from './types';
import { COURSE_PAGES } from './coursebook-content.ts';
import * as Registry from './components.ts';
import { furnishCourseBoard } from './board-examples.ts';
import { furnishCableExamples } from './cables.ts';

const IRISH = [
  { title: 'ESB Networks: supply voltages and 50 Hz frequency', url: 'https://media.esbnetworks.ie/media/docs/default-source/publications/conditions-for-connection-to-the-distribution-system.pdf?sfvrsn=1ad65234_1' },
  { title: 'NSAI: I.S. 10101 and public amendment/correction information', url: 'https://www.nsai.ie/standards/sectors/electrotechnical-standards/national-wiring-rules-faqs/' },
  { title: 'Safe Electric: restricted and minor electrical works', url: 'https://safeelectric.ie/contractors/faqs/' },
];
const HSA = { title: 'HSA: competent inspection and testing', url: 'https://hsa.ie/topics/electricity/inspection_and_testing/' };
const GENERATION = { title: 'ESB Networks: micro-generation and standby arrangements', url: 'https://www.esbnetworks.ie/services/get-connected/renewable-connection/micro-generation' };
const HEATING = { title: 'Grant Ireland: documented heating control arrangements', url: 'https://grant.ie/media/mwintcmn/irldoc0033_grant-cylinders_installation-instructions_rev0110_april-26.pdf' };
const MANUFACTURERS:Record<string,{title:string;url:string}>={
  switching:{title:'Varilight: one-way, two-way and intermediate contact arrangements',url:'https://www.varilight.co.uk/technical-section/wiring-diagrams.php'},
  dimming:{title:'Varilight: dimmer and LED compatibility',url:'https://www.varilight.co.uk/technical-section/faqs-dimmers.php'},
  driver:{title:'Varilight: transformer and DC-driver instruction library',url:'https://www.varilight.co.uk/technical-section/leaflets.php'},
  sensor:{title:'DANLERS: PIR supply and switched/voltage-free output variants',url:'https://www.danlers.co.uk/downloadables/194d5e2dab252bdd5f7f1357e0b9d861.pdf'},
  smart:{title:'Shelly: separate switch input and potential-free relay comparison',url:'https://kb.shelly.cloud/knowledge-base/shelly-plus-1'},
  alarm:{title:'Aico: permanent supply and wired alarm interconnect',url:'https://www.aico.co.uk/technical-support/basic-alarm-wiring/'},
  emergency:{title:'Eaton: maintained and non-maintained emergency-lighting operation',url:'https://www.eaton.com/sg/en-us/markets/buildings/how-we-drive-building-efficiency-and-safety/safe-evacuation/evacuate/basics-emergency-lighting-systems.html'},
  ev:{title:'myenergi: grid measurement and charging load management',url:'https://support.myenergi.com/hc/en-gb/articles/27674431324561-The-Critical-Role-of-Grid-CT-Sensors-in-myenergi-Installations'},
  drive:{title:'ABB: ACS355 drive manuals and configurable control interfaces',url:'https://library.e.abb.com/public/8bb91255c1514222a31276b2a8e23e88/Link_List_ACS355%20manuals.htm'},
  plc:{title:'Siemens: PLC control supply, I/O power and reference requirements',url:'https://docs.tia.siemens.cloud/r/simatic_s7_1200_manual_collection_enus_20/installation/power-budget'},
  safety:{title:'Pilz: PNOZ X3 operating manual, reset and feedback comparison',url:'https://www.pilz.com/download/open/OM_PNOZ_X3_20547-EN-16.pdf'},
};

import { ELV_PAGES, ELV_WORKED, elvPage, lessonIdLimit } from './elv-coursebook.ts';
import { wireElvLesson } from './elv-circuits.ts';
type Node = [string, string];
const node = (component: string, terminal: string): Node => [component, terminal];
const endpoint = ([component, terminal]: Node): Endpoint => ({ component, terminal });

/** All loads/ratings are illustrative exercise settings, never installation design recommendations. */
class Bench {
  components: ComponentInstance[] = [];
  wires: Wire[] = [];
  live: Node = ['supply', 'L']; neutral: Node = ['supply', 'N']; earth: Node = ['supply', 'PE'];
  phases: Node[] = [['supply', 'L1'], ['supply', 'L2'], ['supply', 'L3']];
  constructor(public id: number, public name: string, public three = false) {
    this.add(three ? 'source3' : 'source', 'supply', three ? '400 V three-phase / 230 V phase-neutral' : '240 V study supply · Ireland nominal 230 V', {}, [-5, 0, 0]);
  }
  add(type: string, id: string, label: string, params: Parameters = {}, position?: [number, number, number]): string {
    const i = this.components.length - 1;
    const p: [number, number, number] = position ?? [-2 + (i % 4) * 2.2, 0, -2.3 + Math.floor(i / 4) * 2.15];
    this.components.push({ id, type, label, position: p, rotation: 0, params });
    return id;
  }
  wire(a: Node, b: Node, role: TerminalRole = 'L'): void {
    this.wires.push({ id: `w${this.wires.length + 1}`, from: endpoint(a), to: endpoint(b), role, resistance: 0.01, bends: [] });
  }
  protectedSingle(): this {
    this.add('rcbo', 'protect', 'Illustrative RCBO · 16 A / 30 mA', { rating: 16, residualRating: 0.03, closed: true });
    this.wire(['supply', 'L'], ['protect', 'LIN']); this.wire(['supply', 'N'], ['protect', 'NIN'], 'N');
    this.live = ['protect', 'LOUT']; this.neutral = ['protect', 'NOUT']; return this;
  }
  protectedThree(): this {
    this.add('mcb3', 'protect', 'Linked three-pole illustrative breaker', { rating: 16, closed: true });
    for (let p = 1; p <= 3; p++) { this.wire(['supply', `L${p}`], ['protect', `L${p}IN`], `L${p}` as TerminalRole); this.phases[p - 1] = ['protect', `L${p}OUT`]; }
    this.neutral = ['supply', 'N']; return this;
  }
  mains(id: string, inputL = 'L', inputN = 'N', hasEarth = true): void {
    this.wire(this.live, [id, inputL]); this.wire(this.neutral, [id, inputN], 'N');
    if (hasEarth) this.wire(this.earth, [id, 'PE'], 'PE');
  }
  load(type: string, id: string, label: string, live: Node = this.live, watts = 120, params: Parameters = {}): string {
    this.add(type, id, label, { watts, power: watts, ...params });
    this.wire(live, [id, 'L']); this.wire(this.neutral, [id, 'N'], 'N'); this.wire(this.earth, [id, 'PE'], 'PE'); return id;
  }
  control(type: string, id: string, label: string, feed = this.live, params: Parameters = {}): Node {
    this.add(type, id, label, { closed: true, ...params }); this.wire(feed, [id, 'COM']); return [id, 'OUT'];
  }
  powered(type: string, id: string, label: string, params: Parameters = {}): Node {
    this.add(type, id, label, params); this.mains(id, 'L', 'N', false); return [id, 'OUT'];
  }
  coil(id: string, feed: Node): void { this.wire(feed, [id, 'A1'], 'control'); this.wire(this.neutral, [id, 'A2'], 'N'); }
  contactor(id: string, label: string, params: Parameters = {}): void { this.add('contactor', id, label, { closed: false, energized: false, ...params }); }
  motor3(id: string, label: string, inputs = this.phases, star = true): void {
    this.add('motor3', id, label, { watts: 900, power: 900, connection: star ? 'star' : 'delta', ratedVoltage: 400 });
    ['U1', 'V1', 'W1'].forEach((t, i) => this.wire(inputs[i], [id, t], `L${i + 1}` as TerminalRole));
    this.wire(this.earth, [id, 'PE'], 'PE');
    if (star) { this.wire([id, 'U2'], [id, 'V2'], 'output'); this.wire([id, 'V2'], [id, 'W2'], 'output'); }
  }
  powerThrough(k: string, inputs = this.phases): Node[] {
    return inputs.map((n, i) => { this.wire(n, [k, String(1 + i * 2)], `L${i + 1}` as TerminalRole); return [k, String(2 + i * 2)] as Node; });
  }
  startStop(k: string, feed = this.live, stop = 'stop', start = 'start', overload?: string): void {
    this.add('pushbutton', stop, 'Stop · normally closed', { pressed: false });
    this.add('pushbutton', start, 'Start · momentary normally open', { pressed: false });
    this.wire(feed, [stop, 'COM'], 'control');
    let n: Node = [stop, 'NC'];
    if (overload) { this.wire(n, [overload, '95'], 'control'); n = [overload, '96']; }
    this.wire(n, [start, 'COM'], 'control'); this.wire(n, [k, '13'], 'control');
    this.wire([start, 'NO'], [k, 'A1'], 'control'); this.wire([k, '14'], [k, 'A1'], 'control'); this.wire(this.neutral, [k, 'A2'], 'N');
  }
  document(): CircuitDocument {
    const count = this.components.length - 1, rows = Math.max(1, Math.ceil(count / 5));
    this.components.slice(1).forEach((c, i) => { c.position = [-2 + (i % 5) * 1.75, 0, rows === 1 ? 0 : -2 + Math.floor(i / 5) * 5 / (rows - 1)]; });
    if(this.id>=65)this.components.slice(1).forEach((c,i)=>{c.position=[-2.6+(i%4)*2.75,0,-2.1+Math.floor(i/4)*3.9];});
    if(this.id===11){const left=this.components.find(c=>c.id==='gang-a')!,right=this.components.find(c=>c.id==='gang-b')!;left.params={...left.params,gangModule:'left',gangGroup:'two-gang-11'};right.params={...right.params,gangModule:'right',gangGroup:'two-gang-11'};right.position=[left.position[0]+.46,left.position[1],left.position[2]];}
    return furnishCableExamples({ version: 1, id: `lesson-${this.id}`, name: this.name, revision: 0,
      supply: { enabled: true, phase: this.three ? 'three' : 'single', voltage: this.three ? 400 : 240, frequency: 50, sourceResistance: 0.12 },
      components: this.components, wires: this.wires, faults: [], lessonId: this.id });
  }
}

function buildCircuit(id: number, title: string): CircuitDocument {
  const b = new Bench(id, title, id >= 53 && id <= 64);
  if(id>=65){b.protectedSingle();wireElvLesson(b,id);return b.document();}
  if (id >= 7 && id <= 52) b.protectedSingle();
  if (id >= 53) b.protectedThree();
  const sw = (i: string, l: string, feed = b.live) => b.control('switch', i, l, feed);
  const stat = (i: string, l: string, feed = b.live, closed = true) => b.control('thermostat', i, l, feed, { closed, demand: closed, setpoint: 20 });
  const lamp = (i: string, l: string, feed = b.live) => b.load('lamp', i, l, feed, 60);
  const valve = (i: string, feed: Node, label: string) => { b.add('valve', i, label, { delay: 1, demand: false }); b.mains(i); b.wire(feed, [i, 'CALL'], 'control'); return node(i, 'END'); };
  const threeStarter = (k: string, label: string, motor = 'motor') => {
    b.contactor(k, label); b.add('overload', `${k}-ol`, 'Motor overload and NC control contact', { rating: 8, closed: true });
    b.motor3(motor, 'Three-phase motor · externally linked star', b.powerThrough(`${k}-ol`, b.powerThrough(k)));
    return `${k}-ol`;
  };
  const dcControls = (id = 'control-supply') => {
    b.add('dcsupply', id, 'Isolated 24 V control supply', { outputVoltage: 24, maxPower: 120 });
    b.mains(id);
    b.live = [id, '+']; b.neutral = [id, '-'];
  };
  switch (id) {
    case 1: {
      b.add('meter', 'meter', 'Meter · energy boundary'); b.add('isolator', 'main', 'Customer main isolator', { closed: true }); b.add('panel', 'board', 'Consumer unit overview');
      b.wire(b.live, ['meter', 'L']); b.wire(b.neutral, ['meter', 'N'], 'N'); b.wire(b.earth, ['meter', 'PE'], 'PE');
      b.wire(['meter', 'LOUT'], ['main', 'LIN']); b.wire(['meter', 'NOUT'], ['main', 'NIN'], 'N');
      b.wire(['main', 'LOUT'], ['board', 'L']); b.wire(['main', 'NOUT'], ['board', 'N'], 'N'); b.wire(['meter', 'PEOUT'], ['board', 'PE'], 'PE');
      b.add('mcb', 'branch', 'Illustrative outgoing MCB', { rating: 16, closed: true }); b.wire(['board', 'LOUT'], ['branch', 'IN']);
      b.live = ['branch', 'OUT']; b.neutral = ['board', 'NOUT']; b.earth = ['board', 'PEOUT']; lamp('light', 'Represented outgoing circuit'); break;
    }
    case 2: {
      b.add('rcd', 'group', 'Shared RCCB · residual current only', { residualRating: 0.03, closed: true }); b.wire(b.live, ['group', 'LIN']); b.wire(b.neutral, ['group', 'NIN'], 'N');
      b.neutral = ['group', 'NOUT'];
      for (let i = 1; i <= 2; i++) { b.add('mcb', `branch${i}`, `Outgoing MCB ${i}`, { rating: 16, closed: true }); b.wire(['group', 'LOUT'], [`branch${i}`, 'IN']); b.load(i === 1 ? 'lamp' : 'socket', `load${i}`, `Group circuit ${i}`, [`branch${i}`, 'OUT'], i === 1 ? 60 : 200); } break;
    }
    case 3: {
      for (let i = 1; i <= 2; i++) { b.add('rcbo', `branch${i}`, `Circuit ${i} RCBO`, { rating: 16, residualRating: 0.03, closed: true }); b.wire(b.live, [`branch${i}`, 'LIN']); b.wire(['supply', 'N'], [`branch${i}`, 'NIN'], 'N'); b.neutral = [`branch${i}`, 'NOUT']; b.load(i === 1 ? 'lamp' : 'socket', `load${i}`, `Independent circuit ${i}`, [`branch${i}`, 'LOUT'], i === 1 ? 60 : 200); } break;
    }
    case 4: {
      b.add('mcb', 'upstream', 'Illustrative submain protection', { rating: 16, closed: true }); b.wire(b.live, ['upstream', 'IN']);
      b.add('isolator', 'remote', 'Remote board local isolation', { closed: true }); b.wire(['upstream', 'OUT'], ['remote', 'LIN']); b.wire(b.neutral, ['remote', 'NIN'], 'N');
      b.add('panel', 'board', 'Remote distribution board'); b.wire(['remote', 'LOUT'], ['board', 'L']); b.wire(['remote', 'NOUT'], ['board', 'N'], 'N'); b.wire(b.earth, ['board', 'PE'], 'PE');
      b.add('rcbo', 'outgoing', 'Remote final-circuit RCBO', { rating: 16, residualRating: 0.03, closed: true }); b.wire(['board', 'LOUT'], ['outgoing', 'LIN']); b.wire(['board', 'NOUT'], ['outgoing', 'NIN'], 'N'); b.neutral = ['outgoing', 'NOUT']; b.load('socket', 'load', 'Remote socket circuit', ['outgoing', 'LOUT'], 300); break;
    }
    case 5: {
      b.protectedSingle(); b.add('spd', 'spd', 'Parallel surge-protection branch'); b.mains('spd'); lamp('load', 'Protected equipment'); break;
    }
    case 6: {
      b.protectedSingle(); b.load('heater', 'priority', 'Priority demand', b.live, 800); b.add('relay', 'shed', 'Low-priority permission relay', { energized: false });
      const c = b.powered('sensor', 'monitor', 'Demand monitor · request low-priority shed', { active: false, demand: true, threshold: 1000 }); b.coil('shed', c); b.wire(b.live, ['shed', 'COM']); b.load('heater', 'secondary', 'Lower-priority demand', ['shed', 'NC'], 600); break;
    }
    case 7: lamp('light', 'One luminaire', sw('switch', 'One-way switch')); break;
    case 8: { const x = sw('switch', 'Shared lighting switch'); lamp('light-a', 'Parallel luminaire A', x); lamp('light-b', 'Parallel luminaire B', x); lamp('light-c', 'Parallel luminaire C', x); break; }
    case 9: {
      b.add('switch2', 'near', 'Two-way switch A', { position: 0, closed: true }); b.add('switch2', 'far', 'Two-way switch B', { position: 0, closed: true });
      b.wire(b.live, ['near', 'COM']); b.wire(['near', 'T1'], ['far', 'T1'], 'control'); b.wire(['near', 'T2'], ['far', 'T2'], 'control'); lamp('light', 'Staircase luminaire', ['far', 'COM']); break;
    }
    case 10: {
      b.add('switch2', 'near', 'End switch A', { position: 0 }); b.add('intermediate', 'middle', 'Intermediate crossing switch', { crossed: false, position: 0 }); b.add('switch2', 'far', 'End switch B', { position: 0 });
      b.wire(b.live, ['near', 'COM']); b.wire(['near', 'T1'], ['middle', 'A'], 'control'); b.wire(['near', 'T2'], ['middle', 'B'], 'control'); b.wire(['middle', 'C'], ['far', 'T1'], 'control'); b.wire(['middle', 'D'], ['far', 'T2'], 'control'); lamp('light', 'Three-location luminaire', ['far', 'COM']); break;
    }
    case 11: { lamp('zone-a', 'Lighting zone A', sw('gang-a', 'Gang A')); lamp('zone-b', 'Lighting zone B', sw('gang-b', 'Gang B')); break; }
    case 12: { const x = b.control('dimmer', 'dimmer', 'Compatible dimmer · illustrative level', b.live, { level: 0.65, closed: true }); lamp('light', 'Dimmable luminaire', x); break; }
    case 13: {
      b.add('driver', 'driver', 'Isolated LED driver · 24 V output', { outputVoltage: 24 }); b.mains('driver'); b.add('led', 'led', 'Extra-low-voltage LED luminaire', { watts: 12, ratedVoltage: 24, doubleInsulated: true, classII: true }); b.wire(['driver', '+'], ['led', 'L'], 'DC+'); b.wire(['driver', '-'], ['led', 'N'], 'DC-'); break;
    }
    case 14: { const x = b.powered('sensor', 'pir', 'Motion detector request', { active: true, demand: true, mode: 'pir' }); b.wire(b.live, ['pir', 'IN'], 'control'); const t = b.powered('timer', 'occupancy-hold', 'Occupancy run-on timer', { on: true, demand: true, mode: 'off-delay', delay: 4 }); b.wire(x, ['occupancy-hold', 'IN'], 'control'); lamp('light', 'Occupancy lighting', t); break; }
    case 15: { const x = b.powered('sensor', 'photo', 'Photocell · darkness requests light', { active: true, demand: true, mode: 'photocell' }); b.wire(b.live, ['photo', 'IN'], 'control'); lamp('light', 'Dusk-to-dawn light', x); break; }
    case 16: { const x = b.powered('smartrelay', 'smart', 'Smart relay and input interface', { on: true, active: true }); b.wire(sw('manual', 'Local wall switch'), ['smart', 'IN'], 'control'); lamp('light', 'Smart controlled lighting', x); break; }
    case 17: {
      b.load('socket', 'socket-a', 'Radial outlet A', b.live, 80); b.add('socket', 'socket-b', 'Radial outlet B', { watts: 100 }); b.add('socket', 'socket-c', 'Radial outlet C', { watts: 120 });
      for (const [a, c] of [['socket-a', 'socket-b'], ['socket-b', 'socket-c']]) for (const t of ['L', 'N', 'PE']) b.wire([a, t], [c, t], t as TerminalRole); break;
    }
    case 18: case 19: {
      b.load('socket', 'socket-a', 'Ring outlet A', b.live, 80); b.add('socket', 'socket-b', 'Ring outlet B', { watts: 100 }); b.add('socket', 'socket-c', 'Ring outlet C', { watts: 120 });
      for (const [a, c] of [['socket-a', 'socket-b'], ['socket-b', 'socket-c']]) for (const t of ['L', 'N', 'PE']) b.wire([a, t], [c, t], t as TerminalRole);
      b.wire(['socket-c', 'L'], b.live); b.wire(['socket-c', 'N'], b.neutral, 'N'); b.wire(['socket-c', 'PE'], b.earth, 'PE');
      if (id === 19) { b.add('fuse', 'branch-fuse', 'Illustrative fused branch', { rating: 3, closed: true }); b.wire(['socket-b', 'L'], ['branch-fuse', 'IN']); b.load('heater', 'fixed', 'Small fixed load on fused branch', ['branch-fuse', 'OUT'], 400); } break;
    }
    case 20: { const x = sw('fcu-switch', 'Fused supply switch'); b.add('fuse', 'fuse', 'Illustrative appliance fuse', { rating: 3 }); b.wire(x, ['fuse', 'IN']); b.load('heater', 'fixed', 'Small fixed load', ['fuse', 'OUT'], 300); break; }
    case 21: {
      const x = sw('grid-a', 'Labelled appliance isolation A'); const y = sw('grid-b', 'Labelled appliance isolation B');
      b.load('socket', 'outlet-a', 'Remote appliance outlet A', x, 150); b.load('socket', 'outlet-b', 'Remote appliance outlet B', y, 220); break;
    }
    case 22: case 23: {
      b.add('isolator', 'local', id === 22 ? 'Cooker local double-pole isolation' : 'Shower double-pole isolation', { closed: true }); b.wire(b.live, ['local', 'LIN']); b.wire(b.neutral, ['local', 'NIN'], 'N'); b.neutral = ['local', 'NOUT'];
      if (id === 23) { b.add('cutout', 'flow-permission', 'Illustrative water-flow permission', { closed: true }); b.wire(['local', 'LOUT'], ['flow-permission', 'COM']); b.load('shower', 'appliance', 'Shower · functional abstraction', ['flow-permission', 'OUT'], 1200); }
      else b.load('cooker', 'appliance', 'Cooker · reduced exercise load', ['local', 'LOUT'], 1500); break;
    }
    case 24: {
      b.add('transformer', 'isolation', 'Transformer inside the shaver unit', { outputVoltage: 230 }); b.mains('isolation'); b.add('shaveroutlet', 'shaver', 'Shaver outlet · isolated 230 V pair', { watts: 15, ratedVoltage: 230, doubleInsulated: true, classII: true }); b.wire(['isolation', '+'], ['shaver', 'L'], 'output'); b.wire(['isolation', '-'], ['shaver', 'N'], 'output'); break;
    }
    case 25: { const x = stat('stat', 'Operating thermostat'); const y = b.control('cutout', 'safety', 'Independent thermal cut-out', x, { closed: true }); b.load('heater', 'element', 'Immersion element', y, 1000); break; }
    case 26: {
      b.add('selector', 'selector', 'Sink / bath element selector', { position: 0 }); b.wire(b.live, ['selector', 'COM']); const a = stat('sink-stat', 'Sink element thermostat', ['selector', 'A']); const c = stat('bath-stat', 'Bath element thermostat', ['selector', 'B']); b.load('heater', 'sink', 'Short element · sink mode', a, 700); b.load('heater', 'bath', 'Long element · bath mode', c, 1000); break;
    }
    case 27: {
      const t = b.powered('timer', 'schedule', 'Immersion schedule timer', { on: true, active: true, delay: 0 }); b.wire(b.live, ['schedule', 'IN'], 'control');
      b.add('junction', 'permission', 'Schedule OR boost permission'); b.wire(t, ['permission', '1'], 'control'); b.wire(sw('boost', 'Manual boost · exercise switch'), ['permission', '2'], 'control'); const x = stat('stat', 'Immersion thermostat', ['permission', '3']); b.load('heater', 'element', 'Scheduled immersion element', x, 1000); break;
    }
    case 28: { const x = b.powered('timer', 'programme', 'Heating programmer', { on: true, active: true }); b.wire(b.live, ['programme', 'IN'], 'control'); const y = stat('room', 'Room thermostat', x); b.load('boiler', 'boiler', 'Packaged boiler heat-demand input', y, 100); break; }
    case 29: {
      const x = b.powered('timer', 'programme', 'Heating schedule', { on: true, active: true }); b.wire(b.live, ['programme', 'IN'], 'control'); const a = valve('heating-valve', stat('room', 'Room thermostat', x), 'Heating two-port zone valve'); const c = valve('water-valve', stat('cylinder', 'Cylinder thermostat', x), 'Hot-water two-port zone valve'); b.add('junction', 'end-bus', 'Valve end-switch OR'); b.wire(a, ['end-bus', '1'], 'control'); b.wire(c, ['end-bus', '2'], 'control'); b.load('boiler', 'boiler', 'Boiler demand after valve opens', ['end-bus', '3'], 100); break;
    }
    case 30: {
      b.add('valve3', 'mid-valve', 'Three-port mid-position valve', { delay: 1, position: 'mid' }); b.mains('mid-valve'); b.wire(stat('room', 'Heating demand thermostat'), ['mid-valve', 'CH'], 'control'); b.wire(stat('cylinder', 'Hot-water demand thermostat'), ['mid-valve', 'HW'], 'control'); b.load('boiler', 'boiler', 'Heat source enabled by valve interface', ['mid-valve', 'END'], 100); break;
    }
    case 31: {
      b.add('sensor', 'probe', 'Floor-temperature probe interface', { active: true, demand: true, mode: 'temperature', sensorValue: 20, setpoint: 28 }); b.mains('probe', 'L', 'N', false); b.wire(b.live, ['probe', 'IN'], 'control'); const x = stat('room', 'Underfloor room thermostat', ['probe', 'OUT']); b.load('heater', 'mat', 'Electric underfloor mat', x, 600); break;
    }
    case 32: {
      b.add('plc', 'centre', 'Underfloor wiring centre · abstract interface', { on: true, mode: 'independent', nominalVoltage: 240 }); b.mains('centre', 'L', 'N', false); b.wire(b.live, ['centre', 'COM'], 'control'); b.wire(stat('room-a', 'Room A demand'), ['centre', 'I1'], 'control'); b.wire(stat('room-b', 'Room B demand'), ['centre', 'I2'], 'control'); const a = valve('actuator-a', ['centre', 'Q1'], 'Manifold actuator A'); const c = valve('actuator-b', ['centre', 'Q2'], 'Manifold actuator B'); b.add('junction', 'open-bus', 'Actuator-open demand'); b.wire(a, ['open-bus', '1'], 'control'); b.wire(c, ['open-bus', '2'], 'control'); b.load('pump', 'pump', 'Manifold circulation pump', ['open-bus', '3'], 90); break;
    }
    case 33: { const x = b.powered('timer', 'offpeak', 'Charge-window controller', { on: true, active: true }); b.wire(b.live, ['offpeak', 'IN'], 'control'); b.load('heater', 'store', 'Storage charge element', stat('charge-stat', 'Charge thermostat', x), 900); b.load('fan', 'day', 'Daytime heat-release fan', sw('release', 'Independent daytime release'), 50); break; }
    case 34: { b.add('isolator', 'local', 'Heat-pump supply isolation', { closed: true }); b.wire(b.live, ['local', 'LIN']); b.wire(b.neutral, ['local', 'NIN'], 'N'); b.neutral = ['local', 'NOUT']; b.add('relay', 'demand', 'Packaged demand interface'); b.coil('demand', stat('room', 'Heat request')); b.wire(['local', 'LOUT'], ['demand', 'COM']); b.load('heatpump', 'unit', 'Heat pump · packaged black box', ['demand', 'NO'], 1000); break; }
    case 35: b.load('fan', 'fan', 'Simple switched extractor', sw('switch', 'Fan supply switch'), 35); break;
    case 36: {
      b.add('isolator3', 'fan-isolation', 'Three-pole fan isolation · fourth pole unused', { closed: true }); b.wire(b.live, ['fan-isolation', 'L1IN']); b.wire(b.neutral, ['fan-isolation', 'NIN'], 'N'); b.wire(sw('light-switch', 'Lighting / fan trigger'), ['fan-isolation', 'L2IN'], 'control');
      b.add('timer', 'runon', 'Fan timer with maintained supply', { on: true, demand: true, mode: 'off-delay', delay: 5 }); b.wire(['fan-isolation', 'L1OUT'], ['runon', 'L']); b.wire(['fan-isolation', 'NOUT'], ['runon', 'N'], 'N'); b.wire(['fan-isolation', 'L2OUT'], ['runon', 'IN'], 'control'); b.neutral = ['fan-isolation', 'NOUT']; b.load('fan', 'fan', 'Run-on extractor', ['runon', 'OUT'], 35); break;
    }
    case 37: {
      const x = b.powered('sensor', 'humidity', 'Humidity demand', { active: true, demand: true, mode: 'humidity' }); b.wire(b.live, ['humidity', 'IN'], 'control'); b.add('junction', 'or', 'Humidity OR override'); b.wire(x, ['or', '1'], 'control'); b.wire(sw('override', 'Manual ventilation override'), ['or', '2'], 'control'); b.load('fan', 'fan', 'Humidity extractor', ['or', '3'], 35); break;
    }
    case 38: case 39: { const x = b.powered('sensor', 'request', id === 38 ? 'High-water float request' : 'Low-pressure pumping request', { active: true, demand: true, mode: id === 38 ? 'float' : 'pressure' }); b.wire(b.live, ['request', 'IN'], 'control'); b.contactor('pump-contactor', 'Pump switching contactor'); b.coil('pump-contactor', x); b.wire(b.live, ['pump-contactor', '1']); b.load('pump', 'pump', id === 38 ? 'Sump drainage pump' : 'Pressure booster pump', ['pump-contactor', '2'], 400); if (id === 39) { b.add('relay', 'dry-run', 'Optional dry-run permission relay', { energized: true }); b.coil('dry-run', b.live); b.wire(['pump-contactor', '2'], ['dry-run', 'COM']); const w = b.wires.find(w => w.from.component === 'pump-contactor' && w.to.component === 'pump'); if (w) w.from = endpoint(['dry-run', 'NO']); } break; }
    case 40: { b.contactor('starter', 'Single-phase motor contactor'); b.add('overload', 'ol', 'Motor overload', { rating: 8, closed: true }); b.wire(b.live, ['starter', '1']); b.wire(['starter', '2'], ['ol', '1']); b.load('motor', 'motor', 'Single-phase motor', ['ol', '2'], 500); b.startStop('starter', b.live, 'stop', 'start', 'ol'); break; }
    case 41: case 52: {
      b.add('selector', 'direction', 'Up / down command selector', { position: 0 }); b.wire(b.live, ['direction', 'COM']); b.contactor('up', 'Up-direction interface'); b.contactor('down', 'Down-direction interface'); const a = b.control('cutout', 'limit-up', 'Upper travel limit · closed before endpoint', ['direction', 'A']); const c = b.control('cutout', 'limit-down', 'Lower travel limit · closed before endpoint', ['direction', 'B']); b.wire(a, ['down', '21'], 'control'); b.wire(c, ['up', '21'], 'control'); b.coil('up', ['down', '22']); b.coil('down', ['up', '22']);
      b.wire(b.live, ['up', '1']); b.wire(b.live, ['down', '1']); b.add('junction', 'run-bus', 'Either permitted direction'); b.wire(['up', '2'], ['run-bus', '1'], 'control'); b.wire(['down', '2'], ['run-bus', '2'], 'control');
      let x: Node = ['run-bus', '3']; if (id === 52) x = b.control('cutout', 'beam', 'Safety beam permission · abstract gate interface', x, { closed: true }); b.load('motor', 'operator', id === 41 ? 'Shutter packaged motor operator' : 'Gate packaged motor operator', x, 300, { packagedDirection: true }); break;
    }
    case 42: { b.load('alarm', 'smoke', 'Smoke alarm with backup', b.live, 2, { batteryBackup: true }); b.load('alarm', 'heat', 'Heat alarm with backup', b.live, 2, { batteryBackup: true }); b.wire(['smoke', 'LINK'], ['heat', 'LINK'], 'control'); break; }
    case 43: { b.add('transformer', 'tx', 'Doorbell transformer · 12 V AC', { outputVoltage: 12 }); b.mains('tx'); b.add('pushbutton', 'push', 'Doorbell push · NO', { pressed: false }); b.wire(['tx', '+'], ['push', 'COM'], 'output'); b.add('chime', 'chime', 'Low-voltage door chime', { watts: 3, ratedVoltage: 12, doubleInsulated: true }); b.wire(['push', 'NO'], ['chime', 'L'], 'output'); b.wire(['tx', '-'], ['chime', 'N'], 'output'); break; }
    case 44: case 45: { b.add('emergency', 'emergency', id === 44 ? 'Non-maintained emergency fitting' : 'Maintained emergency fitting', { maintained: id === 45, batteryCharge: 1, watts: 8 }); b.mains('emergency'); if (id === 45) b.wire(sw('normal-switch', 'Normal illumination switch'), ['emergency', 'SL'], 'control'); break; }
    case 46: { b.contactor('permission', 'EVSE charge-permission interface'); const x = b.powered('sensor', 'load-control', 'Load-management permission', { active: true, demand: true, mode: 'load' }); b.wire(b.live, ['load-control', 'IN'], 'control'); b.coil('permission', x); b.wire(b.live, ['permission', '1']); b.load('ev', 'evse', 'Single-phase EVSE · packaged controls', ['permission', '2'], 1200, { packagedProtection: true }); break; }
    case 47: { b.add('isolator', 'pv-isolator', 'Inverter AC isolation', { closed: true }); b.wire(b.live, ['pv-isolator', 'LIN']); b.wire(b.neutral, ['pv-isolator', 'NIN'], 'N'); b.add('pv', 'inverter', 'Grid-following PV inverter · AC side', { watts: 500, power: 500, generation: 500, antiIslanding: true }); b.wire(['pv-isolator', 'LOUT'], ['inverter', 'L']); b.wire(['pv-isolator', 'NOUT'], ['inverter', 'N'], 'N'); b.wire(b.earth, ['inverter', 'PE'], 'PE'); b.load('socket', 'home', 'Site demand receiving generated energy', b.live, 250); break; }
    case 48: { b.add('battery', 'inverter', 'Battery inverter with packaged backup changeover', { watts: 300, power: 300, batteryCharge: 1, backup: true }); b.mains('inverter'); b.add('lamp', 'essential', 'Essential lighting on backup output', { watts: 60 }); b.wire(['inverter', 'BL'], ['essential', 'L']); b.wire(['inverter', 'BN'], ['essential', 'N'], 'N'); b.wire(b.earth, ['essential', 'PE'], 'PE'); b.load('socket', 'ordinary', 'Ordinary non-backup demand', b.live, 150); break; }
    case 49: { const t = b.powered('timer', 'hours', 'Trading-hours permission', { on: true, active: true }); b.wire(b.live, ['hours', 'IN'], 'control'); const p = b.powered('sensor', 'dark', 'Photocell darkness permission', { active: true, demand: true, mode: 'photocell' }); b.wire(t, ['dark', 'IN'], 'control'); b.contactor('sign', 'Signage lighting contactor'); b.coil('sign', p); b.wire(b.live, ['sign', '1']); lamp('letters-a', 'Signage bank A', ['sign', '2']); lamp('letters-b', 'Signage bank B', ['sign', '2']); break; }
    case 50: { const d = b.powered('timer', 'defrost-clock', 'Defrost schedule', { on: false, demand: true, active: false, delay: 0 }); b.wire(b.live, ['defrost-clock', 'IN'], 'control'); b.add('relay', 'defrost', 'Cooling / defrost interlock relay'); b.coil('defrost', d); b.wire(b.live, ['defrost', 'COM']); const c = stat('cold-stat', 'Cabinet cooling demand', ['defrost', 'NC']); b.load('motor', 'compressor', 'Refrigeration compressor', c, 250); b.load('heater', 'defrost-heat', 'Defrost heater', ['defrost', 'NO'], 300); break; }
    case 51: { const x = b.powered('sensor', 'pressure', 'Compressor pressure demand', { active: true, demand: true, mode: 'pressure' }); b.wire(b.live, ['pressure', 'IN'], 'control'); b.contactor('compressor-k', 'Compressor contactor'); b.wire(x, ['ol', '95'], 'control'); b.coil('compressor-k', ['ol', '96']); b.wire(b.live, ['compressor-k', '1']); b.add('overload', 'ol', 'Compressor overload', { rating: 8 }); b.wire(['compressor-k', '2'], ['ol', '1']); b.load('motor', 'compressor', 'Compressor motor', ['ol', '2'], 450); b.add('relay', 'unload', 'Unloader release when stopped'); b.coil('unload', ['compressor-k', '2']); b.wire(b.live, ['unload', 'COM']); b.load('indicator', 'unloader', 'Unloader valve represented by indicator', ['unload', 'NC'], 5); break; }
    case 53: { const loads = ['lamp', 'socket', 'heater']; for (let i = 0; i < 3; i++) b.load(loads[i], `phase-load${i + 1}`, `Phase ${i + 1} to neutral demand`, b.phases[i], [60, 200, 500][i]); break; }
    case 54: { b.add('isolator3', 'socket-isolation', 'Industrial socket linked isolation', { closed: true }); b.phases.forEach((p, i) => b.wire(p, ['socket-isolation', `L${i + 1}IN`], `L${i + 1}` as TerminalRole)); b.wire(b.neutral, ['socket-isolation', 'NIN'], 'N'); b.add('socket3', 'socket', 'Five-contact industrial outlet', { watts: 300 }); ['L1', 'L2', 'L3'].forEach(p => b.wire(['socket-isolation', `${p}OUT`], ['socket', p], p as TerminalRole)); b.wire(['socket-isolation', 'NOUT'], ['socket', 'N'], 'N'); b.wire(b.earth, ['socket', 'PE'], 'PE'); break; }
    case 55: { const o = threeStarter('starter', 'DOL three-phase contactor'); b.live = b.phases[0]; b.startStop('starter', b.live, 'stop', 'start', o); break; }
    case 56: {
      b.live = b.phases[0]; b.contactor('forward', 'Forward contactor · mechanical pair', { mechanicallyInterlockedWith: 'reverse' }); b.contactor('reverse', 'Reverse contactor · mechanical pair', { mechanicallyInterlockedWith: 'forward' }); const f = b.powerThrough('forward'); const r = b.powerThrough('reverse', [b.phases[2], b.phases[1], b.phases[0]]); b.add('overload', 'ol', 'Common motor overload', { rating: 8 }); const o = b.powerThrough('ol', f); r.forEach((n, i) => b.wire(n, ['ol', String(1 + i * 2)], `L${i + 1}` as TerminalRole)); b.motor3('motor', 'Reversible externally star-linked motor', o);
      b.contactor('run-permit', 'Maintained run permission'); b.startStop('run-permit', b.live, 'stop', 'start', 'ol'); b.add('selector', 'direction', 'Forward / reverse request', { position: 0 }); b.wire(['run-permit', '14'], ['direction', 'COM'], 'control'); b.wire(['direction', 'A'], ['reverse', '21'], 'control'); b.wire(['direction', 'B'], ['forward', '21'], 'control'); b.coil('forward', ['reverse', '22']); b.coil('reverse', ['forward', '22']); break;
    }
    case 57: {
      b.live = b.phases[0]; b.contactor('main', 'Main motor contactor'); b.contactor('star', 'Star contactor · mechanical pair', { mechanicallyInterlockedWith: 'delta' }); b.contactor('delta', 'Delta contactor · mechanical pair', { mechanicallyInterlockedWith: 'star' }); const main = b.powerThrough('main'); b.motor3('motor', 'Six-terminal motor · illustrative 400 Δ / 690 Y eligibility', main, false); const motor = b.components.find(c => c.id === 'motor'); if (motor) motor.params.windingVoltage = 400;
      b.startStop('main'); b.add('junction', 'star-point', 'Temporary star point'); ['U2', 'V2', 'W2'].forEach((t, i) => { b.wire(['motor', t], ['star', String(1 + i * 2)], 'output'); b.wire(['star', String(2 + i * 2)], ['star-point', String(i + 1)], 'output'); });
      [['U2', 'V1'], ['V2', 'W1'], ['W2', 'U1']].forEach(([a, c], i) => { b.wire(['motor', a], ['delta', String(1 + i * 2)], 'output'); b.wire(['delta', String(2 + i * 2)], ['motor', c], 'output'); });
      b.add('timer', 'transition', 'Illustrative star-delta transition timer', { on: true, demand: true, delay: 4 }); b.wire(['main', '14'], ['transition', 'L']); b.wire(b.neutral, ['transition', 'N'], 'N'); b.wire(['main', '14'], ['transition', 'IN'], 'control'); b.add('relay', 'time-contact', 'Transition changeover contact'); b.coil('time-contact', ['transition', 'OUT']); b.wire(['main', '14'], ['time-contact', 'COM'], 'control'); b.wire(['time-contact', 'NC'], ['delta', '21'], 'control'); b.coil('star', ['delta', '22']); b.wire(['time-contact', 'NO'], ['star', '21'], 'control'); b.coil('delta', ['star', '22']); break;
    }
    case 58: { b.add('vfd', 'drive', 'Variable-frequency drive · packaged power stage', { frequency: 35, speed: 0.7, run: true }); ['L1', 'L2', 'L3'].forEach((t, i) => b.wire(b.phases[i], ['drive', t], t as TerminalRole)); b.wire(b.earth, ['drive', 'PE'], 'PE'); const x = b.control('switch', 'run', 'Drive run permission · dry contact', ['drive', 'COM']); b.wire(x, ['drive', 'RUN'], 'control'); b.motor3('motor', 'Drive-fed motor · output waveform abstraction', [['drive', 'U'], ['drive', 'V'], ['drive', 'W']]); break; }
    case 59: { b.live = b.phases[0]; b.contactor('stage-a', 'Heater stage A'); b.contactor('stage-b', 'Heater stage B'); const cut = b.control('cutout', 'safety', 'Independent high-temperature safety limit'); b.coil('stage-a', stat('demand-a', 'Stage A temperature demand', cut)); b.coil('stage-b', stat('demand-b', 'Stage B temperature demand', cut)); for (const [k, n] of [['stage-a', 1], ['stage-b', 2]] as const) b.powerThrough(k).forEach((p, i) => b.load('heater', `h${n}-${i}`, `Stage ${n} phase ${i + 1} element`, p, 250)); break; }
    case 60: { const o = threeStarter('starter', 'Two-station motor contactor'); b.live = b.phases[0]; b.startStop('starter', b.live, 'stop-a', 'start-a', o); b.add('pushbutton', 'stop-b', 'Remote stop · NC', { pressed: false }); b.add('pushbutton', 'start-b', 'Remote start · NO', { pressed: false }); const w = b.wires.find(w => w.from.component === 'stop-a' && w.from.terminal === 'NC'); if (w) w.from = endpoint(['stop-b', 'NC']); b.wire(['stop-a', 'NC'], ['stop-b', 'COM'], 'control'); b.wire(['start-a', 'COM'], ['start-b', 'COM'], 'control'); b.wire(['start-b', 'NO'], ['starter', 'A1'], 'control'); break; }
    case 61: { b.live = b.phases[0]; const a = threeStarter('downstream', 'Downstream conveyor starter', 'motor-a'); const c = threeStarter('upstream', 'Upstream conveyor starter', 'motor-b'); b.startStop('downstream', b.live, 'stop-a', 'start-a', a); b.startStop('upstream', ['downstream', '14'], 'stop-b', 'start-b', c); break; }
    case 62: { b.live = b.phases[0]; const x = b.powered('sensor', 'float-low', 'Normal pumping level', { active: true, demand: true, mode: 'float' }); const y = b.powered('sensor', 'float-high', 'High-level assist', { active: false, demand: true, mode: 'float' }); b.wire(b.live, ['float-low', 'IN'], 'control'); b.wire(b.live, ['float-high', 'IN'], 'control'); b.add('selector', 'duty', 'Duty selection A / B', { position: 0 }); b.wire(x, ['duty', 'COM'], 'control'); const a = threeStarter('pump-a-k', 'Pump A starter', 'pump-a'); const c = threeStarter('pump-b-k', 'Pump B starter', 'pump-b'); b.contactor('assist', 'High-level assist · independent permission contacts'); b.coil('assist', y); b.wire(b.live, ['assist', '1'], 'control'); b.wire(b.live, ['assist', '3'], 'control'); b.add('junction', 'a-or', 'A duty OR assist'); b.add('junction', 'b-or', 'B duty OR assist'); b.wire(['duty', 'A'], ['a-or', '1'], 'control'); b.wire(['duty', 'B'], ['b-or', '1'], 'control'); b.wire(['assist', '2'], ['a-or', '2'], 'control'); b.wire(['assist', '4'], ['b-or', '2'], 'control'); b.wire(['a-or', '3'], [a, '95'], 'control'); b.wire(['b-or', '3'], [c, '95'], 'control'); b.coil('pump-a-k', [a, '96']); b.coil('pump-b-k', [c, '96']); break; }
    case 63: { b.live = b.phases[0]; const o = threeStarter('starter', 'PLC-commanded starter'); dcControls(); const k = b.components.find(c => c.id === 'starter'); if (k) k.params.nominalVoltage = 24; b.add('plc', 'plc', 'PLC input/output interface abstraction', { mode: 'and', on: true, nominalVoltage: 24 }); b.mains('plc', 'L', 'N', false); b.wire(b.live, ['plc', 'COM'], 'control'); const a = b.powered('sensor', 'present', 'Workpiece-present sensor', { active: true, demand: true, nominalVoltage: 24 }); const c = b.powered('sensor', 'ready', 'Machine-ready permission', { active: true, demand: true, nominalVoltage: 24 }); b.wire(b.live, ['present', 'IN'], 'control'); b.wire(b.live, ['ready', 'IN'], 'control'); b.wire(a, ['plc', 'I1'], 'control'); b.wire(c, ['plc', 'I2'], 'control'); b.wire(['plc', 'Q1'], [o, '95'], 'control'); b.coil('starter', [o, '96']); b.add('indicator', 'ol-status', 'Controller secondary status', { watts: 2, nominalVoltage: 24 }); b.wire(['plc', 'Q2'], ['ol-status', 'L'], 'control'); b.wire(b.neutral, ['ol-status', 'N'], 'DC-'); b.wire(b.earth, ['ol-status', 'PE'], 'PE'); break; }
    case 64: {
      b.live = b.phases[0]; const o = threeStarter('starter', 'Machine motor contactor'); dcControls(); const k = b.components.find(c => c.id === 'starter'); if (k) k.params.nominalVoltage = 24; b.add('safetyRelay', 'safety-relay', 'Safety relay · conceptual black box', { nominalVoltage: 24 }); b.mains('safety-relay', 'L', 'N', false); b.wire(b.live, ['safety-relay', 'COM'], 'control'); b.add('pushbutton', 'channel-a', 'Safety input channel A · NC', { pressed: false }); b.add('pushbutton', 'channel-b', 'Safety input channel B · NC', { pressed: false }); b.wire(b.live, ['channel-a', 'COM'], 'control'); b.wire(b.live, ['channel-b', 'COM'], 'control'); b.wire(['channel-a', 'NC'], ['safety-relay', 'S1'], 'control'); b.wire(['channel-b', 'NC'], ['safety-relay', 'S2'], 'control'); b.add('pushbutton', 'reset', 'Monitored reset request · NO', { pressed: false }); b.wire(b.live, ['reset', 'COM'], 'control'); b.wire(['reset', 'NO'], ['safety-relay', 'RESET'], 'control'); b.wire(b.live, ['starter', '21'], 'control'); b.wire(['starter', '22'], ['safety-relay', 'FB'], 'control'); b.startStop('starter', ['safety-relay', 'OUT'], 'stop', 'start', o); break;
    }
    default: throw new Error(`Missing distinct circuit for lesson ${id}`);
  }
  return b.document();
}

type Spec = [title: string, category: string, tag: ConfigurationLesson['tag'], purpose: string, connections: string, sequence: string, measurement: string, fault: string, briefing: string, hint: string, answer: string, checks: string[]];
/** Content intentionally describes mechanisms, rather than prescribing real installation sizes or ratings. */
const SPECS: Spec[] = [
  ['Single-phase supply, meter and consumer unit', 'Distribution', 'Routine',
    'Follow one supply through the meter, the main switch and the outgoing breaker. The meter measures energy in kilowatt-hours. The breaker protects the outgoing circuit.',
    'Trace line and neutral from the meter through the main switch to the board. The outgoing line passes through the breaker on its way to the lamp. Follow the earth wire separately.',
    'Open the main switch and check the lamp. Close it again, then open the outgoing breaker. Look at which part of the board still has a supply.',
    'Compare line to neutral before and after the main switch. With that switch open, its supply side can still read close to mains voltage.',
    'open-live', 'The meter has a supply but the lamp is dark.', 'Start at the outgoing breaker. Compare its output with the line terminal at the lamp.', 'The wire from the breaker output to lamp L is open. Voltage at the meter tells you the incoming supply is present, but it doesn’t tell you that the lamp has a complete circuit.',
    ['The main switch disconnects the board.', 'The outgoing breaker switches the lamp circuit.']],
  ['Shared RCCB with outgoing MCB circuits', 'Distribution', 'Existing',
    'An RCCB checks the balance of current in line and neutral for the whole group. Each MCB protects its own branch against excess current.',
    'The lamp and socket have separate breakers. Both get line and neutral through the same RCCB. Their earth wires follow a separate path.',
    'Start with both loads on. Switch off MCB 1 and compare the lamp with the socket. Then close it and try the shared RCCB.',
    'Compare the voltage across each load with MCB 1 off. A current reading on the RCCB feed includes both branches that are running.',
    'earth-fault', 'A fault on one circuit has tripped the shared device. Both loads are off.', 'Look for the protective device common to the lamp and socket. Check its trip indication.', 'Current is leaking to earth at the lamp load. The shared RCCB detects the imbalance and opens, cutting power to both branches.',
    ['Opening the lamp breaker leaves the socket on.', 'Opening the shared RCCB cuts power to both loads.']],
  ['Individual RCBO circuits', 'Distribution', 'Routine',
    'Each RCBO checks its own circuit for excess current and leakage. Identify the outgoing neutral as well as the outgoing line.',
    'Trace each load from LOUT and back to NOUT on the same RCBO. The two outgoing neutrals have separate routes through the board.',
    'Switch off the first RCBO. Check both loads, then switch it back on.',
    'Read line to neutral at each load with the first RCBO off. Keeping the same probe pair on each load makes the two readings comparable.',
    'earth-fault', 'The first branch has tripped. Check whether the socket beside it has lost power too.', 'Check both RCBO indications and trace the neutral from the affected load.', 'The first load has an earth fault. Its own RCBO trips. The other load still has line and neutral through its separate RCBO.',
    ['The first RCBO can disconnect its load while the second stays on.', 'Each load returns through its own RCBO neutral.']],
  ['Submain and remote distribution board', 'Distribution', 'Routine',
    'A protected cable, the submain, supplies the remote board. Its local main switch and outgoing RCBO serve different parts of the circuit.',
    'Follow the feeder through the remote isolator to the board. The board supplies the outgoing RCBO, which feeds the socket. Earth continues to the socket alongside the supply conductors.',
    'Open the remote isolator and check the socket. Restore it, then open only the outgoing RCBO. Compare the two states at the board.',
    'Measure from line to neutral at the feeder, board input and socket. Each pair tells you about a different point on the run. Cable design needs more information than this bench supplies.',
    'open-neutral', 'The remote socket is dead even though the line reaches the board.', 'Follow the neutral through the remote main switch and into the board.', 'The neutral between the remote isolator’s NOUT and the board’s N is open. There’s no normal return for socket current.',
    ['Opening the remote isolator disconnects the board supply.', 'With the circuit intact and the controls on, the socket load takes power.']],
  ['Parallel surge-protection branch', 'Distribution', 'Equipment dependent',
    'An SPD gives a surge a path at the board. The ordinary lamp current takes a different path.',
    'Follow the SPD connections to line, neutral and protective earth. Follow the lamp separately from line to neutral.',
    'Run the lamp. Compare its current with the SPD branch. Try the study fault and check the earth finding as well as the light.',
    'Normal current in the SPD branch is negligible here. The simulator shows the connections under steady supply and does not reproduce a surge waveform.',
    'missing-earth', 'The lamp works, but the test reports a problem at the surge protector.', 'Trace the SPD’s earth terminal back towards the supply.', 'The earth wire to the SPD is open. Repairing it restores the protective path. The lamp can work in either state because it has its own line and neutral.',
    ['The SPD is connected across the supply.', 'The lamp can still work with the SPD earth open.']],
  ['Priority load shedding', 'Distribution', 'Equipment dependent',
    'Some supplies use a priority controller so two large loads don’t have to run together. Here the controller disconnects one of two heaters.',
    'The priority heater has a direct feed. The other gets its feed through the relay’s normally closed contact, marked NC. The demand monitor drives the coil.',
    'Run both heaters, then call for shedding at the monitor. Watch the lower-priority heater and restore the original setting.',
    'Compare total current with both heaters running and with only the priority heater running. The difference is the contribution of the switched branch.',
    'wrong-control', 'Ask the monitor to shed the lower-priority heater. Both heaters stay on.', 'Compare voltage at the monitor output with voltage across the relay coil.', 'The lead from monitor OUT to relay A1 is open. The coil cannot pull in, so its normally closed contact keeps the second heater supplied.',
    ['The priority heater stays on during shedding.', 'Total power drops when the second heater switches off.']],
  ['One-way lighting', 'Lighting', 'Routine',
    'The rocker stays where you leave it. Its contacts switch the line to the lamp. Neutral is the return for the lamp current.',
    'At the switch, line enters COM and leaves at the switched output. Follow that wire to L on the lamp. Lamp N goes back to neutral. PE is the protective earth.',
    'Flick the switch both ways. Open its inspection view and watch when the contacts touch. The earth connection stays in place as the rocker moves.',
    'With the lamp on, compare L and N at the lamp. Then measure across the switch itself. A closed contact has very little voltage across it. An open switch can have nearly the full supply across it.',
    'open-live', 'The switch is on but the lamp is dark.', 'Check where voltage is present at the switch, then at lamp L. For a continuity check, isolate the simulated supply first.', 'There’s a break between the switch output and lamp L. The closed switch has a feed, but it can’t supply the lamp through that broken wire.',
    ['Opening the switch turns the lamp off.', 'Closing the switch restores voltage across the lamp.']],
  ['Parallel lighting bank', 'Lighting', 'Routine',
    'One switch supplies a group of lamps. Each lamp has its own complete line-to-neutral path through the group.',
    'Trace the switched line to the L terminal on each lamp. Then follow each N back to neutral. The lamps are connected in parallel.',
    'Operate the shared switch. Compare all three lamps, then try the single-branch fault and see which lights remain on.',
    'Read L to N at each lit lamp. Each should be close to the full supply. The shared feed carries the current for all the lamps that are on.',
    'open-neutral', 'One lamp is dark. The two beside it still work.', 'Compare the dark lamp’s line and neutral connections with the working lamps.', 'Lamp B has an open neutral wire. The other two branches still have complete return paths, so their lamps can stay on.',
    ['All three lamps receive nearly the same voltage when lit.', 'Opening one branch leaves the other complete branches available.']],
  ['Two-way staircase lighting', 'Lighting', 'Routine',
    'Each two-way switch connects its common terminal to one of two strappers. The two switch positions together decide whether current can reach the lamp.',
    'Line goes to COM at switch A. The two strappers join T1 to T1 and T2 to T2. COM on switch B supplies the lamp.',
    'Try all four combinations of A and B. After each move, note the selected strapper and whether the lamp is on.',
    'Compare the voltage across the lamp in the four positions. For this straight pair of strappers the lamp is on when both switches select the same strapper.',
    'wrong-control', 'The stairs light works in one combination but misses another.', 'Check each strapper end to end with the simulated supply off.', 'The T1 strapper between A and B is open. The lamp can still work through T2 when both switches select it.',
    ['Either switch can change the lamp state on an intact circuit.', 'Both strappers are needed for all four combinations to work.']],
  ['Three-location intermediate lighting', 'Lighting', 'Routine',
    'An intermediate switch adds a third control point between a pair of two-way switches. It changes how the strappers pass through the middle.',
    'Trace each incoming strapper to the middle switch, then trace the two outgoing wires to the far switch. The middle contacts can join the paths straight through or cross them.',
    'Start with the light on. Change the middle switch, then an end switch. Watch which complete route reaches the lamp each time.',
    'Measure across the lamp as you change one switch at a time. To test a strapper for continuity, isolate the circuit first.',
    'wrong-control', 'The middle switch changes position, but the lamp misses some combinations.', 'Follow each outgoing wire from the middle switch to the far switch.', 'There’s a break from C on the intermediate switch to T1 on the far switch. Any combination that needs that wire loses the lamp path.',
    ['Moving the intermediate switch changes the lamp state.', 'An end switch can still operate the lamp with the middle switch crossed.']],
  ['Two-gang independent lighting zones', 'Lighting', 'Routine',
    'Two rockers share a faceplate and a feed. Each rocker switches one lighting zone.',
    'Follow each rocker’s output to its own lamp. Both lamps return to neutral, but the switched outputs stay separate.',
    'With both lamps on, turn off A. Leave B alone and check which zone changes. Restore A to compare the two outputs.',
    'Compare voltage across lamp A and lamp B. When one rocker is off its lamp can read near zero while the other stays at the supply voltage.',
    'short-circuit', 'Both lighting zones have gone out and the device feeding them has tripped.', 'Look at what protects both zones, then check which branch has the fault.', 'A line-to-neutral short on zone A trips the common protection. The two rockers are independent, but both get their feed through that device.',
    ['Rocker A controls zone A only.', 'A common upstream trip can switch both zones off.']],
  ['Compatible dimmer and luminaire', 'Lighting', 'Equipment dependent',
    'The lab dimmer varies a series resistance so you can see the effect on current and lamp power. An electronic dimmer may use a different method and must suit its lamp.',
    'Follow line through the dimmer to the lamp. The lamp returns to neutral. The percentage on the control is a setting, not a reading in watts.',
    'Keep the dimmer switched on. Compare the lamp at the lower and higher settings. Read the power at each setting.',
    'Use the lamp power reading in watts. You can also compare the lamp’s voltage and its branch current. A real chopped waveform needs a meter suited to it.',
    'wrong-control', 'The knob moves, but the lamp stays dark at every setting.', 'Start at the dimmer’s incoming COM terminal before checking its output.', 'The supply wire to dimmer COM is open. Turning the knob changes its setting but no power reaches the lamp.',
    ['A lower setting reduces lamp power.', 'The lamp’s watt reading changes with the knob.']],
  ['Isolated LED-driver lighting', 'Lighting', 'Equipment dependent',
    'A constant-voltage LED driver takes mains AC at its input and supplies a separate DC output. The LED strip belongs to that output circuit.',
    'Find L and N on the input side, then + and − on the strip side. The strip’s return goes back to the driver’s negative terminal.',
    'Switch the supply on. Find the driver and strip on the drawing, then compare the readings on each side.',
    'Use AC volts across the driver input and DC volts across the output pair. An isolated output may have no defined voltage to mains neutral.',
    'open-neutral', 'The driver has mains power but the strip is dark.', 'Check the output at the driver, then follow both wires to the strip.', 'The strip’s negative return to the driver is open. The missing wire is on the DC side of the driver.',
    ['The driver supplies the LED from its separate output pair.', 'The DC return goes back to the driver.']],
  ['PIR timed lighting', 'Lighting', 'Routine',
    'A PIR detector senses movement. This example uses a separate timer to keep the light on briefly after movement ends.',
    'Trace detector OUT to timer IN, then timer OUT to the lamp. The timer also has a permanent supply.',
    'Start with movement present. Remove it and watch the lamp immediately and after four simulated seconds.',
    'Compare the voltage at the lamp just after movement stops and after the delay. If the light stays on briefly, check the timer before looking for a stuck switch.',
    'wrong-control', 'The detector has a supply, but the light doesn’t come on for movement.', 'Compare the detector output with the signal reaching timer IN.', 'The wire between PIR OUT and timer IN is open. The timer has power, but a new movement signal can’t reach it.',
    ['Movement switches the lamp on.', 'The lamp goes off after the four-second run-on.']],
  ['Photocell exterior lighting', 'Lighting', 'Routine',
    'A photocell changes its output according to daylight. This example shows its supply and switched output separately.',
    'Find the photocell supply, its enabling input and the output to the exterior lamp. The lamp’s neutral returns directly.',
    'Try darkness, then daylight. Watch which input stays powered and which connection to the lamp switches.',
    'Read the lamp voltage in both conditions. The photocell still needs its own supply even in daylight when its output is off.',
    'wrong-control', 'It’s dark and the photocell has power, but the outside lamp is off.', 'Check the enabling feed at photocell IN as well as the device’s supply.', 'The line wire into photocell IN is open. With no feed there, the photocell cannot supply its output even though its sensor has power.',
    ['The lamp can light in darkness.', 'Daylight turns off the lamp while the sensor stays powered.']],
  ['Smart relay with local switch input', 'Lighting', 'Equipment dependent',
    'The wall switch and the relay have different jobs. The wall switch gives the relay a signal. The relay switches the lamp.',
    'Trace the wall switch to IN on the smart relay, its permanent L and N supply, then OUT to the lamp. See the product diagram for the input and output type on a real unit.',
    'Use the wall switch while the smart unit has power. Compare the input signal with the lamp response.',
    'Compare IN to N and the lamp’s L to N. A powered smart unit can still have no signal at IN.',
    'wrong-control', 'The smart unit has power. Moving the wall switch does nothing to the lamp.', 'Compare the switched output at the wall with the reading at the relay’s IN terminal.', 'The wire from the manual switch output to smart relay IN is open. The switch changes state but its signal never reaches the relay.',
    ['The relay needs a supply of its own.', 'Its lamp output follows the wired input in this setup.']],
  ['Domestic socket radial', 'Sockets & supplies', 'Routine',
    'A socket radial has one route away from the board. The first cable feeds every load farther along the run.',
    'Follow line, neutral and earth from the board to A, then B, then C. The socket loads connect across line and neutral.',
    'Switch on the loads. Compare the current between the board and A with the current between B and C.',
    'Clamp one line wire at a time. The board end carries the sum of the three load currents. Check L to N at each socket for its voltage.',
    'open-live', 'The first two outlets work, but the last one has no power.', 'Compare the line at B with the line at C. Isolate the circuit before checking that length for continuity.', 'The line from B to C is open. A and B still have a route to the board, but there’s no live feed to C.',
    ['All three intact sockets have a supply.', 'The first line segment carries more current than the last.']],
  ['Encountered ring final topology', 'Sockets & supplies', 'Existing',
    'In an intact ring final the line and neutral each return to the board. Current can reach a socket from either direction along the ring.',
    'Trace each conductor all the way back to its starting point. Follow line and neutral separately so it’s clear which path you’re checking.',
    'With the loads on, check the two line legs at the board. Open the study fault and compare the current in the broken leg with the current in the remaining leg.',
    'A current reading on one leg is only part of the load current. To investigate a break, isolate the simulated supply and trace the individual conductor.',
    'open-live', 'The sockets still work, but one line leg no longer carries current.', 'Trace the line wire from socket C back to the breaker. Compare both ends of that return leg.', 'The returning line from C to the board is open. The other side of the ring can still feed the sockets. A working socket does not prove an intact ring.',
    ['An intact, loaded ring shares current between its legs.', 'A broken leg can leave sockets operating.']],
  ['Ring topology with fused branch', 'Sockets & supplies', 'Existing',
    'A fused branch leaves the ring at one point. The branch fuse protects the fixed load’s feed separately from the ring.',
    'Follow the ring conductors past the take-off point. Trace the branch line through its fuse to the appliance and its neutral back to the ring.',
    'Open the branch fuse and check the fixed load. Check a ring socket too, then restore the fuse.',
    'Measure across the fixed load and across a ring socket. Compare the branch current with the fuse’s study rating.',
    'overload', 'The socket ring still works but the branch protection has opened.', 'Check the current on the fixed appliance branch against its fuse rating.', 'The fixed load is drawing more current than the branch fuse allows. Remove the study overload before resetting the simulated protection.',
    ['Opening the branch fuse disconnects its appliance.', 'The sockets on the intact ring retain their supply.']],
  ['Switched fused fixed supply', 'Sockets & supplies', 'Routine',
    'A switched fused connection unit houses the switch and fuse in one fitting. On the lesson bench they sit separately so you can follow the line wire through both. For the combined fitting, look for the switched fused connection unit in Sandbox, modelled on the BG 851.',
    'Follow the path from the switch through the fuse to appliance L. Trace N and PE separately back to the board.',
    'Turn the local switch off and on. Then open the fuse with the switch on and observe the appliance.',
    'Compare switch output, fuse output and the appliance’s L terminal, each against the circuit neutral. A closed handle alone cannot confirm the whole route.',
    'open-live', 'The local switch is on, but the appliance stays off.', 'Start at the fuse output. Compare it with L at the appliance.', 'The wire from the fuse output to the appliance is open. The switch and fuse can both be closed while the appliance has no feed.',
    ['Both the switch and the fuse must have a complete path.', 'Opening the local switch stops the appliance.']],
  ['Kitchen remote isolation bank', 'Sockets & supplies', 'Routine',
    'Grouped kitchen switches let you disconnect an appliance from a different position. Trace the wire as well as reading the faceplate label.',
    'Each switch has its own output to a remote outlet. The outlets share the upstream supply but the switched lines are separate.',
    'Switch A off while B stays on. Identify the outlet that loses power. Restore it and compare the second pair.',
    'Check each outlet between L and N before and after moving a switch. This establishes the actual pairing on the bench.',
    'wrong-control', 'Switch A is on but outlet A has no supply. Outlet B still works.', 'Check A’s outgoing terminal and the line terminal at its labelled outlet.', 'The wire from switch A to outlet A is open. The labels match the intended connection, but that connection is broken.',
    ['Switch A operates outlet A.', 'Outlet B can stay on with A switched off.']],
  ['Cooker supply and double-pole isolation', 'Sockets & supplies', 'Routine',
    'A double-pole isolator disconnects the cooker’s line and neutral together. The protective conductor has a continuous route through to the cooker.',
    'Find LIN and NIN at the switch. Follow LOUT and NOUT to the cooker. PE reaches the appliance without going through a switched contact.',
    'Open the cooker isolator. Check the appliance, then close the switch and check it again.',
    'Compare the incoming L–N voltage with L–N at the cooker. Use the protective-path test separately from the heating check.',
    'missing-earth', 'The cooker heats but its earth check fails.', 'Trace the PE wire from the board to the cooker’s earth terminal.', 'The cooker’s protective conductor is open. Heating current still has its line and neutral path, so the cooker can appear to work normally.',
    ['The isolator opens both switched paths.', 'The protective path is still needed when the cooker heats normally.']],
  ['Electric shower supply and permissions', 'Sockets & supplies', 'Routine',
    'A flow switch prevents the shower element from heating without the required water flow. It works in addition to the local isolator.',
    'Line passes through the local isolator and flow contact before it reaches the heater. Neutral goes through the other isolator pole. PE stays connected to the appliance.',
    'Leave the isolator on and stop the flow signal. Restore it and compare the element power in both states.',
    'Check the output of the isolator, the two sides of the flow contact and the voltage across the element. The lab represents the flow contact rather than the shower’s plumbing.',
    'wrong-control', 'The isolator and flow contact are both on. The shower still won’t heat.', 'Check whether the flow contact has a feed at COM.', 'The line from isolator LOUT to the flow contact is open. The closed contact has no supply to pass on to the heater.',
    ['The heater stops if the flow contact opens.', 'Local isolation also stops heating.']],
  ['Isolated shaver supply', 'Sockets & supplies', 'Equipment dependent',
    'A shaver outlet uses an isolating transformer. Its output winding supplies the shaver on a separate circuit. On the bench the transformer and the 230 V outlet are shown apart so you can measure both.',
    'Line and neutral supply the primary. Both ends of the secondary run to the shaver outlet. There is no normal secondary return through mains neutral.',
    'Compare the transformer input with the voltage across the shaver outlet. Follow the output pair back to the winding.',
    'Place both probes on the secondary to read its voltage. A measurement from a floating secondary to an unrelated earth may be unresolved.',
    'open-neutral', 'The transformer input has a supply but the shaver load doesn’t work.', 'Compare the secondary voltage at the transformer with the voltage at the outlet.', 'One wire from the transformer secondary to the shaver outlet is open. The missing return is on the isolated output side.',
    ['The secondary has a defined voltage across its own two terminals.', 'The shaver current needs a complete secondary loop.']],
  ['Immersion thermostat and independent cut-out', 'Heating', 'Routine',
    'Two contacts are in series with the immersion element. The operating thermostat controls normal heating. The independent cut-out can interrupt it.',
    'Trace line through the thermostat, then the cut-out, then the element. The element returns to neutral.',
    'Try opening each control while the other one remains closed. Restore both and check the element.',
    'Compare the voltage across the element and across each contact. When an open contact interrupts heating, it can have voltage across it.',
    'wrong-control', 'The thermostat is calling for heat, but the element stays cold.', 'Work from the thermostat output towards the input of the thermal cut-out.', 'The wire from thermostat OUT to cut-out COM is open. Even with both controls closed, heating current cannot cross the break.',
    ['Opening either series control stops heating.', 'The cut-out can stop the element while the thermostat calls.']],
  ['Dual immersion sink/bath selection', 'Heating', 'Existing',
    'The sink/bath selector chooses one of two element circuits. Each branch still has its own thermostat.',
    'Find COM on the selector. Follow A through the sink thermostat to its element and B through the bath thermostat to the other.',
    'Choose Sink and check which element takes power. Move to Bath and compare both branches.',
    'Measure across each element with its thermostat calling. The selected branch should have close to the supply voltage, while the other is off.',
    'wrong-control', 'Sink is selected and stays cold. The bath element can still heat.', 'Follow the sink output from the selector to the sink thermostat.', 'The wire from selector A to the sink thermostat is open. The bath branch is separate and still works.',
    ['Sink and Bath select different elements.', 'The selected thermostat still controls its own branch.']],
  ['Immersion schedule with manual boost', 'Heating', 'Routine',
    'Boost allows hot water outside the timer’s programme. The normal thermostat still controls the element.',
    'The timer output and Boost switch join at the same connection before the thermostat. Either path can feed it.',
    'Switch the timer and Boost off. Try Boost alone, then try the programme with Boost off.',
    'Check the voltage at the point where the two paths meet. Make one request at a time so the other path cannot hide a fault.',
    'wrong-control', 'With Boost off, the programme calls but the immersion stays off. Boost can still heat it.', 'Compare the timer output with the connection where Boost joins the circuit.', 'The wire from the timer output to the junction is open. Boost can still feed the thermostat through its own path.',
    ['Boost can call for heat outside the programme.', 'The thermostat controls heat from either request.']],
  ['Boiler programmer and room demand', 'Heating', 'Routine',
    'Heating is allowed during the programmed hours. The room thermostat then completes the heat request if the room needs it.',
    'Trace the programmer output through the room thermostat to the boiler input. The boiler also needs its normal return.',
    'Keep the programmer on. Open and close the room thermostat and follow the boiler response.',
    'Check the programmer output, thermostat output and boiler input in that order. This separates a missing call from a missing boiler supply.',
    'wrong-control', 'The programme is on and the room calls for heat, but the boiler does not respond.', 'Compare the thermostat output with the terminal it feeds at the boiler.', 'The wire from the thermostat output to the boiler input is open. A heat call at the thermostat cannot reach the boiler.',
    ['The programme and thermostat must both call.', 'Ending the room call stops the boiler request.']],
  ['S-plan two-port zone controls', 'Heating', 'Equipment dependent',
    'An S-plan uses a valve for each zone. A valve’s end switch closes when it has opened far enough, allowing that zone to call the boiler.',
    'Follow the room and cylinder controls to their separate valve motors. The two end switches join at the boiler-call connection.',
    'Let both valves open. Satisfy the cylinder thermostat and keep the room calling. Let the valves travel before judging the boiler response.',
    'Compare motor supply at a valve with the signal at its end switch. A voltage at the valve motor alone doesn’t show that its end switch made.',
    'wrong-control', 'With only the heating zone calling, its valve opens but the boiler stays off.', 'Look for the boiler call as it leaves the heating valve’s END terminal, then check the common connection.', 'The wire from the heating valve end switch to the boiler-call junction is open. The cylinder end switch can still call the boiler and mask the break.',
    ['Either open valve can call the boiler.', 'Removing one zone call can leave the other zone running.']],
  ['Y-plan mid-position valve controls', 'Heating', 'Equipment dependent',
    'A three-port valve can serve heating, hot water or both. The controls set a valve position instead of driving two separate on/off valves.',
    'Trace the room signal to CH and the cylinder signal to HW on the model valve. Follow the valve’s output to the boiler call.',
    'Try both calls together, then hot water only, then heating only. Give the valve time to reach each position.',
    'Read each demand terminal against its return. Compare those inputs with the valve position after travel. Product-specific valve wiring can differ.',
    'wrong-control', 'Both thermostats are calling, but the valve travels to hot water only.', 'Compare the room thermostat output with CH at the valve.', 'The wire from the room thermostat to CH is open. Only the cylinder request reaches the valve, so the heating side never opens as requested.',
    ['The two calls together select the middle position.', 'Changing one call can select a single outlet.']],
  ['Electric underfloor heating and floor limit', 'Heating', 'Equipment dependent',
    'The room may need heat even when the floor has reached its temperature limit. The floor control can stop the mat in that condition.',
    'The floor control and room thermostat both have to pass the heating feed. The mat connects across the resulting line and neutral.',
    'Keep the room calling. Raise the simulated floor temperature above its setpoint, then lower it and check the mat.',
    'Read across the mat with the floor below and above its limit. The controller can still have mains power when mat voltage is near zero.',
    'wrong-control', 'The room calls and the floor is below the limit, but the mat won’t heat.', 'Compare the floor control output with the room thermostat input.', 'The wire from the floor control output to the room thermostat is open. The room control can’t pass heat demand on to the mat.',
    ['The floor-temperature limit can stop the mat.', 'The room thermostat still has to call for heat.']],
  ['Water underfloor wiring centre and actuators', 'Heating', 'Equipment dependent',
    'Each room has its own actuator on the manifold. An actuator opens a valve for that loop. The circulating pump is shared.',
    'Trace the two room signals into separate wiring-centre inputs. Each output drives its own actuator, and the open-valve feedback calls the pump.',
    'Let both rooms call, then satisfy A while B is still calling. Finally remove B’s call and watch the pump after the actuators travel.',
    'Compare each actuator’s supply and open feedback. Check the pump voltage while one room calls, then again after both calls finish.',
    'wrong-control', 'Room A calls but its actuator stays closed. Room B may still operate the pump.', 'Compare the signal leaving room A’s thermostat with input I1 at the wiring centre.', 'The wire from the room A thermostat to I1 is open. B still has its own signal and can run the shared pump.',
    ['Each thermostat can call its own actuator.', 'The pump can still run for B after A stops calling.']],
  ['Storage charge and daytime heat release', 'Heating', 'Existing',
    'A storage heater takes energy into its store during charging hours. A separately switched fan can release heat later. The simulation shows the electrical loads.',
    'The time control feeds the charge thermostat and element. The daytime switch has a separate feed to the fan.',
    'End the charging period while the fan is on. Then turn the fan off and compare the two loads.',
    'Check voltage at the charging element and the fan separately. The fan can have mains voltage when the element has none.',
    'wrong-control', 'The timer calls for charging but the element stays off. The daytime fan still works.', 'Compare the timer output with the input to the charge thermostat.', 'The wire from the off-peak timer to the charge thermostat is open. The separate feed to the fan is intact.',
    ['Ending the charge period stops the element.', 'The daytime switch can supply the fan independently.']],
  ['Packaged heat-pump supply and demand interface', 'Heating', 'Equipment dependent',
    'A packaged heat pump has internal controls of its own. This exercise covers the isolator and the external relay that calls the unit.',
    'The room control operates a relay coil. The local isolator feeds the relay’s switched contact and the neutral to the heat-pump load.',
    'Keep the room calling and open the local isolator. Restore it, then remove the heat call to compare two ways the unit can stop.',
    'Check the relay coil at A1 and A2, then read L to N at the heat-pump unit. Neither reading is a measurement of refrigerant pressure or heating capacity.',
    'wrong-control', 'The local isolator is on and the room calls for heat, but the interface relay does not pull in.', 'Check whether the room thermostat’s output reaches the relay coil.', 'The wire from the room thermostat to relay A1 is open. The relay contact stays open and the unit gets no switched feed.',
    ['The local isolator can remove the unit supply.', 'The external heat call operates a separate relay coil.']],
  ['Simple switched extractor fan', 'Ventilation & motors', 'Routine',
    'This fan has no permanent timer feed. Its wall switch opens the only line wire supplying it.',
    'Follow line through the switch to fan L and the return from fan N. Earth has its own route.',
    'Turn the fan off and on. Compare its state with the switch position.',
    'Compare L to N at the fan in both positions. A line reading elsewhere does not establish that the fan has an intact neutral.',
    'open-neutral', 'The fan switch is on but the fan does not run.', 'Trace the fan’s neutral back to the outgoing neutral terminal.', 'The wire from the outgoing neutral to fan N is open. The fan switch still controls line, but current can’t return through the fan.',
    ['With the switch on, the fan takes power.', 'Opening the switch removes fan power.']],
  ['Timer extractor with maintained supply', 'Ventilation & motors', 'Routine',
    'A run-on timer needs a supply after the light switch opens. The fan isolator switches the permanent line, trigger and neutral together.',
    'Trace the permanent line and neutral through the isolator to the timer. The switched trigger follows a different pole to timer IN. Timer OUT feeds the fan.',
    'Start the fan with the light switch. Turn the switch off and watch it through the five-second delay.',
    'Check permanent L–N and the trigger separately. The trigger can be off while the timer still supplies the fan.',
    'wrong-control', 'The timer has its permanent supply, but the light switch never starts the fan.', 'Follow the light-switch output to L2IN at the fan isolator, then towards timer IN.', 'The wire into L2IN from the light switch is open. The timer has mains power, but no new trigger reaches it.',
    ['The fan runs briefly after its trigger switches off.', 'The fan stops when the run-on period finishes.']],
  ['Humidity demand with manual ventilation override', 'Ventilation & motors', 'Equipment dependent',
    'A humidistat senses damp air. A manual override gives the fan a second way to run.',
    'The humidity output and override feed the same fan connection through parallel paths. The fan returns to neutral.',
    'Turn humidity and override off. Try each one on its own so one path cannot hide a problem in the other.',
    'Measure at the fan while each control calls in turn. If it runs on override, the fault may still be in the automatic path.',
    'wrong-control', 'The override can run the fan. With override off, damp air no longer starts it.', 'Follow the humidity output to the junction where the override joins it.', 'The wire from the humidity sensor output to the junction is open. The override still connects the fan to its supply.',
    ['Humidity alone can call the fan.', 'Override can run the fan without a humidity call.']],
  ['Float-controlled sump pump', 'Ventilation & motors', 'Equipment dependent',
    'The float controls a contactor coil. The contactor then carries the pump’s operating current.',
    'Trace the float output to A1 on the pump contactor. Its main contact switches the line feeding the pump.',
    'Raise the water-level request, then lower it. Look at the contactor and pump together.',
    'Check coil voltage at A1–A2 and pump voltage at L–N. A float indication by itself doesn’t establish that the coil got power.',
    'wrong-control', 'The float indicates high water, but the pump remains stopped.', 'Compare the float output with the voltage across the contactor coil.', 'The wire from the float output to coil A1 is open. The float calls but the contactor cannot switch on the pump.',
    ['High water can start the pump.', 'Removing the water-level call stops it.']],
  ['Pressure-controlled booster pump with permission', 'Ventilation & motors', 'Equipment dependent',
    'The booster runs on a low-pressure call only while the separate dry-run contact also allows it. This example holds the dry-run relay on in normal service.',
    'The pressure signal operates the pump contactor. The pump feed then passes through the dry-run relay’s normally open contact.',
    'With the dry-run relay energised, end the pressure call and watch the pump stop. Restore the call and check both relays.',
    'Check the pump contactor coil and the dry-run coil separately. A good pressure call cannot tell you that the second contact is closed.',
    'wrong-control', 'Pressure is low and the pump contactor is in, but the booster stays off.', 'Check for supply across the dry-run relay coil, then trace the pump feed through its contact.', 'The feed to dry-run relay A1 is open. Its normally open contact stays open, interrupting pump power after the pump contactor.',
    ['A low-pressure call can start the booster when both paths are intact.', 'Opening either control path can stop it.']],
  ['Single-phase start/stop motor starter', 'Ventilation & motors', 'Routine',
    'A momentary Start button returns when you let go. The starter’s holding contact keeps its coil supplied after that.',
    'Start and the normally open auxiliary contact are in parallel. Stop and the overload contact sit in the common coil path. The motor has its own main power contact.',
    'Press Start and release it. Press Stop and release it. The motor should stay stopped until the next deliberate start.',
    'Read the coil voltage after Start has been released, then after Stop. Compare the coil reading with motor power.',
    'wrong-control', 'The motor runs while you hold Start and stops as soon as you let go.', 'Trace auxiliary terminal 14 to A1 on the starter.', 'The link from 14 to A1 is open. The Start button can supply the coil directly, but the holding contact has no route to keep it energised.',
    ['The starter holds when Start is released.', 'Stop breaks the holding path.']],
  ['Shutter operator directional interface', 'Ventilation & motors', 'Equipment dependent',
    'The shutter has separate up and down contactors. Each needs its own travel limit closed and the opposite contactor released.',
    'Follow each direction from the selector through its limit and the opposite contactor’s normally closed auxiliary contact to its coil.',
    'Select Up, then Down. With Down selected, open the lower limit. Watch the drive stop without starting the opposite direction.',
    'Compare each direction’s coil voltage. The motor symbol stands for a packaged shutter operator and does not show its internal reversing windings.',
    'wrong-control', 'Up is selected and the upper limit is closed, but the shutter won’t drive up.', 'Follow the wire leaving the upper limit towards the down contactor’s normally closed auxiliary.', 'The wire from the upper limit output to auxiliary 21 on the down contactor is open. The up command never reaches the up coil.',
    ['An open limit stops its own direction.', 'The interlock keeps the two direction contactors from pulling in together.']],
  ['Interlinked mains smoke and heat alarms', 'Safety & energy', 'Equipment dependent',
    'An interlink wire passes an alarm between fittings. Each alarm still needs its own power arrangement.',
    'Follow each alarm’s line, neutral and earth separately. The signal wire runs from LINK to LINK.',
    'Trigger the smoke alarm and watch the heat alarm. Try the same event with the interlink open on the isolated bench.',
    'Check each alarm’s mains L–N independently. The interlink state shows an alarm call. This model does not specify a manufacturer’s signal voltage or waveform.',
    'open-live', 'One alarm has lost its mains supply while its neighbour still has mains.', 'Check the line feed to the smoke alarm separately from its interlink.', 'The mains line to the smoke alarm is open. Its backup and interlink have separate jobs and do not restore that mains feed.',
    ['Both alarms have their own mains connections.', 'The interlink carries an alarm signal between them.']],
  ['Transformer doorbell and momentary push', 'Safety & energy', 'Routine',
    'The transformer steps mains voltage down to 12 V AC for the bell circuit. The push closes only while held.',
    'On the output side, follow one winding terminal through the push and chime to the other winding terminal.',
    'Press and release the push. To take a stable reading at the chime, use the option to hold the push, then release it.',
    'Select AC volts. Compare the voltage across the transformer secondary with the voltage across the chime while the push is held.',
    'open-live', 'The transformer has output voltage, but the push does not ring the chime.', 'Check whether the transformer output reaches COM at the door push.', 'The wire from the transformer secondary to the push is open. The fault is on the bell side, even though the transformer still has mains input.',
    ['The closed push supplies the chime.', 'Releasing it opens the bell circuit.']],
  ['Non-maintained emergency luminaire', 'Safety & energy', 'Routine',
    'A non-maintained emergency light normally waits on standby. Its integral battery lights it when its monitored mains feed fails.',
    'Find the permanent mains line and neutral at the fitting. The backup battery supplies the lamp internally.',
    'Check standby with the mains available, then turn the simulated mains off. Watch the fitting itself as well as the mains reading.',
    'Read across the mains input during the outage. A lit battery-backed lamp can have zero volts at its incoming mains pair. Battery endurance is outside this exercise.',
    'open-live', 'The emergency lamp has come on even though the board still has power.', 'Compare the board output with the permanent line at the fitting.', 'The fitting’s mains line is open. The battery has correctly taken over in response to that local loss of supply.',
    ['The lamp is normally dark in standby.', 'Loss of its monitored supply brings the battery-backed lamp on.']],
  ['Maintained emergency luminaire', 'Safety & energy', 'Routine',
    'This maintained fitting can be used for everyday lighting as well as during a power cut. Its permanent line and switched line serve different purposes.',
    'Find permanent L and N at the fitting. A separate switch feeds SL for normal lighting. The battery supplies emergency lighting internally.',
    'Turn off the normal lighting switch while mains stays on. Then remove mains and compare the fitting’s response.',
    'Compare SL–N and L–N in both states. A zero reading on SL alone does not mean the fitting has lost its monitored supply.',
    'wrong-control', 'The permanent mains feed is present, but the normal light switch cannot light the fitting.', 'Compare the switch output with SL at the fitting.', 'The wire from the lighting switch output to SL is open. The monitored permanent supply remains intact, so the unit stays out of emergency mode.',
    ['SL controls the normal light.', 'Loss of the permanent feed can start emergency operation.']],
  ['EVSE supply and load-management permission', 'Safety & energy', 'Equipment dependent',
    'The charging load is switched by a contactor in this example. Some real chargers adjust current using an electronic control instead. The product’s interface matters.',
    'Follow the load controller output to A1 on the contactor. The contactor’s main pole is in the line wire supplying the charger.',
    'Allow charging and check the load. Withdraw the request while leaving the site supply on. Compare both sides of the contactor.',
    'Read from the incoming line to neutral, then from charger L to N. Here the incoming side stays at mains voltage when the contactor opens and the charger loses its feed.',
    'wrong-control', 'The site has power and the controller calls for charging, but the car load stays off.', 'Compare controller OUT with the voltage across A1–A2 at the charge contactor.', 'The wire from controller OUT to A1 is open. The contactor cannot pull in, so its main contact leaves the charger without a live feed.',
    ['Removing the request stops charging.', 'The incoming side of the contactor still has its supply.']],
  ['Grid-following PV inverter AC interface', 'Safety & energy', 'Equipment dependent',
    'Grid power can flow in either direction. When the inverter produces more than the house uses, surplus power goes out to the grid.',
    'The inverter connects on the AC side through its own isolator. The house load shares the grid connection but does not pass through the inverter isolator.',
    'Compare grid power with solar output and without it, keeping the load the same. Then remove the grid and check the grid-following inverter’s response.',
    'Read signed power at the grid connection. The change includes both the house demand and the inverter contribution. This circuit represents the AC side of the inverter.',
    'open-live', 'The house load works, but the grid no longer sees the inverter’s contribution.', 'Check the AC path from the inverter isolator to the inverter itself.', 'The line from the isolator output to the inverter is open. The house load remains connected to the grid but the inverter can no longer deliver power through that branch.',
    ['Opening the inverter isolator removes its AC contribution.', 'At the same house load, changing solar output changes grid power.']],
  ['Battery inverter and essential-load backup', 'Safety & energy', 'Advanced',
    'The inverter has an ordinary grid input and a separate backup output for essential loads. Loss of grid does not give every load a battery supply.',
    'Trace BL and BN from the backup output to the essential lamp. The ordinary load stays on the grid side.',
    'With battery backup available, remove the grid. Compare the essential lamp with the ordinary socket load.',
    'Measure BL to BN and L to N on the ordinary branch during the outage. Battery charge and transfer are simplified in this exercise.',
    'open-neutral', 'The battery has energy, but the essential lamp goes out during a grid cut.', 'Follow the complete pair from the backup output to the essential lamp.', 'The wire from backup BN to lamp N is open. The lamp has no complete return to the backup source.',
    ['The essential lamp uses the backup output.', 'The ordinary load goes off when the grid is absent.']],
  ['Time-and-darkness signage contactor', 'Commercial controls', 'Routine',
    'The time clock sets the hours the sign may run. The photocell allows it only in darkness. A contactor then supplies both parts of the sign.',
    'Trace the time clock through the photocell’s enabling input to the sign contactor coil. The main contact feeds the two sign loads.',
    'Set darkness and trading hours together. End the trading period while it’s still dark and check both sign loads.',
    'Compare the clock output, the photocell input and the voltage at the contactor coil. The sign needs both conditions before the coil pulls in.',
    'wrong-control', 'The shop is within trading hours and it’s dark, but the sign stays off.', 'Compare the time clock output with the enabling signal at the photocell.', 'The wire from clock OUT to photocell IN is open. The photocell still senses darkness, but the clock’s signal cannot reach it.',
    ['Either daylight or the end of trading hours can stop the sign.', 'Both sign loads share the contactor output.']],
  ['Refrigeration cooling/defrost interlock', 'Commercial controls', 'Equipment dependent',
    'The refrigeration cabinet needs cooling at one time and defrost heat at another. A changeover relay selects the path.',
    'The released relay contact allows cooling through the thermostat. When the defrost clock energises the coil, the relay transfers to the heater path.',
    'Begin in cooling mode. Call for defrost and compare compressor and heater power. End defrost to see the relay return.',
    'Check the relay coil voltage and then the two load voltages. A timer indication alone doesn’t show which contact is supplying a load.',
    'wrong-control', 'The timer calls for defrost, but the cabinet keeps cooling and the defrost heater stays off.', 'Compare the defrost clock output with voltage at the relay coil.', 'The wire from clock OUT to defrost relay A1 is open. The released contact continues to allow cooling and the heater contact stays open.',
    ['Cooling can run with the relay released.', 'Defrost disconnects cooling and feeds its heater.']],
  ['Compressor pressure demand and unloading', 'Commercial controls', 'Equipment dependent',
    'A compressor reaches its pressure setting and stops. The unloader releases pressure from the compressor head for a later restart. The indicator here shows the electrical command only.',
    'The pressure switch and overload contact control the motor contactor. The motor-side supply energises a second relay. Its normally closed contact feeds the unloader indicator.',
    'Run the compressor, then satisfy the pressure switch. Watch the motor and unloader indicator as the contactor releases.',
    'Check voltage at the motor and unloader separately. The indicator cannot measure air pressure or show that a physical valve moved.',
    'wrong-control', 'The unloader indicator is on while the compressor motor is running.', 'Follow the motor-state signal to the unloader relay coil. Check whether its normally closed contact opened.', 'The wire from the motor contactor output to unloader relay A1 is open. The relay stays released and continues to supply the unloader indicator.',
    ['The pressure switch can stop the motor.', 'In this circuit the unloader gets power when the motor stops.']],
  ['Powered gate limits and safety-input interface', 'Commercial controls', 'Advanced',
    'The gate drive needs a direction, a clear travel limit and a clear beam. This example shows how a beam contact can interrupt motor power.',
    'Follow the selected direction through its limit and interlock. The permitted direction feeds a common connection and then the beam contact before the drive.',
    'With the gate drive running, interrupt the beam. Clear it and check the response of the electrical circuit.',
    'Read the signal at the beam input and the drive voltage. Electrical operation alone cannot establish safe stopping distance, force or compliance on an installed gate.',
    'wrong-control', 'A direction is selected and its limit is clear. The gate stays stopped even with the beam clear.', 'Check whether the common direction feed reaches the input to the beam contact.', 'The wire from the common direction output to beam COM is open. The clear beam contact has no feed to pass on. Repair the broken path and keep the safety contact in circuit.',
    ['Opening the beam contact removes drive power.', 'The selected travel limit can also stop drive power.']],
  ['Three-phase board with phase-neutral loads', 'Industrial', 'Routine',
    'The board has a 400 V three-phase supply and a neutral. Its three loads draw different amounts of current because their ratings differ.',
    'Find L1, L2 and L3 at the linked breaker. A lamp, socket load and heater each connect between one phase and neutral.',
    'With the breaker on, compare all three branch voltages and currents. Then compare a phase-to-neutral pair with a phase-to-phase pair.',
    'Between different phases expect about 400 V. From one phase to neutral expect about 231 V. A single phase-to-neutral reading cannot confirm all three phases.',
    'phase-loss', 'Two branches work and the third has lost power. The breaker handle is still on.', 'Compare each phase at the breaker output with the corresponding load terminal.', 'The line between the breaker’s L3 output and the third load is open. The other two branches still have their phase and neutral.',
    ['Phase-to-phase voltage is higher than phase-to-neutral voltage.', 'Different load ratings give different branch currents.']],
  ['Five-contact industrial socket and isolation', 'Industrial', 'Routine',
    'An industrial socket carries three phases, neutral and earth. A linked isolator switches the active conductors together.',
    'Match the contact markings from isolator to outlet. Follow the protective earth directly and trace each of L1, L2, L3 and N through its switched pole.',
    'Open and close the isolator. Check all three phases at the outlet and identify the conductor that stays connected through both positions.',
    'Compare each outlet phase to neutral and the phase pairs to one another. One good pair cannot tell you that every phase is present.',
    'phase-loss', 'The socket has two phases but the third phase is missing.', 'Follow the missing phase from the isolator output to the same marking at the socket.', 'The wire between isolator L3OUT and socket L3 is open. The two remaining phases cannot confirm a complete three-phase supply.',
    ['All three phases reach an intact outlet.', 'The linked handle disconnects the switched conductors together.']],
  ['Three-phase DOL motor starter', 'Industrial', 'Routine',
    'A direct-on-line starter connects all three phases to the motor through main contacts and an overload. The pushbuttons control a smaller coil circuit.',
    'Trace the three power paths separately from A1–A2. Start and the holding contact form alternate coil paths. Stop and the overload interrupt the common control feed.',
    'Press and release Start, then check that the motor keeps running. Press Stop and release it. The motor should wait for another start.',
    'Read the coil voltage after releasing Start. Compare it with the three-phase motor state. A closed pushbutton by itself proves little about holding.',
    'wrong-control', 'The motor starts, then stops as soon as you lift your finger.', 'Follow the starter’s auxiliary output 14 back to coil A1.', 'The wire from 14 to A1 is open. Start supplies the coil while held, but the auxiliary contact cannot maintain that supply afterwards.',
    ['A healthy starter holds after Start is released.', 'Stop or the overload control contact can release the coil.']],
  ['Interlocked forward/reverse motor starter', 'Industrial', 'Routine',
    'The forward and reverse contactors feed the same motor with different phase orders. Their interlocks keep the two power paths apart.',
    'Compare the phase connections through both contactors. Follow each direction coil through a normally closed contact on the opposing contactor.',
    'Start forwards, stop, select Reverse and start again. Check the active contactor and the motor’s direction for each run.',
    'Check each coil separately. While one direction is in, the other coil must remain out. Motor direction here follows the supplied phase order.',
    'wrong-control', 'Forward is selected and Start operates the run circuit, but the forward contactor stays out.', 'Trace the forward selector output into the reverse contactor’s normally closed auxiliary contact.', 'The wire from selector A to reverse terminal 21 is open. The reverse contactor can be released and still have no forward command to pass through its interlock.',
    ['The two contactor paths give different phase orders.', 'The direction interlocks prevent simultaneous operation.']],
  ['Six-terminal star-delta motor starter', 'Industrial', 'Existing',
    'A star–delta starter changes the connections at all six motor winding ends. Its contactors and timer must suit the motor and its winding ratings.',
    'Trace the three winding starts from the main contactor. The star contactor joins the three ends. The delta contactor makes a different set of connections. Each direction of changeover has an interlock.',
    'Start the motor and watch star operate. Let the timer run. Check that star releases before delta takes over.',
    'Compare the contactor states at the start and after the delay. This steady-state exercise shows the winding connections, not a real starting-current transient.',
    'wrong-control', 'Star works during starting. At changeover it releases, but delta never pulls in.', 'Follow the timer relay’s delta output through the star contactor’s normally closed interlock.', 'The wire from the timer relay’s NO contact to star terminal 21 is open. When star releases, the delta coil still has no feed and the winding circuit is incomplete.',
    ['Star and delta make different connections at the winding ends.', 'The delta path must wait for the star contactor to release.']],
  ['VFD-fed motor and run interface', 'Industrial', 'Equipment dependent',
    'A variable-frequency drive (VFD) has a mains input, a motor output and a RUN control. They have different jobs and different terminal markings.',
    'Follow the incoming phases to the drive, its output phases to the motor and the separate dry-contact RUN loop back to the drive.',
    'Start with RUN closed and note the motor’s indicated frequency. Open RUN while leaving the drive powered.',
    'Read the drive input separately from its output state. The lab represents the fundamental output frequency. It does not model the switched output waveform or reproduce a particular meter on a real drive.',
    'wrong-control', 'The drive has input power, but the motor has no output.', 'Check continuity of the RUN loop with the simulated sources off.', 'The wire from the run switch output to the drive’s RUN input is open. Mains power at the drive cannot replace that missing command.',
    ['Opening RUN stops the motor output.', 'The running motor follows the drive’s frequency setting.']],
  ['Staged three-phase heater bank', 'Industrial', 'Equipment dependent',
    'Two contactors switch separate stages of a three-phase heater. Both stages share one high-temperature safety contact.',
    'Follow each thermostat to its own stage coil. Trace the common high limit upstream of both calls and the three power paths to each bank.',
    'Turn off the second-stage call and compare the banks. Then open the high limit and check both stage coils.',
    'Compare total power with one stage and with both. Check the stage coils to distinguish a single thermostat opening from the common high limit opening.',
    'wrong-control', 'Both stages call for heat, but only the first bank heats.', 'Read the stage B thermostat output and the voltage at the second contactor coil.', 'The wire from thermostat B to stage B coil A1 is open. The common limit still supplies stage A, so that bank continues to heat.',
    ['One stage can switch off while the other heats.', 'Opening the common high limit releases both stage coils.']],
  ['Motor control from two stations', 'Industrial', 'Routine',
    'Two stations share one starter. Either Start button can make the initial coil circuit, and either Stop button can break the holding circuit.',
    'The Start buttons are in parallel with the holding contact. The two normally closed Stop contacts and overload contact are in series ahead of those paths.',
    'Start at A and stop at B. Then start at B and stop at A. Release each button and check the motor’s resting state.',
    'Read coil voltage after each release. Compare what happens at Stop with what happens when you merely let go of Start.',
    'wrong-control', 'Both Stop buttons are released, but neither Start button can pull in the starter.', 'Trace the common feed out of the remote Stop contact and into overload terminal 95.', 'The wire from station B’s NC Stop output to overload 95 is open. Neither Start button nor the holding contact has a complete coil feed.',
    ['Either station can start the held motor.', 'Either Stop button can release the same coil.']],
  ['Sequential two-motor conveyor control', 'Industrial', 'Equipment dependent',
    'The receiving conveyor has to be running before the feed conveyor starts. Otherwise material could pile up between the belts.',
    'Follow the receiving starter’s auxiliary contact to the control feed for the other starter. Each motor still has its own power and holding circuit.',
    'Try the feed belt first. Start the receiving belt, then the feed belt. Finally stop the receiving belt and watch both starters.',
    'Compare the receiving starter’s feedback output with the control feed at the second starter. Check the coils as well as the motor states.',
    'wrong-control', 'The receiving belt runs. The feed belt still refuses to start.', 'Follow auxiliary terminal 14 on the receiving starter towards the upstream station’s Stop contact.', 'The wire from the receiving starter’s 14 to the feed conveyor’s Stop COM is open. The first motor runs, but its run signal cannot reach the second starter.',
    ['The feed belt cannot start before the receiving belt.', 'Stopping the receiving belt stops the feed belt too.']],
  ['Duty/standby pumps and high-level assist', 'Industrial', 'Equipment dependent',
    'Either pump can be the duty pump. The normal level signal calls that pump. A separate high-level float calls for help from the other pump too.',
    'Trace the normal float through the duty selector to one starter. Follow the assist contactor to the other request paths. Each motor has its own protected power circuit.',
    'With assist off, try duty A and duty B. Raise the high-level float and compare the number of running pumps.',
    'Read the two coil voltages for normal demand and again at high level. Assist can hide a fault in an individual duty path.',
    'wrong-control', 'Normal level calls for pump A, but A stays off. B can run when selected. Leave high-level assist off while checking.', 'Trace the A output of the duty selector to the first pump’s request junction.', 'The wire from duty A to its request junction is open. B still has its own route. The assist path can still supply A and conceal that missing duty feed.',
    ['The selector chooses the first pump at normal level.', 'High-level assist can call both pumps.']],
  ['PLC permissives and motor output interface', 'Industrial', 'Equipment dependent',
    'A PLC (programmable logic controller) reads two conditions and switches its output only when both are true. The motor contactor carries the motor current.',
    'Follow the input signals to I1 and I2, the output common to its supply, and Q1 to the starter coil. The overload-status indication has its own channel.',
    'Start with both input conditions present. Remove one, then compare the motor and the independent status indication.',
    'Check the control supply, both input voltages, output COM and the coil circuit. Power at the PLC electronics alone cannot show that Q1 has a supply to switch.',
    'wrong-control', 'The PLC is on and the two field conditions are present, but the motor never gets a run command.', 'Compare the signal leaving the presence sensor with I1 at the controller.', 'The wire from the presence sensor output to PLC I1 is open. The two-input AND condition never becomes true, so the starter remains off.',
    ['The motor command requires both inputs.', 'An independent status output can remain on after the motor stops.']],
  ['Conceptual safety relay and monitored machine starter', 'Industrial', 'Advanced',
    'A safety relay checks its input channels, feedback and reset before permitting a new start. This exercise models those signals, not a machine safety rating.',
    'Trace both safety inputs, Reset and the feedback from the starter’s normally closed auxiliary contact. The permitted output feeds the separate ordinary Start circuit.',
    'Begin stopped. Reset, then start. Break a safety channel and restore it. Reset again and check that the motor waits for Start.',
    'Compare the safety relay’s armed state with the motor coil state. When the contactor is released, check the feedback path used before resetting the relay.',
    'wrong-control', 'The machine is stopped and both safety inputs are healthy. Pressing Reset does not arm the relay.', 'Check the feedback from the starter’s released auxiliary contact at terminal FB.', 'The wire from starter terminal 22 to feedback input FB is open. The relay cannot confirm a released contactor before arming. Check this in the stopped, unarmed state.',
    ['A broken safety channel removes the run permission.', 'Reset permits a new start without commanding motion.']],
];

interface ChallengeTarget {
  component?: string;
  path?: [Node, Node];
}
/** Exact conductor/device targets make each authored symptom reproducible rather than heuristic. */
const CHALLENGE_TARGETS: Record<number, ChallengeTarget> = {
  1: { path: [['branch', 'OUT'], ['light', 'L']] },
  2: { component: 'load1' },
  3: { component: 'load1' },
  4: { path: [['remote', 'NOUT'], ['board', 'N']] },
  5: { path: [['supply', 'PE'], ['spd', 'PE']] },
  6: { path: [['monitor', 'OUT'], ['shed', 'A1']] },
  7: { path: [['switch', 'OUT'], ['light', 'L']] },
  8: { path: [['protect', 'NOUT'], ['light-b', 'N']] },
  9: { path: [['near', 'T1'], ['far', 'T1']] },
  10: { path: [['middle', 'C'], ['far', 'T1']] },
  11: { component: 'zone-a' },
  12: { path: [['protect', 'LOUT'], ['dimmer', 'COM']] },
  13: { path: [['driver', '-'], ['led', 'N']] },
  14: { path: [['pir', 'OUT'], ['occupancy-hold', 'IN']] },
  15: { path: [['protect', 'LOUT'], ['photo', 'IN']] },
  16: { path: [['manual', 'OUT'], ['smart', 'IN']] },
  17: { path: [['socket-b', 'L'], ['socket-c', 'L']] },
  18: { path: [['socket-c', 'L'], ['protect', 'LOUT']] },
  19: { component: 'fixed' },
  20: { path: [['fuse', 'OUT'], ['fixed', 'L']] },
  21: { path: [['grid-a', 'OUT'], ['outlet-a', 'L']] },
  22: { path: [['supply', 'PE'], ['appliance', 'PE']] },
  23: { path: [['local', 'LOUT'], ['flow-permission', 'COM']] },
  24: { path: [['isolation', '-'], ['shaver', 'N']] },
  25: { path: [['stat', 'OUT'], ['safety', 'COM']] },
  26: { path: [['selector', 'A'], ['sink-stat', 'COM']] },
  27: { path: [['schedule', 'OUT'], ['permission', '1']] },
  28: { path: [['room', 'OUT'], ['boiler', 'L']] },
  29: { path: [['heating-valve', 'END'], ['end-bus', '1']] },
  30: { path: [['room', 'OUT'], ['mid-valve', 'CH']] },
  31: { path: [['probe', 'OUT'], ['room', 'COM']] },
  32: { path: [['room-a', 'OUT'], ['centre', 'I1']] },
  33: { path: [['offpeak', 'OUT'], ['charge-stat', 'COM']] },
  34: { path: [['room', 'OUT'], ['demand', 'A1']] },
  35: { path: [['protect', 'NOUT'], ['fan', 'N']] },
  36: { path: [['light-switch', 'OUT'], ['fan-isolation', 'L2IN']] },
  37: { path: [['humidity', 'OUT'], ['or', '1']] },
  38: { path: [['request', 'OUT'], ['pump-contactor', 'A1']] },
  39: { path: [['protect', 'LOUT'], ['dry-run', 'A1']] },
  40: { path: [['starter', '14'], ['starter', 'A1']] },
  41: { path: [['limit-up', 'OUT'], ['down', '21']] },
  42: { path: [['protect', 'LOUT'], ['smoke', 'L']] },
  43: { path: [['tx', '+'], ['push', 'COM']] },
  44: { path: [['protect', 'LOUT'], ['emergency', 'L']] },
  45: { path: [['normal-switch', 'OUT'], ['emergency', 'SL']] },
  46: { path: [['load-control', 'OUT'], ['permission', 'A1']] },
  47: { path: [['pv-isolator', 'LOUT'], ['inverter', 'L']] },
  48: { path: [['inverter', 'BN'], ['essential', 'N']] },
  49: { path: [['hours', 'OUT'], ['dark', 'IN']] },
  50: { path: [['defrost-clock', 'OUT'], ['defrost', 'A1']] },
  51: { path: [['compressor-k', '2'], ['unload', 'A1']] },
  52: { path: [['run-bus', '3'], ['beam', 'COM']] },
  53: { path: [['protect', 'L3OUT'], ['phase-load3', 'L']] },
  54: { path: [['socket-isolation', 'L3OUT'], ['socket', 'L3']] },
  55: { path: [['starter', '14'], ['starter', 'A1']] },
  56: { path: [['direction', 'A'], ['reverse', '21']] },
  57: { path: [['time-contact', 'NO'], ['star', '21']] },
  58: { path: [['run', 'OUT'], ['drive', 'RUN']] },
  59: { path: [['demand-b', 'OUT'], ['stage-b', 'A1']] },
  60: { path: [['stop-b', 'NC'], ['starter-ol', '95']] },
  61: { path: [['downstream', '14'], ['stop-b', 'COM']] },
  62: { path: [['duty', 'A'], ['a-or', '1']] },
  63: { path: [['present', 'OUT'], ['plc', 'I1']] },
  64: { path: [['starter', '22'], ['safety-relay', 'FB']] },
};

function challengeTarget(circuit: CircuitDocument, target: ChallengeTarget): { wire?: string; component?: string } {
  if (!target.path) return { component: target.component };
  const [a, b] = target.path;
  const matches = (e: Endpoint, n: Node) => e.component === n[0] && e.terminal === n[1];
  const wire = circuit.wires.find(w => matches(w.from, a) && matches(w.to, b) || matches(w.from, b) && matches(w.to, a));
  if (!wire) throw new Error(`Lesson ${circuit.lessonId}: challenge path ${a.join('.')} to ${b.join('.')} does not exist`);
  return { wire: wire.id, component: target.component ?? b[0] };
}

function roleExplanation(circuit: CircuitDocument): string {
  if(circuit.supply.phase==='three')return 'L1, L2 and L3 are the three phases. Measure between two phases for a phase-to-phase load, or between a phase and neutral for a single-phase load.';
  return 'Line feeds the load. Neutral carries the normal return current. Earth gives fault current a separate way back to the supply.';
}

function calculationNotes(circuit:CircuitDocument,fault:string):{beginner:string;apprentice:string} {
  const representative=circuit.components.find(c=>['lamp','led','heater','cooker','shower','socket','motor','motor3','pump','fan','boiler','heatpump','chime','emergency','alarm','indicator','ev'].includes(c.type));
  const format=(n:number)=>Number(n.toFixed(3));
  let beginner=circuit.supply.phase==='three'
    ? `Expect about ${format(circuit.supply.voltage)} V between two phases and ${format(circuit.supply.voltage/Math.sqrt(3))} V between a phase and neutral at the supply.`
    : `At the supply, expect about ${format(circuit.supply.voltage)} V from line to neutral. Compare that with the voltage at the equipment.`;
  let worked=beginner;
  if(representative){
    const p={...Registry.COMPONENTS[representative.type].defaults,...representative.params};
    const rated=Number(p.ratedVoltage??p.nominalVoltage??240);
    const watts=Number(p.watts??100);
    const pf=['motor','motor3','pump','fan','heatpump'].includes(representative.type)?Number(p.powerFactor??.8):1;
    const label=representative.type==='socket'?'The load plugged into '+representative.label:representative.label;
    if(representative.type==='motor3'){
      const winding=Number(p.windingVoltage??230),amps=watts/(3*winding*pf);
      beginner=`${label} is set for ${format(winding)} V across each winding. Put the probes on U1 and U2 to check one winding.`;
      worked=`At ${format(watts)} W total and power factor ${format(pf)}, each winding draws P / (3 × Vwinding × power factor), about ${format(amps)} A. In star, each winding gets line voltage / √3. In delta, each gets the full line voltage.`;
    }else if(Number.isFinite(watts)&&watts>0&&rated>0&&pf>0){
      const base=Number(p.ohms??rated*rated/watts);
      const nominalWatts=rated*rated/base;
      const amps=nominalWatts/(rated*pf);
      beginner=`${label} takes about ${format(amps)} A at ${format(rated)} V when running at its ${format(nominalWatts)} W setting. Compare that with the current in its feed wire.`;
      worked=pf===1?`For this load R = V² / P gives ${format(base)} Ω at ${format(rated)} V. At that voltage I = V / R gives ${format(amps)} A. Halving the voltage across the same resistance cuts the power to a quarter.`:`Use I = P / (V × power factor). At ${format(rated)} V and power factor ${format(pf)}, ${format(nominalWatts)} W needs about ${format(amps)} A.`;
    }
  }
  const converter=circuit.components.find(c=>['transformer','driver','dcsupply','vfd','pv','battery'].includes(c.type));
  let conversion='';
  if(converter){const p={...Registry.COMPONENTS[converter.type].defaults,...converter.params};
    if(converter.type==='transformer')conversion=` For ${converter.label}, the declared secondary is ${p.outputVoltage} V at a ${p.ratedVoltage??p.nominalVoltage??240} V primary: Vsecondary / Vprimary ≈ Nsecondary / Nprimary. The +/− IDs name AC winding ends, not fixed DC polarity. Secondary voltage follows primary voltage and winding losses; measure within its own pair.`;
    else if(['driver','dcsupply'].includes(converter.type))conversion=` ${converter.label} regulates an isolated ${p.outputVoltage} V DC pair while within its power/current limits. Pinput ≈ Poutput / efficiency plus the declared standby loss. A transformer turns ratio does not describe this regulated output.`;
    else if(converter.type==='vfd')conversion=' The VFD output is the fundamental RMS abstraction at its selected frequency. Its U/V/W phase pairs have their own electrical reference; PWM edges, starting torque and cable effects are excluded. Input power approximately follows output demand divided by declared efficiency.';
    else if(converter.type==='pv')conversion=' At the grid interface, net import is approximately connected consumption minus available inverter export. A negative signed power contribution represents export; it does not remove the need to trace the grid and protective paths. Grid loss inhibits the declared grid-following output.';
    else conversion=' Backup energy uses E = P × time. An ideal 100 W load uses 100 Wh in one hour; conversion loss reduces useful runtime. The integral charge estimate is a teaching abstraction. BL/BN are the backup AC pair, separate from the DC +/− pair and the grid L/N pair.';
  }
  const abnormal:Record<string,string>={
    'open-live':'With a break in the feed, part of the wiring can still be live. Compare the voltage before and after the break.',
    'open-neutral':'A missing neutral can leave both load terminals near line voltage, with little voltage across the load itself.',
    'missing-earth':'The load may still work with its earth missing. With all supplies off, trace the earth path and check continuity.',
    'open-cpc':'Look for a second earth path before deciding that a low resistance proves this particular wire is sound.',
    'earth-fault':'Some current can return along the earth wire. Look at the reading saved just before the protection tripped.',
    'short-circuit':'A short can draw a large current. A first estimate is I ≈ V / Zloop. Compare it with the reading saved before the trip.',
    'overload':'Compare the load current with the breaker setting. If the overload is still there after a reset, it can trip again.',
    'phase-loss':'One phase can be missing while the others are still live. Compare the voltages across all three windings.',
    'wrong-control':'The supply may be on while a start or enable signal is missing. Measure at the control input and its return.',
    'stuck-contact':'Check the output with the control both on and off. If it stays on, look for a stuck contact or a wire going around it.',
  };
  return {beginner,apprentice:`${worked}${conversion} A wire drops voltage when it carries current. To calculate that drop, use ΔV = I × Z, where Z is the wire impedance. ${abnormal[fault]??'Compare the feed, control and return readings to see where the path changes.'}`};

}

function createLesson(spec: Spec, index: number): ConfigurationLesson {
  const id = index + 1;
  const [title, category, tag, purpose, connections, sequence, measurement, fault, briefing, hint, answer, checks] = spec;
  const circuit = furnishCourseBoard(buildCircuit(id, title));
  const extra=elvPage(id);
  const target:ChallengeTarget = extra ? {path:extra.target} : CHALLENGE_TARGETS[id];
  if (!target) throw new Error(`Lesson ${id} has no exact challenge target`);
  const deviceNames = circuit.components.filter(c => c.id !== 'supply').map(c => c.label).join(', ');
  const context = extra ? "Extra-low-voltage secondary · 240 V single-phase study input" : id >= 53 ? 'Industrial · Republic of Ireland · 400 V three phase / approximately 230 V phase-neutral'
    : id >= 49 ? 'Single-phase commercial equipment · Republic of Ireland · 240 V study setting'
    : 'Domestic / light commercial · Republic of Ireland · 240 V study setting';
  const caveat = tag === 'Equipment dependent' || tag === 'Advanced'
    ? 'Real units vary. Check the diagram supplied with yours for its terminal markings and controls.'
    : tag === 'Existing' ? 'You may come across this arrangement in an older installation. Design rules for new work can differ.'
    : 'Use the product diagram when identifying terminals on real equipment.';
  const references = [...IRISH];
  if(id>=65&&id<=70)references.push({title:'MEAN WELL · constant-voltage and constant-current LED operation',url:'https://led.meanwell.com/qa.aspx'});
  if(id===43||id>=71&&id<=74||id===80)references.push({title:'Resideo · bell pushes, chimes and transformer ratings',url:'https://www.resideo.com/emea/en/-/media/EMEA%20Site%20Cluster/Mastersite/Documents/Sales%20Literature/Resideo_Electrical_Wholesale_Online_Catalogue_August_2020.pdf/'});
  if([74,75,80].includes(id))references.push({title:'Finder · relay coils and separate changeover contacts',url:'https://cdn.findernet.com/app/uploads/ZDPENXX4052.pdf'});
  if(id===76)references.push({title:'Belimo · 24 V three-point ball-valve actuator and real travel time',url:'https://www.belimo.com/mam/general-documents/datasheets/en-gb/belimo_LR24A-LA_datasheet_en-gb.pdf'});
  if(id===77)references.push({title:'Aspen Pumps · high-level safety switch with common, NC and NO terminals',url:'https://dam.aspenpumps.com/api/media/file/AW0012%20Silent%2B%20MINI%20WHITE%20MANUAL%2009-23%20Issue%207%20Print%20v2-8.pdf?prefix=media'});
  if(id===78)references.push({title:'ifm · normally open PNP inductive sensor',url:'https://media.ifm.com/dam/546f88cf-4cdf-47ac-b6ee-bee685c33458/Original/IFS204-02_EN-GB.pdf'});
  if(id===79)references.push({title:'Littelfuse · DC blade-fuse carrier ratings',url:'https://www.littelfuse.com/assetdocs/277-in-line-datasheet?assetguid=95bec608-b8d0-4cce-90c8-f39241cc9a9e'});
  if (id === 7) references.push({title:'IET: neutral–earth faults and residual-current protection (circuit principle)',url:'https://electrical.theiet.org/media/1066/2006_19_summer_wiring_matters__complete_no_adverts.pdf'});
  if (id >= 49) references.push(HSA);
  if (id >= 25 && id <= 34) references.push(HEATING);
  if (id === 47 || id === 48) references.push(GENERATION);
  if(id>=7&&id<=12)references.push(MANUFACTURERS.switching);
  if(id===12)references.push(MANUFACTURERS.dimming);
  if(id===13||id===24||id===43)references.push(MANUFACTURERS.driver);
  if(id===14||id===15)references.push(MANUFACTURERS.sensor);
  if(id===16)references.push(MANUFACTURERS.smart);
  if(id===42)references.push(MANUFACTURERS.alarm);
  if(id===44||id===45)references.push(MANUFACTURERS.emergency);
  if(id===46)references.push(MANUFACTURERS.ev);
  if(id===58)references.push(MANUFACTURERS.drive);
  if(id===63)references.push(MANUFACTURERS.plc);
  if(id===64)references.push(MANUFACTURERS.safety);
  const comparison:Record<number,string>={
    12:'A real dimmer must suit its lamp/driver and operating method. The linked manufacturer guidance covers compatibility; this lab varies a declared equivalent series resistance in the actual circuit. Its simulated loss is not a prediction of electronic-dimmer heating or a particular leading/trailing-edge device.',
    13:'A transformer secondary follows its turns ratio, while this driver regulates a DC output within declared limits. The linked instruction library distinguishes those equipment categories; its product ratings do not become this exercise’s ratings.',
    14:'Real PIR products can integrate detection and run-on, and offer switched-voltage or voltage-free outputs. This lesson separates the sensor and timer to expose both jobs. Its IN/OUT map is the declared lab interface.',
    15:'The linked sensor documentation shows that supply, sensing and output-contact forms vary by product. This photocell lesson represents a separately supplied permission and switched output; manufacturer lux ranges and start-up behaviour are not simulated.',
    16:'The Shelly comparison separates its SW input from potential-free I/O contacts. This lab instead declares a powered L-to-OUT contact controlled through IN. Those are different interfaces; do not transfer the lab terminal names to that product.',
    42:'Aico documents permanent supply and a separate wired interconnect. This lab traces an actual LINK conductor but withholds manufacturer-specific LINK voltage/waveform. Backup is a conceptual equipment state.',
    44:'Eaton distinguishes illumination after loss of the monitored supply from normal maintained operation. The lab’s integral battery lights the emitter without energizing its mains terminal pair; it does not calculate real emergency-light photometry or endurance.',
    45:'Eaton distinguishes maintained normal illumination and backup illumination after loss of monitored mains. This lab’s SL input requests normal lighting independently of permanent L/N; product terminal schemes and maintained modes vary.',
    46:'Here the contactor cuts the feed to the charger. Its supply side can still be live. myenergi describes current-transformer measurement and charging curtailment from a configured grid limit. This lesson exposes permission control only; it does not reproduce that charger’s CT algorithms, communication, DC leakage detection or earthing protection.',
    58:'ABB documents configurable drive inputs and motor outputs. This lab’s RUN–COM dry-contact loop and fundamental U/V/W outputs are declared abstractions. They do not reproduce an ACS355 macro, input numbering, PWM waveform or torque behaviour.',
    63:'Siemens documents control-supply budgets and shared references for real PLC I/O. This lab uses wired 24 V inputs and conceptual COM-to-Q contact outputs. Its I1/I2/Q1/Q2 map and AND logic are teaching interfaces, not a CPU wiring drawing.',
    64:'Pilz documents channel, reset and feedback arrangements for a real safety relay. This lab exposes those concepts through S1/S2/RESET/FB and a COM–OUT contact. Its state machine and terminal names do not establish a safety category, diagnostic coverage or performance level.',
  };
  return {
    id, title, category, tag, level: extra ? id<=66||id===71 ? 'Foundation' : id===80?'Advanced':'Intermediate' : id <= 24 ? 'Foundation' : id < 53 ? 'Intermediate' : 'Advanced', context,
    summary: COURSE_PAGES[id].situation,
    sections: [
      ...(id === 7 ? [{title:'Why the lamp can light with a wiring fault',beginner:'The lamp can still light with its earth disconnected. That is why testing the switch alone will miss a fault.',apprentice:'An extra link from outgoing neutral to earth can send some return current around the RCBO. With the lamp on, that can trip it. With the switch off, the wiring test still finds the link. Test circuit tries both switch positions and leaves your switch where you put it.'}] : []),
      { title: 'Purpose and component roles', beginner: COURSE_PAGES[id].idea, apprentice: purpose + ' ' + caveat },
      { title: 'Connections and conductor paths', beginner: connections, apprentice: roleExplanation(circuit)+' Open Drawing and choose My wiring. Select any wire to read the two terminal markings.' },
      { title: 'Operating sequence and control logic', beginner: sequence, apprentice: checks.join(' ') },
      { title: 'Measurements and model limits', beginner: measurement, apprentice: measurement+' For voltage, put one probe on each side of the part. For current, select one wire. The meter uses your wiring and the current switch positions.' },
      {title:'Calculations and expected readings',...(extra?{beginner:ELV_WORKED[id],apprentice:ELV_WORKED[id]+' '+extra.connection+' '+extra.reading+' Compare the actual secondary terminals under load. Driver voltage and secondary winding voltage follow different models. Across a conductor, ΔV = I × Z. For DC, Z is its resistance. Cable resistance and load ratings are illustrative.'}:calculationNotes(circuit,fault))},
      ...(comparison[id]?[{title:'Compare with the actual equipment',beginner:comparison[id],apprentice:'Open the maker’s diagram below. Compare its supply, controls and output terminals with the ones on your bench.'}]:[]),
      { title: 'Fault-finding challenge', beginner: briefing, apprentice: hint },
      { title: 'Irish context and real-work boundary', beginner: context+'. '+caveat, apprentice: 'The nominal Irish supply is 230/400 V at 50 Hz. Domestic lessons start at 240 V. I.S. 10101 sets the rules for installations in Ireland. Restricted electrical work must be carried out by a Registered Electrical Contractor. The lab checks the example wiring. Real installations need inspection and testing on site.' },
    ],
    steps: [
      'Find the supply. Read the terminal markings on its wiring side.',
      `Find these on the bench: ${deviceNames}.`,
      `Try it with the power on. ${sequence}`,
      `${measurement}`,
      ...checks.map(c => `Verify: ${c}`),
      `Start fault practice. ${briefing}`,
      'Repair the fault, reset anything that tripped and test the circuit again.',
    ],
    objectives: [...checks, 'Trace the return wire and the earth wire. Read the markings at each end.'],
    challenge: { title: `Diagnose: ${title}`, briefing, fault, hint, answer, ...challengeTarget(circuit, target) }, references, circuit,
  };
}

export const LESSONS: ConfigurationLesson[] = [...SPECS,...ELV_PAGES.map((p):Spec=>[p.title,'Extra-low voltage','Equipment dependent',p.situation,p.connection,p.procedure,p.reading,'open-wire',p.symptom,p.hint,p.answer,[p.idea,p.reading]])].map(createLesson);
export const getLesson = (id: number): ConfigurationLesson | undefined => LESSONS.find(lesson => lesson.id === id);

/** Structural validation is callable by integration checks; it has no runtime side effects. */
export function validateLessons(): string[] {
  const errors: string[] = [];
  if (LESSONS.length !== lessonIdLimit) errors.push(`Expected ${lessonIdLimit} lessons, received ${LESSONS.length}`);
  const signatures = new Map<string, number>();
  for (const lesson of LESSONS) {
    const components = new Map(lesson.circuit.components.map(c => [c.id, c]));
    for (const component of components.values()) if (!Registry.getComponent(component.type)) errors.push(`Lesson ${lesson.id}: unknown component ${component.type}`);
    for (const wire of lesson.circuit.wires) for (const e of [wire.from, wire.to]) {
      const c = components.get(e.component);
      if (!c) errors.push(`Lesson ${lesson.id}: missing component ${e.component}`);
      else if (!Registry.getComponent(c.type)?.terminals.some(t => t.id === e.terminal)) errors.push(`Lesson ${lesson.id}: invalid terminal ${e.component}.${e.terminal}`);
    }
    const signature = JSON.stringify({ types: lesson.circuit.components.map(c => `${c.id}:${c.type}`).sort(), wires: lesson.circuit.wires.map(w => `${w.from.component}.${w.from.terminal}>${w.to.component}.${w.to.terminal}`).sort() });
    if (signatures.has(signature)) errors.push(`Lessons ${signatures.get(signature)} and ${lesson.id} share an identical typed topology`);
    signatures.set(signature, lesson.id);
    if (lesson.sections.length < 6 || lesson.sections.some(section => !section.title || !section.beginner || !section.apprentice) || lesson.steps.length < 6 || lesson.objectives.length < 2 || !lesson.challenge.answer) errors.push(`Lesson ${lesson.id}: incomplete learning content`);
    if (lesson.challenge.wire && !lesson.circuit.wires.some(w => w.id === lesson.challenge.wire)) errors.push(`Lesson ${lesson.id}: missing challenge conductor`);
    if (lesson.challenge.component && !components.has(lesson.challenge.component)) errors.push(`Lesson ${lesson.id}: missing challenge component`);
    if (!lesson.challenge.wire && !lesson.challenge.component) errors.push(`Lesson ${lesson.id}: no challenge target`);
  }
  return errors;
}

