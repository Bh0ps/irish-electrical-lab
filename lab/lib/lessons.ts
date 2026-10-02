import type { CircuitDocument, ComponentInstance, ConfigurationLesson, Endpoint, Parameters, TerminalRole, Wire } from './types';
import * as Registry from './components.ts';

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
    if(this.id===11){const left=this.components.find(c=>c.id==='gang-a')!,right=this.components.find(c=>c.id==='gang-b')!;left.params={...left.params,gangModule:'left',gangGroup:'two-gang-11'};right.params={...right.params,gangModule:'right',gangGroup:'two-gang-11'};right.position=[left.position[0]+.46,left.position[1],left.position[2]];}
    return { version: 1, id: `lesson-${this.id}`, name: this.name, revision: 0,
      supply: { enabled: true, phase: this.three ? 'three' : 'single', voltage: this.three ? 400 : 240, frequency: 50, sourceResistance: 0.12 },
      components: this.components, wires: this.wires, faults: [], lessonId: this.id };
  }
}

function buildCircuit(id: number, title: string): CircuitDocument {
  const b = new Bench(id, title, id >= 53);
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
      b.add('transformer', 'isolation', 'Shaver isolating transformer', { outputVoltage: 230 }); b.mains('isolation'); b.add('socket', 'shaver', 'Separated shaver outlet · no PE output', { watts: 15, ratedVoltage: 230, doubleInsulated: true, classII: true }); b.wire(['isolation', '+'], ['shaver', 'L'], 'output'); b.wire(['isolation', '-'], ['shaver', 'N'], 'output'); break;
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
    case 43: { b.add('transformer', 'tx', 'Doorbell isolating transformer · 12 V', { outputVoltage: 12 }); b.mains('tx'); b.add('pushbutton', 'push', 'Doorbell push · NO', { pressed: false }); b.wire(['tx', '+'], ['push', 'COM'], 'DC+'); b.add('chime', 'chime', 'Low-voltage door chime', { watts: 3, ratedVoltage: 12, doubleInsulated: true }); b.wire(['push', 'NO'], ['chime', 'L'], 'DC+'); b.wire(['tx', '-'], ['chime', 'N'], 'DC-'); break; }
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
    'Trace electricity from the customer supply boundary through metering and main isolation to an outgoing circuit. The meter measures energy; the isolator interrupts the customer supply; the outgoing breaker protects its circuit.',
    'The meter has separate incoming and outgoing line, neutral and protective paths. Line and neutral pass through the main isolator; the represented board feeds the outgoing breaker. Protective earth continues independently of the switched active paths.',
    'Start with the outgoing lamp illuminated. Open the main isolator: both downstream active conductors are separated and the lamp stops. Close it and then open only the outgoing breaker to distinguish whole-installation isolation from circuit switching.',
    'Compare supply L–N with board LOUT–NOUT before and after opening the main isolator. The meter path carries all represented load current; the outgoing path carries this one circuit current.',
    'open-live', 'The source remains available but the represented outgoing circuit has gone dark.', 'Follow the line path from meter output through isolation and branch protection.', 'An open line connection interrupts the downstream supply. The meter having an available input does not establish that the outgoing circuit is energized.',
    ['Opening the main isolator reduces lamp power to approximately zero.', 'Closing the main isolator restores a nonzero lamp terminal voltage and power.']],
  ['Shared RCCB with outgoing MCB circuits', 'Distribution', 'Existing',
    'Understand a group residual-current device supervising several circuits, with separate overcurrent devices on their outgoing line paths. One group trip can remove both loads.',
    'Both outgoing live paths originate at the RCCB output; both neutral returns pass through its matching neutral output. Each live branch also passes through its own MCB. PE bypasses the RCCB sensing path.',
    'Run both loads and open one MCB: only that branch stops. Reset it and inject an earth fault on either protected load: observe the shared RCCB response and both downstream supplies.',
    'Measure each outgoing current and the group total. Under ordinary operation, line and neutral monitored currents balance even though PE is connected to each load.',
    'earth-fault', 'One circuit fault has also removed the other circuit in the shared group.', 'Identify which protective device is common to both outgoing line and neutral paths.', 'The shared RCCB detects residual imbalance and opens its group. The branch MCB is a separate overcurrent device; it is not responsible for residual-current selectivity.',
    ['Opening branch1 stops load1 while load2 remains supplied.', 'An earth-fault challenge can trip group protection and interrupt both loads.']],
  ['Individual RCBO circuits', 'Distribution', 'Routine',
    'Compare individual combined overcurrent and residual-current protection with a shared RCCB arrangement. Each represented circuit has its own monitored live and neutral path.',
    'Each RCBO receives its own line and neutral connection from the supply. Its output line and output neutral feed only its associated load. The protective network is common but carries no normal load return.',
    'Run both loads. Open one RCBO and inspect the unaffected circuit. Restore it, then apply a fault to one outgoing circuit and compare the scope of interruption.',
    'Measure the neutral current of each individual circuit and the supply current. A neutral placed on the other RCBO would break the intended matching of monitored conductors.',
    'earth-fault', 'A protected branch has a leakage fault; determine which equipment should lose supply.', 'Trace the faulty load to its own RCBO output pair.', 'Each branch RCBO independently supervises its circuit. Functional independence depends on using the corresponding neutral return, not merely installing two devices.',
    ['Opening branch1 interrupts load1 but leaves load2 operating.', 'Each load neutral is connected to the NOUT of its own RCBO.']],
  ['Submain and remote distribution board', 'Distribution', 'Routine',
    'See how a feeder supplies a second board, where local isolation and final-circuit protection have distinct jobs. A remote board is not another independent electricity source.',
    'Upstream protection feeds a line-and-neutral isolator at the remote location. That isolator feeds the board; the board then feeds the remote RCBO and socket. PE accompanies the feeder through to the final load.',
    'Open the remote isolator and observe the socket lose power while the upstream supply remains available. Close it, then open the outgoing RCBO to isolate only the remote final circuit.',
    'Compare upstream breaker output voltage, remote board input voltage and socket voltage. The real feeder route, installation method and fault performance would require design calculations beyond this exercise.',
    'open-neutral', 'The remote line path looks complete but the socket load does not operate.', 'Follow the feeder neutral through local isolation and the remote RCBO.', 'A feeder neutral discontinuity removes the normal return. A visible live connection and an intact protective conductor cannot replace that return.',
    ['Remote isolation interrupts both board active input paths.', 'With all devices closed, the socket has nonzero operating power.']],
  ['Parallel surge-protection branch', 'Distribution', 'Equipment dependent',
    'Locate a surge-protection device alongside the supply to equipment. Its parallel connection differs from a switch or breaker placed in series with load current.',
    'The SPD connects to the line, neutral and protective network as a separate branch. The lamp supply remains on the ordinary protected line and neutral paths rather than flowing through the SPD as a normal series device.',
    'Run the load and inspect the SPD branch. Disconnect the SPD protective connection in the exercise: the lamp may still illuminate, but the protective-path finding changes.',
    'Normal steady-state SPD current is negligible in this model. Transient waveforms, coordination and actual surge-energy ratings are outside the solver; do not interpret absence of normal SPD current as absence of purpose.',
    'missing-earth', 'The lamp operates, but the SPD no longer has its represented protective connection.', 'Inspect the parallel branch rather than the normal lamp path.', 'Restoring the represented SPD protective path changes the protective finding while leaving normal load operation similar. This demonstrates why functionality alone does not validate protection.',
    ['SPD line connection is parallel with the equipment supply.', 'Removing its PE path does not by itself open the lamp live/neutral circuit.']],
  ['Priority load shedding', 'Distribution', 'Equipment dependent',
    'Learn how a high-priority demand can temporarily inhibit a lower-priority demand. A control decision operates a switching path; it does not reduce the upstream load by changing voltage.',
    'The priority heater is directly supplied. The lower-priority heater passes through a relay normally closed contact. A demand monitor output energizes the relay coil, opening that normally closed permission path.',
    'Run both demands with the monitor inactive. Activate the monitor: the priority load stays supplied while the secondary path opens. Remove the demand request and observe the secondary path return.',
    'Record total supply current before and after shedding. The difference corresponds to the disconnected secondary load, while the priority branch current remains present.',
    'wrong-control', 'The secondary load remains present when the monitor requests shedding.', 'Compare relay NC and NO functions and inspect the monitor-to-coil connection.', 'The secondary path must use the contact function associated with the intended fail/permission state. A disconnected or incorrect coil command prevents the demonstrated shedding response.',
    ['Activating monitor interrupts secondary while priority remains powered.', 'Supply power decreases when the lower-priority branch opens.']],
  ['One-way lighting', 'Lighting', 'Routine',
    'A maintained switch interrupts the line feeding one luminaire. Neutral supplies the normal return; protective earth has a separate protective purpose.',
    'Supply line enters switch COM. Switch OUT feeds lamp L. Lamp N returns to protected neutral, and lamp PE connects to the protective network.',
    'Toggle the switch open and closed. Inspect the contact cutaway and lamp response together. Opening the switch interrupts the line path, not the protective path.',
    'Across the energized lamp, measure close to the selected RMS supply. Across the closed switch, expect a small drop; across the open switch, a supply-related potential can remain.',
    'open-live', 'The switch is closed but the light is dark.', 'Check both switch terminals and the line connection into the luminaire.', 'An open series conductor leaves no complete operating path. Reconnecting the identified virtual conductor restores the lamp, while PE is never a substitute return.',
    ['Opening switch makes light power approximately zero.', 'Closing switch makes light power nonzero.']],
  ['Parallel lighting bank', 'Lighting', 'Routine',
    'Several lamps can share one switched supply while remaining electrically in parallel. Each has its own complete line-to-neutral load branch.',
    'One switch output branches to all three lamp line terminals. Their neutral terminals share the normal return, and their protective terminals share PE. No lamp is placed in series with another.',
    'Switch the whole bank off and on. Open one lamp branch and compare it with opening the common switched feed: the branch fault affects one lamp, while the shared feed affects all three.',
    'Compare lamp voltages: parallel branches have similar line-to-neutral voltage. The upstream switch current is the sum of represented branch currents.',
    'open-neutral', 'One luminaire has stopped while neighbouring luminaires still work.', 'Distinguish the failed individual return from the shared supply path.', 'An individual neutral discontinuity interrupts that branch. The other parallel paths remain complete; a common neutral break would have a wider effect.',
    ['All three lamp voltages are approximately equal when operating.', 'The common switched-wire current exceeds each individual branch current.']],
  ['Two-way staircase lighting', 'Lighting', 'Routine',
    'Two switches can control the same lamp using selectable traveller paths. Either switch changes whether a continuous route connects supply common to lamp common.',
    'Line enters the first COM. T1 connects to T1 and T2 to T2 between switches. The second COM supplies the lamp; its neutral and PE remain independent of travellers.',
    'Toggle either end switch once: the lamp changes state. Toggle the other once: it changes again. Trace the selected traveller in each state instead of assigning fixed on/off labels to the handles.',
    'Measure the lamp terminal voltage for the four combinations of the two switch positions. Two combinations connect a route and two interrupt it in this represented mapping.',
    'wrong-control', 'One handle no longer gives the expected change in lamp state.', 'Identify commons before inspecting the two traveller connections.', 'A common/traveller error changes the switching truth table. Correcting the actual terminal assignment restores control from both positions.',
    ['Changing either switch position changes lamp state.', 'Four switch-position combinations produce two lit and two unlit states.']],
  ['Three-location intermediate lighting', 'Lighting', 'Routine',
    'An intermediate switch crosses or preserves the traveller pair between two end switches. It adds a control location without becoming a third two-way common.',
    'The first end switch sends travellers to intermediate A/B; intermediate C/D continue to the last end switch. Supply and lamp connect to the end-switch commons.',
    'Toggle the middle switch with the end switches held fixed. Then toggle each end switch independently. Each change should invert the lamp result.',
    'Inspect intermediate continuity: straight and crossed states connect different terminal pairs. Lamp voltage follows the resulting full route, not the middle handle alone.',
    'wrong-control', 'The intermediate location has no consistent effect on the lamp.', 'Check that both incoming and both outgoing travellers use the intended sides.', 'The crossing switch requires a pair on each side. Incorrect side allocation can bypass the intended straight/crossed route and corrupt control.',
    ['Changing middle position inverts lamp state.', 'Both end switches remain able to invert the lamp state.']],
  ['Two-gang independent lighting zones', 'Lighting', 'Routine',
    'A two-gang accessory contains two independently operated switching functions. Sharing a feed does not make the switched outputs the same circuit branch.',
    'Both gang commons receive the live feed, but each output supplies its own luminaire. Neutral and protective paths serve both loads independently.',
    'Open gang A while keeping gang B closed, then swap the states. Compare the two outputs rather than relying on the accessory being one physical housing.',
    'Measure line-to-neutral at each luminaire. One switched output can be available while the neighbouring output is interrupted.',
    'short-circuit', 'The two zone outputs appear unexpectedly linked or protection operates.', 'Inspect the independence of the two switched branches.', 'An unintended connection can defeat separate control; a line-to-neutral short instead produces high fault current and protection response. The challenge report distinguishes the actual injected fault.',
    ['Gang A controls only zone-a in the intact exercise.', 'Gang B controls only zone-b in the intact exercise.']],
  ['Compatible dimmer and luminaire', 'Lighting', 'Equipment dependent',
    'Brightness control is more than a binary contact. Compatibility matters because real electronic lamps and dimmers can have different operating limits.',
    'The dimmer is placed in the line path through COM and OUT. The lamp retains its neutral and protective connections. Drag the Dimmer level slider after selecting its housing. Lower settings increase the equivalent series resistance, reducing voltage and power at this connected lamp.',
    'Change level from a low value to a high value while the dimmer is closed, then open it. Compare brightness, voltage and power at the actual connected load.',
    'The default reference is 960 Ω (240²/60). Rseries = 960 × (1/level − 1) + 0.001 Ω while closed; zero is open. For a fixed lamp resistance, P = Vlamp²/Rlamp, so half voltage gives roughly one quarter power. Changing the lamp rating changes the division of voltage. Real electronic dimmers control waveforms; the equivalent resistor loss is not their hardware heating. Chopped waveforms, flicker, compatibility limits and electromagnetic interference are outside this model.',
    'wrong-control', 'Brightness remains fixed despite a changed control setting.', 'Inspect dimmer output routing and the selected level.', 'A load bypassing the dimmer receives the ordinary supply regardless of level. In real equipment, incompatibility is another possible cause that this abstraction does not diagnose.',
    ['Reducing dimmer level reduces represented lamp power.', 'Opening dimmer interrupts the represented lamp.']],
  ['Isolated LED-driver lighting', 'Lighting', 'Equipment dependent',
    'A driver converts mains input to an extra-low-voltage output. The output circuit has its own two-conductor loop and is separated from mains neutral.',
    'Driver L/N receive protected mains and its PE receives the protective connection. The driver +/− terminals supply the low-voltage LED load; neither output is joined to the mains neutral.',
    'Run the LED and compare input and output measurements. Disable the driver input and observe the output load stop. Inspect the isolation cutaway and separate terminal labels.',
    'Measure approximately the declared 24 V between driver output terminals. A floating output-to-earth value is not a reliable substitute for output-to-output measurement.',
    'open-neutral', 'The driver still has input supply but the LED output loop is incomplete.', 'Inspect the output return separately from input N.', 'The isolated output needs both output conductors. Joining it arbitrarily to mains neutral would change the intended separation rather than repair the correct return.',
    ['Driver output-to-output voltage is approximately 24 V.', 'LED input loop uses driver output terminals rather than supply N.']],
  ['PIR timed lighting', 'Lighting', 'Routine',
    'Motion detection supplies a lighting request, and a controller can retain illumination briefly after a trigger. Permanent controller power differs from the switched lamp output.',
    'Sensor L/N maintain its electronics. IN represents the enabling/trigger interface and OUT supplies the lamp line. The lamp still uses the protected neutral and PE paths.',
    'Activate motion and inspect the output. Remove the condition and advance the simulation to observe the documented controller delay behaviour. Interrupt controller supply and compare that with removing only the request.',
    'Measure the sensor input supply independently of its output voltage. A powered detector does not imply its output should always be active.',
    'wrong-control', 'The detector has supply but does not command the lamp.', 'Compare the input condition, enabling path and switched output.', 'An incorrect or interrupted control input can leave a healthy supply with no lighting command. The repair must restore the request interface, not bypass the detector.',
    ['Changing pir demand changes its output request.', 'The lamp follows the connected controller output rather than controller power alone.']],
  ['Photocell exterior lighting', 'Lighting', 'Routine',
    'A photocell bases its lighting decision on ambient light. It serves a different purpose from a motion detector: darkness can permit illumination without occupancy.',
    'The photocell receives permanent L/N supply and an enabling input. Its controlled live output feeds the exterior lamp; neutral returns directly to the protected supply.',
    'Select darkness demand and confirm illumination. Select daylight demand and inspect the output change while leaving the controller supplied.',
    'Controller input voltage can remain available in both conditions. The output voltage and lamp power are the quantities that identify the lighting decision.',
    'wrong-control', 'The light behaves opposite to the selected daylight/darkness request.', 'Read the sensor mode and request before changing any power wiring.', 'A reversed demand interpretation produces a logic error even with a complete load circuit. Correct the intended condition mapping rather than treating PE as a control conductor.',
    ['The output condition changes between darkness and daylight requests.', 'Controller supply remains present when the lamp is inhibited.']],
  ['Smart relay with local switch input', 'Lighting', 'Equipment dependent',
    'A powered relay can accept a manual input while switching a separate load path. Its internal operating supply and its external input must not be confused.',
    'Smart relay L/N power its electronics. The wall switch output connects to IN, and the relay OUT connects to the lamp. The wall switch is a control interface rather than the whole relay power supply.',
    'Operate the local wall switch and change the controller permission. Inspect the relay output in each state and compare a lost input with loss of controller power.',
    'Measure L–N at the controller and OUT–N at the lamp. Different controller products use different input schemes; this is the stated powered-input abstraction only.',
    'wrong-control', 'The local input changes but the lamp never follows.', 'Inspect manual-to-IN and OUT-to-lamp as distinct connections.', 'A misassigned input or bypassed output breaks the intended relay control. Manufacturer instructions decide actual switch-input types, including whether they are volt-free.',
    ['Manual input is connected to smart IN, not to N or PE.', 'With the represented permission enabled, the output can supply the lamp.']],
  ['Domestic socket radial', 'Sockets & supplies', 'Routine',
    'A radial travels outward from circuit protection through successive outlets without returning as a second circuit leg. Outlets supply their connected loads in parallel.',
    'The first socket receives L/N/PE from the protected supply. Matching terminals continue to the second and third sockets. There is no return link from the last outlet to the board.',
    'Run all three outlet loads. Open a connection between the second and third and observe the affected downstream path. Compare that with opening the first common feed.',
    'Outlet voltages are similar but include small represented wiring drops. The first segment carries the sum of downstream demand; later segments carry less.',
    'open-live', 'A downstream outlet has lost operation while earlier outlets remain available.', 'Work along the radial path from the last working outlet.', 'A series path discontinuity downstream of an earlier outlet leaves that earlier parallel branch supplied while removing the later path.',
    ['No wire returns socket-c directly to protect output.', 'The first radial segment carries more demand than the last segment.']],
  ['Encountered ring final topology', 'Sockets & supplies', 'Existing',
    'Compare an encountered ring topology with a radial. The outgoing and returning conductor routes create two paths around the network; this is not a universal Irish default recommendation.',
    'L/N/PE travel through the three outlet positions and return from the final position to their corresponding supply nodes. Each load remains line-to-neutral in parallel.',
    'Inspect the closed ring routes. Open one ring segment and observe that loads may still operate from the remaining route. Treat continued operation as a diagnostic trap, not proof of intact design.',
    'Compare currents in the two supply legs and how they change when a segment opens. Real ring verification requires competent inspection and tests, beyond visible lamp/socket operation.',
    'open-live', 'All outlets appear usable although a ring conductor is discontinuous.', 'Trace the complete returning leg rather than stopping at successful load operation.', 'The alternate route can maintain functionality after a ring conductor break. That does not validate the protective design or permit operation to substitute for verification.',
    ['The circuit has a return line link from socket-c to protection output.', 'Opening one ring line segment changes current distribution even if loads remain supplied.']],
  ['Ring topology with fused branch', 'Sockets & supplies', 'Existing',
    'A fused branch is a distinct outgoing path connected to an encountered ring. Its local fuse protects the represented branch separately from the ring’s overall protective arrangement.',
    'The ring remains closed through its outlet chain. At one outlet, a separate line path enters the branch fuse and leaves to the fixed load. Its neutral and protective paths complete that branch.',
    'Run ring outlets and branch load together. Open the branch fuse: the fixed branch stops while ring outlets remain connected. Compare a branch fault with a ring-path discontinuity.',
    'Measure branch-fuse current separately from ring-leg currents. The exercise’s numerical fuse rating is illustrative; real permitted arrangements require the current Irish rules and design conditions.',
    'overload', 'The branch demand causes its protective path to interrupt.', 'Inspect the local fuse and distinguish branch current from the full ring demand.', 'The branch protection responds to its own current path. Restoring operation requires removing the represented excess demand and resetting/replacing the simulated protective element.',
    ['Opening branch-fuse removes fixed power but not socket-a power.', 'The fixed load line passes through the branch fuse.']],
  ['Switched fused fixed supply', 'Sockets & supplies', 'Routine',
    'A switched fused supply combines a local permission function and a separate overcurrent element for a fixed load. Switching and fusing have different purposes.',
    'The supply line enters the local switch, then the fuse, then the fixed appliance. Neutral and PE follow their own return/protective paths; neither is used as the fuse’s normal line path.',
    'Open the local switch and inspect the dead load. Close it and open the fuse to produce a similar functional result through a different mechanism.',
    'Compare voltage before and after the switch/fuse and current through the fuse. A closed switch alone cannot confirm that the downstream protected path is complete.',
    'open-live', 'The local switch is closed but the fixed appliance remains off.', 'Check the fuse path as well as the switch state.', 'A discontinuity after the switch, including the represented fuse path, interrupts the load. The state of the operating handle does not establish electrical continuity.',
    ['Both closed switch and intact fuse are needed for fixed load operation.', 'Fixed load current flows through the fuse.']],
  ['Kitchen remote isolation bank', 'Sockets & supplies', 'Routine',
    'Accessible labelled controls can isolate individual appliance supplies located elsewhere. Labels identify which remote outlet each switch is intended to operate.',
    'Each grid switch has its own switched line output to the corresponding remote outlet. Both outlets retain neutral and protective connections, and the shared incoming source remains distinct from outputs.',
    'Operate isolation A while B remains closed, then operate B while A remains closed. Confirm the remote mapping using measurements rather than labels alone.',
    'Compare each outlet’s L–N voltage after individual switching. A neighbouring control can remain supplied even when one appliance output is interrupted.',
    'wrong-control', 'An isolation label and the actual controlled appliance disagree.', 'Trace each switched output to its remote outlet.', 'Misassigned output mapping can isolate the wrong appliance. Correct virtual routing and labels together; a label without verification does not prove a real isolation point.',
    ['Grid-a interrupts only outlet-a.', 'Grid-b interrupts only outlet-b.']],
  ['Cooker supply and double-pole isolation', 'Sockets & supplies', 'Routine',
    'A fixed cooking load has a local supply isolation function. The linked line and neutral contacts differ from a one-way lighting switch.',
    'Protected line and neutral enter LIN/NIN and leave LOUT/NOUT of the double-pole isolator. The cooker receives those active paths plus the independent protective conductor.',
    'Run the reduced exercise demand and open the local isolator. Inspect both pole contact states and the cooker terminal measurements before restoring operation.',
    'Current and power are generated from the connected exercise load. The reduced preset is not a real cooker circuit recommendation; actual demand, cable route and protective design require assessment.',
    'missing-earth', 'The cooker consumes power but its protective connection is missing.', 'Check the protective terminal separately from the active supply poles.', 'A missing protective path may not stop ordinary heating. Reconnecting that path addresses the represented protective fault; operation alone was insufficient evidence.',
    ['Opening local interrupts cooker operating power.', 'The protective path remains distinct from the two isolator active contacts.']],
  ['Electric shower supply and permissions', 'Sockets & supplies', 'Routine',
    'Separate the shower’s supply isolation from its packaged operating permissions. Water-associated equipment needs both correct electrical design and manufacturer-specific protective functions.',
    'The double-pole isolator feeds the appliance line and neutral. A separate illustrative water-flow permission contact lies in the line path before the shower load. PE goes directly to the appliance.',
    'Open local isolation to stop operation. Restore isolation and open the flow-permission contact: observe that the upstream supply remains available while heating is inhibited.',
    'Compare isolator output voltage with shower load voltage when permission opens. The modest exercise wattage and generic flow contact are teaching abstractions, not a universal shower internal diagram.',
    'wrong-control', 'The shower is supplied but the represented water-flow permission prevents heat.', 'Inspect isolation and permission as two separate functions.', 'The control path must permit operation before the load receives line. Bypassing such a permission would defeat its intended purpose and is not a repair procedure.',
    ['Opening flow-permission interrupts shower power with local isolation closed.', 'Opening local removes both represented active supply paths.']],
  ['Isolated shaver supply', 'Sockets & supplies', 'Equipment dependent',
    'A shaver supply illustrates electrical separation rather than ordinary socket distribution. An isolating transformer creates a separate output circuit.',
    'Mains L/N and transformer PE terminate on the input equipment. The output pair alone supplies the represented separated outlet; there is no output-neutral connection to mains N in this template.',
    'Compare the input and separated output loops. Open the output return to stop the outlet load without breaking transformer input supply.',
    'Measure between the two output terminals, not one output and mains neutral or earth. A floating secondary does not have a prescribed output-to-earth reference in this abstraction.',
    'open-neutral', 'The transformer input is available but the separated outlet loop is broken.', 'Follow the secondary pair as its own circuit.', 'Restoring the correct output return completes the separated loop. An arbitrary mains-neutral link would alter the intended separation.',
    ['The output pair supplies shaver without joining to supply N.', 'Opening either output conductor interrupts the outlet load.']],
  ['Immersion thermostat and independent cut-out', 'Heating', 'Routine',
    'An operating thermostat controls normal hot-water demand, while an independent cut-out supplies a separate protective limit. Their contact functions are intentionally in series.',
    'Protected line passes through the operating thermostat and then the independent safety contact before the immersion element. Neutral returns directly; PE remains a protective connection.',
    'Open the normal thermostat demand and observe heating stop. Close it, then open the safety contact to demonstrate that the protective limit can stop heating even with ordinary demand present.',
    'Measure voltage across each contact and at the element. The app’s temperature/contact state is illustrative and does not recreate a cylinder’s thermal dynamics or manufacturer reset procedure.',
    'wrong-control', 'Heating remains requested while the independent safety path is interrupted.', 'Compare the thermostat contact with the separate cut-out contact.', 'Normal demand does not override an open independent limit. Both series permissions must be complete for the represented heating path.',
    ['Opening stat interrupts element power.', 'Opening safety interrupts element power even with stat closed.']],
  ['Dual immersion sink/bath selection', 'Heating', 'Existing',
    'A selector chooses between two element circuits rather than simply changing a single numeric wattage. Each selected path retains its own operating thermostat.',
    'Selector COM receives line; A feeds the short-element thermostat and B the long-element thermostat. Each heater branch has its own neutral/PE connections.',
    'Select A and inspect the short-element current. Change to B and compare the long-element branch. Open the selected thermostat and verify that selection alone does not force heating.',
    'Only the selected complete branch should consume power. Element length, ratings and physical cylinder arrangements depend on the actual equipment.',
    'wrong-control', 'The selector energizes the unexpected element path.', 'Identify COM, A and B and trace the thermostat in each branch.', 'A swapped branch assignment changes which element receives the selected supply. Repairing the mapping is distinct from changing the element wattage.',
    ['Selector position 0 supplies sink rather than bath.', 'Selector position 1 supplies bath rather than sink.']],
  ['Immersion schedule with manual boost', 'Heating', 'Routine',
    'Two permission paths can request the same immersion heater: a schedule and a manual boost. The thermostat remains a common downstream permission.',
    'The timer output and boost switch output join the permission connector as an OR arrangement. The shared connector feeds the thermostat, which then feeds the immersion element.',
    'Disable the schedule and open boost: heating stops. Enable either request and heating can run if the thermostat permits. Open the thermostat to inhibit both requests.',
    'Measure the joined request voltage and element voltage separately. A real boost normally has a defined duration; this exercise uses an explicit manual boost switch so its state is inspectable.',
    'wrong-control', 'The heater runs after the schedule is disabled.', 'Inspect the alternative boost permission before blaming the timer.', 'A parallel boost request can legitimately keep the common permission active. Both requests must be absent to stop it through scheduling; the thermostat remains independently effective.',
    ['With schedule off and boost open, element power is approximately zero.', 'Either request can supply the element when stat is closed.']],
  ['Boiler programmer and room demand', 'Heating', 'Routine',
    'Heating is requested only when the time programme permits and the room thermostat demands heat. This is a series AND permission path.',
    'The powered programmer supplies a scheduled output. That output enters the room thermostat, whose output supplies the represented packaged boiler demand interface.',
    'Disable the programmer to remove permission. Restore it and raise the thermostat temperature state beyond its setpoint: ordinary room demand should cease.',
    'Compare programme output and final boiler demand voltage. An available programme output does not mean the room thermostat is requesting heat.',
    'wrong-control', 'The schedule is enabled but the boiler has no demand.', 'Inspect the room temperature/setpoint and thermostat contact.', 'The thermostat is a separate series decision. No demand can be the correct result when the room condition is satisfied, rather than a lost mains supply.',
    ['Both programme permission and room demand are required.', 'Opening room interrupts boiler power while programme output remains available.']],
  ['S-plan two-port zone controls', 'Heating', 'Equipment dependent',
    'Heating and hot-water demands operate separate zone valves. Their opened-position feedback requests the heat source after a water path is available.',
    'The programme output feeds room and cylinder thermostats. Each thermostat feeds its valve CALL. Valve L/N maintain the actuator interface; their END outputs join an OR bus supplying boiler demand.',
    'Request one zone and advance time for valve travel. Observe the corresponding valve open and then the boiler demand. Add the other demand, then remove each separately.',
    'Compare CALL voltage, valve position and END voltage. Position feedback explains why an electrical demand does not necessarily produce immediate boiler operation.',
    'wrong-control', 'A zone request is present but boiler demand never follows valve travel.', 'Inspect the CALL-to-position-to-END chain.', 'An absent valve feedback path can leave a demand with no heat-source request. The feedback has a real coordinating purpose and must not be replaced by an arbitrary permanent live.',
    ['A demanded valve changes position after its travel interval.', 'Either open valve END can request boiler operation.']],
  ['Y-plan mid-position valve controls', 'Heating', 'Equipment dependent',
    'One three-port valve coordinates heating, hot water and combined demand. Unlike two independently controlled two-port valves, its hydraulic position follows two input requests.',
    'Room demand feeds CH and cylinder demand feeds HW of the documented valve abstraction. Its supply L/N powers the interface; END requests the represented heat source.',
    'Enable both demands to observe mid position. Remove hot-water demand to select heating, then remove heating demand and restore hot water to select its other path.',
    'Compare CH/HW voltages with the reported position and END output. Actual mid-position valve wire colours and switching details vary; this interface is a conceptual state chart.',
    'wrong-control', 'The valve position does not match the intended heating/hot-water demand pair.', 'Inspect CH and HW separately rather than treating the valve as a single on/off actuator.', 'Incorrect demand assignment changes the selected state. Correct the represented input mapping; actual terminal schemes must come from the specific manufacturer.',
    ['Both demand inputs produce the represented combined/mid state.', 'Removing one request changes the selected valve state.']],
  ['Electric underfloor heating and floor limit', 'Heating', 'Equipment dependent',
    'Electric floor heating can require room demand and a floor-temperature permission. The floor probe prevents treating air temperature as the only relevant condition.',
    'The powered floor-probe interface supplies a permission output. That output passes through room thermostat demand before supplying the resistive mat.',
    'Run with both permissions present. Remove floor permission while room demand remains; then restore floor permission and remove room demand. Either can inhibit heating.',
    'Compare the probe output, thermostat output and mat power. The thermal model is a stated electrical permission abstraction, not a real floor heat-up prediction.',
    'wrong-control', 'The room is calling for heat but the mat receives no supply.', 'Check the independent floor-temperature permission.', 'A satisfied or limiting floor condition can correctly inhibit heating despite room demand. Bypassing the probe would erase the separate protective/control purpose.',
    ['Either missing permission interrupts mat power.', 'The floor-probe electronics remain supplied while its output can be inhibited.']],
  ['Water underfloor wiring centre and actuators', 'Heating', 'Equipment dependent',
    'A multi-room wiring centre maps demand inputs to manifold actuators and coordinates circulation. It is a controller interface, not merely a wire junction.',
    'Room A/B requests enter I1/I2. Q1/Q2 command the corresponding actuators. Actuator END outputs share a demand bus that feeds the manifold pump after the represented opening condition.',
    'Change each room demand and inspect the corresponding actuator. Advance valve travel and observe pump permission from opened feedback. Compare one active room with both active rooms.',
    'Measure controller power, individual input states and output states independently. Real centre output voltage and actuator technology are manufacturer dependent.',
    'wrong-control', 'Room A changes an unexpected actuator or the pump never follows opening.', 'Compare each I/O assignment and the END feedback bus.', 'A wrong channel map can move the wrong zone; missing feedback can inhibit circulation. Logical labels and electrical routes both need to match the intended sequence.',
    ['Room input channels are connected to distinct controller inputs.', 'Opened actuator feedback can supply the circulation pump.']],
  ['Storage charge and daytime heat release', 'Heating', 'Existing',
    'Distinguish a storage heater’s charge function from a daytime release or boost function. Energy storage means heat can be released later than electrical charging.',
    'A time-controlled charge path passes through a charge thermostat to the storage element. A separate daytime switch supplies the represented release fan.',
    'Disable the charge window while keeping release enabled: electrical charge stops but the daytime fan can remain powered. Switch release off independently.',
    'Measure charge-element power separately from fan power. Electrical power is shown; stored temperature and actual room heat release are not a detailed thermal simulation.',
    'wrong-control', 'The daytime release function remains on after charge permission stops.', 'Identify the separate charge and release supply paths.', 'This may be expected because the represented paths have independent permissions. Treating both functions as one switched load would hide the purpose of stored heat.',
    ['Charge permission can stop store while day remains powered.', 'Release switch changes day independently of offpeak state.']],
  ['Packaged heat-pump supply and demand interface', 'Heating', 'Equipment dependent',
    'A heat pump combines a supply-isolation requirement with a packaged control interface. The app explains the boundary rather than inventing its refrigeration or inverter internals.',
    'Local double-pole isolation supplies the unit. A relay represents accepted demand; its output feeds the simplified heat-pump load while the thermostat commands its coil.',
    'Remove room demand and inspect interface state; then open local isolation while demand remains. Compare control inhibition with loss of the equipment supply.',
    'Compare interface-coil voltage, local output voltage and unit power. Electrical input power here is not heat output or coefficient of performance.',
    'wrong-control', 'The unit supply is available but the external demand interface does not close.', 'Trace the thermostat to the interface coil before inspecting the power contact.', 'A demand-interface fault can prevent operation with healthy mains supply. Actual heat-pump enable terminals may be volt-free or low voltage and require manufacturer documentation.',
    ['Local isolation interrupts unit power regardless of demand.', 'Room demand operates the represented interface coil.']],
  ['Simple switched extractor fan', 'Ventilation & motors', 'Routine',
    'A basic extractor operates only while its switched supply is present. It has no separately represented run-on controller.',
    'The switch output supplies the fan line terminal. Neutral completes its return and PE supplies the protective path to the represented motor housing.',
    'Open and close the supply switch and compare fan animation with measured electrical power. Opening the switch immediately removes the represented operating supply.',
    'Measure fan L–N and compare the switched-wire current with the fan branch current. Mechanical coast-down is not a detailed inertia simulation.',
    'open-neutral', 'The line switch is closed but the fan does not run.', 'Inspect the normal return path as well as the line path.', 'A missing neutral interrupts the complete operating circuit. Protective earth is not a replacement for motor neutral.',
    ['Open switch stops fan power.', 'Closed switch and intact return produce fan operation.']],
  ['Timer extractor with maintained supply', 'Ventilation & motors', 'Routine',
    'A run-on fan requires a maintained operating supply as well as a trigger. Isolation must address the represented permanent line, trigger and neutral paths.',
    'The linked isolation device carries permanent line, trigger line and neutral on separate poles. The timer L/N retain supply and IN receives the light-switch trigger; OUT feeds the fan.',
    'Run with trigger present. Remove only the trigger and advance the simulation to inspect the documented delay. Open fan isolation to remove both trigger and maintained supply.',
    'Measure permanent L–N independently of IN–N. A trigger becoming inactive does not necessarily mean the timed controller or fan has no operating supply.',
    'wrong-control', 'The fan stops immediately or fails to respond when its trigger changes.', 'Distinguish the timer permanent supply from its trigger input.', 'Confusing permanent line with the trigger defeats the intended timing function. The isolator is represented by a four-pole device with an unused pole, not a claimed universal product form.',
    ['Timer L/N remain connected when only the light trigger opens.', 'Opening fan-isolation removes the represented active fan inputs.']],
  ['Humidity demand with manual ventilation override', 'Ventilation & motors', 'Equipment dependent',
    'Humidity can request ventilation automatically while a manual switch provides an alternative request. Either request may keep the fan operating.',
    'The sensor output and override output share an OR connector feeding the fan. The sensor has an independent permanent L/N operating supply.',
    'Disable humidity demand with override closed and confirm that the fan remains requested. Open override too, then restore humidity demand without closing override.',
    'Measure the individual requests and their joined output. A shared output can be active even when one request source is inactive.',
    'wrong-control', 'Ventilation continues although humidity demand is off.', 'Inspect the parallel manual override request.', 'An active override can legitimately maintain the combined request. To diagnose a stuck command, inspect both paths rather than replacing a functioning humidity sensor.',
    ['Either request can provide fan permission.', 'Both absent requests remove the combined fan command.']],
  ['Float-controlled sump pump', 'Ventilation & motors', 'Equipment dependent',
    'A high-water condition requests drainage. A sensor/interface commands a contactor so control decisions remain distinct from the motor power path.',
    'The powered float interface OUT supplies contactor A1 with A2 returning to neutral. The contactor power pole supplies the pump; PE remains independently connected.',
    'Set high-water demand and observe coil pickup and pump power. Remove the level request and watch the contactor return to its open state.',
    'Compare low-power command state with the pump power path. Real float hysteresis, dry-running protection and pump curves depend on equipment and are not inferred from this simple level input.',
    'wrong-control', 'A high-water request is visible but the pump stays off.', 'Check coil A1–A2 before tracing contactor power poles.', 'A broken command can prevent contactor closure even with a complete motor supply. Correcting the request path restores the intended response without bypassing the level control.',
    ['Active request picks up pump-contactor.', 'Inactive request interrupts represented pumping power.']],
  ['Pressure-controlled booster pump with permission', 'Ventilation & motors', 'Equipment dependent',
    'A pressure demand starts a booster pump, while a separate permission can inhibit running. A call for pressure does not override dry-run or similar equipment permissions.',
    'The pressure output operates the contactor coil. Its power output also passes through a separate permission relay before the pump; the permission relay is energized by its stated supply.',
    'Run with pressure demand and permission present. Remove pressure demand, then restore it and remove the permission relay command. Compare the two ways operation can be inhibited.',
    'Measure contactor output and final pump terminal voltage separately. This exercise demonstrates a permission chain; it does not calculate actual water pressure or hydraulic flow.',
    'wrong-control', 'Pressure calls for pumping but a downstream permission blocks the pump.', 'Inspect the permission contact after the main switching contact.', 'The power path needs both switching functions. A healthy pressure request alone cannot establish permission to run the represented pump.',
    ['Pressure demand can close pump-contactor.', 'An open dry-run permission removes pump supply despite pressure demand.']],
  ['Single-phase start/stop motor starter', 'Ventilation & motors', 'Routine',
    'A momentary start command can establish a maintained contactor coil path through an auxiliary holding contact. Stop and overload contacts interrupt that shared path.',
    'Stop NC and overload 95/96 lie before parallel Start NO and contactor 13/14. The coil A1/A2 controls the power contact feeding the motor through the overload current path.',
    'Press Start, release it and observe continued operation through the holding contact. Press Stop and observe dropout. An overload trip must interrupt the coil permission path.',
    'Measure coil A1–A2 and inspect the auxiliary contact independently of the motor current path. A button can be released while the coil remains supplied through its holding route.',
    'wrong-control', 'The motor runs only while Start is held.', 'Inspect the auxiliary 13/14 path around the start button.', 'Missing or incorrectly routed holding feedback prevents maintained operation. The stop/overload paths must remain common to both start and hold routes.',
    ['Releasing Start after pickup leaves starter energized.', 'Pressing Stop interrupts the coil and motor.']],
  ['Shutter operator directional interface', 'Ventilation & motors', 'Equipment dependent',
    'A shutter needs direction selection and travel-limit inhibition. Commands are mutually exclusive; motor reversal details belong to the packaged operator.',
    'Selector A/B feed upper/lower limit paths and opposing relay NC interlocks. The relay state provides the represented motor run permission without pretending a single-phase motor reverses by swapping L and N.',
    'Select an allowed direction, inspect its command, then open the relevant travel-limit contact. Change direction and inspect the other limit path.',
    'Measure each directional interface coil and the permitted run output. The motor animation reports a packaged command abstraction; manufacturer winding and capacitor reversal is not reconstructed.',
    'wrong-control', 'A direction request is present but the endpoint permission prevents motion.', 'Inspect the selected direction limit rather than the unrelated opposite limit.', 'The relevant limit intentionally inhibits travel at an endpoint. Reversal, interlocking and safe motion must follow the actual operator documentation.',
    ['The selected limit contact can inhibit its direction request.', 'The power model uses a packaged operator rather than L/N reversal.']],
  ['Interlinked mains smoke and heat alarms', 'Safety & energy', 'Equipment dependent',
    'Mains-powered alarms can share a separate interlink so one alarm condition is communicated to another. Backup energy serves a different role from interlink communication.',
    'Both alarms receive mains L/N and their represented protective connections. LINK connects only to LINK on the other alarm; it is not substituted for neutral or PE.',
    'Run both alarms, change an alarm condition and inspect the linked status. Disable mains and inspect the documented backup indication, distinguishing standby power from an actual alarm request.',
    'Normal supply power is small. The interlink is a conceptual signal path; product-specific interlink voltage, wireless protocols and battery endurance are outside this model.',
    'open-live', 'One alarm loses its mains operating supply while the other remains supplied.', 'Separate alarm power from interlink and backup state.', 'An interlink does not replace the alarm power connection. Backup may maintain a defined function, but it does not make the mains discontinuity irrelevant.',
    ['Both alarms have distinct mains load branches.', 'LINK joins to LINK rather than to a supply conductor.']],
  ['Transformer doorbell and momentary push', 'Safety & energy', 'Routine',
    'A doorbell push operates an extra-low-voltage loop. The transformer input remains on the mains side while the user-operated push belongs to the output side.',
    'Transformer + passes through the push NO contact to chime L. Chime N returns to transformer −. The mains L/N/PE terminate at the transformer input equipment.',
    'Press and hold the virtual push to operate the chime; release it to stop. Compare the transformer output supply with the chime voltage while the push is open.',
    'Measure approximately 12 V across the transformer output pair. With the push open, the source output can remain available while the chime receives no complete operating loop.',
    'open-live', 'The transformer produces an output but the chime cannot operate.', 'Trace the low-voltage push and chime series loop.', 'An output-loop discontinuity prevents sound even with healthy transformer supply. Keep the repair on the separated output side.',
    ['Pressed push supplies the chime.', 'Released push interrupts chime operating power.']],
  ['Non-maintained emergency luminaire', 'Safety & energy', 'Routine',
    'A non-maintained fitting normally charges/monitors its mains supply and illuminates from stored energy when that monitored supply fails.',
    'L/N provide charging and monitoring; PE is a separate protective connection. The normal switched-light input is unused for this non-maintained template.',
    'Observe ordinary standby with mains available. Disable supply and compare battery-backed illumination with mains-input power; restore mains and inspect the return to ordinary mode.',
    'The fitting can illuminate while mains input voltage is absent. Its backup indication is a declared battery model, not proof of emergency duration or commissioning compliance.',
    'open-live', 'The emergency lamp has illuminated although its mains feed is interrupted.', 'Inspect monitored mains and backup state separately.', 'Illumination is the expected emergency response to monitored supply loss when backup is available. Repairing mains supply and assessing emergency capability are distinct tasks.',
    ['Supply loss can produce battery-backed illumination.', 'Non-maintained normal mode is distinct from maintained normal lighting.']],
  ['Maintained emergency luminaire', 'Safety & energy', 'Routine',
    'A maintained fitting serves ordinary lighting as well as emergency illumination. Permanent monitoring supply and switched normal-light permission are separate paths.',
    'L/N maintain the fitting’s monitoring/charging supply. A normal lighting switch feeds SL. The internal backup model supplies illumination on mains loss.',
    'Open normal-switch while mains stays on and inspect ordinary light state. Close it, then disable mains and inspect the emergency response independently of the ordinary switch.',
    'Compare L–N monitoring supply and SL–N normal-light request. An open normal-light switch does not establish that the battery is isolated or the fitting has no energy.',
    'wrong-control', 'Normal illumination fails although the monitored permanent supply is available.', 'Inspect SL and its switch separately from L/N.', 'The maintained normal-light request is a distinct control path. Backup and charging availability do not automatically establish an active normal-light input.',
    ['Normal-switch controls the normal-light SL path.', 'Mains loss can invoke the documented emergency state.']],
  ['EVSE supply and load-management permission', 'Safety & energy', 'Equipment dependent',
    'Load management can permit or inhibit charging while the site supply remains available. The EVSE is packaged equipment with protection and communication beyond this simple AC load model.',
    'The load-management output operates a charge-permission interface. Its power contact supplies the represented EVSE; neutral and protective connections remain explicit.',
    'Run with charging permission, then remove the load-control request. Observe reduced demand without switching off unrelated supply. Inspect permission and charging-load states separately.',
    'Compare EVSE power before and after permission. The reduced demonstration current is not an EV circuit design recommendation and the controller interface is not a universal charging protocol.',
    'wrong-control', 'Site supply is present but charging demand is inhibited.', 'Read the load-management permission and interface-coil state.', 'The request may be intentionally withheld to manage site demand. A healthy AC supply does not by itself entitle packaged equipment to charge.',
    ['With permission removed, EVSE demand stops.', 'The source remains available when charging is inhibited.']],
  ['Grid-following PV inverter AC interface', 'Safety & energy', 'Equipment dependent',
    'Generation supplies site demand and can alter net import. A grid-following inverter requires the represented grid condition; it is not automatically a backup supply.',
    'The inverter AC line and neutral connect through local isolation to the site bus. PE connects independently. A site load shares that bus; PV DC terminals are contextual in this AC-side exercise.',
    'Change generation availability and compare site import with the same demand. Open inverter isolation to remove contribution. Disable the grid and inspect the anti-islanding abstraction.',
    'Measure net source current and inverter contribution with direction/sign in mind. Negative net import indicates represented export, not a negative appliance resistance.',
    'open-live', 'The house load is still present but generation contribution has disappeared.', 'Inspect the inverter AC isolation and grid-presence condition.', 'An open inverter connection or absent grid condition removes its represented contribution. Site demand may continue from the grid when only the inverter branch opens.',
    ['Opening pv-isolator removes inverter contribution.', 'Changing generation changes net supply import/export.']],
  ['Battery inverter and essential-load backup', 'Safety & energy', 'Advanced',
    'An inverter with a documented backup output can supply selected loads after mains loss. Not all batteries or inverters provide this capability.',
    'L/N connect the grid-facing interface; BL/BN form the represented isolated backup output to essential lighting. Ordinary socket demand remains on the grid bus, outside the backup output.',
    'Run with mains, then disable it. Compare essential lighting with ordinary demand and inspect battery state. Restore mains to compare grid and backup modes.',
    'Measure the backup output pair separately from the dead grid-facing pair. Stored energy and coordinated internal changeover mean one upstream switch cannot establish that every output is dead.',
    'open-neutral', 'The essential lighting backup loop is interrupted while inverter energy remains available.', 'Trace BL/BN as a separate complete output loop.', 'An available backup source still needs an intact output pair. Arbitrarily bonding or joining alternative supplies would change the intended coordinated separation.',
    ['Essential is connected to BL/BN rather than grid L/N.', 'Ordinary demand is outside the represented backup output.']],
  ['Time-and-darkness signage contactor', 'Commercial controls', 'Routine',
    'A commercial lighting bank can require both trading-hours permission and darkness. A contactor switches the bank while the controller chain handles the requests.',
    'Trading-hours output enables the photocell input. The photocell output feeds the contactor coil; its power pole supplies two parallel signage branches.',
    'Remove either hours permission or darkness demand and inspect the coil/output. Restore both to enable the signage bank together.',
    'Compare the control-chain output with the contactor power current. The signage loads share one power contact but receive parallel branch voltages.',
    'wrong-control', 'The signage lights are supplied during an unwanted schedule condition.', 'Inspect the series permission into the photocell interface.', 'Bypassing the hours gate converts the intended AND logic into darkness-only control. Correct the permission routing rather than merely changing lamp load values.',
    ['Removing either permission can stop sign coil request.', 'Both lettering branches share the controlled bank output.']],
  ['Refrigeration cooling/defrost interlock', 'Commercial controls', 'Equipment dependent',
    'Cooling and electrical defrost are different operating modes. A changeover interlock prevents their represented demands from being active together.',
    'A defrost timer energizes a changeover relay. NC supplies the cooling thermostat/compressor path; NO supplies the defrost heater. The thermostat can inhibit cooling without enabling defrost.',
    'Start with defrost off and cooling demanded. Enable defrost: inspect compressor inhibition and heater operation. Remove cooling demand while defrost is off to produce a quiet state.',
    'Compare compressor and heater power across the modes. Real controllers add temperature termination, delays and protection; this exercise isolates the electrical interlock principle.',
    'wrong-control', 'The compressor and defrost heater do not follow the intended mutually exclusive modes.', 'Read the relay COM/NC/NO routing.', 'Correct changeover contact assignment provides the represented exclusion. Parallel uncontrolled paths would defeat this mode distinction.',
    ['With defrost off, cooling can operate through NC.', 'With defrost on, cooling is inhibited while NO can supply defrost-heat.']],
  ['Compressor pressure demand and unloading', 'Commercial controls', 'Equipment dependent',
    'Compressed-air equipment can combine pressure demand with unloading when stopped. The unloader action has a different purpose from starting the compressor motor.',
    'Pressure request operates the motor contactor and overload path. A relay follows the contactor power state; its NC supplies the represented unloading indicator when the motor power path is absent.',
    'Run with pressure demand, then remove it. Observe motor interruption and the inverse unloading indication. Restore demand and compare both states again.',
    'Measure motor current and the separate small unloading indication. Actual unloader valve mechanics and pressure decay are manufacturer dependent and not calculated.',
    'wrong-control', 'The unloading indication follows the wrong state relative to motor operation.', 'Inspect the relay NC/NO function and its motor-state coil feed.', 'The intended unloading path is associated with the stopped state. Incorrect contact selection reverses this indication and obscures the equipment sequence.',
    ['Removing pressure request stops compressor.', 'Unloader indication corresponds to the stopped permission state.']],
  ['Powered gate limits and safety-input interface', 'Commercial controls', 'Advanced',
    'A gate operator adds obstruction permission to direction and travel-limit commands. A supply being available does not mean motion should be permitted.',
    'Directional request passes through the matching limit and opposing relay interlock. The represented permitted run bus also passes through a safety-beam contact before supplying the packaged operator.',
    'Request a permitted direction, then open the beam permission. Restore it and open the matching limit. Compare the two independent reasons motion can be inhibited.',
    'Measure the request before and after each permission. This simplified interface does not establish entrapment protection, force limits or machinery safety compliance.',
    'wrong-control', 'The gate is supplied but its obstruction permission inhibits motion.', 'Inspect the beam contact and the selected directional limit.', 'Permission chains intentionally stop operation when required conditions are absent. Defeating a safety input is not a valid diagnostic repair.',
    ['An open beam permission interrupts operator power.', 'The selected travel limit can independently inhibit the command.']],
  ['Three-phase board with phase-neutral loads', 'Industrial', 'Routine',
    'A three-phase board can distribute individual single-phase loads across different phases. Phase-to-neutral and phase-to-phase voltages have distinct meanings.',
    'Linked three-pole protection feeds three different load line terminals. All three load neutrals return to supply N; PE remains separate. The represented unequal loads create an intentionally unbalanced demand.',
    'Run the three branches and compare phase currents. Open one branch and inspect the remaining two. Compare branch changes with opening the linked upstream breaker.',
    'Measure approximately 230 V phase-neutral and 400 V between phases in the 400 V preset. Unequal phase currents do not imply neutral current is their simple arithmetic sum; phase angles matter.',
    'phase-loss', 'One phase branch has lost supply while other phases remain available.', 'Compare the three phase-neutral measurements.', 'A phase-specific discontinuity changes the load distribution. Linked protective operation differs from a missing supply phase and is visible in device state.',
    ['Phase-neutral measurements are lower than phase-phase measurements.', 'Unequal branch loads produce unequal represented phase currents.']],
  ['Five-contact industrial socket and isolation', 'Industrial', 'Routine',
    'An industrial five-contact outlet carries three phases, neutral and protective earth separately. Matching equipment mechanically does not prove correct electrical assignments.',
    'The linked isolator takes each phase and neutral through corresponding contacts. Its outputs supply socket L1/L2/L3/N, and socket PE connects independently to the protective network.',
    'Inspect each named socket contact, then open linked isolation. Compare all active output paths together instead of switching only one phase.',
    'Measure each phase to neutral and each phase pair. PE is neither a fourth load phase nor the normal neutral return.',
    'phase-loss', 'An industrial outlet has two available phases and one missing phase.', 'Measure every phase contact relative to neutral rather than testing only one pair.', 'One available measurement does not establish a complete three-phase supply. Identifying the missing phase requires inspecting all assigned active contacts.',
    ['All three phase contacts have supply in the intact template.', 'Opening socket-isolation interrupts the linked active paths.']],
  ['Three-phase DOL motor starter', 'Industrial', 'Routine',
    'A direct-on-line starter connects all three motor supply paths together when its coil is permitted. Auxiliary contacts maintain operation after a momentary start request.',
    'Three phases pass through contactor power poles and overload current paths to motor U1/V1/W1. U2/V2/W2 are externally star linked. Stop NC and overload 95/96 interrupt the shared coil holding circuit.',
    'Press Start and release it. Observe held operation, then press Stop. Apply overload and inspect whether its auxiliary path causes coil dropout, rather than assuming the overload itself is a power isolator.',
    'Measure coil phase-neutral voltage and separate phase currents. Steady-state impedance and pickup are represented; starting inrush, torque and actual trip curves are not predicted.',
    'wrong-control', 'The starter drops out as soon as Start is released.', 'Inspect 13/14 holding feedback and the common stop/overload path.', 'A missing holding route prevents maintained coil supply. Correct feedback must remain downstream of the shared stop/overload inhibition.',
    ['Start release does not stop a correctly held starter.', 'Stop or overload auxiliary interruption removes the coil request.']],
  ['Interlocked forward/reverse motor starter', 'Industrial', 'Routine',
    'Changing three-phase sequence can reverse a suitable motor. Opposing commands must be excluded to prevent simultaneous conflicting power connections.',
    'Forward contactor preserves the phase order; reverse swaps two phases at its inputs. Each coil command passes through the other contactor NC auxiliary. The motor ends are externally star linked. Reciprocal mechanical-pair settings enforce physical exclusion separately from the electrical NC interlocks.',
    'Select forward, press Start and release it. Press Stop before changing to reverse, then start again. Inspect the phase routing and mutually exclusive contactor states. The engine enforces the declared mechanical pairing: an already engaged partner blocks pickup, and conflicting simultaneous fresh requests are blocked with a diagnostic.',
    'Phase voltage magnitudes can remain similar while phase sequence changes. Direction depends on phase relationship, not a positive/negative single-phase voltage reading.',
    'wrong-control', 'A selected direction cannot pick up because its opposing interlock is incorrect.', 'Trace each command through the other contactor 21/22.', 'Opposing NC feedback inhibits pickup when the other direction is active. Incorrect routing can prevent legitimate starts or defeat exclusion.',
    ['Forward and reverse have different phase assignments.', 'The electrical interlock prevents intended simultaneous direction pickup.']],
  ['Six-terminal star-delta motor starter', 'Industrial', 'Existing',
    'A compatible motor can start in one winding arrangement and transition to another through three contactors. Eligibility depends on its winding/nameplate requirements.',
    'Main supplies U1/V1/W1. Star contactor temporarily joins U2/V2/W2 at a star point. Delta contacts instead link winding ends to the next start terminal. Opposing NC auxiliaries inhibit star/delta overlap, and the engine separately enforces their declared reciprocal mechanical pairing.',
    'Press Start and inspect the initial connection. Advance the transition interval and compare the changed contactor paths. Stop must remove the main request and all derived transition permissions.',
    'Compare winding-pair voltage in star and delta, not just supply phase-neutral readings. Transition dynamics and motor starting torque are outside this steady-state model.',
    'wrong-control', 'The transition does not produce the expected distinct winding connection.', 'Inspect star-point paths, delta cross-links and timer changeover logic.', 'Star and delta are different physical winding networks. A terminal/nameplate mismatch or overlapping contactors cannot be corrected by changing the displayed voltage label.',
    ['Star and delta use distinct external winding-end paths.', 'Opening main control removes its derived transition permission.']],
  ['VFD-fed motor and run interface', 'Industrial', 'Equipment dependent',
    'A variable-frequency drive converts the incoming supply to a controlled motor output. Run permission and output frequency are different from supply isolation.',
    'L1/L2/L3/PE feed the drive. U/V/W supply the externally linked motor windings; COM and RUN form the stated control interface. Input phases are not directly wired through as motor output contacts.',
    'Enable RUN, change frequency and inspect motor/output state. Remove RUN while input supply remains. Compare that inhibition with disconnecting the input supply.',
    'Output measurements describe a fundamental RMS abstraction, not actual PWM switching. Frequency changes are not a validated torque, inertia or thermal prediction.',
    'wrong-control', 'The drive has input power but no enabled output.', 'Inspect the RUN permission and frequency/on settings.', 'An available drive supply does not establish a run request. The exact control voltage and input mode must follow manufacturer documentation.',
    ['Removing run permission inhibits the represented motor output.', 'Drive input and motor output use distinct terminal sets.']],
  ['Staged three-phase heater bank', 'Industrial', 'Equipment dependent',
    'A heater bank can add independently commanded three-phase stages. A common safety limit must inhibit every stage regardless of temperature demand.',
    'Two contactors each supply a three-element phase-neutral bank. Their coils receive individual thermostat demands through one common independent safety contact.',
    'Enable one stage, then both and compare demand. Open the common safety limit and confirm both contactors lose request even while both thermostats still demand heat.',
    'Each active stage distributes demand across its three represented branches. The stages add power; real heater connections, thermal limits and control hysteresis depend on equipment.',
    'wrong-control', 'A stage remains requested after the common limit opens.', 'Trace both coil permissions through the same safety contact.', 'A bypassed common safety path defeats the intended all-stage inhibition. Correcting only one thermostat cannot restore that shared function.',
    ['Enabling a second stage increases total power.', 'Opening safety inhibits both stage coil requests.']],
  ['Motor control from two stations', 'Industrial', 'Routine',
    'Several locations can share a maintained starter: start permissions are parallel while stop inhibitions are series. Any stop station must interrupt the common holding path.',
    'Start A/B NO contacts join the coil-request node. Stop A/B NC contacts lie in the common series feed before start/holding branches. The overload auxiliary also remains in that common path.',
    'Start from station A and release it; stop from B. Start from B and stop from A. Inspect the hold path while each button is released.',
    'Coil voltage is the useful state measurement; a released start button does not imply the motor is stopped. Compare the effect of either stop contact on the same coil.',
    'wrong-control', 'A remote stop fails to stop a held motor.', 'Check whether the stop contact is truly in the common series feed.', 'A stop placed only in one start branch cannot interrupt the holding route. Series stop placement is the important topology difference.',
    ['Either start station can initiate held operation.', 'Either stop station interrupts the same held coil path.']],
  ['Sequential two-motor conveyor control', 'Industrial', 'Equipment dependent',
    'An upstream conveyor can require downstream operation before starting. The running feedback is a permissive that also removes upstream demand when downstream operation stops.',
    'Each motor has its own power starter and overload path. Downstream 13/14 supplies the upstream start/hold circuit, so the second motor request depends on the first starter state.',
    'Try upstream Start while downstream is stopped. Start downstream, then start upstream. Stop downstream and inspect both starter states.',
    'Compare the upstream permission voltage with downstream auxiliary state. This is a two-motor sequence abstraction, not a complete conveyor safeguarding design.',
    'wrong-control', 'The upstream motor can start without downstream operation.', 'Inspect the upstream common feed from downstream running feedback.', 'Bypassing the permissive erases the intended sequence. Correct feedback makes the upstream holding path dependent on downstream running state.',
    ['Upstream cannot pick up from its start button with downstream stopped.', 'Stopping downstream removes upstream common permission.']],
  ['Duty/standby pumps and high-level assist', 'Industrial', 'Equipment dependent',
    'One selected duty pump can handle ordinary level demand while high-level assist requests both pumps. Selection and assist are separate logic functions.',
    'Normal level output feeds a duty selector. Each selected output joins its pump’s assist OR bus; the high-level output joins both buses. Separate contactors and overload power paths feed the motors.',
    'Run normal level with duty A, then select B. Enable high-level assist and inspect both starter requests. Remove normal level while assist remains to compare the alternate request paths.',
    'Compare pump currents and total power in duty-only and assist modes. Automatic alternation is represented by an explicit selectable duty state, not a hidden controller algorithm.',
    'wrong-control', 'Changing duty selection does not transfer the ordinary pumping request.', 'Inspect the normal-level selector paths separately from high-level assist.', 'An active assist can legitimately request both pumps regardless of duty. Diagnose selection with assist removed so the normal routing is observable.',
    ['Normal level with duty A requests pump A rather than B.', 'High-level assist requests both pump starters.']],
  ['PLC permissives and motor output interface', 'Industrial', 'Equipment dependent',
    'A PLC maps sensor conditions to output permission. It needs an operating supply, referenced input signals and an output interface that can command a contactor.',
    'An isolated control supply powers the controller. Two sensor interfaces supply I1/I2; COM supplies the output contact domain. Q1 commands the motor contactor, while Q2 provides a distinct status path.',
    'Run with both permissives present. Remove one input and observe the AND-controlled output. Interrupt the controller supply and distinguish it from a missing input request.',
    'Compare controller supply voltage, input states and coil voltage. The logic mode is explicitly stated; it does not reconstruct a real PLC programme or certify I/O compatibility.',
    'wrong-control', 'The controller is powered but the motor command remains inhibited.', 'Inspect both permissives and the output-contact supply domain.', 'A false input or missing output COM supply can prevent command even when controller electronics are powered. Identify the actual absent condition before changing logic.',
    ['With AND mode, either absent permissive can inhibit Q1.', 'The output interface commands a separate contactor power path.']],
  ['Conceptual safety relay and monitored machine starter', 'Industrial', 'Advanced',
    'A safety-related control interface may inspect two channels, reset and contactor feedback. These checks have distinct purposes and are separate from ordinary Start/Stop operation.',
    'An isolated control supply powers the relay. Two normally closed input channels enter S1/S2; RESET receives a momentary request and FB follows a contactor NC auxiliary. OUT supplies the ordinary start/stop permission chain.',
    'Inspect both channels and feedback with the motor stopped. Use reset according to the stated model, then start. Open either channel and inspect permission loss. Restoring/resetting permission must remain distinct from an ordinary motor start request.',
    'Measure the low-voltage relay supply and the contactor coil domain separately. The feedback state is diagnostic evidence, not proof of a real safety performance level.',
    'wrong-control', 'The machine permission cannot arm because a channel or feedback condition is absent.', 'Inspect S1, S2, RESET and FB as four different functions.', 'A permissive state machine can correctly refuse operation when feedback or a channel is absent. This teaching abstraction cannot establish machinery safety compliance or justify bypassing an input.',
    ['Opening either represented channel removes safety permission.', 'Reset/arming remains separate from the ordinary start button.']],
];

interface ChallengeTarget {
  component?: string;
  path?: [Node, Node];
  briefing?: string;
  hint?: string;
  answer?: string;
}
/** Exact conductor/device targets make each authored symptom reproducible rather than heuristic. */
const CHALLENGE_TARGETS: Record<number, ChallengeTarget> = {
  1: { path: [['branch', 'OUT'], ['light', 'L']] },
  2: { component: 'load1' },
  3: { component: 'load1' },
  4: { path: [['remote', 'NOUT'], ['board', 'N']] },
  5: { path: [['supply', 'PE'], ['spd', 'PE']] },
  6: { path: [['monitor', 'OUT'], ['shed', 'A1']], briefing: 'Activate the demand monitor. The priority load stays supplied, but the secondary load incorrectly remains operating.', hint: 'Compare the monitor output with the relay coil voltage.', answer: 'The monitor-to-coil conductor is open. Its output can request shedding without energizing the coil, so the relay NC contact continues to supply the secondary load.' },
  7: { path: [['switch', 'OUT'], ['light', 'L']] },
  8: { path: [['protect', 'NOUT'], ['light-b', 'N']] },
  9: { path: [['near', 'T1'], ['far', 'T1']], answer: 'One traveller conductor is open. Some handle combinations may still connect through the other traveller, but the intended four-state truth table is no longer intact.' },
  10: { path: [['middle', 'C'], ['far', 'T1']], answer: 'One outgoing traveller from the intermediate switch is open. Trace both straight/crossed states to find which complete route is missing.' },
  11: { component: 'zone-a', briefing: 'A short circuit on zone A operates the common protection and removes both lighting zones.', hint: 'Compare the branch fault location with the protective device shared by both zones.', answer: 'The injected line-to-neutral short is on zone A. Both zones share the upstream RCBO, so interruption can affect both even though their wall-switch outputs are independent.' },
  12: { path: [['protect', 'LOUT'], ['dimmer', 'COM']], briefing: 'The dimmer handle and level setting change, but the luminaire stays dark.', hint: 'Compare the supply available before the dimmer with its COM input.', answer: 'The line feeding dimmer COM is open. A control setting cannot produce a load output without the actual incoming path; this fault is an open control/supply route, not a simulated incompatibility or bypass.' },
  13: { path: [['driver', '-'], ['led', 'N']], answer: 'The negative output-return conductor is open. Here the shared open-neutral challenge category means an open normal return: the actual conductor is DC−, not mains neutral. Restore the isolated output pair rather than joining it to mains N.' },
  14: { path: [['pir', 'OUT'], ['occupancy-hold', 'IN']], answer: 'The motion request cannot reach the timer IN because that conductor is open. After any retained run-on interval expires, the lamp has no request even though both devices remain powered.' },
  15: { path: [['protect', 'LOUT'], ['photo', 'IN']], briefing: 'Darkness demand is selected and the photocell is powered, but the exterior lamp remains off.', hint: 'Inspect the photocell enabling input independently of L/N power.', answer: 'The photocell IN permission conductor is open. Its environmental condition can be true while the separate wired enable remains false, so its output stays inhibited.' },
  16: { path: [['manual', 'OUT'], ['smart', 'IN']] },
  17: { path: [['socket-b', 'L'], ['socket-c', 'L']] },
  18: { path: [['socket-c', 'L'], ['protect', 'LOUT']] },
  19: { component: 'fixed' },
  20: { path: [['fuse', 'OUT'], ['fixed', 'L']] },
  21: { path: [['grid-a', 'OUT'], ['outlet-a', 'L']], briefing: 'Grid A is closed, but its labelled remote outlet A has no operating supply; outlet B still works.', hint: 'Measure on both ends of the grid-A output conductor.', answer: 'The labelled A output conductor is open. The intended mapping is correct, but a closed handle cannot restore a discontinuous route to the remote outlet.' },
  22: { path: [['supply', 'PE'], ['appliance', 'PE']] },
  23: { path: [['local', 'LOUT'], ['flow-permission', 'COM']], briefing: 'Local isolation and the represented flow contact are closed, but the shower receives no heating supply.', hint: 'Inspect the connection from isolator output to the permission contact input.', answer: 'The line into the represented flow-permission path is open. A closed contact can only pass an available supply; the fault does not mean it should be bypassed.' },
  24: { path: [['isolation', '-'], ['shaver', 'N']], answer: 'The separated secondary return conductor is open. The challenge uses the open-neutral category for that interrupted output return; it is not the incoming mains neutral. Restore the output pair without adding a mains-neutral bond.' },
  25: { path: [['stat', 'OUT'], ['safety', 'COM']], briefing: 'Ordinary heating demand is present, but no supply reaches the independent cut-out input.', hint: 'Inspect the conductor between operating thermostat output and safety-contact input.', answer: 'The connection from stat OUT to safety COM is open. Both contacts may be closed while their series connection remains incomplete, preventing element operation.' },
  26: { path: [['selector', 'A'], ['sink-stat', 'COM']], briefing: 'Sink mode is selected, but its short element remains off; switching to bath can still operate the other branch.', hint: 'Inspect selector A to the sink-thermostat input.', answer: 'The selected sink-path conductor is open. The intact bath branch can still operate, so branch continuity must be assessed separately from selector state.' },
  27: { path: [['schedule', 'OUT'], ['permission', '1']], briefing: 'Open manual boost and enable the schedule. The timer output is active, but the immersion remains off; closing boost can mask the fault.', hint: 'Test the scheduled request while the alternative boost path is absent.', answer: 'The schedule-to-OR-connector conductor is open. Manual boost can still energize the common thermostat input, so it must be disabled to expose the failed scheduled path.' },
  28: { path: [['room', 'OUT'], ['boiler', 'L']], answer: 'The conductor from room-thermostat output to boiler demand is open. The programme and thermostat can both request heat while the actual final demand route remains discontinuous.' },
  29: { path: [['heating-valve', 'END'], ['end-bus', '1']], briefing: 'Remove cylinder demand and request heating only. The heating valve opens, but boiler demand never follows.', hint: 'Observe valve position and END output before inspecting the feedback conductor to the OR bus.', answer: 'The heating-valve END conductor is open. Its valve can open correctly while the heat-source request is missing. A second zone demand can mask this feedback fault, so isolate the alternative request in the exercise.' },
  30: { path: [['room', 'OUT'], ['mid-valve', 'CH']], briefing: 'Both thermostats request heat, but the valve selects hot-water-only instead of the combined position.', hint: 'Compare the room-thermostat output with the CH input at the valve.', answer: 'The CH demand conductor is open, leaving the valve with only the HW input. The valve therefore follows the remaining request rather than the intended combined state.' },
  31: { path: [['probe', 'OUT'], ['room', 'COM']], answer: 'The floor-permission output conductor into room COM is open. Room demand cannot energize the mat without that upstream permission route, even when the measured floor condition itself permits heat.' },
  32: { path: [['room-a', 'OUT'], ['centre', 'I1']], briefing: 'Room A requests heat but actuator A does not open. Room B and the circulation permission may still operate.', hint: 'Compare the room-A contact output with controller input I1.', answer: 'The I1 request conductor is open. The wiring centre receives no A request while its independent B channel can still operate and provide opened-actuator pump feedback.' },
  33: { path: [['offpeak', 'OUT'], ['charge-stat', 'COM']], briefing: 'Charge permission is selected but the storage element remains off; the separately supplied daytime fan still operates.', hint: 'Compare the timer output with charge-thermostat input.', answer: 'The charge-permission conductor is open. The independent daytime release path is intact, so fan operation does not prove the charging path is complete.' },
  34: { path: [['room', 'OUT'], ['demand', 'A1']] },
  35: { path: [['protect', 'NOUT'], ['fan', 'N']] },
  36: { path: [['light-switch', 'OUT'], ['fan-isolation', 'L2IN']], briefing: 'Permanent timer supply is available, but operating the lighting switch never delivers a fan trigger.', hint: 'Trace the separately isolated trigger through L2IN/L2OUT to timer IN.', answer: 'The trigger conductor entering fan isolation is open. Maintained L/N power remains available, but there is no trigger for normal operation or renewed run-on.' },
  37: { path: [['humidity', 'OUT'], ['or', '1']], briefing: 'Open manual override and enable humidity demand. The fan remains off, although closing override can still run it.', hint: 'Inspect the automatic-request route separately from the parallel manual path.', answer: 'The humidity-to-OR-connector conductor is open. The parallel override can conceal this broken automatic request by supplying the same joined output.' },
  38: { path: [['request', 'OUT'], ['pump-contactor', 'A1']] },
  39: { path: [['protect', 'LOUT'], ['dry-run', 'A1']], answer: 'The dry-run permission relay coil feed is open. Its NO power contact remains open, so a valid pressure request and closed pump contactor cannot supply the downstream pump.' },
  40: { path: [['starter', '14'], ['starter', 'A1']] },
  41: { path: [['limit-up', 'OUT'], ['down', '21']], briefing: 'Up is selected and its limit contact is closed, but the up-direction coil cannot pick up.', hint: 'Trace the upper-limit output through the opposing contactor NC interlock.', answer: 'The upper-limit output conductor into the opposing NC interlock is open. The selected command therefore cannot reach the up coil; the fault is path continuity rather than a motor L/N reversal.' },
  42: { path: [['protect', 'LOUT'], ['smoke', 'L']] },
  43: { path: [['tx', '+'], ['push', 'COM']], answer: 'The transformer-output feed to push COM is open. In this separated low-voltage loop, open-live identifies the feed discontinuity rather than a break in the incoming mains line. A healthy transformer output cannot operate the chime through an incomplete push loop.' },
  44: { path: [['protect', 'LOUT'], ['emergency', 'L']] },
  45: { path: [['normal-switch', 'OUT'], ['emergency', 'SL']] },
  46: { path: [['load-control', 'OUT'], ['permission', 'A1']], answer: 'The load-control output conductor to the charge-permission coil is open. The controller can request charging but the interface never receives the coil supply needed to close its power contact.' },
  47: { path: [['pv-isolator', 'LOUT'], ['inverter', 'L']] },
  48: { path: [['inverter', 'BN'], ['essential', 'N']] },
  49: { path: [['hours', 'OUT'], ['dark', 'IN']], briefing: 'Trading-hours and darkness permissions are selected, but the signage bank remains dark.', hint: 'Compare the hours output with the separate enable input at the photocell.', answer: 'The hours-to-photocell enabling conductor is open. Darkness alone cannot produce the intended AND request when that wired permission is absent.' },
  50: { path: [['defrost-clock', 'OUT'], ['defrost', 'A1']], briefing: 'Enable defrost. The compressor continues cooling and the defrost heater remains off despite the timer request.', hint: 'Compare the timeclock output with defrost relay A1–A2.', answer: 'The timeclock-to-coil conductor is open. The relay stays released, leaving the NC cooling path available and the NO defrost path open.' },
  51: { path: [['compressor-k', '2'], ['unload', 'A1']], answer: 'The motor-state feed to the unloader relay coil is open. Its NC unloading indication remains supplied while the compressor runs, reversing the intended correspondence between running and unloading.' },
  52: { path: [['run-bus', '3'], ['beam', 'COM']], briefing: 'Direction and travel-limit permissions are present, but no supply reaches the beam-permission contact and the gate stays stopped.', hint: 'Compare the permitted run bus with beam COM and OUT.', answer: 'The run-bus-to-beam-input conductor is open. Even a closed beam contact cannot pass an unavailable input; do not bypass that safety-input interface to conceal the discontinuity.' },
  53: { path: [['protect', 'L3OUT'], ['phase-load3', 'L']] },
  54: { path: [['socket-isolation', 'L3OUT'], ['socket', 'L3']] },
  55: { path: [['starter', '14'], ['starter', 'A1']] },
  56: { path: [['direction', 'A'], ['reverse', '21']], briefing: 'Select forward and press Start. Maintained run permission picks up, but the forward contactor remains released.', hint: 'Follow selector A through reverse 21/22 before measuring the forward coil.', answer: 'The forward command conductor into the opposing NC interlock is open. Mechanical pairing remains valid, but the actual coil request cannot reach forward A1.' },
  57: { path: [['time-contact', 'NO'], ['star', '21']], briefing: 'Start the motor. The star stage works, but after the transition delay the delta stage never picks up.', hint: 'Trace the timed NO permission through the star NC auxiliary to the delta coil.', answer: 'The timed delta-command conductor is open. Star drops out at changeover, but delta receives no request, so the motor loses its complete winding connection after the timer transition.' },
  58: { path: [['run', 'OUT'], ['drive', 'RUN']] },
  59: { path: [['demand-b', 'OUT'], ['stage-b', 'A1']], briefing: 'Both temperature demands are present, but only stage A operates; stage B stays off.', hint: 'Compare the stage-B thermostat output with its contactor coil input.', answer: 'The stage-B coil request conductor is open. The common safety limit and stage-A route remain intact, so investigate the individual command rather than changing the shared limit.' },
  60: { path: [['stop-b', 'NC'], ['starter-ol', '95']], briefing: 'Both stop buttons are released, but neither start station can pick up the motor.', hint: 'Check the series common stop feed before the overload and parallel start paths.', answer: 'The remote-stop output conductor into the common overload permission is open. Both starts and the holding contact depend on that shared series path, so neither station can establish coil supply.' },
  61: { path: [['downstream', '14'], ['stop-b', 'COM']], briefing: 'Start downstream first. It runs, but upstream cannot start despite its permissive sequence being requested.', hint: 'Measure downstream running feedback and then the upstream stop-chain input.', answer: 'The downstream-feedback conductor supplying the upstream common permission is open. A working downstream motor therefore does not deliver the electrical permissive needed by upstream Start or its holding route.' },
  62: { path: [['duty', 'A'], ['a-or', '1']], briefing: 'With assist inactive, normal level active and duty A selected, pump A stays off. Selecting B can still run pump B.', hint: 'Inspect the duty-A output route separately from the high-level assist contacts.', answer: 'The normal duty-A permission conductor is open. Its intact B alternative can still operate, and high-level assist can mask the failure by separately supplying A; inspect with assist absent.' },
  63: { path: [['present', 'OUT'], ['plc', 'I1']] },
  64: { path: [['starter', '22'], ['safety-relay', 'FB']], briefing: 'Begin stopped and unarmed. Both safety channels are present, but pressing Reset cannot arm the machine permission.', hint: 'Inspect the contactor NC feedback route independently of channels and Reset.', answer: 'The NC-feedback conductor into FB is open. The model refuses initial arming without that pre-start check. If already armed, interrupt a safety channel first and restore it before retrying Reset; feedback is a pre-start condition rather than a fabricated automatic running-trip rule.' },
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
  const roles = circuit.supply.phase === 'three'
    ? 'L1/L2/L3 are phase-displaced active conductors. Neutral is the phase-to-neutral return; protective earth is a separate network. A winding or phase-to-phase load must be measured across its actual two terminals.'
    : 'Line supplies the operating path; neutral returns normal load current. Protective earth is not a substitute neutral and successful operation does not verify its continuity.';
  return `${roles} Source impedance is ${circuit.supply.sourceResistance} Ω and each drawn conductor has an explicit ${circuit.wires[0]?.resistance ?? 0.01} Ω resistance. These finite educational values influence voltage drop and prospective fault response; they are not measured values for a real property.`;
}

function calculationNotes(circuit:CircuitDocument,fault:string):{beginner:string;apprentice:string} {
  const representative=circuit.components.find(c=>['lamp','led','heater','cooker','shower','socket','motor','motor3','pump','fan','boiler','heatpump','chime','emergency','alarm','indicator','ev'].includes(c.type));
  const format=(n:number)=>Number(n.toFixed(3));
  let worked='Use the voltage across the actual equipment terminals and the current through its actual supply branch.';
  if(representative){
    const p={...Registry.COMPONENTS[representative.type].defaults,...representative.params},watts=Number(p.watts??100),pf=['motor','motor3','pump','fan','heatpump'].includes(representative.type)?Number(p.powerFactor??.8):1;
    if(representative.type==='motor3'){
      const winding=Number(p.windingVoltage??230),windingCurrent=watts/(3*winding*pf);
      worked=`For ${representative.label}, the declared total winding load is ${format(watts)} W with power factor ${format(pf)} at ${format(winding)} V per winding. Iwinding = P / (3 × Vwinding × power factor) gives ${format(windingCurrent)} A. In star, winding voltage is line voltage / √3 and line current equals winding current; in delta, winding voltage equals line voltage and line current is √3 × winding current. Compare the actual links with this winding parameter before choosing a calculation.`;
    }else{
      const nominal=Number(p.ratedVoltage??p.nominalVoltage??240),r=Number(p.ohms??nominal*nominal/watts);
      worked=`For ${representative.label}, the declared ${format(watts)} W load at ${format(nominal)} V has ${pf===1?'R':'an equivalent base resistance'} = V² / P = ${format(r)} Ω. ${pf===1?`I = P / V gives ${format(watts/nominal)} A at that voltage. For a fixed resistance, P = V² / R; ${format(nominal*.5)} V would produce one quarter of the nominal power.`:`With power factor ${format(pf)}, I = P / (V × power factor) gives ${format(watts/(nominal*pf))} A. The model uses a complex impedance; P/V alone would understate RMS current.`} These values describe this illustrative load at its declared voltage, not a real appliance rating or the total current of every branch.`;
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
    'open-live':'With operating demand present, an interrupted series line path stops the load. A voltage drop across the break can be significant while branch current is approximately zero. A terminal stranded on an independent floating network can instead give an unresolved reading; do not invent zero volts.',
    'open-neutral':'An interrupted normal return can stop the load despite an available line. Some disconnected points float, so voltage relative to another circuit may be unresolved. Measure within a resolved pair, then isolate all sources and investigate continuity of the intended return.',
    'missing-earth':'Normal load voltage and current can remain close to the intact values. The failed finding concerns the actual protective network. Isolated continuity can show OL if no path remains, or a finite reading through another protective path; a finite reading does not prove this particular conductor is intact.',
    'open-cpc':'Normal load operation may remain unchanged. Investigate the complete protective path with all simulated sources isolated; account for alternative parallel connections before interpreting an OL or finite resistance.',
    'earth-fault':'Leakage creates an actual alternative return through the protective network. The illustrative residual device compares the vector sum of monitored active-conductor currents. Preserved pre-trip readings can show the imbalance after its contacts have opened; the displayed timing is not a manufacturer trip curve.',
    'short-circuit':'A low-impedance fault raises current according to the complete source and conductor impedance. I ≈ V / Zloop is only a first estimate. Use the preserved pre-trip current and affected path; an open breaker after the trip is the response, not the original defect.',
    'overload':'The declared load demand exceeds its ordinary value. Compare actual RMS current with the protective device setting and observe any accumulating educational delay. Resetting with the excessive demand still present causes the same fault response again.',
    'phase-loss':'One interrupted phase changes the actual winding voltages and currents. Remaining phases can still be present; the motor state is not proof that every phase is healthy. Compare all relevant phase and winding pairs and inspect the unbalance finding.',
    'wrong-control':'The power supply can remain available while an input, coil request or feedback path is missing. Compare the available feed with the voltage across the actual control input and its reference before replacing a load or changing unrelated parameters.',
    'stuck-contact':'A conducting path remains when the control requests separation. Compare output voltage in both commanded states and trace the actual bypass or represented stuck contact; an operating load is not evidence that the OFF objective passed.',
  };
  const supply=circuit.supply.phase==='three'?`At ${circuit.supply.voltage} V between phases, phase-to-neutral voltage is ${format(circuit.supply.voltage/Math.sqrt(3))} V. Balanced three-phase real power is P = √3 × Vline × Iline × power factor; unbalanced loads need their individual complex branch powers.`:`The selected supply is ${circuit.supply.voltage} V RMS. Changing a fixed-resistance load from 240 V to 230 V changes its power by (230/240)² ≈ ${format((230/240)**2)}, before the small source/conductor voltage drops.`;
  return {beginner:`${worked} ${supply}`,apprentice:`${worked}${conversion} ${supply} For each conductor, voltage drop follows the complex relation ΔV = I × Z; compare the measured equipment voltage with the available feed. Protective current is approximately zero during ordinary healthy operation, even when its path is present. ${abnormal[fault]??'Compare the reported abnormal state with the available supply, actual control demand and complete normal return, then isolate sources before continuity checks.'}`};
}

function createLesson(spec: Spec, index: number): ConfigurationLesson {
  const id = index + 1;
  const [title, category, tag, purpose, connections, sequence, measurement, fault, originalBriefing, originalHint, originalAnswer, checks] = spec;
  const circuit = buildCircuit(id, title);
  const target = CHALLENGE_TARGETS[id];
  if (!target) throw new Error(`Lesson ${id} has no exact challenge target`);
  const briefing = target.briefing ?? originalBriefing, hint = target.hint ?? originalHint, answer = target.answer ?? originalAnswer;
  const deviceNames = circuit.components.filter(c => c.id !== 'supply').map(c => `${c.label} (${c.id})`).join('; ');
  const connectionMap = circuit.wires.map(w => `${w.from.component}.${w.from.terminal} → ${w.to.component}.${w.to.terminal} [${w.role}]`).join('; ');
  const context = id >= 53 ? 'Industrial · Republic of Ireland · 400 V three phase / approximately 230 V phase-neutral'
    : id >= 49 ? 'Single-phase commercial equipment · Republic of Ireland · 240 V study setting'
    : 'Domestic / light commercial · Republic of Ireland · 240 V study setting';
  const caveat = tag === 'Equipment dependent' || tag === 'Advanced'
    ? 'Actual equipment terminals, protective requirements and operating sequences must come from its manufacturer and the current Irish rules. The named interface is a declared teaching abstraction, not a universal wiring diagram.'
    : tag === 'Existing' ? 'This is an encountered arrangement for comparison and interpretation. It is not a recommendation that a new Irish installation should use this topology. Current design, verification and manufacturer requirements decide suitability.'
    : 'The representative arrangement teaches circuit purpose and behaviour. Real design and verification additionally depend on location, installation method, supply characteristics and the actual equipment.';
  const references = [...IRISH];
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
    46:'myenergi describes current-transformer measurement and charging curtailment from a configured grid limit. This lesson exposes permission control only; it does not reproduce that charger’s CT algorithms, communication, DC leakage detection or earthing protection.',
    58:'ABB documents configurable drive inputs and motor outputs. This lab’s RUN–COM dry-contact loop and fundamental U/V/W outputs are declared abstractions. They do not reproduce an ACS355 macro, input numbering, PWM waveform or torque behaviour.',
    63:'Siemens documents control-supply budgets and shared references for real PLC I/O. This lab uses wired 24 V inputs and conceptual COM-to-Q contact outputs. Its I1/I2/Q1/Q2 map and AND logic are teaching interfaces, not a CPU wiring drawing.',
    64:'Pilz documents channel, reset and feedback arrangements for a real safety relay. This lab exposes those concepts through S1/S2/RESET/FB and a COM–OUT contact. Its state machine and terminal names do not establish a safety category, diagnostic coverage or performance level.',
  };
  return {
    id, title, category, tag, level: id <= 24 ? 'Foundation' : id < 53 ? 'Intermediate' : 'Advanced', context,
    summary: purpose,
    sections: [
      ...(id === 7 ? [{title:'Why a wrong connection can still light the lamp',beginner:'A lamp response is only one check. An extra wire between neutral-out and earth joins paths that have different purposes. The test flags that link even with the switch off. With the lamp on, this example can divert enough return current to trip its RCBO. A missing earth or reversed L/N can still leave the lamp operating while failing the wiring checks.',apprentice:'The solver calculates current from the actual endpoints and conductor resistance. A downstream N–PE connection places an alternative return outside the RCBO monitored neutral contact. Residual operation depends on the vector current imbalance and the declared threshold; a link with no diverted current does not cause an invented trip. The source reference bond is distinct from this added installation link. Run test checks the intact terminal map, rejects extra connections, opens and closes a copy of the switch, and compares lamp power and voltage. Copies preserve your controls and electrical topology.'}] : []),
      { title: 'Purpose and component roles', beginner: purpose, apprentice: `Inspect these actual connected devices: ${deviceNames}. ${caveat} A component's enclosure, operating mechanism, contacts and terminals have different purposes; use the cutaway and part hotspots to connect the physical model to the electrical function.` },
      { title: 'Connections and conductor paths', beginner: connections, apprentice: `${roleExplanation(circuit)} The complete editable terminal map is: ${connectionMap}. Every arrow is an actual graph connection used by the solver; visual proximity alone creates no connection.` },
      { title: 'Operating sequence and control logic', beginner: sequence, apprentice: `Follow the stated sequence with the simulator running and compare device states after each action. ${sequence} Contacts are evaluated from their actual coil/input paths; a hand-operated control, powered controller input, feedback contact and energy-source state are distinct causes. Where delays are present, advance simulated time and inspect events rather than assuming an immediate mechanical response.` },
      { title: 'Measurements and model limits', beginner: measurement, apprentice: `${measurement} Use a voltage pair across the actual load or winding, and use a selected conductor for current. Supply and load readings come from the solved network with ${circuit.supply.frequency} Hz and a ${circuit.supply.voltage} V preset. Power and current depend on declared parameters, conductor resistance, phase relationships and control state. Coil pickup, trip timing, conversion, electronics and rotating machinery use documented educational abstractions; this is not a commissioning instrument.` },
      {title:'Calculations and expected readings',...calculationNotes(circuit,fault)},
      ...(comparison[id]?[{title:'Manufacturer comparison and declared interface',beginner:comparison[id],apprentice:'Use the linked manufacturer document to compare the actual supply terminals, contact/output type and operating conditions with this model. Electrical terminal IDs in a study build are stable software identities. Real equipment compatibility, configuration, protection and verification remain equipment dependent.'}]:[]),
      { title: 'Fault-finding challenge', beginner: `${briefing} Hint: ${hint}`, apprentice: `${answer} Begin with the symptom, compare available supply with the complete normal return, then distinguish the control permission and protective path. Record the actual changed conductor or device setting. Clear the fault and reset any tripped simulated device only after the represented cause is removed; an apparently working load is not proof of protective correctness.` },
      { title: 'Irish context and real-work boundary', beginner: `${context}. Ireland's supply is nominally 230 V single phase at 50 Hz; the requested 240 V study setting lies within ESB's published range. ${caveat}`, apprentice: `Refer to current NSAI I.S. 10101 rules and the linked primary guidance, including amendments/corrections identified by NSAI. Restricted Electrical Works must be performed and certified by a Safe Electric Registered Electrical Contractor; workplace inspection/testing requires competent persons. This exercise checks its declared model, not a real installation. Cable sizes, installation methods, discrimination, earthing arrangements, measured loop impedance, insulation, equipment compatibility and statutory verification are not established by a green simulation result.` },
    ],
    steps: [
      'Open the 3D workbench and orbit the intact configuration. Select the supply and identify its active and protective terminals.',
      `Inspect the connected components: ${deviceNames}. Use focus, zoom and the part/cutaway view to identify each role.`,
      `Run the intact circuit. ${sequence}`,
      `Use the virtual probes and selected-wire current reading. ${measurement}`,
      ...checks.map(c => `Verify: ${c}`),
      `Inject the challenge, compare diagnostics with the conductor paths, and investigate: ${briefing}`,
      'Clear the fault, reset the affected simulated protection if necessary, then re-run the intact configuration and compare the result.',
    ],
    objectives: [...checks, 'Identify the normal-return path separately from the protective path using actual terminal labels.'],
    challenge: { title: `Diagnose: ${title}`, briefing, fault, hint, answer, ...challengeTarget(circuit, target) }, references, circuit,
  };
}

export const LESSONS: ConfigurationLesson[] = SPECS.map(createLesson);
export const getLesson = (id: number): ConfigurationLesson | undefined => LESSONS.find(lesson => lesson.id === id);

/** Structural validation is callable by integration checks; it has no runtime side effects. */
export function validateLessons(): string[] {
  const errors: string[] = [];
  if (LESSONS.length !== 64) errors.push(`Expected 64 lessons, received ${LESSONS.length}`);
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

