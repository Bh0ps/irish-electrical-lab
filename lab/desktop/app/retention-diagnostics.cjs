/* eslint-disable @typescript-eslint/no-require-imports -- Upgrade checks operate only inside this application's persistent profile. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ORIGIN } = require('./security.cjs');
const { profileRecords } = require('./graphics-diagnostics-helpers.cjs');
function firstStylesheet(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { const nested = firstStylesheet(file); if (nested) return nested; }
    else if (entry.name.endsWith('.css')) return file;
  }
}
function rendererStoreHelpers() {
  const database = () => new Promise((resolve, reject) => { const request = indexedDB.open('irish-electrical-lab', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  window.__retentionStore = {
    snapshot: async () => { const db = await database(); return new Promise((resolve, reject) => { const transaction = db.transaction('records'), store = transaction.objectStore('records'), keys = store.getAllKeys(), values = store.getAll(); transaction.oncomplete = () => { resolve(keys.result.map((key, index) => [key, values.result[index]])); db.close(); }; transaction.onerror = () => reject(transaction.error); }); },
    restore: async records => { const db = await database(); return new Promise((resolve, reject) => { const transaction = db.transaction('records', 'readwrite'), store = transaction.objectStore('records'); store.clear(); for (const [key, value] of records) store.put(value, key); transaction.oncomplete = () => { resolve(); db.close(); }; transaction.onabort = () => reject(transaction.error); }); },
  };
}
function canonical(value) { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])); return value; }
const digest = records => crypto.createHash('sha256').update(JSON.stringify(canonical([...records].sort(([a], [b]) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)))).digest('hex');
async function runRetentionDiagnostics({ app, window }) {
  const output = path.join(app.getPath('userData'), 'verification');
  fs.mkdirSync(output, { recursive: true });
  const reportFile = path.join(output, 'desktop-upgrade-retention-report.json');
  const originalFile = path.join(output, 'desktop-upgrade-retention-original.json');
  const check = process.argv.includes('--verify-retention-check');
  if (!check && fs.existsSync(reportFile)) {
    const previous = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    if (previous.expectedDigest && !previous.originalRecordsRestored) {
      fs.writeFileSync(path.join(output, 'desktop-retention-seed-error.json'), JSON.stringify({ message: 'An upgrade check is unfinished. Complete its retention check before creating another test profile; its original backup has been preserved.', recordedAt: new Date().toISOString() }, null, 2));
      app.quit();
      return;
    }
  }
  const report = check ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : { version: app.getVersion(), packaged: app.isPackaged, profile: app.getPath('userData'), passed: false, seededAt: new Date().toISOString() };
  let originals;
  try {
    await window.webContents.executeJavaScript(`(async()=>{for(let tries=0;tries<100&&!document.querySelector('canvas');tries++)await new Promise(resolve=>setTimeout(resolve,100));await new Promise(resolve=>setTimeout(resolve,800));(${rendererStoreHelpers.toString()})();})()`);
    // Stop React before diagnostic writes so pending autosave cannot replace
    // the seeded or restored records. This local CSS document has no scripts.
    const directory = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../../dist/client');
    const stylesheet = firstStylesheet(directory);
    if (!stylesheet) throw new Error('Bundled stylesheet required for safe profile verification');
    await window.loadURL(ORIGIN + '/' + path.relative(directory, stylesheet).replace(/\\/g, '/'));
    await window.webContents.executeJavaScript(`(${rendererStoreHelpers.toString()})();`);
    if (check) {
      originals = JSON.parse(fs.readFileSync(report.originalRecordsFile ? path.join(output, path.basename(report.originalRecordsFile)) : originalFile, 'utf8'));
      const actual = await window.webContents.executeJavaScript('window.__retentionStore.snapshot()');
      const expectedKeys=new Set(report.expectedKeys??[...originals.map(([key])=>key),'draft','builds','progress']);
      const retained=actual.filter(([key])=>expectedKeys.has(key));
      report.actualDigest = digest(retained);
      report.passed = report.actualDigest === report.expectedDigest;
      report.checkedAt = new Date().toISOString();
      report.checkedVersion=app.getVersion();
      report.addedProfileKeys=actual.filter(([key])=>!expectedKeys.has(key)).map(([key])=>key);
      report.actualBuildCount = actual.find(([key]) => key === 'builds')?.[1]?.length ?? 0;
      report.actualProgress = actual.find(([key]) => key === 'progress')?.[1];
      if (!report.passed) report.error = 'Persistent records changed across the replacement installer.';
      await window.webContents.executeJavaScript(`window.__retentionStore.restore(${JSON.stringify(originals)})`);
      const restored = await window.webContents.executeJavaScript(`(${profileRecords.toString()})('snapshot')`);
      report.originalRecordsRestored = digest(restored) === digest(originals);
      report.restoredOriginalDigest = digest(restored);
      if (!report.originalRecordsRestored) { report.passed = false; report.error = 'Original profile records did not restore exactly.'; }
    } else {
      originals = await window.webContents.executeJavaScript('window.__retentionStore.snapshot()');
      report.originalRecordsFile = `desktop-upgrade-retention-original-${app.getVersion()}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;
      report.originalDigest = digest(originals);
      fs.writeFileSync(path.join(output, report.originalRecordsFile), JSON.stringify(originals, null, 2), { flag: 'wx' });
      fs.writeFileSync(originalFile, JSON.stringify(originals, null, 2));
      const source = app.isPackaged ? path.join(process.resourcesPath, 'qa-circuits.json') : path.resolve(__dirname, '../assets/qa-circuits.json');
      const fixture = JSON.parse(fs.readFileSync(source, 'utf8')).find(item => item.id === 7).circuit;
      const records = new Map(originals);
      const build = structuredClone(fixture); build.id = 'verification-upgrade-' + Date.now(); build.name = 'Upgrade retention diagnostic';
      records.set('draft', structuredClone(fixture));
      records.set('builds', [...(records.get('builds') ?? []), build]);
      const progress = structuredClone(records.get('progress') ?? { lessons: [], builds: [], faults: [], scores: {} });
      progress.lessons = Array.from(new Set([...(progress.lessons ?? []), 7]));
      progress.builds = Array.from(new Set([...(progress.builds ?? []), 7]));
      progress.scores = { ...progress.scores, 7: 85 };
      records.set('progress', progress);
      const seeded = [...records].sort(([a], [b]) => String(a).localeCompare(String(b)));
      await window.webContents.executeJavaScript(`window.__retentionStore.restore(${JSON.stringify(seeded)})`);
      report.expectedDigest = digest(seeded);
      report.expectedKeys=seeded.map(([key])=>key);
      report.expectedBuildCount = records.get('builds').length;
      report.seededDraft = { id: fixture.id, components: fixture.components.length, wires: fixture.wires.length };
    }
  } catch (error) {
    report.passed = false; report.error = error.message;
    if (originals) await window.webContents.executeJavaScript(`window.__retentionStore.restore(${JSON.stringify(originals)})`).catch(() => {});
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  app.quit();
}
module.exports = { runRetentionDiagnostics, rendererStoreHelpers };
