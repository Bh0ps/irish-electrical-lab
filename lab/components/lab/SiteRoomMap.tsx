import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Footprints} from 'lucide-react';
import {HOME_STAIR,SIDE_PASSAGE,STAIR_FOOT,STAIR_LANDING} from '../../lib/home-floorplan';
import {cupboardFoot,cupboardLeaf} from '../../lib/consumer-unit-site';
import type {JobSite} from '../../lib/job-site';
import {siteMapLayout,type MapLocation} from '../../lib/site-room-map';
import type {SiteDestination} from './SiteDestinations';

export function SiteRoomMap({site,location,places,visit}:{site:JobSite;location:MapLocation;places:SiteDestination[];visit:(value:string)=>void}){
  const [chosen,setChosen]=useState(location.room);
  const diagram=useRef<SVGSVGElement>(null),[viewport,setViewport]=useState({width:300,height:300});
  useLayoutEffect(()=>{
    if(!diagram.current)return;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      if(width&&height)setViewport(previous=>previous.width===width&&previous.height===height?previous:{width,height});
    });
    observer.observe(diagram.current);return ()=>observer.disconnect();
  },[]);
  const {rooms,walls,stairs}=useMemo(()=>siteMapLayout(site),[site]);
  const area=rooms.find(r=>r.id===chosen)??rooms[0];
  const upstairs=stairs&&area.id===STAIR_LANDING.id;
  const visible=rooms.filter(r=>!stairs||r.id!==STAIR_LANDING.id);
  const bounds=upstairs?{left:HOME_STAIR.west-.22,right:HOME_STAIR.east+.22,back:HOME_STAIR.back-.18,front:HOME_STAIR.landingEnd+.18}
    :{left:Math.min(...visible.map(r=>r.left)),right:Math.max(...visible.map(r=>r.right)),back:Math.min(...visible.map(r=>r.back)),front:Math.max(...visible.map(r=>r.front))};
  const pad=upstairs?.1:.28,markSize=upstairs?.45:1;
  const dx=bounds.right-bounds.left+2*pad,dz=bounds.front-bounds.back+2*pad;
  const rotated=viewport.width>viewport.height*1.35&&dz>dx;
  const width=rotated?dz:dx,height=rotated?dx:dz;
  const midX=(bounds.left+bounds.right)/2,midZ=(bounds.back+bounds.front)/2;
  const viewBox=[midX-width/2,midZ-height/2,width,height].join(' ');
  const pixelsPerMetre=Math.min(viewport.width/width,viewport.height/height);
  const textSize=Math.min(.90,Math.max(.62,12/pixelsPerMetre));
  const showMark=location.x!==undefined&&location.z!==undefined&&(!stairs||upstairs===(location.room===STAIR_LANDING.id));
  const fittings=places.filter(p=>p.group==='Equipment'&&p.room===area.id);
  return <div className="site-map-content">
    <div className="site-room-plan">
      <svg ref={diagram} viewBox={viewBox} role="group" aria-label={upstairs?'Upper stair and landing map':site.building.name+' room map'}>
        <g transform={rotated?'rotate(90 '+midX+' '+midZ+')':undefined}>
        {(upstairs?[area]:visible).map(room=>{
          const cx=(room.left+room.right)/2,cy=(room.back+room.front)/2,side=site.doorsteps&&room.id===SIDE_PASSAGE.id;
          const words=room.name.split(' ');
          const labelAngle=side||rotated?-90:0;
          const length=(rotated||side?room.front-room.back:room.right-room.left)-.14;
          const size=Math.min(textSize,length/(Math.max(...words.map(w=>w.length))*.57));
          return <g key={room.id} role="button" tabIndex={0} aria-label={'Select '+room.name} aria-pressed={area.id===room.id}
            onClick={()=>setChosen(room.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setChosen(room.id);}}}>
            <rect x={room.left} y={room.back} width={room.right-room.left} height={room.front-room.back}/>
            {!upstairs&&<text transform={'translate('+cx+' '+cy+') rotate('+labelAngle+')'} style={{fontSize:size}} textAnchor="middle" aria-hidden="true">
              {words.map((word,i)=><tspan key={i} x={0} dy={i?size*1.04:size*(.31-(words.length-1)*.52)}>{word}</tspan>)}
            </text>}
          </g>;
        })}
        {!upstairs&&<g fill="#4f6156" pointerEvents="none">{walls.map((w,i)=><rect key={i} x={w.x-w.w/2} y={w.z-w.d/2} width={w.w} height={w.d}/>)}</g>}
        {site.cupboardBoard&&!upstairs&&<g fill="#a4afa4" pointerEvents="none"><title>Board cupboard and open door</title>{[cupboardFoot,cupboardLeaf].map((b,i)=><rect key={i} x={b.x-b.w/2} y={b.z-b.d/2} width={b.w} height={b.d}/>)}</g>}
        {stairs&&<g stroke="#65786c" strokeWidth=".045" pointerEvents="none" fill="none">
          <rect x={HOME_STAIR.west} y={HOME_STAIR.back} width={HOME_STAIR.east-HOME_STAIR.west} height={STAIR_FOOT-HOME_STAIR.back}/>
          {Array.from({length:HOME_STAIR.risersPerFlight},(_,i)=><path key={i} d={'M'+HOME_STAIR.west+' '+(HOME_STAIR.turn+i*HOME_STAIR.going)+' H'+HOME_STAIR.east}/>)}
          <path d={'M'+HOME_STAIR.divider+' '+HOME_STAIR.turn+' V'+HOME_STAIR.landingEnd}/>
        </g>}
        <g fill="#a84d14" stroke="#fffaf0" strokeWidth=".06" pointerEvents="none">{fittings.map(f=>{const item=site.items.find(c=>c.id===f.value);return item&&<circle key={f.value} cx={item.position[0]} cy={item.position[2]} r={markSize*.14}><title>{f.label}</title></circle>;})}</g>
        {showMark&&<g className="site-map-marker" transform={'translate('+location.x+' '+location.z+') scale('+markSize+')'} pointerEvents="none">
          {location.walking?<g transform={'rotate('+(-Number(location.yaw)*180/Math.PI)+')'}><title>Your position and direction</title><path d="M0 -.53L.30 .36 0 .22 -.30 .36Z"/></g>
            :<><title>Fitting in view</title><circle r=".22"/></>}
        </g>}
        </g>
      </svg>
      <p className="map-location">{location.walking?'Your position · ': 'Current area · '}{location.name}{!!fittings.length&&<span className="map-fitting-key">Fittings</span>}</p>
    </div>
    <div className="site-room-actions">
      <label>Room on map<select value={area.id} onChange={e=>setChosen(Number(e.target.value))}>
        {rooms.map(room=><option value={room.id} key={room.id}>{room.name}</option>)}
      </select></label>
      <button type="button" className="room-visit" onClick={()=>visit('room:'+area.id)}><Footprints size={18} aria-hidden="true"/>Go to {area.name}</button>
      {fittings.length>0&&<section aria-label={'Fittings in '+area.name}><h3>Fittings here</h3>{fittings.map(f=>
        <button type="button" key={f.value} onClick={()=>visit(f.value)}>{f.label}</button>)}</section>}
    </div>
  </div>;
}
