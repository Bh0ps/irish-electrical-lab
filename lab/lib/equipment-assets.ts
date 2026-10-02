import manifest from '../public/models/manifest.json';
import { equipmentVariant } from './terminal-layout';
import type { ComponentDefinition, ComponentInstance } from './types';

/** One key is shared by the authoring inventory and the offline asset loader. */
export function equipmentAssetKey(component: ComponentInstance, def: ComponentDefinition): string {
  const name=equipmentVariant(component,def), modes:string[]=[];
  if(def.model==='sensor')modes.push(`mode=${String(component.params.mode??def.defaults.mode??'PIR').toLowerCase()}`);
  if(def.model==='panel')modes.push(/industrial|three|cabinet/.test(name)?'industrial-cabinet':'domestic-enclosure');
  if(def.model==='conduit')modes.push(/trunk/.test(name)?'slotted-trunking':'conduit-gland');
  if(def.model==='valve')modes.push(/valve3|three-port|mid-position/.test(name)||component.params.mode==='three-port'?'three-port':'two-port');
  if(def.model==='heater')modes.push(/mat|underfloor/.test(name)?'mat':/immersion/.test(name)?'immersion':'storage');
  if(def.model==='motor')modes.push(/shutter/.test(name)?'shutter':/gate/.test(name)?'gate':/conveyor/.test(name)?'conveyor':/compressor/.test(name)?'compressor':'motor');
  if(def.model==='switch')modes.push(component.params.gangModule==='left'||component.params.gangModule==='right'?`gang-module-${component.params.gangModule}`:/dimmer|selector/.test(name)?'rotary':/button|start|stop|push|emergency/.test(name)?/emergency/.test(name)?'emergency-stop':/stop/.test(name)?'stop-button':'start-button':/isolator|changeover/.test(name)?'red-isolator-rocker':'single-rocker');
  if(def.model==='lamp')modes.push(/indicator/.test(name)?'indicator':/emergency|maintained/.test(name)?'emergency-batten':/strip|sign|batten|fluorescent/.test(name)?'batten':/\bled\b|downlight|spot/.test(name)&&!/bulb/.test(name)?'downlight':'bulb');
  if(def.model==='cable')modes.push(/five|5|threephase|three-phase/.test(name)?'five-core':'three-core');
  return `${component.type}:${modes.join('|')||'default'}`;
}
export const EQUIPMENT_ASSETS=new Map(manifest.map(entry=>[entry.galleryKey,entry]));
export function equipmentAsset(component:ComponentInstance,definition:ComponentDefinition){return EQUIPMENT_ASSETS.get(equipmentAssetKey(component,definition));}
