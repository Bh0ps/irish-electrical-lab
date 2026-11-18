import { COMPONENTS } from './components.ts';
import { boardPosition, isBoard, mountError, normalizeBoardMounts } from './board-assembly.ts';
import type { CircuitDocument,ComponentInstance,Parameters,TerminalRole,Vec3,Wire } from './types.ts';

/** Install actual independent graph devices. No implicit connection is created by a rail or by installation. */
export function populateBoard(doc:CircuitDocument,boardId:string):CircuitDocument{
  const board=doc.components.find(c=>c.id===boardId);
  if(!board||!isBoard(board.type))throw Error('Choose a distribution board.');
  if(doc.components.some(c=>c.mount?.board===boardId))throw Error('This board already contains equipment.');
  const industrial=board.type==='invictaboard',phase=industrial?'three':'single';
  if(doc.components.some(c=>['source','source3'].includes(c.type)))throw Error('Open a blank Sandbox and place a board for this example. It includes its own supply.');
  const parts=[...doc.components],wires=[...doc.wires],ids=new Set([...parts,...wires].map(c=>c.id));
  let prefix=board.id+'-training';while([...ids].some(id=>id.startsWith(prefix+'-')))prefix+='x';
  function add(id:string,type:string,label:string,p:Vec3,row?:number,slot=0,variant?:string,params:Parameters={}){
    const c:ComponentInstance={id:prefix+'-'+id,type,label,params:{...COMPONENTS[type].defaults,...params},rotation:board!.rotation,position:boardPosition(board!,p),variant};
    if(row!==undefined){c.mount={board:boardId,row,slot};const error=mountError(parts,c,c.mount);if(error)throw Error(error);}
    parts.push(c);return c.id;
  }
  function wire(a:string,ta:string,b:string,tb:string,role:TerminalRole){const w:Wire={id:prefix+'-wire-'+wires.length,from:{component:a,terminal:ta},to:{component:b,terminal:tb},role,resistance:.012,bends:[]};wires.push(w);}
  const width=COMPONENTS[board.type].size[0],supply=add('supply',industrial?'source3':'source',industrial?'400 V three-phase supply':'240 V domestic supply',[-width/2-2,0,0]);
  const incoming=add('incoming',industrial?'rcd3':'rcd',industrial?'Four-pole incoming RCCB':'Lighting group RCCB',[0,0,0],industrial?4:0,0);
  const neutral=add('neutral','neutralbar','Outgoing neutral bar',[0,0,0],5),earth=add('earth','earthbar','Protective-earth bar',[0,0,0],6);
  wire(supply,'N',incoming,'NIN','N');wire(incoming,'NOUT',neutral,'1','N');wire(supply,'PE',earth,'1','PE');
  if(industrial)wire(earth,'4',boardId,'PE','PE');
  const phases=industrial?['L1','L2','L3'] as const:['L'] as const;
  for(const [index,line] of phases.entries()){
    wire(supply,line,incoming,line+'IN',line);
    const comb=add('comb-'+line,'terminal',industrial?line+' feeder bar':'Lighting supply comb',[0,0,0],7+index,0,'comb-busbar');
    wire(incoming,line+'OUT',comb,'1',line);
    const branchCount=industrial?1:2;
    for(let i=0;i<branchCount;i++){
      const label=industrial?'Phase '+(index+1)+' pilot':i?'Hall lighting':'Kitchen lighting';
      const breaker=add('breaker-'+index+'-'+i,'mcb',label+' MCB',[0,0,0],industrial?2:1,industrial?index:i,undefined,{currentRating:6});
      const load=add('lamp-'+index+'-'+i,'lamp',label,[width/2+2.1,0,2.2*(industrial?index:i)],undefined,0,'bulb',{watts:industrial?25:60,nominalVoltage:industrial?230:240});
      wire(comb,String(i+2),breaker,'IN',line);wire(breaker,'OUT',load,'L',line);
      wire(neutral,String(2+index+i),load,'N','N');
      wire(earth,String(industrial?2+index:2+i),load,'PE','PE');
    }
  }
  if(parts.length>80||wires.length>300)throw Error('The example exceeds the Sandbox limit of 80 items or 300 conductors.');
  return normalizeBoardMounts({...doc,supply:{...doc.supply,enabled:true,phase,voltage:industrial?400:240,frequency:50},components:parts,wires});
}
export const COURSE_BOARD_ID='course-enclosure';
export const COURSE_BOND_ID='course-enclosure-bond';
export function furnishCourseBoard(doc:CircuitDocument):CircuitDocument {
  if(doc.lessonId!==2&&doc.lessonId!==53)return doc;
  const commercial=doc.lessonId===53;
  const board:ComponentInstance={id:COURSE_BOARD_ID,type:commercial?'invictaboard':'gammaboard',label:commercial?'Four-way TP&N enclosure':'Two-row domestic enclosure',params:{doorOpen:true,frontOff:false},position:[0,0,-1.5],rotation:0};
  const outside=doc.components.filter(c=>!['source','source3','rcd','mcb','mcb3'].includes(c.type));
  const components=doc.components.map(c=>{
    if(['source','source3'].includes(c.type))return {...c,position:boardPosition(board,[-(commercial?7.1:4.65),0,0])};
    if(c.type==='rcd'||c.type==='mcb'||c.type==='mcb3')return {...c,mount:{board:board.id,row:commercial?4:c.type==='rcd'?0:1,slot:c.id==='branch2'?2:0}};
    const i=outside.findIndex(x=>x.id===c.id);
    return {...c,position:boardPosition(board,[commercial?7.2:4.8,0,-2+i*2.8])};
  });
  const wires=commercial?[...doc.wires,{id:COURSE_BOND_ID,from:{component:'supply',terminal:'PE'},to:{component:board.id,terminal:'PE'},role:'PE' as const,resistance:.01,bends:[]}]:doc.wires;
  // Suspend the steel wall board above the bench so its bottom gland plate
  // can receive the distribution cables. The loads and source stay on the bench.
  const enclosure=commercial?{...board,position:[board.position[0],.55,board.position[2]] as Vec3}:board;
  return normalizeBoardMounts({...doc,components:[...components,enclosure],wires});
}
