import { hasBellHandover, isBellRun, type BellRun } from './bell-fault';
import { validateCircuit } from './storage';
import { COMPONENTS } from './components';
import { getComponentTerminals } from './terminal-layout';
import { hasPanelHeater,isHeaterRun,type HeaterRun } from './heater-fault';
import type { CircuitDocument, Endpoint } from './types';

/** A lesson keeps its working copy when the same bench is used for Sandbox. */
export interface LessonBookmark {
  version: 1;
  circuit: CircuitDocument;
  activityId: string;
  path: 'coursebook' | 'full';
  mode: 'explore' | 'build' | 'challenges';
  fault?: { hints: number; accepted: boolean; repaired: boolean; scored: boolean; worktop?: boolean; heater?: boolean; heaterMeter?:'bench'|'field'; chime?:boolean; heaterRun?:HeaterRun; bellRun?:BellRun; completed?: boolean; readingIds?: string[]; probes?:{red?:Endpoint; black?:Endpoint} };
}

export function validateBookmark(value: unknown): LessonBookmark {
  const b = value as Partial<LessonBookmark> | null;
  if (!b || b.version !== 1 || !['coursebook', 'full'].includes(b.path ?? '') ||
      !['explore', 'build', 'challenges'].includes(b.mode ?? '') ||
      typeof b.activityId !== 'string' || !b.activityId.length || b.activityId.length > 256) {
    throw new Error('The saved lesson position could not be read.');
  }
  const circuit = validateCircuit(b.circuit);
  if (!circuit.lessonId || !new RegExp('^(book|lesson):'+circuit.lessonId+':[a-zA-Z0-9:_-]+$').test(b.activityId)) throw new Error('The saved lesson is missing its course.');
  const fault = b.fault;
  if (fault && (!Number.isInteger(fault.hints) || fault.hints < 0 || fault.hints > 100 ||
      [fault.accepted, fault.repaired, fault.scored].some(flag => typeof flag !== 'boolean') ||
      (fault.repaired && !fault.accepted) || (fault.completed !== undefined && (typeof fault.completed !== 'boolean' || fault.completed && !fault.repaired)) ||
      (fault.worktop !== undefined && (typeof fault.worktop !== 'boolean' || fault.worktop && circuit.lessonId !== 66)) ||
      (fault.heater !== undefined && (typeof fault.heater !== 'boolean' || fault.heater && circuit.lessonId !== 20)) ||
      (fault.heaterMeter!==undefined&&(!fault.heater||!['bench','field'].includes(fault.heaterMeter))) ||
      (fault.chime!==undefined&&(typeof fault.chime!=='boolean'||fault.chime&&circuit.lessonId!==72)) ||
      (fault.bellRun!==undefined&&(!fault.chime||!fault.repaired||!hasBellHandover(circuit)||!isBellRun(fault.bellRun,circuit.revision))) ||
      (fault.heaterRun!==undefined&&(!fault.heater||!fault.repaired||!hasPanelHeater(circuit)||!isHeaterRun(fault.heaterRun,circuit.revision))) ||
      (fault.readingIds !== undefined && (!Array.isArray(fault.readingIds) || fault.readingIds.length > 30 || fault.readingIds.some(id=>typeof id!=='string'||id.length>512))) || b.mode !== 'challenges')) throw new Error('Invalid saved fault exercise.');
  if(fault?.probes){
    if(!(fault.worktop||fault.heater||fault.chime)||typeof fault.probes!=='object'||Array.isArray(fault.probes))throw new Error('The saved fault probes could not be read.');
    for(const point of Object.values(fault.probes)){
      const fitting=circuit.components.find(c=>c.id===point?.component);
      if(!fitting||!getComponentTerminals(fitting,COMPONENTS[fitting.type]).some(t=>t.id===point.terminal))throw new Error('A saved probe point is missing from this circuit.');
    }
  }
  return { version: 1, circuit, activityId: b.activityId, path: b.path!, mode: b.mode!, ...(fault ? { fault: { ...fault } } : {}) };
}
