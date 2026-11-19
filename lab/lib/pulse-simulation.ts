import { endpointKey, type CircuitDocument,type Complex,type DeviceState,type SimulationResult } from './types.ts';

type Solver=(d:CircuitDocument,s:Record<string,DeviceState>,dt:number)=>SimulationResult;
const fraction=(x:unknown,defaultValue:number)=>Math.min(1,Math.max(0,typeof x==='number'&&Number.isFinite(x)?x:defaultValue));

/** Leading-edge-aligned controllers, settled DC during each interval. Independent PWM
 * clocks, switching edges and component heating during a pulse are outside this model. */
export function simulatePulses(document:CircuitDocument,previous:Record<string,DeviceState>,dt:number,solve:Solver):SimulationResult{
  const controllers=document.components.filter(c=>c.type==='pwmcontrol');
  const duties=new Map(controllers.map(c=>{
    const level=fraction(c.params.level,.5),mix=fraction(c.params.mix,.5),dual=c.variant==='tunable-white';
    return [c.id,{W:dual?level*(1-mix):level,C:dual?level*mix:0}];
  }));
  const boundaries=[...new Set([0,1,...[...duties.values()].flatMap(d=>[d.W,d.C])])].sort((a,b)=>a-b);
  const samples=boundaries.slice(1).map((end,i)=>{
    const midpoint=(boundaries[i]+end)/2;
    const components=document.components.map(c=>{
      const duty=duties.get(c.id);
      return duty?{...c,params:{...c.params,pulseW:duty.W>midpoint,pulseC:duty.C>midpoint}}:c;
    });
    return {weight:end-boundaries[i],result:solve({...document,components},previous,dt)};
  });
  const result=samples[0].result;
  if(samples.length===1)return result;
  const sum=(get:(r:SimulationResult)=>number)=>samples.reduce((n,s)=>n+s.weight*get(s.result),0);
  const values=(get:(r:SimulationResult)=>number)=>samples.map(s=>get(s.result));
  const varying=(a:number[])=>Math.max(...a)-Math.min(...a)>.05;
  // Work on fresh maps. Keep every subsample available until aggregation finishes.
  const combined:SimulationResult={...result,componentPower:{},deviceStates:structuredClone(result.deviceStates),terminalVoltages:{},wireCurrents:{},branchCurrents:{},
    converged:samples.every(s=>s.result.converged),totalPower:sum(r=>r.totalPower),totalCurrent:Math.sqrt(sum(r=>r.totalCurrent**2)),
    diagnostics:[...new Map(samples.flatMap(s=>s.result.diagnostics.map(d=>[d.id,d] as const))).values()],
    events:[...new Map(samples.flatMap(s=>s.result.events.map(e=>[e.component+' '+e.title,e] as const))).values()],
    elapsedMs:samples.reduce((ms,s)=>ms+s.result.elapsedMs,0),pwmTerminals:[],pwmWires:[]};
  for(const item of document.components){
    const power=sum(r=>r.componentPower[item.id]??0);combined.componentPower[item.id]=power;
    const state=combined.deviceStates[item.id];
    if(['led','lamp','cctstrip'].includes(item.type)){
      state.lightOutputPower=power;state.energized=power>.02;
      if(item.type==='cctstrip'){
        state.warmWatts=sum(r=>Number(r.deviceStates[item.id].warmWatts)||0);state.coolWatts=sum(r=>Number(r.deviceStates[item.id].coolWatts)||0);
        state.details=`Over one pulse cycle, the warm LEDs average ${state.warmWatts.toFixed(1)} W and the cool LEDs average ${state.coolWatts.toFixed(1)} W.`;
      }
    }
    const trip=samples.find(s=>s.result.deviceStates[item.id].tripped);
    if(trip){combined.deviceStates[item.id]=trip.result.deviceStates[item.id];combined.preTrip=trip.result.preTrip;}
  }
  for(const [name,base] of Object.entries(result.terminalVoltages)){
    if(!samples.every(s=>s.result.terminalVoltages[name]?.reference===base.reference))continue;
    combined.terminalVoltages[name]={...base,re:sum(r=>r.terminalVoltages[name].re),im:sum(r=>r.terminalVoltages[name].im)};
  }
  // Identify the switched net by wires (a PWM return may be labelled N on legacy LEDs).
  const pulsed=new Set<string>();
  for(const [id,duty] of duties)for(const channel of ['W','C'] as const)if(duty[channel]>0&&duty[channel]<1&&combined.deviceStates[id].energized)pulsed.add(id+'.'+channel);
  for(let changed=true;changed;){
    changed=false;
    for(const wire of document.wires){
      if(document.faults.some(f=>f.enabled&&f.wire===wire.id))continue;
      const a=endpointKey(wire.from),b=endpointKey(wire.to);
      if(pulsed.has(a)!==pulsed.has(b)){pulsed.add(a);pulsed.add(b);changed=true;}
    }
  }
  combined.pwmTerminals=[...pulsed];
  for(const field of ['wireCurrents','branchCurrents'] as const){
    const keys=new Set(samples.flatMap(s=>Object.keys(s.result[field])));
    for(const key of keys){
      const current=(r:SimulationResult):Complex=>r[field][key]??{re:0,im:0};
      const rms=Math.sqrt(sum(r=>Math.hypot(current(r).re,current(r).im)**2));
      const re=sum(r=>current(r).re),im=sum(r=>current(r).im),mean=Math.hypot(re,im);
      combined[field][key]=mean?{re:rms*re/mean,im:rms*im/mean}:{re:rms,im:0};
      if(field==='wireCurrents'&&varying(values(r=>Math.hypot(current(r).re,current(r).im))))combined.pwmWires!.push(key);
    }
  }
  return combined;
}
