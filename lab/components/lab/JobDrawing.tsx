'use client';
import {useMemo,useState,useRef,type ReactNode} from 'react';
import {Minus,Plus,Scan,MapPin,ChevronRight} from 'lucide-react';
import type {CircuitDocument,ConfigurationLesson,Endpoint,Wire} from '../../lib/types';
import {endpointKey} from '../../lib/types';
import {COMPONENTS} from '../../lib/components';
import {getComponentTerminals} from '../../lib/terminal-layout';
import {type JobSite,drawingKind,ROOM_WALLS,FRONT,BACK,DOOR_Z,DOOR_WIDTH} from '../../lib/job-site';
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
export default function JobDrawing({doc,lesson,site,selected,part,highlight,goTo,highlightWire,openLocation,initialPage='plan'}:{
  doc:CircuitDocument;lesson?:ConfigurationLesson;site:JobSite;selected?:string;part:string;highlight:(id:string,terminal?:string)=>void;
  goTo:(id:string,terminal?:string)=>void;highlightWire:(wire?:string)=>void;openLocation:boolean;initialPage?:Page;
}){
  const [version,setVersion]=useState<'job'|'actual'>(lesson?'job':'actual'),[page,setPage]=useState<Page>(lesson?initialPage:'wiring');
  const [zoom,setZoom]=useState(1),[wireId,setWireId]=useState<string>(),[which,setWhich]=useState('');
  const docForSheet=version==='job'&&lesson?lesson.circuit:doc;
  const sheet=useMemo(()=>terminalSheet(docForSheet,site),[docForSheet,site]);
  const diagram=useRef<HTMLDivElement>(null);
  const curWire=docForSheet.wires.find(w=>w.id===wireId);
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
  const x=(n:number)=>42+(n+6.6)*41, y=(n:number)=>45+(n+2.8)*26;
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
      <div className="drawing-legendhead"><b>{site.name}</b><span>{page==='plan'?'Location plan':page==='wiring'?'Terminal connections':page==='ladder'?'Control ladder':'Board schedule'} · {lesson?'EL-'+String(lesson.id).padStart(3,'0'):'CUSTOM'} · {version==='job'?'Design':'As wired'}</span></div>
      {page==='plan'?<svg className="electrical-sheet floor-sheet" role="group" aria-label="Installation floor plan" viewBox="0 0 640 302" style={{width:Math.max(100,zoom*100)+'%',minWidth:420*zoom}}>
        <defs><pattern id="site-hatch" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="#b6c3b9" fill="none" strokeWidth=".5"/></pattern></defs>
        <rect x={x(-6.6)} y={y(BACK)} width={13.2*41} height={(FRONT-BACK)*26} fill="#f4f4e8" stroke="none"/>
        {ROOM_WALLS.slice(0,3).map((left,i)=><text key={left} x={x(left+2.2)} y={y(.35)} textAnchor="middle" className="room-caption">{site.location(i)}</text>)}
        <text x={x(0)} y={y(5.43)} className="room-caption" textAnchor="middle">{site.location(3)}</text>
        <g stroke="#4c655d" strokeWidth="4" fill="none"><path d={`M${x(-.74)} ${y(FRONT)}H${x(-6.6)}V${y(BACK)}H${x(6.6)}V${y(FRONT)}H${x(.74)}`}/>
          {ROOM_WALLS.slice(1,3).map(w=><path key={w} d={`M${x(w)} ${y(BACK)}V${y(DOOR_Z-DOOR_WIDTH/2)} M${x(w)} ${y(DOOR_Z+DOOR_WIDTH/2)}V${y(FRONT)}`}/>)}</g>
        <path d={`M${x(-.74)} ${y(FRONT)}v-38 q38 0 59 38`} fill="none" stroke="#899b91" strokeDasharray="3 2"/>
        {site.items.filter(item=>docForSheet.components.some(c=>c.id===item.id)).map(item=>{
          const c=docForSheet.components.find(c=>c.id===item.id)!;
          const roomItems=site.items.filter(p=>p.room===item.room),index=roomItems.indexOf(item);
          // Offset tags from their true fixing points; the leader stays on the installation location.
          const bx=x(item.room===3?0:ROOM_WALLS[item.room]+.65)+(index%5)*28;
          const by=item.room===3?y(4.22)+Math.floor(index/5)*25:y(-1.84)+Math.floor(index/5)*25;
          return <Hot key={item.id} name={item.ref+' '+c.label} choose={()=>choose(item.id)}>
            <path d={`M${x(item.position[0])} ${y(item.position[2])}L${bx} ${by}`} stroke="#96a59c" fill="none"/><circle cx={x(item.position[0])} cy={y(item.position[2])} r="2" fill="#37564b"/>
            <rect x={bx-12} y={by-10} width="26" height="20" rx="2" fill={selected===item.id?'#f6c56f':'#fffef5'} stroke="#738d81"/><text x={bx+1} y={by+4} textAnchor="middle" fontSize="9">{item.ref}</text></Hot>;
        })}
        <text x="42" y="281" fontSize="10">Equipment tags show fixing locations. Select a tag to find the device.</text>
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
      <details className="drawing-key"><summary>Drawing legend and equipment</summary><p>Tags identify one physical device throughout the job. A solid dot joins conductors. A crossing without a dot is separate. Contact symbols show their normal state.</p>{docForSheet.components.map(c=><button key={c.id} onClick={()=>choose(c.id)}>{reference(c.id)} · {c.label}</button>)}</details>
    </div>
    <div className="drawing-selection" aria-live="polite">{curWire?<><div><b>{pair(curWire.from)} → {pair(curWire.to)}</b><small>{curWire.role} · {other?(mate?(mate.role===curWire.role?'Same connection on both sheets':'Conductor marking differs'):(version==='job'?'Open in your wiring':'Additional connection in your wiring')):'Installed conductor'}</small></div><select aria-label="Trace endpoint on site" value={which} onChange={e=>{setWhich(e.target.value);const p=[curWire.from,curWire.to].find(t=>endpointKey(t)===e.target.value)!;highlight(p.component,p.terminal);}}>{[curWire.from,curWire.to].map((p,i)=><option key={i} value={endpointKey(p)}>{pair(p)}</option>)}</select><button onClick={()=>{const p=which===endpointKey(curWire.to)?curWire.to:curWire.from;goto(p.component,p.terminal);}}><MapPin size={15}/>Find</button></>:equip?<><div><b>{reference(equip.id)} · {equip.label}</b><small>{focused?focused.label+' · '+focused.purpose:site.location(site.items.find(i=>i.id===equip.id)?.room??site.room)}</small></div>{page!=='wiring'&&<button onClick={()=>openTerminals(equip.id)}>Terminals</button>}<button disabled={!doc.components.some(c=>c.id===equip.id)} onClick={()=>goto(equip.id,focused?.id)}>Find {openLocation?'on site':'on bench'} <ChevronRight size={15}/></button></>:<span>Select a symbol or conductor to follow it.</span>}</div>
  </section>;
}
