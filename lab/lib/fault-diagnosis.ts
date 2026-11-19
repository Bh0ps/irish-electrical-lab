import { definitionFor } from './components.ts';
import { describeEndpoint } from './endpoint-description.ts';
import { measureResistance, measureVoltage, simulate } from './simulation.ts';
import type { CircuitDocument, Complex, ConfigurationLesson, Endpoint, FaultSetting, SimulationResult } from './types.ts';
import { validateDiagnosisEvidence, type MeasurementEvidence } from './learning.ts';
import { worktopFaultPoints, worktopFaultReadings } from './worktop-fault.ts';
import { heaterComparisonReady, heaterFaultReadings, heaterFeed, heaterLine } from './heater-fault.ts';

export type DiagnosisTarget = Pick<ConfigurationLesson['challenge'], 'fault' | 'wire' | 'component'> & {hint?:string};
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
  if (!result || result.revision !== document.revision || !result.converged) return reject('Wait for the bench reading. If it stays blank, choose Test circuit.');
  if(evidence!==undefined){const measured=validateDiagnosisEvidence(document,result,evidence,challenge);if(!measured.accepted)return reject(measured.explanation);}
  else if (!Number.isFinite(observations) || observations < 2) return reject('Take two meter readings before choosing the fault.');
  const enabled = document.faults.filter(fault => fault.enabled);
  const fault = enabled.find(candidate => candidate.type === challenge.fault && (!challenge.wire || candidate.wire === challenge.wire) && (!challenge.component || candidate.component === challenge.component));
  if (!fault || (!challenge.wire && !challenge.component)) return reject('The practice fault is missing from this circuit. Restart fault practice.');
  if (enabled.length !== 1) return reject('There is more than one practice fault on the bench. Restart fault practice to work on one at a time.');
  const targetComponent = fault.component && document.components.find(component => component.id === fault.component);
  if (fault.component && !targetComponent) return reject('The fitting you need has been removed. Restart fault practice to put it back.');
  const wire = fault.wire && document.wires.find(candidate => candidate.id === fault.wire);
  if (fault.wire && !wire) return reject('The wire you need has been removed. Restart fault practice to put it back.');
  if (wire && [wire.from, wire.to].some(endpoint => {
    const component = document.components.find(candidate => candidate.id === endpoint.component);
    return !component || !definitionFor(component)?.terminals.some(terminal => terminal.id === endpoint.terminal);
  })) return reject('One end of the wire is missing its terminal. Check both ends on the bench.');

  const hasEnd=(point:Endpoint)=>wire&&[wire.from,wire.to].some(end=>end.component===point.component&&end.terminal===point.terminal);
  let comparison='';
  if(document.lessonId===66&&evidence&&hasEnd(worktopFaultPoints.strip.a)&&hasEnd(worktopFaultPoints.switchOutput.a)){
    const {strip,switchOutput}=worktopFaultReadings(document,result,evidence);
    if(strip&&switchOutput){
      const volts=(sample:MeasurementEvidence)=>sample.instrument?.displayed??sample.value!.toLocaleString('en-IE',{maximumSignificantDigits:3});
      comparison=`The meter showed ${volts(switchOutput)} V at the switch and ${volts(strip)} V across the strip.`;
    }
  }
  const feed=heaterFeed(document);
  if(feed&&evidence&&hasEnd(feed)&&hasEnd(heaterLine)){
    const readings=heaterFaultReadings(document,result,evidence);
    if(heaterComparisonReady(document,readings)){
      const volts=(sample:MeasurementEvidence)=>sample.instrument?.displayed??sample.value!.toLocaleString('en-IE',{maximumSignificantDigits:3});
      const where=feed.component==='fuse'?'leaving the fuse':'at LOAD L';
      const seen='You measured '+volts(readings.output!)+' V '+where+' and '+volts(readings.heater!)+' V across the heater.';
      if(diagnosis!==fault.type)return reject(seen+' Both readings used heater N. Which wire did you check at both ends?');
      comparison=seen;
    }
  }
  if (diagnosis !== fault.type) return reject(comparison ? comparison+' You left one probe on the same pad. Which wire did you check at each end?' : challenge.hint??'Where does the reading change? Check both the feed and the return.');
  try {
    const clear = repaired(document, fault);
    if (openFaults.has(fault.type)) {
      if (!wire) return reject('Restart fault practice to put the broken wire back on the bench.');
      const ends = [wire.from, wire.to].map(end => describeEndpoint(document, end)?.label ?? end.terminal).join(' and ');
      const current = magnitude(result.wireCurrents[wire.id]);
      if (current === undefined || current > 1e-6) return reject('Check the current in this wire, then put one voltage probe at each end.');
      const voltage = measureVoltage(result, wire.from, wire.to).value;
      if (voltage !== null && voltage > 1) {
        if(comparison)return accept(comparison+(feed?' The fault is in the line between those two points.':' Both checks used the same − pad. There’s a break in the wire between the switch and the strip.'));
        return accept(`There’s a break between ${ends}. No current flows in that wire. The voltage across it is ${voltage.toLocaleString('en-IE',{maximumSignificantDigits:3})} V.`);
      }
      const brokenResistance = measureResistance(continuityDocument(document), wire.from, wire.to).value;
      const intactResistance = measureResistance(continuityDocument(clear), wire.from, wire.to).value;
      if (intactResistance !== null && (brokenResistance === null || brokenResistance > intactResistance * 1.25 + 1e-6)) {
        return accept(`The wire between ${ends} is broken. With the supply off, the bench finds ${brokenResistance === null ? 'no path between its ends' : 'another path with more resistance'}.`);
      }
      // Converter terminals can be excluded from passive ohmmeter models. A
      // referenced current comparison can still corroborate that broken loop.
      const restored = simulate(clear, result.deviceStates, 0);
      const restoredCurrent = magnitude(restored.wireCurrents[wire.id]);
      if (restored.converged && restoredCurrent !== undefined && restoredCurrent > 1e-5) return accept(`No current flows between ${ends}. In a copy of your circuit, repairing this wire lets current flow again.`);
      return reject(document.lessonId===43?'Keep the bell push held with the supply on. Check the transformer output and the wire feeding the push.':challenge.hint??'A sound wire can read 0 A when the load is off. Try the control and check the reading again.');
    }

    if (!targetComponent || !['short-circuit', 'earth-fault', 'overload'].includes(fault.type)) return reject('The bench has no meter check for this fault. Restart the exercise.');
    const branch = fault.type === 'short-circuit' ? `fault:${targetComponent.id}:short` : fault.type === 'earth-fault' ? `fault:${targetComponent.id}:earth` : undefined;
    const faultCurrent = branch && magnitude(result.branchCurrents[branch]);
    if (typeof faultCurrent === 'number' && faultCurrent > 1e-5) return accept(`At ${targetComponent.label}, ${faultCurrent.toFixed(2)} A flows from line to ${fault.type === 'earth-fault' ? 'earth' : 'neutral'} through the fault.`);

    const restored = simulate(clear, result.deviceStates, 0);
    if (fault.type === 'overload' && restored.converged) {
      const before = restored.componentPower[targetComponent.id] ?? 0, after = result.componentPower[targetComponent.id] ?? 0;
      if (before > .01 && after > before * 1.5) return accept(`${targetComponent.label} draws ${after.toFixed(1)} W with the overload. It draws ${before.toFixed(1)} W in a repaired copy.`);
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
    if (reproduced.converged && repairedResult.converged && corroboratedTrip) return accept(`${corroboratedTrip.label} tripped. In a copy of your circuit, resetting it with the fault still there made it trip again. After the repair it stayed on.`);
    return reject('These readings do not yet show the fault. Try running the affected equipment and check its current.');
  } catch {
    return reject('The bench could not compare the readings. Check both connections and measure again.');
  }
}
