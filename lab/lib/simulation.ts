import { COMPONENTS } from './components.ts';
import { endpointKey, type CircuitDocument, type Complex, type ComponentInstance, type DeviceState, type Diagnostic, type Endpoint, type Parameters, type SimulationEvent, type SimulationResult } from './types.ts';

/** Educational RMS model. Conductor/source impedances and trip timing are illustrative.
 * No cable sizing, compliance, transient, arc, motor torque or certified safety analysis.
 */
const MAX_UNKNOWNS = 512;
const EPS = 1e-10;
const GROUND = '@reference';
type C = { re: number; im: number };
type Branch = { key: string; a: string; b: string; z: C; component?: string; power?: boolean };
type VoltageSource = { key: string; a: string; b: string; v: C; component?: string; frequency: number; kind: 'grid' | 'converter' | 'control' };
type CurrentSource = { key: string; a: string; b: string; i: C; component?: string };
type Transformer = { key: string; p: string; n: string; s: string; t: string; ratio: number; component: string };
type Network = { nodes: Set<string>; branches: Branch[]; voltages: VoltageSource[]; currents: CurrentSource[]; transformers: Transformer[]; diagnostics: Diagnostic[] };
type Solved = { voltages: Record<string, Complex>; currents: Record<string, Complex>; sourceCurrents: Record<string, Complex>; residual: number; nodes: number; valid: boolean; reason?: string; frequencies?: Record<string, number> };
const c = (re = 0, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => c(a.re + b.re, a.im + b.im);
const sub = (a: C, b: C): C => c(a.re - b.re, a.im - b.im);
const mul = (a: C, b: C): C => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a: C, f: number): C => c(a.re * f, a.im * f);
const abs = (a?: C): number => a ? Math.hypot(a.re, a.im) : 0;
const div = (a: C, b: C): C => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const power = (v: C, i: C): number => v.re * i.re + v.im * i.im;
const polar = (m: number, angle: number): C => c(m * Math.cos(angle), m * Math.sin(angle));
const clamp = (x: number, low: number, high: number): number => Math.max(low, Math.min(high, x));
const number = (p: Parameters, key: string, fallback: number): number => { const v = Number(p[key]); return Number.isFinite(v) ? v : fallback; };
const flag = (p: Parameters, key: string, fallback = false): boolean => p[key] === undefined ? fallback : p[key] === true || p[key] === 1 || p[key] === 'true';
const terminal = (item: ComponentInstance, name: string): string => `${item.id}.${name}`;
const definition = (item: ComponentInstance) => COMPONENTS[item.type];
const params = (item: ComponentInstance): Parameters => ({ ...definition(item)?.defaults, ...item.params });
// The inspector's maintained contact setting is authoritative. Legacy `on` is
// an alias only when the instance has no explicit `closed` setting.
const closedCommand = (item: ComponentInstance): boolean => item.params.closed !== undefined ? flag(item.params, 'closed', true) : item.params.on !== undefined ? flag(item.params, 'on', true) : flag(params(item), 'closed', true);
const pressedCommand = (item: ComponentInstance): boolean => item.params.pressed !== undefined ? flag(item.params, 'pressed') : item.params.on !== undefined ? flag(item.params, 'on') : flag(params(item), 'pressed');
const isType = (item: ComponentInstance, ...names: string[]) => names.includes(item.type);
const diag = (id: string, title: string, explanation: string, component?: string, severity: Diagnostic['severity'] = 'warning', category: Diagnostic['category'] = 'operation'): Diagnostic => ({ id, title, explanation, component, severity, category });
const loadTypes = new Set(['lamp', 'heater', 'socket', 'motor', 'pump', 'fan', 'chime', 'boiler', 'appliance', 'oven', 'hob', 'immersion', 'shower', 'ev', 'evcharger', 'extractor', 'light', 'led', 'load', 'alarm', 'emergency', 'cooker', 'heatpump', 'indicator']);
const converterTypes = new Set(['driver', 'dcsupply', 'vfd', 'pv', 'battery']);

/** Fixed passive teaching equivalent, not a real electronic dimmer's waveform
 * or heating model. The declared reference is independent of the connected load.
 * Level zero is an open contact; full level retains a small contact resistance.
 * The 1 GΩ numerical limit only bounds extreme imported nonzero settings.
 */
export function getDimmerEquivalentResistance(level: number, referenceOhms = 960): number | null {
  const setting = clamp(Number.isFinite(level) ? level : 0.65, 0, 1);
  if (setting === 0) return null;
  const reference = Math.max(0.001, Number.isFinite(referenceOhms) ? referenceOhms : 960);
  return Math.min(1e9, reference * (1 - setting) / setting + 0.001);
}

function mechanicalPairs(document: CircuitDocument): [string, string][] {
  const result: [string, string][] = [], seen = new Set<string>();
  for (const item of document.components) {
    const partner = String(params(item).mechanicallyInterlockedWith || '');
    if (item.type !== 'contactor' || !partner || partner === item.id || !document.components.some(other => other.id === partner && other.type === 'contactor')) continue;
    const pair = [item.id, partner].sort() as [string, string], key = pair.join('|');
    if (!seen.has(key)) { seen.add(key); result.push(pair); }
  }
  return result;
}

function newState(item: ComponentInstance, previous?: DeviceState): DeviceState {
  const p = params(item);
  const resetToken = number(p, 'resetToken', 0);
  const state: DeviceState = { energized: false, closed: true, tripped: false, level: 0, direction: 0, elapsed: 0, resetToken, details: '', ...previous };
  if (resetToken !== state.resetToken) { state.tripped = false; state.elapsed = 0; state.tripResidual = 0; state.peakResidual = 0; state.resetToken = resetToken; state.resetRequested = true; }
  if (!previous) {
    state.closed = !isType(item, 'contactor', 'relay', 'timer', 'sensor', 'smartrelay', 'safetyRelay', 'plc', 'valve', 'valve3');
    if (item.type === 'battery') state.level = clamp(number(p, 'stateOfCharge', number(p, 'soc', 80) / 100), 0, 1);
  }
  if (isType(item, 'mcb', 'mcb3', 'fuse', 'fcu', 'rcd', 'rcbo', 'rcd3', 'isolator', 'isolator3', 'plug', 'plug3', 'cable', 'panel', 'meter', 'rose', 'changeover')) state.closed = flag(p, 'closed', true) && !state.tripped;
  if (item.type === 'switch') state.closed = closedCommand(item);
  return state;
}

function network(document: CircuitDocument, states: Record<string, DeviceState>, passive = false): Network {
  const net: Network = { nodes: new Set([GROUND]), branches: [], voltages: [], currents: [], transformers: [], diagnostics: [] };
  const items = new Map(document.components.map(item => [item.id, item]));
  const ids = new Set<string>();
  const node = (name: string) => { net.nodes.add(name); return name; };
  const resistor = (key: string, a: string, b: string, resistance: number, component?: string, isPower = true, reactance = 0) => {
    node(a); node(b); net.branches.push({ key, a, b, z: c(Math.max(0.00001, resistance), reactance), component, power: isPower });
  };
  const contact = (item: ComponentInstance, name: string, a: string, b: string, closed: boolean) => {
    if (closed) resistor(`${item.id}.${name}`, terminal(item, a), terminal(item, b), 0.001, item.id, false);
  };
  const source = (key: string, a: string, b: string, voltage: C, component: string, frequency: number, kind: VoltageSource['kind']) => {
    node(a); node(b); net.voltages.push({ key, a, b, v: voltage, component, frequency, kind });
  };
  for (const item of document.components) {
    if (ids.has(item.id)) net.diagnostics.push(diag(`duplicate:${item.id}`, 'Duplicate component ID', 'Every component must have its own stable identity.', item.id, 'error', 'model'));
    ids.add(item.id);
    if (!definition(item)) { net.diagnostics.push(diag(`unknown:${item.id}`, 'Unknown component model', `There is no electrical model for ${item.type}.`, item.id, 'error', 'model')); continue; }
    for (const t of definition(item).terminals) node(terminal(item, t.id));
  }
  const faults = document.faults.filter(f => f.enabled);
  for (const wire of document.wires) {
    const a = endpointKey(wire.from), b = endpointKey(wire.to);
    if (!net.nodes.has(a) || !net.nodes.has(b) || wire.from.component === wire.to.component && wire.from.terminal === wire.to.terminal) {
      net.diagnostics.push({ ...diag(`wire:${wire.id}`, 'Invalid wire endpoint', 'This wire has a missing terminal or joins a terminal to itself.', undefined, 'error', 'model'), wire: wire.id }); continue;
    }
    const open = faults.some(f => (f.wire === wire.id && ['open', 'open-wire', 'open-live', 'open-neutral', 'open-cpc', 'missing-earth', 'phase-loss', 'wrong-control'].includes(f.type)) ||
      (!f.wire && f.component && (f.component === wire.from.component || f.component === wire.to.component) && ((f.type === 'open-neutral' && wire.role === 'N') || (['open-cpc', 'missing-earth'].includes(f.type) && wire.role === 'PE') || (f.type === 'phase-loss' && wire.role === 'L3') || (f.type === 'open-live' && ['L', 'L1'].includes(wire.role)) || (f.type === 'wrong-control' && wire.role === 'control'))));
    if (!open) resistor(`wire:${wire.id}`, a, b, Math.max(0.0001, Number.isFinite(wire.resistance) ? wire.resistance : 0.01), undefined, false);
  }
  for (const item of document.components) {
    if (!definition(item)) continue;
    const p = params(item), state = states[item.id], T = (name: string) => terminal(item, name);
    const has = (name: string) => net.nodes.has(T(name));
    const enabled = document.supply.enabled && !passive;
    const closed = !state.tripped && flag(p, 'closed', true);
    const nominal = number(p, 'ratedVoltage', number(p, 'nominalVoltage', 240));
    const watts = Math.max(0.01, number(p, 'watts', 100));
    const partner = String(p.mechanicallyInterlockedWith || '');
    if (item.type === 'contactor' && partner && (partner === item.id || !items.has(partner) || items.get(partner)?.type !== 'contactor')) net.diagnostics.push(diag(`interlockTarget:${item.id}`, 'Mechanical interlock target is invalid', 'Choose another existing contactor as the mechanically linked partner. Assessment is withheld until the partner is valid.', item.id, 'error', 'model'));
    if (isType(item, 'source', 'source3')) {
      resistor(`${item.id}.neutralBond`, T('N'), GROUND, 0.00001, item.id, false);
      resistor(`${item.id}.earthBond`, T('PE'), GROUND, 0.001, item.id, false);
      if (enabled) {
        const phaseV = item.type === 'source3' ? document.supply.voltage / Math.sqrt(3) : document.supply.voltage;
        for (const [name, angle] of item.type === 'source3' ? [['L1', 0], ['L2', -2 * Math.PI / 3], ['L3', 2 * Math.PI / 3]] as [string, number][] : [['L', 0]] as [string, number][]) {
          const inner = node(`@${item.id}:${name}`);
          source(`${item.id}.source${name}`, inner, GROUND, polar(phaseV, angle), item.id, document.supply.frequency, 'grid');
          resistor(`${item.id}.feed${name}`, inner, T(name), Math.max(0.001, document.supply.sourceResistance || 0.12), item.id, false);
        }
      }
    } else if (isType(item, 'mcb', 'fuse', 'cable')) {
      contact(item, 'main', 'IN', 'OUT', closed);
    } else if (isType(item, 'rcd', 'rcbo', 'isolator', 'fcu')) {
      contact(item, 'L', 'LIN', 'LOUT', closed); contact(item, 'N', 'NIN', 'NOUT', closed);
    } else if (isType(item, 'rcd3', 'isolator3', 'mcb3', 'plug3')) {
      for (const name of ['L1', 'L2', 'L3', 'N']) if (has(`${name}IN`) && has(`${name}OUT`)) contact(item, name, `${name}IN`, `${name}OUT`, closed);
      if (has('PEOUT')) contact(item, 'PE', 'PE', 'PEOUT', true);
    } else if (isType(item, 'switch', 'thermostat', 'cutout')) {
      const thermalClosed = item.type === 'thermostat' ? number(p, 'temperature', 18) < number(p, 'setpoint', 21) : item.type === 'cutout' ? number(p, 'temperature', 20) < number(p, 'setpoint', 85) : true;
      contact(item, 'contact', 'COM', 'OUT', closedCommand(item) && !state.tripped && thermalClosed);
    } else if (item.type === 'dimmer') {
      const level = clamp(number(p, 'level', 0.65), 0, 1);
      const resistance = getDimmerEquivalentResistance(level, number(p, 'referenceOhms', 960));
      if (closedCommand(item) && !state.tripped && resistance !== null) resistor(`${item.id}.dimming`, T('COM'), T('OUT'), resistance, item.id);
    } else if (item.type === 'switch2') {
      contact(item, 'throw', 'COM', number(p, 'position', 0) === 0 ? 'T1' : 'T2', true);
    } else if (item.type === 'intermediate') {
      const swapped = number(p, 'position', 0) !== 0;
      contact(item, 'a', 'A', swapped ? 'D' : 'C', true); contact(item, 'b', 'B', swapped ? 'C' : 'D', true);
    } else if (item.type === 'pushbutton') {
      const pressed = pressedCommand(item);
      contact(item, 'NO', 'COM', 'NO', pressed); contact(item, 'NC', 'COM', 'NC', !pressed);
    } else if (item.type === 'selector') {
      const pos = String(p.position) === 'B' ? 1 : number(p, 'position', 0);
      if (pos >= 0) contact(item, 'selection', 'COM', pos === 0 ? 'A' : 'B', closed);
    } else if (item.type === 'changeover') {
      const alternate = number(p, 'position', 0) !== 0;
      contact(item, 'line', alternate ? 'B' : 'A', 'OUT', closed);
      contact(item, 'neutral', alternate ? 'BN' : 'AN', 'NOUT', closed);
    } else if (isType(item, 'relay', 'contactor')) {
      resistor(`${item.id}.coil`, T('A1'), T('A2'), nominal * nominal / Math.max(0.1, number(p, 'coilWatts', 8)), item.id);
      if (item.type === 'relay') { contact(item, 'NO', 'COM', 'NO', state.closed); contact(item, 'NC', 'COM', 'NC', !state.closed); }
      else {
        for (const [a, b] of [['1', '2'], ['3', '4'], ['5', '6'], ['13', '14']]) contact(item, `contact${a}`, a, b, state.closed);
        contact(item, 'contact21', '21', '22', !state.closed);
      }
    } else if (item.type === 'overload') {
      for (const [a, b] of [['1', '2'], ['3', '4'], ['5', '6']]) contact(item, `phase${a}`, a, b, true);
      contact(item, 'auxiliary', '95', '96', !state.tripped);
    } else if (isType(item, 'timer', 'sensor', 'smartrelay')) {
      resistor(`${item.id}.electronics`, T('L'), T('N'), nominal * nominal / 2, item.id);
      resistor(`${item.id}.input`, T('IN'), T('N'), 100000, item.id, false);
      contact(item, 'output', 'L', 'OUT', state.closed);
    } else if (isType(item, 'valve', 'valve3')) {
      resistor(`${item.id}.standby`, T('L'), T('N'), nominal * nominal / 0.5, item.id);
      const moving = !!state.moving;
      if (item.type === 'valve') resistor(`${item.id}.actuator`, T('CALL'), T('N'), nominal * nominal / (moving ? Math.max(1, number(p, 'watts', 6)) : 0.05), item.id);
      else for (const call of ['CH', 'HW']) resistor(`${item.id}.actuator${call}`, T(call), T('N'), nominal * nominal / (moving ? Math.max(1, number(p, 'watts', 6)) : 0.05), item.id);
      if (has('CALL2')) resistor(`${item.id}.secondInput`, T('CALL2'), T('N'), 100000, item.id, false);
      contact(item, 'endSwitch', 'L', 'END', item.type === 'valve3' ? state.closed : state.level >= 0.99);
    } else if (item.type === 'motor3') {
      const windingV = number(p, 'windingVoltage', 230), pf = clamp(number(p, 'powerFactor', 0.8), 0.1, 1);
      const overloadFactor = faults.some(f => f.component === item.id && f.type === 'overload') ? 4 : 1;
      const perPhaseP = watts * overloadFactor / 3, zMagnitude = windingV * windingV * pf / perPhaseP;
      const frequency = number(p, 'frequency', Number(state.frequency) || document.supply.frequency);
      for (const name of ['U', 'V', 'W']) resistor(`${item.id}.winding${name}`, T(`${name}1`), T(`${name}2`), zMagnitude * pf, item.id, true, zMagnitude * Math.sqrt(1 - pf * pf) * frequency / 50);
    } else if (item.type === 'transformer') {
      const pin = node(`@${item.id}:primary`), sout = node(`@${item.id}:secondary`);
      resistor(`${item.id}.primaryResistance`, T('L'), pin, number(p, 'primaryResistance', 0.2), item.id, false);
      resistor(`${item.id}.magnetizingLoss`, pin, T('N'), nominal * nominal / 0.2, item.id);
      resistor(`${item.id}.secondaryResistance`, sout, T('+'), number(p, 'outputResistance', 0.05), item.id, false);
      net.transformers.push({ key: `${item.id}.transformer`, p: pin, n: T('N'), s: sout, t: T('-'), ratio: nominal / Math.max(1, number(p, 'outputVoltage', 24)), component: item.id });
    } else if (isType(item, 'driver', 'dcsupply')) {
      const inPower = Math.max(0.2, Number(state.inputWatts) || 0.2);
      resistor(`${item.id}.input`, T('L'), T('N'), nominal * nominal / inPower, item.id);
      if (enabled && state.energized && Number(state.regulatedVoltage) > 0) {
        const inner = node(`@${item.id}:output`);
        source(`${item.id}.outputSource`, inner, T('-'), c(Number(state.regulatedVoltage)), item.id, 0, 'converter');
        resistor(`${item.id}.outputResistance`, inner, T('+'), Math.max(0.001, number(p, 'outputResistance', 0.05)), item.id, false);
      }
    } else if (item.type === 'vfd') {
      const star = node(`@${item.id}:inputStar`), inputP = Math.max(2, Number(state.inputWatts) || 2);
      const phaseV = document.supply.voltage / Math.sqrt(3);
      for (const name of ['L1', 'L2', 'L3']) resistor(`${item.id}.input${name}`, T(name), star, phaseV * phaseV / (inputP / 3), item.id);
      if (enabled && state.energized) {
        const control = node(`@${item.id}:control`);
        source(`${item.id}.controlSource`, control, T('COM'), c(24), item.id, 0, 'control');
        resistor(`${item.id}.runSense`, control, T('RUN'), 1000, item.id, false);
        if (state.closed) {
          const outStar = node(`@${item.id}:outputStar`), lineV = Number(state.regulatedVoltage) || number(p, 'outputVoltage', 400);
          for (const [name, angle] of [['U', 0], ['V', -2 * Math.PI / 3], ['W', 2 * Math.PI / 3]] as [string, number][]) {
            const inner = node(`@${item.id}:${name}`);
            source(`${item.id}.output${name}`, inner, outStar, polar(lineV / Math.sqrt(3), angle), item.id, number(p, 'frequency', 50), 'converter');
            resistor(`${item.id}.outputResistance${name}`, inner, T(name), Math.max(0.01, number(p, 'outputResistance', 0.1)), item.id, false);
          }
        }
      }
    } else if (isType(item, 'pv', 'battery')) {
      const available = item.type === 'pv' ? Math.max(0, number(p, 'watts', number(p, 'generation', 600)) * clamp(number(p, 'irradiance', number(p, 'availability', 1)), 0, 1)) : state.level > 0.01 || state.gridPresent ? Math.max(0, number(p, 'watts', 1000)) : 0;
      if (!passive && flag(p, 'on', true) && available > 0 && has('+') && Number(state.regulatedVoltage) > 0) {
        const inner = node(`@${item.id}:DC`);
        source(`${item.id}.dcSource`, inner, T('-'), c(Number(state.regulatedVoltage)), item.id, 0, 'converter');
        resistor(`${item.id}.dcResistance`, inner, T('+'), Math.max(0.01, number(p, 'outputResistance', 0.2)), item.id, false);
      }
      if (!passive && flag(p, 'on', true) && document.supply.enabled && state.gridPresent && abs(c(Number(state.gridRe) || 0, Number(state.gridIm) || 0)) > 100) {
        const v = c(Number(state.gridRe), Number(state.gridIm));
        const exportP = Math.max(0, Math.min(available - (Number(state.outputPower) || 0), number(p, 'exportWatts', item.type === 'battery' ? number(p, 'generation', 0) : available)));
        const i = scale(v, exportP / (abs(v) ** 2));
        net.currents.push({ key: `${item.id}.gridExport`, a: T('N'), b: T('L'), i, component: item.id });
      }
      if (item.type === 'battery' && !passive && flag(p, 'on', true) && available > 0 && has('BL') && String(p.mode || 'backup') === 'backup') {
        const inner = node(`@${item.id}:backup`);
        source(`${item.id}.backupSource`, inner, T('BN'), c(Number(state.regulatedVoltage) || number(p, 'backupVoltage', number(p, 'outputVoltage', 240))), item.id, 50, 'converter');
        resistor(`${item.id}.backupResistance`, inner, T('BL'), number(p, 'backupResistance', 0.12), item.id, false);
        if (state.gridPresent) resistor(`${item.id}.gridInput`, T('L'), T('N'), nominal * nominal / Math.max(0.2, Number(state.inputWatts) || 0.2), item.id);
      }
      resistor(`${item.id}.gridSense`, T('L'), T('N'), 1000000, item.id, false);
    } else if (item.type === 'plc') {
      resistor(`${item.id}.electronics`, T('L'), T('N'), nominal * nominal / 5, item.id);
      for (const name of ['I1', 'I2']) resistor(`${item.id}.sense${name}`, T(name), T('N'), 100000, item.id, false);
      contact(item, 'Q1', 'COM', 'Q1', state.closed); contact(item, 'Q2', 'COM', 'Q2', !!state.output2);
    } else if (item.type === 'safetyRelay') {
      resistor(`${item.id}.electronics`, T('L'), T('N'), nominal * nominal / 4, item.id);
      for (const name of ['S1', 'S2', 'RESET', 'FB']) resistor(`${item.id}.sense${name}`, T(name), T('N'), 100000, item.id, false);
      contact(item, 'safetyOutput', 'COM', 'OUT', state.closed);
    } else if (isType(item, 'junction', 'terminal', 'neutralbar', 'earthbar')) {
      const terms = definition(item).terminals.map(t => t.id);
      for (let i = 1; i < terms.length; i++) contact(item, `link${i}`, terms[0], terms[i], true);
    } else if (isType(item, 'panel', 'meter', 'rose', 'plug')) {
      for (const name of ['L', 'N', 'PE']) contact(item, name === 'L' && item.type === 'plug' ? 'main' : `link${name}`, name, `${name}OUT`, name === 'PE' || closed);
    } else if (item.type === 'socket3') {
      for (const name of ['L1', 'L2', 'L3']) resistor(`${item.id}.load${name}`, T(name), T('N'), (document.supply.voltage / Math.sqrt(3)) ** 2 / (watts / 3), item.id);
    } else if (item.type === 'spd') {
      resistor(`${item.id}.standby`, T('L'), T('PE'), 1e9, item.id, false);
    } else if (isType(item, 'conduit', 'multimeter', 'clamp')) {
      // No conductive terminals: these are inspection and measurement tools.
    } else if (loadTypes.has(item.type) || has('L') && has('N') && !converterTypes.has(item.type)) {
      let factor = faults.some(f => f.component === item.id && f.type === 'overload') ? 4 : 1;
      if (item.type === 'emergency') factor = state.normalActive ? 1 : Math.max(0.01, number(p, 'standbyWatts', 1)) / watts;
      const resistance = number(p, 'ohms', nominal * nominal / watts) / factor;
      const pf = isType(item, 'motor', 'pump', 'fan', 'heatpump') ? clamp(number(p, 'powerFactor', 0.8), 0.1, 1) : 1;
      resistor(`${item.id}.load`, T('L'), T('N'), resistance * pf * pf, item.id, true, resistance * pf * Math.sqrt(1 - pf * pf));
      if (has('SL')) resistor(`${item.id}.switchedInput`, T('SL'), T('N'), 100000, item.id, false);
      // Alarm LINK is a conceptual wired signal bus. Its proprietary voltage/waveform is not modelled.
    } else {
      net.diagnostics.push(diag(`unsupported:${item.id}`, 'Unmodelled component', 'This component has no active electrical model. Measurements and assessment are withheld.', item.id, 'error', 'model'));
    }
  }
  for (const f of faults) {
    const item = f.component ? items.get(f.component) : undefined;
    if (!item) continue;
    const ts = definition(item)?.terminals.map(t => t.id) || [];
    const live = ['L', 'LIN', 'IN', 'L1', 'U1', 'COM', 'CALL'].find(t => ts.includes(t));
    const neutral = ['N', 'NIN', 'V1', 'OUT'].find(t => ts.includes(t));
    if (f.type === 'short-circuit' && live && neutral) resistor(`fault:${item.id}:short`, terminal(item, live), terminal(item, neutral), 0.001, undefined, false);
    if (f.type === 'earth-fault' && live && ts.includes('PE')) resistor(`fault:${item.id}:earth`, terminal(item, live), terminal(item, 'PE'), number(params(item), 'faultResistance', 100), undefined, false);
    if (f.type === 'stuck-contact' && ts.includes('COM') && ts.includes('OUT')) resistor(`fault:${item.id}:stuck`, terminal(item, 'COM'), terminal(item, 'OUT'), 0.001, undefined, false);
  }
  return net;
}

class Union {
  parent = new Map<string, string>();
  find(x: string): string { const p = this.parent.get(x); if (!p) { this.parent.set(x, x); return x; } if (p === x) return x; const root = this.find(p); this.parent.set(x, root); return root; }
  join(a: string, b: string) { const x = this.find(a), y = this.find(b); if (x !== y) this.parent.set(y, x); }
}
const PATH_DEVICES = new Set(['mcb','mcb3','fuse','fcu','rcd','rcbo','rcd3','isolator','isolator3','panel','meter','rose','plug','plug3','cable','switch','switch2','intermediate','selector','changeover','junction','terminal','earthbar','neutralbar','contactor','relay','overload','thermostat','cutout','timer','sensor','smartrelay','plc','safetyRelay','valve','valve3']);
function contactPaths(document: CircuitDocument, net: Network): Union {
  const paths = new Union(), itemMap = new Map(document.components.map(item => [item.id, item]));
  for (const b of net.branches) if (b.key.startsWith('wire:') || !b.power && b.component && PATH_DEVICES.has(itemMap.get(b.component)?.type || '')) paths.join(b.a, b.b);
  return paths;
}

/** Installation findings follow conductor endpoints and actual contact paths.
 * Loads, electronics inputs and the source's intentional N/PE reference bonds
 * do not count as installation links. Wire colours never change the solver. */
function installationPaths(document: CircuitDocument, net: Network, omit?: string): Union {
  const paths = new Union(), items = new Map(document.components.map(item => [item.id, item]));
  for (const b of net.branches) {
    if (b.key.startsWith('wire:')) paths.join(b.a, b.b);
    else if (b.component !== omit && !b.power && b.component && PATH_DEVICES.has(items.get(b.component)?.type || '') && (b.z.re <= 1 || b.key.endsWith('.dimming'))) paths.join(b.a, b.b);
  }
  return paths;
}
function installationDiagnostics(document: CircuitDocument, net: Network, solved: Solved): Diagnostic[] {
  const findings: Diagnostic[] = [], paths = installationPaths(document, net);
  const sources = document.components.filter(item => isType(item, 'source', 'source3'));
  const active = new Set(sources.flatMap(item => (item.type === 'source3' ? ['L1','L2','L3'] : ['L']).map(name => paths.find(terminal(item, name)))));
  const neutral = new Set(sources.map(item => paths.find(terminal(item, 'N'))));
  const protective = new Set(document.components.flatMap(item => (definition(item)?.terminals || []).filter(t => t.role === 'PE').map(t => paths.find(terminal(item, t.id)))));
  const mainsNeutrals = document.components.flatMap(item => (definition(item)?.terminals || []).filter(t => t.role === 'N' && ['N','NIN','NOUT'].includes(t.id) && !isType(item, 'source', 'source3')).map(t => ({item, name:terminal(item,t.id)})));
  const reported = new Set<string>();
  for (const {item,name} of mainsNeutrals) {
    const group = paths.find(name);
    if (!protective.has(group) || reported.has(group)) continue;
    reported.add(group);
    const wire = document.wires.find(w => {
      const a = document.components.find(c => c.id === w.from.component), b = document.components.find(c => c.id === w.to.component);
      const ar = a && definition(a)?.terminals.find(t => t.id === w.from.terminal)?.role, br = b && definition(b)?.terminals.find(t => t.id === w.to.terminal)?.role;
      return paths.find(endpointKey(w.from)) === group && (ar === 'PE' && br === 'N' || ar === 'N' && br === 'PE');
    });
    findings.push({...diag(`neutralEarth:${name}`, 'Neutral and protective earth are linked', 'Actual wiring joins a normal neutral terminal to a protective terminal outside the source reference bond. With a load operating, some return current can bypass residual-current monitoring. This is not a line-to-neutral short: N and PE may be near the same potential. The wiring finding remains when the switch is off or protection has opened.', item.id, 'warning', 'protection'), ...(wire ? {wire:wire.id} : {})});
  }
  for (const item of document.components) {
    const ts = definition(item)?.terminals || [];
    if (loadTypes.has(item.type) && ts.some(t => t.id === 'L' && t.role === 'L') && ts.some(t => t.id === 'N' && t.role === 'N')) {
      const l = paths.find(terminal(item,'L')), n = paths.find(terminal(item,'N'));
      if (neutral.has(l) && active.has(n) && !active.has(l)) findings.push(diag(`polarity:${item.id}`, 'Line and neutral are reversed at the load', 'The terminal marked N is connected to the active supply path and L to the neutral path. The represented AC impedance can still operate; successful illumination does not establish correct polarity.', item.id, 'warning', 'protection'));
      if (protective.has(l) || protective.has(n)) findings.push(diag(`earthReturn:${item.id}`, 'Protective terminal is used in the load circuit', 'A normal L/N load terminal shares an actual conductor path with a protective terminal. Protective earth is not a normal load return. Whether the load operates or protection trips follows the real modelled paths and currents.', item.id, 'warning', 'protection'));
    }
    if (['switch','switch2','intermediate','dimmer','thermostat','cutout','pushbutton','selector'].includes(item.type)) {
      const without = installationPaths(document,net,item.id);
      const ns = new Set(sources.map(s => without.find(terminal(s,'N')))), ls = new Set(sources.flatMap(s => (s.type==='source3'?['L1','L2','L3']:['L']).map(t => without.find(terminal(s,t)))));
      if (ts.some(t => ns.has(without.find(terminal(item,t.id))) && !ls.has(without.find(terminal(item,t.id))))) findings.push(diag(`switchedNeutral:${item.id}`, 'Single-pole control is in the neutral path', 'A contact terminal is connected to the actual supply-neutral path. Opening this control can stop the load while leaving its line terminal live. The model does not suppress physically valid operation when the contact closes.', item.id, 'warning', 'protection'));
    }
    for (const t of ts.filter(t=>t.role==='PE')) {
      const v = solved.voltages[terminal(item,t.id)];
      if (v?.reference==='mains' && abs(v)>50) findings.push(diag(`livePE:${item.id}:${t.id}`, 'Protective terminal is at live potential', `${abs(v).toFixed(1)} V exists between this protective terminal and the supply reference. Inspect the actual conductor endpoints; colour alone does not establish a protective connection.`, item.id, 'warning', 'protection'));
    }
  }
  for (const wire of document.wires) {
    if (!net.branches.some(b=>b.key===`wire:${wire.id}`)) continue;
    const root=paths.find(endpointKey(wire.from));
    const mismatch=wire.role==='N'&&active.has(root)&&!neutral.has(root)||['L','L1','L2','L3'].includes(wire.role)&&neutral.has(root)&&!active.has(root)||wire.role==='PE'&&!protective.has(root);
    if(mismatch) findings.push({...diag(`identification:${wire.id}`, 'Conductor identification conflicts with its connections', 'The selected conductor identification disagrees with its actual active, neutral or protective path. Identification does not alter current flow or make an incorrect connection electrically correct.', undefined, 'warning', 'protection'),wire:wire.id});
  }
  return findings;
}

/** Dense scaled partial-pivot complex LU; exported for independent numerical tests. */
export function solveComplexLinear(ar: Float64Array, ai: Float64Array, br: Float64Array, bi: Float64Array, n: number): { re: Float64Array; im: Float64Array; residual: number } {
  const originalR = ar.slice(), originalI = ai.slice(), originalBr = br.slice(), originalBi = bi.slice();
  for (let row = 0; row < n; row++) {
    let largest = 0;
    for (let col = 0; col < n; col++) largest = Math.max(largest, Math.hypot(ar[row * n + col], ai[row * n + col]));
    if (largest < EPS) throw new Error('Singular network: a voltage or return reference is unresolved.');
    for (let col = 0; col < n; col++) { ar[row * n + col] /= largest; ai[row * n + col] /= largest; }
    br[row] /= largest; bi[row] /= largest;
  }
  for (let col = 0; col < n; col++) {
    let pivot = col, largest = 0;
    for (let row = col; row < n; row++) { const magnitude = Math.hypot(ar[row * n + col], ai[row * n + col]); if (magnitude > largest) { largest = magnitude; pivot = row; } }
    if (largest < 1e-12) throw new Error('Singular or ill-conditioned network. Check ideal source conflicts and floating connections.');
    if (pivot !== col) {
      for (let k = 0; k < n; k++) { const a = col * n + k, b = pivot * n + k; [ar[a], ar[b]] = [ar[b], ar[a]]; [ai[a], ai[b]] = [ai[b], ai[a]]; }
      [br[col], br[pivot]] = [br[pivot], br[col]]; [bi[col], bi[pivot]] = [bi[pivot], bi[col]];
    }
    const pr = ar[col * n + col], pi = ai[col * n + col], d = pr * pr + pi * pi;
    for (let row = col + 1; row < n; row++) {
      const index = row * n + col, fr = (ar[index] * pr + ai[index] * pi) / d, fi = (ai[index] * pr - ar[index] * pi) / d;
      ar[index] = 0; ai[index] = 0;
      for (let k = col + 1; k < n; k++) { const j = row * n + k, q = col * n + k; ar[j] -= fr * ar[q] - fi * ai[q]; ai[j] -= fr * ai[q] + fi * ar[q]; }
      const oldBr = br[row]; br[row] = oldBr - fr * br[col] + fi * bi[col]; bi[row] -= fr * bi[col] + fi * br[col];
    }
  }
  const xr = new Float64Array(n), xi = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let vr = br[row], vi = bi[row];
    for (let k = row + 1; k < n; k++) { const j = row * n + k; vr -= ar[j] * xr[k] - ai[j] * xi[k]; vi -= ar[j] * xi[k] + ai[j] * xr[k]; }
    const j = row * n + row, d = ar[j] * ar[j] + ai[j] * ai[j]; xr[row] = (vr * ar[j] + vi * ai[j]) / d; xi[row] = (vi * ar[j] - vr * ai[j]) / d;
    if (!Number.isFinite(xr[row]) || !Number.isFinite(xi[row])) throw new Error('Numerical result is not finite.');
  }
  let error = 0, magnitude = 1;
  for (let row = 0; row < n; row++) {
    let vr = -originalBr[row], vi = -originalBi[row], sum = Math.hypot(originalBr[row], originalBi[row]);
    for (let k = 0; k < n; k++) { const j = row * n + k; vr += originalR[j] * xr[k] - originalI[j] * xi[k]; vi += originalR[j] * xi[k] + originalI[j] * xr[k]; sum += Math.hypot(originalR[j], originalI[j]) * Math.hypot(xr[k], xi[k]); }
    error = Math.max(error, Math.hypot(vr, vi)); magnitude = Math.max(magnitude, sum);
  }
  return { re: xr, im: xi, residual: error / magnitude };
}

function solve(net: Network, forcePassive = false, probes?: [string, string]): Solved {
  const union = new Union();
  for (const node of net.nodes) union.find(node);
  for (const b of net.branches) union.join(b.a, b.b);
  for (const s of net.voltages) union.join(s.a, s.b);
  for (const s of net.currents) union.join(s.a, s.b);
  // Each winding has an independent common-mode reference; a transformer does not bond them.
  for (const t of net.transformers) { union.join(t.p, t.n); union.join(t.s, t.t); }
  const groups = new Map<string, string[]>();
  for (const node of net.nodes) { const root = union.find(node); groups.set(root, [...(groups.get(root) || []), node]); }
  const mainRoot = union.find(GROUND), active = new Set<string>([mainRoot]);
  for (const s of net.voltages) active.add(union.find(s.a));
  for (const s of net.currents) if (abs(s.i) > EPS) active.add(union.find(s.a));
  if (probes) active.add(union.find(probes[0]));
  for (let i = 0; i < net.transformers.length + 1; i++) for (const t of net.transformers) {
    const p = union.find(t.p), s = union.find(t.s); if (active.has(p) || active.has(s)) { active.add(p); active.add(s); }
  }
  const anchors = new Set<string>([GROUND]);
  const references = new Map<string, string>();
  for (const [root, nodes] of groups) if (active.has(root)) {
    if (root === mainRoot) references.set(root, 'mains');
    else { const anchor = nodes.filter(n => !n.startsWith('@')).sort()[0] || nodes[0]; anchors.add(anchor); references.set(root, `isolated:${anchor}`); }
  }
  const domain = new Map<string, Set<number>>();
  for (const s of net.voltages) { const root = union.find(s.a); const set = domain.get(root) || new Set<number>(); set.add(s.frequency); domain.set(root, set); }
  for (let i = 0; i < net.transformers.length + 1; i++) for (const t of net.transformers) {
    const pr = union.find(t.p), sr = union.find(t.s), set = new Set([...(domain.get(pr) || []), ...(domain.get(sr) || [])]);
    if (set.size) { domain.set(pr, set); domain.set(sr, set); }
  }
  for (const set of domain.values()) if (set.size > 1) return { voltages: {}, currents: {}, sourceCurrents: {}, residual: 1, nodes: 0, valid: false, reason: 'AC/DC or different-frequency sources are connected to the same conductive network. This RMS model cannot combine their waveforms.' };
  const names = [...net.nodes].filter(n => active.has(union.find(n)) && !anchors.has(n));
  const idx = new Map(names.map((name, i) => [name, i]));
  const vs = net.voltages.filter(s => active.has(union.find(s.a)));
  const tx = net.transformers.filter(t => active.has(union.find(t.p)));
  const count = names.length + vs.length + tx.length;
  if (count > MAX_UNKNOWNS) return { voltages: {}, currents: {}, sourceCurrents: {}, residual: 1, nodes: count, valid: false, reason: `The build has ${count} electrical unknowns; the current educational solver limit is ${MAX_UNKNOWNS}.` };
  const ar = new Float64Array(count * count), ai = new Float64Array(count * count), br = new Float64Array(count), bi = new Float64Array(count);
  const stamp = (row: number | undefined, col: number | undefined, value: C) => { if (row !== undefined && col !== undefined) { ar[row * count + col] += value.re; ai[row * count + col] += value.im; } };
  const rhs = (name: string, value: C) => { const index = idx.get(name); if (index !== undefined) { br[index] += value.re; bi[index] += value.im; } };
  for (const b of net.branches) {
    const a = idx.get(b.a), d = idx.get(b.b), g = div(c(1), b.z);
    stamp(a, a, g); stamp(d, d, g); stamp(a, d, scale(g, -1)); stamp(d, a, scale(g, -1));
  }
  vs.forEach((s, i) => { const k = names.length + i, a = idx.get(s.a), b = idx.get(s.b); stamp(a, k, c(1)); stamp(b, k, c(-1)); stamp(k, a, c(1)); stamp(k, b, c(-1)); br[k] = s.v.re; bi[k] = s.v.im; });
  tx.forEach((t, i) => {
    const k = names.length + vs.length + i;
    for (const [name, coefficient] of [[t.p, 1], [t.n, -1], [t.s, -t.ratio], [t.t, t.ratio]] as [string, number][]) { stamp(idx.get(name), k, c(coefficient)); stamp(k, idx.get(name), c(coefficient)); }
  });
  for (const s of net.currents) { rhs(s.a, scale(s.i, -1)); rhs(s.b, s.i); }
  if (probes) { rhs(probes[0], c(1)); rhs(probes[1], c(-1)); }
  let solution: ReturnType<typeof solveComplexLinear>;
  try { solution = count ? solveComplexLinear(ar, ai, br, bi, count) : { re: new Float64Array(), im: new Float64Array(), residual: 0 }; }
  catch (error) { return { voltages: {}, currents: {}, sourceCurrents: {}, residual: 1, nodes: count, valid: false, reason: error instanceof Error ? error.message : 'Unable to solve electrical network.' }; }
  const voltages: Record<string, Complex> = {}, currents: Record<string, Complex> = {}, sourceCurrents: Record<string, Complex> = {};
  for (const name of net.nodes) if (active.has(union.find(name))) { const i = idx.get(name); voltages[name] = { re: i === undefined ? 0 : solution.re[i], im: i === undefined ? 0 : solution.im[i], reference: references.get(union.find(name)) }; }
  for (const b of net.branches) currents[b.key] = voltages[b.a] && voltages[b.b] ? div(sub(voltages[b.a], voltages[b.b]), b.z) : c();
  vs.forEach((s, i) => { const k = names.length + i; sourceCurrents[s.key] = c(solution.re[k], solution.im[k]); });
  tx.forEach((t, i) => { const k = names.length + vs.length + i; sourceCurrents[t.key] = c(solution.re[k], solution.im[k]); });
  for (const s of net.currents) currents[s.key] = s.i;
  const frequencies = Object.fromEntries([...net.nodes].map(name => [name, [...(domain.get(union.find(name)) || [])][0] ?? 0]));
  return { voltages, currents, sourceCurrents, residual: solution.residual, nodes: count, valid: solution.residual < 1e-7, frequencies };
}

function voltage(solved: Solved, a: string, b: string): C | undefined {
  const av = solved.voltages[a], bv = solved.voltages[b];
  return av && bv && av.reference === bv.reference ? sub(av, bv) : undefined;
}

function evaluate(document: CircuitDocument, solved: Solved, net: Network, states: Record<string, DeviceState>, previous: Record<string, DeviceState>, dt: number, events: SimulationEvent[]): boolean {
  let changed = false;
  const set = (state: DeviceState, key: string, value: number | boolean) => { const old = state[key]; if (typeof value === 'number' && typeof old === 'number' ? Math.abs(value - old) > Math.max(0.00001, Math.abs(value) * 0.0002) : old !== value) { state[key] = value; changed = true; } };
  const getV = (item: ComponentInstance, a: string, b: string) => voltage(solved, terminal(item, a), terminal(item, b));
  // A grid-following inverter must not infer grid presence from its own injected voltage.
  // Trace conductor and closed-contact paths, excluding loads/sense impedances/source bonds.
  const gridPaths = contactPaths(document, net);
  const gridSources = document.components.filter(item => isType(item, 'source', 'source3') && net.voltages.some(s => s.kind === 'grid' && s.component === item.id));
  const gridConnected = (item: ComponentInstance) => gridSources.some(source => {
    const names = source.type === 'source3' ? ['L1','L2','L3'] : ['L'];
    return names.some(name => gridPaths.find(terminal(item,'L')) === gridPaths.find(terminal(source,name))) && gridPaths.find(terminal(item,'N')) === gridPaths.find(terminal(source,'N'));
  });
  const signalledLinkGroups = new Set(document.components.filter(item => {
    if (item.type !== 'alarm') return false;
    const p = params(item), nominal = number(p, 'ratedVoltage', number(p, 'nominalVoltage', 240));
    const hasPower = abs(getV(item, 'L', 'N')) > nominal * 0.5 || flag(p, 'battery', true) && number(p, 'batteryCharge', 1) > 0;
    return hasPower && flag(p, 'alarm');
  }).map(item => gridPaths.find(terminal(item, 'LINK'))));
  const coilRequests = new Map<string, boolean>();
  for (const item of document.components) if (isType(item, 'contactor', 'relay')) {
    const p = params(item), state = states[item.id], nominal = number(p, 'ratedVoltage', number(p, 'nominalVoltage', 240));
    coilRequests.set(item.id, !state.tripped && abs(getV(item, 'A1', 'A2')) >= nominal * (state.closed ? number(p, 'dropoutRatio', 0.2) : number(p, 'pickupRatio', 0.8)));
  }
  const mechanicallyBlocked = new Set<string>();
  for (const [a, b] of mechanicalPairs(document)) if (coilRequests.get(a) && coilRequests.get(b)) {
    if (states[a].closed && !states[b].closed) mechanicallyBlocked.add(b);
    else if (states[b].closed && !states[a].closed) mechanicallyBlocked.add(a);
    else { mechanicallyBlocked.add(a); mechanicallyBlocked.add(b); }
  }
  const trip = (item: ComponentInstance, state: DeviceState, title: string, detail: string) => {
    if (!state.tripped) { state.tripped = true; state.closed = false; changed = true; events.push({ time: dt, title, detail, component: item.id }); }
    state.details = detail;
  };
  for (const item of document.components) {
    const p = params(item), state = states[item.id], old = previous[item.id];
    const nominal = number(p, 'ratedVoltage', number(p, 'nominalVoltage', 240)), supplyV = getV(item, 'L', 'N'), supplyMagnitude = abs(supplyV);
    const powered = supplyMagnitude > nominal * 0.5;
    if (isType(item, 'source', 'source3')) { state.energized = document.supply.enabled; state.details = item.type === 'source3' ? `${document.supply.voltage.toFixed(1)} V line-to-line, ${(document.supply.voltage / Math.sqrt(3)).toFixed(1)} V phase-to-neutral.` : `${document.supply.voltage.toFixed(1)} V RMS source.`; }
    else if (isType(item, 'thermostat', 'cutout')) {
      const requested = closedCommand(item) && number(p, 'temperature', 18) < number(p, 'setpoint', item.type === 'cutout' ? 85 : 21);
      if (item.type === 'cutout' && !requested && number(p, 'temperature', 18) >= number(p, 'setpoint', 85)) trip(item, state, 'Thermal cut-out opened', 'The independent teaching temperature limit was exceeded. Reset after restoring an acceptable temperature.');
      set(state, 'closed', requested && !state.tripped); state.details = `Temperature ${number(p, 'temperature', 18)}°C; setpoint ${number(p, 'setpoint', 21)}°C; contact ${state.closed ? 'closed' : 'open'}.`;
    } else if (item.type === 'dimmer') {
      const level = clamp(number(p, 'level', 0.65), 0, 1);
      const reference = Math.max(0.001, number(p, 'referenceOhms', 960));
      const resistance = getDimmerEquivalentResistance(level, reference), conducting = closedCommand(item) && !state.tripped && resistance !== null;
      const current = abs(solved.currents[`${item.id}.dimming`]), drop = getV(item, 'COM', 'OUT');
      state.closed = conducting; state.energized = current > 0.000001; state.level = level;
      state.dimmerResistance = conducting ? resistance! : 'open'; state.referenceOhms = reference;
      state.dimmerCurrent = current; state.voltageDrop = drop ? abs(drop) : 'unresolved'; state.voltageDropResolved = !!drop;
      state.equivalentLossWatts = conducting ? current * current * resistance! : 0;
      state.details = `${conducting ? `${resistance!.toFixed(3)} Ω equivalent series resistance` : 'Open circuit'}; ${current.toFixed(5)} A through COM–OUT${drop ? `; ${abs(drop).toFixed(2)} V across it` : '; terminal voltage is unreferenced'}. Fixed ${reference.toFixed(1)} Ω reference. Load voltage and power follow the actual connected network. Equivalent resistor loss is not real electronic-dimmer heating; phase chopping and lamp compatibility are not simulated.`;
    }
    else if (isType(item, 'relay', 'contactor')) {
      const v = abs(getV(item, 'A1', 'A2'));
      const requested = !!coilRequests.get(item.id), blocked = mechanicallyBlocked.has(item.id), next = requested && !blocked;
      set(state, 'closed', next); set(state, 'interlockBlocked', blocked); state.energized = requested; state.level = v / nominal;
      state.details = `${v.toFixed(1)} V across the coil; contacts ${blocked ? 'mechanically inhibited despite coil demand' : next ? 'operated' : 'released'}. Pickup/dropout thresholds are teaching assumptions.`;
    } else if (isType(item, 'mcb', 'mcb3', 'fuse', 'fcu', 'plug', 'rcbo', 'overload', 'rcd', 'rcd3')) {
      const rating = Math.max(0.1, number(p, 'rating', number(p, 'currentRating', item.type === 'overload' ? 6 : 16)));
      const branchNames = item.type === 'overload' ? ['phase1', 'phase3', 'phase5'] : isType(item, 'rcd3', 'mcb3') ? ['L1', 'L2', 'L3'] : isType(item, 'rcbo', 'rcd', 'fcu') ? ['L'] : ['main'];
      const current = Math.max(0, ...branchNames.map(name => abs(solved.currents[`${item.id}.${name}`])));
      state.energized = current > 0.0001; state.level = current / rating;
      const overload = current > rating * 1.05;
      state.elapsed = overload ? (old?.elapsed || 0) + dt : 0;
      if (!isType(item, 'rcd', 'rcd3') && (current > rating * number(p, 'instantMultiple', 5) || overload && state.elapsed >= number(p, 'delay', 0.5))) trip(item, state, 'Overcurrent protection operated', `${current.toFixed(2)} A exceeded the ${rating} A teaching threshold. The timing is illustrative, not a manufacturer trip curve.`);
      if (isType(item, 'rcd', 'rcbo', 'rcd3')) {
        const names = item.type === 'rcd3' ? ['L1', 'L2', 'L3', 'N'] : ['L', 'N'];
        const imbalance = abs(names.reduce((sum, name) => add(sum, solved.currents[`${item.id}.${name}`] || c()), c()));
        state.imbalance = imbalance;
        state.peakResidual = Math.max(Number(state.peakResidual) || 0, imbalance);
        if (imbalance > Math.max(0.000001, number(p, 'residualRating', number(p, 'tripMa', 30) / 1000))) {
          if (!state.tripped) state.tripResidual = imbalance;
          trip(item, state, 'Residual-current protection operated', `${(imbalance * 1000).toFixed(1)} mA did not return through the monitored active conductors. CPC current is outside the sensor.`);
        }
      }
      if (!state.tripped) state.details = `${current.toFixed(3)} A; ${overload ? 'overload accumulating' : 'contacts available'}.`;
    } else if (isType(item, 'timer', 'sensor', 'smartrelay')) {
      const input = abs(getV(item, 'IN', 'N')) > number(p, 'controlVoltage', nominal) * 0.5;
      const connectedInput = document.wires.some(w => w.from.component === item.id && w.from.terminal === 'IN' || w.to.component === item.id && w.to.terminal === 'IN');
      const permission = !connectedInput || input;
      let demand = flag(p, 'on', true) && flag(p, 'demand', true) && permission;
      if (item.type === 'sensor') {
        const condition = item.params.sensorValue !== undefined || item.params.setpoint !== undefined ? String(p.mode) === 'temperature' ? number(p, 'sensorValue', 0) < number(p, 'setpoint', 0.5) : number(p, 'sensorValue', 0) > number(p, 'setpoint', 0.5) : flag(p, 'demand', true);
        demand = flag(p, 'active', true) && condition && permission;
      }
      if (item.type === 'smartrelay') demand = (flag(p, 'on') || flag(p, 'demand')) && permission;
      let elapsed = demand && powered ? (old?.command ? old.elapsed : 0) + dt : 0;
      const delay = Math.max(0, number(p, 'delay', item.type === 'timer' ? 3 : 0));
      let close = powered && demand && elapsed >= delay;
      if (item.type === 'timer' && String(p.mode) === 'off-delay') { elapsed = !demand && powered ? (old?.command ? 0 : old?.elapsed || 0) + dt : 0; close = powered && (demand || !!old?.closed && elapsed < delay); }
      if (item.type === 'timer' && String(p.mode) === 'pulse') close = powered && demand && elapsed < delay;
      state.energized = powered; state.elapsed = elapsed; state.command = demand; set(state, 'closed', close);
      state.details = `Actual input ${input ? 'high' : 'low'}; powered ${powered ? 'yes' : 'no'}; output ${close ? 'closed' : 'open'}; timer ${elapsed.toFixed(1)} s.`;
    } else if (isType(item, 'valve', 'valve3')) {
      const call = abs(getV(item, item.type === 'valve3' ? 'CH' : 'CALL', 'N')) > nominal * 0.5, call2 = abs(getV(item, item.type === 'valve3' ? 'HW' : 'CALL2', 'N')) > nominal * 0.5;
      const target = call ? call2 ? 0.5 : 1 : 0, travel = Math.max(0.1, number(p, 'delay', 3));
      const priorLevel = old?.level || 0;
      state.level = clamp(priorLevel + Math.sign(target - priorLevel) * dt / travel, Math.min(priorLevel, target), Math.max(priorLevel, target));
      state.energized = call || call2; set(state, 'moving', Math.abs(state.level - target) > 0.001); set(state, 'closed', item.type === 'valve3' ? (call || call2) && Math.abs(state.level - target) <= 0.001 : state.level >= 0.99);
      state.details = `Actuator ${(state.level * 100).toFixed(0)}% open; end switch ${state.closed ? 'closed' : 'open'}. Travel is a stateful teaching abstraction.`;
    } else if (item.type === 'motor3') {
      set(state, 'frequency', solved.frequencies?.[terminal(item, 'U1')] || document.supply.frequency);
      const vs = ['U', 'V', 'W'].map(name => getV(item, `${name}1`, `${name}2`) || c());
      const expected = number(p, 'windingVoltage', 230), magnitudes = vs.map(abs), average = magnitudes.reduce((a, b) => a + b, 0) / 3;
      const a = polar(1, 2 * Math.PI / 3), positive = scale(add(add(vs[0], mul(a, vs[1])), mul(mul(a, a), vs[2])), 1 / 3), negative = scale(add(add(vs[0], mul(mul(a, a), vs[1])), mul(a, vs[2])), 1 / 3);
      state.energized = Math.min(...magnitudes) > expected * 0.25;
      state.direction = state.energized ? abs(positive) >= abs(negative) ? 1 : -1 : 0;
      state.level = average / expected; state.unbalance = average > 1 ? (Math.max(...magnitudes) - Math.min(...magnitudes)) / average : 0;
      state.details = `${magnitudes.map(v => v.toFixed(1)).join(' / ')} V across windings; ${state.direction === 1 ? 'forward sequence' : state.direction === -1 ? 'reverse sequence' : 'insufficient three-phase supply'}. Rotation is explanatory, not a torque calculation.`;
    } else if (isType(item, 'driver', 'dcsupply', 'vfd', 'pv', 'battery')) {
      const isEnergySource = isType(item, 'pv', 'battery');
      let input = supplyMagnitude;
      if (item.type === 'vfd') input = Math.min(abs(getV(item, 'L1', 'L2')), abs(getV(item, 'L2', 'L3')), abs(getV(item, 'L3', 'L1')));
      const active = isEnergySource ? flag(p, 'on', true) && (item.type === 'pv' || state.level > 0.01 || supplyMagnitude > 100) : input >= (item.type === 'vfd' ? 200 : nominal * 0.5);
      set(state, 'energized', active);
      if (item.type === 'vfd') {
        const wiredRun = document.wires.some(w => w.from.component === item.id && w.from.terminal === 'RUN' || w.to.component === item.id && w.to.terminal === 'RUN');
        set(state, 'closed', active && flag(p, 'on', true) && (wiredRun ? abs(solved.currents[`${item.id}.runSense`]) > 0.012 : flag(p, 'run', flag(p, 'on'))));
      }
      const outNames = item.type === 'vfd' ? ['outputU', 'outputV', 'outputW'] : item.type === 'battery' ? ['dcSource', 'backupSource'] : [isEnergySource ? 'dcSource' : 'outputSource'];
      let outP = 0, maxI = 0;
      for (const name of outNames) {
        const s = net.voltages.find(s => s.key === `${item.id}.${name}`), i = solved.sourceCurrents[`${item.id}.${name}`];
        if (s && i) { outP += Math.max(0, -power(s.v, i)); maxI = Math.max(maxI, abs(i)); }
      }
      const availableP = isEnergySource ? Math.max(0, number(p, 'watts', item.type === 'pv' ? number(p, 'generation', 600) : 1000) * (item.type === 'pv' ? clamp(number(p, 'irradiance', number(p, 'availability', 1)), 0, 1) : state.level > 0.01 || supplyMagnitude > 100 ? 1 : 0)) : Math.max(1, number(p, 'maxWatts', number(p, 'maxPower', number(p, 'watts', 2000))));
      const desiredV = Math.max(0, number(p, 'outputVoltage', item.type === 'vfd' ? 400 : isEnergySource ? 400 : 24)) * (item.type === 'vfd' ? clamp(number(p, 'frequency', 50) / 50, 0, 1) : 1);
      const limitI = Math.max(0.01, number(p, 'outputCurrent', availableP / Math.max(1, desiredV)));
      let targetV = desiredV;
      const solvedV = Math.max(0.0001, Number(state.regulatedVoltage) || desiredV);
      const predictedI = maxI * desiredV / solvedV, predictedP = outP * (desiredV / solvedV) ** 2;
      if (predictedI > limitI) targetV = Math.min(targetV, solvedV * limitI / Math.max(maxI, EPS));
      if (predictedP > availableP) targetV = Math.min(targetV, solvedV * Math.sqrt(availableP / Math.max(outP, EPS)));
      if (String(p.mode) === 'constant-current' && maxI > EPS) targetV = Math.min(desiredV, (Number(state.regulatedVoltage) || desiredV) * number(p, 'outputCurrent', 0.35) / maxI);
      if (!active) targetV = 0;
      const currentV = Number(state.regulatedVoltage);
      const regulated = Number.isFinite(currentV) ? currentV + (targetV - currentV) * 0.65 : targetV;
      set(state, 'regulatedVoltage', regulated);
      state.outputPower = outP; state.currentLimited = maxI > limitI * 1.0005 || regulated < desiredV * 0.99;
      if (!isEnergySource) {
        const efficiency = clamp(number(p, 'efficiency', 0.9), 0.1, 1), demand = Math.max(item.type === 'vfd' ? 2 : 0.2, outP / efficiency);
        const reflected = input > 1 ? demand * nominal * nominal / (input * input) : 0.2;
        // VFD input resistances are based on actual line voltage, not the230 V control nominal.
        const actual = item.type === 'vfd' ? demand : reflected;
        const oldP = Number(state.inputWatts) || 0.2;
        set(state, 'inputWatts', oldP + (actual - oldP) * 0.65);
      } else {
        set(state, 'dcPower', outP);
        const gridPresent = gridConnected(item) && !!supplyV && solved.voltages[terminal(item, 'L')]?.reference === 'mains' && supplyMagnitude > 100;
        set(state, 'gridPresent', gridPresent); set(state, 'gridRe', supplyV?.re || 0); set(state, 'gridIm', supplyV?.im || 0);
        if (item.type === 'battery') {
          const gridI = solved.currents[`${item.id}.gridExport`] || c(), backupS = net.voltages.find(s => s.key === `${item.id}.backupSource`), backupI = solved.sourceCurrents[`${item.id}.backupSource`];
          const discharged = (gridPresent ? 0 : outP) + (gridPresent && supplyV ? power(supplyV, gridI) : 0);
          state.level = clamp((old?.level ?? number(p, 'stateOfCharge', number(p, 'soc', 80) / 100)) - discharged * dt / (3600 * Math.max(1, number(p, 'capacityWh', 5000))), 0, 1);
          if (gridPresent) {
            const demand = outP / clamp(number(p, 'efficiency', 0.9), 0.1, 1);
            const reflected = supplyMagnitude > 1 ? demand * nominal * nominal / (supplyMagnitude * supplyMagnitude) : 0.2;
            const oldP = Number(state.inputWatts) || 0.2;
            set(state, 'inputWatts', oldP + (reflected - oldP) * 0.65);
          }
        }
      }
      state.details = `${active ? 'Enabled' : 'Input absent or below operating threshold'}; ${outP.toFixed(1)} W output; ${state.currentLimited ? 'output limit active' : 'within teaching limits'}. Converter behavior is averaged; switching waveforms are excluded.`;
    } else if (item.type === 'transformer') {
      state.energized = powered; state.level = abs(getV(item, '+', '-')); state.details = `Coupled winding model: ${supplyMagnitude.toFixed(1)} V primary / ${state.level.toFixed(1)} V secondary. Leakage resistances are illustrative.`;
    } else if (item.type === 'plc') {
      const threshold = number(p, 'controlVoltage', nominal) * 0.5, i1 = abs(getV(item, 'I1', 'N')) > threshold, i2 = abs(getV(item, 'I2', 'N')) > threshold;
      const mode = String(p.mode || 'and');
      set(state, 'closed', powered && (mode === 'or' ? i1 || i2 : mode === 'independent' ? i1 : mode === 'latch' ? i1 || !!old?.closed && !i2 : i1 && i2));
      set(state, 'output2', powered && i2); state.energized = powered; state.details = `Inputs ${Number(i1)}/${Number(i2)}; ${mode} logic; outputs use actual COM wiring.`;
    } else if (item.type === 'safetyRelay') {
      const threshold = number(p, 'controlVoltage', nominal) * 0.5;
      const high = (name: string) => abs(getV(item, name, 'N')) > threshold;
      const s1 = high('S1'), s2 = high('S2'), fb = high('FB'), reset = high('RESET');
      const channelsSafe = powered && s1 && s2, resetEdge = reset && !old?.resetHigh || !!state.resetRequested;
      // Feedback is a pre-start check. A correctly operated contactor opens its NC feedback.
      const close = channelsSafe && (!!state.closed || fb && (String(p.mode) === 'auto' || resetEdge));
      set(state, 'closed', close); state.energized = powered; state.resetHigh = reset; state.resetRequested = false;
      state.details = `Channels ${s1 ? 'closed' : 'open'}/${s2 ? 'closed' : 'open'}; feedback ${fb ? 'present' : 'absent'}; ${close ? 'output enabled' : 'output inhibited'}. This state model provides no safety certification.`;
    } else if (item.type === 'emergency') {
      const batteryAvailable = flag(p, 'battery', true) && number(p, 'batteryCharge', 1) > 0;
      const wiredSL = document.wires.some(w => w.from.component === item.id && w.from.terminal === 'SL' || w.to.component === item.id && w.to.terminal === 'SL');
      const normalActive = powered && flag(p, 'maintained') && (!wiredSL || abs(getV(item, 'SL', 'N')) > nominal * 0.5);
      set(state, 'normalActive', normalActive); state.emergencyActive = !powered && batteryAvailable; state.energized = normalActive || !!state.emergencyActive; state.level = state.energized ? 1 : 0;
      state.details = state.emergencyActive ? 'Integral battery provides a conceptual emergency light; it does not energize the mains terminals.' : `${supplyMagnitude.toFixed(1)} V mains/charging supply; normal light ${normalActive ? 'on' : 'off'} (${flag(p, 'maintained') ? 'maintained SL request' : 'non-maintained mode'}).`;
    } else if (item.type === 'alarm') {
      const active = signalledLinkGroups.has(gridPaths.find(terminal(item, 'LINK')));
      state.energized = powered || flag(p, 'battery', true) && number(p, 'batteryCharge', 1) > 0; state.level = active && state.energized ? 1 : 0; state.linkActive = active; state.conceptualInterlink = true;
      state.details = `${powered ? 'Mains' : state.energized ? 'Conceptual battery' : 'No'} power; ${active ? 'alarm active' : 'standby'}. LINK propagates a conceptual signal through actual closed wire/contact paths. Its manufacturer-dependent voltage and waveform are excluded.`;
    } else if (item.type === 'socket3') {
      const magnitudes = ['L1', 'L2', 'L3'].map(name => abs(getV(item, name, 'N')));
      state.energized = Math.min(...magnitudes) > 100; state.level = Math.min(...magnitudes) / (document.supply.voltage / Math.sqrt(3)); state.details = `Phase-to-neutral voltages ${magnitudes.map(v => v.toFixed(1)).join(' / ')} V.`;
    } else if (item.type === 'spd') {
      state.energized = powered; state.details = flag(p, 'healthy', true) ? 'Healthy steady-state high-impedance branch. Surge transients are outside the model.' : 'Device health marked failed; surge protection performance cannot be inferred.';
    } else if (loadTypes.has(item.type) || definition(item)?.terminals.some(t => t.id === 'L') && definition(item)?.terminals.some(t => t.id === 'N')) {
      state.energized = supplyMagnitude > nominal * 0.05; state.level = supplyMagnitude / nominal;
      state.details = supplyV ? `${supplyMagnitude.toFixed(1)} V across L–N; steady-state impedance model.` : 'No referenced voltage is available across these terminals.';
    }
  }
  return changed;
}

export function simulate(document: CircuitDocument, previousDeviceStates: Record<string, DeviceState> = {}, dt = 0.1): SimulationResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  dt = clamp(Number.isFinite(dt) ? dt : 0.1, 0, 60);
  const states = Object.fromEntries(document.components.map(item => [item.id, newState(item, previousDeviceStates[item.id])]));
  // Imported/stale states cannot place both mechanically linked power contact sets on the network.
  for (const [a, b] of mechanicalPairs(document)) if (states[a].closed && states[b].closed) { states[a].closed = false; states[b].closed = false; }
  const events: SimulationEvent[] = [];
  const interruptedFindings = new Map<string, Diagnostic>();
  let net: Network = network(document, states), solved: Solved = solve(net), stable = false, preTrip: SimulationResult['preTrip'];
  for (let iteration = 0; iteration < 48; iteration++) {
    net = network(document, states); solved = solve(net);
    if (!solved.valid || net.diagnostics.some(d => d.severity === 'error')) break;
    const beforeTrips = Object.values(states).filter(s => s.tripped).length;
    const changed = evaluate(document, solved, net, states, previousDeviceStates, dt, events);
    if (Object.values(states).filter(s => s.tripped).length > beforeTrips) {
      for (const finding of installationDiagnostics(document,net,solved)) interruptedFindings.set(finding.id,finding);
      const sourceCurrents = net.branches.filter(b => b.key.includes('.feed')).map(b => abs(solved.currents[b.key]));
      preTrip = { totalCurrent: Math.max(0, ...sourceCurrents), explanation: events[events.length - 1]?.detail || 'Protection opened a contact.' };
    }
    if (!changed) { stable = true; break; }
  }
  if (!stable && solved.valid) { net = network(document, states); solved = solve(net); }
  const wiringFindings = new Map(interruptedFindings);
  for (const finding of installationDiagnostics(document,net,solved)) wiringFindings.set(finding.id,finding);
  const diagnostics = [...net.diagnostics, ...wiringFindings.values()];
  if (!solved.valid) diagnostics.push(diag('solve', 'Electrical result unavailable', solved.reason || 'The numerical residual exceeded the accepted tolerance.', undefined, 'error', 'model'));
  else if (!stable) diagnostics.push(diag('settling', 'Control or converter model did not settle', 'A feedback loop is chattering or a converter is outside its supported operating range. Readings are provisional; assessment is withheld.', undefined, 'error', 'model'));
  if (document.components.some(item => definition(item)?.abstraction)) diagnostics.push(diag('abstraction', 'Steady-state teaching models', 'Electronic conversion, motors and control mechanisms use documented averaged models. Inrush, waveforms, torque and certified trip-time behavior are outside this simulator.', undefined, 'info', 'model'));
  const componentPower: Record<string, number> = {};
  for (const b of net.branches) if (b.component && b.power) { const v = voltage(solved, b.a, b.b); if (v) componentPower[b.component] = (componentPower[b.component] || 0) + Math.max(0, power(v, solved.currents[b.key] || c())); }
  // Optical presentation consumes emitter power, rather than a binary operating
  // threshold or a nearby dimmer's knob. Emergency charging is not illumination.
  for (const item of document.components) if (isType(item, 'lamp', 'light', 'led', 'emergency')) {
    const state = states[item.id], p = params(item);
    state.lightOutputPower = item.type !== 'emergency' ? componentPower[item.id] || 0
      : state.emergencyActive ? Math.max(0, number(p, 'emergencyWatts', number(p, 'watts', 8)))
      : state.normalActive ? componentPower[item.id] || 0 : 0;
  }
  let totalPower = 0;
  const phaseCurrents: Record<string, C> = {};
  for (const s of net.voltages) if (s.kind === 'grid') { const i = solved.sourceCurrents[s.key] || c(); totalPower -= power(s.v, i); const phase = s.key.split('source').pop() || 'L'; phaseCurrents[phase] = add(phaseCurrents[phase] || c(), scale(i, -1)); }
  const totalCurrent = Math.max(0, ...Object.values(phaseCurrents).map(abs));
  const conductive = installationPaths(document,net);
  for (const item of document.components.filter(item=>isType(item,'source','source3'))) conductive.join(terminal(item,'PE'),GROUND);
  for (const item of document.components) {
    const state = states[item.id], p = params(item);
    if (state.tripped) diagnostics.push(diag(`tripped:${item.id}`, 'Protection is open', state.details, item.id, 'warning', 'protection'));
    if (state.interlockBlocked) diagnostics.push(diag(`mechanical:${item.id}`, 'Mechanical interlock prevents contact closure', 'An opposing contactor is already operated, or simultaneous fresh requests have been inhibited. Inspect both coil commands. The mechanical pair prevents overlapping power contacts independently of the auxiliary electrical interlock.', item.id, 'warning', 'protection'));
    if (definition(item)?.terminals.some(t => t.id === 'PE') && !flag(p, 'classII') && !flag(p, 'doubleInsulated') && !isType(item, 'source', 'source3', 'junction', 'earthbar', 'neutralbar')) {
      const pe = terminal(item, 'PE');
      if (conductive.find(pe) !== conductive.find(GROUND)) diagnostics.push(diag(`cpc:${item.id}`, 'CPC connection is missing', 'The PE terminal has no modelled conductor path to the supply earth reference. Operation may still occur; this is not an automatic numerical failure.', item.id, 'warning', 'protection'));
    }
    if (item.type === 'motor3' && state.unbalance && Number(state.unbalance) > 0.15) diagnostics.push(diag(`phase:${item.id}`, 'Motor phase supply is unbalanced', 'The winding RMS voltages differ substantially. Inspect phase paths and star/delta links; motor starting and thermal damage are not calculated.', item.id));
    if (item.type === 'motor3' && state.level > 1.15) diagnostics.push(diag(`windingVoltage:${item.id}`, 'Motor winding voltage exceeds its teaching rating', 'Inspect the winding-voltage parameter and star/delta links. A400 V line supply does not imply every winding is rated400 V.', item.id));
    if (loadTypes.has(item.type) && !state.energized) {
      const live = solved.voltages[terminal(item, 'L')], n = solved.voltages[terminal(item, 'N')];
      if (live?.reference === 'mains' && abs(live) > 50 && n && abs(n) > 50) diagnostics.push(diag(`neutral:${item.id}`, 'Live voltage with little load voltage', 'Both load terminals are near live potential. A missing neutral or return can leave the load off while terminals remain energized.', item.id));
    }
    if (isType(item, 'driver', 'dcsupply', 'vfd') && state.energized) {
      const input = componentPower[item.id] || 0, expected = Number(state.outputPower) / clamp(number(p, 'efficiency', 0.9), 0.1, 1);
      if (expected > 2 && Math.abs(input - expected) / expected > 0.01) diagnostics.push(diag(`balance:${item.id}`, 'Converter power transfer did not converge', 'Input and output powers do not balance within the model tolerance. Assessment is withheld.', item.id, 'error', 'model'));
    }
  }
  const terminalVoltages = Object.fromEntries(Object.entries(solved.voltages).filter(([name]) => !name.startsWith('@')));
  const signalPaths = contactPaths(document, net), signalGroups = new Set(document.components.filter(item => item.type === 'alarm').map(item => signalPaths.find(terminal(item,'LINK'))));
  const wireCurrents = Object.fromEntries(document.wires.filter(wire => !signalGroups.has(signalPaths.find(endpointKey(wire.from)))).map(wire => [wire.id, solved.currents[`wire:${wire.id}`] || c()]));
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
  return { revision: document.revision, terminalVoltages, branchCurrents: { ...solved.currents, ...solved.sourceCurrents }, wireCurrents, componentPower, deviceStates: states, diagnostics, events, totalPower, totalCurrent, converged: stable && solved.valid && !diagnostics.some(d => d.severity === 'error'), elapsedMs, nodes: solved.nodes, ...(preTrip ? { preTrip } : {}) };
}

export interface MeterReading { value: number | null; explanation: string }
/** RMS magnitude; independent isolated references cannot be subtracted. */
export function measureVoltage(result: SimulationResult, a: Endpoint, b: Endpoint): MeterReading {
  const av = result.terminalVoltages[endpointKey(a)], bv = result.terminalVoltages[endpointKey(b)];
  if (!result.converged) return { value: null, explanation: 'The electrical model has not converged; resolve the model diagnostic before interpreting a meter reading.' };
  if ((!av || !bv) && [a,b].some(endpoint => endpoint.terminal === 'LINK' && result.deviceStates[endpoint.component]?.conceptualInterlink)) return { value: null, explanation: 'The alarm interlink is a conceptual wired signal model. Inspect LINK active/inactive state; manufacturer-specific signal voltage and waveform are not simulated.' };
  if (!av || !bv) return { value: null, explanation: 'Floating terminal: this model has no referenced voltage for one or both probe points.' };
  if (av.reference !== bv.reference) return { value: null, explanation: 'The probes span independent isolated circuits. Their common-mode voltage is undetermined; probe within one output circuit.' };
  return { value: abs(sub(av, bv)), explanation: `RMS voltage between the actual probe terminals${av.reference === 'mains' ? '' : ' within an isolated output'}.` };
}

/** De-energized equivalent resistance, with device contacts held at their document control state.
 * Electronic converters/transformers are disconnected for an ohmmeter; active electronics are not resistors.
 */
export function measureResistance(document: CircuitDocument, a: Endpoint, b: Endpoint): MeterReading {
  if (document.supply.enabled) return { value: null, explanation: 'Turn the simulated supply off before using resistance or continuity mode.' };
  if (document.components.some(item => isType(item, 'pv', 'battery') && flag(params(item), 'on', true))) return { value: null, explanation: 'An additional generation or battery source remains enabled. Disable those sources before using resistance mode.' };
  if (endpointKey(a) === endpointKey(b)) return { value: 0, explanation: 'Both probes touch the same terminal.' };
  const passiveDocument: CircuitDocument = { ...document, supply: { ...document.supply, enabled: false }, components: document.components.filter(item => !isType(item, 'transformer', 'driver', 'dcsupply', 'vfd', 'pv', 'battery')) };
  const states = Object.fromEntries(passiveDocument.components.map(item => [item.id, newState(item)]));
  const net = network(passiveDocument, states, true), ak = endpointKey(a), bk = endpointKey(b);
  if (!net.nodes.has(ak) || !net.nodes.has(bk)) return { value: null, explanation: 'Electronic conversion and winding coupling are disconnected for this ohmmeter model, or a probe terminal is missing.' };
  const union = new Union(); for (const branch of net.branches) union.join(branch.a, branch.b);
  if (union.find(ak) !== union.find(bk)) return { value: null, explanation: 'Open circuit: no passive conductive path joins the two probe points.' };
  const solved = solve(net, true, [ak, bk]);
  const reading = voltage(solved, ak, bk);
  return solved.valid && reading ? { value: Math.max(0, reading.re), explanation: 'Equivalent resistance from a virtual1 A test current. Conductor/contact resistances are illustrative; active electronics are excluded.' } : { value: null, explanation: 'The passive resistance network could not be resolved.' };
}

export const simulationLimits = { maxElectricalUnknowns: MAX_UNKNOWNS, model: 'complex RMS modified nodal analysis', sourceImpedancePurpose: 'illustrative, not an earth-loop or cable design value' };
