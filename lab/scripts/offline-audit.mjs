import { readFileSync,readdirSync,statSync,existsSync,writeFileSync,mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../dist/client/',import.meta.url));
const files=[];function walk(directory){for(const name of readdirSync(directory)){const file=path.join(directory,name);if(statSync(file).isDirectory())walk(file);else files.push(file);}}walk(root);
const findings=[];let links=0;
const check=(url,file)=>{if(url.startsWith('data:')||url.startsWith('#'))return;if(/^(https?:)?\/\//.test(url)){findings.push(`Remote asset in ${path.relative(root,file)}: ${url}`);return;}if(url.includes('${')||url.includes('var('))return;const relative=url.split(/[?#]/)[0];const target=relative.startsWith('/')?path.join(root,relative):path.resolve(path.dirname(file),relative);if(!existsSync(target))findings.push(`Missing local asset: ${path.relative(root,target)}`);links++;};
for(const file of files){if(file.endsWith('.html')){const html=readFileSync(file,'utf8');for(const tag of html.match(/<(?:script|link)\b[^>]*>/g)||[]){const url=tag.match(/(?:src|href)="([^"]+)"/);if(url)check(url[1],file);}}if(file.endsWith('.css')){const css=readFileSync(file,'utf8');for(const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g))check(match[1],file);}if(file.endsWith('.js')){const js=readFileSync(file,'utf8');if(/(?:from\s*|import\s*\()["']https?:\/\//.test(js))findings.push(`Remote JavaScript import in ${path.relative(root,file)}`);}}
const workers=files.filter(f=>/simulation\.worker/.test(f));if(!workers.length)findings.push('Missing bundled simulation Web Worker.');
const routingWorkers=files.filter(f=>/routing\.worker/.test(f));if(!routingWorkers.length)findings.push('Missing bundled routing Web Worker.');
const workerCheck=spawnSync(process.execPath,[fileURLToPath(new URL('./worker-url-audit.mjs',import.meta.url))],{encoding:'utf8',timeout:10000});
let workerUrlAudit;
try{workerUrlAudit=JSON.parse(workerCheck.stdout||'');}catch{findings.push(`Worker constructor audit did not return a report: ${workerCheck.error?.message||workerCheck.stderr?.trim()||'No output'}`);}
if(workerCheck.status!==0||workerUrlAudit?.status!=='PASS')findings.push(...(workerUrlAudit?.findings?.length?workerUrlAudit.findings.map(f=>`Worker constructor: ${f}`):['Worker constructor audit failed.']));
const report={timestamp:new Date().toISOString(),status:findings.length?'FAIL':'PASS',assetFiles:files.length,checkedAssetReferences:links,simulationWorkers:workers.map(f=>path.relative(root,f)),routingWorkers:routingWorkers.map(f=>path.relative(root,f)),workerUrlAudit,findings,method:'Local exported HTML/CSS asset references, JavaScript remote imports, and emitted worker constructors executed in a Node VM to verify HTTP same-origin URLs and local assets. No browser or HTTP requests. Public lesson reference links are intentionally external and optional.'};
const directory=fileURLToPath(new URL('../../verification/',import.meta.url));mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'offline-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(findings.length)process.exitCode=1;
