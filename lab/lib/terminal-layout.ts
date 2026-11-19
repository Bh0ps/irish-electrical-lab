import { dinPort } from './din-devices.ts';
import type { ComponentDefinition, ComponentInstance, TerminalDefinition, Vec3 } from './types';

/** Original workshop models use +Z for the operating face and +Y for up. */
export function equipmentVariant(component: Pick<ComponentInstance, 'type' | 'label' | 'variant' | 'params'>, definition: ComponentDefinition): string {
  return (component.variant && ['panel','lamp','heater','conduit','cable'].includes(component.type)
    ? `${component.type} ${component.variant}`
    : `${component.type} ${component.variant ?? ''} ${component.label} ${definition.name}`).toLowerCase();
}

/** The lid or terminal door must be opened to reach these installation contacts. */
export function enclosedTerminals(component: Pick<ComponentInstance,'type'|'variant'|'label'>): boolean {
  if(component.type==='driver'&&component.variant==='constant-current')return false;
  return ['source','source3','meter','panel','rose','junction','shower','boiler','heatpump','chime','callchime','ev','vfd','plc','safetyRelay','driver','dcsupply'].includes(component.type) ||
    component.type==='heater' && /immersion/i.test(component.variant??component.label);
}

export function getComponentTerminals(component: Pick<ComponentInstance, 'type' | 'label' | 'variant' | 'params'>, definition: ComponentDefinition): TerminalDefinition[] {
  if(component.type==='pushbutton'&&component.variant==='sesame'){
    // Rear wire seats beside the screw heads. Top and bottom are bench names;
    // neither screw on the actual D814 has a polarity marking.
    return definition.terminals.filter(t=>t.id==='COM'||t.id==='NO').map(t=>{
      const top=t.id==='COM';
      return {...t,label:top?'Top screw':'Bottom screw',group:'Rear contacts',role:'control',
        anchor:[.035,top?.80:.30,.054],entryDirection:[0,0,-1],scale:.44,
        purpose:'Either wire can go here. Press the button and the top and bottom screws are connected.'};
    });
  }
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
    case 'shaveroutlet': bank(['L','N'],.95,-.14,.21,0,'Inside the isolated 230 V outlet'); break;
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
  // Unlisted terminals retain their stable connection bank.
  const remaining=ids.filter(id=>!placements.has(id));
  for(let i=0;i<remaining.length;i+=3) bank(remaining.slice(i,i+3),.46+Math.floor(i/3)*.28,-.25,.23,0,'Connections');
  const make = (t: TerminalDefinition, anchor: Vec3, entryDirection: Vec3, scale=terminalScale) => {
    const label = component.type==='shaveroutlet'?(t.id==='L'?'SEC 1':'SEC 2'):(component.type==='socket'||component.type==='fcu') && t.id==='PE2'?'E2':(component.type==='socket'||component.type==='fcu') && t.id==='PE'?'E':(component.type==='switch' && t.id==='OUT')?'L1':
      component.type==='switch2' && t.id.startsWith('T')?t.id.replace('T','L'):
      component.type==='intermediate'?(['A','B'].includes(t.id)?'L1':'L2')+' ('+t.id+')':
      component.type==='transformer' && ['+','-'].includes(t.id)?(t.id==='+'?'SEC 1':'SEC 2'):
      component.type==='led'?(t.id==='L'?'+':t.id==='N'?'−':t.label):
      component.type==='chime'?(t.id==='L'?'1':t.id==='N'?'2':t.label):t.label;
    return {...t,label,group:placements.get(t.id)!.group,scale,anchor,entryDirection};
  };
  return definition.terminals.map(t=>{
    const {anchor:[x,y,z],group}=placements.get(t.id)!;
    const [w,h,d]=definition.size;
    const scaled=(px:number,py:number,pz:number,dir:Vec3,scale=.66)=>make(t,[px*w,py*h,pz*d],dir.map(a=>a/Math.hypot(...dir)) as Vec3,scale);
    const f=component.variant, k=component.type;
    const port=dinPort(k,t.id);
    if(port)return {...make(t,port.anchor,port.direction,.64),label:port.marking};
    // BG 824 and 851. Coordinates in millimetres from the plate centre, seen
    // from the front. The two earth entries are electrically common.
    // HQ1A, viewed from the front. The wire sits in the brass insert
    // below the mouth of each recessed window. Either terminal can take the feed.
    if(k==='dimmer')return make(t,[t.id==='COM'?.082:-.041,.297,-.113],[0,0,-1],.42);
    if(k==='shaveroutlet')return make(t,[t.id==='L'?.14:-.14,1,-.135],[0,0,-1],.43);
    if (k==='socket'||k==='fcu') {
      const positions:Record<string,Vec3> = k==='socket'
        ? {PE:[37.5,12,-18.9],L:[26.5,12,-17.8],N:[-26.5,12,-17.8],PE2:[-37.5,12,-18.9]}
        : {NOUT:[19,10,-10.4], LIN:[9,10,-10.4], LOUT:[-13,13,-10.4], NIN:[18,-20,-10.4], PE:[-27,7,-6], PE2:[-27,-7,-6]};
      const point=positions[t.id];
      if(point)return make(t,[point[0]/100,.46+point[1]/100,point[2]/100],[0,0,-1],.42);
    }
    if(k==='invictaboard')return scaled(.40,.85,-.36,[0,0,1],1);
    if(k==='cctstrip'||k==='led'&&f==='strip')return scaled(-.43,.43+(k==='cctstrip'?[.13,0,-.13]:[.12,-.12])[ids.indexOf(t.id)],.085,[0,0,1],.40);
    if(k==='led'&&f==='series-module')return scaled(t.id==='L'?-.31:.31,.46,.095,[0,0,1],.50);
    if(k==='proximity')return scaled((ids.indexOf(t.id)-1)*.16,.06,.045,[0,-.45,.893],.44);
    if(k==='pwmcontrol'){const left=t.id==='+'||t.id==='-';return scaled(left?-.48:.48,(t.id==='+'||t.id==='W')?.62:.33,0,[left?-1:1,0,0],.64);}
    if(k==='floatvalve')return scaled((ids.indexOf(t.id)-1)*.18,.46,-.31,[0,0,-1],.74);
    if(k==='callchime')return scaled((ids.indexOf(t.id)-1.5)*.19,.21,-.095,[0,0,1],.68);
    if(k==='terminal'&&f==='comb-busbar')return scaled((ids.indexOf(t.id)-1.5)*.24,.84,.02,[0,1,0],.65);
    if(k==='terminal'&&f==='lever-connector')return scaled((ids.indexOf(t.id)-1.5)*.24,.15,-.025,[0,-.55,.835],.65);
    if(k==='selector'&&f==='float-changeover'){
      const port=scaled((ids.indexOf(t.id)-1)*.085,.052,-.12,[0,-.5,-.866],.52);
      const purpose=t.id==='COM'?'COM is the common wire. The float connects it to A or B as it moves.'
        :t.id==='A'?'A joins COM in the first float position.':'B joins COM in the second float position.';
      return {...port,purpose};
    }
    if(k==='switch'&&f==='door-contact'){
      const port=scaled(-.20+(t.id==='COM'?-.075:.075),.18,-.25,[0,0,-1],.58);
      const purpose=t.id==='COM'?'The feed comes into COM. Move the door and watch the contact open or close.'
        :'When the door contact closes, this terminal joins COM and passes the feed on.';
      return {...port,purpose};
    }
    if(k==='pushbutton'&&f==='bell-push')return scaled((ids.indexOf(t.id)-1)*.18,.43,-.28,[0,0,-1],.65);
    if(k==='driver'&&f==='constant-current'){const ac=['L','N','PE'].includes(t.id),i=(ac?['L','N','PE']:['+','-']).indexOf(t.id);return scaled(ac?-.47:.47,.25+i*.21,-.02,[ac?-1:1,0,0],.66);}
    if(k==='fuse'&&f==='dc-fuse')return scaled(0,t.id==='IN'?.085:.84,-.09,t.id==='IN'?[0,-.55,.835]:[0,1,0],.71);
    const center = (row: string[], spacing: number) => (row.indexOf(t.id)-(row.length-1)/2)*spacing;
    const din = (upper: boolean, width=x) => make(t,[width,(upper?1.23:.235)*sy,.23*sz],
      upper?[0,.8,.6]:[0,-.35,Math.sqrt(1-.35**2)]);
    const front = (depth:number,scale=terminalScale) => make(t,[x,y,depth*sz],[0,0,1],scale);
    switch(component.type){
      case 'fuse':
        return din(group==='Supply');
      case 'spd': return din(t.id!=='PE',t.id==='PE'?0:(t.id==='L'?-.13:.13)*sx);
      case 'plug':
        if(['L','N','PE'].includes(t.id)){
          // Front view of the protruding pins: earth above the two sleeved pins.
          const phase=t.id==='L',earth=t.id==='PE';
          return make(t,[(earth?0:phase?-.2:.2)*sx,(earth?.91:.64)*sy,(earth?.523:.439)*sz],[0,0,1],.58);
        }
        break;
      case 'plug3':
        if(['PE','L1IN','L2IN','L3IN','NIN'].includes(t.id)){
          const angle=Math.PI-['PE','L1IN','L2IN','L3IN','NIN'].indexOf(t.id)*Math.PI*2/5;
          return make(t,[Math.sin(angle)*.14*sx,(.75+Math.cos(angle)*.14)*sy,.494*sz],[0,0,1],.42);
        }
        break;
      case 'contactor':case 'overload':case 'relay':
        if(group==='Power input'||group==='Power output')return din(group==='Power input');
        if(group==='Coil' && component.type!=='contactor')return din(true);
        if(component.type==='relay')return din(false);
        // Auxiliary and coil connections form a shallow front extension of the contact block.
        return front(.39,.85);
      case 'motor':case 'motor3':case 'pump':{
        if(component.type==='motor' && /shutter|compressor|gate|conveyor/.test(variant))return front(.39);
        const row=component.type==='motor3'?(t.id==='PE'?['PE']:group==='Winding starts'?['U1','V1','W1']:['U2','V2','W2']):ids;
        const boardX=t.id==='PE'&&component.type==='motor3'?-.41*sx:((component.type==='motor3'?-.02:-.07)*sx+center(row,Math.max(.15,.205*sx)));
        return make(t,[boardX,1.19*sy,group==='Winding starts'?-.105*sz:group==='Winding ends'?.115*sz:0],[0,1,0],.83);
      }
      case 'meter':{
        if(t.id==='PE'||t.id==='PEOUT')return make(t,[.54*sx,(t.id==='PE'?.47:.27)*sy,.218*sz],[0,0,1],.79);
        return make(t,[center(['L','LOUT','N','NOUT'],.18*sx),.28*sy,.282*sz],[0,0,1],.79);
      }
      case 'switch':case 'switch2':case 'intermediate': {
        const side=component.params.gangModule;
        const upsideDown=side==='right'?-1:1;
        const top=['COM','A','B'].includes(t.id);
        const xOffset=component.type==='switch'?(t.id==='OUT'?-.058:0):component.type==='switch2'?(t.id==='COM'?0:t.id==='T1'?-.059:.059):['A','C'].includes(t.id)?-.067:.067;
        return make(t,[xOffset*upsideDown,.65+(top?.116:-.134)*upsideDown,-.14],[0,0,-1],.58);
      }
      case 'lamp':
        if(!/batten|strip|sign|fluorescent|downlight|spot|\bled\b/.test(variant)||/bulb/.test(variant))
          return make(t,[t.id==='L'?-.067:t.id==='N'?.067:0,t.id==='PE'?.38:.269,-.180],[0,0,-1],.58);
        break;
      case 'source':case 'source3':return front(.284);
      case 'panel':return front(.175);
      case 'rose': {
        const row=['N','NOUT','N3','LOOP1','LOOP2','LOOP3','L','LOUT'];
        const i=row.indexOf(t.id);
        const group=i<0?'Protective earth':i<3?'Neutral':i<6?'Permanent loop':'Lamp line';
        // The transparent 80 mm rose has three separate brass links in one row.
        const coordinate:Vec3=i<0?[t.id==='PE'?-.027:.027,.148,.125]:[(i-3.5)*.082+(i<3?-.014:i>5?.014:0),.664,.125];
        return {...make(t,coordinate,[0,0,1],i<0?.35:.55),group};
      }
      case 'junction':return front(.125);
      case 'terminal':case 'neutralbar':case 'earthbar':return front(.135);
      case 'vfd':case 'plc':case 'safetyRelay':return front(.31);
      case 'shower':case 'chime':return front(.18);
      case 'ev':return front(.272);
      case 'boiler':case 'heatpump':return make(t,[x,.235*sy,.263*sz],[0,0,1]);
      case 'transformer':case 'dcsupply':case 'driver':return front(.21);
      case 'heater':
        if(/immersion/.test(variant))return make(t,[x,1.32*sy,t.id==='PE'?.21*sz:-.08*sz],[0,1,0],.85);
        break;
      case 'valve':case 'valve3':{
        // The flying flex lands on a separate row of accessible connection points.
        return make(t,[center(ids,.17),.205*sy,.49*sz],[0,0,1],.78);
      }
      case 'cable':{
        const side=t.id==='IN'?-1:1;
        return make(t,[side*.67*sx,.60*sy,0],[side,0,0],.7);
      }
    }
    return make(t,[x,y,z],[0,0,-1]);
  });
}

/** Local direction from the equipment towards a clear inspection camera. */
export function terminalInspectionDirection(component: Pick<ComponentInstance, 'type'|'label'|'variant'|'params'>, definition: ComponentDefinition, terminalId?: string): Vec3 {
  const terminals=getComponentTerminals(component,definition);
  const selected=terminalId ? terminals.filter(t=>t.id===terminalId) : terminals;
  const sum:Vec3=[0,0,0];
  for(const t of selected)for(let axis=0;axis<3;axis++)sum[axis]+=(t.entryDirection??[0,0,-1])[axis];
  if(Math.hypot(...sum)<.1)return [.3,.35,.89];
  // Look slightly down across front/rear inscriptions and across an upward-facing motor board.
  const n=Math.hypot(...sum);
  const y=sum[1]/n;
  const view:Vec3=[sum[0]/n+.13,y<-.8 && terminalId && dinPort(component.type,terminalId) ? y : Math.max(.23,y),sum[2]/n];
  if(Math.abs(view[2])<.18)view[2]=.25;
  const length=Math.hypot(...view);return view.map(v=>v/length) as Vec3;
}
