import {Minus,Plus} from 'lucide-react';
import {panelThermostat} from '../../lib/panel-heater';
import type {ComponentInstance,DeviceState} from '../../lib/types';

export function PanelHeatControl({component,state,change}:{component:ComponentInstance;state?:DeviceState;change:(amount:number)=>void}){
  const {setpoint,temperature}=panelThermostat(component.params);
  const watts=state?.elementWatts;
  return <section className="panel-heat" aria-label="Heater control">
    <div><b>Manual heat</b><small>Room held at {temperature} °C for this job.</small></div>
    <div className="panel-heat-setting">
      <button type="button" aria-label="Lower heater setting" disabled={!state?.heaterSupplied||setpoint<=7} onClick={()=>change(-1)}><Minus size={18}/></button>
      <output aria-label="Heater setting">{setpoint} °C</output>
      <button type="button" aria-label="Raise heater setting" disabled={!state?.heaterSupplied||setpoint>=30} onClick={()=>change(1)}><Plus size={18}/></button>
    </div>
    <small aria-live="polite">{typeof watts==='number'?Math.round(watts)+' W at the element':'Waiting for a reading'}</small>
  </section>;
}
