/* eslint-disable @typescript-eslint/no-require-imports -- GPU evidence is captured inside the installed application. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { recordsDigest,profileRecords } = require('./graphics-diagnostics-helpers.cjs');
const { windowSnapshot,restoreWindow } = require('./gallery-diagnostics-helpers.cjs');
const ORIGIN = 'http://127.0.0.1:4187';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runGalleryDiagnostics({ window, output, fixtures, directory:appDirectory,version,packaged }) {
  const directory = path.join(output, 'gpu-gallery');
  fs.mkdirSync(directory, { recursive: true });
  const originalWindow=windowSnapshot(window);
  const checks = [], images = [], individualModels = [], configurations = [];
  const js = source => window.webContents.executeJavaScript(source);
  const add = (name, passed, detail) => { checks.push({ name, passed, detail }); if (!passed) throw new Error(name + ': ' + JSON.stringify(detail)); };
  const report = { version,packaged,startedAt:new Date().toISOString(),checks, images, individualModels, configurations, passed: false,measurementMethod:'App-owned Electron GPU captures. Every individual variant is selected at full geometry detail; all eight inspection/camera combinations are captured after canvas layout and compositor settling.' };
  let originalRecords;
  const snapshot=()=>js('('+profileRecords.toString()+')("snapshot")');
  const writeReport=()=>fs.writeFileSync(path.join(output,'desktop-gallery-report.json'),JSON.stringify(report,null,2));
  const allFiles=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?allFiles(path.join(folder,entry.name)):[path.join(folder,entry.name)]);
  const stylesheet=allFiles(appDirectory).find(file=>file.endsWith('.css'));
  if(!stylesheet)throw new Error('Bundled stylesheet required for script-free profile restoration');
  const quiescentUrl=ORIGIN+'/'+path.relative(appDirectory,stylesheet).replace(/\\/g,'/');
  async function settled(){await js('(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()');await delay(650);}
  async function capture(name, rectangle) {
    const file = path.join(directory, name + '.png');
    const image = await window.webContents.capturePage(rectangle);
    fs.writeFileSync(file, image.toPNG());
    return path.relative(output, file).replace(/\\/g, '/');
  }
  try {
    await delay(850);originalRecords=await snapshot();report.originalKeys=originalRecords.map(([key])=>key);report.originalDigest=recordsDigest(originalRecords);
    fs.writeFileSync(path.join(directory,'original-records.json'),JSON.stringify({version,digest:report.originalDigest,records:originalRecords},null,2));
    window.setFullScreen(false);if(window.isMinimized())window.restore();window.unmaximize();
    for(let i=0;i<100&&(window.isFullScreen()||window.isMaximized());i++)await delay(50);
    window.setSize(1920,1400);await delay(350);
    await window.loadURL(ORIGIN + '/model-gallery');
    await js(`(async()=>{for(let tries=0;tries<100&&!document.querySelector('.mg-batch canvas');tries++)await new Promise(resolve=>setTimeout(resolve,100));})()`);
    const inventory = await js(`({count:Number(document.querySelector('.mg-count')?.textContent.match(/\\/\\s*(\\d+)/)?.[1]),batches:document.querySelectorAll('.mg-batch').length,names:Array.from(document.querySelectorAll('.mg-caption-grid b')).map(e=>e.textContent.trim())})`);
    add('all authored equipment variants are available in the packaged gallery', inventory.count >= 87 && inventory.names.length === inventory.count, inventory);
    for (const view of ['normal', 'open', 'exploded', 'cutaway']) {
      for (const side of ['front', 'rear']) {
        await js(`(()=>{for(const [label,value]of [['Gallery inspection view',${JSON.stringify(view)}],['Gallery camera side',${JSON.stringify(side)}]]){const e=document.querySelector('[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
        for (let index = 0; index < inventory.batches; index++) {
          await js(`(()=>{const batch=document.querySelectorAll('.mg-batch')[${index}],shell=document.querySelector('.mg-shell');shell.scrollTop=batch.offsetTop-document.querySelector('.mg-controls').offsetHeight-14;})()`);
          await settled();
          const state = await js(`(()=>{const batch=document.querySelectorAll('.mg-batch')[${index}],rect=batch.getBoundingClientRect(),canvas=batch.querySelector('canvas');return {canvas:!!canvas,width:canvas?.width,height:canvas?.height,items:batch.querySelectorAll('.mg-caption-grid b').length,rect:{x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:Math.min(innerWidth,Math.round(rect.width)),height:Math.min(innerHeight-Math.max(0,Math.round(rect.y)),Math.round(rect.height))}};})()`);
          add(`GPU batch ${index + 1} ${view} ${side} renders`, state.canvas && state.width > 0 && state.height > 0 && state.items > 0, state);
          images.push({ batch: index + 1, view, side, items: state.items, file: await capture(`equipment-${String(index + 1).padStart(2, '0')}-${view}-${side}`, state.rect) });
        }
      }
    }
    await js(`window.__galleryAsset=()=>new Promise(resolve=>{const handler=e=>{clearTimeout(timer);resolve(e.detail);};const timer=setTimeout(()=>{window.removeEventListener('electrical-lab-gallery',handler);resolve(null);},1000);window.addEventListener('electrical-lab-gallery',handler,{once:true});window.dispatchEvent(new Event('electrical-lab-gallery-request'));});true;`);
    for(let index=0;index<inventory.count;index++){
      const chosen=await js(`(async()=>{const text=e=>e.textContent.trim();Array.from(document.querySelectorAll('.mg-controls button')).find(e=>text(e)==='Show full inventory').click();await new Promise(resolve=>setTimeout(resolve,60));const caption=document.querySelectorAll('.mg-caption-grid button')[${index}];caption.click();const key=caption.dataset.galleryKey;await new Promise(resolve=>setTimeout(resolve,60));Array.from(document.querySelectorAll('.mg-controls button')).find(e=>text(e)==='Focus selected equipment').click();await new Promise(resolve=>setTimeout(resolve,60));document.querySelector('.mg-shell').scrollTop=0;return {key,name:document.querySelector('.mg-caption-grid b').textContent.trim()};})()`);
      const actual=await js(`(async()=>{for(let tries=0;tries<100;tries++){const state=await window.__galleryAsset();if(state?.models?.some(model=>model.key===${JSON.stringify(chosen.key)})&&state.models.every(model=>model.lod==='full'&&model.meshes>0))return state;await new Promise(resolve=>setTimeout(resolve,100));}return null;})()`);
      add('individual variant '+String(index+1)+' renders full-detail Blender geometry',!!actual,chosen);
      for(const view of ['normal','open','exploded','cutaway'])for(const side of ['front','rear']){
        await js(`(()=>{for(const [label,value]of [['Gallery inspection view',${JSON.stringify(view)}],['Gallery camera side',${JSON.stringify(side)}]]){const e=document.querySelector('[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
        await settled();
        const rectangle=await js(`(()=>{const r=document.querySelector('.mg-batch').getBoundingClientRect();return {x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),width:Math.min(innerWidth-Math.max(0,Math.round(r.x)),Math.round(r.width)),height:Math.min(innerHeight-Math.max(0,Math.round(r.y)),Math.round(r.height))};})()`);
        individualModels.push({index:index+1,key:chosen.key,name:chosen.name,view,side,lod:'full',geometry:actual,file:await capture(`variant-${String(index+1).padStart(2,'0')}-${view}-${side}`,rectangle)});
      }
      report.completedVariants=index+1;writeReport();
    }
    await window.loadURL(ORIGIN + '/');
    await js(`(async()=>{for(let tries=0;tries<100&&!Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Learn');tries++)await new Promise(resolve=>setTimeout(resolve,100));Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Learn').click();for(let tries=0;tries<100&&!Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Courses');tries++)await new Promise(resolve=>setTimeout(resolve,100));})()`);
    await js(`window.__galleryScene=()=>new Promise(resolve=>{const handler=e=>{clearTimeout(timer);resolve(e.detail);};const timer=setTimeout(()=>{window.removeEventListener('electrical-lab-scene',handler);resolve(null);},1000);window.addEventListener('electrical-lab-scene',handler,{once:true});window.dispatchEvent(new Event('electrical-lab-scene-request'));});true;`);
    for (const fixture of fixtures) {
      const selected = await js(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),text=e=>e.textContent.trim();Array.from(document.querySelectorAll('button')).find(e=>text(e)==='Courses').click();await wait(100);const input=document.querySelector('[aria-label="Search configurations"]');if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(fixture.title)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);}const card=Array.from(document.querySelectorAll('[role=dialog] button')).find(e=>text(e).includes(${JSON.stringify(fixture.title)}));if(!card)return false;card.click();await wait(120);const discard=Array.from(document.querySelectorAll('[role=dialog] button')).find(e=>text(e)==='Discard and continue');if(discard)discard.click();return true;})()`);
      add('configuration ' + fixture.id + ' can be opened in the packaged app', selected, fixture.title);
      await settled();
      const geometry = await js(`(async()=>{let scene;for(let tries=0;tries<100;tries++){scene=await window.__galleryScene();if(scene?.circuitId===${JSON.stringify(fixture.circuit.id)}&&!scene.routingPending&&scene.components.length===${fixture.circuit.components.length}&&scene.components.every(c=>c.assetKeys.length))return scene;await new Promise(resolve=>setTimeout(resolve,100));}return scene;})()`);
      add('configuration ' + fixture.id + ' uses the complete loaded Blender inventory', geometry?.circuitId===fixture.circuit.id&&geometry?.components?.length === fixture.circuit.components.length && geometry.components.every(component => component.assetKeys.length > 0), geometry?.components?.map(component => ({ id: component.id, assets: component.assetKeys })));
      await js(`(async()=>{for(let tries=0;tries<100;tries++){const dialogs=document.querySelectorAll('[role=dialog],[role=alertdialog],[data-slot=dialog-overlay]');if(!dialogs.length&&getComputedStyle(document.body).pointerEvents!=='none')break;await new Promise(resolve=>setTimeout(resolve,50));}Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')==='Fit workbench'||e.textContent.trim()==='Fit workbench')?.click();})()`);await settled();
      const state = await js(`(()=>{const scene=document.querySelector('.canvas-container')||document.querySelector('canvas')?.parentElement?.parentElement,canvas=scene?.querySelector('canvas'),rect=scene?.getBoundingClientRect();return {canvas:!!canvas,width:canvas?.width,height:canvas?.height,routingPending:!!document.querySelector('.routing-status'),routingIssue:!!document.querySelector('.routing-notice'),rect:rect?{x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:Math.min(innerWidth-Math.max(0,Math.round(rect.x)),Math.round(rect.width)),height:Math.min(innerHeight-Math.max(0,Math.round(rect.y)),Math.round(rect.height))}:undefined};})()`);
      if (state.routingPending) await delay(1000);
      const ready = await js(`({canvas:!!document.querySelector('canvas'),routingPending:!!document.querySelector('.routing-status'),routingIssue:!!document.querySelector('.routing-notice')})`);
      add('configuration ' + fixture.id + ' GPU and wire routes are ready', ready.canvas && !ready.routingPending && !ready.routingIssue, ready);
      configurations.push({ id: fixture.id, title: fixture.title, components: fixture.circuit.components.length, wires: fixture.circuit.wires.length, geometry, file: await capture(`configuration-${String(fixture.id).padStart(2, '0')}`, state.rect) });
      report.completedConfigurations=configurations.length;writeReport();
    }
    report.passed = true;
  } catch (error) { report.error = error.message;report.passed=false; report.errorImage = await capture('gallery-error').catch(()=>undefined); }
  finally {
    // Unload the React application first. Restoring IndexedDB beneath a live
    // application allowed its pending autosave/preferences effects to overwrite
    // restored data. The local CSS document has the same origin and no scripts.
    if(originalRecords){try{
      await window.loadURL(quiescentUrl);await js('('+profileRecords.toString()+')("restore",'+JSON.stringify(originalRecords)+')');
      const restored=await snapshot();report.restoredDigest=recordsDigest(restored);report.originalRecordsRestored=report.restoredDigest===report.originalDigest;
      checks.push({name:'every original IndexedDB key restored with React stopped',passed:report.originalRecordsRestored,detail:{originalKeys:report.originalKeys,restoredKeys:restored.map(([key])=>key),originalDigest:report.originalDigest,restoredDigest:report.restoredDigest}});
    }catch(error){report.originalRecordsRestored=false;checks.push({name:'every original IndexedDB key restored with React stopped',passed:false,detail:error.message});}}
    try{const restored=await restoreWindow(window,originalWindow);report.windowRestoration=restored;checks.push({name:'original native window bounds and states restored',passed:restored.passed,detail:restored});}catch(error){checks.push({name:'original native window bounds and states restored',passed:false,detail:error.message});}
  }
  report.finishedAt=new Date().toISOString();report.passed=report.passed&&checks.every(check=>check.passed)&&report.originalRecordsRestored===true;writeReport();
  return report;
}
module.exports = { runGalleryDiagnostics };
