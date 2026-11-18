import { useEffect, useRef, useState } from 'react';
import { ConductorPicker, TerminalPicker } from './ConnectionPicker';
import { describeEndpoint } from '../../lib/build-hints';
import { publicAssetUrl } from '../../web/asset-url';
import { terminations, prepareSample, type PreparationTask, type WorkshopVisual } from '../../lib/termination-practice';
import type { ForkMethod, ForkReading, ForkSetup } from '../../lib/fork-tester';
import type { CircuitDocument, Endpoint } from '../../lib/types';
import './tester-controls.css';

export function TesterControls({doc,setup,reading,held,activeProbe,onSource,onInspect,onMethod,onReference,onProbe,onEndpoint,onWire,onHold,onClear,onRead,showRecord}:{doc:CircuitDocument;setup:ForkSetup;reading:ForkReading;held:boolean;activeProbe:'red'|'black';onSource:(url:string)=>void;onInspect:()=>void;onMethod:(method:ForkMethod)=>void;onReference:(r:ForkSetup['reference'])=>void;onProbe:(color:'red'|'black')=>void;onEndpoint:(e:Endpoint)=>void;onWire:(w:string)=>void;onHold:()=>void;onClear:()=>void;onRead:()=>void;showRecord:boolean}){
  const isFork=setup.method.startsWith('fork'),usingProbes=setup.method==='resistance'||setup.method==='probe-voltage';
  const [sound,setSound]=useState(false),audio=useRef<AudioContext|null>(null);
  useEffect(()=>()=>{void audio.current?.close().catch(()=>{});},[]);
  useEffect(()=>{
    if(!sound||!reading.beeps||held||!audio.current)return;
    const ctx=audio.current,tone=ctx.createOscillator(),volume=ctx.createGain();
    tone.frequency.value=2200;volume.gain.value=.025;tone.connect(volume);volume.connect(ctx.destination);tone.start();
    return ()=>{tone.stop();tone.disconnect();volume.disconnect();};
  },[sound,reading.beeps,held]);
  return <section className="tester-controls" aria-label="T6-600 electrical tester">
    <div className="tester-title"><button type="button" className="inspect-tester" aria-label="Inspect tester on bench" onClick={onInspect}><img src={publicAssetUrl('/models/thumbnails/forktester_default.png')} alt=""/><small>Zoom in</small></button><div><strong>T6-600</strong><small>Open-fork electrical tester</small></div></div>
    <div className={'tester-lcd '+(setup.method==='fork-voltage'&&reading.status==='value'?'referenced':'')} aria-live="polite"><small>{held?'HOLD · ':''}{reading.signal??''}{reading.unit==='V'&&reading.value!==null&&Math.abs(reading.value)>=30?' · ⚡ 30 V or more':''}{reading.beeps?' · Continuity':''}</small><output>{reading.shown} <span>{reading.unit}</span></output></div>
    <label>Rotary dial<select value={isFork?'fork':setup.method} onChange={e=>onMethod(e.target.value==='fork'?'fork-current':e.target.value as ForkMethod)}>
      <option value="off">Off</option><option value="fork">FieldSense · single core</option><option value="probe-voltage">V · two probes, AC/DC</option><option value="resistance">Ω · resistance and continuity</option>
    </select></label>
    {isFork&&<button type="button" className="tester-function" onClick={()=>onMethod(setup.method==='fork-current'?'fork-voltage':'fork-current')}>Yellow function · show {setup.method==='fork-current'?'volts':'amps'}</button>}
    {setup.method==='fork-voltage'&&<label>Earth reference<select value={setup.reference} onChange={e=>onReference(e.target.value as ForkSetup['reference'])}><option value="none">Choose a reference</option><option value="pad">Touch rear pad · black probe docked</option><option value="black">Black probe on bonded earth</option></select></label>}
    {isFork&&<details open><summary>Choose one insulated core</summary><ConductorPicker circuit={doc} selected={setup.wire} onPick={onWire}/></details>}
    {usingProbes&&<div className="tester-shortcuts">{(['red','black'] as const).map(c=><button type="button" key={c} aria-pressed={activeProbe===c} onClick={()=>onProbe(c)}>{c==='red'?'Red (+)':'Black (COM)'} · {describeEndpoint(doc,c==='red'?setup.a:setup.b)?.label??'Place probe'}</button>)}</div>}
    {(usingProbes||setup.method==='fork-voltage'&&setup.reference==='black')&&<details><summary>Choose {usingProbes?activeProbe:'black reference'} terminal by name</summary><TerminalPicker circuit={doc} label={(usingProbes?activeProbe:'black reference')+' tester terminal'} onPick={onEndpoint}/></details>}
    {setup.method==='resistance'&&<button type="button" aria-pressed={sound} onClick={()=>{if(!sound&&typeof AudioContext!=='undefined'){audio.current??=new AudioContext();void audio.current.resume().catch(()=>{});}setSound(!sound);}}>Continuity tone · {sound?'on':'off'}</button>}
    <p role="status">{held?'Display held. Release HOLD to take a fresh reading.':reading.explanation}</p>
    <div className="tester-shortcuts"><button type="button" aria-pressed={held} disabled={!held&&!['open','value','overrange'].includes(reading.status)} onClick={onHold}>{held?'Release HOLD':'HOLD'}</button>{usingProbes&&<button type="button" onClick={onClear}>Clear probes</button>}</div>
    {showRecord&&<button type="button" className="book-primary" disabled={held||!['value','open'].includes(reading.status)} onClick={onRead}>Record reading</button>}
    <details><summary>About this tester</summary><p>The probes compare two points up to 600 V AC or DC. The fork reads current up to 200 A AC. Its voltage function needs an earth reference and a single AC conductor between 16 and 600 V. The bench models steady sine-wave AC and smooth DC.</p><button type="button" onClick={()=>onSource('https://www.fluke.com/en-ie/product/electrical-testing/basic-testers/fluke-t6-600')}>Fluke specifications and photo</button></details>
  </section>;
}
export function TerminationPractice({onDone,onSource,onTool,action,requested}:{requested?:{id:PreparationTask;version:number};onDone:(id:PreparationTask,ok:boolean)=>void;onSource:(s:string)=>void;onTool:(visual:WorkshopVisual|undefined)=>void;action:React.RefObject<(()=>void)|undefined>}){
  const [open,setOpen]=useState(false),[id,setId]=useState<PreparationTask>('strip'),[value,setValue]=useState<number>(),[feedback,setFeedback]=useState<ReturnType<typeof prepareSample>>();
  const sample=terminations[id];
  useEffect(()=>{if(requested){setId(requested.id);setValue(undefined);setFeedback(undefined);}setOpen(!!requested);},[requested]);
  useEffect(()=>{if(open)onTool({type:sample.tool,task:id,setting:value,applied:!!feedback,accepted:!!feedback?.won});return ()=>onTool(undefined);},[open,id,value,feedback,sample.tool,onTool]);
  function apply(){if(value===undefined||feedback?.won)return;const response=prepareSample(id,value);setFeedback(response);onDone(id,response.won);}
  useEffect(()=>{if(open)action.current=apply;return ()=>{action.current=undefined;};});
  return <details open={open} className="termination-practice" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Practise using hand tools</summary>
    {open&&<><label>Isolated workshop sample<select value={id} onChange={e=>{setId(e.target.value as PreparationTask);setValue(undefined);setFeedback(undefined);}}>{(Object.keys(terminations) as PreparationTask[]).map(k=><option key={k} value={k}>{terminations[k].name}</option>)}</select></label>
      <div className="sample-equipment"><img src={publicAssetUrl('/models/thumbnails/'+sample.tool+'_default.png')} alt={sample.name}/><div><b>{sample.sample}</b><p>{sample.instruction}</p></div></div>
      <details><summary>Read the product marking</summary><p>{sample.documentation}</p><button type="button" onClick={()=>onSource(sample.source)}>Manufacturer reference</button></details>
      <label>{id==='strip'?'Strip length':id==='crimp'?'Ferrule size':'Driver setting'}<select value={value??''} onChange={e=>{setValue(e.target.value?Number(e.target.value):undefined);setFeedback(undefined);}}><option value="">Choose a setting</option>{sample.choices.map(v=><option key={v} value={v}>{v} {sample.unit}</option>)}</select></label>
      <button className="book-primary" type="button" disabled={value===undefined||feedback?.won} onClick={apply}>{sample.action}</button>
      {feedback&&<p role="status">{feedback.message}</p>}</>}
  </details>;
}
