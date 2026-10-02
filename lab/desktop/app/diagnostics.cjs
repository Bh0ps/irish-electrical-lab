/* eslint-disable @typescript-eslint/no-require-imports -- Internal diagnostic entry point for the isolated desktop application. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
async function runDesktopDiagnostics({ app, window, directory, startedAt, consoleErrors, networkRequests, dialog }) {
  window.showInactive();
  const output = path.join(app.getPath('userData'), 'verification'); fs.mkdirSync(output, { recursive: true });
  const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '../assets');
  const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'qa-circuits.json'), 'utf8'));
  function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }
  const assets = files(directory), workerPath = stem => '/' + path.relative(directory, assets.find(file => path.basename(file).startsWith(stem + '.worker-') && file.endsWith('.js'))).replace(/\\/g, '/');
  const report = { app: 'Irish Electrical Lab', version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, startedAt: new Date(startedAt).toISOString(), origin: 'http://127.0.0.1:4187', userData: app.getPath('userData'), consoleErrors, workerResults: [], graphics: app.getGPUFeatureStatus(),windowVisible:window.isVisible(),backgroundThrottling:window.webContents.getBackgroundThrottling(),measurementMethod:'App-owned diagnostics in the visible Electron application window. Runtime overhead, bundled workers and loaded Blender geometry are included.' };
  try {
    const runtime = await window.webContents.executeJavaScript(`(async()=>{
      for(let tries=0;tries<100&&!document.querySelector('canvas');tries++)await new Promise(resolve=>setTimeout(resolve,100));
      const appReadyMs=performance.now();
      let geometryReadyMs=null,initialScene=null;
      const sceneSnapshot=()=>new Promise(resolve=>{const handler=e=>{clearTimeout(timer);resolve(e.detail);};const timer=setTimeout(()=>{window.removeEventListener('electrical-lab-scene',handler);resolve(null);},1000);window.addEventListener('electrical-lab-scene',handler,{once:true});window.dispatchEvent(new Event('electrical-lab-scene-request'));});
      for(let tries=0;tries<100;tries++){const scene=await sceneSnapshot();if(scene?.components?.length&&scene.components.every(component=>component.assetKeys?.length)&&!scene.routingPending){initialScene=scene;geometryReadyMs=performance.now();break;}await new Promise(resolve=>setTimeout(resolve,100));}
      await window.electricalDesktop.setFullscreen(false);
      let invalidFileRequestRejected=false;try{await window.electricalDesktop.readJsonFile('unsupported');}catch{invalidFileRequestRejected=true;}
      const fixtures=${JSON.stringify(fixtures)};
      const oneWorker=async(url,payload,accept)=>new Promise((resolve,reject)=>{const worker=new Worker(url,{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker timeout '+url));},20000);worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message));};worker.onmessage=e=>{if(!accept(e.data))return;clearTimeout(timer);worker.terminate();resolve(e.data);};worker.postMessage(payload);});
      const workerResults=[];
      for(const fixture of fixtures){const start=performance.now();const routing=await oneWorker(${JSON.stringify(workerPath('routing'))},{id:fixture.id,key:'desktop-verify-'+fixture.id,document:fixture.circuit},()=>true);const simulation=await oneWorker(${JSON.stringify(workerPath('simulation'))},{document:fixture.circuit,dt:.1,reset:true},m=>m.kind==='result'||m.kind==='error');workerResults.push({id:fixture.id,wires:fixture.circuit.wires.length,routes:routing.routing?.routes?.size,issues:routing.routing?.issues?.length??0,routingError:routing.error,converged:simulation.result?.converged,error:simulation.message,solverMs:simulation.result?.elapsedMs,combinedMs:performance.now()-start});}
      const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl'));
      const evidence={bridge:window.electricalDesktop?.platform,nativeIpcAccepted:true,invalidFileRequestRejected,nodeAvailable:typeof window.require!=='undefined'||typeof window.process!=='undefined',title:document.title,canvasCount:document.querySelectorAll('canvas').length,canvasSize:canvas?{width:canvas.width,height:canvas.height}:null,webgl:!!gl,bodyText:document.body.innerText.slice(0,1500),memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null};
      return {workerResults,evidence,appReadyMs,geometryReadyMs,initialScene,appTimeOrigin:performance.timeOrigin};
    })()`);
    Object.assign(report, runtime);report.elapsedMs=Date.now()-startedAt;report.graphics=app.getGPUFeatureStatus();report.processMetrics=app.getAppMetrics().map(metric=>({type:metric.type,cpu:metric.cpu,memory:metric.memory}));
    report.passed=runtime.evidence.bridge==='windows'&&runtime.evidence.invalidFileRequestRejected&&!runtime.evidence.nodeAvailable&&runtime.evidence.webgl&&runtime.geometryReadyMs!==null&&runtime.workerResults.length===64&&runtime.workerResults.every(result=>result.routes===result.wires&&result.issues===0&&!result.routingError&&!result.error&&result.converged);
    report.startupMs=runtime.appTimeOrigin+runtime.appReadyMs-startedAt;
    report.geometryReadyStartupMs=runtime.geometryReadyMs===null?null:runtime.appTimeOrigin+runtime.geometryReadyMs-startedAt;
    fs.writeFileSync(path.join(output,'desktop-runtime.png'),(await window.webContents.capturePage()).toPNG());
    if(process.argv.includes('--verify-ui')){report.ui=await require('./ui-v1-1-diagnostics.cjs').runUiDiagnostics({app,window,output,root,fixtures,dialog});report.passed=report.passed&&report.ui.passed;}
    if(process.argv.includes('--verify-dimmer')){report.dimmer=await require('./dimmer-diagnostics.cjs').runDimmerDiagnostics({app,window,output,fixtures,dialog,directory,returnToApp:process.argv.includes('--verify-gallery')||process.argv.includes('--verify-graphics')});report.passed=report.passed&&report.dimmer.passed;}
    if(process.argv.includes('--verify-gallery')){report.gallery=await require('./gallery-diagnostics.cjs').runGalleryDiagnostics({window,output,fixtures,directory,version:app.getVersion(),packaged:app.isPackaged});report.passed=report.passed&&report.gallery.passed;}
    if(process.argv.includes('--verify-graphics')){report.graphicsVerification=await require('./graphics-diagnostics.cjs').runGraphicsDiagnostics({app,window,output,root,fixtures,dialog,directory});report.passed=report.passed&&report.graphicsVerification.passed;}
    report.network={observed:networkRequests.length,remoteRequests:networkRequests.filter(request=>request.blocked),origins:Array.from(new Set(networkRequests.filter(request=>/^https?:/.test(request.url)).map(request=>new URL(request.url).origin))),remoteBlockedByShell:true};
    report.passed=report.passed&&consoleErrors.length===0&&report.network.remoteRequests.length===0;
  }catch(error){report.passed=false;report.error=error.message;}
  fs.writeFileSync(path.join(output,'desktop-runtime-report.json'),JSON.stringify(report,null,2));
  app.quit();
}
module.exports={runDesktopDiagnostics};
