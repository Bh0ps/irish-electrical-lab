import type {CircuitDocument,Endpoint,Wire} from './types';

/** Prove the installed two-push, separately called chime is supplied only by
 * its 12 V winding. The D814 screws are interchangeable; follow this build's
 * wire to tell which one goes to the chime. Unknown arrangements use the bench. */
export function sesameCallWiring(doc:CircuitDocument,id:string):{feed:Endpoint;call:Endpoint}|undefined {
  const push=doc.components.find(c=>c.id===id);
  if(push?.type!=='pushbutton'||push.variant!=='sesame'||doc.faults.some(f=>f.enabled&&f.type!=='open-wire'))return;
  const chime=doc.components.find(c=>c.type==='callchime'&&c.variant==='croma-100a');
  if(!chime)return;
  type Link={other:Endpoint;wire:Wire};
  const links=new Map<string,Map<string,Link[]>>();
  for(const wire of doc.wires)for(const [a,b] of [[wire.from,wire.to],[wire.to,wire.from]]){
    const component=links.get(a.component)??new Map<string,Link[]>();links.set(a.component,component);
    const entries=component.get(a.terminal)??[];entries.push({other:b,wire});component.set(a.terminal,entries);
  }
  function single(component:string,terminal:string){const list=links.get(component)?.get(terminal);return list?.length===1?list[0]:undefined;}
  const feed=single(chime.id,'AC1'),common=single(chime.id,'AC2');
  if(!feed||!common||feed.other.component!==common.other.component||feed.other.terminal===common.other.terminal||
    ![feed.other.terminal,common.other.terminal].every(pin=>pin==='+'||pin==='-'))return;
  const transformer=doc.components.find(c=>c.id===feed.other.component);
  if(transformer?.type!=='transformer'||Number(transformer.params.outputVoltage)!==12)return;
  // Trace both primary conductors too. A 12 V secondary rating says nothing
  // about the voltage actually produced by a primary wired to a different feed.
  const primaryRating=Number(transformer.params.ratedVoltage??transformer.params.nominalVoltage??240);
  if(doc.supply.phase!=='single'||!(doc.supply.voltage>0&&doc.supply.voltage<=primaryRating*1.1))return;
  const protection=single(transformer.id,'L')?.other.component;
  if(doc.components.find(c=>c.id===protection)?.type!=='rcbo'||!protection)return;
  const source=single(protection,'LIN')?.other.component;
  if(doc.components.find(c=>c.id===source)?.type!=='source'||!source)return;
  function pair(first:string,pin:string,last:string,end:string){
    const a=single(first,pin),b=single(last,end);
    return !!a&&a.wire===b?.wire&&a.other.component===last&&a.other.terminal===end;
  }
  if(!pair(transformer.id,'L',protection,'LOUT')||!pair(transformer.id,'N',protection,'NOUT')||
    !pair(protection,'LIN',source,'L')||!pair(protection,'NIN',source,'N'))return;
  const knownWires=new Set([feed.wire,common.wire]),parts=new Set([chime.id]);
  let chosen:{feed:Endpoint;call:Endpoint}|undefined;
  for(const input of ['FRONT','REAR']){
    const via=single(chime.id,input);if(!via)return;
    const end=via.other,button=doc.components.find(c=>c.id===end.component);
    if(button?.type!=='pushbutton'||parts.has(button.id)||!['COM','NO'].includes(end.terminal))return;
    const otherPin=end.terminal==='NO'?'COM':'NO',supply=single(button.id,otherPin);
    if(supply?.other.component!==transformer.id||supply.other.terminal!==feed.other.terminal)return;
    parts.add(button.id);knownWires.add(via.wire);knownWires.add(supply.wire);
    if(button.id===id)chosen={feed:{component:id,terminal:otherPin},call:end};
  }
  const secondary=(e:Endpoint)=>parts.has(e.component)||e.component===transformer.id&&['+','-'].includes(e.terminal);
  if(doc.wires.some(w=>!knownWires.has(w)&&(secondary(w.from)||secondary(w.to))))return;
  return chosen;
}
