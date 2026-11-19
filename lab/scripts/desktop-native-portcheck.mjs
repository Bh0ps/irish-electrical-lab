import net from 'node:net';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import profiles from '../desktop/app/verification-profile.cjs';
import {checkAuditShell} from './desktop-lifecycle-audit.mjs';
const executable=process.argv[2];
if(!executable)throw new Error('Pass the installed Irish Electrical Lab executable.');
checkAuditShell(executable);
const args=['--verify-port-conflict','--verify-run=port-'+randomUUID()];
const profile=profiles.verificationProfile(args);
const server=net.createServer();
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4187,'127.0.0.1',resolve);});
try{
  const child=spawn(executable,args,{windowsHide:true,stdio:'ignore'});
  const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Port-conflict diagnostic did not exit.'));},15000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);resolve(code);});});
  const report=JSON.parse(readFileSync(path.join(profile.path,'verification','desktop-port-conflict-report.json'),'utf8'));
  if(exit!==0||!report.passed)throw new Error(JSON.stringify({exit,report}));
  console.log(JSON.stringify({exit,...report},null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
