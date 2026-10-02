import { COMPONENTS } from './components';
import { equipmentAssetKey } from './equipment-assets';
import type { ComponentInstance, ConfigurationLesson } from './types';

/** Use the equipment actually present in a course, retaining its physical form. */
export function lessonMenuEquipment(lesson:ConfigurationLesson):ComponentInstance[]{
  const importance:Record<string,number>={source:12,source3:12,panel:50,rcd:25,rcbo:25,spd:70,smartrelay:75,priority:80,lamp:55,dimmer:90,switch:65,switch2:75,intermediate:90,sensor:90,driver:85,socket:65,fcu:75,cooker:90,shower:90,transformer:80,heater:80,thermostat:75,timer:78,programmer:80,valve:90,valve3:95,heatpump:100,fan:90,pump:90,motor:90,motor3:90,alarm:90,chime:90,emergency:90,ev:100,pv:100,battery:100,vfd:110,plc:110,safetyRelay:120,contactor:82,changeover:85};
  const seen=new Set<string>();
  return lesson.circuit.components.map((component,index)=>({component,index,score:importance[component.type]??15})).sort((a,b)=>b.score-a.score||a.index-b.index).filter(({component})=>{const def=COMPONENTS[component.type];if(!def)return false;const key=equipmentAssetKey(component,def);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,2).map(({component})=>component);
}
