import { readRecord, writeRecord } from './storage';
import { DEFAULT_SCENERY, SCENERIES, type SceneryId } from './scene-settings';
import { DEFAULT_CAMERA_SPEED, type CameraMode } from './camera-navigation';
import type { RenderQuality } from './workbench-presentation';

export interface PresentationPreferences {version:1;cameraMode:CameraMode;cameraSpeed:number;scenery:SceneryId;quality:RenderQuality}
export const PRESENTATION_PREFERENCES_RECORD='presentation-preferences';
export const DEFAULT_PRESENTATION_PREFERENCES:Readonly<PresentationPreferences>=Object.freeze({version:1,cameraMode:'orbit',cameraSpeed:DEFAULT_CAMERA_SPEED,scenery:DEFAULT_SCENERY,quality:'auto'});

/** Display/navigation choices cannot change circuit, measurement or progress records. */
export function normalisePresentationPreferences(value:unknown):PresentationPreferences{
  if(!value||typeof value!=='object'||Array.isArray(value))return {...DEFAULT_PRESENTATION_PREFERENCES};
  const record=value as Record<string,unknown>,prototype=Object.getPrototypeOf(record);
  if((prototype!==Object.prototype&&prototype!==null)||record.version!==1)return {...DEFAULT_PRESENTATION_PREFERENCES};
  return {version:1,cameraMode:record.cameraMode==='free'?'free':'orbit',cameraSpeed:typeof record.cameraSpeed==='number'&&Number.isFinite(record.cameraSpeed)?Math.min(12,Math.max(.5,record.cameraSpeed)):DEFAULT_CAMERA_SPEED,scenery:SCENERIES.some(scene=>scene.id===record.scenery)?record.scenery as SceneryId:DEFAULT_SCENERY,quality:record.quality==='high'||record.quality==='economy'?record.quality:'auto'};
}
export async function loadPresentationPreferences():Promise<PresentationPreferences>{try{return normalisePresentationPreferences(await readRecord(PRESENTATION_PREFERENCES_RECORD));}catch{return {...DEFAULT_PRESENTATION_PREFERENCES};}}
export async function savePresentationPreferences(preferences:PresentationPreferences):Promise<void>{await writeRecord(PRESENTATION_PREFERENCES_RECORD,normalisePresentationPreferences(preferences));}
