import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENT_LIST, COMPONENTS } from '../lib/components.ts';
import { LESSONS, validateLessons } from '../lib/lessons.ts';
import { getComponentTerminals } from '../lib/terminal-layout.ts';
import { createGalleryInventory, galleryVariantKey } from '../components/lab/ModelGallery.tsx';

/** Run with: node --import tsx scripts/catalog-audit.ts
 * Structural checks intentionally do not equate a valid topology with a safe
 * installation or a passing operating exercise; those are simulator checks. */
const errors: string[] = [...validateLessons()];
const warnings: string[] = [];
const fail = (message: string) => errors.push(message);
const finiteVector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(x => typeof x === 'number' && Number.isFinite(x));
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const unique = (values: string[], scope: string) => { if (new Set(values).size !== values.length) fail(`${scope}: duplicate stable IDs`); };
const modelKinds = new Set(['supply', 'meter', 'panel', 'protection', 'socket', 'plug', 'switch', 'lamp', 'sensor', 'controller', 'heater', 'appliance', 'valve', 'pump', 'fan', 'motor', 'contactor', 'overload', 'vfd', 'plc', 'inverter', 'alarm', 'charger', 'transformer', 'bar', 'junction', 'cable', 'conduit', 'instrument']);

unique(COMPONENT_LIST.map(def => def.type), 'Equipment catalog');
for (const def of COMPONENT_LIST) {
  if (!modelKinds.has(def.model)) fail(`${def.type}: no procedural model renderer for ${def.model}`);
  if (!text(def.name) || !text(def.description)) fail(`${def.type}: missing name or purpose`);
  if (!finiteVector(def.size) || def.size.some(x => x <= 0)) fail(`${def.type}: invalid model dimensions`);
  unique(def.terminals.map(terminal => terminal.id), `${def.type} terminals`);
  unique(def.parts.map(part => part.id), `${def.type} parts`);
  for (const terminal of def.terminals) if (!finiteVector(terminal.anchor) || !text(terminal.purpose) || !text(terminal.label)) fail(`${def.type}.${terminal.id}: incomplete or non-finite terminal metadata`);
  for (const part of def.parts) if (!text(part.name) || !text(part.purpose)) fail(`${def.type}/${part.id}: missing selectable-part explanation`);
}

if (LESSONS.length !== 64) fail(`Expected exactly 64 arrangements; received ${LESSONS.length}`);
unique(LESSONS.map(lesson => String(lesson.id)), 'Lesson catalog');
for (let id = 1; id <= 64; id++) if (!LESSONS.some(lesson => lesson.id === id)) fail(`Missing lesson ${id}`);
const details = LESSONS.map(lesson => {
  const prefix = `Lesson ${lesson.id}`;
  const circuit = lesson.circuit;
  const instances = new Map(circuit.components.map(component => [component.id, component]));
  unique(circuit.components.map(component => component.id), `${prefix} component instances`);
  unique(circuit.wires.map(wire => wire.id), `${prefix} wires`);
  if (circuit.version !== 1 || !text(circuit.id) || !text(circuit.name)) fail(`${prefix}: invalid circuit identity/version`);
  if (circuit.components.length > 80 || circuit.wires.length > 300) fail(`${prefix}: example exceeds workbench limits`);
  if (!Number.isFinite(circuit.supply.voltage) || circuit.supply.voltage <= 0 || !Number.isFinite(circuit.supply.sourceResistance) || circuit.supply.sourceResistance < 0 || circuit.supply.frequency !== 50) fail(`${prefix}: invalid educational supply profile`);
  if (!circuit.components.some(component => component.type === (circuit.supply.phase === 'three' ? 'source3' : 'source'))) fail(`${prefix}: no matching supply source`);
  for (const component of circuit.components) {
    if (!COMPONENTS[component.type]) fail(`${prefix}: unknown model type ${component.type}`);
    if (!finiteVector(component.position) || !Number.isFinite(component.rotation)) fail(`${prefix}/${component.id}: non-finite placement`);
    if (!text(component.label)) fail(`${prefix}/${component.id}: missing readable equipment label`);
    for (const [key, value] of Object.entries(component.params)) if (typeof value === 'number' && !Number.isFinite(value)) fail(`${prefix}/${component.id}.${key}: non-finite parameter`);
  }
  const wirePairs = new Set<string>();
  for (const wire of circuit.wires) {
    const a = `${wire.from.component}.${wire.from.terminal}`;
    const b = `${wire.to.component}.${wire.to.terminal}`;
    if (a === b) fail(`${prefix}/${wire.id}: wire joins a terminal to itself`);
    const pair = [a, b].sort().join('|');
    if (wirePairs.has(pair)) warnings.push(`${prefix}/${wire.id}: parallel conductors share identical endpoints`);
    wirePairs.add(pair);
    if (!Number.isFinite(wire.resistance) || wire.resistance < 0) fail(`${prefix}/${wire.id}: invalid conductor resistance`);
    if (!wire.bends.every(finiteVector)) fail(`${prefix}/${wire.id}: non-finite conductor bend`);
    for (const endpoint of [wire.from, wire.to]) {
      const component = instances.get(endpoint.component);
      if (!component || !COMPONENTS[component.type]?.terminals.some(terminal => terminal.id === endpoint.terminal)) fail(`${prefix}/${wire.id}: invalid terminal endpoint ${endpoint.component}.${endpoint.terminal}`);
    }
  }
  if (!text(lesson.title) || !text(lesson.summary) || !text(lesson.context) || !text(lesson.category)) fail(`${prefix}: missing introductory lesson content`);
  if (lesson.sections.length < 6 || lesson.sections.some(section => !text(section.title) || !text(section.beginner) || !text(section.apprentice))) fail(`${prefix}: incomplete beginner/apprentice explanations`);
  if (lesson.steps.length < 6 || lesson.steps.some(step => !text(step))) fail(`${prefix}: missing guided-build steps`);
  if (lesson.objectives.length < 2 || lesson.objectives.some(objective => !text(objective))) fail(`${prefix}: incomplete challenge objectives`);
  if (Object.values({ title: lesson.challenge.title, briefing: lesson.challenge.briefing, fault: lesson.challenge.fault, hint: lesson.challenge.hint, answer: lesson.challenge.answer }).some(value => !text(value))) fail(`${prefix}: incomplete fault challenge`);
  if (lesson.challenge.wire && !circuit.wires.some(wire => wire.id === lesson.challenge.wire)) fail(`${prefix}: challenge names an unknown conductor`);
  if (lesson.challenge.component && !instances.has(lesson.challenge.component)) fail(`${prefix}: challenge names an unknown component`);
  if (lesson.references.length < 2 || lesson.references.some(reference => !text(reference.title) || !/^https:\/\//.test(reference.url))) fail(`${prefix}: missing authoritative reference links`);
  return { id: lesson.id, title: lesson.title, components: circuit.components.length, wires: circuit.wires.length, sections: lesson.sections.length, guidedSteps: lesson.steps.length, objectives: lesson.objectives.length, challenge: lesson.challenge.fault };
});

const inventory = createGalleryInventory();
unique(inventory.map(entry => entry.key), 'Gallery inventory');
const galleryTypes = new Set(inventory.map(entry => entry.component.type));
const galleryKeys = new Set(inventory.map(entry => entry.key));
for(const entry of inventory)for(const component of [entry.component,...entry.companions??[]]) {
  const terminals=getComponentTerminals(component,COMPONENTS[component.type]);
  if(terminals.length!==COMPONENTS[component.type].terminals.length)fail(`${entry.key}: incomplete resolved terminal set`);
  for(const terminal of terminals)if(terminal.anchor[2]>=0||!terminal.group)fail(`${entry.key}/${terminal.id}: connection belongs in an identified rear bank`);
}

for (const def of COMPONENT_LIST) if (!galleryTypes.has(def.type)) fail(`${def.type}: missing from the QA gallery`);
for(const def of COMPONENT_LIST)for(const variant of def.variants ?? []) {
  const sample={id:'variant-check',type:def.type,label:def.name,position:[0,0,0] as [number,number,number],rotation:0,params:{...def.defaults},variant:variant.id};
  if(!galleryKeys.has(galleryVariantKey(sample)))fail(`${def.type}/${variant.id}: selectable model form absent from gallery`);
}
for (const lesson of LESSONS) for (const component of lesson.circuit.components) if (!galleryKeys.has(galleryVariantKey(component))) fail(`Lesson ${lesson.id}/${component.id}: visual variant absent from gallery`);
for (const entry of inventory) for (const companion of entry.companions ?? []) {
  if (!COMPONENTS[companion.type] || !finiteVector(companion.position)) fail(`${entry.key}: invalid paired-gallery model`);
}
const gangLesson = LESSONS.find(lesson => lesson.id === 11);
const leftGang = gangLesson?.circuit.components.find(component => component.params.gangModule === 'left');
const rightGang = gangLesson?.circuit.components.find(component => component.params.gangModule === 'right');
if (!leftGang || !rightGang || leftGang.params.gangGroup !== rightGang.params.gangGroup || !leftGang.params.gangGroup || Math.abs(rightGang.position[0] - leftGang.position[0] - .46) > 1e-9 || leftGang.position[1] !== rightGang.position[1] || leftGang.position[2] !== rightGang.position[2]) fail('Lesson 11: shared two-gang plate requires adjacent independently identified left/right modules');
if (leftGang && rightGang && (COMPONENTS[leftGang.type].terminals.length !== 2 || COMPONENTS[rightGang.type].terminals.length !== 2)) fail('Lesson 11: each rocker module must retain its own COM/OUT terminals');

const report = {
  generatedAt: new Date().toISOString(), status: errors.length ? 'FAIL' : 'PASS',
  summary: { lessons: LESSONS.length, equipmentTypes: COMPONENT_LIST.length, galleryModels: inventory.length, gallerySheets: Math.ceil(inventory.length / 12), terminalDefinitions: COMPONENT_LIST.reduce((n, def) => n + def.terminals.length, 0), totalExampleComponents: LESSONS.reduce((n, lesson) => n + lesson.circuit.components.length, 0), totalExampleWires: LESSONS.reduce((n, lesson) => n + lesson.circuit.wires.length, 0), errors: errors.length, warnings: warnings.length },
  checks: ['64 unique arrangements', 'registered procedural model families', 'finite placements and terminal anchors', 'valid conductor terminal endpoints', 'beginner and apprentice sections', 'guided builds and objectives', 'fault challenge metadata', 'reference links', 'complete gallery type and visual-variant coverage', 'shared two-gang plate with independent terminal identities', 'rear installation-terminal banks for every visual variant'],
  errors: [...new Set(errors)], warnings, lessons: details,
  gallery: inventory.map(entry => ({ key: entry.key, type: entry.component.type, name: entry.name, source: entry.source })),
  qualification: 'Structural validation checks model/catalog completeness. Simulator tests verify operation and protection findings separately. Original geometry is representative teaching equipment.'
};
const reportPath = fileURLToPath(new URL('../../verification/catalog-report.json', import.meta.url));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`${report.status}: ${LESSONS.length} lessons, ${COMPONENT_LIST.length} equipment types, ${inventory.length} gallery models. ${errors.length} errors, ${warnings.length} warnings.`);
console.log(reportPath);
for (const message of errors) console.error(message);
process.exitCode = errors.length ? 1 : 0;
