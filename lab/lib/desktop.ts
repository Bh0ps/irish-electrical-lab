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
export function canFullscreen():boolean {
  return isDesktop() || (typeof document !== 'undefined' && document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function');
}
export async function readJsonFile(kind:JsonFileKind):Promise<string|null> {
  if (window.electricalDesktop) return window.electricalDesktop.readJsonFile(kind);
  return new Promise((resolve,reject)=>{
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.addEventListener('cancel', () => { input.remove(); resolve(null); }, { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      if (file.size > 32 * 1024 * 1024) { reject(new Error('Choose a JSON file smaller than 32 MB.')); return; }
      file.text().then(resolve, reject);
    }, { once: true });
    document.body.appendChild(input);
    try { input.click(); } catch (error) { input.remove(); reject(error); }
  });
}
export async function saveJsonFile(text:string,name:string,kind:JsonFileKind):Promise<boolean> {
  if (window.electricalDesktop) return window.electricalDesktop.saveJsonFile(text,name,kind);
  const file = new File([text], name.replace(/[\\/:*?"<>|]/g, '-'), { type: 'application/json' });
  const share = { files: [file] };
  if (window.matchMedia('(pointer: coarse)').matches && navigator.share && navigator.canShare?.(share)) {
    try { await navigator.share(share); return true; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  return true;
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
