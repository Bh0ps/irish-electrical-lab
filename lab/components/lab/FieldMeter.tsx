import type {RefObject} from 'react';
import {describeEndpoint} from '../../lib/endpoint-description';
import {definitionFor} from '../../lib/components';
import {getComponentTerminals} from '../../lib/terminal-layout';
import {looseHeaterPoint} from '../../lib/heater-flex-point';
import type {CircuitDocument,ComponentInstance,Endpoint} from '../../lib/types';
import type {useInstalledOhmmeter} from './useInstalledOhmmeter';
import './field-meter.css';

type Probe='red'|'black';
interface Controls {
  circuit:CircuitDocument; active:Probe; red?:Endpoint; black?:Endpoint;
  display:string; hint?:string; choose:(lead:Probe)=>void;
  record:()=>void; canRecord:boolean; recorded?:boolean; points?:()=>void;pointsButton?:RefObject<HTMLButtonElement|null>;
}
/** The same readout and lead buttons work beside the model and in its sheet. */
export function FieldMeter({circuit,active,red,black,display,hint,choose,record,canRecord,recorded,points,pointsButton}:Controls){
  return <section className="field-meter" aria-label="Meter at the fitting">
    <div className="field-meter-row">
      <output aria-label="Meter display" aria-live="polite">{display}</output>
      <div className="field-meter-leads" aria-label="Choose a probe" role="group">
        {(['red','black'] as const).map(lead=>{
          const point=describeEndpoint(circuit,lead==='red'?red:black),name=lead==='red'?'Red':'Black';
          return <button type="button" key={lead} aria-pressed={active===lead} aria-label={name+' probe'+(point?' at '+point.label:' in hand')} onClick={()=>choose(lead)}>
            <i data-lead={lead} aria-hidden="true"/>{name}{point&&<small>{point.pointLabel}</small>}
          </button>;
        })}
      </div>
      {points&&<button ref={pointsButton} type="button" onClick={points}>Points</button>}
      <button type="button" className="field-meter-save" aria-label={recorded?'Reading recorded':'Record reading'} disabled={!canRecord} onClick={record}>{recorded?'Recorded':'Record'}</button>
    </div>
    {hint&&<p>{hint}</p>}
  </section>;
}

export function SwitchMeterSheet({circuit,part,check,isolate,isolateLabel,operate,leave,hint}:{
  circuit:CircuitDocument;part:ComponentInstance;check:ReturnType<typeof useInstalledOhmmeter>;
  isolate?:()=>void;isolateLabel:string;operate:()=>void;leave:()=>void;hint?:string;
}){
  const copper=looseHeaterPoint(circuit);
  return <section className="switch-check" aria-label="Wall switch continuity check">
    <h3>Check the wall switch</h3>
    {!check.open?<><p>{check.safe?'The simulated supply is off. You can now see the rear contacts.':'This check measures resistance with the simulated supply off.'}</p>
      <button type="button" className="book-primary" disabled={!check.safe&&!isolate} onClick={check.safe?()=>check.setOpen(true):isolate}>{check.safe?'Show rear screws':isolateLabel}</button>
      {check.safe&&<button type="button" onClick={operate}>{part.params.closed===false?'Turn wall switch on':'Turn wall switch off'}</button>}</>:<>
      <FieldMeter circuit={circuit} active={check.lead} red={check.red} black={check.black} choose={check.choose}
        display={check.reading.shown+' Ω'} hint={hint??(check.red&&check.black?check.reading.explanation:undefined)}
        canRecord={check.canRecord} recorded={check.recorded} record={check.record}/>
      <fieldset><legend>Place the {check.lead} probe</legend><div>
        {getComponentTerminals(part,definitionFor(part)).map(t=>{
          const point={component:part.id,terminal:t.id},label=describeEndpoint(circuit,point)?.pointLabel??t.label;
          return <button type="button" key={t.id} onClick={()=>check.pick(point)}>{label}</button>;
        })}
        {copper&&<button type="button" onClick={()=>check.pick(copper)}>Loose brown wire</button>}
      </div></fieldset>
      <button type="button" onClick={()=>check.setOpen(false)}>Lift probes and refit</button>
    </>}
    <details><summary>What am I checking?</summary><p>Try L IN and L LOAD. With the switch on and the fuse intact, that path has very little resistance. Refit the switch and try its other position. Any other connected paths also count towards the reading.</p></details>
    <button type="button" onClick={leave}>Return to the room</button>
  </section>;
}
