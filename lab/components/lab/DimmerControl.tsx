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
    <p>{closed?'Turn the light down, then back up. Watch the lamp as you go.':'The light is switched off. Select the knob to switch it on.'}</p>
    <dl className="dimmer-readings"><div><dt>Resistance in the dimmer</dt><dd>{state?.dimmerResistance==='open'?'Open circuit':numberText(state?.dimmerResistance,'Ω')}</dd></div><div><dt>Volts across the dimmer</dt><dd>{state?.voltageDropResolved===false?'No reading':numberText(state?.voltageDrop,'V')}</dd></div><div><dt>Current</dt><dd>{numberText(state?.dimmerCurrent,'A')}</dd></div></dl>
    <details><summary>How the dimmer works</summary><p>Turn the knob down and the bench adds resistance. Less current flows through the lamp and it dims. If a wire goes round the dimmer, the lamp stays bright.</p><p>The real HQ1A controls how much of each AC cycle reaches the lamp. Use the bench readings to compare settings. The watts lost in the bench resistor tell you nothing about how hot the wall dimmer gets.</p></details>
  </section>;
}
