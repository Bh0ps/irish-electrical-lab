import {COMPONENTS} from './components';
import {b22SeatDepth,equipmentVariant,getComponentTerminals,lampForm} from './terminal-layout';
import {terminalDirection,terminalPosition} from './routing';
import type {CircuitDocument,Vec3} from './types';

export interface B22Seat {entry:Vec3;seat:Vec3}

/** Preserve the saved/routed rear entry. The same piece of insulated wire
 * continues through the hollow back to the start of the stripped copper.
 * Using the routed wire preserves its real selected role, stripe and core. */
export function b22WireSeats(doc:CircuitDocument):Map<string,Map<string,B22Seat>> {
  const result=new Map<string,Map<string,B22Seat>>();
  for(const c of doc.components){
    if(c.type!=='lamp'||lampForm(equipmentVariant(c,COMPONENTS.lamp))!=='bulb')continue;
    const seats=new Map<string,B22Seat>();
    for(const t of getComponentTerminals(c,COMPONENTS.lamp)){
      const end={component:c.id,terminal:t.id},entry=terminalPosition(doc,end),normal=terminalDirection(doc,end);
      const depth=b22SeatDepth(t.id);
      seats.set(t.id,{entry,seat:entry.map((n,i)=>n-depth*normal[i]) as Vec3});
    }
    result.set(c.id,seats);
  }
  return result;
}

/** Cable tails can run in either direction. Only extend the physical end
 * that coincides with this fitting; open cores and the sheath stay put. */
export function extendToB22Seats(points:Vec3[],a?:B22Seat,b?:B22Seat):Vec3[] {
  if(points.length<2||!a&&!b)return points;
  const matches=(p:Vec3,s?:B22Seat)=>s&&p.every((n,i)=>Math.abs(n-s.entry[i])<1e-6)?s.seat:undefined;
  const start=matches(points[0],a)??matches(points[0],b),last=points[points.length-1];
  const end=matches(last,a)??matches(last,b);
  if(!start&&!end)return points;
  return [...(start?[start]:[]),...points,...(end?[end]:[])];
}
