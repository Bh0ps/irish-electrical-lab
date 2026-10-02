import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory=process.argv.includes('--directory');
const client=new URL('../dist/client/index.html',import.meta.url);
if(!existsSync(client))throw new Error('Build the web app first with npm run build.');
for(const script of ['make-qa-fixtures.ts','desktop-fixtures.ts','collect-third-party-notices.mjs']){
  const prepared=spawnSync(process.execPath,[...(script.endsWith('.ts')?['--import','tsx']:[]),`scripts/${script}`],{stdio:'inherit'});
  if(prepared.error)throw prepared.error;if(prepared.status!==0)throw new Error(`Could not prepare desktop assets: ${script}.`);
}
const cli=new URL('../node_modules/electron-builder/cli.js',import.meta.url);
const args=[fileURLToPath(cli),'--config','desktop/electron-builder.json','--win',...(directory?['--dir']:['nsis']),'--x64','--publish','never'];
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
