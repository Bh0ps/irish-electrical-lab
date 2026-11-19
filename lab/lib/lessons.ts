import { lessonProbePoints } from './lesson-probe-points.ts';
import { describeEndpoint } from './endpoint-description.ts';
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
  dimming:{title:'VARILIGHT HQ1A one-way dimmer',url:'https://www.varilight.co.uk/configurator/product.php?code=HQ1A'},
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
    this.add('rcbo', 'protect', 'Circuit breaker (RCBO) · 16 A / 30 mA', { rating: 16, residualRating: 0.03, closed: true });
    this.wire(['supply', 'L'], ['protect', 'LIN']); this.wire(['supply', 'N'], ['protect', 'NIN'], 'N');
    this.live = ['protect', 'LOUT']; this.neutral = ['protect', 'NOUT']; return this;
  }
  protectedThree(): this {
    this.add('mcb3', 'protect', 'Three-pole circuit breaker', { rating: 16, closed: true });
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
      b.add('meter', 'meter', 'Electricity meter'); b.add('isolator', 'main', 'Main switch', { closed: true }); b.add('panel', 'board', 'Distribution board');
      b.wire(b.live, ['meter', 'L']); b.wire(b.neutral, ['meter', 'N'], 'N'); b.wire(b.earth, ['meter', 'PE'], 'PE');
      b.wire(['meter', 'LOUT'], ['main', 'LIN']); b.wire(['meter', 'NOUT'], ['main', 'NIN'], 'N');
      b.wire(['main', 'LOUT'], ['board', 'L']); b.wire(['main', 'NOUT'], ['board', 'N'], 'N'); b.wire(['meter', 'PEOUT'], ['board', 'PE'], 'PE');
      b.add('mcb', 'branch', 'Lamp circuit breaker (MCB)', { rating: 16, closed: true }); b.wire(['board', 'LOUT'], ['branch', 'IN']);
      b.live = ['branch', 'OUT']; b.neutral = ['board', 'NOUT']; b.earth = ['board', 'PEOUT']; lamp('light', 'Lamp on the outgoing circuit'); break;
    }
    case 2: {
      b.add('rcd', 'group', 'Shared RCCB · residual current only', { residualRating: 0.03, closed: true }); b.wire(b.live, ['group', 'LIN']); b.wire(b.neutral, ['group', 'NIN'], 'N');
      b.neutral = ['group', 'NOUT'];
      for (let i = 1; i <= 2; i++) { b.add('mcb', `branch${i}`, `Outgoing MCB ${i}`, { rating: 16, closed: true }); b.wire(['group', 'LOUT'], [`branch${i}`, 'IN']); b.load(i === 1 ? 'lamp' : 'socket', `load${i}`, i===1?'Lamp on breaker 1':'Socket on breaker 2', [`branch${i}`, 'OUT'], i === 1 ? 60 : 200); } break;
    }
    case 3: {
      for (let i = 1; i <= 2; i++) { b.add('rcbo', `branch${i}`, `Circuit ${i} RCBO`, { rating: 16, residualRating: 0.03, closed: true }); b.wire(b.live, [`branch${i}`, 'LIN']); b.wire(['supply', 'N'], [`branch${i}`, 'NIN'], 'N'); b.neutral = [`branch${i}`, 'NOUT']; b.load(i === 1 ? 'lamp' : 'socket', `load${i}`, i===1?'Lamp on RCBO 1':'Socket on RCBO 2', [`branch${i}`, 'LOUT'], i === 1 ? 60 : 200); } break;
    }
    case 4: {
      b.add('mcb', 'upstream', 'Breaker feeding the second board', { rating: 16, closed: true }); b.wire(b.live, ['upstream', 'IN']);
      b.add('isolator', 'remote', 'Remote board local isolation', { closed: true }); b.wire(['upstream', 'OUT'], ['remote', 'LIN']); b.wire(b.neutral, ['remote', 'NIN'], 'N');
      b.add('panel', 'board', 'Remote distribution board'); b.wire(['remote', 'LOUT'], ['board', 'L']); b.wire(['remote', 'NOUT'], ['board', 'N'], 'N'); b.wire(b.earth, ['board', 'PE'], 'PE');
      b.add('rcbo', 'outgoing', 'Remote final-circuit RCBO', { rating: 16, residualRating: 0.03, closed: true }); b.wire(['board', 'LOUT'], ['outgoing', 'LIN']); b.wire(['board', 'NOUT'], ['outgoing', 'NIN'], 'N'); b.neutral = ['outgoing', 'NOUT']; b.load('socket', 'load', 'Remote socket circuit', ['outgoing', 'LOUT'], 300); break;
    }
    case 5: {
      b.protectedSingle(); b.add('spd', 'spd', 'Surge protector (SPD)'); b.mains('spd'); lamp('load', 'Protected equipment'); break;
    }
    case 6: {
      b.protectedSingle(); b.load('heater', 'priority', 'Priority heater', b.live, 800); b.add('relay', 'shed', 'Relay for the second heater', { energized: false });
      const c = b.powered('sensor', 'monitor', 'Load controller', { active: false, demand: true, threshold: 1000 }); b.coil('shed', c); b.wire(b.live, ['shed', 'COM']); b.load('heater', 'secondary', 'Second heater', ['shed', 'NC'], 600); break;
    }
    case 7: lamp('light', 'Hall light', sw('switch', 'One-way switch')); break;
    case 8: { const x = sw('switch', 'Shared lighting switch'); lamp('light-a', 'Hall light A', x); lamp('light-b', 'Hall light B', x); lamp('light-c', 'Hall light C', x); break; }
    case 9: {
      b.add('switch2', 'near', 'Two-way switch A', { position: 0, closed: true }); b.add('switch2', 'far', 'Two-way switch B', { position: 0, closed: true });
      b.wire(b.live, ['near', 'COM']); b.wire(['near', 'T1'], ['far', 'T1'], 'control'); b.wire(['near', 'T2'], ['far', 'T2'], 'control'); lamp('light', 'Stairs light', ['far', 'COM']); break;
    }
    case 10: {
      b.add('switch2', 'near', 'End switch A', { position: 0 }); b.add('intermediate', 'middle', 'Intermediate crossing switch', { crossed: false, position: 0 }); b.add('switch2', 'far', 'End switch B', { position: 0 });
      b.wire(b.live, ['near', 'COM']); b.wire(['near', 'T1'], ['middle', 'A'], 'control'); b.wire(['near', 'T2'], ['middle', 'B'], 'control'); b.wire(['middle', 'C'], ['far', 'T1'], 'control'); b.wire(['middle', 'D'], ['far', 'T2'], 'control'); lamp('light', 'Corridor light', ['far', 'COM']); break;
    }
    case 11: { lamp('zone-a', 'Lighting zone A', sw('gang-a', 'Gang A')); lamp('zone-b', 'Lighting zone B', sw('gang-b', 'Gang B')); break; }
    case 12: { const x = b.control('dimmer', 'dimmer', 'Lamp dimmer', b.live, { level: 0.65, closed: true }); lamp('light', 'Reading lamp', x); break; }
    case 13: {
      b.add('driver', 'driver', 'Isolated LED driver · 24 V output', { outputVoltage: 24 }); b.mains('driver'); b.add('led', 'led', '24 V LED light', { watts: 12, ratedVoltage: 24, doubleInsulated: true, classII: true }); b.wire(['driver', '+'], ['led', 'L'], 'DC+'); b.wire(['driver', '-'], ['led', 'N'], 'DC-'); break;
    }
    case 14: { const x = b.powered('sensor', 'pir', 'Motion detector (PIR)', { active: true, demand: true, mode: 'pir' }); b.wire(b.live, ['pir', 'IN'], 'control'); const t = b.powered('timer', 'occupancy-hold', 'Hall light timer', { on: true, demand: true, mode: 'off-delay', delay: 4 }); b.wire(x, ['occupancy-hold', 'IN'], 'control'); lamp('light', 'Hall light', t); break; }
    case 15: { const x = b.powered('sensor', 'photo', 'Daylight sensor (photocell)', { active: true, demand: true, mode: 'photocell' }); b.wire(b.live, ['photo', 'IN'], 'control'); lamp('light', 'Dusk-to-dawn light', x); break; }
    case 16: { const x = b.powered('smartrelay', 'smart', 'Smart relay', { on: true, active: true }); b.wire(sw('manual', 'Local wall switch'), ['smart', 'IN'], 'control'); lamp('light', 'Smart controlled lighting', x); break; }
    case 17: {
      b.load('socket', 'socket-a', 'Radial outlet A', b.live, 80); b.add('socket', 'socket-b', 'Radial outlet B', { watts: 100 }); b.add('socket', 'socket-c', 'Radial outlet C', { watts: 120 });
      for (const [a, c] of [['socket-a', 'socket-b'], ['socket-b', 'socket-c']]) for (const t of ['L', 'N', 'PE']) b.wire([a, t], [c, t], t as TerminalRole); break;
    }
    case 18: case 19: {
      b.load('socket', 'socket-a', 'Ring outlet A', b.live, 80); b.add('socket', 'socket-b', 'Ring outlet B', { watts: 100 }); b.add('socket', 'socket-c', 'Ring outlet C', { watts: 120 });
      for (const [a, c] of [['socket-a', 'socket-b'], ['socket-b', 'socket-c']]) for (const t of ['L', 'N', 'PE']) b.wire([a, t], [c, t], t as TerminalRole);
      b.wire(['socket-c', 'L'], b.live); b.wire(['socket-c', 'N'], b.neutral, 'N'); b.wire(['socket-c', 'PE'], b.earth, 'PE');
      if (id === 19) { b.add('fuse', 'branch-fuse', 'Branch fuse', { rating: 3, closed: true }); b.wire(['socket-b', 'L'], ['branch-fuse', 'IN']); b.load('heater', 'fixed', 'Heater on the fused branch', ['branch-fuse', 'OUT'], 400); } break;
    }
    case 20: { const x = sw('fcu-switch', 'Fused supply switch'); b.add('fuse', 'fuse', 'Appliance fuse', { rating: 3 }); b.wire(x, ['fuse', 'IN']); b.load('heater', 'fixed', 'Fixed heater', ['fuse', 'OUT'], 300); break; }
    case 21: {
      const x = sw('grid-a', 'Kitchen switch A'); const y = sw('grid-b', 'Kitchen switch B');
      b.load('socket', 'outlet-a', 'Kitchen outlet A', x, 150); b.load('socket', 'outlet-b', 'Kitchen outlet B', y, 220); break;
    }
    case 22: case 23: {
      b.add('isolator', 'local', id === 22 ? 'Double-pole cooker switch' : 'Double-pole shower switch', { closed: true }); b.wire(b.live, ['local', 'LIN']); b.wire(b.neutral, ['local', 'NIN'], 'N'); b.neutral = ['local', 'NOUT'];
      if (id === 23) { b.add('cutout', 'flow-permission', 'Water flow switch', { closed: true }); b.wire(['local', 'LOUT'], ['flow-permission', 'COM']); b.load('shower', 'appliance', 'Electric shower', ['flow-permission', 'OUT'], 1200); }
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
      b.add('junction', 'permission', 'Timer and boost junction'); b.wire(t, ['permission', '1'], 'control'); b.wire(sw('boost', 'Boost switch'), ['permission', '2'], 'control'); const x = stat('stat', 'Immersion thermostat', ['permission', '3']); b.load('heater', 'element', 'Scheduled immersion element', x, 1000); break;
    }
    case 28: { const x = b.powered('timer', 'programme', 'Heating programmer', { on: true, active: true }); b.wire(b.live, ['programme', 'IN'], 'control'); const y = stat('room', 'Room thermostat', x); b.load('boiler', 'boiler', 'Boiler heating input', y, 100); break; }
    case 29: {
      const x = b.powered('timer', 'programme', 'Heating schedule', { on: true, active: true }); b.wire(b.live, ['programme', 'IN'], 'control'); const a = valve('heating-valve', stat('room', 'Room thermostat', x), 'Heating two-port zone valve'); const c = valve('water-valve', stat('cylinder', 'Cylinder thermostat', x), 'Hot-water two-port zone valve'); b.add('junction', 'end-bus', 'Valve end-switch junction'); b.wire(a, ['end-bus', '1'], 'control'); b.wire(c, ['end-bus', '2'], 'control'); b.load('boiler', 'boiler', 'Boiler demand after valve opens', ['end-bus', '3'], 100); break;
    }
    case 30: {
      b.add('valve3', 'mid-valve', 'Three-port mid-position valve', { delay: 1, position: 'mid' }); b.mains('mid-valve'); b.wire(stat('room', 'Room thermostat'), ['mid-valve', 'CH'], 'control'); b.wire(stat('cylinder', 'Cylinder thermostat'), ['mid-valve', 'HW'], 'control'); b.load('boiler', 'boiler', 'Boiler heating input', ['mid-valve', 'END'], 100); break;
    }
    case 31: {
      b.add('sensor', 'probe', 'Floor temperature control', { active: true, demand: true, mode: 'temperature', sensorValue: 20, setpoint: 28 }); b.mains('probe', 'L', 'N', false); b.wire(b.live, ['probe', 'IN'], 'control'); const x = stat('room', 'Underfloor room thermostat', ['probe', 'OUT']); b.load('heater', 'mat', 'Electric underfloor mat', x, 600); break;
    }
    case 32: {
      b.add('plc', 'centre', 'Underfloor heating wiring centre', { on: true, mode: 'independent', nominalVoltage: 240 }); b.mains('centre', 'L', 'N', false); b.wire(b.live, ['centre', 'COM'], 'control'); b.wire(stat('room-a', 'Room A demand'), ['centre', 'I1'], 'control'); b.wire(stat('room-b', 'Room B demand'), ['centre', 'I2'], 'control'); const a = valve('actuator-a', ['centre', 'Q1'], 'Manifold actuator A'); const c = valve('actuator-b', ['centre', 'Q2'], 'Manifold actuator B'); b.add('junction', 'open-bus', 'Valve end-switch junction'); b.wire(a, ['open-bus', '1'], 'control'); b.wire(c, ['open-bus', '2'], 'control'); b.load('pump', 'pump', 'Manifold circulation pump', ['open-bus', '3'], 90); break;
    }
    case 33: { const x = b.powered('timer', 'offpeak', 'Off-peak timer', { on: true, active: true }); b.wire(b.live, ['offpeak', 'IN'], 'control'); b.load('heater', 'store', 'Storage charge element', stat('charge-stat', 'Charge thermostat', x), 900); b.load('fan', 'day', 'Daytime heat-release fan', sw('release', 'Daytime fan switch'), 50); break; }
    case 34: { b.add('isolator', 'local', 'Heat pump isolator', { closed: true }); b.wire(b.live, ['local', 'LIN']); b.wire(b.neutral, ['local', 'NIN'], 'N'); b.neutral = ['local', 'NOUT']; b.add('relay', 'demand', 'Heat pump control relay'); b.coil('demand', stat('room', 'Heat request')); b.wire(['local', 'LOUT'], ['demand', 'COM']); b.load('heatpump', 'unit', 'Heat pump', ['demand', 'NO'], 1000); break; }
    case 35: b.load('fan', 'fan', 'Simple switched extractor', sw('switch', 'Fan supply switch'), 35); break;
    case 36: {
      b.add('isolator3', 'fan-isolation', 'Three-pole fan isolation · fourth pole unused', { closed: true }); b.wire(b.live, ['fan-isolation', 'L1IN']); b.wire(b.neutral, ['fan-isolation', 'NIN'], 'N'); b.wire(sw('light-switch', 'Bathroom light switch'), ['fan-isolation', 'L2IN'], 'control');
      b.add('timer', 'runon', 'Fan timer with permanent supply', { on: true, demand: true, mode: 'off-delay', delay: 5 }); b.wire(['fan-isolation', 'L1OUT'], ['runon', 'L']); b.wire(['fan-isolation', 'NOUT'], ['runon', 'N'], 'N'); b.wire(['fan-isolation', 'L2OUT'], ['runon', 'IN'], 'control'); b.neutral = ['fan-isolation', 'NOUT']; b.load('fan', 'fan', 'Run-on extractor', ['runon', 'OUT'], 35); break;
    }
    case 37: {
      const x = b.powered('sensor', 'humidity', 'Humidity sensor', { active: true, demand: true, mode: 'humidity' }); b.wire(b.live, ['humidity', 'IN'], 'control'); b.add('junction', 'or', 'Fan control junction'); b.wire(x, ['or', '1'], 'control'); b.wire(sw('override', 'Manual ventilation override'), ['or', '2'], 'control'); b.load('fan', 'fan', 'Humidity extractor', ['or', '3'], 35); break;
    }
    case 38: case 39: { const x = b.powered('sensor', 'request', id === 38 ? 'Sump float switch' : 'Pump pressure switch', { active: true, demand: true, mode: id === 38 ? 'float' : 'pressure' }); b.wire(b.live, ['request', 'IN'], 'control'); b.contactor('pump-contactor', 'Pump contactor'); b.coil('pump-contactor', x); b.wire(b.live, ['pump-contactor', '1']); b.load('pump', 'pump', id === 38 ? 'Sump drainage pump' : 'Pressure booster pump', ['pump-contactor', '2'], 400); if (id === 39) { b.add('relay', 'dry-run', 'Dry-run relay', { energized: true }); b.coil('dry-run', b.live); b.wire(['pump-contactor', '2'], ['dry-run', 'COM']); const w = b.wires.find(w => w.from.component === 'pump-contactor' && w.to.component === 'pump'); if (w) w.from = endpoint(['dry-run', 'NO']); } break; }
    case 40: { b.contactor('starter', 'Single-phase motor contactor'); b.add('overload', 'ol', 'Motor overload', { rating: 8, closed: true }); b.wire(b.live, ['starter', '1']); b.wire(['starter', '2'], ['ol', '1']); b.load('motor', 'motor', 'Single-phase motor', ['ol', '2'], 500); b.startStop('starter', b.live, 'stop', 'start', 'ol'); break; }
    case 41: case 52: {
      b.add('selector', 'direction', 'Up / down command selector', { position: 0 }); b.wire(b.live, ['direction', 'COM']); b.contactor('up', 'Up contactor'); b.contactor('down', 'Down contactor'); const a = b.control('cutout', 'limit-up', 'Upper limit switch', ['direction', 'A']); const c = b.control('cutout', 'limit-down', 'Lower limit switch', ['direction', 'B']); b.wire(a, ['down', '21'], 'control'); b.wire(c, ['up', '21'], 'control'); b.coil('up', ['down', '22']); b.coil('down', ['up', '22']);
      b.wire(b.live, ['up', '1']); b.wire(b.live, ['down', '1']); b.add('junction', 'run-bus', 'Motor feed junction'); b.wire(['up', '2'], ['run-bus', '1'], 'control'); b.wire(['down', '2'], ['run-bus', '2'], 'control');
      let x: Node = ['run-bus', '3']; if (id === 52) x = b.control('cutout', 'beam', 'Gate safety beam contact', x, { closed: true }); b.load('motor', 'operator', id === 41 ? 'Shutter packaged motor operator' : 'Gate packaged motor operator', x, 300, { packagedDirection: true }); break;
    }
    case 42: { b.load('alarm', 'smoke', 'Smoke alarm with backup', b.live, 2, { batteryBackup: true }); b.load('alarm', 'heat', 'Heat alarm with backup', b.live, 2, { batteryBackup: true }); b.wire(['smoke', 'LINK'], ['heat', 'LINK'], 'control'); break; }
    case 43: { b.add('transformer', 'tx', 'Doorbell transformer · 12 V AC', { outputVoltage: 12 }); b.mains('tx'); b.add('pushbutton', 'push', 'Doorbell push · NO', { pressed: false }); b.wire(['tx', '+'], ['push', 'COM'], 'output'); b.add('chime', 'chime', 'Low-voltage door chime', { watts: 3, ratedVoltage: 12, doubleInsulated: true }); b.wire(['push', 'NO'], ['chime', 'L'], 'output'); b.wire(['tx', '-'], ['chime', 'N'], 'output'); break; }
    case 44: case 45: { b.add('emergency', 'emergency', id === 44 ? 'Non-maintained emergency fitting' : 'Maintained emergency fitting', { maintained: id === 45, batteryCharge: 1, watts: 8 }); b.mains('emergency'); if (id === 45) b.wire(sw('normal-switch', 'Light switch'), ['emergency', 'SL'], 'control'); break; }
    case 46: { b.contactor('permission', 'Car charger contactor'); const x = b.powered('sensor', 'load-control', 'Charging load controller', { active: true, demand: true, mode: 'load' }); b.wire(b.live, ['load-control', 'IN'], 'control'); b.coil('permission', x); b.wire(b.live, ['permission', '1']); b.load('ev', 'evse', 'Single-phase car charger', ['permission', '2'], 1200, { packagedProtection: true }); break; }
    case 47: { b.add('isolator', 'pv-isolator', 'Inverter AC isolation', { closed: true }); b.wire(b.live, ['pv-isolator', 'LIN']); b.wire(b.neutral, ['pv-isolator', 'NIN'], 'N'); b.add('pv', 'inverter', 'Grid-following PV inverter · AC side', { watts: 500, power: 500, generation: 500, antiIslanding: true }); b.wire(['pv-isolator', 'LOUT'], ['inverter', 'L']); b.wire(['pv-isolator', 'NOUT'], ['inverter', 'N'], 'N'); b.wire(b.earth, ['inverter', 'PE'], 'PE'); b.load('socket', 'home', 'House socket', b.live, 250); break; }
    case 48: { b.add('battery', 'inverter', 'Battery inverter with packaged backup changeover', { watts: 300, power: 300, batteryCharge: 1, backup: true }); b.mains('inverter'); b.add('lamp', 'essential', 'Essential lighting on backup output', { watts: 60 }); b.wire(['inverter', 'BL'], ['essential', 'L']); b.wire(['inverter', 'BN'], ['essential', 'N'], 'N'); b.wire(b.earth, ['essential', 'PE'], 'PE'); b.load('socket', 'ordinary', 'Socket on mains only', b.live, 150); break; }
    case 49: { const t = b.powered('timer', 'hours', 'Shop time switch', { on: true, active: true }); b.wire(b.live, ['hours', 'IN'], 'control'); const p = b.powered('sensor', 'dark', 'Daylight sensor (photocell)', { active: true, demand: true, mode: 'photocell' }); b.wire(t, ['dark', 'IN'], 'control'); b.contactor('sign', 'Signage lighting contactor'); b.coil('sign', p); b.wire(b.live, ['sign', '1']); lamp('letters-a', 'Signage bank A', ['sign', '2']); lamp('letters-b', 'Signage bank B', ['sign', '2']); break; }
    case 50: { const d = b.powered('timer', 'defrost-clock', 'Defrost schedule', { on: false, demand: true, active: false, delay: 0 }); b.wire(b.live, ['defrost-clock', 'IN'], 'control'); b.add('relay', 'defrost', 'Cooling / defrost interlock relay'); b.coil('defrost', d); b.wire(b.live, ['defrost', 'COM']); const c = stat('cold-stat', 'Fridge thermostat', ['defrost', 'NC']); b.load('motor', 'compressor', 'Refrigeration compressor', c, 250); b.load('heater', 'defrost-heat', 'Defrost heater', ['defrost', 'NO'], 300); break; }
    case 51: { const x = b.powered('sensor', 'pressure', 'Compressor pressure switch', { active: true, demand: true, mode: 'pressure' }); b.wire(b.live, ['pressure', 'IN'], 'control'); b.contactor('compressor-k', 'Compressor contactor'); b.wire(x, ['ol', '95'], 'control'); b.coil('compressor-k', ['ol', '96']); b.wire(b.live, ['compressor-k', '1']); b.add('overload', 'ol', 'Compressor overload', { rating: 8 }); b.wire(['compressor-k', '2'], ['ol', '1']); b.load('motor', 'compressor', 'Compressor motor', ['ol', '2'], 450); b.add('relay', 'unload', 'Unloader relay'); b.coil('unload', ['compressor-k', '2']); b.wire(b.live, ['unload', 'COM']); b.load('indicator', 'unloader', 'Unloader valve indicator', ['unload', 'NC'], 5); break; }
    case 53: { const loads = ['lamp', 'socket', 'heater']; for (let i = 0; i < 3; i++) b.load(loads[i], `phase-load${i + 1}`, `Phase ${i + 1} to neutral demand`, b.phases[i], [60, 200, 500][i]); break; }
    case 54: { b.add('isolator3', 'socket-isolation', 'Industrial socket linked isolation', { closed: true }); b.phases.forEach((p, i) => b.wire(p, ['socket-isolation', `L${i + 1}IN`], `L${i + 1}` as TerminalRole)); b.wire(b.neutral, ['socket-isolation', 'NIN'], 'N'); b.add('socket3', 'socket', 'Five-contact industrial outlet', { watts: 300 }); ['L1', 'L2', 'L3'].forEach(p => b.wire(['socket-isolation', `${p}OUT`], ['socket', p], p as TerminalRole)); b.wire(['socket-isolation', 'NOUT'], ['socket', 'N'], 'N'); b.wire(b.earth, ['socket', 'PE'], 'PE'); break; }
    case 55: { const o = threeStarter('starter', 'DOL three-phase contactor'); b.live = b.phases[0]; b.startStop('starter', b.live, 'stop', 'start', o); break; }
    case 56: {
      b.live = b.phases[0]; b.contactor('forward', 'Forward contactor · mechanical pair', { mechanicallyInterlockedWith: 'reverse' }); b.contactor('reverse', 'Reverse contactor · mechanical pair', { mechanicallyInterlockedWith: 'forward' }); const f = b.powerThrough('forward'); const r = b.powerThrough('reverse', [b.phases[2], b.phases[1], b.phases[0]]); b.add('overload', 'ol', 'Common motor overload', { rating: 8 }); const o = b.powerThrough('ol', f); r.forEach((n, i) => b.wire(n, ['ol', String(1 + i * 2)], `L${i + 1}` as TerminalRole)); b.motor3('motor', 'Reversible externally star-linked motor', o);
      b.contactor('run-permit', 'Run contactor'); b.startStop('run-permit', b.live, 'stop', 'start', 'ol'); b.add('selector', 'direction', 'Forward / reverse selector', { position: 0 }); b.wire(['run-permit', '14'], ['direction', 'COM'], 'control'); b.wire(['direction', 'A'], ['reverse', '21'], 'control'); b.wire(['direction', 'B'], ['forward', '21'], 'control'); b.coil('forward', ['reverse', '22']); b.coil('reverse', ['forward', '22']); break;
    }
    case 57: {
      b.live = b.phases[0]; b.contactor('main', 'Main motor contactor'); b.contactor('star', 'Star contactor · mechanical pair', { mechanicallyInterlockedWith: 'delta' }); b.contactor('delta', 'Delta contactor · mechanical pair', { mechanicallyInterlockedWith: 'star' }); const main = b.powerThrough('main'); b.motor3('motor', 'Six-terminal motor · 400 V delta / 690 V star', main, false); const motor = b.components.find(c => c.id === 'motor'); if (motor) motor.params.windingVoltage = 400;
      b.startStop('main'); b.add('junction', 'star-point', 'Temporary star point'); ['U2', 'V2', 'W2'].forEach((t, i) => { b.wire(['motor', t], ['star', String(1 + i * 2)], 'output'); b.wire(['star', String(2 + i * 2)], ['star-point', String(i + 1)], 'output'); });
      [['U2', 'V1'], ['V2', 'W1'], ['W2', 'U1']].forEach(([a, c], i) => { b.wire(['motor', a], ['delta', String(1 + i * 2)], 'output'); b.wire(['delta', String(2 + i * 2)], ['motor', c], 'output'); });
      b.add('timer', 'transition', 'Star-delta timer', { on: true, demand: true, delay: 4 }); b.wire(['main', '14'], ['transition', 'L']); b.wire(b.neutral, ['transition', 'N'], 'N'); b.wire(['main', '14'], ['transition', 'IN'], 'control'); b.add('relay', 'time-contact', 'Transition changeover contact'); b.coil('time-contact', ['transition', 'OUT']); b.wire(['main', '14'], ['time-contact', 'COM'], 'control'); b.wire(['time-contact', 'NC'], ['delta', '21'], 'control'); b.coil('star', ['delta', '22']); b.wire(['time-contact', 'NO'], ['star', '21'], 'control'); b.coil('delta', ['star', '22']); break;
    }
    case 58: { b.add('vfd', 'drive', 'Variable-frequency drive (VFD)', { frequency: 35, speed: 0.7, run: true }); ['L1', 'L2', 'L3'].forEach((t, i) => b.wire(b.phases[i], ['drive', t], t as TerminalRole)); b.wire(b.earth, ['drive', 'PE'], 'PE'); const x = b.control('switch', 'run', 'Drive run permission · dry contact', ['drive', 'COM']); b.wire(x, ['drive', 'RUN'], 'control'); b.motor3('motor', 'Motor fed by the drive', [['drive', 'U'], ['drive', 'V'], ['drive', 'W']]); break; }
    case 59: { b.live = b.phases[0]; b.contactor('stage-a', 'Heater stage A'); b.contactor('stage-b', 'Heater stage B'); const cut = b.control('cutout', 'safety', 'Independent high-temperature safety limit'); b.coil('stage-a', stat('demand-a', 'Stage A temperature demand', cut)); b.coil('stage-b', stat('demand-b', 'Stage B temperature demand', cut)); for (const [k, n] of [['stage-a', 1], ['stage-b', 2]] as const) b.powerThrough(k).forEach((p, i) => b.load('heater', `h${n}-${i}`, `Stage ${n} phase ${i + 1} element`, p, 250)); break; }
    case 60: { const o = threeStarter('starter', 'Two-station motor contactor'); b.live = b.phases[0]; b.startStop('starter', b.live, 'stop-a', 'start-a', o); b.add('pushbutton', 'stop-b', 'Remote stop · NC', { pressed: false }); b.add('pushbutton', 'start-b', 'Remote start · NO', { pressed: false }); const w = b.wires.find(w => w.from.component === 'stop-a' && w.from.terminal === 'NC'); if (w) w.from = endpoint(['stop-b', 'NC']); b.wire(['stop-a', 'NC'], ['stop-b', 'COM'], 'control'); b.wire(['start-a', 'COM'], ['start-b', 'COM'], 'control'); b.wire(['start-b', 'NO'], ['starter', 'A1'], 'control'); break; }
    case 61: { b.live = b.phases[0]; const a = threeStarter('downstream', 'Downstream conveyor starter', 'motor-a'); const c = threeStarter('upstream', 'Upstream conveyor starter', 'motor-b'); b.startStop('downstream', b.live, 'stop-a', 'start-a', a); b.startStop('upstream', ['downstream', '14'], 'stop-b', 'start-b', c); break; }
    case 62: { b.live = b.phases[0]; const x = b.powered('sensor', 'float-low', 'Normal pumping level', { active: true, demand: true, mode: 'float' }); const y = b.powered('sensor', 'float-high', 'High-level assist', { active: false, demand: true, mode: 'float' }); b.wire(b.live, ['float-low', 'IN'], 'control'); b.wire(b.live, ['float-high', 'IN'], 'control'); b.add('selector', 'duty', 'Duty selection A / B', { position: 0 }); b.wire(x, ['duty', 'COM'], 'control'); const a = threeStarter('pump-a-k', 'Pump A starter', 'pump-a'); const c = threeStarter('pump-b-k', 'Pump B starter', 'pump-b'); b.contactor('assist', 'High-level pump relay'); b.coil('assist', y); b.wire(b.live, ['assist', '1'], 'control'); b.wire(b.live, ['assist', '3'], 'control'); b.add('junction', 'a-or', 'Pump A control junction'); b.add('junction', 'b-or', 'Pump B control junction'); b.wire(['duty', 'A'], ['a-or', '1'], 'control'); b.wire(['duty', 'B'], ['b-or', '1'], 'control'); b.wire(['assist', '2'], ['a-or', '2'], 'control'); b.wire(['assist', '4'], ['b-or', '2'], 'control'); b.wire(['a-or', '3'], [a, '95'], 'control'); b.wire(['b-or', '3'], [c, '95'], 'control'); b.coil('pump-a-k', [a, '96']); b.coil('pump-b-k', [c, '96']); break; }
    case 63: { b.live = b.phases[0]; const o = threeStarter('starter', 'PLC-commanded starter'); dcControls(); const k = b.components.find(c => c.id === 'starter'); if (k) k.params.nominalVoltage = 24; b.add('plc', 'plc', 'PLC · 24 V controller', { mode: 'and', on: true, nominalVoltage: 24 }); b.mains('plc', 'L', 'N', false); b.wire(b.live, ['plc', 'COM'], 'control'); const a = b.powered('sensor', 'present', 'Workpiece-present sensor', { active: true, demand: true, nominalVoltage: 24 }); const c = b.powered('sensor', 'ready', 'Machine-ready permission', { active: true, demand: true, nominalVoltage: 24 }); b.wire(b.live, ['present', 'IN'], 'control'); b.wire(b.live, ['ready', 'IN'], 'control'); b.wire(a, ['plc', 'I1'], 'control'); b.wire(c, ['plc', 'I2'], 'control'); b.wire(['plc', 'Q1'], [o, '95'], 'control'); b.coil('starter', [o, '96']); b.add('indicator', 'ol-status', 'Controller secondary status', { watts: 2, nominalVoltage: 24 }); b.wire(['plc', 'Q2'], ['ol-status', 'L'], 'control'); b.wire(b.neutral, ['ol-status', 'N'], 'DC-'); b.wire(b.earth, ['ol-status', 'PE'], 'PE'); break; }
    case 64: {
      b.live = b.phases[0]; const o = threeStarter('starter', 'Machine motor contactor'); dcControls(); const k = b.components.find(c => c.id === 'starter'); if (k) k.params.nominalVoltage = 24; b.add('safetyRelay', 'safety-relay', 'Safety relay', { nominalVoltage: 24 }); b.mains('safety-relay', 'L', 'N', false); b.wire(b.live, ['safety-relay', 'COM'], 'control'); b.add('pushbutton', 'channel-a', 'Safety input channel A · NC', { pressed: false }); b.add('pushbutton', 'channel-b', 'Safety input channel B · NC', { pressed: false }); b.wire(b.live, ['channel-a', 'COM'], 'control'); b.wire(b.live, ['channel-b', 'COM'], 'control'); b.wire(['channel-a', 'NC'], ['safety-relay', 'S1'], 'control'); b.wire(['channel-b', 'NC'], ['safety-relay', 'S2'], 'control'); b.add('pushbutton', 'reset', 'Monitored reset request · NO', { pressed: false }); b.wire(b.live, ['reset', 'COM'], 'control'); b.wire(['reset', 'NO'], ['safety-relay', 'RESET'], 'control'); b.wire(b.live, ['starter', '21'], 'control'); b.wire(['starter', '22'], ['safety-relay', 'FB'], 'control'); b.startStop('starter', ['safety-relay', 'OUT'], 'stop', 'start', o); break;
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
    'earth-fault', 'A fault on one circuit has tripped the shared device. Both loads are off.', 'Find the device that feeds both breakers. Does it show a trip?', 'Current is leaking to earth at the lamp load. The shared RCCB detects the imbalance and opens, cutting power to both branches.',
    ['Opening the lamp breaker leaves the socket on.', 'Opening the shared RCCB cuts power to both loads.']],
  ['Individual RCBO circuits', 'Distribution', 'Routine',
    'Each RCBO looks after one circuit. Find the wire that takes power to the lamp, then find its neutral coming back to the same breaker.',
    'Find the load side of each RCBO. Follow its line wire to the fitting and the neutral back to the same breaker. Both neutral terminals are marked N, so check which side you’re looking at.',
    'Switch off the first RCBO. Check both loads, then switch it back on.',
    'Read line to neutral at each load with the first RCBO off. Keeping the same probe pair on each load makes the two readings comparable.',
    'earth-fault', 'The first branch has tripped. Check whether the socket beside it has lost power too.', 'Look at both RCBOs. Follow the neutral from the lamp back to its breaker.', 'The first load has an earth fault. Its own RCBO trips. The other load still has line and neutral through its separate RCBO.',
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
    'With the supply steady, the SPD takes almost no current. This bench lets you check the wiring. It cannot create a surge.',
    'missing-earth', 'The lamp works, but the test reports a problem at the surge protector.', 'Trace the SPD’s earth terminal back towards the supply.', 'The earth wire to the SPD is open. Repairing it restores the protective path. The lamp can work in either state because it has its own line and neutral.',
    ['The SPD is connected across the supply.', 'The lamp can still work with the SPD earth open.']],
  ['Priority load shedding', 'Distribution', 'Equipment dependent',
    'Some supplies use a priority controller so two large loads don’t have to run together. Here the controller disconnects one of two heaters.',
    'The priority heater has a direct feed. The other gets its feed through the relay’s normally closed contact, marked NC. The demand monitor drives the coil.',
    'Run both heaters. Use the load controller to cut off the second heater. Watch the first one.',
    'Read the supply current with both heaters on. Switch off the second heater and check how much the reading falls.',
    'wrong-control', 'Ask the monitor to shed the lower-priority heater. Both heaters stay on.', 'Compare voltage at the monitor output with voltage across the relay coil.', 'The lead from monitor OUT to relay A1 is open. The coil cannot pull in, so its normally closed contact keeps the second heater supplied.',
    ['The priority heater stays on during shedding.', 'Total power drops when the second heater switches off.']],
  ['One-way lighting', 'Lighting', 'Routine',
    'The rocker stays where you leave it. Its contacts switch the line to the lamp. Neutral is the return for the lamp current.',
    'At the switch, line enters COM and leaves at the switched output. Follow that wire to L on the lamp. Lamp N goes back to neutral. PE is the protective earth.',
    'Flick the switch both ways. Open its inspection view and watch when the contacts touch. The earth connection stays in place as the rocker moves.',
    'With the lamp on, compare L and N at the lamp. Then measure across the switch itself. A closed contact has very little voltage across it. An open switch can have nearly the full supply across it.',
    'open-live', 'The switch is on but the lamp is dark.', 'Check where voltage is present at the switch, then at lamp L. Switch off the bench supply before checking continuity.', 'There’s a break between the switch output and lamp L. The closed switch has a feed, but it can’t supply the lamp through that broken wire.',
    ['Opening the switch turns the lamp off.', 'Closing the switch restores voltage across the lamp.']],
  ['Parallel lighting bank', 'Lighting', 'Routine',
    'One switch turns on all three lamps. Follow the two wires at any lamp and you’ll find it has its own feed and neutral.',
    'Trace the switched line to the L terminal on each lamp. Then follow each N back to neutral. The lamps are connected in parallel.',
    'Operate the shared switch. Compare all three lamps, then try the single-branch fault and see which lights remain on.',
    'Read L to N at each lit lamp. Each should be close to the full supply. The shared feed carries the current for all the lamps that are on.',
    'open-neutral', 'One lamp is dark. The two beside it still work.', 'Compare the dark lamp’s line and neutral connections with the working lamps.', 'Lamp B has an open neutral wire. The other two branches still have complete return paths, so their lamps can stay on.',
    ['All three lamps receive nearly the same voltage when lit.', 'Disconnecting one lamp leaves the other two lit.']],
  ['Two-way staircase lighting', 'Lighting', 'Routine',
    'Each two-way switch connects its common terminal to one of two strappers. The two switch positions together decide whether current can reach the lamp.',
    'Start at COM on the downstairs switch. Follow the two wires up to the landing, L1 to L1 and L2 to L2. The wire from COM on the landing goes to the lamp.',
    'Try all four combinations of A and B. After each move, note the selected strapper and whether the lamp is on.',
    'Compare the voltage across the lamp in the four positions. For this straight pair of strappers the lamp is on when both switches select the same strapper.',
    'wrong-control', 'The stairs light works in one combination but misses another.', 'Check each strapper end to end with the simulated supply off.', 'There’s a break in the wire between the two L1 terminals. The lamp still works through L2 when both switches are set that way.',
    ['Either switch can change the lamp state on an intact circuit.', 'Both strappers are needed for all four combinations to work.']],
  ['Three-location intermediate lighting', 'Lighting', 'Routine',
    'An intermediate switch adds a third control point between a pair of two-way switches. It changes how the strappers pass through the middle.',
    'Trace each incoming strapper to the middle switch, then trace the two outgoing wires to the far switch. The middle contacts can join the paths straight through or cross them.',
    'Start with the light on. Change the middle switch, then an end switch. Watch which complete route reaches the lamp each time.',
    'Measure across the lamp as you change one switch at a time. To test a strapper for continuity, isolate the circuit first.',
    'wrong-control', 'The middle switch changes position, but the lamp misses some combinations.', 'Follow each outgoing wire from the middle switch to the far switch.', 'Follow L2 (C) on the middle switch to L1 on the far switch. That wire is broken. The light goes out whenever the switches need that path.',
    ['Moving the intermediate switch changes the lamp state.', 'An end switch can still operate the lamp with the middle switch crossed.']],
  ['Two-gang independent lighting zones', 'Lighting', 'Routine',
    'Two rockers share a faceplate and a feed. Each rocker switches one lighting zone.',
    'Follow each rocker’s output to its own lamp. Both lamps return to neutral, but the switched outputs stay separate.',
    'With both lamps on, turn off A. Leave B alone and check which zone changes. Restore A to compare the two outputs.',
    'Compare voltage across lamp A and lamp B. When one rocker is off its lamp can read near zero while the other stays at the supply voltage.',
    'short-circuit', 'Both lighting zones have gone out and the device feeding them has tripped.', 'Look at what protects both zones, then check which branch has the fault.', 'A line-to-neutral short on zone A trips the common protection. The two rockers are independent, but both get their feed through that device.',
    ['Rocker A controls zone A only.', 'If their shared breaker trips, both lights go out.']],
  ['Dimmer and dimmable lamp', 'Lighting', 'Equipment dependent',
    'Turn the knob and watch the reading lamp. At a lower setting the filament glows less brightly and the lamp uses fewer watts.',
    'The feed goes through the dimmer to the lamp. The other lamp wire goes back to neutral. The two holes on the back of this dimmer work either way round.',
    'Leave the lamp on. Turn it down, read the watts, then turn it up and read them again.',
    'Watts tell you how much power the lamp uses. To check the voltage as well, put one probe on each lamp terminal.',
    'wrong-control', 'The knob moves, but the lamp stays dark at every setting.', 'Start at the dimmer’s incoming COM terminal before checking its output.', 'The supply wire to dimmer COM is open. Turning the knob changes its setting but no power reaches the lamp.',
    ['A lower setting reduces lamp power.', 'The lamp’s watt reading changes with the knob.']],
  ['Isolated LED-driver lighting', 'Lighting', 'Equipment dependent',
    'A constant-voltage LED driver takes mains AC at its input and supplies a separate DC output. The LED strip belongs to that output circuit.',
    'Find L and N on the input side, then + and − on the strip side. The strip’s return goes back to the driver’s negative terminal.',
    'Switch the supply on. Find the driver and strip on the drawing, then compare the readings on each side.',
    'Put the tester on V. Read across the two input terminals for AC and the two output terminals for DC. The isolated output may give no reading to mains neutral.',
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
  ['Ring final circuit in an existing installation', 'Sockets & supplies', 'Existing',
    'In an intact ring final the line and neutral each return to the board. Current can reach a socket from either direction along the ring.',
    'Trace each conductor all the way back to its starting point. Follow line and neutral separately so it’s clear which path you’re checking.',
    'With the loads on, check the two line legs at the board. Open the study fault and compare the current in the broken leg with the current in the remaining leg.',
    'A current reading on one leg is only part of the load current. To investigate a break, isolate the simulated supply and trace the individual conductor.',
    'open-live', 'The sockets still work, but one line leg no longer carries current.', 'Trace the line wire from socket C back to the breaker. Compare both ends of that return leg.', 'The returning line from C to the board is open. The other side of the ring can still feed the sockets. A working socket does not prove an intact ring.',
    ['An intact, loaded ring shares current between its legs.', 'A broken leg can leave sockets operating.']],
  ['Ring final circuit with a fused branch', 'Sockets & supplies', 'Existing',
    'A fused branch leaves the ring at one point. The branch fuse protects the fixed load’s feed separately from the ring.',
    'Follow the ring conductors past the take-off point. Trace the branch line through its fuse to the appliance and its neutral back to the ring.',
    'Open the branch fuse and check the fixed load. Check a ring socket too, then restore the fuse.',
    'Measure across the fixed load and across a ring socket. Compare the branch current with the fuse’s study rating.',
    'overload', 'The socket ring still works but the branch protection has opened.', 'Check the current on the fixed appliance branch against its fuse rating.', 'The fixed load is drawing more current than the branch fuse allows. Remove the study overload before resetting the simulated protection.',
    ['Opening the branch fuse disconnects its appliance.', 'The sockets on the intact ring retain their supply.']],
  ['Switched fused connection unit', 'Sockets & supplies', 'Routine',
    'A switched fused connection unit houses the switch and fuse in one fitting. On the lesson bench they sit separately so you can follow the line wire through both. For the combined fitting, look for the switched fused connection unit in Sandbox, modelled on the BG 851.',
    'Follow the path from the switch through the fuse to appliance L. Trace N and PE separately back to the board.',
    'Turn the local switch off and on. Then open the fuse with the switch on and observe the appliance.',
    'Compare switch output, fuse output and the appliance’s L terminal, each against the circuit neutral. A closed handle alone cannot confirm the whole route.',
    'open-live', 'The local switch is on, but the appliance stays off.', 'Start at the fuse output. Compare it with L at the appliance.', 'The wire from the fuse output to the appliance is open. The switch and fuse can both be closed while the appliance has no feed.',
    ['Both the switch and the fuse must have a complete path.', 'Opening the local switch stops the appliance.']],
  ['Kitchen remote isolation bank', 'Sockets & supplies', 'Routine',
    'Grouped kitchen switches let you disconnect an appliance from a different position. Trace the wire as well as reading the faceplate label.',
    'All the switches share a feed. Each switch sends power to its own outlet.',
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
  ['Electric shower and isolation switch', 'Sockets & supplies', 'Routine',
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
  ['Boiler programmer and room thermostat', 'Heating', 'Routine',
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
    'Call for heat in both rooms. Turn down the thermostat in room A, then in room B. Watch the pump as each valve closes.',
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
  ['Heat pump and heating controls', 'Heating', 'Equipment dependent',
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
  ['Humidity-controlled fan with manual override', 'Ventilation & motors', 'Equipment dependent',
    'A humidistat senses damp air. A manual override gives the fan a second way to run.',
    'The humidity output and override feed the same fan connection through parallel paths. The fan returns to neutral.',
    'Turn humidity and override off. Try each one on its own so one path cannot hide a problem in the other.',
    'Measure at the fan while each control calls in turn. If it runs on override, the fault may still be in the automatic path.',
    'wrong-control', 'The override can run the fan. With override off, damp air no longer starts it.', 'Follow the humidity output to the junction where the override joins it.', 'The wire from the humidity sensor output to the junction is open. The override still connects the fan to its supply.',
    ['Humidity alone can call the fan.', 'Override can run the fan without a humidity call.']],
  ['Float-controlled sump pump', 'Ventilation & motors', 'Equipment dependent',
    'The float controls a contactor coil. The contactor then carries the pump’s operating current.',
    'Trace the float output to A1 on the pump contactor. Its main contact switches the line feeding the pump.',
    'Lift the float, then lower it. Look at the contactor and pump together.',
    'Check coil voltage at A1–A2 and pump voltage at L–N. The float can move even if the coil has lost its feed.',
    'wrong-control', 'The float indicates high water, but the pump remains stopped.', 'Compare the float output with the voltage across the contactor coil.', 'The wire from the float output to coil A1 is open. The float calls but the contactor cannot switch on the pump.',
    ['High water can start the pump.', 'Removing the water-level call stops it.']],
  ['Booster pump and pressure switch', 'Ventilation & motors', 'Equipment dependent',
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
  ['Shutter controls and travel limits', 'Ventilation & motors', 'Equipment dependent',
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
    'Put the tester on V. Measure across the transformer output, then across the chime while you hold the push. Both readings are AC.',
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
  ['EV charger and load control', 'Safety & energy', 'Equipment dependent',
    'The charging load is switched by a contactor in this example. Some real chargers adjust current using an electronic control instead. Check how the charger takes a signal from its controller.',
    'Follow the load controller output to A1 on the contactor. The contactor’s main pole is in the line wire supplying the charger.',
    'Allow charging and check the load. Pause charging and leave the building supply on. Compare both sides of the contactor.',
    'Read from the incoming line to neutral, then from charger L to N. Here the incoming side stays at mains voltage when the contactor opens and the charger loses its feed.',
    'wrong-control', 'The site has power and the controller calls for charging, but the car load stays off.', 'Compare controller OUT with the voltage across A1–A2 at the charge contactor.', 'The wire from controller OUT to A1 is open. The contactor cannot pull in, so its main contact leaves the charger without a live feed.',
    ['Removing the request stops charging.', 'The incoming side of the contactor still has its supply.']],
  ['Solar inverter and its AC connection', 'Safety & energy', 'Equipment dependent',
    'Grid power can flow in either direction. When the inverter produces more than the house uses, surplus power goes out to the grid.',
    'The inverter connects on the AC side through its own isolator. The house load shares the grid connection but does not pass through the inverter isolator.',
    'Compare grid power with solar output and without it, keeping the load the same. Then remove the grid and check the grid-following inverter’s response.',
    'Read signed power at the grid connection. The change includes both the house demand and the inverter contribution. This circuit represents the AC side of the inverter.',
    'open-live', 'The house load works, but the grid meter shows no power coming from the inverter.', 'Check the AC path from the inverter isolator to the inverter itself.', 'The line from the isolator output to the inverter is open. The house load remains connected to the grid but the inverter can no longer deliver power through that branch.',
    ['Opening the inverter isolator removes its AC contribution.', 'At the same house load, changing solar output changes grid power.']],
  ['Battery inverter and essential-load backup', 'Safety & energy', 'Advanced',
    'The inverter has an ordinary grid input and a separate backup output for essential loads. Loss of grid does not give every load a battery supply.',
    'Trace BL and BN from the backup output to the essential lamp. The ordinary load stays on the grid side.',
    'With battery backup available, remove the grid. Compare the essential lamp with the ordinary socket load.',
    'Measure BL to BN and L to N on the ordinary branch during the outage. Battery charge and transfer are simplified in this exercise.',
    'open-neutral', 'The battery has energy, but the essential lamp goes out during a grid cut.', 'Follow the complete pair from the backup output to the essential lamp.', 'The wire from backup BN to lamp N is open. The lamp has no complete return to the backup source.',
    ['The essential lamp uses the backup output.', 'The ordinary load goes off when the grid is absent.']],
  ['Shop sign with timer and daylight sensor', 'Commercial controls', 'Routine',
    'The time clock sets the hours the sign may run. The photocell allows it only in darkness. A contactor then supplies both parts of the sign.',
    'Follow the wire from the time clock to IN on the daylight sensor. When it’s dark, the sensor can switch on the contactor that feeds both parts of the sign.',
    'Set darkness and trading hours together. End the trading period while it’s still dark and check both sign loads.',
    'Compare the clock output, the photocell input and the voltage at the contactor coil. The sign needs both conditions before the coil pulls in.',
    'wrong-control', 'The shop is within trading hours and it’s dark, but the sign stays off.', 'Compare the time clock output with the enabling signal at the photocell.', 'The wire from clock OUT to photocell IN is open. The photocell still senses darkness, but the clock’s signal cannot reach it.',
    ['Either daylight or the end of trading hours can stop the sign.', 'Both sign loads share the contactor output.']],
  ['Refrigeration cooling/defrost interlock', 'Commercial controls', 'Equipment dependent',
    'The refrigeration cabinet needs cooling at one time and defrost heat at another. A changeover relay selects the path.',
    'With the relay at rest, the thermostat can start the compressor. When the defrost timer powers the coil, the contact moves across to the heater.',
    'Begin in cooling mode. Call for defrost and compare compressor and heater power. End defrost to see the relay return.',
    'Check the relay coil voltage and then the two load voltages. A timer indication alone doesn’t show which contact is supplying a load.',
    'wrong-control', 'The timer calls for defrost, but the cabinet keeps cooling and the defrost heater stays off.', 'Compare the defrost clock output with voltage at the relay coil.', 'The wire from clock OUT to defrost relay A1 is open. The released contact continues to allow cooling and the heater contact stays open.',
    ['Cooling can run with the relay released.', 'Defrost disconnects cooling and feeds its heater.']],
  ['Compressor pressure switch and unloader', 'Commercial controls', 'Equipment dependent',
    'A compressor reaches its pressure setting and stops. The unloader releases pressure from the compressor head for a later restart. The indicator here shows the electrical command only.',
    'The pressure switch and overload contact control the motor contactor. The motor-side supply energises a second relay. Its normally closed contact feeds the unloader indicator.',
    'Run the compressor, then satisfy the pressure switch. Watch the motor and unloader indicator as the contactor releases.',
    'Check voltage at the motor and unloader separately. The indicator cannot measure air pressure or show that a physical valve moved.',
    'wrong-control', 'The unloader indicator is on while the compressor motor is running.', 'Follow the motor-state signal to the unloader relay coil. Check whether its normally closed contact opened.', 'The wire from the motor contactor output to unloader relay A1 is open. The relay stays released and continues to supply the unloader indicator.',
    ['The pressure switch can stop the motor.', 'In this circuit the unloader gets power when the motor stops.']],
  ['Gate controls, safety beam and limit switches', 'Commercial controls', 'Advanced',
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
    'Find A1 and A2 on the contactor. Start feeds that coil. A second contact, marked 13 and 14, keeps it fed when you release Start. The three larger contacts carry the motor current.',
    'Press and release Start, then check that the motor keeps running. Press Stop and release it. The motor should wait for another start.',
    'Put the probes on A1 and A2. Press Start, then let go. Does the coil still have voltage with your finger off the button?',
    'wrong-control', 'The motor starts, then stops as soon as you lift your finger.', 'Follow the starter’s auxiliary output 14 back to coil A1.', 'The wire from 14 back to A1 is broken. The Start button feeds the coil while you hold it. When you let go, there’s no feed to keep it on.',
    ['A healthy starter holds after Start is released.', 'Stop or the overload control contact can release the coil.']],
  ['Interlocked forward/reverse motor starter', 'Industrial', 'Routine',
    'The forward and reverse contactors feed the same motor with different phase orders. Their interlocks keep the two power paths apart.',
    'Compare the phase connections through both contactors. Follow each direction coil through a normally closed contact on the opposing contactor.',
    'Start forwards, stop, select Reverse and start again. Check the active contactor and the motor’s direction for each run.',
    'Measure across the forward coil, then the reverse coil. Only the selected coil should have its working voltage. Compare the order of the phase wires that reach the motor.',
    'wrong-control', 'Forward is selected and Start operates the run circuit, but the forward contactor stays out.', 'Trace the forward selector output into the reverse contactor’s normally closed auxiliary contact.', 'The wire from selector A to reverse terminal 21 is open. The reverse contactor can be released and still have no forward command to pass through its interlock.',
    ['The two contactor paths give different phase orders.', 'With Forward pulled in, Reverse must stay out.']],
  ['Six-terminal star-delta motor starter', 'Industrial', 'Existing',
    'A star–delta starter changes the connections at all six motor winding ends. Its contactors and timer must suit the motor and its winding ratings.',
    'Trace the three winding starts from the main contactor. The star contactor joins the three ends. The delta contactor makes a different set of connections. Each direction of changeover has an interlock.',
    'Start the motor and watch star operate. Let the timer run. Check that star releases before delta takes over.',
    'Watch the star contactor when you press Start. After the delay, watch it drop out and delta pull in. The bench shows the winding connections. It leaves out the brief rush of starting current.',
    'wrong-control', 'Star works during starting. At changeover it releases, but delta never pulls in.', 'Follow the timer relay’s delta output through the star contactor’s normally closed interlock.', 'The wire from the timer relay’s NO contact to star terminal 21 is open. When star releases, the delta coil still has no feed and the winding circuit is incomplete.',
    ['Star and delta make different connections at the winding ends.', 'The delta path must wait for the star contactor to release.']],
  ['Motor speed control with a variable-frequency drive', 'Industrial', 'Equipment dependent',
    'A variable-frequency drive (VFD) has a mains input, a motor output and a RUN control. They have different jobs and different terminal markings.',
    'Follow the incoming phases to the drive, its output phases to the motor and the separate dry-contact RUN loop back to the drive.',
    'Start with RUN closed and note the motor’s indicated frequency. Open RUN while leaving the drive powered.',
    'Read the frequency in hertz (Hz) with RUN on. Open RUN and check the motor again. The bench shows the main output frequency. It leaves out the drive’s fast switching pulses.',
    'wrong-control', 'The drive has input power, but the motor has no output.', 'Check continuity of the RUN loop with the simulated sources off.', 'The wire from the run switch output to the drive’s RUN input is open. Mains power at the drive cannot replace that missing command.',
    ['Opening RUN stops the motor output.', 'The running motor follows the drive’s frequency setting.']],
  ['Staged three-phase heater bank', 'Industrial', 'Equipment dependent',
    'Two contactors switch separate stages of a three-phase heater. Both stages share one high-temperature safety contact.',
    'Follow each thermostat to its own contactor coil. Find the high-temperature cut-out that feeds both. If it opens, both heater banks lose power.',
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
    'Keep the high-level float down. Select pump A, then pump B. Lift the float and count how many pumps are running.',
    'Check each pump coil with the float down, then up. If a pump runs only with the float up, follow the wire from the duty selector.',
    'wrong-control', 'Normal level calls for pump A, but A stays off. B can run when selected. Leave high-level assist off while checking.', 'Trace the A output of the duty selector to the first pump’s request junction.', 'The wire from duty A to its request junction is open. B still has its own route. The assist path can still supply A and conceal that missing duty feed.',
    ['The selector chooses the first pump at normal level.', 'High-level assist can call both pumps.']],
  ['PLC inputs and motor starter', 'Industrial', 'Equipment dependent',
    'A PLC (programmable logic controller) reads two conditions and switches its output only when both are true. The motor contactor carries the motor current.',
    'Follow the input signals to I1 and I2, the output common to its supply, and Q1 to the starter coil. The overload-status indication has its own channel.',
    'Start with both input conditions present. Remove one, then compare the motor and the independent status indication.',
    'Check the control supply, both input voltages, output COM and the coil circuit. Power at the PLC electronics alone cannot show that Q1 has a supply to switch.',
    'wrong-control', 'The PLC is on and both sensors are on, but the motor never gets a run command.', 'Compare the signal leaving the presence sensor with I1 at the controller.', 'The wire from the presence sensor to I1 is broken. The PLC needs both I1 and I2 on before it starts the motor. Watch I1 as you operate the sensor.',
    ['The motor command requires both inputs.', 'An independent status output can remain on after the motor stops.']],
  ['Safety relay and contactor feedback', 'Industrial', 'Advanced',
    'A safety relay checks its input channels, feedback and reset before permitting a new start. This exercise models those signals, not a machine safety rating.',
    'Find the wire from terminal 22 on the contactor back to FB on the safety relay. It tells the relay that the contactor has dropped out. Reset and Start each have their own button.',
    'Begin stopped. Reset, then start. Break a safety channel and restore it. Reset again and check that the motor waits for Start.',
    'Compare the safety relay’s armed state with the motor coil state. When the contactor is released, check the feedback path used before resetting the relay.',
    'wrong-control', 'The machine is stopped and both safety inputs are healthy. Pressing Reset does not arm the relay.', 'With the starter released, follow the wire from terminal 22 back to FB on the safety relay.', 'The wire from starter terminal 22 to feedback input FB is open. The relay cannot confirm a released contactor before arming. Check this in the stopped, unarmed state.',
    ['Opening either safety input stops the motor.', 'After Reset the motor still waits for Start.']],
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
  if (circuit.lessonId && circuit.lessonId >= 65) {
    if (circuit.lessonId === 80) return 'Follow the two bell wires back to the AC transformer. The light has its own positive and negative wires back to the DC supply.';
    if (circuit.lessonId === 71 || circuit.lessonId === 72) return 'The bell runs from a separate AC winding. Put one probe on each end of that winding to read its voltage.';
    return 'Find the + and − on the DC supply. Follow the feed to the fitting and its return to the same supply.';
  }
  if (circuit.supply.phase === 'three') return 'L1, L2 and L3 are the three phases. Look at which two points feed the part you want to measure. A heater may be connected between phases, or from one phase to neutral.';
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
    if(converter.type==='transformer')conversion=` For ${converter.label}, the output winding is rated ${p.outputVoltage} V with ${p.ratedVoltage??p.nominalVoltage??240} V on the input winding. The turns ratio gives Vsecondary / Vprimary ≈ Nsecondary / Nprimary. Put the probes on SEC 1 and SEC 2. This winding supplies AC. The output varies with the input voltage and the losses in the winding.`;
    else if(['driver','dcsupply'].includes(converter.type))conversion=` ${converter.label} keeps its output close to ${p.outputVoltage} V DC within its current and power limits. Input power is roughly output power divided by efficiency, plus the power used on standby.`;
    else if(converter.type==='vfd')conversion=' The drive sends three-phase power to the motor on U, V and W. Measure between two of those terminals. The bench calculates the main AC voltage at the chosen frequency. It leaves out the fast switching pulses, starting torque and cable effects.';
    else if(converter.type==='pv')conversion=' Subtract the solar output from the power used by the loads. A positive result means the house is taking power from the grid. A negative result means power is going back to the grid. This inverter stops exporting when the mains fails.';
    else conversion=' A 100 W load uses 100 Wh in one hour. The battery also has to cover losses in the inverter. Measure backup AC across BL and BN. The DC terminals are + and −, and the mains terminals are L and N.';
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
  return {beginner,apprentice:[worked,conversion.trim(),'For the drop along one wire, use ΔV = I × Z (current times wire impedance).',abnormal[fault]].filter(Boolean).join(' ')};

}

function createLesson(spec: Spec, index: number): ConfigurationLesson {
  const id = index + 1;
  const [title, category, tag, purpose, connections, sequence, measurement, fault, briefing, hint, answer, checks] = spec;
  const circuit = furnishCourseBoard(buildCircuit(id, title));
  const extra=elvPage(id);
  const target:ChallengeTarget = extra ? {path:extra.target} : CHALLENGE_TARGETS[id];
  if (!target) throw new Error(`Lesson ${id} has no exact challenge target`);

  const context = extra ? "A 240 V bench supply feeds the transformer or power supply. Work on its extra-low-voltage side" : id >= 53 ? 'Three-phase supply in Ireland. About 230 V from phase to neutral and 400 V between phases'
    : id >= 49 ? 'Single-phase equipment for a business in Ireland. The bench supply is 240 V'
    : 'Homes and small businesses in Ireland. The bench supply is 240 V';
  const caveat = tag === 'Equipment dependent' || tag === 'Advanced'
    ? 'Real units vary. Check the diagram supplied with yours for its terminal markings and controls.'
    : tag === 'Existing' ? 'You may come across this arrangement in an older installation. Design rules for new work can differ.'
    : 'Use the product diagram when identifying terminals on real equipment.';
  const probePair=lessonProbePoints(id,circuit);
  const red=probePair&&describeEndpoint(circuit,probePair.a);
  const black=probePair&&describeEndpoint(circuit,probePair.b);
  const probeNote=red&&black
    ? red.endpoint.component===black.endpoint.component
      ? `At ${red.equipmentName}, put one probe on ${red.pointLabel} and the other on ${black.pointLabel}. Leave both there while you try the control.`
      : `Put one probe on ${red.label} and the other on ${black.label}. Read the volts between those two points.`
    : 'Set the tester to volts and choose the two points you want to compare.';
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
    12:'This 60 W filament lamp suits the HQ1A dimmer. The real dimmer switches during each AC cycle. The bench uses a resistor to show how the lamp power changes.',
    13:'A transformer changes AC voltage through its windings. The driver here gives the LEDs a steady DC output. Check the output marked on the unit.',
    14:'On a real PIR, the motion detector and timer can be in one fitting. Here you can try them separately. Stop the movement and watch how long the timer keeps the light on.',
    15:'The photocell switches the light when it gets dark. Check the maker’s diagram for the supply and switched output. The daylight setting and delay vary between products.',
    16:'On the Shelly example, SW senses the wall switch and the I and O contacts have a separate feed. On this bench, the relay switches its own L supply to OUT.',
    42:'Aico alarms have a permanent supply and a separate link between units. Try the LINK wire to see which alarms sound. Use the alarm indicator here. The bench does not give a voltage reading for that signal.',
    44:'A non-maintained emergency lamp normally stays dark. Cut the permanent mains supply and the battery lights it. A real fitting also needs checks for light output and battery run time.',
    45:'On this fitting SL is the switched line for normal lighting. The battery watches the permanent supply. Switch SL off, then cut the permanent supply and compare what happens.',
    46:'The contactor in this example can cut power to the charger. Its incoming terminals can still be live. Real chargers can use a current sensor to reduce charging as the house uses more power. This lesson only checks the on/off control.',
    58:'The drive feeds the motor at U, V and W. Here a switch between RUN and COM tells it to run. Real drives have their own input settings. The bench shows the main AC output and leaves out the fast switching pulses and motor torque.',
    63:'This PLC reads two 24 V inputs. Its output contacts pass a separate feed from COM to Q. A real PLC may have transistor outputs and different terminal markings. Check the module diagram.',
    64:'A real safety relay has a diagram for its two channels, reset and contactor feedback. The bench lets you try those signals. An on-screen result gives no machinery safety rating.',
  };
  return {
    id, title, category, tag, level: extra ? id<=66||id===71 ? 'Foundation' : id===80?'Advanced':'Intermediate' : id <= 24 ? 'Foundation' : id < 53 ? 'Intermediate' : 'Advanced', context,
    summary: COURSE_PAGES[id].situation,
    sections: [
      ...(id === 7 ? [{title:'Why the lamp can light with a wiring fault',beginner:'The lamp can still light with its earth disconnected. That is why testing the switch alone will miss a fault.',apprentice:'An extra link from outgoing neutral to earth can send some return current around the RCBO. With the lamp on, that can trip it. With the switch off, the wiring test still finds the link. Test circuit tries both switch positions and leaves your switch where you put it.'}] : []),
      { title: 'What the parts do', beginner: COURSE_PAGES[id].idea, apprentice: purpose },
      { title: 'Follow the wires', beginner: connections, apprentice: roleExplanation(circuit)+' Open Drawing and choose My wiring. Select any wire to read the two terminal markings.' },
      { title: 'Try the controls', beginner: sequence, apprentice: checks.join(' ') },
      { title: 'Where to put the probes', beginner: measurement, apprentice: probeNote },
      {title:'Work out the readings',...(extra?{beginner:ELV_WORKED[id],apprentice:extra.connection+' A wire loses a little voltage as it carries current. The voltage drop is ΔV = I × Z. On a DC circuit, Z is the wire’s resistance. Use the wire and load values on this bench.'}:calculationNotes(circuit,fault))},
      ...(comparison[id]?[{title:'On the real fitting',beginner:comparison[id],apprentice:'Open the maker’s diagram below. Compare its supply, controls and output terminals with the ones on your bench.'}]:[]),
      { title: 'Find the fault', beginner: briefing, apprentice: hint },
      { title: 'On a job in Ireland', beginner: context+'. '+caveat, apprentice: 'Ireland’s nominal supply is 230 V from line to neutral and 400 V between phases, at 50 Hz. Find the Irish wiring rules under I.S. 10101. Restricted electrical work in Ireland must be carried out by a Registered Electrical Contractor.' },
    ],
    steps: [
      'Find the supply. Read the terminal markings on its wiring side.',
      'Pick a fitting. Choose Show terminals and read the letters beside the wires.',
      `Try it with the power on. ${sequence}`,
      `${measurement}`,
      ...checks,
      `Start fault practice. ${briefing}`,
      'Repair the fault, reset anything that tripped and test the circuit again.',
    ],
    objectives: [...checks, extra ? 'Follow the two wires at the fitting back to its supply. Read the markings at each end.' : 'Trace the return wire and the earth wire. Read the markings at each end.'],
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

