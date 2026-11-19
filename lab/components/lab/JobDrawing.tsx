'use client';
import {useEffect,useMemo,useState,useRef,type ReactNode} from 'react';
import {Minus,Plus,Scan,MapPin,ChevronRight} from 'lucide-react';
import type {CircuitDocument,ConfigurationLesson,Endpoint,Wire} from '../../lib/types';
import {endpointKey} from '../../lib/types';
import {COMPONENTS} from '../../lib/components';
import {getComponentTerminals} from '../../lib/terminal-layout';
import {type JobSite,drawingKind,BACK} from '../../lib/job-site';
import {GARDEN_DOOR,HOME_BACK,HOME_ROOMS,HOME_WALLS,HOUSE_FURNITURE,HOME_STAIR,REAR_GARDEN,STAIR_FOOT,STAIR_LANDING,alignWall,doorLeaf,doorsOn,wallSpans} from '../../lib/home-floorplan';
import {ServicePlan,serviceSpaces} from './ServicePlan';
import {SERVICE_AREAS} from '../../lib/service-floorplan';
import {installedWireRoute} from '../../lib/house-installation';
import {DRAWING_INK,terminalSheet,shortPoint,matchConnection,ladderPaths} from '../../lib/installation-drawing';

function Symbol({type}:{type:string}){
  if(/lamp|led|indicator|emergency/i.test(type))return <><circle r="9"/><path d="M-6 -6l12 12m-12 0l12 -12"/></>;
  if(type==='switch2'||type==='selector')return <><circle cx="-9" r="1.5"/><circle cx="9" cy="-5" r="1.5"/><circle cx="9" cy="5" r="1.5"/><path d="M-8 0L7 -5"/></>;
  if(type==='intermediate')return <path d="M-12 -5h3l16 10h4 M-12 5h3l16 -10h4"/>;
  if(/switch|button|isolator|thermostat|sensor/i.test(type))return <><circle cx="-9" r="1.5"/><circle cx="9" r="1.5"/><path d="M-9 0L7 -8"/></>;
  if(/^source3?$/.test(type))return <><circle r="9"/><path d="M-6 0q3 -7 6 0t6 0"/></>;
  if(/dcsupply|battery/.test(type))return <path d="M-12 0h5m0 -8v16m5 -12v8m4 -12v16m5 -12v8m0 -4h5"/>;
  if(/transformer|driver/.test(type))return <><circle cx="-4" r="7"/><circle cx="4" r="7"/></>;
  if(/mcb|rcbo|fuse|overload/.test(type))return <><rect x="-9" y="-5" width="18" height="10"/><path d="M-13 0h26"/></>;
  if(/motor|pump|fan/.test(type))return <><circle r="10"/><path d="M-4 4v-8l4 5 4 -5v8"/></>;
  if(/chime|alarm/.test(type))return <><path d="M-9 5Q-8 1 -7 -2Q-7 -9 0 -9Q7 -9 7 -2L9 5Z"/><path d="M-2 8q2 3 4 0"/></>;
  if(/earthbar|neutralbar|terminal/.test(type))return <><path d="M-11 0h22"/><circle r="2.5"/></>;
  return <><rect x="-9" y="-6" width="18" height="12"/><path d="M-13 0h4m18 0h4"/></>;
}
function Hot({name,choose,children}:{name:string;choose:()=>void;children:ReactNode}){
  return <g className="drawing-hot" role="button" tabIndex={0} aria-label={name} onClick={e=>{e.stopPropagation();choose();}}
    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();choose();}}}>{children}</g>;
}
type Page='plan'|'wiring'|'schedule'|'ladder';
export default function JobDrawing({doc,lesson,site,selected,part,highlight,goTo,highlightWire,openLocation,initialPage='plan',planTrace}:{
  doc:CircuitDocument;lesson?:ConfigurationLesson;site:JobSite;selected?:string;part:string;highlight:(id:string,terminal?:string)=>void;
  goTo:(id:string,terminal?:string)=>void;highlightWire:(wire?:string)=>void;openLocation:boolean;initialPage?:Page;planTrace?:{sequence:number;wire:string};
}){
  const [version,setVersion]=useState<'job'|'actual'>(lesson?'job':'actual'),[page,setPage]=useState<Page>(lesson?initialPage:'wiring');
  const [zoom,setZoom]=useState(1),[wireId,setWireId]=useState<string>(),[which,setWhich]=useState('');
  const [planArea,setPlanArea]=useState<'selected'|'whole'|number>(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:760px), (max-height:550px) and (pointer:coarse)').matches?'selected':'whole');
  const docForSheet=version==='job'&&lesson?lesson.circuit:doc;
  const sheet=useMemo(()=>terminalSheet(docForSheet,site),[docForSheet,site]);
  const diagram=useRef<HTMLDivElement>(null);
  const lastTrace=useRef<number|undefined>(undefined);
  useEffect(()=>{
    if(!openLocation||!planTrace||lastTrace.current===planTrace.sequence)return;
    lastTrace.current=planTrace.sequence;
    if(!doc.wires.some(w=>w.id===planTrace.wire))return;
    setPage('plan');setVersion('actual');setWireId(planTrace.wire);setPlanArea('whole');setZoom(1);
    diagram.current?.scrollTo({top:0,left:0});
  },[openLocation,planTrace,doc.wires]);
  const curWire=docForSheet.wires.find(w=>w.id===wireId);
  const floorRoute=useMemo(()=>curWire?installedWireRoute(docForSheet,site,curWire):undefined,[curWire,site,docForSheet]);
  const reference=(id:string)=>site.items.find(item=>item.id===id)?.ref??id;
  const pair=(e:Endpoint)=>shortPoint(site,docForSheet,e);
  const equip=docForSheet.components.find(c=>c.id===selected);
  const focused=equip&&getComponentTerminals(equip,COMPONENTS[equip.type]).find(t=>t.id===part);
  const other=lesson&&(version==='job'?doc:lesson.circuit);
  const mate=curWire&&other?matchConnection(curWire,other):undefined;
  const special=drawingKind(lesson);
  const choose=(id:string,pin?:string)=>{setWireId(undefined);highlightWire(undefined);highlight(id,pin);};
  const trace=(wire:Wire)=>{setWireId(wire.id);const match=version==='actual'?wire:matchConnection(wire,doc);highlightWire(match?.id);
    highlight(wire.from.component,wire.from.terminal);setWhich(endpointKey(wire.from));};
  const goto=(id:string,terminal?:string)=>{if(doc.components.some(c=>c.id===id))goTo(id,terminal);};
  function reset(){setZoom(1);diagram.current?.scrollTo({top:0,left:0});}
  const house=site.kind==='home',bathroom=site.building.rooms[1]==='Bathroom';
  const stair=doc.lessonId===9?HOME_STAIR:undefined;
  const rooms=site.kind==='home'?(stair?[...HOME_ROOMS,STAIR_LANDING]:HOME_ROOMS):serviceSpaces(site.kind);
  const annex=site.kind==='home'?undefined:SERVICE_AREAS[site.kind];
  const left=Math.min(-6.6,annex?.left??-6.6),right=Math.max(6.6,annex?.right??6.6),back=Math.min(-2.8,annex?.back??-2.8);
  const x=(n:number)=>42+(n-left)*41, y=(n:number)=>24+(n-(house?HOME_BACK:back))*41;
  const areaId=planArea==='selected'?(curWire?'whole':site.items.find(i=>i.id===selected)?.room??site.room):planArea;
  const planRoom=areaId!=='whole'?rooms.find(r=>r.id===areaId):undefined;
  const showGarden=house&&(site.items.some(i=>i.room===REAR_GARDEN.id)||planRoom?.id===REAR_GARDEN.id);
  const planTop=showGarden?Math.floor(y(REAR_GARDEN.back)-12):0;
  // A close plan of the entrance keeps the tag, wall penetration and door swing together on a phone.
  const crop=planRoom?.id===REAR_GARDEN.id?{left:GARDEN_DOOR.centre-1.9,right:GARDEN_DOOR.centre+1.9,back:HOME_BACK-1.75,front:HOME_BACK+1.12}:planRoom;
  const planBox=crop?[x(crop.left)-12,y(crop.back)-12,(crop.right-crop.left)*41+24,(crop.front-crop.back)*41+24].join(' '):house?[0,planTop,640,592-planTop].join(' '):[0,0,84+(right-left)*41,48+(6-back)*41].join(' ');
  const width=page==='wiring'?sheet.width:640;
  const ladder=useMemo(()=>page==='ladder'?ladderPaths(docForSheet):[],[page,docForSheet]);
  const ladderWidth=Math.max(640,240+Math.max(0,...ladder.map(r=>r.path.length))*85);
  const fit=()=>{if(page==='wiring'||page==='ladder'){const w=page==='wiring'?width:ladderWidth;const pane=diagram.current;setZoom(pane?Math.max(.06,Math.min(1,(pane.clientWidth-36)/w)):1);pane?.scrollTo({top:0,left:0});}else reset();};
  function openTerminals(id:string){setPage('wiring');setZoom(1);
    requestAnimationFrame(()=>{const block=sheet.blocks.find(b=>b.id===id);if(block)diagram.current?.scrollTo({left:Math.max(0,block.x-25),top:0});});
  }
  const pins=(e:Endpoint)=>{if(!equip||!focused)return false;return e.component===equip.id&&e.terminal===focused.id;};
  return <section className="drawing-workspace" aria-label="Electrical drawing">
    <div className="drawing-toolbar">
      {lesson&&<div className="drawing-tabs" role="group" aria-label="Drawing source">{(['job','actual']as const).map(v=><button key={v} aria-pressed={v===version} onClick={()=>{setVersion(v);setWireId(undefined);highlightWire(undefined);}}>{v==='job'?'Job drawing':'My wiring'}</button>)}</div>}
      <select aria-label="Drawing sheet" value={page} onChange={e=>{setPage(e.target.value as Page);reset();}}>
        {openLocation&&<option value="plan">Location plan</option>}<option value="wiring">Terminal wiring</option>
        {special==='schedule'&&<option value="schedule">Board schedule</option>}{special==='ladder'&&<option value="ladder">Control ladder</option>}
      </select>
      <div className="drawing-zoom"><button aria-label="Zoom out drawing" disabled={zoom<=.4} onClick={()=>setZoom(z=>Math.max(.4,z-.25))}><Minus size={14}/></button><button aria-label="Fit drawing" onClick={fit}><Scan size={14}/></button><button aria-label="Zoom in drawing" disabled={zoom>=4} onClick={()=>setZoom(z=>Math.min(4,z+.25))}><Plus size={14}/></button></div>
    </div>
    <div ref={diagram} className="drawing-paper" tabIndex={0} aria-label="Scrollable drawing">
      <div className="drawing-title"><div className="drawing-legendhead"><b>{site.name}</b><span>{page==='plan'?'Location plan':page==='wiring'?'Terminal connections':page==='ladder'?'Control ladder':'Board schedule'} · {lesson?'EL-'+String(lesson.id).padStart(3,'0'):'CUSTOM'} · {version==='job'?'Design':'As wired'}</span></div>
      {page==='plan'&&<label className="house-plan-area"><span className="sr-only">Area on plan</span><select aria-label="Area on plan" value={areaId} onChange={e=>{setPlanArea(e.target.value==='whole'?'whole':Number(e.target.value));reset();}}><option value="whole">{house?'Whole house':'Whole site'}</option>{rooms.map(r=><option key={r.id} value={r.id}>{site.location(r.id)}</option>)}</select></label>}</div>
      {page==='plan'?<svg className="electrical-sheet floor-sheet" role="group" aria-label="Installation floor plan" viewBox={planBox} style={{width:Math.max(100,zoom*100)+'%',minWidth:340*zoom}}>
        <defs><pattern id="site-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#b6c3b9" fill="none" strokeWidth=".5"/></pattern></defs>
        {house?<g data-oakfield-plan>
          {HOME_ROOMS.filter(r=>r.id!==3&&(r.id!==REAR_GARDEN.id||showGarden)).map(r=><rect key={r.id} x={x(r.left)} y={y(r.back)} width={(r.right-r.left)*41} height={(r.front-r.back)*41} fill={r.id===REAR_GARDEN.id?'#e0e8d8':r.id===6||r.id===1?'#f2f0de':'#f8f8ea'}/>)}
          {Object.entries(HOUSE_FURNITURE).map(([name,b])=><rect key={name} x={x(b.x-b.w/2)} y={y(b.z-b.d/2)} width={b.w*41} height={b.d*41} rx="2" fill="#dcded0" stroke="#b5bdac"><title>{name}</title></rect>)}
          {HOME_WALLS.map(w=><g key={w.id}>{wallSpans(w,bathroom,!!stair).map(([a,b])=>{
            const p=alignWall(w,a,0,0,0),q=alignWall(w,b,0,0,0);
            return <path key={a} d={`M${x(p.x)} ${y(p.z)} L${x(q.x)} ${y(q.z)}`} stroke="#4c655d" strokeWidth="4"/>;})}
            {doorsOn(w,bathroom,!!stair).map(d=>{const leaf=doorLeaf(w,d),latch=alignWall(w,d.centre-d.hinge*d.width/2,0,0,0);
              const end=alignWall(w,d.centre+d.hinge*d.width/2,d.side*d.width,0,0),hinge=alignWall(w,d.centre+d.hinge*d.width/2,0,0,0);
              return <g key={d.centre}><rect x={x(leaf.x-leaf.w/2)} y={y(leaf.z-leaf.d/2)} width={leaf.w*41} height={leaf.d*41} fill="#889d91"/>
                <path d={`M${x(latch.x)} ${y(latch.z)} Q${x(end.x+latch.x-hinge.x)} ${y(end.z+latch.z-hinge.z)} ${x(end.x)} ${y(end.z)}`} fill="none" stroke="#9eab9c" strokeDasharray="3 2"/></g>;})}
          </g>)}
          {stair&&<g fill="none" stroke="#83978c" strokeWidth="1" aria-label="Stair flights and first-floor landing">
            <rect x={x(stair.west)} y={y(stair.back)} width={(stair.east-stair.west)*41} height={(STAIR_FOOT-stair.back)*41}/>
            <rect x={x(stair.divider)} y={y(STAIR_FOOT)} width={(stair.east-stair.divider)*41} height={(stair.landingEnd-STAIR_FOOT)*41} strokeDasharray="3 2"/>
            {Array.from({length:stair.risersPerFlight},(_,i)=><line key={i} x1={x(stair.west)} x2={x(stair.east)} y1={y(stair.turn+i*stair.going)} y2={y(stair.turn+i*stair.going)}/>)}
            <line x1={x(stair.divider)} x2={x(stair.divider)} y1={y(stair.turn)} y2={y(STAIR_FOOT)}/>
            <path d={`M${x((stair.west+stair.divider)/2)} ${y(STAIR_FOOT)} V${y(stair.turn-.4)} H${x((stair.divider+stair.east)/2)} V${y(STAIR_FOOT+.15)} m-3 -5 l3 5 3 -5`} stroke="#4c655d"/>
          </g>}
          {HOME_ROOMS.filter(r=>r.id!==REAR_GARDEN.id||showGarden).map(r=><text key={r.id} x={x(r.id===REAR_GARDEN.id?GARDEN_DOOR.centre+.89:(r.left+r.right)/2)} y={y(r.id===3?4.8:r.front-.60)} textAnchor="middle" className="room-caption">{site.location(r.id)}</text>)}
        </g>:site.kind!=='home'&&<ServicePlan site={site} kind={site.kind} x={x} y={y}/>}
        {curWire&&floorRoute?.length&&<polyline aria-label="Selected wire route" points={floorRoute.map(p=>x(p[0])+','+y(p[2])).join(' ')} fill="none" stroke={DRAWING_INK[curWire.role]} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="7 3"/>}
        {site.items.filter(item=>(!planRoom||item.room===planRoom.id)&&docForSheet.components.some(c=>c.id===item.id)).map(item=>{
          const c=docForSheet.components.find(c=>c.id===item.id)!;
          const roomItems=site.items.filter(p=>p.room===item.room),index=roomItems.indexOf(item);
          // Offset tags from their true fixing points; the leader stays on the installation location.
          const space=rooms.find(r=>r.id===item.room);
          const columns=space?Math.min(6,Math.max(2,Math.floor((space.right-space.left-.45)*41/29))):5;
          const bx=x(item.room===REAR_GARDEN.id?item.position[0]:item.room===3?0:(space?.left??-6.6)+.65)+(index%columns)*28;
          const by=(item.room===REAR_GARDEN.id?y(HOME_BACK-1.13):item.room===3?y(4.22):y((space?.back??BACK)+.96))+Math.floor(index/columns)*25;
          return <Hot key={item.id} name={item.ref+' '+c.label} choose={()=>choose(item.id)}>
            <path d={`M${x(item.position[0])} ${y(item.position[2])}L${bx} ${by}`} stroke="#96a59c" fill="none"/><circle cx={x(item.position[0])} cy={y(item.position[2])} r="2" fill="#37564b"/>
            <rect x={bx-12} y={by-10} width="26" height="20" rx="2" fill={selected===item.id?'#f6c56f':'#fffef5'} stroke="#738d81"/><text x={bx+1} y={by+4} textAnchor="middle" fontSize="9">{item.ref}</text></Hot>;
        })}
        {!planRoom&&<text x="42" y={house?573:y(6)+10} fontSize="12">Choose an equipment tag to find it on site.</text>}
      </svg>:page==='wiring'?<svg className="electrical-sheet" width={width*zoom} height={sheet.height*zoom} viewBox={`0 0 ${width} ${sheet.height}`} aria-label="Terminal-to-terminal wiring" role="group">
        {sheet.blocks.map(b=><g key={b.id}><Hot name={'Select '+b.ref+' '+b.name} choose={()=>choose(b.id)}><rect x={b.x} y="21" width={b.width} height="106" rx="3" fill={selected===b.id?'#fbefd5':'#f7f8ef'} stroke="#496456"/>
          <text x={b.x+9} y="43" fontWeight="700">{b.ref}</text><g transform={`translate(${b.x+b.width-21} 40)`} stroke="#365343" strokeWidth="1.5" fill="none"><Symbol type={b.type}/></g>
          <text x={b.x+9} y="69" fontSize="11"><title>{b.name}</title>{b.name.length>(b.width-12)/6?b.name.slice(0,(b.width-19)/6)+'…':b.name}</text></Hot>
          {b.pins.map(t=>{const e={component:b.id,terminal:t.id},p=sheet.pins.get(endpointKey(e))!;return <Hot key={t.id} name={b.ref+' '+t.label+' '+t.purpose} choose={()=>choose(b.id,t.id)}><rect x={p.x-18} y="91" width="36" height="53" fill="transparent"/><text x={p.x} y="109" textAnchor="middle" fontWeight={pins(e)?700:400} fontSize="10">{t.label}</text><path d={`M${p.x} 118V141`} stroke="#425b4d"/><circle cx={p.x} cy="140" r={pins(e)?5:3} fill={pins(e)?'#d98424':'#fafff3'} stroke="#415e51"/></Hot>})}</g>)}
        {sheet.lines.map(({a,b,y,wire})=><g key={wire.id} stroke={DRAWING_INK[wire.role]??'#585858'} strokeWidth={wire.id===wireId?3:1.3} opacity={wireId&&wireId!==wire.id ? .3 : 1}><path d={`M${a.x} 142V${y} M${b.x} 142V${y}`} fill="none"/></g>)}
        {sheet.lines.map(({a,b,y,wire},i)=>{const active=wireId===wire.id;const d=`M${a.x} ${y}H${b.x}`;return <Hot key={wire.id} name={'Trace wire '+(i+1)+' '+pair(wire.from)+' to '+pair(wire.to)} choose={()=>trace(wire)}>
          <path d={d} stroke="transparent" strokeWidth="16"/><path d={d} stroke="#fafbf3" strokeWidth="6"/><path d={d} stroke={DRAWING_INK[wire.role]??'#555'} strokeWidth={active?3.6:1.7} strokeDasharray={wire.role==='PE'?'5 3':undefined} opacity={wireId&&!active ? .4 : 1}/>
          {[a,b].map((p,j)=><circle key={j} cx={p.x} cy={y} r={active?4:2.8} fill={DRAWING_INK[wire.role]??'#456'}/>)}<text x={Math.max(a.x,b.x)+6} y={y+3} fontSize="9">{i+1} · {wire.role}</text></Hot>;})}
      </svg>:page==='ladder'?<svg className="electrical-sheet" width={ladderWidth*zoom} height={(90+ladder.length*63)*zoom} viewBox={`0 0 ${ladderWidth} ${90+ladder.length*63}`} aria-label="Control paths and coil returns" role="group">
        {ladder.map((row,i)=>{const yy=43+i*63;return <g key={i}><text x="6" y={yy-13} fontSize="10">{String(i+1).padStart(2,'0')} · {row.feed??'No traced feed'}</text><path d={`M24 ${yy-13}v26 M24 ${yy}H${ladderWidth-47} m0 -13v26`} stroke="#516956" fill="none" strokeDasharray={row.feed?undefined:'4 4'}/>
          {row.path.map((e,k)=><Hot key={k} name={reference(e.component)+' contact '+e.a.terminal+' '+e.b.terminal} choose={()=>choose(e.component,e.a.terminal)}><g transform={`translate(${75+k*85} ${yy})`}><rect x="-22" y="-12" width="44" height="24" fill="#fafbf3"/><path d={'M-22 0H-4 M-4 -10V10 M4 -10V10 M4 0H22'+(e.kind==='nc'?' M-9 11L9 -11':'')} stroke="#385343" fill="none"/><text y="-16" textAnchor="middle" fontSize="11">{reference(e.component)}</text><text y="22" textAnchor="middle" fontSize="9">{e.a.terminal}–{e.b.terminal}</text></g></Hot>)}
          <Hot name={reference(row.load.component)+' coil or load'} choose={()=>choose(row.load.component,row.load.a.terminal)}><g transform={`translate(${ladderWidth-117} ${yy})`}><rect x="-19" y="-11" width="38" height="22" fill="#fafbf3" stroke="#395946"/><text y="4" textAnchor="middle" fontSize="11">{reference(row.load.component)}</text></g></Hot><text x={ladderWidth-60} y={yy+22} fontSize="9">↦ {row.returnLabel}</text></g>})}
        {!ladder.length&&<text x="20" y="36">No supported control rungs. Open Terminal wiring to trace every connection.</text>}
      </svg>:<table className="board-schedule"><caption>Protective devices and their outgoing connections</caption><thead><tr><th>Ref.</th><th>Device</th><th>Rating</th><th>Feeds</th></tr></thead><tbody>{docForSheet.components.filter(c=>/^(mcb3?|rcbo|rcd3?|isolator3?|fuse|spd)$/.test(c.type)).map(c=>{const outgoing=docForSheet.wires.filter(w=>[w.from,w.to].some(e=>e.component===c.id&&/OUT|LOAD|^2$/.test(e.terminal)));return <tr key={c.id}><td><button onClick={()=>choose(c.id)}>{reference(c.id)}</button></td><td>{c.label}</td><td>{c.params.rating??c.params.currentRating??COMPONENTS[c.type].defaults.currentRating??'—'}{(c.params.rating??c.params.currentRating??COMPONENTS[c.type].defaults.currentRating)!==undefined?' A':''}</td><td>{outgoing.map(w=><button key={w.id} onClick={()=>trace(w)}>{pair(w.from.component===c.id?w.to:w.from)}</button>)}</td></tr>})}</tbody></table>}
      <details className="drawing-key"><summary>Drawing legend and equipment</summary><p>Each label follows the same piece of equipment around the site. A solid dot marks a wire joint. Wires that cross without a dot stay separate. Switch symbols show their resting position.</p>{docForSheet.components.map(c=><button key={c.id} onClick={()=>choose(c.id)}>{reference(c.id)} · {c.label}</button>)}</details>
    </div>
    <div className="drawing-selection" aria-live="polite">{curWire?<><div><b>{pair(curWire.from)} → {pair(curWire.to)}</b><small>{curWire.role} · {other?(mate?(mate.role===curWire.role?'Same connection on both sheets':'Same ends, different wire marking'):(version==='job'?'Missing from your wiring':'Additional connection in your wiring')):'Installed conductor'}</small></div><select aria-label="Choose which end of the wire to find" value={which} onChange={e=>{setWhich(e.target.value);const p=[curWire.from,curWire.to].find(t=>endpointKey(t)===e.target.value)!;highlight(p.component,p.terminal);}}>{[curWire.from,curWire.to].map((p,i)=><option key={i} value={endpointKey(p)}>{pair(p)}</option>)}</select><button onClick={()=>{const p=which===endpointKey(curWire.to)?curWire.to:curWire.from;goto(p.component,p.terminal);}}><MapPin size={15}/>Find</button></>:equip?<><div><b>{reference(equip.id)} · {equip.label}</b><small>{focused?focused.label+' · '+focused.purpose:site.location(site.items.find(i=>i.id===equip.id)?.room??site.room)}</small></div>{page!=='wiring'&&<button onClick={()=>openTerminals(equip.id)}>Terminals</button>}<button disabled={!doc.components.some(c=>c.id===equip.id)} onClick={()=>goto(equip.id,focused?.id)}>Find {openLocation?'on site':'on bench'} <ChevronRight size={15}/></button></>:<span>Select a symbol or wire to see where it goes.</span>}</div>
  </section>;
}
