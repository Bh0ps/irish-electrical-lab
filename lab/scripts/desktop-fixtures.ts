import { readFileSync, writeFileSync } from 'node:fs';
import { LESSONS } from '../lib/lessons.ts';
import { validateCircuit } from '../lib/storage.ts';
import { getLessonActivities } from '../lib/learning.ts';
writeFileSync(new URL('../desktop/assets/qa-circuits.json',import.meta.url),JSON.stringify(LESSONS.map(lesson=>({id:lesson.id,title:lesson.title,circuit:lesson.circuit,activities:getLessonActivities(lesson),challenge:lesson.challenge}))));
const benchmark=validateCircuit(JSON.parse(readFileSync(new URL('../../verification/fixtures/30-components.json',import.meta.url),'utf8')));
writeFileSync(new URL('../desktop/assets/qa-benchmark.json',import.meta.url),JSON.stringify(benchmark));
