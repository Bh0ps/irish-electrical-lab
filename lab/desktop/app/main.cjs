/* eslint-disable @typescript-eslint/no-require-imports -- Desktop main and sandboxed preload use Electron's CommonJS entry points. */
'use strict';
const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createAppServer } = require('./server.cjs');
const { ORIGIN, MAX_JSON_BYTES, allowedReference, validKind, safeFileName } = require('./security.cjs');
const PROFILE_NAME = 'Irish Electrical Lab';
const startedAt = Date.now();
const verifyDesktop = process.argv.includes('--verify-desktop');
const verifyGuidedBuild = process.argv.includes('--verify-guided-build');
const verifyLifecycle = process.argv.includes('--verify-lifecycle') || process.argv.includes('--verify-lifecycle-check');
const verifyRetention = process.argv.includes('--verify-retention-seed') || process.argv.includes('--verify-retention-check');
const verifyPortConflict = process.argv.includes('--verify-port-conflict');
const verificationMode = verifyDesktop || verifyGuidedBuild || verifyLifecycle || verifyRetention;
if (verificationMode) process.on('uncaughtException', error => {
  try { const directory = path.join(app.getPath('userData'), 'verification'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'desktop-startup-error.json'), JSON.stringify({ message: error.message, stack: error.stack, recordedAt: new Date().toISOString() }, null, 2)); } catch { /* Preserve the original startup failure. */ }
  app.quit();
});
const consoleErrors = [];
const networkRequests = [];
app.setName(PROFILE_NAME);
app.setPath('userData', path.join(app.getPath('appData'), PROFILE_NAME));
app.setAppUserModelId('ie.irish-electrical-lab.desktop');
const hasLock = app.requestSingleInstanceLock();
let mainWindow;
let localServer;
let shutdownStarted = false;
if (!hasLock) {
  if (verificationMode) {
    const output = path.join(app.getPath('userData'), 'verification');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'desktop-startup-error.json'), JSON.stringify({ message: 'Another application instance owns the study profile; this verification launch was forwarded instead of executed.', recordedAt: new Date().toISOString() }, null, 2));
  }
  app.quit();
}
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (localServer && !shutdownStarted) { event.preventDefault(); shutdownStarted = true; localServer.close(() => { localServer = undefined; app.quit(); }); localServer.closeAllConnections(); }
  });
  app.whenReady().then(start).catch(error => {
    if (verifyPortConflict) { const directory = path.join(app.getPath('userData'), 'verification'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'desktop-port-conflict-report.json'), JSON.stringify({ passed: /local port 4187 is in use/.test(error.message), message: error.message, ordinaryStartupAction: 'Native startup error dialog; saved profile remains untouched.', recordedAt: new Date().toISOString() }, null, 2)); }
    else if (verificationMode) { const directory = path.join(app.getPath('userData'), 'verification'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'desktop-startup-error.json'), JSON.stringify({ message: error.message, stack: error.stack, recordedAt: new Date().toISOString() }, null, 2)); }
    else dialog.showErrorBox('Irish Electrical Lab could not start', error.message);
    app.quit();
  });
}
function assertSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== ORIGIN) throw new Error('Request from an untrusted application frame.');
}
function savedBounds() {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window.json'), 'utf8'));
    if (![value.width, value.height, value.x, value.y].every(Number.isFinite)) return {};
    const bounds = { width: Math.max(1000, Math.min(7680, value.width)), height: Math.max(700, Math.min(4320, value.height)), x: value.x, y: value.y };
    const visible = screen.getAllDisplays().some(({ workArea: d }) => bounds.x < d.x + d.width - 80 && bounds.x + bounds.width > d.x + 80 && bounds.y < d.y + d.height - 80 && bounds.y + bounds.height > d.y + 80);
    return { bounds: visible ? bounds : { width: bounds.width, height: bounds.height }, maximized: value.maximized === true };
  } catch { return {}; }
}
function persistBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(path.join(app.getPath('userData'), 'window.json'), JSON.stringify({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() })); } catch { /* Window position must never block shutdown. */ }
}
async function start() {
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../../dist/client');
  localServer = await createAppServer(directory);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let remote = false;
    try { const url = new URL(details.url); remote = ['http:', 'https:'].includes(url.protocol) && url.origin !== ORIGIN; } catch { remote = true; }
    if (verifyDesktop || verifyGuidedBuild) networkRequests.push({ url: details.url, type: details.resourceType, blocked: remote });
    callback({ cancel: remote });
  });
  const settings = savedBounds();
  mainWindow = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1000, minHeight: 700, ...settings.bounds, title: PROFILE_NAME, backgroundColor: '#101b27', show: false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInWorker: false, webSecurity: true, spellcheck: false, backgroundThrottling: !verificationMode } });
  mainWindow.once('ready-to-show', () => { if (settings.maximized) mainWindow.maximize(); if (!verificationMode) mainWindow.show(); });
  mainWindow.webContents.on('console-message', details => { if (details.level === 'warning' || details.level === 'error') consoleErrors.push(details.message); });
  mainWindow.on('close', persistBounds);
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('electrical:fullscreen-changed', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('electrical:fullscreen-changed', false));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== ORIGIN) { event.preventDefault(); if (allowedReference(url)) void shell.openExternal(url); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (allowedReference(url)) void shell.openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Exit', role: 'quit' }] },
    { label: 'View', submenu: [{ label: 'Fullscreen', role: 'togglefullscreen', accelerator: 'F11' }, { label: 'Reload app', role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { label: 'Help', submenu: [{ label: 'About Irish Electrical Lab', click: () => dialog.showMessageBox(mainWindow, { title: PROFILE_NAME, message: PROFILE_NAME + ' ' + app.getVersion(), detail: 'An offline 3D electrical study workbench. Saved work stays in your Windows profile when the app is updated.\n\nUse My builds → Export full backup to transfer builds and progress.' }) }] },
  ]));
  ipcMain.handle('electrical:read-json', async (event, kind) => {
    assertSender(event); if (!validKind(kind)) throw new Error('Unsupported file type.');
    const result = await dialog.showOpenDialog(mainWindow, { title: kind === 'backup' ? 'Restore study backup' : 'Import circuit', properties: ['openFile'], filters: [{ name: 'Electrical Lab JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const target = result.filePaths[0]; const info = await fs.promises.stat(target);
    if (!info.isFile() || info.size > MAX_JSON_BYTES) throw new Error('Choose a JSON file smaller than 32 MB.');
    const text = await fs.promises.readFile(target, 'utf8'); JSON.parse(text); return text;
  });
  ipcMain.handle('electrical:save-json', async (event, text, name, kind) => {
    assertSender(event); if (!validKind(kind) || typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_JSON_BYTES) throw new Error('Invalid or oversized JSON export.'); JSON.parse(text);
    const result = await dialog.showSaveDialog(mainWindow, { title: kind === 'backup' ? 'Save full study backup' : 'Export circuit', defaultPath: path.join(app.getPath('documents'), safeFileName(name, kind)), filters: [{ name: 'Electrical Lab JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    const temporary = result.filePath + '.electrical-writing-' + process.pid;
    try { await fs.promises.writeFile(temporary, text, 'utf8'); await fs.promises.rename(temporary, result.filePath); } finally { await fs.promises.unlink(temporary).catch(() => {}); }
    return true;
  });
  ipcMain.handle('electrical:open-reference', async (event, url) => { assertSender(event); if (!allowedReference(url)) throw new Error('Only approved HTTPS study-reference websites can be opened.'); await shell.openExternal(url); });
  ipcMain.handle('electrical:fullscreen', async (event, value) => { assertSender(event); if (typeof value !== 'boolean') throw new Error('Fullscreen state must be true or false.'); mainWindow.setFullScreen(value); });
  await mainWindow.loadURL(ORIGIN + '/');
  if (verifyGuidedBuild) {
    const output = path.join(app.getPath('userData'), 'verification', 'guided-build-' + app.getVersion());
    fs.mkdirSync(output, { recursive: true });
    const fixturePath = app.isPackaged ? path.join(process.resourcesPath, 'qa-circuits.json') : path.resolve(__dirname, '../assets/qa-circuits.json');
    const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const report = await require('./guided-build-diagnostics.cjs').runGuidedBuildDiagnostics({ app, window: mainWindow, directory, output, fixtures, dialog });
    report.packaged = app.isPackaged;
    report.consoleErrors = consoleErrors;
    report.network = { observed: networkRequests.length, remoteRequests: networkRequests.filter(request => request.blocked) };
    report.passed = report.passed && consoleErrors.length === 0 && report.network.remoteRequests.length === 0;
    fs.writeFileSync(path.join(output, 'desktop-guided-build-report.json'), JSON.stringify(report, null, 2));
    app.quit();
    return;
  }
  if (verifyLifecycle) await require('./lifecycle-diagnostics.cjs').runLifecycleDiagnostics({ app, window: mainWindow, settings, startedAt });
  if (verifyRetention) await require('./retention-diagnostics.cjs').runRetentionDiagnostics({ app, window: mainWindow });
  if (verifyDesktop) await require('./diagnostics.cjs').runDesktopDiagnostics({ app, window: mainWindow, directory, startedAt, consoleErrors, networkRequests, dialog });
}
