import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS } from './components.ts';
import { simulate, measureVoltage, measureResistance, solveComplexLinear } from './simulation.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Parameters, Wire } from './types.ts';

const e = (component: string, terminal: string): Endpoint => ({ component, terminal });
const item = (type: string, id: string, params: Parameters = {}): ComponentInstance => ({ id, type, label: id, position: [0, 0, 0], rotation: 0, params });
function document(components: ComponentInstance[], connections: [string, string, string, string, string?][] = [], three = false): CircuitDocument {
  const wires: Wire[] = connections.map(([a, at, b, bt, role], i) => ({ id: `w${i}`, from: e(a, at), to: e(b, bt), role: (role || 'L') as Wire['role'], resistance: 0.01, bends: [] }));
  return { version: 1, id: 'test', name: 'Electrical test', revision: 1, supply: { enabled: true, phase: three ? 'three' : 'single', voltage: three ? 400 : 240, frequency: 50, sourceResistance: 0.12 }, components, wires, faults: [] };
}
const close = (actual: number | null, expected: number, tolerance = 0.005) => { assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance), `${actual} should approximate ${expected}`); };
const lampCircuit = () => document([item('source', 's'), item('lamp', 'l', { ohms: 960 })], [['s', 'L', 'l', 'L'], ['s', 'N', 'l', 'N', 'N'], ['s', 'PE', 'l', 'PE', 'PE']]);
const rcdCircuit = () => document([item('source', 's'), item('rcd', 'r'), item('lamp', 'l', { ohms: 960 })], [['s', 'L', 'r', 'LIN'], ['s', 'N', 'r', 'NIN', 'N'], ['r', 'LOUT', 'l', 'L'], ['r', 'NOUT', 'l', 'N', 'N'], ['s', 'PE', 'l', 'PE', 'PE']]);

test('dense complex LU handles pivoting and reactive values', () => {
  // [0,1; 1,i] [2+i,3-i] = [3-i,3+4i]
  const solution = solveComplexLinear(new Float64Array([0, 1, 1, 0]), new Float64Array([0, 0, 0, 1]), new Float64Array([3, 3]), new Float64Array([-1, 4]), 2);
  close(solution.re[0], 2); close(solution.im[0], 1); close(solution.re[1], 3); close(solution.im[1], -1); assert.ok(solution.residual < 1e-9);
});
test('240 V resistor respects source and conductor resistance', () => {
  const result = simulate(lampCircuit()); assert.ok(result.converged, JSON.stringify(result.diagnostics));
  close(result.totalCurrent, 240 / 960.14001); close(result.componentPower.l, (240 / 960.14001) ** 2 * 960);
  close(measureVoltage(result, e('l', 'L'), e('l', 'N')).value, 240 * 960 / 960.14001);
  assert.equal(result.diagnostics.filter(d => d.id.startsWith('cpc:')).length, 0);
});
test('changing supply to230 V changes fixed-resistance power by voltage squared', () => {
  const doc = lampCircuit(), a = simulate(doc); doc.supply.voltage = 230; const b = simulate(doc);
  close(b.componentPower.l / a.componentPower.l, (230 / 240) ** 2, 0.00001);
});
test('parallel branch currents add and series resistors divide voltage', () => {
  const parallel = document([item('source', 's'), item('lamp', 'a', { ohms: 960 }), item('lamp', 'b', { ohms: 960 })], [['s', 'L', 'a', 'L'], ['s', 'N', 'a', 'N', 'N'], ['s', 'L', 'b', 'L'], ['s', 'N', 'b', 'N', 'N']]);
  const p = simulate(parallel); assert.ok(p.converged); close(p.totalCurrent, 0.5, 0.001);
  close(p.wireCurrents.w0.re + p.wireCurrents.w2.re, p.totalCurrent, 0.000001);
  const series = document(parallel.components, [['s', 'L', 'a', 'L'], ['a', 'N', 'b', 'L'], ['b', 'N', 's', 'N', 'N']]);
  const s = simulate(series); close(measureVoltage(s, e('a', 'L'), e('a', 'N')).value, 120, 0.001);
});
test('open neutral leaves live potential on both load terminals without load current', () => {
  const doc = lampCircuit(); doc.faults.push({ type: 'open-neutral', wire: 'w1', enabled: true }); const result = simulate(doc);
  assert.ok(result.converged); close(result.totalCurrent, 0, 0.000001); close(measureVoltage(result, e('l', 'L'), e('l', 'N')).value, 0, 0.00001);
  close(measureVoltage(result, e('l', 'N'), e('s', 'N')).value, 240); assert.ok(result.diagnostics.some(d => d.id === 'neutral:l'));
});
test('disconnected passive island is reported floating', () => {
  const doc = document([item('source', 's'), item('lamp', 'l')]); const result = simulate(doc);
  assert.ok(result.converged); assert.equal(measureVoltage(result, e('l', 'L'), e('s', 'N')).value, null);
  assert.equal(result.deviceStates.l.energized, false);
});
test('missing CPC warns but does not suppress real load operation', () => {
  const doc = lampCircuit(); doc.faults.push({ type: 'missing-earth', wire: 'w2', enabled: true }); const result = simulate(doc);
  assert.ok(result.converged); assert.ok(result.deviceStates.l.energized); assert.ok(result.diagnostics.some(d => d.id === 'cpc:l'));
});
test('balanced RCD does not trip, downstream earth leakage does', () => {
  const doc = rcdCircuit(), balanced = simulate(doc); assert.ok(balanced.converged); assert.equal(balanced.deviceStates.r.tripped, false);
  assert.ok(Number(balanced.deviceStates.r.imbalance) < 0.000001);
  doc.faults.push({ type: 'earth-fault', component: 'l', enabled: true }); const fault = simulate(doc);
  assert.ok(fault.converged, JSON.stringify(fault.diagnostics)); assert.equal(fault.deviceStates.r.tripped, true); assert.ok(fault.preTrip!.totalCurrent > 2);
});
test('RCD does not invent an earth-fault trip when CPC is disconnected', () => {
  const doc = rcdCircuit(); doc.faults.push({ type: 'earth-fault', component: 'l', enabled: true }, { type: 'missing-earth', wire: 'w4', enabled: true });
  const result = simulate(doc); assert.ok(result.converged); assert.equal(result.deviceStates.r.tripped, false); assert.ok(result.diagnostics.some(d => d.id === 'cpc:l'));
});
test('upstream leakage is outside the RCD sensing paths', () => {
  const doc = rcdCircuit(); doc.components.push(item('lamp', 'up', { ohms: 1e8, faultResistance: 100 }));
  doc.wires.push({ id: 'upL', from: e('s', 'L'), to: e('up', 'L'), role: 'L', resistance: 0.01, bends: [] }, { id: 'upPE', from: e('s', 'PE'), to: e('up', 'PE'), role: 'PE', resistance: 0.01, bends: [] });
  doc.faults.push({ type: 'earth-fault', component: 'up', enabled: true }); const result = simulate(doc); assert.ok(result.converged); assert.equal(result.deviceStates.r.tripped, false); assert.ok(result.totalCurrent > 2);
});
test('finite short current trips breaker; reset with persistent fault trips again', () => {
  const doc = document([item('source', 's'), item('mcb', 'b'), item('lamp', 'l')], [['s', 'L', 'b', 'IN'], ['b', 'OUT', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  doc.faults.push({ type: 'short-circuit', component: 'l', enabled: true }); const result = simulate(doc); assert.ok(result.converged); assert.ok(result.deviceStates.b.tripped); assert.ok(result.preTrip!.totalCurrent > 1000); assert.ok(Number.isFinite(result.preTrip!.totalCurrent));
  doc.components[1].params.resetToken = 1; const reset = simulate(doc, result.deviceStates); assert.ok(reset.deviceStates.b.tripped); assert.ok(reset.events.some(event => event.component === 'b'));
});
test('sustained overload uses accumulated virtual time', () => {
  const doc = document([item('source', 's'), item('mcb', 'b', { currentRating: 1, delay: 0.5 }), item('heater', 'l', { ohms: 100 })], [['s', 'L', 'b', 'IN'], ['b', 'OUT', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  let result = simulate(doc, {}, 0.1); assert.equal(result.deviceStates.b.tripped, false);
  for (let i = 0; i < 5; i++) result = simulate(doc, result.deviceStates, 0.1);
  assert.equal(result.deviceStates.b.tripped, true);
});
test('two-way and intermediate switch contact maps are electrically functional', () => {
  const doc = document([item('source', 's'), item('switch2', 'a'), item('intermediate', 'i'), item('switch2', 'b'), item('lamp', 'l')], [['s', 'L', 'a', 'COM'], ['a', 'T1', 'i', 'A'], ['a', 'T2', 'i', 'B'], ['i', 'C', 'b', 'T1'], ['i', 'D', 'b', 'T2'], ['b', 'COM', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  assert.ok(simulate(doc).deviceStates.l.energized); doc.components[2].params.position = 1; assert.equal(simulate(doc).deviceStates.l.energized, false); doc.components[3].params.position = 1; assert.ok(simulate(doc).deviceStates.l.energized);
});
test('contactor requires coil voltage; NO/NC contacts follow actual state', () => {
  const doc = document([item('source', 's'), item('contactor', 'k'), item('pushbutton', 'p'), item('lamp', 'l')], [['s', 'L', 'p', 'COM'], ['p', 'NO', 'k', 'A1'], ['s', 'N', 'k', 'A2', 'N'], ['s', 'L', 'k', '1'], ['k', '2', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  assert.equal(simulate(doc).deviceStates.k.closed, false); doc.components[2].params.pressed = true; const result = simulate(doc); assert.ok(result.converged); assert.ok(result.deviceStates.k.closed); assert.ok(result.deviceStates.l.energized);
});
test('seal-in auxiliary holds after start release and stop opens it', () => {
  const doc = document([item('source', 's'), item('pushbutton', 'stop'), item('pushbutton', 'start'), item('contactor', 'k')], [['s', 'L', 'stop', 'COM'], ['stop', 'NC', 'start', 'COM'], ['start', 'NO', 'k', 'A1'], ['stop', 'NC', 'k', '13'], ['k', '14', 'k', 'A1'], ['s', 'N', 'k', 'A2', 'N']]);
  doc.components[2].params.pressed = true; let result = simulate(doc); assert.ok(result.deviceStates.k.closed);
  doc.components[2].params.pressed = false; result = simulate(doc, result.deviceStates); assert.ok(result.deviceStates.k.closed);
  doc.components[1].params.pressed = true; result = simulate(doc, result.deviceStates); assert.equal(result.deviceStates.k.closed, false);
});
test('powered on-delay timer changes output only after virtual delay', () => {
  const doc = document([item('source', 's'), item('timer', 't', { on: true, demand: true, delay: 0.3 }), item('lamp', 'l')], [['s', 'L', 't', 'L'], ['s', 'N', 't', 'N', 'N'], ['s', 'L', 't', 'IN'], ['t', 'OUT', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  let result = simulate(doc); assert.equal(result.deviceStates.l.energized, false); result = simulate(doc, result.deviceStates); assert.equal(result.deviceStates.l.energized, false); result = simulate(doc, result.deviceStates); assert.ok(result.deviceStates.l.energized);
  doc.wires = doc.wires.filter(w => !(w.to.component === 't' && w.to.terminal === 'L')); result = simulate(doc, result.deviceStates); assert.equal(result.deviceStates.l.energized, false);
});
test('three-phase source is400 V line-to-line and motor direction responds to phase swap', () => {
  const doc = document([item('source3', 's'), item('motor3', 'm'), item('junction', 'star')], [['s', 'L1', 'm', 'U1', 'L1'], ['s', 'L2', 'm', 'V1', 'L2'], ['s', 'L3', 'm', 'W1', 'L3'], ['m', 'U2', 'star', '1'], ['m', 'V2', 'star', '2'], ['m', 'W2', 'star', '3'], ['s', 'PE', 'm', 'PE', 'PE']], true);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); close(measureVoltage(result, e('s', 'L1'), e('s', 'L2')).value, 400, 0.002); assert.equal(result.deviceStates.m.direction, 1);
  [doc.wires[0].to, doc.wires[1].to] = [doc.wires[1].to, doc.wires[0].to]; assert.equal(simulate(doc).deviceStates.m.direction, -1);
});
test('transformer transfers real load power and preserves isolation', () => {
  const doc = document([item('source', 's'), item('transformer', 'tx', { outputVoltage: 12 }), item('chime', 'l', { ohms: 48 })], [['s', 'L', 'tx', 'L'], ['s', 'N', 'tx', 'N', 'N'], ['tx', '+', 'l', 'L', 'DC+'], ['tx', '-', 'l', 'N', 'DC-']]);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); close(measureVoltage(result, e('tx', '+'), e('tx', '-')).value, 12, 0.005); assert.ok(result.totalPower > 2.9);
  assert.equal(measureVoltage(result, e('tx', '+'), e('s', 'PE')).value, null);
});
test('DC supply output depends on input, regulates real load and balances power', () => {
  const doc = document([item('source', 's'), item('dcsupply', 'psu'), item('led', 'l')], [['s', 'L', 'psu', 'L'], ['s', 'N', 'psu', 'N', 'N'], ['psu', '+', 'l', 'L', 'DC+'], ['psu', '-', 'l', 'N', 'DC-']]);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); close(measureVoltage(result, e('l', 'L'), e('l', 'N')).value, 24, 0.01); close(result.componentPower.psu, Number(result.deviceStates.psu.outputPower) / 0.9, 0.01);
  doc.supply.enabled = false; const off = simulate(doc, result.deviceStates); assert.ok(off.converged); assert.equal(off.deviceStates.l.energized, false);
});
test('DC short produces current limiting rather than invented nominal output', () => {
  const doc = document([item('source', 's'), item('dcsupply', 'psu', { outputCurrent: 1 }), item('led', 'l', { ohms: 0.1 })], [['s', 'L', 'psu', 'L'], ['s', 'N', 'psu', 'N', 'N'], ['psu', '+', 'l', 'L', 'DC+'], ['psu', '-', 'l', 'N', 'DC-']]);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); assert.ok(measureVoltage(result, e('psu', '+'), e('psu', '-')).value! < 1); assert.ok(Math.hypot(result.branchCurrents['l.load'].re, result.branchCurrents['l.load'].im) <= 1.01);
});
test('connecting AC and DC sources into one domain withholds assessment', () => {
  const doc = document([item('source', 's'), item('dcsupply', 'psu')], [['s', 'L', 'psu', 'L'], ['s', 'N', 'psu', 'N', 'N'], ['psu', '+', 's', 'L', 'DC+'], ['psu', '-', 's', 'N', 'DC-']]);
  const result = simulate(doc); assert.equal(result.converged, false); assert.ok(result.diagnostics.some(d => d.category === 'model' && d.severity === 'error'));
});
test('battery backup continues when the grid supply is off', () => {
  const doc = document([item('source', 's'), item('battery', 'b', { watts: 300 }), item('lamp', 'l')], [['s', 'L', 'b', 'L'], ['s', 'N', 'b', 'N', 'N'], ['b', 'BL', 'l', 'L'], ['b', 'BN', 'l', 'N', 'N']]);
  const on = simulate(doc); assert.ok(on.converged, JSON.stringify(on.diagnostics)); assert.ok(on.deviceStates.l.energized);
  doc.supply.enabled = false; const off = simulate(doc, on.deviceStates, 1); assert.ok(off.converged, JSON.stringify(off.diagnostics)); assert.ok(off.deviceStates.l.energized); assert.ok(off.deviceStates.b.level < on.deviceStates.b.level); close(off.totalPower, 0);
});
test('resistance mode requires isolation and reports parallel equivalent resistance', () => {
  const doc = lampCircuit(); assert.equal(measureResistance(doc, e('l', 'L'), e('l', 'N')).value, null); doc.supply.enabled = false;
  close(measureResistance(doc, e('l', 'L'), e('l', 'N')).value, 960, 0.00001);
  close(measureResistance(doc, e('s', 'L'), e('s', 'PE')).value, 960.02101, 0.00001);
  doc.components.push(item('junction', 'isolated'));
  assert.equal(measureResistance(doc, e('s', 'L'), e('isolated', '1')).value, null);
});
test('all registered components have a supported model or a deliberate instrument model', () => {
  for (const def of Object.values(COMPONENTS)) {
    const doc = document([item(def.type, 'x')]); doc.supply.enabled = false;
    const result = simulate(doc); assert.ok(!result.diagnostics.some(d => d.id.startsWith('unsupported:')), `${def.type} must have a model`);
  }
});

test('sensor environment demand cannot bypass a wired permission', () => {
  const doc = document([item('source', 's'), item('timer', 't', { on: false, delay: 0 }), item('sensor', 'p', { active: true, demand: true }), item('lamp', 'l')], [['s', 'L', 't', 'L'], ['s', 'N', 't', 'N', 'N'], ['s', 'L', 'p', 'L'], ['s', 'N', 'p', 'N', 'N'], ['t', 'OUT', 'p', 'IN'], ['p', 'OUT', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  assert.equal(simulate(doc).deviceStates.l.energized, false);
  doc.components[1].params.on = true; const on = simulate(doc); assert.ok(on.converged); assert.ok(on.deviceStates.l.energized);
  doc.faults.push({ type: 'wrong-control', wire: 'w4', enabled: true }); assert.equal(simulate(doc).deviceStates.l.energized, false);
});

test('24 V PLC inputs and contactor coil are supplied by an actual isolated DC circuit', () => {
  const doc = document([item('source', 's'), item('dcsupply', 'psu'), item('plc', 'p'), item('contactor', 'k', { nominalVoltage: 24 }), item('lamp', 'l')], [['s', 'L', 'psu', 'L'], ['s', 'N', 'psu', 'N', 'N'], ['psu', '+', 'p', 'L', 'DC+'], ['psu', '-', 'p', 'N', 'DC-'], ['psu', '+', 'p', 'I1', 'DC+'], ['psu', '+', 'p', 'I2', 'DC+'], ['psu', '+', 'p', 'COM', 'DC+'], ['p', 'Q1', 'k', 'A1', 'control'], ['psu', '-', 'k', 'A2', 'DC-'], ['s', 'L', 'k', '1'], ['k', '2', 'l', 'L'], ['s', 'N', 'l', 'N', 'N']]);
  const on = simulate(doc); assert.ok(on.converged, JSON.stringify(on.diagnostics)); assert.ok(on.deviceStates.k.closed); assert.ok(on.deviceStates.l.energized);
  doc.faults.push({ type: 'wrong-control', wire: 'w5', enabled: true }); const off = simulate(doc, on.deviceStates); assert.ok(off.converged); assert.equal(off.deviceStates.k.closed, false); assert.equal(off.deviceStates.l.energized, false);
});

test('safety relay checks feedback before reset and remains enabled when NC feedback opens', () => {
  const doc = document([item('source', 's'), item('dcsupply', 'psu'), item('safetyRelay', 'safe'), item('pushbutton', 'a'), item('pushbutton', 'b'), item('pushbutton', 'reset'), item('contactor', 'k', { nominalVoltage: 24 })], [['s', 'L', 'psu', 'L'], ['s', 'N', 'psu', 'N', 'N'], ['psu', '+', 'safe', 'L', 'DC+'], ['psu', '-', 'safe', 'N', 'DC-'], ['psu', '+', 'a', 'COM', 'DC+'], ['a', 'NC', 'safe', 'S1', 'control'], ['psu', '+', 'b', 'COM', 'DC+'], ['b', 'NC', 'safe', 'S2', 'control'], ['psu', '+', 'reset', 'COM', 'DC+'], ['reset', 'NO', 'safe', 'RESET', 'control'], ['psu', '+', 'k', '21', 'DC+'], ['k', '22', 'safe', 'FB', 'control'], ['psu', '+', 'safe', 'COM', 'DC+'], ['safe', 'OUT', 'k', 'A1', 'control'], ['psu', '-', 'k', 'A2', 'DC-']]);
  let result = simulate(doc); assert.ok(result.converged); assert.equal(result.deviceStates.k.closed, false);
  doc.components[5].params.pressed = true; result = simulate(doc, result.deviceStates); assert.ok(result.converged, JSON.stringify(result.diagnostics)); assert.ok(result.deviceStates.k.closed); assert.ok(result.deviceStates.safe.closed);
  doc.components[5].params.pressed = false; result = simulate(doc, result.deviceStates); assert.ok(result.deviceStates.k.closed);
  doc.components[3].params.pressed = true; result = simulate(doc, result.deviceStates); assert.ok(result.converged); assert.equal(result.deviceStates.k.closed, false);
  doc.components[3].params.pressed = false; result = simulate(doc, result.deviceStates); assert.equal(result.deviceStates.k.closed, false, 'channels closing must not bypass monitored reset');
});

test('VFD output follows actual dry-contact RUN and changing frequency', () => {
  const doc = document([item('source3', 's'), item('vfd', 'd', { frequency: 35 }), item('switch', 'run', { closed: true }), item('motor3', 'm'), item('junction', 'star')], [['s', 'L1', 'd', 'L1', 'L1'], ['s', 'L2', 'd', 'L2', 'L2'], ['s', 'L3', 'd', 'L3', 'L3'], ['d', 'COM', 'run', 'COM', 'control'], ['run', 'OUT', 'd', 'RUN', 'control'], ['d', 'U', 'm', 'U1', 'output'], ['d', 'V', 'm', 'V1', 'output'], ['d', 'W', 'm', 'W1', 'output'], ['m', 'U2', 'star', '1'], ['m', 'V2', 'star', '2'], ['m', 'W2', 'star', '3']], true);
  let result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); assert.ok(result.deviceStates.m.energized); close(Number(result.deviceStates.m.frequency), 35); assert.equal(result.deviceStates.m.direction, 1);
  doc.components[2].params.closed = false; result = simulate(doc, result.deviceStates); assert.ok(result.converged, JSON.stringify(result.diagnostics)); assert.equal(result.deviceStates.m.energized, false);
});

test('PV export is measured current, reduces grid import, and ceases on grid loss', () => {
  const doc = document([item('source', 's'), item('pv', 'pv', { watts: 100 }), item('heater', 'load', { ohms: 288 })], [['s', 'L', 'pv', 'L'], ['s', 'N', 'pv', 'N', 'N'], ['s', 'L', 'load', 'L'], ['s', 'N', 'load', 'N', 'N']]);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics)); close(result.totalPower, 100, 0.01); assert.ok(result.branchCurrents['pv.gridExport'].re > 0.4);
  doc.supply.enabled = false; const off = simulate(doc, result.deviceStates); assert.ok(off.converged); close(Math.hypot(off.branchCurrents['pv.gridExport']?.re || 0, off.branchCurrents['pv.gridExport']?.im || 0), 0); assert.equal(off.deviceStates.load.energized, false);
});

test('explicit mechanical pairing blocks simultaneous fresh requests without arbitrary winner', () => {
  const doc = document([item('source', 's'), item('contactor', 'a', { mechanicallyInterlockedWith: 'b' }), item('contactor', 'b', { mechanicallyInterlockedWith: 'a' }), item('lamp', 'la'), item('lamp', 'lb')], [['s', 'L', 'a', 'A1'], ['s', 'N', 'a', 'A2', 'N'], ['s', 'L', 'b', 'A1'], ['s', 'N', 'b', 'A2', 'N'], ['s', 'L', 'a', '1'], ['a', '2', 'la', 'L'], ['s', 'N', 'la', 'N', 'N'], ['s', 'L', 'b', '1'], ['b', '2', 'lb', 'L'], ['s', 'N', 'lb', 'N', 'N']]);
  const result = simulate(doc); assert.ok(result.converged, JSON.stringify(result.diagnostics));
  assert.equal(result.deviceStates.a.closed, false); assert.equal(result.deviceStates.b.closed, false);
  assert.ok(result.deviceStates.a.energized && result.deviceStates.b.energized, 'coil demand remains visible while mechanical contacts are blocked');
  assert.equal(result.deviceStates.la.energized, false); assert.equal(result.deviceStates.lb.energized, false);
  assert.equal(result.diagnostics.filter(d => d.id.startsWith('mechanical:')).length, 2);
  const stale = simulate(doc, { ...result.deviceStates, a: { ...result.deviceStates.a, closed: true }, b: { ...result.deviceStates.b, closed: true } });
  assert.ok(stale.converged); assert.equal(stale.deviceStates.a.closed, false); assert.equal(stale.deviceStates.b.closed, false);
});

test('mechanical pairing retains existing member and permits change only when its coil releases', () => {
  const doc = document([item('source', 's'), item('contactor', 'a', { mechanicallyInterlockedWith: 'b' }), item('contactor', 'b'), item('switch', 'sa'), item('switch', 'sb', { closed: false })], [['s', 'L', 'sa', 'COM'], ['sa', 'OUT', 'a', 'A1'], ['s', 'N', 'a', 'A2', 'N'], ['s', 'L', 'sb', 'COM'], ['sb', 'OUT', 'b', 'A1'], ['s', 'N', 'b', 'A2', 'N']]);
  let result = simulate(doc); assert.ok(result.deviceStates.a.closed); assert.equal(result.deviceStates.b.closed, false);
  doc.components[4].params.closed = true; result = simulate(doc, result.deviceStates); assert.ok(result.converged); assert.ok(result.deviceStates.a.closed); assert.equal(result.deviceStates.b.closed, false);
  doc.components[3].params.closed = false; result = simulate(doc, result.deviceStates); assert.ok(result.converged); assert.equal(result.deviceStates.a.closed, false); assert.ok(result.deviceStates.b.closed);
});

test('mechanical pairing rejects a missing or self-linked partner explicitly', () => {
  const doc = document([item('source', 's'), item('contactor', 'a', { mechanicallyInterlockedWith: 'missing' })]);
  const result = simulate(doc); assert.equal(result.converged, false); assert.ok(result.diagnostics.some(d => d.id === 'interlockTarget:a'));
});

test('three-port valve distinguishes settled hot-water-only position from no demand', () => {
  const doc = document([item('source', 's'), item('valve3', 'v', { delay: 1 }), item('boiler', 'b')], [['s', 'L', 'v', 'L'], ['s', 'N', 'v', 'N', 'N'], ['s', 'L', 'v', 'HW', 'control'], ['v', 'END', 'b', 'L'], ['s', 'N', 'b', 'N', 'N']]);
  let result = simulate(doc); assert.ok(result.converged); assert.equal(result.deviceStates.v.level, 0); assert.ok(result.deviceStates.v.closed); assert.ok(result.deviceStates.b.energized, 'settled hot-water demand enables the declared abstract external interface');
  doc.wires = doc.wires.filter(w => w.to.terminal !== 'HW'); result = simulate(doc, result.deviceStates); assert.ok(result.converged); assert.equal(result.deviceStates.v.level, 0); assert.equal(result.deviceStates.v.closed, false); assert.equal(result.deviceStates.b.energized, false);
});

test('PV does not sustain grid presence from its own voltage after its line wire opens', () => {
  const doc = document([item('source', 's'), item('pv', 'pv', { watts: 100 }), item('heater', 'load', { ohms: 288 })], [['s', 'L', 'pv', 'L'], ['s', 'N', 'pv', 'N', 'N'], ['s', 'L', 'load', 'L'], ['s', 'N', 'load', 'N', 'N']]);
  let result = simulate(doc); assert.ok(result.converged); assert.ok(result.deviceStates.pv.gridPresent);
  doc.faults=[{type:'open-live',wire:'w0',enabled:true}];
  for(let i=0;i<12;i++){result=simulate(doc,result.deviceStates,.25);assert.ok(result.converged,JSON.stringify(result.diagnostics));assert.equal(result.deviceStates.pv.gridPresent,false);}
  assert.equal(result.branchCurrents['pv.gridExport'],undefined);close(result.totalPower,200,.01);
});

test('non-maintained emergency charging differs from maintained SL lighting and battery operation', () => {
  const doc = document([item('source','s'),item('emergency','em',{maintained:false,battery:true})],[['s','L','em','L'],['s','N','em','N','N']]);
  let result=simulate(doc);assert.ok(result.converged);assert.equal(result.deviceStates.em.energized,false);assert.equal(result.deviceStates.em.emergencyActive,false);close(result.componentPower.em,1,.01);
  doc.supply.enabled=false;result=simulate(doc,result.deviceStates);assert.ok(result.deviceStates.em.energized);assert.ok(result.deviceStates.em.emergencyActive);close(result.totalPower,0);
  doc.supply.enabled=true;doc.components[1].params.maintained=true;doc.wires.push({id:'switched',from:e('s','L'),to:e('em','SL'),role:'control',resistance:.01,bends:[]});
  result=simulate(doc,result.deviceStates);assert.ok(result.converged);assert.ok(result.deviceStates.em.normalActive);assert.ok(result.deviceStates.em.energized);
  doc.faults=[{type:'wrong-control',wire:'switched',enabled:true}];result=simulate(doc,result.deviceStates);assert.ok(result.converged);assert.equal(result.deviceStates.em.normalActive,false);assert.equal(result.deviceStates.em.energized,false);assert.equal(result.deviceStates.em.emergencyActive,false);
});

test('conceptual alarm interlink follows actual wire continuity and does not invent signal voltages', () => {
  const doc=document([item('source','s'),item('alarm','a'),item('alarm','b')],[['s','L','a','L'],['s','N','a','N','N'],['s','L','b','L'],['s','N','b','N','N'],['a','LINK','b','LINK','control']]);
  let result=simulate(doc);assert.ok(result.converged);assert.equal(result.deviceStates.a.level,0);assert.equal(result.deviceStates.b.level,0);
  doc.components[1].params.alarm=true;result=simulate(doc,result.deviceStates);assert.ok(result.deviceStates.a.level>0);assert.ok(result.deviceStates.b.level>0);assert.equal(result.wireCurrents.w4,undefined);
  const meter=measureVoltage(result,e('a','LINK'),e('a','N'));assert.equal(meter.value,null);assert.match(meter.explanation,/conceptual wired signal/);
  doc.faults=[{type:'wrong-control',wire:'w4',enabled:true}];result=simulate(doc,result.deviceStates);assert.ok(result.converged);assert.ok(result.deviceStates.a.level>0);assert.equal(result.deviceStates.b.level,0);
  doc.faults=[];doc.supply.enabled=false;result=simulate(doc,result.deviceStates);assert.ok(result.deviceStates.a.level>0);assert.ok(result.deviceStates.b.level>0,'conceptual integral backup can sustain alarm signal operation');
  doc.components[1].params.alarm=false;result=simulate(doc,result.deviceStates);assert.equal(result.deviceStates.a.level,0);assert.equal(result.deviceStates.b.level,0,'received interlink requests must not latch themselves after the source clears');
});

test('lesson 7 detects all three downstream N–PE bridges even with switch off or after RCBO trip', async () => {
  const {LESSONS}=await import('./lessons.ts');
  for(const [from,to] of [[e('supply','PE'),e('protect','NOUT')],[e('light','PE'),e('protect','NOUT')],[e('light','PE'),e('light','N')]]) {
    const doc=structuredClone(LESSONS[6].circuit);
    // Misidentifying the new conductor cannot conceal the physical bridge.
    doc.wires.push({id:'bridge',from,to,role:'L',resistance:.01,bends:[]});
    doc.components.find(c=>c.id==='switch')!.params.closed=false;
    let result=simulate(doc);assert.ok(result.converged);assert.equal(result.deviceStates.protect.tripped,false);assert.equal(result.deviceStates.light.energized,false);
    assert.ok(result.diagnostics.some(d=>d.id.startsWith('neutralEarth:')&&d.wire==='bridge'));close(result.totalCurrent,0,.000001);
    doc.components.find(c=>c.id==='switch')!.params.closed=true;
    result=simulate(doc,result.deviceStates);assert.ok(result.converged);assert.equal(result.deviceStates.protect.tripped,true);assert.equal(result.deviceStates.light.energized,false);
    assert.ok(Number(result.deviceStates.protect.tripResidual)>.03);assert.ok(result.preTrip!.totalCurrent>.24&&result.preTrip!.totalCurrent<.26,'N–PE bridge diverts return current; it is not a high-current short');
    assert.ok(result.events.some(event=>/Residual-current/.test(event.title)));assert.ok(result.diagnostics.some(d=>d.id.startsWith('neutralEarth:')));
    const tripResidual=result.deviceStates.protect.tripResidual;
    result=simulate(doc,result.deviceStates);assert.equal(result.deviceStates.protect.tripResidual,tripResidual);close(Number(result.deviceStates.protect.imbalance),0);
    doc.wires=doc.wires.filter(w=>w.id!=='bridge');doc.components.find(c=>c.id==='protect')!.params.resetToken=1;
    result=simulate(doc,result.deviceStates);assert.equal(result.deviceStates.protect.tripped,false);assert.ok(result.deviceStates.light.energized);assert.equal(result.deviceStates.protect.tripResidual,0);assert.equal(result.diagnostics.some(d=>d.id.startsWith('neutralEarth:')),false);
  }
});

test('N–PE bridge without a connected earth return warns without inventing residual current', async () => {
  const {LESSONS}=await import('./lessons.ts');const doc=structuredClone(LESSONS[6].circuit);
  doc.wires=doc.wires.filter(w=>!(w.from.component==='supply'&&w.from.terminal==='PE'));
  doc.wires.push({id:'floating-bridge',from:e('light','PE'),to:e('light','N'),role:'PE',resistance:.01,bends:[]});
  const result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.light.energized);assert.equal(result.deviceStates.protect.tripped,false);close(Number(result.deviceStates.protect.imbalance),0,.000001);
  assert.ok(result.diagnostics.some(d=>d.id.startsWith('neutralEarth:')));assert.ok(result.diagnostics.some(d=>d.id==='cpc:light'));
});

test('one-way open line and open neutral stop actual current and voltage, not merely a template check', async () => {
  const {LESSONS}=await import('./lessons.ts');
  for(const terminalName of ['L','N']) {
    const doc=structuredClone(LESSONS[6].circuit);doc.wires=doc.wires.filter(w=>!(w.to.component==='light'&&w.to.terminal===terminalName));
    const result=simulate(doc);assert.ok(result.converged);assert.equal(result.deviceStates.light.energized,false);close(result.totalCurrent,0,.000001);close(measureVoltage(result,e('light','L'),e('light','N')).value,0);
    if(terminalName==='N'){assert.ok(result.diagnostics.some(d=>d.id==='neutral:light'));assert.ok(measureVoltage(result,e('light','L'),e('supply','PE')).value!>239);}
  }
});

test('reversed luminaire polarity physically operates but fails the actual-node polarity finding', async () => {
  const {LESSONS}=await import('./lessons.ts');const doc=structuredClone(LESSONS[6].circuit);
  for(const wire of doc.wires)if(wire.to.component==='light'&&['L','N'].includes(wire.to.terminal))wire.to.terminal=wire.to.terminal==='L'?'N':'L';
  const result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.light.energized);assert.equal(result.deviceStates.protect.tripped,false);assert.ok(result.componentPower.light>59);
  assert.ok(result.diagnostics.some(d=>d.id==='polarity:light'));assert.ok(measureVoltage(result,e('light','N'),e('supply','PE')).value!>239);
});

test('neutral switching is reported while retaining correct closed and open circuit physics', async () => {
  const {LESSONS}=await import('./lessons.ts');const doc=structuredClone(LESSONS[6].circuit);
  for(const wire of doc.wires){if(wire.to.component==='switch'&&wire.to.terminal==='COM')wire.from=e('protect','NOUT');else if(wire.from.component==='switch'&&wire.to.component==='light')wire.to=e('light','N');else if(wire.to.component==='light'&&wire.to.terminal==='N')wire.from=e('protect','LOUT'),wire.to=e('light','L');}
  let result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.light.energized);assert.ok(result.diagnostics.some(d=>d.id==='switchedNeutral:switch'));
  doc.components.find(c=>c.id==='switch')!.params.closed=false;result=simulate(doc,result.deviceStates);assert.equal(result.deviceStates.light.energized,false);assert.ok(result.diagnostics.some(d=>d.id==='switchedNeutral:switch'));assert.ok(measureVoltage(result,e('light','L'),e('supply','PE')).value!>239);
});

test('protective earth used as load return trips a connected RCBO but can operate behind an MCB', async () => {
  const {LESSONS}=await import('./lessons.ts');const doc=structuredClone(LESSONS[6].circuit);
  const returnWire=doc.wires.find(w=>w.to.component==='light'&&w.to.terminal==='N')!;returnWire.from=e('supply','PE');returnWire.role='N';
  let result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.protect.tripped);assert.equal(result.deviceStates.light.energized,false);assert.ok(result.diagnostics.some(d=>d.id==='earthReturn:light'));
  const plain=document([item('source','s'),item('mcb','b'),item('lamp','l')],[['s','L','b','IN'],['b','OUT','l','L'],['s','PE','l','N','N'],['s','PE','l','PE','PE']]);
  result=simulate(plain);assert.ok(result.deviceStates.l.energized);assert.equal(result.deviceStates.b.tripped,false);assert.ok(result.diagnostics.some(d=>d.id==='earthReturn:l'));
});

test('a bypass defeats actual switch OFF; a mere conductor-colour change does not change load power', async () => {
  const {LESSONS}=await import('./lessons.ts');const doc=structuredClone(LESSONS[6].circuit);
  doc.components.find(c=>c.id==='switch')!.params.closed=false;doc.wires.push({id:'bypass',from:e('protect','LOUT'),to:e('light','L'),role:'L',resistance:.01,bends:[]});
  let result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.light.energized);assert.ok(result.componentPower.light>59);
  const direct=lampCircuit(),base=simulate(direct);direct.wires[0].role='N';result=simulate(direct);close(result.componentPower.l,base.componentPower.l,.000001);assert.ok(result.diagnostics.some(d=>d.id==='identification:w0'));
  direct.wires[2].role='L';result=simulate(direct);assert.equal(result.diagnostics.some(d=>d.id==='cpc:l'),false,'actual protective continuity does not depend on colour');
});

test('explicit closed and pressed commands override stale on aliases without default masking', () => {
  const doc=document([item('source','s'),item('switch','sw',{closed:false,on:true}),item('lamp','l')],[['s','L','sw','COM'],['sw','OUT','l','L'],['s','N','l','N','N']]);
  assert.equal(simulate(doc).deviceStates.l.energized,false);delete doc.components[1].params.closed;assert.equal(simulate(doc).deviceStates.l.energized,true);doc.components[1].params.on=false;assert.equal(simulate(doc).deviceStates.l.energized,false);
  doc.components[1]=item('thermostat','sw',{closed:false,on:true});assert.equal(simulate(doc).deviceStates.l.energized,false);
  doc.components[1]=item('pushbutton','sw',{pressed:false,on:true});doc.wires[1].from.terminal='NO';assert.equal(simulate(doc).deviceStates.l.energized,false);doc.components[1].params.pressed=true;assert.ok(simulate(doc).deviceStates.l.energized);
});

test('one-way short, leakage and accumulated overload operate only their physical protection models', async () => {
  const {LESSONS}=await import('./lessons.ts');
  for(const fault of ['short-circuit','earth-fault']){const doc=structuredClone(LESSONS[6].circuit);doc.faults=[{type:fault,component:'light',enabled:true}];const result=simulate(doc);assert.ok(result.converged);assert.ok(result.deviceStates.protect.tripped);assert.equal(result.deviceStates.light.energized,false);assert.ok(result.preTrip);assert.ok(fault==='short-circuit'?result.preTrip.totalCurrent>1000:Number(result.deviceStates.protect.tripResidual)>.03);}
  const doc=structuredClone(LESSONS[6].circuit);doc.components.find(c=>c.id==='protect')!.params.rating=.1;doc.faults=[{type:'overload',component:'light',enabled:true}];let result=simulate(doc,{},.1);for(let tick=0;tick<6&&!result.deviceStates.protect.tripped;tick++)result=simulate(doc,result.deviceStates,.1);assert.ok(result.deviceStates.protect.tripped);assert.equal(result.deviceStates.light.energized,false);
});

test('64 distinct authored configurations validate and converge through power-up and control operation', async () => {
  const { LESSONS, validateLessons } = await import('./lessons.ts');
  assert.equal(LESSONS.length, 64); assert.deepEqual(validateLessons(), []);
  for (const lesson of LESSONS) {
    const doc = structuredClone(lesson.circuit); doc.supply.enabled = true;
    let previous = {}, result;
    for (let tick = 0; tick < 24; tick++) {
      for (const component of doc.components) if (component.type === 'pushbutton' && /start|reset/.test(component.id)) component.params.pressed = tick < 2;
      result = simulate(doc, previous, 0.25);
      assert.ok(result.converged, `Lesson${lesson.id} ${lesson.title}, tick${tick}: ${JSON.stringify(result.diagnostics.filter(d => d.severity === 'error'))}`);
      assert.ok(Number.isFinite(result.totalCurrent)); assert.ok(Number.isFinite(result.totalPower));
      previous = result.deviceStates;
    }
  }
});
