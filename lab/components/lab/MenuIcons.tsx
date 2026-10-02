'use client';
/* eslint-disable @next/next/no-img-element -- Offline desktop thumbnails are already rendered 192px local assets; no image server is required. */
import { memo, useState } from 'react';
import { AirVent, BatteryCharging, Bell, Cable, CircuitBoard, Clock, Cpu, Factory, Fan, Focus, Gauge, Home, Layers, Lightbulb, Move3D, Plug, Power, Radio, Settings2, ShieldCheck, Sun, Thermometer, ToggleRight, Waves, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { COMPONENTS } from '../../lib/components';
import { equipmentAsset } from '../../lib/equipment-assets';
import { lessonMenuEquipment } from '../../lib/menu-equipment';
import type { ComponentInstance, ConfigurationLesson } from '../../lib/types';

const equipmentGlyphs:Record<string,LucideIcon>={source:Plug,source3:Zap,meter:Gauge,panel:CircuitBoard,terminal:Cable,earthbar:Cable,neutralbar:Cable,mcb:ShieldCheck,mcb3:ShieldCheck,rcd:ShieldCheck,rcd3:ShieldCheck,rcbo:ShieldCheck,spd:Zap,fuse:ShieldCheck,isolator:Power,isolator3:Power,changeover:ToggleRight,socket:Plug,socket3:Plug,plug:Plug,plug3:Plug,fcu:Power,junction:Cable,rose:Cable,switch:ToggleRight,switch2:ToggleRight,intermediate:ToggleRight,dimmer:Sun,lamp:Lightbulb,led:Lightbulb,transformer:CircuitBoard,driver:CircuitBoard,dcsupply:CircuitBoard,sensor:Radio,timer:Clock,smartrelay:Cpu,thermostat:Thermometer,cutout:Thermometer,heater:Thermometer,cooker:Thermometer,shower:Waves,boiler:Thermometer,heatpump:AirVent,valve:Waves,valve3:Waves,pump:Waves,fan:Fan,motor:Factory,motor3:Factory,contactor:CircuitBoard,relay:CircuitBoard,overload:ShieldCheck,pushbutton:Power,selector:ToggleRight,indicator:Lightbulb,vfd:Factory,plc:Cpu,safetyRelay:ShieldCheck,alarm:Bell,chime:Bell,emergency:Lightbulb,ev:BatteryCharging,pv:Sun,battery:BatteryCharging,cable:Cable,conduit:Cable,multimeter:Gauge,clamp:Gauge};

export const EquipmentIcon=memo(function EquipmentIcon({component,size=36}:{component:ComponentInstance;size?:number}){
  const [failed,setFailed]=useState('');
  const definition=COMPONENTS[component.type],asset=definition&&equipmentAsset(component,definition);
  const src=(asset as {thumbnailUrl?:string}|undefined)?.thumbnailUrl;
  const Glyph=equipmentGlyphs[component.type]??CircuitBoard;
  return <span className="equipment-thumbnail" style={{width:size,height:size}} aria-hidden="true">{src&&failed!==src?<img src={src} alt="" loading="lazy" draggable={false} onError={()=>setFailed(src)}/>:<Glyph size={Math.round(size*.54)}/>}</span>;
});

export function DefinitionIcon({type,variant,size=36}:{type:string;variant?:string;size?:number}){
  return <EquipmentIcon component={{id:'menu-'+type,type,variant,label:COMPONENTS[type]?.name??type,position:[0,0,0],rotation:0,params:{...COMPONENTS[type]?.defaults}}} size={size}/>;
}

export function LessonIcon({lesson}:{lesson:ConfigurationLesson}){
  const equipment=lessonMenuEquipment(lesson);
  return <span className="lesson-equipment-icon" aria-hidden="true">{equipment.map((component,index)=><span key={component.id} className={index?'secondary':'primary'}><EquipmentIcon component={component} size={index?25:42}/></span>)}</span>;
}

/** Small semantic symbols accompany menu text; the text remains its accessible name. */
export function MenuIcon({value,label,size=15}:{value:string;label?:string;size?:number}){
  const token=(value+' '+(label??'')).toLowerCase();
  const Glyph=/workshop/.test(token)?Wrench:/utility|domestic|foundation/.test(token)?Home:/industrial|three|machinery|advanced/.test(token)?Factory:/courtyard|sun|dimmer/.test(token)?Sun:/free|camera/.test(token)?Move3D:/focus|rear|front|view|cutaway|exploded/.test(token)?Focus:/lighting|lamp|led/.test(token)?Lightbulb:/heating|therm|temperature/.test(token)?Thermometer:/meter|voltage|current|resistance|instrument/.test(token)?Gauge:/protect|earth|fault|safety/.test(token)?ShieldCheck:/wire|conductor|cable|accessor/.test(token)?Cable:/socket|supply|phase|^l[123]?\b/.test(token)?Zap:/timer|time/.test(token)?Clock:/energy|battery|charger/.test(token)?BatteryCharging:/control|logic/.test(token)?Cpu:/all|automatic|economy|quality|detail/.test(token)?Layers:Settings2;
  return <Glyph size={size} aria-hidden="true"/>;
}
