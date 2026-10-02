import type { ComponentDefinition, ComponentInstance, TerminalDefinition, Vec3 } from './types';

/** The operating face is +Z. Installation terminals belong to the rear (-Z).
 * Dimensions below follow our original fixture housings, not a manufacturer's
 * installation drawing. Stable terminal IDs and electrical groups never change. */
export function equipmentVariant(component: Pick<ComponentInstance, 'type' | 'label' | 'variant' | 'params'>, definition: ComponentDefinition): string {
  return (component.variant && ['panel','lamp','heater','conduit','cable'].includes(component.type)
    ? `${component.type} ${component.variant}`
    : `${component.type} ${component.variant ?? ''} ${component.label} ${definition.name}`).toLowerCase();
}

export function getComponentTerminals(component: Pick<ComponentInstance, 'type' | 'label' | 'variant' | 'params'>, definition: ComponentDefinition): TerminalDefinition[] {
  const sx=definition.size[0]/1.3, sy=definition.size[1]/1.45, sz=definition.size[2]/.85;
  const placements=new Map<string,{anchor:Vec3;group:string}>();
  const variant=equipmentVariant(component,definition);
  const terminalScale=component.type==='indicator'?.72:1;
  // y is the clamp body's centre; the wire bore lies 0.039 scaled units below.
  // rear is the housing's local rear surface. A clamp projects 0.09 world units
  // behind it; the cassette at anchor Z+0.07 attaches to that surface.
  function bank(ids:string[], y:number, rear:number, step=.24, x=0, group='Connections') {
    const present=ids.filter(id=>definition.terminals.some(t=>t.id===id));
    const spacing=Math.max(.17*terminalScale,step*sx);
    present.forEach((id,i)=>placements.set(id,{anchor:[x*sx+(i-(present.length-1)/2)*spacing,y*sy-.039*terminalScale,rear*sz-.09],group}));
  }
  const ids=definition.terminals.map(t=>t.id);
  const supply=['L','N','PE'];
  const threeSupply=['L1','L2','L3','N','PE'];
  switch(component.type) {
    case 'source': bank(supply,.22,-.19); break;
    case 'source3': bank(['L1','L2','L3'],.38,-.19,.24,0,'Phases'); bank(['N','PE'],.18,-.19,.27,0,'Neutral and earth'); break;
    case 'meter': case 'panel':
      bank(supply,component.type==='panel'?1.10:.92,component.type==='panel'?-.27:-.19,.25,0,'Supply');
      bank(['LOUT','NOUT','PEOUT'],component.type==='panel'?.35:.30,component.type==='panel'?-.27:-.19,.25,0,'Outgoing'); break;
    case 'mcb': case 'fuse':
      bank(['IN'],1.12,-.22,.22,0,'Supply'); bank(['OUT'],.35,-.22,.22,0,'Load'); break;
    case 'rcd': case 'rcbo': case 'isolator':
      bank(['LIN','NIN'],.98,component.type==='isolator'?-.28:-.22,.27,0,'Supply');
      bank(['LOUT','NOUT'],.43,component.type==='isolator'?-.28:-.22,.27,0,'Load'); break;
    case 'mcb3': case 'rcd3': case 'isolator3':
      bank(['L1IN','L2IN','L3IN','NIN'],1.08,component.type==='isolator3'?-.28:-.22,.22,0,'Supply');
      bank(['L1OUT','L2OUT','L3OUT','NOUT'],.36,component.type==='isolator3'?-.28:-.22,.22,0,'Load'); break;
    case 'spd': bank(supply,.99,-.22,.20); break;
    case 'changeover':
      bank(['A','AN'],.98,-.28,.32,0,'Supply A'); bank(['B','BN'],.72,-.28,.32,0,'Supply B'); bank(['OUT','NOUT'],.44,-.28,.32,0,'Selected output'); break;
    case 'switch': bank(['COM'],.93,-.28,.22,0,'Common'); bank(['OUT'],.47,-.28,.22,0,'Switched line'); break;
    case 'switch2': bank(['COM'],.94,-.28,.22,0,'Common'); bank(['T1','T2'],.48,-.28,.23,0,'Travellers'); break;
    case 'intermediate': bank(['A','B'],.93,-.28,.23,0,'Traveller pair A'); bank(['C','D'],.48,-.28,.23,0,'Traveller pair B'); break;
    case 'dimmer': bank(['COM','OUT'],.62,-.28,.28); break;
    case 'pushbutton': bank(['COM'],.94,-.28,.22,0,'Common'); bank(['NO','NC'],.48,-.28,.25,0,'Auxiliary contacts'); break;
    case 'selector': bank(['COM'],.94,-.28,.22,0,'Common'); bank(['A','B'],.48,-.28,.25,0,'Selected paths'); break;
    case 'socket': bank(['N','L'],.66,-.28,.43,0,'Line and neutral'); bank(['PE'],1.0,-.28,.22,0,'Earth'); break;
    case 'socket3': bank(['L1','L2','L3'],.84,-.18,.22,0,'Phases'); bank(['N','PE'],.49,-.18,.26,0,'Neutral and earth'); break;
    case 'fcu': bank(['LIN','NIN'],.91,-.28,.29,0,'Supply'); bank(['LOUT','NOUT'],.46,-.28,.29,0,'Load'); bank(['PE'],.70,-.28,.22,.34,'Earth'); break;
    case 'plug': bank(supply,.90,-.24,.24,0,'Plug connections'); bank(['LOUT','NOUT','PEOUT'],.48,-.24,.24,0,'Cord connections'); break;
    case 'plug3': bank(['L1IN','L2IN','L3IN','NIN'],.94,-.39,.19,0,'Plug connections'); bank(['L1OUT','L2OUT','L3OUT','NOUT'],.56,-.39,.19,0,'Cord connections'); bank(['PE','PEOUT'],.30,-.39,.22,0,'Earth continuity'); break;
    case 'junction': bank(['1','2'],.83,-.14,.36,0,'Joined group'); bank(['3','4'],.49,-.14,.36,0,'Joined group'); break;
    case 'rose':
      for(const [input,output,x,group] of [['L','LOUT',-.24,'Line'],['N','NOUT',0,'Neutral'],['PE','PEOUT',.24,'Earth']] as const) {
        bank([input],.78,-.12,.22,x,group); bank([output],.52,-.12,.22,x,group);
      } break;
    case 'terminal': case 'neutralbar': case 'earthbar': bank(ids,.45,-.14,.25,0,component.type==='earthbar'?'Protective connections':component.type==='neutralbar'?'Neutral connections':'Joined connections'); break;
    case 'lamp': case 'led': case 'emergency': case 'indicator': {
      const linear=/emergency|maintained|strip|sign|batten|fluorescent/.test(variant);
      const downlight=!linear && /\bled\b|downlight|spot/.test(variant) && !/bulb/.test(variant);
      if(component.type==='indicator') bank(supply,.61,-.23,.18);
      else if(linear) { bank(supply,.72,-.195,.19,-.12,'Permanent supply'); bank(['SL'],.72,-.195,.19,.42,'Switched illumination'); }
      else if(downlight) bank(ids,.70,-.125,.21,0,component.type==='led'?'LED connection':'Mains connector');
      else { bank(['L','N'],.18,-.29,.28,0,'Lamp contacts'); bank(['PE'],.40,-.29,.22,0,'Mounting-base earth'); }
      break;
    }
    case 'transformer': case 'driver': case 'dcsupply':
      bank(supply,.96,-.18,.25,0,'Mains input'); bank(['+','-'],.45,-.18,.28,0,'Isolated output'); break;
    case 'timer': case 'smartrelay':
      bank(['L','N'],.96,-.15,.29,0,'Controller supply'); bank(['IN','OUT'],.48,-.15,.29,0,'Control path'); break;
    case 'thermostat': bank(['COM','OUT'],.62,-.15,.29); break;
    case 'cutout': bank(['COM','OUT'],.72,-.12,.29); break;
    case 'sensor': {
      const mode=`${variant} ${component.params.mode ?? ''}`.toLowerCase();
      const rear=/pressure/.test(mode)?-.09:/limit/.test(mode)?-.15:/float/.test(mode)?-.09:-.165;
      const x=/float/.test(mode)?-.25:0;
      bank(['L','N'],.98,rear,.22,x,'Sensor supply'); bank(['IN','OUT'],.55,rear,.22,x,'Control path'); break;
    }
    case 'motor3': bank(['U1','V1','W1'],1.15,-.34,.22,0,'Winding starts'); bank(['U2','V2','W2'],.85,-.34,.22,0,'Winding ends'); bank(['PE'],.56,-.34,.22,0,'Frame earth'); break;
    case 'motor': case 'pump': bank(supply,1.02,-.34,.23,0,'Motor terminal box'); break;
    case 'fan': bank(supply,.90,-.15,.22,0,'Fan connections'); break;
    case 'valve': bank(['L','N'],.93,-.225,.21,0,'Actuator supply'); bank(['CALL','END'],.63,-.225,.21,0,'Demand and end switch'); bank(['PE'],.38,-.225,.21,0,'Earth'); break;
    case 'valve3': bank(['L','N'],.97,-.225,.21,0,'Actuator supply'); bank(['CH','HW','END'],.69,-.225,.18,0,'Demand and end switch'); bank(['PE'],.40,-.225,.21,0,'Earth'); break;
    case 'contactor': bank(['1','3','5'],1.08,-.32,.24,0,'Power input'); bank(['2','4','6'],.39,-.32,.24,0,'Power output'); bank(['A1','A2'],.86,-.32,.50,0,'Coil'); bank(['13','14','21','22'],.63,-.32,.21,0,'Auxiliary contacts'); break;
    case 'relay': bank(['A1','A2'],.98,-.32,.29,0,'Coil'); bank(['COM','NO','NC'],.48,-.32,.23,0,'Changeover contacts'); break;
    case 'overload': bank(['1','3','5'],1.08,-.32,.23,0,'Power input'); bank(['2','4','6'],.40,-.32,.23,0,'Power output'); bank(['95','96'],.73,-.32,.29,0,'Trip contact'); break;
    case 'vfd': bank(['L1','L2','L3','PE'],1.05,-.425,.21,0,'Drive supply'); bank(['COM','RUN'],.76,-.425,.28,0,'Control'); bank(['U','V','W'],.43,-.425,.24,0,'Motor output'); break;
    case 'plc': bank(['L','N'],1.06,-.325,.27,0,'Logic supply'); bank(['I1','I2'],.79,-.325,.27,0,'Inputs'); bank(['COM','Q1','Q2'],.45,-.325,.23,0,'Output contacts'); break;
    case 'safetyRelay': bank(['L','N'],1.06,-.325,.26,0,'Supply'); bank(['S1','S2'],.81,-.325,.26,0,'Safety inputs'); bank(['RESET','FB'],.55,-.325,.26,0,'Reset and feedback'); bank(['COM','OUT'],.29,-.325,.26,0,'Output contact'); break;
    case 'pv': bank(supply,1.04,-.425,.24,0,'AC interface'); bank(['+','-'],.46,-.425,.30,0,'DC interface'); break;
    case 'battery': bank(supply,1.05,-.425,.24,0,'Grid AC'); bank(['+','-'],.73,-.425,.30,0,'DC interface'); bank(['BL','BN'],.40,-.425,.30,0,'Backup AC'); break;
    case 'alarm': bank(supply,.76,-.10,.20,0,'Mains supply'); bank(['LINK'],.45,-.10,.20,0,'Interlink'); break;
    case 'chime': bank(['L','N'],.71,-.155,.28,0,'Low-voltage input'); break;
    case 'ev': bank(supply,.42,-.20,.22,0,'Charger supply'); break;
    case 'cable': bank(['IN'],.60,-.18,.22,-.43,'Conductor end A'); bank(['OUT'],.60,-.18,.22,.45,'Conductor end B'); break;
    case 'heater':
      if(/immersion/.test(variant)) { bank(['L','N'],1.15,-.25,.25,0,'Element supply'); bank(['PE'],.90,-.36,.22,0,'Flange earth'); }
      else bank(supply,/mat|underfloor/.test(variant)?.13:.47,/mat|underfloor/.test(variant)?-.37:-.30,.23,0,'Heating supply');
      break;
    case 'shower': bank(['L','N'],.73,-.16,.23,-.15,'Supply'); bank(['PE'],1.02,-.16,.22,-.15,'Earth'); break;
    case 'cooker': bank(supply,.32,-.29,.24,0,'Rear connection box'); break;
    case 'boiler': case 'heatpump': bank(supply,.36,-.325,.24,0,'Supply and demand'); break;
  }
  // Every future model defaults to a rear bank, never the old front grid.
  const remaining=ids.filter(id=>!placements.has(id));
  for(let i=0;i<remaining.length;i+=3) bank(remaining.slice(i,i+3),.46+Math.floor(i/3)*.28,-.25,.23,0,'Connections');
  return definition.terminals.map(t=>({...t,...placements.get(t.id)!,scale:terminalScale,anchor:[...placements.get(t.id)!.anchor] as Vec3}));
}
