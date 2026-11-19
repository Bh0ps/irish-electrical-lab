import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import asar from '@electron/asar';
import profiles from '../desktop/app/verification-profile.cjs';

export function checkAuditShell(executable) {
  const archive=path.join(path.dirname(path.resolve(executable)),'resources','app.asar');
  const metadata=JSON.parse(asar.extractFile(archive,'package.json').toString('utf8'));
  if(metadata.name!=='irish-electrical-lab-desktop'||metadata.verificationProfileVersion!==1)
    throw new Error('This installed shell does not support isolated audit profiles. Install the rebuilt version before checking it.');
}
function lifecycle(executable,label) {
  const run='--verify-run='+(label??randomUUID());
  const profile=profiles.verificationProfile(['--verify-lifecycle',run]);
  const file=path.join(profile.path,'verification','desktop-lifecycle-report.json');
  const began=Date.now();
  for(const phase of ['--verify-lifecycle','--verify-lifecycle-check']){
    const child=spawnSync(executable,[phase,run],{timeout:90000,windowsHide:true,stdio:'ignore'});
    if(child.error||child.status!==0)throw new Error(phase+' failed. '+(child.error?.message??'Exit '+child.status)+'. Check '+profile.path);
    const report=JSON.parse(readFileSync(file,'utf8'));
    if(report.userData!==profile.path||!(Date.parse(report.startedAt)>=began)||report.error||!(report.prepareChecks?.length>0&&report.prepareChecks.every(c=>c.passed)))
      throw new Error('Lifecycle preparation failed. Read '+file);
    if(phase==='--verify-lifecycle-check'&&report.passed!==true)throw new Error('Lifecycle restart failed. Read '+file);
  }
  console.log('Lifecycle check passed. '+file);
}
if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  const [executable,label]=process.argv.slice(2);
  if(!executable)throw new Error('Pass the installed executable and, optionally, a verification run label.');
  checkAuditShell(executable);
  if(label!=='--check-shell')lifecycle(executable,label);
}
