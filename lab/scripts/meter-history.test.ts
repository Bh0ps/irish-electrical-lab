import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MeterHistory from '../components/lab/MeterHistory.tsx';
import { ProbePicker } from '../components/lab/ConnectionPicker.tsx';
import { captureMeasurement, resistanceAtProbes } from '../lib/learning.ts';
import { LESSONS } from '../lib/lessons.ts';
import { simulate } from '../lib/simulation.ts';

test('saved fork readings show the actual tester display and the wire between the named fittings', () => {
  const circuit = structuredClone(LESSONS.find(l => l.id === 7)!.circuit);
  const wire = circuit.wires.find(w => w.from.terminal === 'L' && w.from.component === 'supply')!;
  const source = circuit.components.find(c => c.id === wire.from.component)!;
  source.label = 'Training supply';
  const reading = captureMeasurement(circuit, simulate(circuit), {
    mode: 'voltage', wire: wire.id,
    instrument: { model: 'T6-600', method: 'fork-voltage', reference: 'pad', displayed: '240', held: false },
  });
  assert.equal(reading.instrument?.displayed, '240');
  const history = () => renderToStaticMarkup(createElement(MeterHistory, { circuit, readings: [reading] }));
  assert.match(history(), /240 V/);
  assert.match(history(), /Training supply · L/);
  assert.match(history(), /Rear earth pad/);
  circuit.revision++;
  source.label = 'Replacement supply';
  assert.match(history(), /Earlier reading/);
  assert.doesNotMatch(history(), /Replacement supply/);
  assert.match(history(), /Training supply · L/);
  // Older backups retain their recorded terminal IDs even after a fitting is renamed.
  delete reading.measuredAt;
  assert.match(history(), /Where it was measured/);
  assert.doesNotMatch(history(), /Replacement supply/);
});

test('the probe picker identifies each lead on its chosen pad, including both on the same pad', () => {
  const lesson = LESSONS.find(l => l.id === 66)!.circuit;
  const strip = lesson.components.find(c => c.id === 'left')!;
  const circuit = { ...lesson, components: [strip] };
  const red = { component: strip.id, terminal: 'L' };
  const black = { component: strip.id, terminal: 'N' };
  const render = (blackPoint = black, defaultOpen = true) => renderToStaticMarkup(createElement(ProbePicker, {
    circuit, points: { red, black: blackPoint }, active: 'black', defaultOpen,
    onProbe() {}, onPick() {},
  }));
  const open = render();
  assert.match(open, /Find a terminal for the black probe/);
  assert.match(open, /DC positive<\/span><small class="terminal-leads">Red probe/);
  assert.match(open, /DC return<\/span><small class="terminal-leads">Black probe/);
  const touching = render(red);
  assert.match(touching, /DC positive<\/span><small class="terminal-leads">Both probes/);
  assert.doesNotMatch(touching, /DC return<\/span><small class="terminal-leads">/);
  assert.doesNotMatch(render(black, false), /type="search"/);
});

test('a recorded resistance stays in history when the live probes or circuit change', () => {
  const circuit=structuredClone(LESSONS.find(lesson=>lesson.id===66)!.circuit);
  circuit.supply.enabled=false;
  const pad={component:'right',terminal:'L'};
  const recorded=captureMeasurement(circuit,simulate(circuit),{mode:'resistance',a:pad,b:pad});
  assert.equal(recorded.value,0);
  assert.equal(resistanceAtProbes(recorded,circuit,pad,pad),recorded);
  assert.equal(resistanceAtProbes(recorded,circuit,pad,{...pad,terminal:'N'}),undefined);
  assert.equal(resistanceAtProbes(recorded,circuit,pad),undefined);
  assert.equal(resistanceAtProbes(recorded,{...circuit,id:'another-build'},pad,pad),undefined);
  assert.equal(resistanceAtProbes(recorded,{...circuit,revision:circuit.revision+1},pad,pad),undefined);
  assert.equal(recorded.value,0);
});
