import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MeterHistory from '../components/lab/MeterHistory.tsx';
import { captureMeasurement } from '../lib/learning.ts';
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
  assert.match(history(), /Where it was measured/);
});
