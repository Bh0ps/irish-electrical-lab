import {SERVICE_AREAS,serviceWalls,type ServiceKind} from '../../lib/service-floorplan';
import type {JobSite} from '../../lib/job-site';
export function serviceSpaces(kind:ServiceKind){
  const a=SERVICE_AREAS[kind];
  return [...[-6.6,-2.2,2.2].map((left,id)=>({id,left,right:left+4.4,back:-2.8,front:2.8})),
    {id:3,left:-6.6,right:6.6,back:2.8,front:6},{...a,id:4}];
}
export function ServicePlan({site,kind,x,y}:{site:JobSite;kind:ServiceKind;x:(n:number)=>number;y:(n:number)=>number}){
  const a=SERVICE_AREAS[kind],walls=serviceWalls(kind),spaces=serviceSpaces(kind);
  return <g aria-label={site.building.name+' rooms and service access'}>
    {spaces.filter(r=>r.id!==3).map(r=><rect key={r.id} x={x(r.left)} y={y(r.back)} width={(r.right-r.left)*41} height={(r.front-r.back)*41} fill={r.id===4?'#ebf0df':'#f4f4e8'}/>)}
    {[...walls.original,...walls.annex].map((b,i)=><rect key={i} x={x(b.x-b.w/2)} y={y(b.z-b.d/2)} width={b.w*41} height={b.d*41} fill="#4c655d"/>)}
    <rect x={x(a.station.x-a.station.w/2)} y={y(a.station.z-a.station.d/2)} width={a.station.w*41} height={a.station.d*41} fill="#c0ccbb" stroke="#8b9c8f"/>
    {kind==='works'&&<path d={`M${x(a.station.x-1.54)} ${y(a.station.z+1.28)}h${3.08*41}`} stroke="#bda154" strokeWidth="3"/>}
    {spaces.map(r=><text key={r.id} x={x((r.left+r.right)/2)} y={y(r.id===3?4.8:r.front-.58)} textAnchor="middle" className="room-caption">{site.location(r.id)}</text>)}
  </g>;
}
