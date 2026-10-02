/**
 * Independent behavioural audit of the integrated lesson catalog and simulator.
 * Run from any directory with Node 24:
 *   node --experimental-transform-types lab/scripts/lesson-simulation-audit.ts
 *
 * Uses the same actual terminal graphs as the application. Assertions describe
 * externally observable circuit behaviour; they do not reproduce solver logic.
 * No browser, cloud, filesystem fixture or installed third-party package is used.
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS, validateLessons } from '../lib/lessons.ts';
import { simulate, measureVoltage } from '../lib/simulation.ts';
import type { CircuitDocument, ConfigurationLesson, DeviceState, Endpoint, SimulationResult, Wire } from '../lib/types.ts';

const STEP_SECONDS = 0.25;
const SETTLE_TICKS = 24; // Six seconds includes all declared demonstration delays.
const POWER_TOLERANCE = 0.05;
const VOLTAGE_TOLERANCE = 0.05;
type Check = { description: string; passed: boolean; actual?: unknown };
type Snapshot = {
  converged: boolean; nodes: number; totalPowerW: number; totalCurrentA: number;
  numericalErrors: { id: string; title: string; explanation: string }[];
  trippedDevices: string[];
  outputs: Record<string, { watts: number; energized: boolean; level: number; details: string }>;
};
const ROUND = (n: number) => Math.round(n * 1e6) / 1e6;
const LOAD_TYPES = new Set(['lamp', 'led', 'socket', 'socket3', 'heater', 'motor', 'motor3', 'pump', 'fan', 'cooker', 'shower', 'boiler', 'heatpump', 'chime', 'emergency', 'alarm', 'indicator', 'ev']);
const power = (r: SimulationResult, id: string) => r.componentPower[id] ?? 0;
const energized = (r: SimulationResult, id: string) => !!r.deviceStates[id]?.energized;
const closed = (r: SimulationResult, id: string) => !!r.deviceStates[id]?.closed;
const endpoint = (component: string, terminal: string): Endpoint => ({ component, terminal });

function snapshot(c: CircuitDocument, r: SimulationResult): Snapshot {
  return {
    converged: r.converged, nodes: r.nodes, totalPowerW: ROUND(r.totalPower), totalCurrentA: ROUND(r.totalCurrent),
    numericalErrors: r.diagnostics.filter(d => d.severity === 'error').map(({ id, title, explanation }) => ({ id, title, explanation })),
    trippedDevices: Object.entries(r.deviceStates).filter(([, s]) => s.tripped).map(([id]) => id),
    outputs: Object.fromEntries(c.components.filter(c => LOAD_TYPES.has(c.type)).map(c => [c.id, {
      watts: ROUND(power(r, c.id)), energized: energized(r, c.id), level: ROUND(r.deviceStates[c.id]?.level ?? 0), details: r.deviceStates[c.id]?.details ?? '',
    }])),
  };
}

class Exercise {
  circuit: CircuitDocument;
  result!: SimulationResult;
  checks: Check[] = [];
  actions: string[] = [];
  samples: { action: string; converged: boolean; numericalErrors: string[]; ticks: number }[] = [];
  states: Record<string, DeviceState> = {};
  constructor(lesson: ConfigurationLesson, voltage?: number) {
    this.circuit = structuredClone(lesson.circuit);
    if (voltage !== undefined) this.circuit.supply.voltage = voltage;
  }
  check(description: string, condition: boolean, actual?: unknown): void {
    // Assertion errors are retained per lesson, allowing the report to cover all 64.
    let passed = true;
    try { assert.ok(condition, description); } catch { passed = false; }
    this.checks.push({ description, passed, ...(actual === undefined ? {} : { actual }) });
  }
  set(id: string, key: string, value: string | number | boolean): void {
    const c = this.circuit.components.find(c => c.id === id);
    assert.ok(c, `Unknown test component ${id}`);
    c.params[key] = value;
    this.actions.push(`${id}.${key} = ${JSON.stringify(value)}`);
  }
  run(action: string, ticks = SETTLE_TICKS): SimulationResult {
    for (let i = 0; i < ticks; i++) {
      this.result = simulate(this.circuit, this.states, STEP_SECONDS);
      this.states = this.result.deviceStates;
    }
    const errors = this.result.diagnostics.filter(d => d.severity === 'error');
    this.samples.push({ action, converged: this.result.converged, numericalErrors: errors.map(e => `${e.id}: ${e.title}`), ticks });
    this.check(`${action}: settled result converges`, this.result.converged);
    this.check(`${action}: no numerical/model errors`, errors.length === 0, errors.map(e => e.title));
    return this.result;
  }
  on(id: string, message = `${id} receives operating load power`): void { this.check(message, power(this.result, id) > 1, ROUND(power(this.result, id))); }
  off(id: string, message = `${id} operating load power is interrupted`): void { this.check(message, Math.abs(power(this.result, id)) < POWER_TOLERANCE, ROUND(power(this.result, id))); }
  pulse(id: string, action: string): void {
    this.set(id, 'pressed', true); this.run(`${action}: press`, 3);
    this.set(id, 'pressed', false); this.run(`${action}: release`, 3);
  }
  voltage(a: Endpoint, b: Endpoint, expected?: number, tolerance = VOLTAGE_TOLERANCE): number | null {
    const measured = measureVoltage(this.result, a, b);
    this.check(`Voltage ${a.component}.${a.terminal} to ${b.component}.${b.terminal} is available`, measured.value !== null, measured);
    if (expected !== undefined) this.check(`Voltage pair approximates ${ROUND(expected)} V`, measured.value !== null && Math.abs(measured.value - expected) <= tolerance, measured);
    return measured.value;
  }
  wire(a: Endpoint, b: Endpoint): Wire {
    const eq = (x: Endpoint, y: Endpoint) => x.component === y.component && x.terminal === y.terminal;
    const w = this.circuit.wires.find(w => eq(w.from, a) && eq(w.to, b) || eq(w.from, b) && eq(w.to, a));
    assert.ok(w, `Missing test path ${a.component}.${a.terminal} to ${b.component}.${b.terminal}`);
    return w;
  }
}

/** Each case checks the distinct operating purpose of its intact authored graph. */
function verifyOperation(x: Exercise, id: number): void {
  const toggle = (component: string, load: string) => { x.on(load); x.set(component, 'closed', false); x.run(`Open ${component}`); x.off(load); };
  const starter = (start: string, stop: string, k: string, motor: string) => {
    x.check('Momentary starter begins stopped', !closed(x.result, k));
    x.pulse(start, `Start at ${start}`); x.on(motor); x.check('Starter holds after start release', closed(x.result, k));
    x.pulse(stop, `Stop at ${stop}`); x.off(motor); x.check('Stop removes maintained coil request', !closed(x.result, k));
  };
  switch (id) {
    case 1: toggle('main', 'light'); break;
    case 2: x.on('load1'); x.on('load2'); x.set('branch1', 'closed', false); x.run('Open one outgoing MCB'); x.off('load1'); x.on('load2', 'Other shared-group branch remains operating'); break;
    case 3: x.on('load1'); x.on('load2'); x.set('branch1', 'closed', false); x.run('Open one individual RCBO'); x.off('load1'); x.on('load2', 'Other independent RCBO branch remains operating'); break;
    case 4: toggle('remote', 'load'); break;
    case 5: x.on('load'); x.check('SPD is a negligible steady-state branch', Math.abs(power(x.result, 'spd')) < 0.05); break;
    case 6: x.on('priority'); x.on('secondary'); x.set('monitor', 'active', true); x.run('Request priority shedding'); x.on('priority'); x.off('secondary'); break;
    case 7: toggle('switch', 'light'); break;
    case 8: for (const c of ['light-a', 'light-b', 'light-c']) x.on(c); { const v = ['light-a', 'light-b', 'light-c'].map(c => x.voltage(endpoint(c, 'L'), endpoint(c, 'N'))); x.check('Parallel luminaires receive nearly equal voltages', v.every(n => n !== null) && Math.max(...v as number[]) - Math.min(...v as number[]) < .1); } break;
    case 9: x.on('light'); x.set('near', 'position', 1); x.run('Change first two-way switch'); x.off('light'); x.set('far', 'position', 1); x.run('Change second two-way switch'); x.on('light'); break;
    case 10: x.on('light'); x.set('middle', 'position', 1); x.run('Cross intermediate travellers'); x.off('light'); x.set('far', 'position', 1); x.run('Change end switch with crossed travellers'); x.on('light'); break;
    case 11: x.set('gang-a', 'closed', false); x.run('Open only lighting gang A'); x.off('zone-a'); x.on('zone-b'); break;
    case 12: { x.set('dimmer', 'level', .25); x.run('Set low dimmer level'); const low = power(x.result, 'light'); x.set('dimmer', 'level', .9); x.run('Set high dimmer level'); x.check('Higher dimmer level increases actual connected lamp power', power(x.result, 'light') > low * 2, { low, high: power(x.result, 'light') }); break; }
    case 13: x.on('led'); x.voltage(endpoint('driver', '+'), endpoint('driver', '-'), 24, .1); break;
    case 14: x.on('light'); x.set('pir', 'active', false); x.run('Remove motion request, within run-on', 2); x.on('light', 'Lamp remains on during four-second run-on'); x.run('Allow occupancy run-on to expire'); x.off('light'); break;
    case 15: x.on('light'); x.set('photo', 'active', false); x.run('Remove photocell darkness demand'); x.off('light'); break;
    case 16: toggle('manual', 'light'); break;
    case 17: { for (const c of ['socket-a', 'socket-b', 'socket-c']) x.on(c); const first = x.wire(endpoint('protect', 'LOUT'), endpoint('socket-a', 'L')); const last = x.wire(endpoint('socket-b', 'L'), endpoint('socket-c', 'L')); const magnitude = (w: Wire) => { const n = x.result.wireCurrents[w.id]; return n ? Math.hypot(n.re, n.im) : 0; }; x.check('First radial segment carries more current than last segment', magnitude(first) > magnitude(last), { firstA: magnitude(first), lastA: magnitude(last) }); break; }
    case 18: { x.on('socket-a'); x.on('socket-c'); const returning = x.wire(endpoint('socket-c', 'L'), endpoint('protect', 'LOUT')); const n = x.result.wireCurrents[returning.id]; x.check('Intact ring returning line leg carries current', !!n && Math.hypot(n.re, n.im) > .1); break; }
    case 19: x.on('fixed'); x.on('socket-a'); x.set('branch-fuse', 'closed', false); x.run('Open only fused branch'); x.off('fixed'); x.on('socket-a'); break;
    case 20: toggle('fcu-switch', 'fixed'); break;
    case 21: x.set('grid-a', 'closed', false); x.run('Isolate remote appliance A only'); x.off('outlet-a'); x.on('outlet-b'); break;
    case 22: toggle('local', 'appliance'); break;
    case 23: toggle('flow-permission', 'appliance'); break;
    case 24: x.on('shaver'); x.voltage(endpoint('isolation', '+'), endpoint('isolation', '-'), 230, 1); break;
    case 25: x.on('element'); x.set('stat', 'closed', false); x.run('Remove ordinary thermostat demand'); x.off('element'); x.set('stat', 'closed', true); x.set('safety', 'closed', false); x.run('Open independent thermal limit with demand present'); x.off('element'); break;
    case 26: x.on('sink'); x.off('bath'); x.set('selector', 'position', 1); x.run('Select bath element'); x.off('sink'); x.on('bath'); break;
    case 27: x.set('schedule', 'on', false); x.set('boost', 'closed', false); x.run('Remove both immersion requests'); x.off('element'); x.set('boost', 'closed', true); x.run('Restore manual boost only'); x.on('element'); break;
    case 28: toggle('room', 'boiler'); break;
    case 29: x.on('boiler'); x.set('cylinder', 'closed', false); x.run('Retain heating demand only'); x.check('Heating valve opened', closed(x.result, 'heating-valve')); x.check('Water valve returned closed', !closed(x.result, 'water-valve')); x.on('boiler'); x.set('room', 'closed', false); x.run('Remove both zone demands'); x.off('boiler'); break;
    case 30: x.check('Combined demand selects mid position', x.result.deviceStates['mid-valve'].level === .5); x.set('room', 'closed', false); x.run('Hot-water demand only'); x.check('HW-only selects position zero', x.result.deviceStates['mid-valve'].level === 0); x.on('boiler'); x.set('room', 'closed', true); x.set('cylinder', 'closed', false); x.run('Heating demand only'); x.check('Heating-only selects position one', x.result.deviceStates['mid-valve'].level === 1); x.on('boiler'); x.set('room', 'closed', false); x.run('Remove both mid-position valve demands'); x.off('boiler'); break;
    case 31: x.on('mat'); x.set('probe', 'sensorValue', 40); x.run('Floor condition exceeds permission setpoint'); x.off('mat'); break;
    case 32: x.set('room-a', 'closed', false); x.run('Remove room A demand only'); x.check('Actuator A closes independently', !closed(x.result, 'actuator-a')); x.check('Actuator B remains open', closed(x.result, 'actuator-b')); x.on('pump'); x.set('room-b', 'closed', false); x.run('Remove both manifold demands'); x.off('pump'); break;
    case 33: x.set('offpeak', 'on', false); x.run('Remove charge-window permission'); x.off('store'); x.on('day'); x.set('release', 'closed', false); x.run('Remove separate daytime release'); x.off('day'); break;
    case 34: toggle('local', 'unit'); break;
    case 35: toggle('switch', 'fan'); break;
    case 36: x.on('fan'); x.set('light-switch', 'closed', false); x.run('Remove trigger within fan run-on', 2); x.on('fan', 'Fan retains supply during five-second run-on'); x.run('Allow fan run-on to expire'); x.off('fan'); break;
    case 37: x.set('humidity', 'active', false); x.set('override', 'closed', false); x.run('Remove humidity and manual requests'); x.off('fan'); x.set('override', 'closed', true); x.run('Manual override only'); x.on('fan'); break;
    case 38: case 39: x.on('pump'); x.set('request', 'active', false); x.run('Remove level/pressure demand'); x.off('pump'); break;
    case 40: starter('start', 'stop', 'starter', 'motor'); break;
    case 41: x.check('Up command operates only up interface', closed(x.result, 'up') && !closed(x.result, 'down')); x.set('direction', 'position', 1); x.run('Select down interface'); x.check('Down command operates only down interface', !closed(x.result, 'up') && closed(x.result, 'down')); x.set('limit-down', 'closed', false); x.run('Open selected down travel limit'); x.off('operator'); break;
    case 42: x.set('smoke', 'alarm', true); x.run('Trigger one interlinked smoke alarm'); x.check('Wired heat alarm receives conceptual interlink request', x.result.deviceStates.heat.level === 1); { const w = x.wire(endpoint('smoke', 'LINK'), endpoint('heat', 'LINK')); x.circuit.faults = [{ type: 'wrong-control', wire: w.id, enabled: true }]; x.run('Open interlink signal conductor'); x.check('Separated peer loses interlink request', x.result.deviceStates.heat.level === 0); } break;
    case 43: x.off('chime'); x.pulse('push', 'Doorbell push'); x.off('chime'); x.set('push', 'pressed', true); x.run('Hold doorbell push'); x.on('chime'); break;
    case 44: x.check('Non-maintained standby is not illuminated', !energized(x.result, 'emergency')); x.circuit.supply.enabled = false; x.run('Remove monitored emergency supply'); x.check('Battery-backed emergency illumination begins', !!x.result.deviceStates.emergency.emergencyActive && energized(x.result, 'emergency')); break;
    case 45: x.check('Maintained SL request illuminates normally', !!x.result.deviceStates.emergency.normalActive); x.set('normal-switch', 'closed', false); x.run('Remove maintained normal-light SL request'); x.check('Normal light stops while mains remains', !energized(x.result, 'emergency') && !x.result.deviceStates.emergency.emergencyActive); x.circuit.supply.enabled = false; x.run('Remove monitored mains with SL off'); x.check('Emergency illumination remains independently available', !!x.result.deviceStates.emergency.emergencyActive); break;
    case 46: x.on('evse'); x.set('load-control', 'active', false); x.run('Remove charge permission'); x.off('evse'); break;
    case 47: { const initial = x.result.totalPower; x.set('inverter', 'availability', 0); x.run('Remove solar availability'); x.check('Removing generation increases net grid import', x.result.totalPower > initial + 400, { withGenerationW: initial, withoutGenerationW: x.result.totalPower }); x.circuit.supply.enabled = false; x.run('Remove external grid'); x.check('Grid-following inverter detects external grid absence', x.result.deviceStates.inverter.gridPresent === false); x.off('home'); break; }
    case 48: x.circuit.supply.enabled = false; x.run('Remove grid with battery available'); x.on('essential'); x.off('ordinary'); break;
    case 49: x.on('letters-a'); x.set('hours', 'on', false); x.run('Remove trading-hours permission'); x.off('letters-a'); x.off('letters-b'); break;
    case 50: x.on('compressor'); x.off('defrost-heat'); x.set('defrost-clock', 'on', true); x.run('Request defrost mode'); x.off('compressor'); x.on('defrost-heat'); break;
    case 51: x.on('compressor'); x.off('unloader'); x.set('pressure', 'active', false); x.run('Stop compressor at satisfied pressure'); x.off('compressor'); x.on('unloader'); break;
    case 52: toggle('beam', 'operator'); break;
    case 53: for (const c of ['phase-load1', 'phase-load2', 'phase-load3']) x.on(c); { const pn = x.voltage(endpoint('supply', 'L1'), endpoint('supply', 'N')); const pp = x.voltage(endpoint('supply', 'L1'), endpoint('supply', 'L2')); x.check('Loaded phase-to-phase voltage exceeds phase-neutral voltage', pn !== null && pp !== null && pp > pn * 1.7); } break;
    case 54: x.check('All five-contact outlet active phases are available', energized(x.result, 'socket')); x.set('socket-isolation', 'closed', false); x.run('Open linked industrial socket isolation'); x.check('Linked isolation removes outlet operating state', !energized(x.result, 'socket')); break;
    case 55: starter('start', 'stop', 'starter', 'motor'); break;
    case 56: x.check('Direction starter begins stopped', !energized(x.result, 'motor')); x.pulse('start', 'Start forward'); x.check('Forward phase sequence is observed', x.result.deviceStates.motor.direction === 1); x.check('Paired direction contactors never overlap', !(closed(x.result, 'forward') && closed(x.result, 'reverse'))); x.pulse('stop', 'Stop before reversal'); x.set('direction', 'position', 1); x.pulse('start', 'Start reverse'); x.check('Reverse phase sequence is observed', x.result.deviceStates.motor.direction === -1); x.check('Reverse contactor is mechanically paired to forward', x.circuit.components.find(c => c.id === 'reverse')?.params.mechanicallyInterlockedWith === 'forward'); break;
    case 57: x.set('start', 'pressed', true); x.run('Start before star-delta delay', 2); x.check('Initial star connection operates without delta overlap', closed(x.result, 'star') && !closed(x.result, 'delta')); x.set('start', 'pressed', false); x.run('Advance star-delta transition'); x.check('Timed delta connection operates after star release', !closed(x.result, 'star') && closed(x.result, 'delta')); x.check('Motor has representative 400 V winding eligibility', x.circuit.components.find(c => c.id === 'motor')?.params.windingVoltage === 400); x.on('motor'); break;
    case 58: x.on('motor'); x.check('Drive motor reports selected 35 Hz fundamental', Math.abs(Number(x.result.deviceStates.motor.frequency) - 35) < .01); x.set('run', 'closed', false); x.run('Open dry-contact drive RUN loop'); x.off('motor'); break;
    case 59: x.set('demand-b', 'closed', false); x.run('Remove second heater-stage demand'); x.check('Stage A remains while stage B releases', closed(x.result, 'stage-a') && !closed(x.result, 'stage-b')); x.set('safety', 'closed', false); x.run('Open common heater safety limit'); x.check('Common limit removes both stage requests', !closed(x.result, 'stage-a') && !closed(x.result, 'stage-b')); break;
    case 60: starter('start-a', 'stop-b', 'starter', 'motor'); starter('start-b', 'stop-a', 'starter', 'motor'); break;
    case 61: x.pulse('start-b', 'Try upstream before downstream'); x.check('Upstream cannot start without downstream permission', !closed(x.result, 'upstream')); x.pulse('start-a', 'Start downstream'); x.pulse('start-b', 'Start permitted upstream'); x.check('Both starters operate in valid sequence', closed(x.result, 'downstream') && closed(x.result, 'upstream')); x.pulse('stop-a', 'Stop downstream'); x.check('Downstream stop removes upstream maintained permission', !closed(x.result, 'downstream') && !closed(x.result, 'upstream')); break;
    case 62: x.check('Default duty A runs alone', energized(x.result, 'pump-a') && !energized(x.result, 'pump-b')); x.set('duty', 'position', 1); x.run('Transfer normal duty to B'); x.check('Duty B runs alone without OR backfeed', !energized(x.result, 'pump-a') && energized(x.result, 'pump-b')); x.set('float-high', 'active', true); x.run('Request high-level assist'); x.check('Separate assist contacts request both pumps', energized(x.result, 'pump-a') && energized(x.result, 'pump-b')); break;
    case 63: x.on('motor'); x.set('present', 'active', false); x.run('Remove one PLC AND permissive'); x.off('motor'); x.check('Other status channel remains independent', power(x.result, 'ol-status') > 1); break;
    case 64: x.check('Safety relay begins unarmed', !closed(x.result, 'safety-relay')); x.pulse('reset', 'Arm stopped machine'); x.check('Reset arms permission without starting motor', closed(x.result, 'safety-relay') && !closed(x.result, 'starter')); x.pulse('start', 'Start armed machine'); x.on('motor'); x.set('channel-a', 'pressed', true); x.run('Open one safety-input channel'); x.off('motor'); x.check('Safety channel removes armed permission', !closed(x.result, 'safety-relay')); x.set('channel-a', 'pressed', false); x.pulse('reset', 'Rearm after channel restoration'); x.check('Rearming does not itself restart motor', !closed(x.result, 'starter')); break;
    default: throw new Error(`Missing independent operating case ${id}`);
  }
}

const STOPPED_BY_CHALLENGE: Record<number, string[]> = {
  1: ['light'], 4: ['load'], 7: ['light'], 8: ['light-b'], 11: ['zone-a', 'zone-b'], 12: ['light'],
  13: ['led'], 14: ['light'], 15: ['light'], 16: ['light'], 17: ['socket-c'], 19: ['fixed'], 20: ['fixed'],
  21: ['outlet-a'], 23: ['appliance'], 24: ['shaver'], 25: ['element'], 26: ['sink'], 27: ['element'],
  28: ['boiler'], 29: ['boiler'], 31: ['mat'], 33: ['store'], 34: ['unit'], 35: ['fan'], 36: ['fan'],
  37: ['fan'], 38: ['pump'], 39: ['pump'], 40: ['motor'], 41: ['operator'], 43: ['chime'], 46: ['evse'],
  48: ['essential'], 49: ['letters-a', 'letters-b'], 50: ['defrost-heat'], 52: ['operator'], 53: ['phase-load3'],
  55: ['motor'], 56: ['motor'], 57: ['motor'], 58: ['motor'], 59: ['h2-0', 'h2-1', 'h2-2'], 60: ['motor'],
  61: ['motor-b'], 62: ['pump-a'], 63: ['motor'], 64: ['motor'],
};

function prepareChallenge(x: Exercise, id: number): string[] {
  const notes: string[] = [];
  const set = (c: string, k: string, v: string | number | boolean, explanation: string) => { x.set(c, k, v); notes.push(explanation); };
  if (id === 6) set('monitor', 'active', true, 'Request shedding before opening the monitor-to-coil conductor.');
  if (id === 27) set('boost', 'closed', false, 'Remove the alternative boost request so it cannot mask the schedule-path fault.');
  if (id === 29) set('cylinder', 'closed', false, 'Request heating only; hot-water feedback must not mask the heating-END fault.');
  if (id === 37) set('override', 'closed', false, 'Remove manual override so it cannot mask the humidity-output fault.');
  if (id === 43) set('push', 'pressed', true, 'Hold the chime push to expose a broken output feed.');
  if (id === 50) set('defrost-clock', 'on', true, 'Request defrost before opening its coil-command conductor.');
  const starts = [40, 55, 56, 57].includes(id) ? ['start'] : id === 60 ? ['start-a'] : id === 61 ? ['start-a', 'start-b'] : [];
  if (starts.length) {
    // Conveyor requests must be established sequentially, not inferred from a label.
    for (const s of starts) { x.pulse(s, `Challenge setup ${s}`); notes.push(`Press and release ${s}; retain actual auxiliary holding operation.`); }
  }
  if (id === 64) notes.push('Begin stopped and unarmed; apply the feedback fault before requesting Reset.');
  if (!notes.length) notes.push('Use the intact lesson default state; no additional operator precondition is required.');
  x.run('Settle challenge preconditions');
  return notes;
}

function verifyChallenge(x: Exercise, lesson: ConfigurationLesson): void {
  const { id, challenge } = lesson;
  if (challenge.wire) {
    const i = x.result.wireCurrents[challenge.wire];
    x.check('The exact targeted conductor is open', !i || Math.hypot(i.re, i.im) < 1e-10, i ?? { re: 0, im: 0 });
  }
  for (const load of STOPPED_BY_CHALLENGE[id] ?? []) x.off(load, `Described fault interrupts ${load}`);
  switch (id) {
    case 2: x.check('Shared RCCB trips for selected branch earth leakage', !!x.result.deviceStates.group.tripped); x.off('load1'); x.off('load2'); break;
    case 3: x.check('Only selected branch RCBO trips', !!x.result.deviceStates.branch1.tripped && !x.result.deviceStates.branch2.tripped); x.off('load1'); x.on('load2'); break;
    case 5: x.check('SPD protective-path warning identifies the selected device', x.result.diagnostics.some(d => d.id === 'cpc:spd')); x.on('load', 'Ordinary load still operates despite missing SPD PE'); break;
    case 6: x.on('secondary', 'Open shedding command incorrectly leaves secondary operating'); x.on('priority'); break;
    case 8: x.on('light-a'); x.on('light-c'); break;
    case 9: case 10: x.off('light', 'Broken selected traveller interrupts the expected default route'); break;
    case 17: x.on('socket-a'); x.on('socket-b'); break;
    case 18: x.on('socket-a'); x.on('socket-b'); x.on('socket-c'); break;
    case 19: x.check('Injected fourfold load trips only the branch fuse', !!x.result.deviceStates['branch-fuse'].tripped && !x.result.deviceStates.protect.tripped); x.on('socket-a'); break;
    case 21: x.on('outlet-b'); break;
    case 22: x.check('Cooker protective-path warning identifies appliance', x.result.diagnostics.some(d => d.id === 'cpc:appliance')); x.on('appliance', 'Cooker still consumes power despite missing PE'); break;
    case 29: x.check('Valve actually opens but END command cannot reach boiler', closed(x.result, 'heating-valve')); break;
    case 30: x.check('Missing CH leaves hot-water-only valve position', x.result.deviceStates['mid-valve'].level === 0); x.on('boiler', 'Remaining HW request still permits the abstract heat source'); break;
    case 32: x.check('Missing I1 closes only actuator A', !closed(x.result, 'actuator-a') && closed(x.result, 'actuator-b')); x.on('pump', 'Other opened actuator can maintain pump demand'); break;
    case 33: x.on('day'); break;
    case 39: x.check('Pressure contactor still receives demand but downstream permission is absent', closed(x.result, 'pump-contactor') && !closed(x.result, 'dry-run')); break;
    case 40: case 55: x.check('Broken hold route drops starter after released Start', !closed(x.result, 'starter')); break;
    case 42: x.check('Selected smoke alarm changes to conceptual backup', x.result.deviceStates.smoke.details.includes('battery')); x.check('Other alarm retains mains state', x.result.deviceStates.heat.details.includes('Mains')); break;
    case 44: x.check('Mains-feed fault activates emergency illumination', !!x.result.deviceStates.emergency.emergencyActive && energized(x.result, 'emergency')); break;
    case 45: x.check('SL fault extinguishes normal light without invoking battery mode', !x.result.deviceStates.emergency.normalActive && !x.result.deviceStates.emergency.emergencyActive); break;
    case 47: x.check('Broken inverter line removes external-grid recognition', x.result.deviceStates.inverter.gridPresent === false); x.check('Site load returns to positive grid import', x.result.totalPower > 200); break;
    case 48: x.on('ordinary', 'Ordinary grid demand is unaffected by broken backup return'); break;
    case 50: x.on('compressor', 'Broken defrost command leaves cooling NC path available'); break;
    case 51: x.on('compressor'); x.on('unloader', 'Broken motor-state command leaves wrong unloading indication'); break;
    case 53: x.on('phase-load1'); x.on('phase-load2'); break;
    case 54: x.check('Missing phase removes complete industrial outlet operating state', !energized(x.result, 'socket')); break;
    case 56: x.check('Run permit holds but interrupted forward request does not pick up', closed(x.result, 'run-permit') && !closed(x.result, 'forward')); break;
    case 57: x.check('After failed transition neither star nor delta is closed', !closed(x.result, 'star') && !closed(x.result, 'delta')); break;
    case 58: x.check('Drive has no closed RUN output permission', !closed(x.result, 'drive')); break;
    case 59: x.check('Fault interrupts only second heater-stage coil request', closed(x.result, 'stage-a') && !closed(x.result, 'stage-b')); break;
    case 60: x.check('Broken common stop feed defeats both start/hold routes', !closed(x.result, 'starter')); break;
    case 61: x.check('Downstream remains running while upstream permissive is broken', closed(x.result, 'downstream') && !closed(x.result, 'upstream')); break;
    case 62: x.check('Selected duty-A starter cannot pick up through broken permission', !closed(x.result, 'pump-a-k')); break;
    case 63: x.check('Open I1 conductor inhibits PLC motor output', !closed(x.result, 'starter')); break;
    case 64: x.check('Missing NC feedback prevents initial arming after Reset', !closed(x.result, 'safety-relay')); x.check('Feedback status explicitly reports absence', x.result.deviceStates['safety-relay'].details.includes('feedback absent')); break;
  }
  if (id === 11) x.check('Branch short operates common RCBO', !!x.result.deviceStates.protect.tripped);
}

function referenceSupply(lesson: ConfigurationLesson, voltage: number) {
  // Disconnect all downstream demand so finite source impedance produces no
  // material loaded drop. This tests the configured reference, not an idealized
  // claim that every loaded terminal must remain exactly nominal.
  const x = new Exercise(lesson, voltage);
  x.circuit.components = x.circuit.components.filter(c => c.id === 'supply');
  x.circuit.wires = []; x.run('Unloaded configured reference supply');
  const readings: Record<string, number | null> = {};
  if (lesson.circuit.supply.phase === 'single') readings.lineNeutralV = x.voltage(endpoint('supply', 'L'), endpoint('supply', 'N'), voltage);
  else {
    readings.phase1NeutralV = x.voltage(endpoint('supply', 'L1'), endpoint('supply', 'N'), voltage / Math.sqrt(3));
    readings.phase2NeutralV = x.voltage(endpoint('supply', 'L2'), endpoint('supply', 'N'), voltage / Math.sqrt(3));
    readings.phase3NeutralV = x.voltage(endpoint('supply', 'L3'), endpoint('supply', 'N'), voltage / Math.sqrt(3));
    readings.phase12V = x.voltage(endpoint('supply', 'L1'), endpoint('supply', 'L2'), voltage);
    readings.phase23V = x.voltage(endpoint('supply', 'L2'), endpoint('supply', 'L3'), voltage);
    readings.phase31V = x.voltage(endpoint('supply', 'L3'), endpoint('supply', 'L1'), voltage);
  }
  return { configuredVoltage: voltage, configuredFrequencyHz: x.circuit.supply.frequency, readings, checks: x.checks, passed: x.checks.every(c => c.passed) };
}

const structureErrors = validateLessons();
const records: Record<string, unknown>[] = [];
const started = Date.now();
for (const lesson of LESSONS) {
  try {
    const operating = new Exercise(lesson); operating.run('Intact default circuit');
    const initial = snapshot(operating.circuit, operating.result);
    verifyOperation(operating, lesson.id);
    const fault = new Exercise(lesson); const preconditions = prepareChallenge(fault, lesson.id);
    const before = snapshot(fault.circuit, fault.result);
    const targetWire = lesson.challenge.wire ? fault.circuit.wires.find(w => w.id === lesson.challenge.wire) : undefined;
    assert.ok(lesson.challenge.wire || lesson.challenge.component, 'Challenge needs an explicit target');
    fault.circuit.faults = [{ type: lesson.challenge.fault, wire: lesson.challenge.wire, component: lesson.challenge.component, enabled: true }];
    if (lesson.id === 64) fault.set('reset', 'pressed', true);
    fault.run('Apply exact authored challenge target');
    verifyChallenge(fault, lesson);
    const after = snapshot(fault.circuit, fault.result);
    const faultChecksPassed = fault.checks.every(c => c.passed);
    let nominal230: Record<string, unknown> | undefined;
    if (lesson.circuit.supply.phase === 'single') {
      const nominal = new Exercise(lesson, 230); nominal.run('Intact configuration at Ireland nominal 230 V');
      nominal230 = { ...snapshot(nominal.circuit, nominal.result), checks: nominal.checks, passed: nominal.checks.every(c => c.passed), referenceSupply: referenceSupply(lesson, 230) };
    }
    const supplyReference = referenceSupply(lesson, lesson.circuit.supply.voltage);
    const record = {
      id: lesson.id, title: lesson.title, phase: lesson.circuit.supply.phase, configuredVoltage: lesson.circuit.supply.voltage,
      initial, operating: { passed: operating.checks.every(c => c.passed), actions: operating.actions, samples: operating.samples, checks: operating.checks },
      challenge: { fault: lesson.challenge.fault, component: lesson.challenge.component, wire: lesson.challenge.wire, targetEndpoints: targetWire ? { from: targetWire.from, to: targetWire.to, role: targetWire.role } : undefined,
        briefing: lesson.challenge.briefing, preconditions, actions: fault.actions, before, after,
        converged: after.converged, numericalErrors: after.numericalErrors, intendedFaultObserved: faultChecksPassed, checks: fault.checks },
      supplyReference, nominal230,
      passed: operating.checks.every(c => c.passed) && faultChecksPassed && supplyReference.passed && (!nominal230 || nominal230.passed === true && (nominal230.referenceSupply as { passed: boolean }).passed),
    };
    records.push(record);
  } catch (error) {
    records.push({ id: lesson.id, title: lesson.title, passed: false, error: error instanceof Error ? error.stack : String(error) });
  }
}
const failures = records.filter(r => r.passed !== true);
const report = {
  schemaVersion: 1, generatedAtUtc: new Date().toISOString(), execution: 'Node 24 native TypeScript transformation; no browser interaction',
  sourceModules: ['lab/lib/lessons.ts', 'lab/lib/simulation.ts'],
  settings: { timeStepSeconds: STEP_SECONDS, defaultSettleTicks: SETTLE_TICKS, powerOffToleranceW: POWER_TOLERANCE, unloadedVoltageToleranceV: VOLTAGE_TOLERANCE },
  coverage: { lessons: LESSONS.length, independentOperatingCases: 64, authoredFaultTargets: LESSONS.filter(l => l.challenge.wire || l.challenge.component).length,
    singlePhaseNominal230Cases: LESSONS.filter(l => l.circuit.supply.phase === 'single').length,
    industrial400ReferenceCases: LESSONS.filter(l => l.circuit.supply.phase === 'three').length },
  summary: { passed: structureErrors.length === 0 && LESSONS.length === 64 && failures.length === 0, lessonPasses: records.length - failures.length, lessonFailures: failures.length, structuralErrors: structureErrors, elapsedMs: Date.now() - started },
  limitations: [
    'Results validate the declared educational network and control behaviour, not a real installation or Irish regulatory compliance.',
    'Fault prerequisites are explicit; OR permissions, retained run-on and momentary holding circuits must be placed in the documented state before diagnosis.',
    'Generic open-live/open-neutral fault categories also identify isolated-output feed/return breaks; DC− and separated secondary returns are not incoming mains neutral.',
    'Power, impedance, trip thresholds, conversion, emergency backup and machinery interfaces are educational abstractions; actual equipment design, timing and certification are outside the audit.',
    'Alarm LINK is a conceptual wired signal; propagation is tested but manufacturer-specific interlink voltage/current/waveforms are withheld.',
    'Reference-voltage assertions use unloaded source terminals; loaded circuit values can differ because the actual finite source and conductor impedances are retained.',
  ],
  lessons: records,
};
const reportPath = fileURLToPath(new URL('../../verification/lesson-simulation-report.json', import.meta.url));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, ...report.summary, coverage: report.coverage }));
if (!report.summary.passed) {
  console.error(JSON.stringify(failures.map(r => ({ id: r.id, title: r.title, error: r.error, failedChecks: [
    ...((r.operating as { checks?: Check[] })?.checks ?? []), ...((r.challenge as { checks?: Check[] })?.checks ?? []),
  ].filter(c => !c.passed) })), null, 2));
  process.exitCode = 1;
}
