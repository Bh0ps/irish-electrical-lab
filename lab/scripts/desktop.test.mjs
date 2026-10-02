import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const { allowedReference, safeFileName, ORIGIN }=require('../desktop/app/security.cjs');
const { resolveFile, createAppServer, CSP }=require('../desktop/app/server.cjs');
const { runRetentionDiagnostics }=require('../desktop/app/retention-diagnostics.cjs');
test('desktop reference bridge accepts official HTTPS sources and rejects unsafe schemes and deceptive hosts',()=>{
  for(const url of ['https://www.nsai.ie/standards/','https://media.esbnetworks.ie/file.pdf','https://safeelectric.ie/contractors/faqs/','https://www.varilight.co.uk/','https://www.danlers.co.uk/','https://kb.shelly.cloud/','https://www.aico.co.uk/','https://support.myenergi.com/','https://library.e.abb.com/','https://docs.tia.siemens.cloud/','https://www.pilz.com/'])assert.equal(allowedReference(url),true);
  for(const url of ['file:///C:/secret','javascript:alert(1)','http://nsai.ie','https://nsai.ie.evil.com','https://evil.com@nsai.ie','https://nsai.ie:4187','https://www.aico.co.uk.evil.com/','https://kb.shelly.cloud.attacker.com/'])assert.equal(allowedReference(url),false);
  assert.equal(ORIGIN,'http://127.0.0.1:4187');assert.equal(safeFileName('../bad:name','backup'),'..-bad-name.json');
});
test('bundled server confines files to its own directory, supports static routes and serves workers',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'electrical-server-'));try{
    writeFileSync(path.join(directory,'index.html'),'app');mkdirSync(path.join(directory,'_next'));writeFileSync(path.join(directory,'_next','worker.js'),'worker');
    assert.equal(resolveFile(directory,'/_next/worker.js'),path.join(directory,'_next','worker.js'));assert.equal(resolveFile(directory,'/study'),path.join(directory,'index.html'));assert.equal(resolveFile(directory,'/%2e%2e%2fsecret.json'),null);assert.equal(resolveFile(directory,'/unknown.js'),undefined);assert.equal(resolveFile(directory,'/%00'),null);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('application server starts and closes without leaving a port bound',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'electrical-server-'));try{
    writeFileSync(path.join(directory,'index.html'),'app');const server=await createAppServer(directory,0);assert.equal(server.listening,true);await new Promise(resolve=>server.close(resolve));assert.equal(server.listening,false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('a port conflict rejects startup with an explicit explanation instead of loading another server',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'electrical-server-'));let server;try{
    writeFileSync(path.join(directory,'index.html'),'app');server=await createAppServer(directory,0);await assert.rejects(()=>createAppServer(directory,server.address().port),/port 4187 is in use.*saved work is safe/);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});
test('packaging includes local workers and a standalone runtime with no renderer Node access',()=>{
  const config=JSON.parse(readFileSync(new URL('../desktop/electron-builder.json',import.meta.url),'utf8'));assert.equal(config.nsis.perMachine,false);assert.equal(config.nsis.allowElevation,false);assert.equal(config.nsis.createDesktopShortcut,true);assert.equal(config.nsis.deleteAppDataOnUninstall,false);assert.equal(config.extraResources[0].from,'dist/client');
  const main=readFileSync(new URL('../desktop/app/main.cjs',import.meta.url),'utf8');assert.match(main,/sandbox: true/);assert.match(main,/contextIsolation: true/);assert.match(main,/nodeIntegration: false/);assert.match(main,/requestSingleInstanceLock/);assert.match(main,/closeAllConnections/);assert.match(CSP,/worker-src 'self' blob:/);
});
test('version 1.2.1 keeps the existing per-user identity and shortcuts for upgrades',()=>{
  const metadata=JSON.parse(readFileSync(new URL('../desktop/app/package.json',import.meta.url),'utf8'));
  const config=JSON.parse(readFileSync(new URL('../desktop/electron-builder.json',import.meta.url),'utf8'));
  assert.equal(metadata.version,'1.2.1');assert.equal(config.appId,'ie.irish-electrical-lab.desktop');assert.equal(config.productName,'Irish Electrical Lab');assert.equal(config.nsis.createStartMenuShortcut,true);assert.equal(config.nsis.shortcutName,'Irish Electrical Lab');
  const main=readFileSync(new URL('../desktop/app/main.cjs',import.meta.url),'utf8');assert.match(main,/PROFILE_NAME = 'Irish Electrical Lab'/);assert.match(main,/app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), PROFILE_NAME\)\)/);
});

test('an unfinished upgrade verification cannot overwrite the learner recovery backup',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'electrical-retention-'));
  try {
    const output=path.join(directory,'verification');mkdirSync(output);
    const reportFile=path.join(output,'desktop-upgrade-retention-report.json');
    const backupFile=path.join(output,'desktop-upgrade-retention-original.json');
    const originalReport=JSON.stringify({expectedDigest:'pending-seed',originalRecordsRestored:false});
    const originalBackup=JSON.stringify([['draft',{id:'learner-build'}]]);
    writeFileSync(reportFile,originalReport);writeFileSync(backupFile,originalBackup);
    let quit=false,rendererTouched=false;
    await runRetentionDiagnostics({app:{getPath:()=>directory,quit:()=>{quit=true;}},window:{webContents:{executeJavaScript:()=>{rendererTouched=true;throw new Error('Renderer must remain untouched');}}}});
    assert.equal(quit,true);assert.equal(rendererTouched,false);
    assert.equal(readFileSync(reportFile,'utf8'),originalReport);
    assert.equal(readFileSync(backupFile,'utf8'),originalBackup);
    assert.match(readFileSync(path.join(output,'desktop-retention-seed-error.json'),'utf8'),/original backup has been preserved/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
