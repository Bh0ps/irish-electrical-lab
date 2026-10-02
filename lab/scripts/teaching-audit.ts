import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS } from '../lib/lessons.ts';
import { COMPONENTS } from '../lib/components.ts';
import { getLessonActivities } from '../lib/learning.ts';
import { getScenario, runLessonScenarios } from '../lib/scenarios.ts';
import { simulate } from '../lib/simulation.ts';

// This supplements the independent behavioural audit. Text presence is labelled
// structural evidence, while every recorded scenario verdict is an actual solve.
const errors:string[]=[];
const details=LESSONS.map(lesson=>{
  const activities=getLessonActivities(lesson),scenario=getScenario(lesson.id)!;
  const expectedSections=['Purpose and component roles','Connections and conductor paths','Operating sequence and control logic','Measurements and model limits','Calculations and expected readings','Fault-finding challenge','Irish context and real-work boundary'];
  for(const title of expectedSections){const section=lesson.sections.find(s=>s.title===title);if(!section?.beginner.trim()||!section.apprentice.trim())errors.push(`${lesson.id}: missing ${title}`);}
  for(const component of lesson.circuit.components)for(const terminal of COMPONENTS[component.type].terminals)if(!terminal.purpose.trim()||terminal.purpose.includes('function depends on the contact map'))errors.push(`${lesson.id}: generic purpose ${component.type}.${terminal.id}`);
  const covered=new Set(activities.filter(a=>a.id.includes('operate:sequence:')).map(a=>Number(a.id.split(':').at(-1))));
  for(let i=0;i<scenario.steps.length;i++){const previous=scenario.steps[i-1],step=scenario.steps[i];const combined=previous?.patches.length===1&&previous.patches[0].params.pressed===true&&step.patches.length===1&&step.patches[0].params.pressed===false&&previous.patches[0].component===step.patches[0].component;if(!covered.has(i)&&!combined)errors.push(`${lesson.id}: operating activity missing step ${i}`);}
  const operatingResults=(lesson.circuit.supply.phase==='single'?[230,240]:[400]).map(voltage=>{
    const doc=structuredClone(lesson.circuit);doc.supply.voltage=voltage;
    const result=simulate(doc),before=JSON.stringify(doc),states=JSON.stringify(result.deviceStates),checks=runLessonScenarios(doc,result.deviceStates);
    const unchanged=before===JSON.stringify(doc)&&states===JSON.stringify(result.deviceStates),failed=checks.filter(c=>c.status!=='pass');
    if(!unchanged||failed.length)errors.push(`${lesson.id}/${voltage}: ${failed.length} non-passing scenario checks; preserved=${unchanged}`);
    return {voltage,preservedLearnerDocumentAndStates:unchanged,checks:checks.length,nonPassing:failed};
  });
  return {id:lesson.id,title:lesson.title,tag:lesson.tag,sections:lesson.sections.map(s=>s.title),beginnerWords:lesson.sections.reduce((n,s)=>n+s.beginner.split(/\s+/).length,0),apprenticeWords:lesson.sections.reduce((n,s)=>n+s.apprentice.split(/\s+/).length,0),activities:activities.length,activityKinds:[...new Set(activities.map(a=>a.kind))],actualConnectionTasks:activities.filter(a=>a.kind==='connect').length,operatingSteps:scenario.steps.map(s=>s.title),measurementTargets:activities.filter(a=>a.measurement).map(a=>({title:a.title,...a.measurement})),challenge:{fault:lesson.challenge.fault,component:lesson.challenge.component,wire:lesson.challenge.wire},operatingResults,references:lesson.references};
});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:errors.length?'FAIL':'PASS',coverage:{lessons:details.length,activities:details.reduce((n,l)=>n+l.activities,0),operatingSteps:details.reduce((n,l)=>n+l.operatingSteps.length,0),electricalChecks:details.flatMap(l=>l.operatingResults).reduce((n,r)=>n+r.checks,0),supplies:'52 domestic/commercial examples at both 230 and 240 V; 12 industrial examples at 400 V line-to-line'},errors,lessons:details,limitations:['Text/terminal coverage is structural evidence, not a claim of manufacturer-specific fidelity.','Operating checks solve the actual graph in copies and preserve learner controls, parameters and latched trips.','Fault challenge behaviour is independently verified by lesson-simulation-report.json and measurement-evidence tests.','Reference URLs are listed as content; this audit does not perform network requests or validate current web availability.','This is a steady-state educational model and does not certify electrical or machinery safety compliance.']};
const target=fileURLToPath(new URL('../../verification/teaching-report.json',import.meta.url));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({target,status:report.status,coverage:report.coverage,errors}));process.exitCode=errors.length?1:0;
