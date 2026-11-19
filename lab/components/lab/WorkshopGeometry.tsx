import React from 'react';
import { dinForm } from '../../lib/din-devices';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { EquipmentProps } from '../../lib/Equipment';
import type { Vec3 } from '../../lib/types';
import { WORKSHOP_TOOLS } from '../../lib/workshop-variants';
import { ToolGeometry } from './ToolGeometry';
import { boardSidePanels } from '../../lib/board-assembly';
const white='#e8e9e2', steel='#a3aaac', dark='#383e40', copper='#c78950', brass='#b49a54', pcb='#416c55', orange='#eb8132';
const shapes=new Map<string,THREE.BufferGeometry>();
const surfaces=new Map<string,THREE.MeshStandardMaterial>();
function geo(id:string,make:()=>THREE.BufferGeometry){if(!shapes.has(id))shapes.set(id,make());return shapes.get(id)!;}
function mat(c:string){if(!surfaces.has(c))surfaces.set(c,new THREE.MeshStandardMaterial({color:c,metalness:[steel,copper,brass].includes(c)?.78:.04,roughness:c==='#78909a'?.19:c===steel?.36:.52,transparent:c==='#78909a',opacity:c==='#78909a'?.32:1,depthWrite:c!=='#78909a'}));return surfaces.get(c)!;}
function Box({p,s,c=white,rad=.012}:{p:Vec3;s:Vec3;c?:string;rad?:number}){return <mesh position={p} geometry={geo('b'+s.join()+rad,()=>new RoundedBoxGeometry(...s,1,Math.min(rad,...s.map(v=>v*.40))))} material={mat(c)}/>;}
function Pin({p,r,h,c=steel,n=24,axis='z'}:{p:Vec3;r:number;h:number;c?:string;n?:number;axis?:'x'|'y'|'z'}){return <mesh position={p} rotation={axis==='z'?[Math.PI/2,0,0]:axis==='x'?[0,0,Math.PI/2]:[0,0,0]} geometry={geo('c'+[r,h,n].join(),()=>new THREE.CylinderGeometry(r,r,h,n))} material={mat(c)}/>;}
function Screw({p,r=.07}:{p:Vec3;r?:number}){return <group position={p}><Pin p={[0,0,0]} r={r} h={r*.32}/><Box p={[0,0,r*.17]} s={[r*1.34,r*.23,.004]} c={dark}/><Box p={[0,0,r*.171]} s={[r*.22,r*.89,.004]} c={dark}/></group>;}
type ScheduleEntry=[number,number,number,string];
function CircuitSchedule({entries,industrial,z}:{entries:ScheduleEntry[];industrial:boolean;z:number}){
 const texture=React.useMemo(()=>{
   if(typeof document==='undefined')return null;
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=256;
   const g=canvas.getContext('2d');if(!g)return null;
   g.fillStyle='#f2f1e6';g.fillRect(0,0,640,256);g.strokeStyle='#657776';g.lineWidth=3;g.strokeRect(4,4,632,248);
   g.fillStyle='#25413c';g.fillRect(6,5,628,43);g.fillStyle='#fff';g.font='bold 26px Arial';g.fillText(industrial?'TP&N   •   CIRCUIT SCHEDULE':'CIRCUIT SCHEDULE',18,35);
   const lines=entries.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,5);
   g.font='23px Arial';g.fillStyle='#202824';
   for(let i=0;i<5;i++){g.fillStyle='#c5c9bf';g.fillRect(15,82+i*39,609,1);const e=lines[i];if(!e)continue;
     const location=e[0]===4?'IN':e[0]===2?'L':e[0]===3?'R':e[0]===0?'A':'B';
     g.fillStyle='#202824';g.textAlign='left';g.fillText(location+(e[1]+1),18,76+39*i);g.fillText(e[3],86,76+39*i,517);
   }
   const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
 },[entries,industrial]);React.useEffect(()=>()=>texture?.dispose(),[texture]);
 return texture?<mesh position={[0,industrial?4.12:3.61,z+.044]}><planeGeometry args={industrial?[2.2,.88]:[1.83,.73]}/><meshStandardMaterial map={texture} roughness={.79}/></mesh>:null;
}
/** The dead-front cut-outs are filled only where the actual rail has a spare position. */
export function InstalledHardware(props:EquipmentProps){
 const {component,definition,view}=props;
 const entries=React.useMemo<ScheduleEntry[]>(()=>props.filledWays?JSON.parse(props.filledWays):[],[props.filledWays]);
 if(component.mount&&definition.model==='protection'&&!dinForm(component.type)&&view==='normal'){
   const [w,h,d]=definition.size;
   return <group userData={{partId:'cover'}} onClick={e=>{e.stopPropagation();props.onPart('cover');}}>
    <Box p={[0,h*.495,d*.43]} s={[w*(['mcb','fuse'].includes(component.type)?.405:.585),h*.43,d*.34]} c="#e0e1da" rad={.025}/>
   </group>;
 }
 if(!['gammaboard','invictaboard'].includes(component.type)||component.params.frontOff||view!=='normal')return null;
 const industrial=component.type==='invictaboard',taken=new Set(entries.flatMap(([row,slot,count])=>Array.from({length:count},(_,i)=>row+'/'+(i+slot))));
 const strips=industrial?[{row:2,count:6,x:-1.67,y:7.4,z:.77,r:Math.PI/2},{row:3,count:6,x:1.67,y:7.4,z:.77,r:-Math.PI/2},{row:4,count:4,x:-.72,y:1.48,z:.77,r:0}]:[{row:0,count:13,x:-2.34,y:4.82,z:.64,r:0},{row:1,count:13,x:-2.34,y:2.32,z:.64,r:0}];
 return <group userData={{partId:'shield'}} onClick={e=>{e.stopPropagation();props.onPart('shield');}}><CircuitSchedule entries={entries} industrial={industrial} z={industrial?.77:.64}/>{strips.flatMap(s=>Array.from({length:s.count},(_,i)=>{
    if(taken.has(s.row+'/'+i))return null;
    const offset=(i+.5)*.36;
    return <group key={s.row+'/'+i} position={[s.x+(s.r?0:offset),s.y-(s.r?offset:0),s.z+.022]} rotation={[0,0,s.r]}>
      <Box p={[0,0,0]} s={[.354,.884,.112]} c="#dadcd4" rad={.013}/>
      <Box p={[0,-.30,.061]} s={[.19,.014,.008]} c="#a2aaa1"/>
    </group>;
 }))}</group>;
}
function Body({children,id='body',detail,purpose}:{children:React.ReactNode;id?:string;detail:string;purpose:string}){return <group userData={{partId:id,detailId:detail,detailPurpose:purpose,detailRevision:3}}>{children}</group>;}
function Rail({length,device=false}:{length:number;device?:boolean}){
 return <group scale={[1,device?35/21.5:1,1]}><Box p={[0,0,-.045]} s={[length,.28,.045]} c={steel}/>{[-1,1].map(sign=><group key={sign}><Box p={[0,sign*.14,.015]} s={[length,.035,.14]} c={steel}/><Box p={[0,sign*.17,.079]} s={[length,.09,.033]} c={steel}/></group>)}{Array.from({length:Math.floor(length/.46)},(_,i)=><Box key={i} p={[-length/2+.26+i*.46,0,-.020]} s={[.20,.062,.01]} c={dark}/>)}</group>;
}
function Board(props:EquipmentProps){
 const industrial=props.component.type==='invictaboard',[w,h,d]=props.definition.size,z=d/2,sz=.082,back=-z+.13,skin=industrial?'#e1e3db':'#ecebe4',door=props.component.params.doorOpen!==false||props.view!=='normal',front=props.component.params.frontOff||props.view!=='normal';
 const shieldZ=industrial?.77:.64;
 const rails=industrial?[{x:-1.67,y:6.32,a:Math.PI/2,l:2.36},{x:1.67,y:6.32,a:-Math.PI/2,l:2.36},{x:0,y:1.48,a:0,l:1.86}]:[{x:0,y:4.82,a:0,l:4.82},{x:0,y:2.32,a:0,l:4.82}];
 // The dead front is built around openings. The strips leave the breaker toggles accessible.
 const xs=industrial?[-w/2,-2.12,-1.22,-.72,.72,1.22,2.12,w/2]:[-w/2,-2.34,2.34,w/2];
 const ys=industrial?[.03,1.03,1.93,5.24,7.40,h-.03]:[.03,1.87,2.77,4.37,5.27,h-.03];
 return <>
 <Body detail="enclosure-with-cable-entry" purpose="The back pan supports the rails and contains the wiring. Removable cable-entry plates sit at the top and bottom.">
 <Box p={[0,h/2,back]} s={[w-.16,h-.16,.13]} c={skin}/>
 {[-1,1].map(sign=><group key={sign}>{boardSidePanels(props.component.type,h,d).map(([lo,hi,b,f])=><Box key={lo+'-'+b} p={[sign*(w/2-sz/2),(lo+hi)/2,(b+f)/2]} s={[sz,hi-lo,f-b]} c={skin}/>)}
 {[.15,.85].map(t=><Box key={t} p={[sign*(w/2-.20),t*h,back+.14]} s={[.22,.38,.13]} c={steel}/>)}</group>)}
 {[.065,h-.065].map(y=><group key={y}><Box p={[0,y,-.68*z]} s={[w-.12,.10,.64*z]} c={skin}/><Box p={[0,y,.67*z]} s={[w-.12,.10,.66*z]} c={skin}/>
 {[-1,0,1].map(i=><Box key={i} p={[i*(w/2-.24),y,0]} s={[.34,.10,.75*z]} c={skin}/>)}{[-1,1].flatMap(i=>[-1,1].map(j=><Box key={i+'-'+j} p={[i*w*.25,y,j*z*.30]} s={[w*.41,.055,.07]} c={industrial?'#b4bcba':'#cdcec6'}/>))}</group>)}
 </Body>
 <Body id="rail" detail="top-hat-device-rails" purpose="Devices clip onto the steel top-hat section. Each numbered position occupies one 18 mm module.">
 {rails.map((a,i)=><group key={i} position={[a.x,a.y,industrial?-.31:-.44]} rotation={[0,0,a.a]}><Rail length={a.l} device/></group>)}
 {[-1,1].map(s=><group key={s} position={[s*(industrial?2.82:1.25),industrial?9.08:6.85,-.46]}><Rail length={1.48}/></group>)}
 </Body>
 <group userData={{partId:'shield',boardShield:true,detailId:'slotted-dead-front',detailPurpose:'The removable insulating front leaves access to the device operating handles.'}} visible={props.authoring||!front}>
 {xs.slice(0,-1).flatMap((x,i)=>ys.slice(0,-1).map((y,j)=>{const cx=(x+xs[i+1])/2,cy=(y+ys[j+1])/2;
 const hole=industrial?(Math.abs(cx)>1.22&&Math.abs(cx)<2.12&&cy>5.24&&cy<7.40||Math.abs(cx)<.72&&cy>1.03&&cy<1.93):(Math.abs(cx)<2.34&&(cy>1.87&&cy<2.77||cy>4.37&&cy<5.27));
 return hole?null:<Box key={i+'-'+j} p={[cx,cy,shieldZ]} s={[xs[i+1]-x,ys[j+1]-y,.072]} c={skin} rad={.003}/>;}))}
 {[-1,1].flatMap(x=>[.46,h-.46].map(y=><Screw key={x+'-'+y} p={[x*(w/2-.25),y,shieldZ+.048]}/>))}
 {rails.map((a,i)=><group key={i} position={[a.x,a.y,shieldZ+.048]} rotation={[0,0,a.a]}><Box p={[0,-.52,0]} s={[a.l*.95,.19,.018]} c="#c2c8c3"/>{Array.from({length:Math.floor(a.l/.36)},(_,j)=><Box key={j} p={[-a.l/2+.23+.36*j,-.52,.018]} s={[.24,.085,.009]} c="#f5f5ed"/>)}</group>)}
 </group>
 <group position={[-w/2+.075,h/2,z-.016]} rotation={[0,props.authoring?0:door?-1.69:0,0]} userData={{partId:'door',boardDoor:true,detailId:'hinged-panel-door',detailPurpose:'The hinged outer door protects the controls. A separate dead front covers the terminal wiring.'}}>
 <Box p={[w/2-.075,0,.05]} s={[w-.12,h-.10,.105]} c={industrial?skin:'#78909a'} rad={.04}/>
 {[-1,1].map(s=><group key={s}><Box p={[w/2-.075,s*(h/2-.14),.14]} s={[w-.28,.11,.12]} c={skin}/><Pin p={[0,s*.32*h,-.012]} r={.095} h={.52} axis="y" c={steel}/></group>)}
 <Box p={[w-.44,0,.13]} s={[.37,industrial?.78:.47,.10]} c={industrial?dark:'#c2c4bb'}/>{industrial&&<><Pin p={[w-.44,.11,.203]} r={.085} h={.025} c={steel}/><Box p={[w-.44,.11,.219]} s={[.095,.015,.01]} c={dark}/></>}
 </group></>;
}
function Strip({warmCool,single}:{warmCool:boolean;single:boolean}){
 if(!warmCool&&!single)return <>
   <Body detail="flexible-copper-tracks" purpose="The cut mark runs between the two copper pads.">
     <Box p={[0,.43,.001]} s={[1,.08,.002]} c="#a98050"/><Box p={[0,.43,.0024]} s={[1,.08,.0007]} c="#e6e4da"/>
     {[-.019,.019].map(y=><Box key={y} p={[.488,.43+y,.0031]} s={[.024,.0168,.0008]} c={copper}/>)}
   </Body>
   <Body detail="surface-mount-bodies" purpose="The white packages hold the LEDs. The dark parts are resistors.">
     {Array.from({length:7},(_,i)=><Box key={i} p={[(i-3)/7,.43,.0085]} s={[.028,.035,.0118]} c="#e6e5dc"/>)}
     {[-.357,.214].map(x=><Box key={x} p={[x,.43,.0063]} s={[.016,.031,.0065]} c={dark}/>)}
   </Body>
   <Body id="emitter" detail="smd-led-packages" purpose="Seven LED windows light one cut section of this tape.">
     {Array.from({length:7},(_,i)=><Box key={i} p={[(i-3)/7,.43,.0141]} s={[.022,.026,.0018]} c="#efd061"/>)}
   </Body>
 </>;
 if(single)return <><Body detail="aluminium-led-board" purpose="The aluminium-backed emitter board conducts heat from the LED package. Separate copper pads connect the two ends of its series current path."><Pin p={[0,.47,-.03]} r={.43} h={.17} n={6}/><Pin p={[0,.47,.057]} r={.40} h={.015} n={6} c={white}/>{[-.31,.31].map(x=><Box key={x} p={[x,.46,.083]} s={[.10,.105,.018]} c={copper}/>)}</Body><Body id="emitter" detail="central-emitter-module" purpose="Current flows through the central emitter while the board beneath it spreads heat."><Pin p={[0,.47,.10]} r={.155} h={.075} c={white}/><Pin p={[0,.47,.155]} r={.115} h={.04} c="#eccf70"/></Body></>;
 return <><Body detail="flexible-copper-tracks" purpose="Copper pads and continuous foil tracks carry the supply along the flexible base. Each repeating section ends at the printed cut mark."><Box p={[0,.43,-.12]} s={[.98,.44,.28]} c="#e9e2c6"/>
 {[-.16,.16].map(y=><Box key={y} p={[0,.43+y,.037]} s={[.97,.027,.021]} c={copper}/>)}
 {[-.43,0,.43].flatMap(x=>(warmCool?[-.13,0,.13]:[-.12,.12]).map(y=><Box key={x+'-'+y} p={[x,.43+y,.06]} s={[.052,.061,.028]} c={copper}/>))}
 {[-.27,.24].map(x=><Box key={x} p={[x,.43,.071]} s={[.039,.12,.045]} c={dark}/>)}</Body>
 <Body id="emitter" detail="smd-led-packages" purpose="Each surface-mounted LED emits through a phosphor window. Separate warm and cool packages on a tunable strip use separate return paths.">
 {[-.33,-.15,.15,.33].flatMap(x=>(warmCool?[-.078,.078]:[0]).map(y=><group key={x+'-'+y} userData={warmCool?{ledChannel:y>0?'C':'W',partId:'emitter'}:{}}><Box p={[x,.43+y,.070]} s={[.073,.115,.08]} c="ivory"/><Box p={[x,.43+y,.119]} s={[.052,.082,.025]} c={y>0?'#f2edc7':'#e8c763'}/></group>))}</Body></>;
}
function Elv({component:c,definition,view,authoring}:EquipmentProps){
 const v=c.variant??'',type=c.type,cover=authoring||view==='normal';
 const screw=(x:number,y:number)=><Screw key={x+'-'+y} p={[x,y,.39]} r={.032}/>;
 let parts:React.ReactNode;
 if(type==='led'||type==='cctstrip')parts=<Strip warmCool={type==='cctstrip'} single={v==='series-module'}/>;
 else if(type==='terminal'&&v==='comb-busbar')parts=<Body id="terminals" detail="common-copper-teeth" purpose="Each tooth is connected to the same insulated copper spine. Four numbered ports expose that single electrical node."><Box p={[0,.36,-.02]} s={[.97,.28,.44]} c="#d9d8cc"/>{[-.36,-.12,.12,.36].map(x=><Box key={x} p={[x,.65,.02]} s={[.095,.39,.11]} c={copper}/>)}</Body>;
 else if(type==='terminal')parts=<Body detail="lever-spring-connector" purpose="Separate levers lift the spring in each opening of the common connector. The copper strip joins all four positions."><Box p={[0,.46,-.12]} s={[.98,.71,.52]} c="#cbd3c7"/><Box p={[0,.35,.12]} s={[.92,.11,.11]} c={copper}/>{[-.36,-.12,.12,.36].map(x=><group key={x}><Box p={[x,.54,.21]} s={[.185,.49,.20]} c={orange}/><Pin p={[x,.75,.12]} r={.075} h={.19} axis="x"/>{[0,1,2].map(i=><Box key={i} p={[x,.39+i*.044,.32]} s={[.145,.011,.012]} c="#b65c22"/>)}</group>)}</Body>;
 else if(type==='proximity')parts=<Body id="sensing" detail="threaded-proximity-barrel" purpose="The sensing face is at the end of the threaded metal barrel. Two locknuts hold its position and the cable gland supports the three-wire lead."><Pin p={[0,.51,0]} r={.28} h={.65} axis="y"/>{Array.from({length:15},(_,i)=><Pin key={i} p={[0,.24+i*.037,0]} r={.30} h={.013} axis="y"/>)}{[.37,.58].map(y=><Pin key={y} p={[0,y,0]} r={.42} h={.075} axis="y" n={6}/>)}<Pin p={[0,.846,0]} r={.286} h={.08} axis="y" c="#387a93"/><Pin p={[0,.17,0]} r={.21} h={.12} axis="y" c={dark}/>{['#6e402a','#24292c','#487baf'].map((color,i)=><Pin key={color} p={[(i-1)*.16,.102,.045]} r={.025} h={.10} axis="y" c={color}/>)}</Body>;
 else if(type==='switch'&&v==='door-contact')parts=<Body detail="reed-and-door-magnet" purpose="The magnet mounts on the moving door and the wired reed unit on the frame. Changing their separation changes the contact state.">{[-.20,.24].map((x,i)=><group key={x} userData={i?{partId:'actuator',animation:'translate',offPosition:[.13,0,0],onPosition:[0,0,0]}:{}}><Box p={[x,.5,0]} s={[i?.29:.43,.88,.46]} c={white}/>{[.18,.83].map(y=><Screw key={y} p={[x,y,.235]} r={.041}/>)}<Box p={[x+(i?-.105:.167),.48,.239]} s={[.029,.085,.009]} c="#9da29a"/></group>)}</Body>;
 else if(type==='switch'||type==='selector')parts=<Body id="actuator" detail="float-and-cable-pivot" purpose="The buoyant body tips on its flexible cable and works the enclosed changeover contact."><Box p={[0,.56,0]} s={[.88,.64,.64]} c="#e5b63c" rad={.17}/><Box p={[0,.44,0]} s={[.91,.12,.65]} c="#4d5660" rad={.046}/><Pin p={[0,.19,0]} r={.11} h={.24} axis="y" c={dark}/><Pin p={[0,.064,0]} r={.065} h={.12} axis="y" c={dark}/></Body>;
 else if(type==='pushbutton')parts=<Body detail="bell-push-weather-plate" purpose="A sprung low-voltage push and recessed label holder are fitted to the outdoor faceplate."><Box p={[0,.50,0]} s={[.80,.95,.55]} c={white}/><Box p={[0,.37,.284]} s={[.54,.14,.029]} c="#bec6c0"/><Pin p={[0,.64,.30]} r={.177} h={.08} c={steel}/><group userData={{partId:'actuator',animation:'translate',offPosition:[0,0,0],onPosition:[0,0,-.025]}}><Pin p={[0,.64,.355]} r={.129} h={.06} c="#edeee5"/></group>{[.12,.9].map(y=><Screw key={y} p={[0,y,.28]} r={.032}/>)}</Body>;
 else if(type==='floatvalve')parts=<><Body detail="three-point-valve-drive" purpose="The motor and gear train move the valve spindle in the direction requested at OPEN or CLOSE."><Pin p={[0,.235,0]} r={.16} h={.81} axis="x" c={brass}/>{[-.36,.36].map(x=><Pin key={x} p={[x,.235,0]} r={.21} h={.16} axis="x" n={6} c={brass}/>)}<Pin p={[0,.40,0]} r={.16} h={.20} axis="y" c={brass}/><Box p={[0,.68,0]} s={[.85,.44,.68]} c={dark}/></Body><Body id="actuator" detail="position-indicator" purpose="The indicator turns with the valve spindle."><Pin p={[0,.69,.35]} r={.155} h={.045} c="#eeeadd"/><group position={[0,.69,.385]} userData={{partId:'actuator',animation:'valvePosition',axis:'z'}}><Box p={[0,.063,0]} s={[.047,.12,.024]} c={orange}/></group></Body></>;
 else if(type==='callchime')parts=<><Body detail="two-note-sound-bars" purpose="The case holds the sound bars and a solenoid. The model distinguishes front and rear call inputs."><Box p={[0,.49,-.32]} s={[.96,.94,.17]} c={white}/>{[-.26,.26].map(x=><group key={x}><Box p={[x,.52,-.13]} s={[.095,.66,.065]} c={steel}/>{[.28,.76].map(y=><Pin key={y} p={[x,y,-.076]} r={.033} h={.035} c={dark}/>)}</group>)}<Pin p={[0,.51,-.13]} r={.093} h={.52} axis="x" c={copper}/></Body><group visible={cover} userData={{partId:'cover',restPosition:[0,0,0]}}><Box p={[0,.5,.20]} s={[.97,.93,.27]} c={white}/>{Array.from({length:7},(_,i)=><Box key={i} p={[0,.37+i*.046,.343]} s={[.61,.019,.009]} c="#878c83"/>)}</group></>;
 else if(type==='fuse')parts=<Body id="fuse" detail="dc-cartridge-and-holder" purpose="Metal end caps on the replaceable fuse sit between two spring jaws in an insulated carrier."><Box p={[0,.45,-.22]} s={[.77,.80,.38]} c={dark}/><Pin p={[0,.48,.06]} r={.17} h={.50} axis="y" c="#d8d7c8"/>{[.23,.72].map(y=><group key={y}><Pin p={[0,y,.06]} r={.18} h={.10} c={steel} axis="y"/><Box p={[0,y,-.045]} s={[.48,.072,.20]} c={brass}/></group>)}</Body>;
 else parts=<><Body detail="control-housing-and-terminals" purpose="Separate input and output positions identify the supply side and load side. The cover protects the electronics and the fixing tabs carry the enclosure."><Box p={[0,.47,-.06]} s={[.93,.72,.61]} c={type==='pwmcontrol'?'#50575b':white}/>{[-.42,.42].map(x=><group key={x}><Box p={[x,.47,-.29]} s={[.15,.94,.12]} c={white}/>{[.09,.85].map(y=><Screw key={y} p={[x,y,-.22]} r={.031}/>)}</group>)}<Box p={[0,.50,.26]} s={[.65,.42,.028]} c={white}/>{Array.from({length:5},(_,i)=><Box key={i} p={[0,.60-i*.040,.278]} s={[i%2?.35:.48,.008,.008]} c="#818b83"/>)}{[-.35,.35].map(x=>screw(x,.72))}</Body><Body id="electronics" detail="output-driver-board" purpose="The simplified internal driver board shows separate switching and supply sections."><Box p={[0,.50,-.07]} s={[.76,.51,.07]} c={pcb}/>{[-.20,0,.20].map(x=><Pin key={x} p={[x,.52,.012]} r={.05} h={.095} c={dark}/>)}</Body></>;
 return <group scale={definition.size}>{parts}{type==='pwmcontrol'&&<Body id="actuator" detail="channel-adjustment" purpose="The single-channel controller adjusts brightness. The tunable model adds an independent warm and cool balance control.">
 {(v==='tunable-white'?[-.17,.17]:[0]).map(x=><group key={x} position={[x,.31,.292]} userData={{partId:'actuator',animation:x>0?'pwmMix':'pwmLevel',axis:'z'}}><Pin p={[0,0,0]} r={.092} h={.070} c={dark}/><Box p={[0,.035,.041]} s={[.016,.057,.012]} c={white}/></group>)}</Body>}</group>;
}
/** The lightweight fan uses the same scale, open throat and under-cover wiring side as the Blender fitting. */
function FanShell({half,throat,depth}:{half:number;throat:number;depth:number}){
 const geometry=geo('fan-panel'+[half,throat,depth].join(),()=>{
   const outline=new THREE.Shape();
   const corner=.046;
   outline.moveTo(-half+corner,-half);outline.lineTo(half-corner,-half);outline.quadraticCurveTo(half,-half,half,-half+corner);
   outline.lineTo(half,half-corner);outline.quadraticCurveTo(half,half,half-corner,half);
   outline.lineTo(-half+corner,half);outline.quadraticCurveTo(-half,half,-half,half-corner);
   outline.lineTo(-half,-half+corner);outline.quadraticCurveTo(-half,-half,-half+corner,-half);
   const opening=new THREE.Path();opening.absarc(0,0,throat,0,Math.PI*2,true);outline.holes.push(opening);
   return new THREE.ExtrudeGeometry(outline,{depth,bevelEnabled:false,curveSegments:32});
 });
 return <mesh geometry={geometry} material={mat(white)}/>;
}
function BathroomExtractor({view,authoring}:EquipmentProps){
 const showCover=authoring||view!=='cutaway';
 return <group position={[0,.88,0]}>
   <Body id="mounting" detail="xf-base" purpose="Four fixing holes hold the fan against the wall."><FanShell half={.78} throat={.467} depth={.022}/></Body>
   <Body detail="xf-spigot" purpose="The duct fits over this round outlet at the back."><mesh position={[0,0,-.225]} rotation={[Math.PI/2,0,0]} material={mat('#b1b6b8')} geometry={geo('xf-spigot',()=>new THREE.CylinderGeometry(.49,.49,.45,48,1,true))}/></Body>
   <group position={[0,0,.06]} userData={{partId:'rotor',detailId:'xf-impeller',animation:'rotor',axis:'z',speed:11}}>
     <Pin p={[0,0,0]} r={.175} h={.12} c="#a8bbc1"/>
     {[0,1,2,3,4].map(i=><group key={i} rotation={[0,0,i*Math.PI*2/5]}><group rotation={[.26,0,.15]}><Box p={[.295,0,0]} s={[.32,.20,.015]} c="#a8bbc1"/></group></group>)}
   </group>
   {showCover&&<group position={view==='open'&&!authoring?[1.2,.15,.35]:view==='exploded'&&!authoring?[.5,.5,.65]:[0,0,0]}><Body id="cover" detail="xf-intake" purpose="The fixed grille keeps the turning blades behind the spokes.">
     <group position={[0,0,.02]}><FanShell half={.815} throat={.48} depth={.25}/></group>
     <mesh position={[0,0,.263]} material={mat(white)} geometry={geo('xf-ring',()=>new THREE.TorusGeometry(.375,.010,8,72))}/>
     <Pin p={[0,0,.263]} r={.238} h={.045} c={white}/>
     {[0,1,2,3].map(i=><group key={i} rotation={[0,0,i*Math.PI/2]}><Box p={[.36,0,.252]} s={[.25,.018,.052]}/></group>)}
     {[-.69,.69].map(x=><Pin key={x} p={[x,0,.275]} r={.044} h={.012} c={white}/>)}
   </Body></group>}
 </group>;
}
export function WorkshopGeometry(props:EquipmentProps){
 const c=props.component;
 if(c.type==='fan'&&c.variant==='xf100s')return <BathroomExtractor {...props}/>;
 if(c.type==='pushbutton'&&c.variant==='sesame')return <group>
   <Body id="cover" detail="sesame-cover" purpose="The white cover clips over the switch and hides the wall fixing screws.">
     <Box p={[0,.55,.192]} s={[.48,1.10,.216]} c={white} rad={.018}/>
   </Body>
   <Body detail="sesame-base" purpose="The two holes at the ends hold the base against the door surround.">
     <Box p={[0,.55,.084]} s={[.45,1.066,.04]} c={white}/>
     <Pin p={[0,.55,.303]} r={.178} h={.026} c={dark}/>
   </Body>
   <group userData={{partId:'actuator',animation:'translate',offPosition:[0,0,0],onPosition:[0,0,-.035]}} position={[0,0,c.params.pressed?-.035:0]}>
     <Pin p={[0,.55,.33]} r={.139} h={.060} c={white}/>
   </group>
 </group>;
 if(WORKSHOP_TOOLS.includes(c.type))return <ToolGeometry type={c.type} dialPosition={Number(c.params.dialPosition??0)} held={!!c.params.held} redOut={!!c.params.redOut} blackOut={!!c.params.blackOut}/>;
 return c.type==='gammaboard'||c.type==='invictaboard'?<Board {...props}/>:<Elv {...props}/>;
}
