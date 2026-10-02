import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const project = fileURLToPath(new URL('../', import.meta.url));
const assetDirectory = path.join(project, 'dist', 'client', '_next', 'static');
const asset = existsSync(assetDirectory) && readdirSync(assetDirectory).find(name => /^simulation\.worker-[\w-]+\.js$/.test(name));
assert.ok(asset, 'Build the production app before running its simulation-worker protocol audit');

// Load authored fixtures through the project's existing TS runtime. No browser,
// development server or HTTP request participates in this verification.
const lessonUrl = new URL('../lib/lessons.ts', import.meta.url).href;
const fixtureProcess = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import {LESSONS} from ${JSON.stringify(lessonUrl)};const lesson=LESSONS.find(item=>item.id===7);console.log(JSON.stringify({expected:lesson.circuit,challenge:lesson.challenge,dimmer:LESSONS.find(l=>l.id===12).circuit,timed:LESSONS.filter(l=>[14,29,36,48,57].includes(l.id)).map(l=>l.circuit)}));`], { cwd: project, encoding: 'utf8', timeout: 10000 });
assert.equal(fixtureProcess.status, 0, fixtureProcess.error?.message || fixtureProcess.stderr);
const fixture = JSON.parse(fixtureProcess.stdout);
function capture(document, result, requests) {
  const learningUrl = new URL('../lib/learning.ts', import.meta.url).href;
  const child = spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {readFileSync} from 'node:fs';import {captureMeasurement} from ${JSON.stringify(learningUrl)};const {document,result,requests}=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(requests.map(r=>captureMeasurement(document,result,r))));`],{cwd:project,input:JSON.stringify({document,result,requests}),encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.error?.message||child.stderr);return JSON.parse(child.stdout);
}

// Import the actual emitted ES module in a real Node worker thread. The adapter
// supplies only the browser worker messaging surface used by this app.
const boot = `
const {parentPort,workerData}=require('node:worker_threads');
const {pathToFileURL}=require('node:url');
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
(async()=>{
  try {
    await import(pathToFileURL(workerData.asset).href);
    if(typeof self.onmessage!=='function')throw new Error('Emitted worker did not register its message handler');
    parentPort.on('message',data=>self.onmessage({data}));
    parentPort.postMessage({kind:'audit-ready'});
  }catch(error){parentPort.postMessage({kind:'audit-boot-error',message:error instanceof Error?error.message:String(error)});}
})();`;
const worker = new Worker(boot, { eval: true, workerData: { asset: path.join(assetDirectory, asset) } });

function waitFor(kind, send) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => finish(new Error(`Emitted worker did not return ${kind} within 10 seconds`)), 10000);
    const finish = (error, message) => {
      clearTimeout(timer); worker.off('message', receive); worker.off('error', failure); worker.off('exit', exited);
      if (error) reject(error); else resolve({ message, messages });
    };
    const receive = message => {
      messages.push(message);
      if (message.kind === 'error' || message.kind === 'audit-boot-error') finish(new Error(message.message));
      else if (message.kind === kind) finish(undefined, message);
    };
    const failure = error => finish(error);
    const exited = code => finish(new Error(`Emitted worker exited before ${kind} (code ${code})`));
    worker.on('message', receive); worker.on('error', failure); worker.on('exit', exited);
    if (send) worker.postMessage(send);
  });
}

let nextRequest = 100, nextRevision = 40;
const cases = [];
function circuit(name, closed) {
  const document = structuredClone(fixture.expected);
  document.id = `production-audit-${name}`; document.revision = ++nextRevision;
  document.components.find(component => component.id === 'switch').params.closed = closed;
  return document;
}
async function testCircuit(name, document) {
  const requestId = ++nextRequest;
  const { message, messages } = await waitFor('assessment', { kind: 'test', requestId, document, expected: fixture.expected, dt: .1, reset: true, electricalGeneration:requestId });
  assert.equal(message.requestId, requestId, `${name}: request correlation`);
  assert.equal(message.assessment.revision, document.revision, `${name}: assessment revision`);
  assert.equal(message.assessment.circuitId, document.id, `${name}: assessment circuit ID`);
  const result = messages.find(item => item.kind === 'result')?.result;
  assert.ok(result, `${name}: test must also return a simulation result`);
  assert.equal(result.revision, document.revision, `${name}: result revision`);
  assert.equal(result.converged, true, `${name}: valid physical network`);
  assert.equal(typeof messages.find(item=>item.kind==='result').needsTick,'boolean',`${name}: explicit worker scheduling`);
  assert.equal(messages.find(item=>item.kind==='result').electricalGeneration,requestId,`${name}: electrical generation correlation`);
  cases.push({ name, requestId, revision: document.revision, passed: message.assessment.passed, failedChecks: message.assessment.checks.filter(check => check.status === 'fail').map(check => check.id), diagnostics: result.diagnostics.map(diagnostic => diagnostic.id), tripped: Object.entries(result.deviceStates).filter(([, state]) => state.tripped).map(([id]) => id) });
  return { assessment: message.assessment, result };
}

const report = { timestamp: new Date().toISOString(), status: 'FAIL', emittedWorker: asset, method: 'Actual production ES module executed in Node worker_threads with self/postMessage adapter, using source-authored lesson 7, 12 and timed-process fixtures. No browser or HTTP requests.', cases, findings: [] };
try {
  await waitFor('audit-ready');
  for (const closed of [true, false]) {
    const name = `intact-switch-${closed ? 'on' : 'off'}`;
    const { assessment } = await testCircuit(name, circuit(name, closed));
    assert.equal(assessment.passed, true, `${name}: intact one-way circuit must pass its ON/OFF objectives`);
  }

  const neutralEarth = closed => {
    const document = circuit(`neutral-earth-${closed ? 'on' : 'off'}`, closed);
    document.wires.push({ id: 'extra-neutral-earth', from: { component: 'supply', terminal: 'PE' }, to: { component: 'protect', terminal: 'NOUT' }, role: 'PE', resistance: .01, bends: [] });
    return document;
  };
  for (const closed of [false, true]) {
    const { assessment, result } = await testCircuit(`extra-PE-to-NOUT-switch-${closed ? 'on' : 'off'}`, neutralEarth(closed));
    assert.equal(assessment.passed, false, 'An extra neutral-earth connection cannot pass');
    assert.ok(assessment.checks.some(check => check.id === 'extra:extra-neutral-earth' && check.status === 'fail'), 'Report the exact extra conductor');
    assert.ok(result.diagnostics.some(diagnostic => diagnostic.id.startsWith('neutralEarth:')), 'Neutral-earth wiring finding persists independent of switch position');
    assert.ok(assessment.checks.some(check => check.id.startsWith('finding:neutralEarth:') && check.status === 'fail'), 'Neutral-earth defect participates in assessment');
    if (closed) assert.equal(result.deviceStates.protect.tripped, true, 'Operating load produces the real residual-current trip');
    else assert.equal(result.deviceStates.protect.tripped, false, 'An idle neutral-earth link does not invent load current or a trip');
  }

  const bypass = circuit('bypassed-switch-off', false);
  bypass.wires.push({ id: 'extra-bypass', from: { component: 'protect', terminal: 'LOUT' }, to: { component: 'light', terminal: 'L' }, role: 'L', resistance: .01, bends: [] });
  const bypassResponse = await testCircuit('bypassed-switch-off', bypass);
  assert.ok(bypassResponse.result.componentPower.light > .05, 'Physics must preserve the lamp supplied through the actual bypass');
  assert.equal(bypassResponse.assessment.passed, false, 'An illuminated bypassed lamp must fail the lesson');
  assert.ok(bypassResponse.assessment.checks.some(check => check.id === 'switch-off' && check.status === 'fail'), 'Fail the real switch-OFF objective');

  const broken = circuit('open-live-diagnosis', true);
  broken.faults = [{ type: fixture.challenge.fault, wire: fixture.challenge.wire, component: fixture.challenge.component, enabled: true }];
  const requestId = ++nextRequest;
  const {message:initialBroken}=await waitFor('result',{document:broken,dt:.1,reset:true});
  const targetWire=broken.wires.find(w=>w.id===fixture.challenge.wire);
  const evidence=capture(broken,initialBroken.result,[{mode:'voltage',a:targetWire.from,b:targetWire.to},{mode:'current',wire:targetWire.id}]);
  const diagnose=values=>waitFor('diagnosis',{kind:'diagnose',requestId:++nextRequest,document:broken,diagnosis:'open-live',observations:999,challenge:fixture.challenge,evidence:values,dt:0});
  const noEvidence=await diagnose([]);assert.equal(noEvidence.message.accepted,false,'Probe-click count cannot replace actual evidence');
  const staleEvidence=await diagnose(evidence.map(e=>({...e,revision:e.revision-1})));assert.equal(staleEvidence.message.accepted,false,'Stale measurement records cannot establish a diagnosis');
  const wrongEvidence=capture(broken,initialBroken.result,[{mode:'voltage',a:{component:'supply',terminal:'L'},b:{component:'supply',terminal:'N'}},{mode:'voltage',a:{component:'supply',terminal:'L'},b:{component:'supply',terminal:'PE'}}]);
  const unrelated=await diagnose(wrongEvidence);assert.equal(unrelated.message.accepted,false,'Unrelated measuring points cannot localize the target');
  cases.push({name:'diagnosis-evidence-gates',emptyAccepted:noEvidence.message.accepted,staleAccepted:staleEvidence.message.accepted,unrelatedAccepted:unrelated.message.accepted});
  const { message, messages } = await waitFor('diagnosis', { kind: 'diagnose', requestId, document: broken, diagnosis: 'open-live', evidence, challenge: fixture.challenge, dt: 0 });
  assert.equal(message.requestId, requestId, 'Diagnosis request correlation');
  assert.equal(message.revision, broken.revision, 'Diagnosis current revision');
  assert.equal(message.circuitId, broken.id, 'Diagnosis current circuit');
  assert.equal(message.accepted, true, message.explanation);
  assert.ok(messages.some(item => item.kind === 'result' && item.result.revision === broken.revision), 'Diagnosis includes current simulation result');
  cases.push({ name: 'open-live-diagnosis', requestId, revision: broken.revision, accepted: message.accepted, explanation: message.explanation });
  const measured=await waitFor('measurement',{kind:'measure',requestId:++nextRequest,electricalGeneration:123456,document:broken,mode:'voltage',a:targetWire.from,b:targetWire.to});
  assert.equal(measured.message.circuitId,broken.id);assert.equal(measured.message.revision,broken.revision);assert.deepEqual(measured.message.a,targetWire.from);assert.deepEqual(measured.message.b,targetWire.to);assert.equal(measured.message.mode,'voltage');assert.equal(measured.message.evidence.value,measured.message.value);assert.equal(measured.message.evidence.unit,'V');
  assert.equal(measured.message.electricalGeneration,123456,'Measurement electrical-generation correlation');
  cases.push({name:'measurement-evidence-envelope',revision:measured.message.revision,value:measured.message.value});
  const isolated=circuit('isolated-protective-open',false);isolated.supply.enabled=false;const pe=isolated.wires.find(w=>w.to.component==='light'&&w.role==='PE');isolated.faults=[{type:'missing-earth',wire:pe.id,enabled:true}];
  const open=await waitFor('measurement',{kind:'measure',requestId:++nextRequest,document:isolated,mode:'resistance',a:pe.from,b:pe.to,reset:true});
  assert.equal(open.message.value,null);assert.equal(open.message.evidence.status,'open','Real isolated open path is OL evidence, not unresolved numeric data');
  isolated.supply.enabled=true;isolated.revision++;const poweredResistance=await waitFor('measurement',{kind:'measure',requestId:++nextRequest,document:isolated,mode:'resistance',a:pe.from,b:pe.to});assert.equal(poweredResistance.message.value,null);assert.equal(poweredResistance.message.evidence.status,'unresolved','Powered ohmmeter reading is withheld');
  cases.push({name:'isolated-OL-and-powered-resistance',openStatus:open.message.evidence.status,poweredStatus:poweredResistance.message.evidence.status});
  const dimmed=structuredClone(fixture.dimmer);dimmed.id='production-dimmer-levels';let lastPower=-1;
  for(const level of [0,.25,.65,.9,1]){
    dimmed.components.find(c=>c.type==='dimmer').params.level=level;dimmed.revision=++nextRevision;
    const response=(await waitFor('result',{document:dimmed,dt:0,reset:true})).message;
    assert.equal(response.result.converged,true);assert.equal(response.needsTick,false,'Static dimmer does not continuously poll');
    const power=response.result.componentPower.light??0,output=Number(response.result.deviceStates.light.lightOutputPower),state=response.result.deviceStates.dimmer;
    assert.ok(power>lastPower);assert.equal(output,power);lastPower=power;
    if(level===0){assert.equal(state.dimmerResistance,'open');assert.equal(power,0);}
    else{const expectedR=960*(1/level-1)+.001;assert.ok(Math.abs(Number(state.dimmerResistance)-expectedR)<.00001);assert.ok(Math.abs(power-60*level*level)/(60*level*level)<.005);}
    cases.push({name:`dimmer-level-${level}`,level,ohms:state.dimmerResistance,lampPower:power,lightOutputPower:output});
    const passive=structuredClone(dimmed);passive.supply.enabled=false;passive.wires=[];passive.revision=++nextRevision;
    const measured=(await waitFor('measurement',{kind:'measure',requestId:++nextRequest,document:passive,mode:'resistance',a:{component:'dimmer',terminal:'COM'},b:{component:'dimmer',terminal:'OUT'},reset:true})).message;
    if(level===0){assert.equal(measured.value,null);assert.equal(measured.evidence.status,'open');}
    else assert.ok(Math.abs(measured.value-(960*(1/level-1)+.001))<.00001);
    cases.push({name:`dimmer-passive-resistance-${level}`,level,ohms:measured.value,status:measured.evidence.status});
  }
  dimmed.components.find(c=>c.type==='dimmer').params.level=0;dimmed.revision=++nextRevision;
  dimmed.wires.push({id:'dimmer-bypass',from:{component:'dimmer',terminal:'COM'},to:{component:'dimmer',terminal:'OUT'},role:'L',resistance:.01,bends:[]});
  const dimmerBypass=(await waitFor('result',{document:dimmed,dt:0,reset:true})).message.result;
  assert.equal(dimmerBypass.converged,true);assert.ok(Number(dimmerBypass.deviceStates.light.lightOutputPower)>59.9);
  cases.push({name:'dimmer-bypass-output',lightOutputPower:dimmerBypass.deviceStates.light.lightOutputPower});
  for(const id of [14,29,36,57]){
    const doc=structuredClone(fixture.timed.find(d=>d.lessonId===id));doc.id=`time-process-${id}`;doc.revision=++nextRevision;
    let temporal=(await waitFor('result',{document:doc,dt:.1,reset:true})).message;
    if(id===29)assert.equal(temporal.needsTick,true,'Valve travel requires time');
    // Settle the intact example before removing an off-delay demand.
    for(let i=0;i<24;i++)temporal=(await waitFor('result',{document:doc,dt:.25})).message;
    if(id===14)doc.components.find(c=>c.id==='pir').params.active=false;
    if(id===36)doc.components.find(c=>c.id==='light-switch').params.closed=false;
    if(id===57)doc.components.find(c=>c.id==='start').params.pressed=true;
    if(id===29)doc.components.find(c=>c.id==='room').params.closed=false;
    doc.revision++;temporal=(await waitFor('result',{document:doc,dt:.1})).message;
    assert.equal(temporal.needsTick,true,`Lesson ${id}: active delay/travel requires ticks`);
    if(id===57){doc.components.find(c=>c.id==='start').params.pressed=false;doc.revision++;}
    for(let i=0;i<24;i++)temporal=(await waitFor('result',{document:doc,dt:.25})).message;
    assert.equal(temporal.needsTick,false,`Lesson ${id}: settled experiment stops continuous polling`);
    cases.push({name:`settled-time-process-${id}`,needsTick:temporal.needsTick,converged:temporal.result.converged});
  }
  const backup=structuredClone(fixture.timed.find(d=>d.lessonId===48));backup.id='backup-energy-time';backup.revision=++nextRevision;
  let energy=(await waitFor('result',{document:backup,dt:.1,reset:true})).message;assert.equal(energy.needsTick,false,'Grid-supplied backup is static');
  backup.supply.enabled=false;backup.revision++;energy=(await waitFor('result',{document:backup,dt:.25})).message;assert.equal(energy.needsTick,true,'Supplying backup advances declared energy state');const priorCharge=energy.result.deviceStates.inverter.level;
  energy=(await waitFor('result',{document:backup,dt:.25})).message;assert.ok(energy.result.deviceStates.inverter.level<priorCharge,'Actual emitted worker reduces backup charge while power flows');
  backup.components.find(c=>c.type==='battery').params.on=false;backup.revision++;energy=(await waitFor('result',{document:backup,dt:.25})).message;assert.equal(energy.needsTick,false,'Unavailable backup stops energy polling');
  cases.push({name:'backup-energy-scheduling',priorCharge,afterCharge:energy.result.deviceStates.inverter.level,disabledNeedsTick:energy.needsTick});
  report.status = 'PASS';
} catch (error) {
  report.findings.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await worker.terminate();
  const verification = fileURLToPath(new URL('../../verification/', import.meta.url));
  mkdirSync(verification, { recursive: true });
  writeFileSync(path.join(verification, 'simulation-worker-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
