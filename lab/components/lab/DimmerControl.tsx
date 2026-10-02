'use client';
import type { ComponentInstance, DeviceState } from '../../lib/types';
import { COMPONENTS } from '../../lib/components';

const numberText=(value:unknown,unit:string)=>typeof value==='number'&&Number.isFinite(value)?`${value.toLocaleString('en-IE',{maximumFractionDigits:2})} ${unit}`:'Calculating…';

export default function DimmerControl({component,state,onChange,onStart,onEnd}:{component:ComponentInstance;state?:DeviceState;onChange:(level:number)=>void;onStart:()=>void;onEnd:()=>void}){
  const params={...COMPONENTS.dimmer.defaults,...component.params};
  const percent=Math.round(Math.min(1,Math.max(0,Number(params.level)||0))*100);
  const closed=Boolean(params.closed);
  return <section className="dimmer-control" aria-label="Dimmer control">
    <label className="dimmer-level-label" htmlFor="dimmer-brightness"><b>Dimmer level</b><output>{percent}%</output></label>
    <input id="dimmer-brightness" aria-label="Dimmer brightness" type="range" min="0" max="100" step="1" value={percent} onPointerDown={onStart} onPointerUp={onEnd} onPointerCancel={onEnd} onBlur={onEnd} onChange={event=>onChange(Number(event.target.value)/100)}/>
    <div className="dimmer-range-labels"><span>Off</span><span>Full</span></div>
    <p>{closed?'Drag to turn the knob and adjust the connected light.':'The dimmer is switched off. Click its knob to switch on.'}</p>
    <dl className="dimmer-readings"><div><dt>Series resistance</dt><dd>{state?.dimmerResistance==='open'?'Open circuit':numberText(state?.dimmerResistance,'Ω')}</dd></div><div><dt>Voltage drop</dt><dd>{state?.voltageDropResolved===false?'Unresolved':numberText(state?.voltageDrop,'V')}</dd></div><div><dt>Current</dt><dd>{numberText(state?.dimmerCurrent,'A')}</dd></div></dl>
    <details><summary>How this study model dims</summary><p>Lower settings increase an equivalent series resistance. The actual connections and load determine voltage, current, power and visible brightness. A bypassed lamp stays bright.</p><p>This is an educational resistance model. Real electronic dimmers control the waveform; the calculated resistor loss does not represent their heating.</p></details>
  </section>;
}
