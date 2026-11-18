import { COURSE_PAGES } from './coursebook-content.ts';
import { createIsolatedGuidedBuild } from './guided-build.ts';
import { getLessonActivities, type LessonActivity } from './learning.ts';
import { measureVoltage } from './simulation.ts';
import type { ConfigurationLesson, CircuitDocument, SimulationResult } from './types.ts';

export const CHAPTERS = [
  { id: 'lighting', title: 'Lighting', lessons: [7, 8, 11, 12, 13, 14, 15, 16, 10, 9], practical: 9 },
  { id: 'supply', title: 'Supply and protection', lessons: [1, 3, 4, 5, 6, 2], practical: 2 },
  { id: 'sockets', title: 'Sockets and appliances', lessons: [20, 21, 22, 23, 24, 18, 19, 17], practical: 17 },
  { id: 'heating', title: 'Heating', lessons: [25, 26, 27, 29, 30, 31, 32, 33, 34, 28], practical: 28 },
  { id: 'machines', title: 'Fans, pumps and machinery', lessons: [35, 36, 37, 38, 39, 41, 40], practical: 40 },
  { id: 'energy', title: 'Safety and energy', lessons: [42, 44, 45, 46, 47, 48, 43], practical: 43 },
  { id: 'commercial', title: 'Commercial controls', lessons: [50, 51, 52, 49], practical: 49 },
  { id: 'industrial', title: 'Three-phase systems', lessons: [53, 54, 58, 59, 56, 57, 60, 61, 62, 63, 64, 55], practical: 55 },
];
const order = CHAPTERS.flatMap(chapter => chapter.lessons);
export const chapterFor = (id: number) => CHAPTERS.find(chapter => chapter.lessons.includes(id))!;
export const nextCourseId = (id: number) => order[order.indexOf(id) + 1];
export const courseTitle = (lesson: ConfigurationLesson) => COURSE_PAGES[lesson.id]?.title ?? lesson.title;

export function courseMatchesQuery(lesson: ConfigurationLesson, query: string): boolean {
  const page = COURSE_PAGES[lesson.id];
  const text = [lesson.id, lesson.title, lesson.category, lesson.summary, page?.title, page?.aliases, page?.situation].join(' ').toLowerCase();
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.every(word => text.includes(word));
}

export function courseBuildWires(lesson: ConfigurationLesson) {
  const chapter = chapterFor(lesson.id);
  if (chapter.practical === lesson.id) return lesson.circuit.wires;
  if (chapter.lessons.indexOf(lesson.id) < Math.ceil(chapter.lessons.length / 2)) return [];
  // A short wiring practical teaches a functional path without removing unrelated
  // supply wiring. The original example supplies the exact endpoints and markings.
  const load = lesson.circuit.components.find(c => ['lamp','heater','socket','fan','motor','motor3','pump','emergency','valve','chime','boiler','ev','indicator','heatpump'].includes(c.type));
  return (load ? lesson.circuit.wires.filter(w => w.from.component === load.id || w.to.component === load.id) : lesson.circuit.wires).slice(0, 2);
}

export function createCoursebookBuild(lesson: ConfigurationLesson, id: string, full = false): CircuitDocument {
  const doc = createIsolatedGuidedBuild(lesson.circuit, id);
  if (full) return doc;
  const missing = new Set(courseBuildWires(lesson).map(w => w.id));
  doc.wires = structuredClone(lesson.circuit.wires.filter(w => !missing.has(w.id)));
  const used = new Set(doc.wires.map(w => w.cable?.runId));
  const runs = lesson.circuit.cableRuns?.filter(run => used.has(run.id));
  if (runs?.length) doc.cableRuns = structuredClone(runs);
  return doc;
}

export function bookLampVoltage(doc: CircuitDocument, result?: SimulationResult) {
  if (doc.lessonId !== 7 || !result?.converged || result.revision !== doc.revision) return null;
  return measureVoltage(result, {component:'light',terminal:'L'}, {component:'light',terminal:'N'}).value;
}

export function getCoursebookActivities(lesson: ConfigurationLesson): LessonActivity[] {
  const page = COURSE_PAGES[lesson.id];
  const full = getLessonActivities(lesson);
  const key = (suffix: string) => full.find(a => a.id === `lesson:${lesson.id}:${suffix}`)!;
  const book = (id: string, title: string, instruction: string, extra: Partial<LessonActivity> = {}): LessonActivity => ({
    id: `book:${lesson.id}:${id}`, kind: 'inspect', title, instruction, explanation: page.idea,
    competency: 'coursebook', ...extra,
  });
  const outcome = lesson.id === 7
    ? 'You opened and closed the switch, then measured the voltage across the lamp.'
    : `You demonstrated how to ${page.title.charAt(0).toLowerCase()}${page.title.slice(1)}.`;
  const finish = book('finish', 'Lesson complete', outcome, { bookStep:'finish' });
  if (lesson.id === 7) return [
    {...key('operate:sequence:0'),title:page.title,instruction:'Turn the light off.',bookStep:'switch-off'},
    {...key('operate:sequence:1'),title:page.title,instruction:'Turn the light back on.',bookStep:'switch-on'},
    book('contact', 'Inside the wall switch', page.idea, { bookStep:'contact',component:'switch',part:'contacts' }),
    key('predict'),
    book('meter-demo', 'What does a meter compare?', 'The two probe tips touch the lamp’s connection points, called terminals. A voltage reading compares those two points.', {bookStep:'meter-demo',component:'light'}),
    {...key('measure:voltage'), instruction:'Choose the two terminals on the lamp for your own voltage reading. Then record it.', independentMeasurement:true},
    key('explain'), finish,
  ];
  const missing = new Set(courseBuildWires(lesson).map(w => w.id));
  const operating = full.filter(a => a.id.includes(':operate:sequence:'));
  const measure = full.find(a => a.kind === 'measure' && a.measurement?.mode === 'voltage');
  return [
    book('intro', page.title, page.situation, {bookStep:'intro'}),
    key('predict'),
    ...full.filter(a => a.kind === 'connect' && missing.has(a.wire!)),
    ...(missing.size ? [key('operate:supply')] : []),
    ...(lesson.id === 12 ? [book('compare-power','Compare lamp power','Try the dimmer at 25% and 90%. Read the lamp power at each setting.',{
      kind:'operate',component:'dimmer',part:'actuator',bookStep:'dimmer',
    })] : operating),
    ...(measure ? [{...measure, independentMeasurement:true}] : []),
    ...(chapterFor(lesson.id).practical === lesson.id ? [{...key('retest'),title:'Test the complete build',instruction:'Test your connections and the full operating sequence on this circuit.'}] : []),
    key('explain'), finish,
  ];
}
