import type {ComponentInstance,Parameters} from './types';

// The PLX050E is marked 500 W, 230–240 V. The study element is calibrated at
// the 240 V preset. A room held at 18 °C lets the learner try manual heat.
export const PLX_DEFAULTS={watts:500,nominalVoltage:240,temperature:18,setpoint:21} as const;
export function isPanelHeater(item:Pick<ComponentInstance,'type'|'variant'>){
  return item.type==='heater'&&item.variant==='plx050e';
}
export function panelThermostat(params:Parameters){
  const setting=Number(params.setpoint??PLX_DEFAULTS.setpoint),ambient=Number(params.temperature??PLX_DEFAULTS.temperature);
  const setpoint=Number.isFinite(setting)?Math.min(30,Math.max(7,setting)):PLX_DEFAULTS.setpoint;
  const temperature=Number.isFinite(ambient)?ambient:PLX_DEFAULTS.temperature;
  return {setpoint,temperature,calling:setpoint>temperature};
}
