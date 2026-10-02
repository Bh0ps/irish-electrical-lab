/* eslint-disable @typescript-eslint/no-require-imports -- App-owned native diagnostic helpers. */
'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
function recordsDigest(records){const sorted=records.map(([key,value])=>[canonical(key),canonical(value)]).sort(([a],[b])=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');}
function vectorDistance(a,b){return Math.hypot(...a.map((value,index)=>value-b[index]));}
function rotateVector(v,q){const [x,y,z,w]=q,[vx,vy,vz]=v,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx);return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx];}
function quaternionAngle(a,b){return 2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,value,index)=>sum+value*b[index],0))));}
function projection(a,b,direction){return a.reduce((sum,value,index)=>sum+(value-b[index])*direction[index],0);}
function frameSummary(frames){const intervals=frames.slice(1).map((time,index)=>time-frames[index]).filter(value=>Number.isFinite(value)&&value>0),sorted=[...intervals].sort((a,b)=>a-b),percentile=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:null,mean=intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null;return {frames:frames.length,intervals,meanMs:mean,meanFps:mean?1000/mean:null,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:sorted.at(-1)??null,durationMs:frames.length>1?frames.at(-1)-frames[0]:0};}
/** Six independently protected training cells, each with an actual switched
 * load and inline junction. No common clamp receives dozens of conductors. */
function makeGraphicsBenchmark(oneWay){
  const doc=structuredClone(oneWay);doc.id='graphics-native-training-30';doc.name='Six complete lighting training cells';doc.revision=0;delete doc.lessonId;doc.components=[];doc.wires=[];doc.faults=[];
  const originalSwitch=oneWay.components.find(c=>c.type==='switch'),originalLamp=oneWay.components.find(c=>c.type==='lamp');
  if(!originalSwitch||!originalLamp)throw new Error('One-way benchmark source lacks its physical switch or lamp');
  const outgoing=oneWay.wires.find(w=>w.from.component===originalSwitch.id&&w.to.component===originalLamp.id&&w.role==='L');if(!outgoing)throw new Error('Benchmark source lacks the actual switched line');
  for(let i=0;i<6;i++){
    const prefix='cell-'+(i+1)+'-',offset=[(i%2)*13-6.5,0,(Math.floor(i/2)-1)*6],local={source:-5,rcbo:-2,switch:0,lamp:4.5};
    for(const original of oneWay.components){const c=structuredClone(original);c.id=prefix+c.id;c.label='Cell '+(i+1)+' · '+c.label;c.position=[local[c.type]+offset[0],0,offset[2]];if(c.type==='switch')c.params={...c.params,closed:true,on:true};doc.components.push(c);}
    doc.components.push({id:prefix+'junction',type:'junction',label:'Cell '+(i+1)+' · inline live junction',position:[2.2+offset[0],0,offset[2]],rotation:0,params:{}});
    for(const original of oneWay.wires){const w=structuredClone(original);w.id=prefix+w.id;w.from.component=prefix+w.from.component;w.to.component=prefix+w.to.component;w.bends=[];if(original.id===outgoing.id){w.to={component:prefix+'junction',terminal:'1'};doc.wires.push(w,{...structuredClone(w),id:prefix+'junction-out',from:{component:prefix+'junction',terminal:'2'},to:{component:prefix+originalLamp.id,terminal:outgoing.to.terminal}});}else doc.wires.push(w);}
  }
  return doc;
}
/** NativeImage bitmap uses BGRA bytes. Keep receiver pixels and their exact
 * screen coordinates, so independent readers can inspect the captured crop. */
function sampleNativePixels(image,point,client,radius=3){
  const size=image.getSize(),width=radius*2+1,height=width,x=Math.round(point.x*size.width/client.width),y=Math.round(point.y*size.height/client.height);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x-radius<0||y-radius<0||x+radius>=size.width||y+radius>=size.height)return null;
  const crop=image.crop({x:x-radius,y:y-radius,width,height}),pixels=crop.toBitmap();let rgb=0,luma=0;
  for(let i=0;i<pixels.length;i+=4){rgb+=pixels[i]+pixels[i+1]+pixels[i+2];luma+=.2126*pixels[i+2]+.7152*pixels[i+1]+.0722*pixels[i];}
  return {screen:{...point},crop:{x:x-radius,y:y-radius,width,height},pixels:pixels.length/4,meanRgb:rgb/(pixels.length/4*3),meanLuma:luma/(pixels.length/4)};
}
/** Serialized into the app's renderer. Snapshot/restore every record key rather
 * than a named subset, including preferences introduced by later versions. */
async function profileRecords(operation,records){
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('irish-electrical-lab',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const transaction=database.transaction('records',operation==='restore'?'readwrite':'readonly'),store=transaction.objectStore('records');let keys,values;transaction.oncomplete=()=>resolve(operation==='restore'?true:keys.result.map((key,index)=>[key,values.result[index]]));transaction.onabort=()=>reject(transaction.error??new Error('Profile transaction aborted'));transaction.onerror=()=>reject(transaction.error??new Error('Profile transaction failed'));try{if(operation==='restore'){store.clear();for(const [key,value]of records)store.put(value,key);}else{keys=store.getAllKeys();values=store.getAll();}}catch(error){transaction.abort();reject(error);}});}finally{database.close();}
}
/** Stop the app document before any restore, eliminating React autosave races.
 * A following diagnostic can return to the app after exact verification. */
async function restoreProfileWithoutReact({window,directory,originalUrl,records,returnToApp=false}){
  const firstStylesheet=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory()){const nested=firstStylesheet(file);if(nested)return nested;}else if(entry.name.endsWith('.css'))return file;}};
  const stylesheet=firstStylesheet(directory);if(!stylesheet)throw new Error('Bundled stylesheet required to unload React before profile restoration');
  const stylesheetUrl=new URL('/'+path.relative(directory,stylesheet).replace(/\\/g,'/'),originalUrl).href;
  await window.webContents.loadURL(stylesheetUrl);
  await window.webContents.executeJavaScript('('+profileRecords.toString()+')("restore",'+JSON.stringify(records)+')');
  const actual=await window.webContents.executeJavaScript('('+profileRecords.toString()+')("snapshot")'),actualDigest=recordsDigest(actual);
  if(actualDigest!==recordsDigest(records))throw new Error('Every original IndexedDB record did not restore exactly');
  if(returnToApp)await window.webContents.loadURL(originalUrl);
  return {records:actual,digest:actualDigest};
}
/** Installs only read-only telemetry in the actual Electron renderer. */
function graphicsRendererHarness(){
  const base=window.__labVerify,frames=[],requests=[],responses=[],fallbacks=[],listeners=new Map(),originalPost=Worker.prototype.postMessage;let sequence=0;
  const electricalKey=document=>JSON.stringify({id:document.id,lessonId:document.lessonId,supply:document.supply,components:document.components.map(c=>({id:c.id,type:c.type,params:c.params})),wires:document.wires.map(w=>({id:w.id,from:w.from,to:w.to,role:w.role,resistance:w.resistance})),faults:document.faults});
  const camera=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{window.removeEventListener('electrical-lab-camera',receive);reject(new Error('Camera telemetry unavailable'));},1500);const receive=event=>{clearTimeout(timer);resolve(event.detail);};window.addEventListener('electrical-lab-camera',receive,{once:true});window.dispatchEvent(new Event('electrical-lab-camera-request'));});
  const idleCamera=async()=>{for(let i=0;i<120;i++){const value=await camera();if(!value.moving&&!value.heldKeys.length)return value;await base.sleep(80);}throw new Error('Camera did not stop requesting demand frames');};
  const receivers=points=>new Promise((resolve,reject)=>{const handler=event=>{clearTimeout(timer);resolve(event.detail);},timer=setTimeout(()=>{window.removeEventListener('electrical-lab-receiver',handler);reject(new Error('Live bench receiver projection unavailable'));},2500);window.addEventListener('electrical-lab-receiver',handler,{once:true});window.dispatchEvent(new CustomEvent('electrical-lab-receiver-request',{detail:{points}}));});
  const graphics=()=>new Promise((resolve,reject)=>{const evidence={},receiveLighting=event=>{evidence.lighting=event.detail;finish();},receiveEffects=event=>{evidence.effects=event.detail;finish();},cleanup=()=>{clearTimeout(timer);window.removeEventListener('electrical-lab-lighting',receiveLighting);window.removeEventListener('electrical-lab-effects',receiveEffects);},finish=()=>{if(evidence.lighting&&evidence.effects){cleanup();resolve(evidence);}},timer=setTimeout(()=>{cleanup();reject(new Error('Lighting/effects telemetry unavailable'));},2000);window.addEventListener('electrical-lab-lighting',receiveLighting);window.addEventListener('electrical-lab-effects',receiveEffects);window.dispatchEvent(new Event('electrical-lab-graphics-request'));});
  const fallback=event=>fallbacks.push({time:performance.now(),...event.detail});window.addEventListener('electrical-lab-graphics-fallback',fallback);
  Worker.prototype.postMessage=function(payload,...args){
    if(payload?.document){let id=listeners.get(this)?.id;if(!id){id=++sequence;const listener=event=>{const message=event.data;if(!message||typeof message!=='object')return;const circuitId=message.circuitId??message.result?.circuitId??message.assessment?.circuitId,revision=message.revision??message.result?.revision??message.assessment?.revision,kind=message.kind??'route';const request=requests.slice().reverse().find(item=>item.worker===id&&(kind==='route'?item.key===message.key:item.circuitId===circuitId&&(revision===undefined||item.revision===revision)&&item.electricalGeneration===message.electricalGeneration));responses.push({worker:id,time:performance.now(),kind,circuitId,revision,requestCircuitId:request?.circuitId,requestRevision:request?.revision,electricalGeneration:message.electricalGeneration,key:message.key,elapsedMs:message.result?.elapsedMs,roundTripMs:request?performance.now()-request.time:null,routes:message.routing?.routes?.size,routeIssues:message.routing?.issues?.length,error:message.kind==='error'?message.message:message.error,converged:message.result?.converged,result:message.kind==='result'?message.result:undefined,assessment:message.kind==='assessment'?message.assessment:undefined});if(responses.length>250)responses.shift();};listeners.set(this,{id,listener});this.addEventListener('message',listener);}
      requests.push({worker:id,time:performance.now(),kind:payload.kind??(typeof payload.dt==='number'?'solve':'route'),circuitId:payload.document.id,revision:payload.document.revision,electricalGeneration:payload.electricalGeneration,requestId:payload.requestId,key:payload.key,electricalKey:electricalKey(payload.document)});
    }return originalPost.call(this,payload,...args);
  };
  window.__electricalGraphicsDiagnostics={frames};
  window.__graphicsVerify={frames,requests,responses,fallbacks,camera,idleCamera,graphics,receivers,
    current:async()=>{for(let i=0;i<150;i++){const draft=await base.record('draft'),request=draft&&requests.slice().reverse().find(item=>['solve','test'].includes(item.kind)&&item.circuitId===draft.id&&item.electricalKey===electricalKey(draft)),response=request&&responses.slice().reverse().find(item=>item.kind==='result'&&item.circuitId===draft.id&&item.result?.revision===request.revision&&item.worker===request.worker&&item.electricalGeneration===request.electricalGeneration);if(response?.result?.converged)return {draft,result:response.result};await base.sleep(50);}throw new Error('No matching current simulation result');},
    waitDraft:async id=>{for(let i=0;i<150;i++){const value=await base.record('draft');if(value?.id===id)return value;await base.sleep(50);}throw new Error('Imported draft did not persist');},
    stop(){Worker.prototype.postMessage=originalPost;for(const [worker,{listener}]of listeners)worker.removeEventListener('message',listener);window.removeEventListener('electrical-lab-graphics-fallback',fallback);delete window.__electricalGraphicsDiagnostics;},
  };
}
module.exports={canonical,recordsDigest,vectorDistance,rotateVector,quaternionAngle,projection,frameSummary,makeGraphicsBenchmark,sampleNativePixels,profileRecords,restoreProfileWithoutReact,graphicsRendererHarness};
