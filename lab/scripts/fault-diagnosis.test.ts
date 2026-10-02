import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFaultDiagnosis } from '../lib/fault-diagnosis.ts';
import { LESSONS } from '../lib/lessons.ts';
import { simulate } from '../lib/simulation.ts';
import type { SimulationResult } from '../lib/types.ts';

function challenge(id: number) {
  const lesson = LESSONS.find(lesson => lesson.id === id)!;
  const document = structuredClone(lesson.circuit);
  document.faults = [{ type: lesson.challenge.fault, wire: lesson.challenge.wire, component: lesson.challenge.component, enabled: true }];
  const result = simulate(document, {}, 1);
  return { document, result, target: lesson.challenge };
}

test('lesson 7 open live is accepted from the actual broken path even without a warning diagnostic', () => {
  const { document, result, target } = challenge(7);
  assert.equal(result.componentPower.light ?? 0, 0);
  // The helper must not rely on any engine's diagnostic wording or presence.
  result.diagnostics = [];
  const before = structuredClone(document), states = structuredClone(result.deviceStates);
  assert.equal(assessFaultDiagnosis(document, result, 'open-live', 2, target).accepted, true);
  assert.deepEqual(document, before);
  assert.deepEqual(result.deviceStates, states);
});

test('stale, unresolved, unobserved and incorrectly chosen diagnoses are withheld', () => {
  const { document, result, target } = challenge(7);
  assert.equal(assessFaultDiagnosis(document, undefined, 'open-live', 2, target).accepted, false);
  assert.equal(assessFaultDiagnosis(document, { ...result, revision: result.revision + 1 }, 'open-live', 2, target).accepted, false);
  assert.equal(assessFaultDiagnosis(document, { ...result, converged: false }, 'open-live', 2, target).accepted, false);
  assert.equal(assessFaultDiagnosis(document, result, 'open-live', 1, target).accepted, false);
  assert.equal(assessFaultDiagnosis(document, result, 'open-neutral', 2, target).accepted, false);
});

test('hidden fault label plus unrelated warnings does not establish an interrupted conductor', () => {
  const { document, target } = challenge(7);
  const intact = structuredClone(document); intact.faults = [];
  const healthyResult = simulate(intact);
  healthyResult.diagnostics.push({ id: 'unrelated', title: 'Unrelated warning', explanation: 'Not evidence of the target defect.', severity: 'warning', category: 'operation' });
  assert.equal(assessFaultDiagnosis(document, healthyResult, 'open-live', 2, target).accepted, false);
});

test('missing, repaired, replaced and multiple injected targets cannot receive challenge credit', () => {
  const { document, result, target } = challenge(7);
  const missing = structuredClone(document); missing.wires = missing.wires.filter(wire => wire.id !== target.wire);
  assert.equal(assessFaultDiagnosis(missing, result, 'open-live', 2, target).accepted, false);
  const repaired = structuredClone(document); repaired.faults = [];
  assert.equal(assessFaultDiagnosis(repaired, result, 'open-live', 2, target).accepted, false);
  const replaced = structuredClone(document); replaced.faults[0].wire = 'w3';
  assert.equal(assessFaultDiagnosis(replaced, result, 'open-live', 2, target).accepted, false);
  const multiple = structuredClone(document); multiple.faults.push({ type: 'open-neutral', wire: 'w5', enabled: true });
  assert.equal(assessFaultDiagnosis(multiple, result, 'open-live', 2, target).accepted, false);
});

test('ring continuity and protective-conductor defects remain diagnosable when equipment operates', () => {
  for (const id of [5, 18, 22]) {
    const { document, result, target } = challenge(id);
    assert.equal(result.converged, true);
    assert.equal(assessFaultDiagnosis(document, result, target.fault, 2, target).accepted, true, `Lesson ${id}`);
  }
});

test('shorts, leakage and overload are corroborated by real target currents or repeatable trips', () => {
  for (const id of [2, 3, 11, 19]) {
    const { document, result, target } = challenge(id);
    assert.equal(result.converged, true);
    assert.equal(assessFaultDiagnosis(document, result, target.fault, 2, target).accepted, true, `Lesson ${id}`);
    // Subsequent worker ticks do not repeat pre-trip readings. A persistent
    // protective interruption remains evidence after a repeatable comparison.
    const later = simulate(document, result.deviceStates, .1);
    assert.equal(assessFaultDiagnosis(document, later, target.fault, 2, target).accepted, true, `Latched lesson ${id}`);
  }
});

test('an unrelated warning and historic trip cannot stand in for an unexposed target fault', () => {
  const { document, target } = challenge(11);
  for (const component of document.components) if (component.type === 'switch') component.params.closed = false;
  const result = simulate(document);
  assert.equal(result.deviceStates['zone-a'].energized, false);
  const forged: SimulationResult = structuredClone(result);
  forged.deviceStates.protect.tripped = true;
  forged.diagnostics.push({ id: 'unrelated', title: 'An old trip', explanation: 'A historic state is insufficient.', severity: 'warning', category: 'protection' });
  assert.equal(assessFaultDiagnosis(document, forged, target.fault, 2, target).accepted, false);
});

test('open isolated converter output return is assessed with referenced model evidence', () => {
  const { document, result, target } = challenge(13);
  assert.equal(result.converged, true);
  assert.equal(assessFaultDiagnosis(document, result, target.fault, 2, target).accepted, true);
});

test('all 64 authored defects can be corroborated, with the doorbell push exposing its separated loop', () => {
  for (const lesson of LESSONS) {
    const { document, result, target } = challenge(lesson.id);
    if (lesson.id === 43) {
      assert.equal(assessFaultDiagnosis(document, result, target.fault, 2, target).accepted, false, 'An idle push does not expose the broken transformer-output loop');
      document.components.find(component => component.id === 'push')!.params.pressed = true;
      document.revision++;
      const pressed = simulate(document, result.deviceStates, .1);
      assert.equal(assessFaultDiagnosis(document, pressed, target.fault, 2, target).accepted, true, `Lesson ${lesson.id}: press Push`);
    } else assert.equal(assessFaultDiagnosis(document, result, target.fault, 2, target).accepted, true, `Lesson ${lesson.id}`);
  }
});
