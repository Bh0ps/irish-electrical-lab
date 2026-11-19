import {useRef,useState} from 'react';
import {matchesStudyQuery} from '../../lib/coursebook';
import {ChevronRight,LocateFixed,Search} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogTrigger} from '../ui/dialog';

export interface SiteDestination {value:string;label:string;detail?:string;keywords?:string;group:'Equipment'|'Rooms'|'Floors'}

export function SiteDestinations({places,immersive,visit,stop,afterVisit}:{
  places:SiteDestination[]; immersive:boolean; visit:(value:string)=>void; stop:()=>void; afterVisit:()=>void;
}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');
  const title=useRef<HTMLHeadingElement>(null),travelling=useRef(false);
  if(!immersive)return <label className="site-jump"><LocateFixed size={17}/><span>Go to</span>
    <select aria-label="Go to equipment" value="" onChange={e=>visit(e.target.value)}><option value="" disabled>Choose a destination</option>
      {(['Equipment','Floors','Rooms'] as const).map(group=>{
        const list=places.filter(place=>place.group===group);
        return list.length>0&&<optgroup key={group} label={group}>{list.map(place=><option key={place.value} value={place.value}>{[place.label,place.detail].filter(Boolean).join(' · ')}</option>)}</optgroup>;
      })}
    </select></label>;
  const matches=places.filter(place=>matchesStudyQuery([place.label,place.detail,place.keywords].join(' '),query));
  return <Dialog open={open} onOpenChange={next=>{setOpen(next);if(next){setQuery('');travelling.current=false;stop();}}}>
    <DialogTrigger asChild><button type="button"><LocateFixed size={18} aria-hidden="true"/>Find</button></DialogTrigger>
    <DialogContent className="site-finder" aria-describedby={undefined}
      onOpenAutoFocus={e=>{e.preventDefault();title.current?.focus();}}
      onCloseAutoFocus={e=>{if(travelling.current){e.preventDefault();afterVisit();}}}>
      <DialogHeader><DialogTitle tabIndex={-1} ref={title}>Find on site</DialogTitle></DialogHeader>
      <label className="site-destination-search"><Search size={18} aria-hidden="true"/>
        <input type="search" aria-label="Search rooms and fittings" placeholder="Search rooms and fittings" value={query} onChange={e=>setQuery(e.target.value)}/>
      </label>
      <div className="site-destination-list">
        {(['Equipment','Floors','Rooms'] as const).map(group=>{
          const items=matches.filter(place=>place.group===group);
          return items.length>0&&<section key={group}><h3>{group==='Equipment'?'Fittings':group}</h3>
            {items.map(place=><button type="button" key={place.value} onClick={()=>{travelling.current=true;setOpen(false);visit(place.value);}}>
              <span><b>{place.label}</b>{place.detail&&<small>{place.detail}</small>}</span><ChevronRight size={18} aria-hidden="true"/>
            </button>)}</section>;
        })}
        {!matches.length&&<p role="status">No matching rooms or fittings. <button type="button" onClick={()=>setQuery('')}>Show all</button></p>}
      </div>
    </DialogContent>
  </Dialog>;
}
