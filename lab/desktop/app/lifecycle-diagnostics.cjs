/* eslint-disable @typescript-eslint/no-require-imports -- App-owned diagnostic of the actual Windows shell. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runLifecycleDiagnostics({ app, window, settings, startedAt }) {
  const output = path.join(app.getPath('userData'), 'verification');
  fs.mkdirSync(output, { recursive: true });
  const file = path.join(output, 'desktop-lifecycle-report.json');
  const checks = [];
  const add = (name, passed, detail) => { checks.push({ name, passed, detail }); if (!passed) throw new Error(name); };
  const checkRestart = process.argv.includes('--verify-lifecycle-check');
  const report = checkRestart ? JSON.parse(fs.readFileSync(file, 'utf8')) : { app: app.getName(), packaged: app.isPackaged, origin: 'http://127.0.0.1:4187', userData: app.getPath('userData'), previousSettings: settings, originalBounds: window.getNormalBounds(), originalMaximized: settings.maximized ?? window.isMaximized(), expectedBounds: { ...window.getNormalBounds(), width: 1240, height: 820 }, startedAt: new Date(startedAt).toISOString() };
  try {
    if (checkRestart) {
      const actual = window.getNormalBounds();
      add('normal window dimensions survive full process restart', actual.width === report.expectedBounds.width && actual.height === report.expectedBounds.height, { actual, expected: report.expectedBounds });
      window.setFullScreen(false);
      window.unmaximize();
      window.setBounds(report.originalBounds);
      if (report.originalMaximized) window.maximize();
      for (let tries=0;tries<40&&window.isMaximized()!==report.originalMaximized;tries++) await delay(50);
      await delay(200);
      add('original maximized state is restored',window.isMaximized()===report.originalMaximized,{actual:window.isMaximized(),expected:report.originalMaximized});
      report.restartChecks = checks;
      report.passed = report.prepareChecks.every(check => check.passed) && checks.every(check => check.passed);
    } else {
      const secondInstance = new Promise(resolve => app.once('second-instance', () => resolve(true)));
      const child = spawn(process.execPath, app.isPackaged ? ['--verify-secondary-instance'] : [path.dirname(__filename), '--verify-secondary-instance'], { windowsHide: true, stdio: 'ignore' });
      const childExit = new Promise(resolve => { child.once('exit', code => resolve(code)); child.once('error', error => resolve(error.message)); });
      const notified = await Promise.race([secondInstance, delay(10000).then(() => false)]);
      const exit = await Promise.race([childExit, delay(10000).then(() => 'timeout')]);
      add('second launch focuses one application instance', notified === true && exit === 0, { secondInstanceEvent: notified, secondaryExit: exit });
      window.showInactive();
      await window.webContents.executeJavaScript(`(async()=>{for(let tries=0;tries<100&&!Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='More');tries++)await new Promise(resolve=>setTimeout(resolve,100));Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='More').click();await new Promise(resolve=>setTimeout(resolve,100));})()`);
      const fullscreen = async value => { const transition = new Promise(resolve => window.once(value ? 'enter-full-screen' : 'leave-full-screen', resolve)); window.setFullScreen(value); await Promise.race([transition, delay(1500)]); await delay(100); return window.isFullScreen() === value; };
      add('Windows fullscreen enters', await fullscreen(true), { fullscreen: window.isFullScreen() });
      add('renderer follows the native fullscreen state', await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=dialog] button')).some(e=>e.textContent.trim()==='Leave fullscreen')`), 'The settings action updates after the native window event.');
      add('Windows fullscreen exits', await fullscreen(false), { fullscreen: window.isFullScreen() });
      add('renderer follows native fullscreen exit', await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=dialog] button')).some(e=>e.textContent.trim()==='Fullscreen')`), 'The settings action returns to its enter-fullscreen state.');
      window.unmaximize();
      window.setBounds(report.expectedBounds);
      await delay(150);
      add('normal window can be resized', window.getNormalBounds().width === 1240 && window.getNormalBounds().height === 820, window.getNormalBounds());
      report.prepareChecks = checks;
      report.passed = false; // A second process must prove persisted bounds before completion.
    }
  } catch (error) {
    report.passed = false;
    report.error = error.message;
    report[checkRestart ? 'restartChecks' : 'prepareChecks'] = checks;
    window.setFullScreen(false);
    window.unmaximize();
    window.setBounds(report.originalBounds);
    if (report.originalMaximized) window.maximize();
  }
  report.elapsedMs = Date.now() - startedAt;
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  app.quit();
}
module.exports = { runLifecycleDiagnostics };
