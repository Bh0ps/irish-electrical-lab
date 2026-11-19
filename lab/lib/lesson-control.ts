import { evaluateActivity, type LessonActivity } from './learning.ts';
import { measureVoltage } from './simulation.ts';
import type { CircuitDocument, ComponentInstance, SimulationResult } from './types.ts';

/** A click on a named switch, from the room, bench, list or lesson card. */
export interface LessonControlPress {
  activity: string;
  component: string;
  circuit: string;
  revision: number;
  lampBefore?: number | null;
}

function stairOrHallLamp(doc: CircuitDocument) {
  return doc.lessonId === 7 || doc.lessonId === 9 || doc.lessonId === 10;
}

function lampVolts(doc: CircuitDocument, result?: SimulationResult) {
  if (!result?.converged || result.revision !== doc.revision) return null;
  return measureVoltage(result, {component:'light',terminal:'L'}, {component:'light',terminal:'N'}).value;
}

export function lessonSwitch(activity: LessonActivity | undefined, doc: CircuitDocument): ComponentInstance | undefined {
  if (!activity || activity.kind !== 'operate' || activity.bookStep || activity.scenarioStep === undefined ||
      activity.expectedControls?.length !== 1 || activity.expectedSignalOpen || activity.expectedSupplyEnabled !== undefined ||
      activity.expectedObservations?.some(item => item.kind === 'total-power' || item.kind === 'power' && item.relative)) return;
  const [{component, params}] = activity.expectedControls;
  const control = doc.components.find(c => c.id === component && c.id === activity.component);
  if (!control || Object.keys(params).length !== 1) return;
  if (['switch2','intermediate','selector'].includes(control.type) && (params.position === 0 || params.position === 1)) return control;
  if (['switch','isolator','isolator3','mcb','rcbo'].includes(control.type) && typeof params.closed === 'boolean') return control;
}

export function recordSwitchPress(activity: LessonActivity | undefined, id: string, doc: CircuitDocument, result?: SimulationResult): LessonControlPress | undefined {
  if (!activity || lessonSwitch(activity,doc)?.id !== id || result?.revision===doc.revision && result.deviceStates[id]?.tripped) return;
  return {activity:activity.id,component:id,circuit:doc.id,revision:doc.revision+1,
    ...(stairOrHallLamp(doc) ? {lampBefore:lampVolts(doc,result)} : {})};
}

export function checkSwitchPress(activity: LessonActivity, press: LessonControlPress | undefined, doc: CircuitDocument, result?: SimulationResult) {
  if (!press || press.activity !== activity.id || press.component !== activity.component ||
      press.circuit !== doc.id || press.revision !== doc.revision || result?.revision !== doc.revision) return;
  if (!doc.supply.enabled) return {status:'not-run',explanation:'Turn on the bench supply, then try the switch.'} as const;
  if (result.deviceStates[press.component]?.tripped) return {status:'not-run',explanation:'The breaker tripped. Test the wiring before you reset it.'} as const;
  const requested = activity.expectedControls?.[0];
  const fitting = doc.components.find(c => c.id === press.component);
  if (requested && fitting && Object.entries(requested.params).some(([key,value]) => fitting.params[key] !== value))
    return {status:'not-run',explanation:'The switch is in its other position. Press it once more.'} as const;
  const checked = evaluateActivity(activity,doc,result,[]);
  if (!stairOrHallLamp(doc) || checked.status !== 'pass') return checked;
  const after = lampVolts(doc,result);
  if (press.lampBefore == null || after === null)
    return {status:'unresolved',explanation:'The meter couldn’t read across the lamp both times. Check its wires and try the switch again.'} as const;
  const lit = (volts: number) => volts > doc.supply.voltage * .9;
  const dark = (volts: number) => volts < 1;
  if (!(lit(press.lampBefore) && dark(after) || dark(press.lampBefore) && lit(after)))
    return {status:'not-run',explanation:'The lamp didn’t change from on to off or back again. Test the circuit and follow the wire from the switch to the lamp.'} as const;
  return {status:'pass',explanation: (lit(after) ? 'The lamp lit. The voltage across L and N rose' : 'The lamp went out. The voltage across L and N fell') +
    ' from ' + Math.round(press.lampBefore) + ' V to ' + Math.round(after) + ' V.'} as const;
}
