/* eslint-disable @typescript-eslint/no-require-imports -- Sandboxed Electron preloads support CommonJS. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electricalDesktop', Object.freeze({
  platform: 'windows',
  readJsonFile: kind => ipcRenderer.invoke('electrical:read-json', kind),
  saveJsonFile: (text, name, kind) => ipcRenderer.invoke('electrical:save-json', text, name, kind),
  openExternalReference: url => ipcRenderer.invoke('electrical:open-reference', url),
  setFullscreen: value => ipcRenderer.invoke('electrical:fullscreen', value),
  onFullscreenChange: callback => { const listener = (_event, value) => callback(value === true); ipcRenderer.on('electrical:fullscreen-changed', listener); return () => ipcRenderer.removeListener('electrical:fullscreen-changed', listener); },
}));
