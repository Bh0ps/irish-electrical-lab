import { COMPONENTS } from './components.ts';
import { measureResistance, measureVoltage, simulate } from './simulation.ts';
import type { CircuitDocument, Complex, ConfigurationLesson, FaultSetting, SimulationResult } from './types.ts';
import { validateDiagnosisEvidence, type MeasurementEvidence } from './learning.ts';

export type DiagnosisTarget = Pick<ConfigurationLesson['challenge'], 'fault' | 'wire' | 'component'>;
export interface FaultDiagnosisAssessment { accepted: boolean; explanation: string }
const reject = (explanation: string): FaultDiagnosisAssessment => ({ accepted: false, explanation });
const accept = (explanation: string): FaultDiagnosisAssessment => ({ accepted: true, explanation });
const magnitude = (value: Complex | undefined) => value && Number.isFinite(value.re) && Number.isFinite(value.im) ? Math.hypot(value.re, value.im) : undefined;
const openFaults = new Set(['open', 'open-wire', 'open-live', 'open-neutral', 'open-cpc', 'missing-earth', 'phase-loss', 'wrong-control']);
const protectionTypes = new Set(['mcb', 'mcb3', 'fuse', 'fcu', 'plug', 'rcbo', 'overload', 'rcd', 'rcd3']);

function repaired(document: CircuitDocument, fault: FaultSetting): CircuitDocument {
  return { ...document, faults: document.faults.filter(other => other !== fault) };
}

function continuityDocument(document: CircuitDocument): CircuitDocument {
  return {
    ...document, supply: { ...document.supply, enabled: false },
    // A resistance comparison explicitly isolates generation as well as mains.
    components: document.components.map(component => ['pv', 'battery'].includes(component.type) ? { ...component, params: { ...component.params, on: false } } : component),
  };
}

/** Model evidence is separate from the user's selected label and observation count.
 * Counterfactual checks use copies and never repair, reset or advance the live build.
 */
export function assessFaultDiagnosis(
  document: CircuitDocument,
  result: SimulationResult | undefined,
  diagnosis: string,
  observations: number,
  challenge: DiagnosisTarget,
  evidence?: MeasurementEvidence[],
): FaultDiagnosisAssessment {
  if (!result || result.revision !== document.revision || !result.converged) return reject('Wait for a current, resolved circuit result before submitting a diagnosis.');
  if(evidence!==undefined){const measured=validateDiagnosisEvidence(document,result,evidence,challenge);if(!measured.accepted)return reject(measured.explanation);}
  else if (!Number.isFinite(observations) || observations < 2) return reject('Take at least two probe observations before submitting a diagnosis.');
  const enabled = document.faults.filter(fault => fault.enabled);
  const fault = enabled.find(candidate => candidate.type === challenge.fault && (!challenge.wire || candidate.wire === challenge.wire) && (!challenge.component || candidate.component === challenge.component));
  if (!fault || (!challenge.wire && !challenge.component)) return reject('The authored challenge defect is not active at its expected target. Restart the challenge.');
  if (enabled.length !== 1) return reject('Isolate the challenge defect before diagnosing it; other injected faults make this evidence ambiguous.');
  if (diagnosis !== fault.type) return reject('That diagnosis does not match the defect at the investigated challenge target.');
  const targetComponent = fault.component && document.components.find(component => component.id === fault.component);
  if (fault.component && !targetComponent) return reject('The challenge equipment has been removed. Restart the challenge.');
  const wire = fault.wire && document.wires.find(candidate => candidate.id === fault.wire);
  if (fault.wire && !wire) return reject('The challenge conductor has been removed. Restart the challenge.');
  if (wire && [wire.from, wire.to].some(endpoint => {
    const component = document.components.find(candidate => candidate.id === endpoint.component);
    return !component || !COMPONENTS[component.type]?.terminals.some(terminal => terminal.id === endpoint.terminal);
  })) return reject('The challenge conductor no longer has valid terminal endpoints.');

  try {
    const clear = repaired(document, fault);
    if (openFaults.has(fault.type)) {
      if (!wire) return reject('This open-path exercise needs its exact conductor target. Restart the challenge.');
      const current = magnitude(result.wireCurrents[wire.id]);
      if (current === undefined || current > 1e-6) return reject('The targeted conductor is not confirmed open by the current result. Recheck its current and connections.');
      const voltage = measureVoltage(result, wire.from, wire.to).value;
      if (voltage !== null && voltage > 1) return accept(`The targeted conductor ${wire.id} carries no current while ${voltage.toFixed(2)} V appears across its interrupted ends. This corroborates the open path.`);
      const brokenResistance = measureResistance(continuityDocument(document), wire.from, wire.to).value;
      const intactResistance = measureResistance(continuityDocument(clear), wire.from, wire.to).value;
      if (intactResistance !== null && (brokenResistance === null || brokenResistance > intactResistance * 1.25 + 1e-6)) {
        return accept(`The targeted conductor ${wire.id} carries no current. An isolated model continuity comparison shows ${brokenResistance === null ? 'an open path' : 'a higher-resistance alternative path'} where the intact conductor provides continuity.`);
      }
      // Converter terminals can be excluded from passive ohmmeter models. A
      // referenced current comparison can still corroborate that broken loop.
      const restored = simulate(clear, result.deviceStates, 0);
      const restoredCurrent = magnitude(restored.wireCurrents[wire.id]);
      if (restored.converged && restoredCurrent !== undefined && restoredCurrent > 1e-5) return accept(`The target ${wire.id} carries no current; clearing only that interruption restores current in the same control state.`);
      return reject('No observable open-path effect is corroborated at this target yet. Expose the affected route and compare voltage, current or isolated continuity.');
    }

    if (!targetComponent || !['short-circuit', 'earth-fault', 'overload'].includes(fault.type)) return reject('This defect has no supported measurement-based challenge check.');
    const branch = fault.type === 'short-circuit' ? `fault:${targetComponent.id}:short` : fault.type === 'earth-fault' ? `fault:${targetComponent.id}:earth` : undefined;
    const faultCurrent = branch && magnitude(result.branchCurrents[branch]);
    if (typeof faultCurrent === 'number' && faultCurrent > 1e-5) return accept(`The targeted ${fault.type === 'earth-fault' ? 'line-to-earth' : 'line-to-neutral'} fault branch carries ${faultCurrent.toFixed(4)} A. The actual fault path, rather than an unrelated finding, corroborates this diagnosis.`);

    const restored = simulate(clear, result.deviceStates, 0);
    if (fault.type === 'overload' && restored.converged) {
      const before = restored.componentPower[targetComponent.id] ?? 0, after = result.componentPower[targetComponent.id] ?? 0;
      if (before > .01 && after > before * 1.5) return accept(`The target demand is substantially higher than the same equipment with the injected excess removed (${after.toFixed(1)} W versus ${before.toFixed(1)} W).`);
    }

    // A trip suppresses post-trip current. Reproduce the declared defect after
    // reset in a copy, and compare it with an otherwise identical repaired copy.
    // Existing unrelated warnings or an old latched trip alone are insufficient.
    const resetDocument = (source: CircuitDocument): CircuitDocument => ({
      ...source,
      components: source.components.map(component => protectionTypes.has(component.type) ? {
        ...component, params: { ...component.params, resetToken: Number(result.deviceStates[component.id]?.resetToken ?? component.params.resetToken ?? 0) + 1 },
      } : component),
    });
    const reproduced = simulate(resetDocument(document), result.deviceStates, 1);
    const repairedResult = simulate(resetDocument(clear), result.deviceStates, 1);
    const corroboratedTrip = document.components.find(component => protectionTypes.has(component.type)
      && result.deviceStates[component.id]?.tripped
      && reproduced.deviceStates[component.id]?.tripped
      && !repairedResult.deviceStates[component.id]?.tripped);
    if (reproduced.converged && repairedResult.converged && corroboratedTrip) return accept(`Protection ${corroboratedTrip.id} is interrupted. Resetting a model copy with this defect reproduces the trip; removing only the targeted defect prevents it.`);
    return reject('The chosen fault is not corroborated by the target current, excess demand or a repeatable protective response. Expose the affected load and investigate further.');
  } catch {
    return reject('The comparison could not be resolved. Restore valid terminal connections and repeat the measurements.');
  }
}
