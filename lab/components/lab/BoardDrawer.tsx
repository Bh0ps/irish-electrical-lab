import React,{useState} from 'react';
import { boardRails,fitsRail,isBoard,mountDevice,mountError,railWidth,unmountDevice } from '../../lib/board-assembly';
import { populateBoard } from '../../lib/board-examples';
import type { CircuitDocument } from '../../lib/types';

type Props={editable?:boolean;circuit:CircuitDocument;selected?:string;onChange:(next:CircuitDocument)=>void;onSelect:(id:string)=>void};
export function BoardDrawer({circuit,selected,onChange,onSelect,editable=true}:Props){
 const item=circuit.components.find(c=>c.id===selected),[boardChoice,setBoardChoice]=useState(''),[deviceChoice,setDeviceChoice]=useState(''),[railChoice,setRailChoice]=useState(-1),[slotChoice,setSlotChoice]=useState(-1),[error,setError]=useState('');
 const boards=circuit.components.filter(c=>isBoard(c.type));
 if(!item||!boards.length||!isBoard(item.type)&&!railWidth(item.type))return null;
 const board=isBoard(item.type)?item:boards.find(c=>c.id===(item.mount?.board??boardChoice))??boards[0];
 const mounted=circuit.components.filter(c=>c.mount?.board===board.id),rails=boardRails(board.type);
 const eligible=circuit.components.filter(c=>rails.some(r=>fitsRail(c,board,r))&&!c.mount);
 const device=isBoard(item.type)?eligible.find(c=>c.id===deviceChoice)??eligible[0]:item;
 const available=device?rails.filter(r=>fitsRail(device,board,r)&&Array.from({length:r.ways},(_,slot)=>!mountError(circuit.components,device,{board:board.id,row:r.index,slot})).some(Boolean)):[];
 const row=available.find(r=>r.index===railChoice)??available[0];
 const slots=row&&device?Array.from({length:row.ways},(_,i)=>i).filter(slot=>!mountError(circuit.components,device,{board:board.id,row:row.index,slot})):[];
 const slot=slots.includes(slotChoice)?slotChoice:slots[0];
 function mutate(next:()=>CircuitDocument){try{onChange(next());setError('');}catch(e){setError(e instanceof Error?e.message:'This position is unavailable.');}}
 function setPart(param:string,value:boolean){mutate(()=>({...circuit,components:circuit.components.map(c=>c.id===board.id?{...c,params:{...c.params,[param]:value}}:c)}));}
 return <section className="board-controls" aria-label="Distribution board">
 {isBoard(item.type)?<><h3>{board.type==='gammaboard'?'Two-row domestic board':'Four-way three-phase board'}</h3>
 <div className="quick-actions"><button type="button" onClick={()=>setPart('doorOpen',board.params.doorOpen===false)}>{board.params.doorOpen===false?'Open door':'Close door'}</button>
 <button type="button" onClick={()=>setPart('frontOff',!board.params.frontOff)}>{board.params.frontOff?'Refit front cover':'Remove front cover'}</button></div>
 {editable&&!mounted.length&&<button type="button" onClick={()=>mutate(()=>populateBoard(circuit,board.id))}>Fit a working example</button>}
 {mounted.length>0&&<details><summary>Installed equipment ({mounted.length})</summary>{mounted.map(c=><button type="button" key={c.id} onClick={()=>onSelect(c.id)}>{c.label} · {rails.find(r=>r.index===c.mount!.row)?.name} {c.mount!.slot+1}</button>)}</details>}</>:null}
 {item.mount?<p>{board.label} · {rails.find(r=>r.index===item.mount!.row)?.name}, position {item.mount.slot+1}. {editable&&<button type="button" onClick={()=>mutate(()=>unmountDevice(circuit,item.id))}>Take off rail</button>}</p>:editable&&device&&<details><summary>Fit equipment to a rail</summary>
 {isBoard(item.type)?<label>Device <select value={device.id} onChange={e=>{setDeviceChoice(e.target.value);setRailChoice(-1);setSlotChoice(-1);}}>{eligible.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select></label>:<label>Board <select value={board.id} onChange={e=>{setBoardChoice(e.target.value);setRailChoice(-1);setSlotChoice(-1);}}>{boards.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></label>}
 {row?<><label>Rail <select value={row.index} onChange={e=>{setRailChoice(Number(e.target.value));setSlotChoice(-1);}}>{available.map(r=><option key={r.index} value={r.index}>{r.name} · {r.ways} positions</option>)}</select></label>
 <label>Position <select value={slot} onChange={e=>setSlotChoice(Number(e.target.value))}>{slots.map(s=><option key={s} value={s}>{s+1}{railWidth(device.type)>1?'–'+(s+railWidth(device.type)):''}</option>)}</select></label>
 <button type="button" onClick={()=>mutate(()=>mountDevice(circuit,device.id,{board:board.id,row:row.index,slot}))}>Fit device</button></>:<p>No compatible position is free.</p>}</details>}
 {error&&<p role="alert">{error}</p>}</section>;
}
