import { readFileSync,writeFileSync } from 'node:fs';
import { simulate } from '../lib/simulation.ts';
import { validateCircuit } from '../lib/storage.ts';
const document=validateCircuit(JSON.parse(readFileSync(new URL('../../verification/fixtures/30-components.json',import.meta.url),'utf8')));
let previous={};const times:number[]=[];
for(let i=0;i<120;i++){const result=simulate(document,previous,.25);if(!result.converged||result.diagnostics.some(d=>d.severity==='error'))throw new Error('Benchmark circuit did not resolve.');previous=result.deviceStates;if(i>=20)times.push(result.elapsedMs);}
times.sort((a,b)=>a-b);const report={timestamp:new Date().toISOString(),components:document.components.length,wires:document.wires.length,iterations:times.length,averageMs:times.reduce((a,b)=>a+b,0)/times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),method:'Windows Node steady-state solver benchmark after 20 warmup passes. GPU frame time and packaged-worker latency are measured separately in the desktop runtime report.'};
writeFileSync(new URL('../../verification/solver-benchmark.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
