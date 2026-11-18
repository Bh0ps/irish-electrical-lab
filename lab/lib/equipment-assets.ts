import manifest from '../public/models/manifest.json';
import referenceMap from '../../authoring/blender/reference-map.json';
import { equipmentVariant,getComponentTerminals } from './terminal-layout';
import type { ComponentDefinition, ComponentInstance } from './types';
import { publicAssetUrl } from '../web/asset-url';
import { workshopKey } from './workshop-variants';

/** One key is shared by the authoring inventory and the offline asset loader. */
export function equipmentAssetKey(component: ComponentInstance, def: ComponentDefinition): string {
  const specific=workshopKey(component);if(specific)return specific;
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
export const EQUIPMENT_ASSETS = new Map(manifest.map(entry => [entry.galleryKey, {
  ...entry,
  url: publicAssetUrl(entry.url),
  lowUrl: publicAssetUrl(entry.lowUrl),
  thumbnailUrl: publicAssetUrl(entry.thumbnailUrl),
}]));
export function equipmentAsset(component:ComponentInstance,definition:ComponentDefinition){
  const selected=EQUIPMENT_ASSETS.get(equipmentAssetKey(component,definition));
  if(selected)return selected;
  // A learner can give a switch any name (including “Start”). If legacy
  // label matching names a nonexistent variant, use its type's named model
  // only when every electrical mouth still occupies the exact same point.
  const candidate=EQUIPMENT_ASSETS.get(equipmentAssetKey({...component,label:definition.name},definition));
  if(!candidate)return undefined;
  const terminals=getComponentTerminals(component,definition);
  const sameLayout=candidate.terminals.length===terminals.length && terminals.every(t=>{
    const found=candidate.terminals.find(other=>other.id===t.id);
    return found && t.anchor.every((n,i)=>Math.abs(n-found.anchor[i])<1e-5)
      && t.entryDirection?.every((n,i)=>Math.abs(n-found.entryDirection[i])<1e-5);
  });
  return sameLayout?candidate:undefined;
}

/** The source lists describe representative architecture. Equipment drawings,
 * mounting and actual circuit ratings continue to vary between products. */
export function equipmentReferences(component:ComponentInstance,definition:ComponentDefinition){
  let ids=(referenceMap.familySources as Record<string,string[]>)[definition.model]??[];
  if(component.type==='rcbo'||component.type==='rcd'||component.type==='rcd3')ids=['hager-rcbo','abb-mcb'];
  if(component.type==='spd')ids=['schneider-spd'];
  if(component.type==='plug3'||component.type==='socket3')ids=['mennekes-plug','mennekes-contacts'];
  if(component.type==='socket'||component.type==='plug'||component.type==='fcu')ids=['mk-accessory'];
  ids=(referenceMap.variantSources as Record<string,string[]>)[equipmentAsset(component,definition)?.galleryKey??equipmentAssetKey(component,definition)]??ids;
  return ids.flatMap(id=>referenceMap.sources.filter(source=>source.id===id));
}
