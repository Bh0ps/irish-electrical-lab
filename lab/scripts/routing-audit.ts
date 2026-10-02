import { mkdirSync, writeFileSync } from 'node:fs';
import { LESSONS } from '../lib/lessons.ts';
import { routeCircuit, auditRoutes } from '../lib/routing.ts';
const started=performance.now();
const cases=LESSONS.map(lesson=>{
  const start=performance.now(),routing=routeCircuit(lesson.circuit),issues=auditRoutes(lesson.circuit,routing);
  const record={lesson:lesson.id,wires:lesson.circuit.wires.length,routed:routing.routes.size,elapsedMs:Math.round(performance.now()-start),issues};
  if(issues.length)console.log(JSON.stringify(record));
  return record;
});
const report={passed:cases.every(c=>!c.issues.length&&c.wires===c.routed),elapsedMs:Math.round(performance.now()-started),cases};
mkdirSync('../verification',{recursive:true});
writeFileSync('../verification/routing-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,elapsedMs:report.elapsedMs,routed:cases.reduce((n,c)=>n+c.routed,0),wires:cases.reduce((n,c)=>n+c.wires,0),failedLessons:cases.filter(c=>c.issues.length).map(c=>c.lesson)}));
if(!report.passed)process.exitCode=1;
