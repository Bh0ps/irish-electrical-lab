/* eslint-disable @typescript-eslint/no-require-imports -- App-owned Electron regression diagnostics; no external browser automation. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { rendererHarness, canonical } = require('./native-ui-harness.cjs');
const { recordsDigest, profileRecords, restoreProfileWithoutReact } = require('./graphics-diagnostics-helpers.cjs');
const { windowSnapshot, restoreWindow } = require('./gallery-diagnostics-helpers.cjs');

/** Read-only inspection of the real renderer; all exercise wiring below is
 * delivered through native Electron mouse input to the existing 3D terminals. */
function guidedRendererHarness() {
  const v = window.__labVerify;
  const task = () => {
    const element = document.querySelector('[aria-label="Active lesson activity"]');
    return element ? {
      id: element.dataset.activityId, stage: element.dataset.stageId, kind: element.dataset.activityKind,
      instruction: v.text(element.querySelector('.task-instruction')),
      text: v.text(element), primary: element.querySelector('[data-learning-primary]')?.dataset.learningPrimary,
    } : null;
  };
  const state = async lessonId => {
    const [draft, progress] = await Promise.all([v.record('draft'), v.record('progress')]);
    const learning = progress?.learning?.[lessonId];
    return { task: task(), draft, activityIds: learning?.activityIds ?? [],
      successes: Object.values(learning?.competencies ?? {}).reduce((sum, item) => sum + item.successes, 0),
      attempts: Object.values(learning?.competencies ?? {}).reduce((sum, item) => sum + item.attempts, 0) };
  };
  const camera = () => new Promise((resolve, reject) => {
    const receive = event => { clearTimeout(timer); resolve(event.detail); };
    const timer = setTimeout(() => { window.removeEventListener('electrical-lab-camera', receive); reject(new Error('Native camera telemetry unavailable.')); }, 1500);
    window.addEventListener('electrical-lab-camera', receive, { once: true });
    window.dispatchEvent(new Event('electrical-lab-camera-request'));
  });
  const idleCamera = async () => {
    // Allow the button's React update and R3F invalidation to reach a frame
    // before accepting an idle sample from the preceding camera command.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let previous, stable = 0, latest;
    for (let tries = 0; tries < 150; tries++) {
      latest = await camera();
      const pose = JSON.stringify([latest.position, latest.quaternion, latest.target]);
      stable = !latest.moving && !latest.dragging && !(latest.heldKeys?.length) && pose === previous ? stable + 1 : 0;
      if (stable >= 2) return latest;
      previous = pose; await v.sleep(70);
    }
    throw new Error('Camera never reached a stable native terminal-picking pose: ' + JSON.stringify(latest));
  };
  const viewport = () => {
    const canvas = document.querySelector('canvas'), rect = canvas?.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      canvas: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, bufferWidth: canvas.width, bufferHeight: canvas.height } : null };
  };
  const settledViewport = async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let previous, stable = 0;
    for (let tries = 0; tries < 100; tries++) {
      const value = viewport(), key = JSON.stringify(value);
      stable = value.canvas?.width > 0 && key === previous ? stable + 1 : 0;
      if (stable >= 2) return value;
      previous = key; await v.sleep(70);
    }
    throw new Error('Native canvas resize never settled: ' + JSON.stringify(viewport()));
  };
  window.__guidedVerify = { task, state, camera, idleCamera, viewport, settledViewport };
}

const pairKey = wire => [wire.from, wire.to].map(endpoint => endpoint.component + ':' + endpoint.terminal).sort().join('|') + '/' + wire.role;
const graphKey = wires => wires.map(pairKey).sort();
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const awarded = state => ({ activityIds: [...state.activityIds].sort(), successes: state.successes });

async function runGuidedBuildDiagnostics({ app, window, directory, output, fixtures, dialog }) {
  const started = Date.now(), deadline = started + 300000;
  const checks = [], images = [], connections = [], nativeInputs = [], outputErrors = [];
  const originalWindow = windowSnapshot(window), originalUrl = window.webContents.getURL();
  const originalOpen = dialog.showOpenDialog, originalSave = dialog.showSaveDialog;
  const webDirectory = directory ?? (app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../../dist/client'));
  let originals, restoredDigest, restored = false, windowRestoration, restorationError;
  const js = source => window.webContents.executeJavaScript(source);
  const run = source => js(`(async()=>{const v=window.__labVerify,g=window.__guidedVerify;${source}})()`);
  const write = (file, value) => {
    try { fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2)); return true; }
    catch (error) { outputErrors.push({ file, error: error.message }); return false; }
  };
  const checkpoint = () => write('desktop-guided-build-progress.json', { version: app.getVersion(), running: true, elapsedMs: Date.now() - started, checks, images, connections, nativeInputs });
  const add = (name, passed, detail) => {
    checks.push({ name, passed: Boolean(passed), detail }); checkpoint();
    if (!passed) throw new Error(name + ': ' + JSON.stringify(detail));
    if (Date.now() > deadline) throw new Error('Native guided-build verification exceeded its five-minute budget.');
  };
  const install = async () => {
    await js(`(${rendererHarness.toString()})()`);
    await run(`await v.until(()=>v.control('My builds'),'app interface');await v.sleep(650);`);
    await js(`(${guidedRendererHarness.toString()})()`);
  };
  const settleModals = () => run(`await v.until(()=>!document.querySelector('[role=dialog],[role=alertdialog],[data-slot=dialog-overlay]')&&getComputedStyle(document.body).pointerEvents!=='none','fully closed modal surfaces');await v.sleep(80);`);
  const closeDialogs = () => run(`for(let i=0;i<5;i++){const close=v.control('Close','[role=dialog][data-state=open] button');if(!close)break;close.click();await v.sleep(250);}await v.until(()=>!document.querySelector('[role=dialog],[role=alertdialog],[data-slot=dialog-overlay]')&&getComputedStyle(document.body).pointerEvents!=='none','modal exit');await v.sleep(80);`);
  const replacement = async () => {
    await run(`await v.sleep(150);const prompt=Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog]')).find(element=>v.text(element).includes('Keep your current work?'));if(prompt)v.click('Discard and continue');`);
    await settleModals();
  };
  const state = lessonId => run(`return await g.state(${lessonId});`);
  const waitState = async (lessonId, predicate, label, timeout = 10000) => {
    const until = Date.now() + timeout; let latest;
    while (Date.now() < until) { latest = await state(lessonId); if (predicate(latest)) return latest; await run('await v.sleep(60);'); }
    throw new Error(label + ': ' + JSON.stringify({ task: latest?.task, wireCount: latest?.draft?.wires?.length, activityIds: latest?.activityIds, successes: latest?.successes }));
  };
  const capture = async name => {
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,60))))');
    const file = 'desktop-guided-build-' + name + '.png';
    fs.writeFileSync(path.join(output, file), (await window.webContents.capturePage()).toPNG());
    images.push({ name, file }); checkpoint();
  };
  const nativeClick = async point => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('A native 3D target has no valid screen projection.');
    // The window is already visible/focused BEFORE terminal projection. A
    // repeated showInactive here can change native bounds after projection.
    const x = Math.round(point.x), y = Math.round(point.y);
    const surface = await js(`(()=>{const e=document.elementFromPoint(${x},${y});return {tag:e?.tagName,canvas:e?.tagName==='CANVAS',class:e?.className};})()`);
    if (!surface.canvas) throw new Error('Native terminal target is covered by another UI surface: ' + JSON.stringify(surface));
    const input = { point: { x, y }, before: { bounds: window.getBounds(), viewport: await run('return g.viewport();') } };
    window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await run('await v.sleep(180);');
    input.after = { bounds: window.getBounds(), viewport: await run('return g.viewport();') }; nativeInputs.push(input);
  };
  const terminal = async endpoint => {
    await settleModals();
    if (!window.isVisible()) window.showInactive();
    if (!window.isFocused()) window.focus();
    await run('await g.settledViewport();await g.idleCamera();');
    const scene = await run('return await v.loadedScene();');
    const target = scene.components.find(component => component.id === endpoint.component)?.terminals.find(item => item.id === endpoint.terminal);
    add('native terminal ' + endpoint.component + '.' + endpoint.terminal + ' is present once', target?.inView && target.instances === 1, target);
    return target.screen;
  };
  const connect = async endpoints => {
    // Re-project the second endpoint after selecting the first: its contextual
    // card may change the canvas width, so old screen coordinates are unsafe.
    await nativeClick(await terminal(endpoints[0]));
    await nativeClick(await terminal(endpoints[1]));
  };
  const stage = id => run(`const e=document.querySelector('[data-lesson-stage="${id}"]');if(!e)throw new Error('Lesson stage missing: ${id}');e.click();await v.sleep(180);`);
  const loadLesson = async fixture => {
    await closeDialogs();
    await run(`v.click('Learn');await v.sleep(100);v.click('Courses');await v.sleep(120);v.input('Search configurations',${JSON.stringify(fixture.title)});await v.sleep(120);const card=Array.from(document.querySelectorAll('[role=dialog] button')).find(element=>v.visible(element)&&v.text(element).includes(${JSON.stringify(fixture.title)}));if(!card)throw new Error('Required course unavailable');card.click();`);
    await replacement();
    await waitState(fixture.id, value => value.draft?.lessonId === fixture.id && value.task, 'Requested course loaded');
  };
  const startGuided = async fixture => {
    await stage('build');
    await run(`await v.until(()=>document.querySelector('[aria-label="Active lesson activity"] [data-learning-primary="build"]'),'Start guided build');document.querySelector('[aria-label="Active lesson activity"] [data-learning-primary="build"]').click();`);
    await replacement();
    const first = fixture.activities.find(activity => activity.kind === 'connect');
    const current = await waitState(fixture.id, value => value.draft?.wires.length === 0 && value.draft.supply.enabled === false && value.task?.id === first.id && value.task.primary !== 'build', 'Fresh isolated guided bench');
    // Rear access focuses a selected object. Clear any retained selection
    // using the public picker before fitting the whole isolated workbench.
    await run(`v.click('Select','button:not([data-lesson-stage])');await v.sleep(120);const detail=document.querySelector('.technical-details');if(detail&&!detail.open)detail.querySelector('summary').click();await v.sleep(80);if(document.querySelector('[aria-label="Select equipment"]'))await v.choose('Select equipment','Select equipment…');await v.sleep(100);v.click('Connect','button:not([data-lesson-stage])');await g.idleCamera();v.click('Fit workbench');await g.idleCamera();v.click('Rear terminals');await g.idleCamera();await v.loadedScene();`);
    const initialScene = await run('return await v.loadedScene();');
    const missing = fixture.activities.filter(activity => activity.kind === 'connect').flatMap(activity => activity.endpoints).filter(endpoint => {
      const target = initialScene.components.find(component => component.id === endpoint.component)?.terminals.find(item => item.id === endpoint.terminal);
      return !target?.inView || target.instances !== 1;
    });
    add('lesson ' + fixture.id + ' has every requested terminal visible in the settled rear bench', missing.length === 0, { missing, camera: await run('return await g.camera();') });
    add('lesson ' + fixture.id + ' begins guided wiring isolated and empty', current.draft.supply.enabled === false && current.draft.wires.length === 0, { circuitId: current.draft.id, task: current.task.id });
    return current;
  };
  const unchanged = async (lessonId, before, expectedTask, name) => {
    await run('await v.sleep(750);');
    const after = await state(lessonId);
    add(name, same(awarded(before), awarded(after)) && (!expectedTask || after.task?.id === expectedTask), { before: awarded(before), after: awarded(after), task: after.task?.id });
    return after;
  };
  const buildAll = async (fixture, baseline, beginAt = 0) => {
    const steps = fixture.activities.filter(activity => activity.kind === 'connect');
    let current = baseline;
    for (let index = beginAt; index < steps.length; index++) {
      const activity = steps[index], nextId = steps[index + 1]?.id ?? fixture.activities.find(item => item.kind === 'operate').id;
      add('lesson ' + fixture.id + ' presents connection ' + (index + 1), current.task?.id === activity.id, { expected: activity.id, actual: current.task?.id });
      const before = current;
      await connect(activity.endpoints);
      current = await waitState(fixture.id, value => value.task?.id === nextId && value.draft?.wires.length === before.draft.wires.length + 1 && value.successes === before.successes + 1, 'Automatic single-step advancement');
      const added = current.draft.wires.find(wire => !before.draft.wires.some(old => old.id === wire.id));
      const expected = { from: activity.endpoints[0], to: activity.endpoints[1], role: activity.expectedRole };
      const exactlyOne = same([...current.activityIds].sort(), [...new Set([...before.activityIds, activity.id])].sort());
      add('native connection ' + activity.id + ' credits and advances exactly once without Check or Next', exactlyOne && current.successes === before.successes + 1 && added && pairKey(added) === pairKey(expected) && current.draft.supply.enabled === false, { taskBefore: before.task.id, taskAfter: current.task.id, expectedRole: activity.expectedRole, actualRole: added?.role, wireId: added?.id, successesBefore: before.successes, successesAfter: current.successes });
      connections.push({ lessonId: fixture.id, activityId: activity.id, endpoints: activity.endpoints, expectedRole: activity.expectedRole, actualRole: added.role, wireId: added.id, nextActivityId: current.task.id });
      if (index === 0 && fixture.id === 7) {
        await run(`v.click('More');await v.sleep(120);`); await closeDialogs();
        current = await unchanged(7, current, nextId, 'ordinary settings renders do not repeat guided credit');
        await run(`v.click('Undo');`);
        await waitState(7, value => value.draft.wires.length === 0, 'Undo removed first accepted conductor');
        await unchanged(7, current, nextId, 'Undo does not rewind the instruction or award another activity');
        await run(`v.click('Redo');`);
        const redone = await waitState(7, value => value.draft.wires.length === 1, 'Redo restored first conductor');
        add('Redo restores the exact accepted conductor', same(redone.draft.wires, current.draft.wires), { original: current.draft.wires, restored: redone.draft.wires });
        current = await unchanged(7, current, nextId, 'Redo of an existing conductor does not create a new guided award');
      }
    }
    add('lesson ' + fixture.id + ' finishes all guided connections at Try with graph retained and supply off', current.task?.stage === 'try' && same(graphKey(current.draft.wires), graphKey(fixture.circuit.wires)) && current.draft.supply.enabled === false && same(current.draft.components, baseline.draft.components), { wires: current.draft.wires.length, expectedWires: fixture.circuit.wires.length, task: current.task?.id, supplyEnabled: current.draft.supply.enabled });
    await capture('lesson-' + fixture.id + '-complete');
    return current;
  };

  try {
    fs.mkdirSync(output, { recursive: true });
    await install();
    originals = await js(`(${profileRecords.toString()})('snapshot')`);
    if (!write('desktop-guided-build-original-records.json', { version: app.getVersion(), digest: recordsDigest(originals), records: originals })) throw new Error('The original profile backup could not be written; no fixtures were applied.');
    const oneWay = fixtures.find(fixture => fixture.id === 7), control = fixtures.find(fixture => fixture.id === 41);
    if (!oneWay || !control) throw new Error('Required one-way and shutter-control fixtures are missing.');
    const exerciseRecords = new Map(originals);
    exerciseRecords.set('draft', structuredClone(oneWay.circuit)); exerciseRecords.set('builds', []);
    exerciseRecords.set('progress', { version: 2, lessons: [], builds: [], faults: [], scores: {}, learning: {} });
    await run('v.stop();');
    await restoreProfileWithoutReact({ window, directory: webDirectory, originalUrl, records: [...exerciseRecords], returnToApp: true });
    if (window.isMinimized()) window.restore(); window.setFullScreen(false); window.unmaximize();
    for (let tries = 0; tries < 100 && (window.isFullScreen() || window.isMaximized()); tries++) await new Promise(resolve => setTimeout(resolve, 50));
    window.setSize(1440, 1000); window.showInactive(); window.focus(); await install();
    await loadLesson(oneWay); let current = await startGuided(oneWay);
    const first = oneWay.activities.find(activity => activity.kind === 'connect');
    const wrongEndpoints = [first.endpoints[0], { component: 'protect', terminal: 'NIN' }];
    await connect(wrongEndpoints);
    let wrong = await waitState(7, value => value.draft.wires.length === 1, 'Wrong endpoint conductor was placed');
    add('deliberately wrong endpoints remain wired but unaccepted', wrong.task?.id === first.id && same(awarded(current), awarded(wrong)) && pairKey(wrong.draft.wires[0]) !== pairKey({ from: first.endpoints[0], to: first.endpoints[1], role: first.expectedRole }), { task: wrong.task, wire: wrong.draft.wires[0], award: awarded(wrong) });
    await capture('wrong-endpoint'); await run(`v.click('Undo');`);
    current = await waitState(7, value => value.draft.wires.length === 0, 'Wrong endpoint conductor undone');
    await run(`await v.choose('Conductor identification','N');`);
    await connect(first.endpoints);
    wrong = await waitState(7, value => value.draft.wires.length === 1, 'Manually wrong role conductor was placed');
    add('manual role chosen before the first terminal is preserved and refused', wrong.draft.wires[0].role === 'N' && wrong.task?.id === first.id && same(awarded(current), awarded(wrong)), { task: wrong.task, wire: wrong.draft.wires[0], award: awarded(wrong) });
    await capture('wrong-identification'); await run(`v.click('Undo');`);
    current = await waitState(7, value => value.draft.wires.length === 0, 'Wrong-role conductor undone');
    const complete = await buildAll(oneWay, current);
    await stage('look'); await unchanged(7, complete, undefined, 'leaving Build does not auto-award another activity');
    await stage('build'); await unchanged(7, complete, first.id, 'returning to a completed connection does not credit its existing wire');
    await run('v.stop();'); await window.webContents.reload(); await install();
    const reloaded = await state(7);
    add('renderer reload preserves accepted graph and exact competence awards', same(graphKey(reloaded.draft.wires), graphKey(complete.draft.wires)) && same(awarded(reloaded), awarded(complete)), { wires: reloaded.draft.wires.length, awards: awarded(reloaded) });
    await run(`v.click('Learn');`); await stage('build');
    await unchanged(7, complete, first.id, 'reload followed by Build navigation does not replay automatic awards');
    await capture('reload-no-award');
    await loadLesson(control); current = await startGuided(control);
    const controlComplete = await buildAll(control, current);
    add('L-fed and contact-output control pairs receive their lesson role without manual selection', connections.filter(item => item.lessonId === 41 && item.expectedRole === 'control').length >= 4 && connections.filter(item => item.lessonId === 41).every(item => item.actualRole === item.expectedRole), connections.filter(item => item.lessonId === 41 && item.expectedRole === 'control'));
    await unchanged(41, controlComplete, controlComplete.task.id, 'completed control build remains idle without repeated credit');
  } catch (error) {
    checks.push({ name: 'Native guided-build regression completed', passed: false, detail: error.message });
    await capture('error').catch(captureError => outputErrors.push({ file: 'error screenshot', error: captureError.message }));
  } finally {
    dialog.showOpenDialog = originalOpen; dialog.showSaveDialog = originalSave;
    if (originals) {
      try {
        await js('window.__labVerify?.stop();').catch(() => {});
        const result = await restoreProfileWithoutReact({ window, directory: webDirectory, originalUrl, records: originals });
        restoredDigest = result.digest; restored = restoredDigest === recordsDigest(originals);
        checks.push({ name: 'every original IndexedDB key restored after unloading React', passed: restored, detail: { keys: originals.map(([key]) => key), digest: restoredDigest } });
      } catch (error) { restorationError = error.message; checks.push({ name: 'every original IndexedDB key restored', passed: false, detail: error.message }); }
    }
    try { windowRestoration = await restoreWindow(window, originalWindow); checks.push({ name: 'exact native bounds, maximized, fullscreen and minimized states restored', passed: windowRestoration.passed, detail: windowRestoration }); }
    catch (error) { checks.push({ name: 'original native window restored', passed: false, detail: error.message }); }
  }
  const report = { version: app.getVersion(), packaged: app.isPackaged, passed: restored && checks.every(check => check.passed) && outputErrors.length === 0, elapsedMs: Date.now() - started, checks, images, connections, nativeInputs, originalRecordsRestored: restored, originalKeys: originals?.map(([key]) => key), originalDigest: originals && recordsDigest(originals), restoredDigest, restorationError, windowRestoration, outputErrors,
    method: 'Public Learn/course controls and native Electron terminal clicks on live projected 3D anchors; actual IndexedDB activity IDs, competence successes and wire endpoints/roles; no manual Check/Next during correct builds. Every profile key is restored atomically after unloading React to a bundled same-origin stylesheet, with exact digest and native-window restoration.' };
  if (!write('desktop-guided-build-report.json', report)) report.passed = false;
  write('desktop-guided-build-progress.json', { ...report, running: false });
  return report;
}

module.exports = { runGuidedBuildDiagnostics };
