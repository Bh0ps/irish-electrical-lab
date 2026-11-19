import {BELL_CUPBOARD as b} from '../../lib/bell-cupboard';
import {definitionFor} from '../../lib/components';
import {DRAWING_INK} from '../../lib/installation-drawing';
import {fixturePoint} from '../../lib/site-fixtures';
import {getComponentTerminals} from '../../lib/terminal-layout';
import type {JobSite} from '../../lib/job-site';
import type {CircuitDocument,Vec3,Wire} from '../../lib/types';

const scale=880, x=(value:number)=>77+(value-b.x)*scale, y=(value:number)=>141-(value-b.y)*scale;
export function insideBellCupboard(site:JobSite,wire?:Wire){
  return !!wire&&[wire.from,wire.to].every(end=>site.items.find(i=>i.id===end.component)?.fixture?.bellService);
}

export default function BellCupboardDrawing({doc,site,wire,route,zoom,find}:{doc:CircuitDocument;site:JobSite;wire:Wire;route:Vec3[];zoom:number;find:(id:string,terminal:string)=>void}){
  const tags=site.items.filter(i=>i.fixture?.bellService);
  const ends=[wire.from,wire.to];
  const labels=ends.map(e=>{
    const c=doc.components.find(d=>d.id===e.component)!;
    const t=getComponentTerminals(c,definitionFor(c)).find(t=>t.id===e.terminal)!;
    return tags.find(item=>item.id===e.component)!.ref+' · '+t.label;
  });
  return <svg className="electrical-sheet floor-sheet" role="group" aria-label="Utility cupboard enclosure detail" viewBox="0 0 440 275" style={{width:Math.max(100,zoom*100)+'%',minWidth:340*zoom}}>
    <text x="22" y="24" fill="#384d42" fontSize="13">Utility cupboard · Covers removed</text>
    <line x1={x(b.x+b.breakerSize[0]/2)} x2={x(b.x+b.transformerOffset-b.transformerSize[0]/2)} y1={y(b.y+b.conduitY)} y2={y(b.y+b.conduitY)} stroke="#bbc5bb" strokeWidth="14"/>
    {[false,true].map(tx=>{
      const cx=b.x+(tx?b.transformerOffset:0),[w,h]=tx?b.transformerSize:b.breakerSize;
      const id=tx?'tx':'protect',item=tags.find(i=>i.id===id);
      if(!item||!doc.components.some(c=>c.id===id))return null;
      return <g key={id}><rect x={x(cx-w/2)} y={y(b.y+h/2)} width={w*scale} height={h*scale} fill="#f5f3e7" stroke="#68806e" strokeWidth="2" rx="3"/>
        <text x={x(cx)} y="47" textAnchor="middle" fill="#2d493a" fontSize="13">{item.ref+' · '+(tx?'Bell transformer':'Bell supply')}</text>
      </g>;
    })}
    {tags.map(item=>{
      const c=doc.components.find(d=>d.id===item.id);
      if(!c)return null;
      const dims=item.id==='tx'?[.075,.083]:item.id==='protect'?[.036,.083]:[.023,.032];
      const cx=item.position[0],base=item.id==='protect'?item.position[1]+.52*item.scale:item.position[1]+.003;
      return <rect key={item.id} x={x(cx-dims[0]/2)} y={y(base+dims[1])} width={dims[0]*scale} height={dims[1]*scale} fill="#d7dfd4" stroke="#91a795" rx="2"/>;
    })}
    <polyline aria-label="Selected wire route" points={route.map(p=>x(p[0])+','+y(p[1])).join(' ')} fill="none" stroke={DRAWING_INK[wire.role]} strokeWidth="3" strokeLinejoin="round"/>
    {ends.map((end,i)=>{
      const item=tags.find(t=>t.id===end.component)!,c=doc.components.find(d=>d.id===item.id)!;
      const terminal=getComponentTerminals(c,definitionFor(c)).find(t=>t.id===end.terminal)!;
      const pos=fixturePoint(item.position,item.scale,item.fixture,c,terminal.anchor,item.rotation);
      return <g key={i} role="button" tabIndex={0} aria-label={'Find '+labels[i]} onClick={()=>find(c.id,terminal.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();find(c.id,terminal.id);}}}>
        <circle cx={x(pos[0])} cy={y(pos[1])} r="13" fill="transparent"/>
        <circle cx={x(pos[0])} cy={y(pos[1])} r="4" fill="#fffefa" stroke={DRAWING_INK[wire.role]} strokeWidth="2"/>
      </g>;
    })}
    <text x="22" y="253" fill="#34493c" fontSize="14">{labels.join('  →  ')}</text>
  </svg>;
}
