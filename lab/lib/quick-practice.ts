import { electricalKey } from './simulation-identity.ts';
import { LESSONS } from './lessons.ts';
import { reviewQueue, type StudyProgress } from './progress.ts';
import { lessonCompetency } from './scenarios.ts';
import { measureVoltage } from './simulation.ts';
import type { CircuitDocument, Parameters, SimulationResult } from './types.ts';

export interface PracticeReading {
  label: string;
  value: number | string;
  unit?: 'V' | 'W';
}

interface ExperimentDefinition {
  id: string;
  lessonId: number;
  title: string;
  question: string;
  instruction: string;
  target: string;
  trace?: 'L' | 'control';
  options: readonly { id: string; label: string }[];
  answer: string;
  explanation: string;
  nextCheck: string;
  initial?: Parameters;
  targetKeys: readonly string[];
  action: (params: Parameters) => boolean;
  before: (result: SimulationResult, document: CircuitDocument) => boolean;
  after: (result: SimulationResult, before: readonly PracticeReading[]) => boolean;
  read: (result: SimulationResult) => (PracticeReading | null)[];
  sequence?: 'run-on' | 'press-release';
}

export interface QuickPracticeExperiment extends ExperimentDefinition {
  activityId: string;
  competency: string;
}

const power = (result: SimulationResult, id: string) => result.componentPower[id];
const drawingPower = (result: SimulationResult, id: string) => power(result, id) > 1;
const isOn = (result: SimulationResult, id: string) => result.deviceStates[id]?.energized === true;
const isOff = (result: SimulationResult, id: string) => result.deviceStates[id]?.energized === false;
const voltage = (result: SimulationResult, id: string, a = 'L', b = 'N') => measureVoltage(result, { component: id, terminal: a }, { component: id, terminal: b }).value;
const reading = (label: string, value: number | null | undefined, unit: 'V' | 'W'): PracticeReading | null =>
  typeof value === 'number' && Number.isFinite(value) ? { label, value, unit } : null;
function deviceState(label: string, state: boolean | undefined, active: string, idle: string): PracticeReading | null {
  return state === undefined ? null : { label, value: state ? active : idle };
}

function liveTraveller(result: SimulationResult): string | undefined {
  const neutral = { component: 'supply', terminal: 'N' };
  const common = measureVoltage(result, { component: 'near', terminal: 'COM' }, neutral).value;
  if (common === null || common < 1) return;
  const live = ['T1', 'T2'].filter(terminal => {
    const value = measureVoltage(result, { component: 'near', terminal }, neutral).value;
    return value !== null && value >= common * .9;
  });
  return live.length === 1 ? live[0] : undefined;
}

const definitions: readonly ExperimentDefinition[] = [
  {
    id: 'switch-voltage', lessonId: 7, title: 'Voltage across the lamp',
    question: 'The lamp is lit. What will the meter read across it when you switch it off?',
    instruction: 'Turn the wall switch off. Watch the lamp and the voltage across it.',
    target: 'switch', trace: 'L', targetKeys: ['closed'], answer: 'near-zero',
    options: [{ id: 'mains', label: 'Close to supply voltage' }, { id: 'near-zero', label: 'Close to zero volts' }],
    explanation: 'With the switch open, current stops flowing through the lamp. Its two terminals are now at almost the same voltage.',
    nextCheck: 'Leave the supply on and check that the wall switch is off.',
    action: params => params.closed === false,
    before: (result, document) => (voltage(result, 'light') ?? 0) >= document.supply.voltage * .9,
    after: result => { const value = voltage(result, 'light'); return value !== null && value <= 1; },
    read: result => [reading('Lamp L–N', voltage(result, 'light'), 'V')],
  },
  {
    id: 'traveller-route', lessonId: 9, title: 'One lamp, two switches',
    question: 'What happens to the lamp if you move switch A and leave switch B alone?',
    instruction: 'Flick switch A once. Leave B where it is and look at which connecting wire is live.',
    target: 'near', trace: 'control', targetKeys: ['position'], answer: 'off',
    options: [{ id: 'off', label: 'It goes out' }, { id: 'on', label: 'It stays on' }],
    explanation: 'A now connects to T2, but B is still on T1. The two switches no longer make a complete path through the lamp.',
    nextCheck: 'Check that B is still in its original position.',
    action: params => params.position === 1,
    before: result => drawingPower(result, 'light') && liveTraveller(result) === 'T1',
    after: result => isOff(result, 'light') && liveTraveller(result) === 'T2',
    read: result => {
      const traveller = liveTraveller(result);
      return [reading('Lamp L–N', voltage(result, 'light'), 'V'), traveller ? { label: 'Live at switch A', value: traveller } : null];
    },
  },
  {
    id: 'dimmer-power', lessonId: 12, title: 'Turn the light down',
    question: 'You turn the dimmer down. What will happen to the lamp’s power reading?',
    instruction: 'Turn the dimmer down to 30% or less. Leave its switch on.',
    target: 'dimmer', trace: 'L', initial: { level: .8, closed: true }, targetKeys: ['level'], answer: 'lower',
    options: [{ id: 'same', label: 'It stays about the same' }, { id: 'lower', label: 'It falls' }, { id: 'higher', label: 'It rises' }],
    explanation: 'This lab dimmer adds resistance as you turn it down. Less current flows through the lamp, so its watt reading falls.',
    nextCheck: 'Check the dimmer is on and its setting is 30% or less.',
    action: params => typeof params.level === 'number' && params.level >= 0 && params.level <= .3,
    before: result => drawingPower(result, 'light'),
    after: (result, before) => {
      const value = voltage(result, 'light');
      const initial = before[0].value;
      // A zero-percent setting can be an open contact, leaving no measured power entry.
      return typeof initial === 'number' && value !== null && (power(result, 'light') ?? 0) < initial * .5;
    },
    read: result => [reading('Lamp power', voltage(result, 'light') === null ? null : power(result, 'light') ?? 0, 'W')],
  },
  {
    id: 'pir-run-on', lessonId: 14, title: 'When motion stops',
    question: 'Someone leaves the hall. When will the light go out?',
    instruction: 'Switch off motion at the detector and leave it off. Watch the light for the next few seconds.',
    target: 'pir', trace: 'control', targetKeys: ['on', 'active', 'demand'], answer: 'delay', sequence: 'run-on',
    options: [{ id: 'instant', label: 'The lamp goes out immediately' }, { id: 'never', label: 'The lamp stays on until reset' }, { id: 'delay', label: 'The lamp stays on briefly, then goes out' }],
    explanation: 'When movement stops, the timer keeps its contact closed for a few more seconds. The light goes out when the contact opens.',
    nextCheck: 'Check that the detector no longer senses movement and the timer still has its supply.',
    action: params => params.active === false,
    before: result => drawingPower(result, 'light') && result.deviceStates['occupancy-hold']?.command === true,
    after: result => isOff(result, 'light') && isOn(result, 'occupancy-hold') && result.deviceStates['occupancy-hold']?.closed === false,
    read: result => [reading('Lamp L–N', voltage(result, 'light'), 'V')],
  },
  {
    id: 'independent-branches', lessonId: 2, title: 'Which branch loses power?',
    question: 'You switch off the first circuit breaker, MCB 1. Which circuits will lose power?',
    instruction: 'Switch off MCB 1. Leave the other breaker on and compare the readings.',
    target: 'branch1', trace: 'L', targetKeys: ['closed'], answer: 'first',
    options: [{ id: 'both', label: 'Both circuits' }, { id: 'first', label: 'Circuit 1 only' }, { id: 'second', label: 'Circuit 2 only' }],
    explanation: 'MCB 1 opens the lamp circuit. The second breaker still feeds its socket through the shared residual-current device.',
    nextCheck: 'Check that MCB 1 is open, while MCB 2 and the shared RCCB are still closed.',
    action: params => params.closed === false,
    before: result => drawingPower(result, 'load1') && drawingPower(result, 'load2'),
    after: result => isOff(result, 'load1') && drawingPower(result, 'load2'),
    read: result => [reading('Circuit 1 L–N', voltage(result, 'load1'), 'V'), reading('Circuit 2 L–N', voltage(result, 'load2'), 'V')],
  },
  {
    id: 'starter-hold', lessonId: 55, title: 'What happens after Start?',
    question: 'You give Start a quick press. Will the starter contactor stay closed after you let go?',
    instruction: 'Press and release the green Start button. Look at the motor and the coil reading.',
    target: 'start', trace: 'control', targetKeys: ['pressed'], answer: 'holds', sequence: 'press-release',
    options: [{ id: 'drops', label: 'It opens as soon as I release Start' }, { id: 'holds', label: 'It stays closed after I release Start' }],
    explanation: 'Start energises the coil and closes its holding contact. That contact keeps the coil supplied after your finger leaves the button.',
    nextCheck: 'Check the coil and its holding contact. You can hold Start in the equipment controls, then release it once the motor runs.',
    action: params => params.pressed === false,
    before: result => isOff(result, 'motor') && result.deviceStates.starter?.closed === false,
    after: result => isOn(result, 'motor') && result.deviceStates.starter?.closed === true,
    read: result => [
      reading('Contactor coil A1–A2', voltage(result, 'starter', 'A1', 'A2'), 'V'),
      deviceState('Motor', result.deviceStates.motor?.energized, 'Running', 'Stopped'),
    ],
  },
];

export const QUICK_PRACTICE_EXPERIMENTS: readonly QuickPracticeExperiment[] = definitions.map(definition => ({
  ...definition,
  activityId: `practice:${definition.id}`,
  competency: `experiment-${definition.id}`,
}));

export function chooseQuickPractice(progress: StudyProgress): QuickPracticeExperiment {
  const first = QUICK_PRACTICE_EXPERIMENTS[0];
  const practiceRecord = (entry: QuickPracticeExperiment) => progress.learning[entry.lessonId]?.competencies[entry.competency];
  const attempted = (entry: QuickPracticeExperiment) => (practiceRecord(entry)?.attempts ?? 0) > 0;
  if (!attempted(first)) return first;

  for (const due of reviewQueue(progress)) {
    const experiment = QUICK_PRACTICE_EXPERIMENTS.find(entry => entry.lessonId === due.lessonId);
    if (!experiment) continue;
    if (due.competency === experiment.competency) return experiment;
    const lastFormalCheck = progress.learning[due.lessonId]?.competencies[due.competency]?.lastPracticed ?? 0;
    const lastExperiment = practiceRecord(experiment);
    if (due.competency === lessonCompetency(due.lessonId) && (!lastExperiment || lastFormalCheck > lastExperiment.lastPracticed)) return experiment;
  }
  const fresh = QUICK_PRACTICE_EXPERIMENTS.find(entry => !attempted(entry));
  if (fresh) return fresh;
  const lastPracticed = (entry: QuickPracticeExperiment) => practiceRecord(entry)?.lastPracticed ?? 0;
  return [...QUICK_PRACTICE_EXPERIMENTS].sort((a, b) => lastPracticed(a) - lastPracticed(b))[0];
}

export function createQuickPracticeCircuit(experiment: QuickPracticeExperiment, circuitId: string): CircuitDocument {
  const lesson = LESSONS.find(entry => entry.id === experiment.lessonId);
  if (!lesson) throw new Error(`Unknown practice configuration ${experiment.lessonId}.`);
  const circuit = structuredClone(lesson.circuit);
  const target = circuit.components.find(component => component.id === experiment.target);
  if (!target) throw new Error(`Missing practice control ${experiment.target}.`);
  if (experiment.initial) Object.assign(target.params, experiment.initial);
  return { ...circuit, id: circuitId };
}

function withoutPracticeControl(experiment: QuickPracticeExperiment, circuit: CircuitDocument): CircuitDocument {
  return { ...circuit, components: circuit.components.map(component => component.id === experiment.target
    ? { ...component, params: Object.fromEntries(Object.entries(component.params).filter(([key]) => !experiment.targetKeys.includes(key))) }
    : component) };
}

function experimentKey(experiment: QuickPracticeExperiment, circuit: CircuitDocument): string {
  return electricalKey(withoutPracticeControl(experiment, circuit));
}

/** Expected control operation need not trigger a save prompt when restarting a scratch example. */
export function practiceOnlyControlChanged(experiment: QuickPracticeExperiment, circuit: CircuitDocument): boolean {
  const authored = createQuickPracticeCircuit(experiment, circuit.id);
  const fingerprint = (document: CircuitDocument) => JSON.stringify({ ...withoutPracticeControl(experiment, document), revision: 0 });
  return fingerprint(circuit) === fingerprint(authored);
}

function isReady(result: SimulationResult | undefined, circuit: CircuitDocument): result is SimulationResult {
  return result?.revision === circuit.revision && result.converged && !Object.values(result.deviceStates).some(state => state.tripped);
}

function readAll(experiment: QuickPracticeExperiment, result: SimulationResult): PracticeReading[] | null {
  const observations = experiment.read(result);
  return observations.every(item => item !== null) ? observations : null;
}

export interface QuickPracticeBaseline {
  circuitId: string;
  revision: number;
  graph: string;
  readings: PracticeReading[];
}

export type QuickPracticeStart =
  | { status: 'ready'; baseline: QuickPracticeBaseline }
  | { status: 'waiting' | 'unresolved'; message: string };

export function prepareQuickPractice(experiment: QuickPracticeExperiment, circuit: CircuitDocument, result?: SimulationResult): QuickPracticeStart {
  if (result?.revision !== circuit.revision) return { status: 'waiting', message: 'Waiting for the starting reading.' };
  const target = circuit.components.find(component => component.id === experiment.target);
  const authored = createQuickPracticeCircuit(experiment, circuit.id);
  const graph = experimentKey(experiment, circuit);
  if (!circuit.supply.enabled || circuit.lessonId !== experiment.lessonId || !target || graph !== experimentKey(experiment, authored)) {
    return { status: 'unresolved', message: 'This circuit differs from the practice setup. Restart the experiment to restore the example.' };
  }
  const startingControl = authored.components.find(component => component.id === experiment.target)!.params;
  if (!isReady(result, circuit) || !experiment.before(result, circuit) || experiment.targetKeys.some(key => target.params[key] !== startingControl[key])) {
    return { status: 'unresolved', message: 'The circuit isn’t at its starting setting. Restart the experiment, then try the control.' };
  }
  const readings = readAll(experiment, result);
  if (!readings) return { status: 'unresolved', message: 'The meter couldn’t get a starting reading. Restart to check the example again.' };
  return { status: 'ready', baseline: { circuitId: circuit.id, revision: circuit.revision, graph, readings } };
}

export interface PracticeSequence {
  pressedRevision?: number;
  during?: readonly PracticeReading[];
}

export type QuickPracticeObservation =
  | { status: 'waiting' | 'unresolved'; message: string; sequence: PracticeSequence }
  | { status: 'complete'; sequence: PracticeSequence; readings: PracticeReading[]; revision: number };

export function observeQuickPractice(experiment: QuickPracticeExperiment, baseline: QuickPracticeBaseline, sequence: PracticeSequence, circuit: CircuitDocument, result?: SimulationResult): QuickPracticeObservation {
  const waiting = (message: string): QuickPracticeObservation => ({ status: 'waiting', message, sequence });
  const unresolved = (message: string): QuickPracticeObservation => ({ status: 'unresolved', message, sequence });
  if (circuit.id !== baseline.circuitId || experimentKey(experiment, circuit) !== baseline.graph) return unresolved('The circuit or another control changed. Restart to compare the same starting circuit.');
  const control = circuit.components.find(component => component.id === experiment.target);
  if (!control || circuit.revision <= baseline.revision) return waiting('');

  if (experiment.sequence === 'press-release') {
    if (control.params.pressed === true) {
      sequence = sequence.pressedRevision === undefined ? { ...sequence, pressedRevision: circuit.revision } : sequence;
      return waiting('Release Start, then watch the contactor.');
    }
    if (sequence.pressedRevision === undefined || circuit.revision <= sequence.pressedRevision) return waiting('Press Start first. You can also hold it from the equipment controls.');
  }
  if (!experiment.action(control.params)) {
    if (experiment.sequence === 'run-on' && sequence.during) return unresolved('Motion demand was restored before the timer expired. Restart and leave it off until the light goes out.');
    return waiting('');
  }
  if (result?.revision !== circuit.revision) return waiting('Waiting for the live reading.');
  if (!isReady(result, circuit)) return unresolved(`The reading could not be resolved. ${experiment.nextCheck}`);

  if (experiment.sequence === 'run-on') {
    const timer = result.deviceStates['occupancy-hold'];
    if (timer?.command !== false) return unresolved(experiment.nextCheck);
    if (timer.closed && drawingPower(result, 'light')) {
      const readings = readAll(experiment, result);
      if (!readings) return unresolved(experiment.nextCheck);
      sequence = sequence.during ? sequence : { ...sequence, during: readings };
      return waiting('Motion demand is off. Watch the lamp while the timer runs.');
    }
    if (!sequence.during) return unresolved('The held-on reading was missed. Restart and watch the lamp until the timer expires.');
  }

  const readings = readAll(experiment, result);
  if (!readings || !experiment.after(result, baseline.readings)) return unresolved(`The readings don’t yet show the expected change. ${experiment.nextCheck}`);
  return { status: 'complete', sequence, readings, revision: circuit.revision };
}
