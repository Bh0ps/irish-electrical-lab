export type JsonFileKind = 'circuit' | 'backup';
export interface ElectricalDesktopBridge {
  platform: 'windows';
  readJsonFile(kind:JsonFileKind):Promise<string|null>;
  saveJsonFile(text:string,name:string,kind:JsonFileKind):Promise<boolean>;
  openExternalReference(url:string):Promise<void>;
  setFullscreen(value:boolean):Promise<void>;
  onFullscreenChange?(callback:(value:boolean)=>void):()=>void;
}
declare global { interface Window { electricalDesktop?: ElectricalDesktopBridge } }
export function isDesktop():boolean { return typeof window !== 'undefined' && window.electricalDesktop?.platform === 'windows'; }
export async function readJsonFile(kind:JsonFileKind):Promise<string|null> {
  if (window.electricalDesktop) return window.electricalDesktop.readJsonFile(kind);
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
    input.addEventListener('cancel',()=>resolve(null),{once:true});
    input.addEventListener('change',()=>{const file=input.files?.[0];if(!file){resolve(null);return;}if(file.size>32*1024*1024){reject(new Error('Choose a JSON file smaller than 32 MB.'));return;}file.text().then(resolve,reject);},{once:true});
    input.click();
  });
}
export async function saveJsonFile(text:string,name:string,kind:JsonFileKind):Promise<boolean> {
  if (window.electricalDesktop) return window.electricalDesktop.saveJsonFile(text,name,kind);
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}
export async function openExternalReference(url:string):Promise<void> {
  if(window.electricalDesktop)await window.electricalDesktop.openExternalReference(url);else window.open(url,'_blank','noopener,noreferrer');
}
export async function setFullscreen(value:boolean):Promise<void> {
  if(window.electricalDesktop)await window.electricalDesktop.setFullscreen(value);else if(value)await document.documentElement.requestFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();
}
export function observeFullscreen(callback:(value:boolean)=>void):()=>void {
  if(window.electricalDesktop?.onFullscreenChange)return window.electricalDesktop.onFullscreenChange(callback);
  const listener=()=>callback(!!document.fullscreenElement);document.addEventListener('fullscreenchange',listener);return()=>document.removeEventListener('fullscreenchange',listener);
}
