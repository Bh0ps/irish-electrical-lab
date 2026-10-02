import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInThisContext} from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
const require=createRequire(import.meta.url);
const {recordsDigest,vectorDistance,rotateVector,quaternionAngle,projection,frameSummary,sampleNativePixels,profileRecords,restoreProfileWithoutReact,graphicsRendererHarness}=require('../desktop/app/graphics-diagnostics-helpers.cjs');
test('native profile helper preserves every record including display preferences and unknown keys',async()=>{
  const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
  try{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('irish-electrical-lab',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
    const original=[['draft',{version:1,id:'saved',revision:8,wires:[{from:{component:'a',terminal:'L'},to:{component:'b',terminal:'N'}}]}],['progress',{learning:{7:{activityIds:['read'],evidence:[{value:240,revision:8}]}}}],['builds',[{id:'saved-build'}]],['ui-preferences',{courseDepth:'foundation',liveHints:false}],['presentation-preferences',{version:1,cameraMode:'free',cameraSpeed:7.5,scenery:'courtyard',quality:'high'}],['future-record',{nested:[null,false,0,'x'],retained:true}]];
    await profileRecords('restore',original);const before=await profileRecords('snapshot');assert.equal(before.length,6);assert.equal(recordsDigest(before),recordsDigest(original));
    await profileRecords('restore',[['draft',{id:'temporary'}],['temporary-extra',true]]);assert.notEqual(recordsDigest(await profileRecords('snapshot')),recordsDigest(original));
    await profileRecords('restore',before);assert.equal(recordsDigest(await profileRecords('snapshot')),recordsDigest(original));assert.deepEqual((await profileRecords('snapshot')).find(([key])=>key==='presentation-preferences')?.[1],original.find(([key])=>key==='presentation-preferences')[1]);
    await assert.rejects(profileRecords('restore',[['draft',{id:'must-not-commit'}],['invalid',()=>{}]]));assert.equal(recordsDigest(await profileRecords('snapshot')),recordsDigest(original),'failed restore must atomically abort instead of clearing the store');
  }finally{globalThis.indexedDB=previous;}
});
test('profile digest ignores record/object key order while detecting preference or topology changes',()=>{
  const a=[['draft',{id:'a',wires:[{from:'a',to:'b'}]}],['presentation-preferences',{cameraMode:'free',cameraSpeed:4}]],b=[['presentation-preferences',{cameraSpeed:4,cameraMode:'free'}],['draft',{wires:[{to:'b',from:'a'}],id:'a'}]];
  assert.equal(recordsDigest(a),recordsDigest(b));b[0][1].cameraSpeed=8;assert.notEqual(recordsDigest(a),recordsDigest(b));
});
test('diagnostics unload React before restoring all records and reload the app only after exact verification',async()=>{
  const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();const directory=mkdtempSync(join(tmpdir(),'lab-profile-diagnostic-')),stylesheet=join(directory,'same-origin.css');writeFileSync(stylesheet,'body { margin:0; }');
  try{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('irish-electrical-lab',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
    const records=[['draft',{id:'original',revision:9}],['presentation-preferences',{cameraMode:'free',cameraSpeed:6,quality:'high'}],['future-record',{untouched:true}]],events=[],originalUrl='http://127.0.0.1:4187/',cssUrl='http://127.0.0.1:4187/same-origin.css';let loadedUrl=originalUrl,corruptSnapshot=false;
    const window={webContents:{loadURL:async url=>{loadedUrl=url;events.push(['load',url]);},executeJavaScript:async source=>{assert.equal(loadedUrl,cssUrl,'no restore or verification may run in the React app');events.push(['execute',source.includes(')("restore",')?'restore':'snapshot']);const actual=await runInThisContext(source);return corruptSnapshot&&Array.isArray(actual)?[...actual,['unexpected',true]]:actual;}}};
    await profileRecords('restore',[['draft',{id:'temporary'}],['test-only',true]]);
    const verified=await restoreProfileWithoutReact({window,directory,originalUrl,records,returnToApp:true});
    assert.equal(verified.digest,recordsDigest(records));assert.deepEqual(events,[['load',cssUrl],['execute','restore'],['execute','snapshot'],['load',originalUrl]]);assert.equal(recordsDigest(await profileRecords('snapshot')),recordsDigest(records));
    events.length=0;await restoreProfileWithoutReact({window,directory,originalUrl,records,returnToApp:false});assert.equal(loadedUrl,cssUrl);assert.deepEqual(events.map(e=>e[0]),['load','execute','execute'],'final diagnostic must leave the app unloaded rather than restart save effects');
    events.length=0;corruptSnapshot=true;await assert.rejects(restoreProfileWithoutReact({window,directory,originalUrl,records,returnToApp:true}),/did not restore exactly/);assert.equal(loadedUrl,cssUrl);assert.equal(events.filter(e=>e[0]==='load').length,1,'failed exact verification cannot reopen React');
  }finally{globalThis.indexedDB=previous;unlinkSync(stylesheet);rmdirSync(directory);}
});
test('actual render frame summary derives intervals and distinguishes idle from browser RAF refresh',()=>{
  const s=frameSummary([10,26,43,76,126]);assert.deepEqual(s.intervals,[16,17,33,50]);assert.equal(s.meanMs,29);assert.equal(s.durationMs,116);assert.equal(s.p50Ms,17);assert.equal(s.maxMs,50);assert.equal(frameSummary([]).meanFps,null);assert.equal(frameSummary([10]).frames,1);
});
test('native trajectory helpers correctly assess direction, displacement and quaternion sign equivalence',()=>{
  const q=[0,Math.SQRT1_2,0,Math.SQRT1_2];assert.ok(vectorDistance(rotateVector([0,0,-1],q),[-1,0,0])<1e-12);assert.equal(vectorDistance([1,2,3],[4,6,3]),5);assert.equal(projection([5,0,0],[1,0,0],[1,0,0]),4);assert.equal(quaternionAngle(q,q.map(v=>-v)),0);
});
test('native receiver sampling measures BGRA pixels at the actual device scale and rejects clipped crops',()=>{
  let crop;const image={getSize:()=>({width:200,height:120}),crop:rect=>{crop=rect;return {toBitmap:()=>Buffer.from(Array.from({length:rect.width*rect.height},()=>[10,20,30,255]).flat())};}};
  const sample=sampleNativePixels(image,{x:25,y:15},{width:100,height:60},2);assert.deepEqual(crop,{x:48,y:28,width:5,height:5});assert.equal(sample.pixels,25);assert.equal(sample.meanRgb,20);assert.ok(Math.abs(sample.meanLuma-(.2126*30+.7152*20+.0722*10))<1e-10);
  assert.equal(sampleNativePixels(image,{x:0,y:0},{width:100,height:60}),null);assert.equal(sampleNativePixels(image,{x:NaN,y:20},{width:100,height:60}),null);
});
test('worker telemetry accepts layout-only rebasing and rejects a stale electrical generation',async()=>{
  const oldWindow=globalThis.window,oldWorker=globalThis.Worker,oldCustomEvent=globalThis.CustomEvent;
  class WorkerStub extends EventTarget{postMessage(){}}
  const windowStub=new EventTarget();let draft={id:'actual',revision:1,supply:{enabled:true},components:[{id:'s',type:'switch',params:{closed:true},position:[0,0,0]}],wires:[],faults:[]};windowStub.__labVerify={record:async()=>structuredClone(draft),sleep:async()=>{}};
  globalThis.window=windowStub;globalThis.Worker=WorkerStub;
  try{
    const originalPost=WorkerStub.prototype.postMessage;graphicsRendererHarness();const worker=new WorkerStub();worker.postMessage({document:structuredClone(draft),dt:.1,electricalGeneration:1});
    worker.dispatchEvent(new MessageEvent('message',{data:{kind:'result',circuitId:'actual',electricalGeneration:1,result:{revision:1,converged:true,elapsedMs:2,componentPower:{lamp:60}}}}));
    assert.equal((await windowStub.__graphicsVerify.current()).result.componentPower.lamp,60);
    draft={...draft,revision:2,name:'A renamed circuit',components:draft.components.map(c=>({...c,position:[5,0,-2]}))};assert.equal((await windowStub.__graphicsVerify.current()).draft.revision,2,'unchanged actual electrical graph retains its current delivered result');
    draft.components[0].params.closed=false;draft.revision=3;worker.postMessage({document:structuredClone(draft),dt:.1,electricalGeneration:2});worker.dispatchEvent(new MessageEvent('message',{data:{kind:'result',circuitId:'actual',electricalGeneration:1,result:{revision:3,converged:true,componentPower:{lamp:60}}}}));await assert.rejects(windowStub.__graphicsVerify.current(),/No matching/);
    worker.dispatchEvent(new MessageEvent('message',{data:{kind:'result',circuitId:'actual',electricalGeneration:2,result:{revision:3,converged:true,elapsedMs:2,componentPower:{lamp:0}}}}));assert.equal((await windowStub.__graphicsVerify.current()).result.componentPower.lamp,0);
    worker.postMessage({document:structuredClone(draft),key:'actual-layout-key'});worker.dispatchEvent(new MessageEvent('message',{data:{key:'unmatched-layout-key',routing:{routes:new Map([['fake',[]]]),issues:[]}}}));worker.dispatchEvent(new MessageEvent('message',{data:{key:'actual-layout-key',routing:{routes:new Map([['real',[]]]),issues:[]}}}));
    const routes=windowStub.__graphicsVerify.responses.filter(item=>item.kind==='route');assert.equal(routes[0].requestCircuitId,undefined,'an unmatched route must not inherit the latest circuit identity');assert.equal(routes[0].roundTripMs,null);assert.equal(routes[1].requestCircuitId,'actual');assert.equal(routes[1].requestRevision,3);assert.equal(routes[1].routes,1);assert.equal(routes[1].routeIssues,0);assert.ok(routes[1].roundTripMs>=0);
    assert.ok(windowStub.__graphicsVerify.responses.some(response=>response.roundTripMs!==null&&response.roundTripMs>=0));windowStub.__graphicsVerify.stop();assert.equal(WorkerStub.prototype.postMessage,originalPost);assert.equal(windowStub.__electricalGraphicsDiagnostics,undefined);
  }finally{windowStub.__graphicsVerify?.stop();globalThis.window=oldWindow;globalThis.Worker=oldWorker;globalThis.CustomEvent=oldCustomEvent;}
});
