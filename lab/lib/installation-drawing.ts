import {COMPONENTS} from './components';
import {getComponentTerminals} from './terminal-layout';
import {endpointKey,type CircuitDocument,type Endpoint,type Wire} from './types';
import type {JobSite} from './job-site';

export const DRAWING_INK:Record<string,string>={L:'#814629',L1:'#814629',L2:'#353638',L3:'#687378',N:'#246d9a',PE:'#65833a',control:'#785284',output:'#976330','DC+':'#af4650','DC-':'#394a55'};
export const sameEnds=(w:Wire,v:Wire)=>(endpointKey(w.from)===endpointKey(v.from)&&endpointKey(w.to)===endpointKey(v.to))||(endpointKey(w.from)===endpointKey(v.to)&&endpointKey(w.to)===endpointKey(v.from));
export function matchConnection(w:Wire,other:CircuitDocument){return other.wires.find(x=>sameEnds(w,x)&&x.role===w.role)??other.wires.find(x=>sameEnds(w,x));}
export function terminalSheet(doc:CircuitDocument,site:JobSite){
  const pins=new Map<string,{x:number;y:number;label:string}>();
  const y=141;let cursor=36;
  const blocks=doc.components.map(c=>{
    const terminals=getComponentTerminals(c,COMPONENTS[c.type]);
    const width=Math.max(122,terminals.length*47+20);
    const block={id:c.id,ref:site.items.find(v=>v.id===c.id)?.ref??c.id,name:c.label,type:c.type,x:cursor,width,pins:terminals};
    terminals.forEach((t,i)=>pins.set(endpointKey({component:c.id,terminal:t.id}),{x:cursor+(i+.5)*width/terminals.length,y,label:t.label}));
    cursor+=width+24;return block;
  });
  const lines=doc.wires.flatMap((wire,i)=>{const a=pins.get(endpointKey(wire.from)),b=pins.get(endpointKey(wire.to));return a&&b?[{wire,a,b,y:y+35+i*22}]:[];});
  return {blocks,pins,lines,width:Math.max(620,cursor+55),height:Math.max(257,y+80+lines.length*22)};
}
export function shortPoint(site:JobSite,doc:CircuitDocument,e:Endpoint){
  const c=doc.components.find(c=>c.id===e.component),ref=site.items.find(v=>v.id===e.component)?.ref??e.component;
  const t=c&&getComponentTerminals(c,COMPONENTS[c.type]).find(t=>t.id===e.terminal);
  return ref+' · '+(t?.label??e.terminal);
}
/** Physical conductors establish equipotential nets for drawing cross-references. Contacts never merge two nets here. */
export function drawingNets(doc:CircuitDocument){
  const parents=new Map<string,string>();
  function root(k:string):string{const parent=parents.get(k);if(!parent){parents.set(k,k);return k;}if(parent===k)return k;const result=root(parent);parents.set(k,result);return result;}
  doc.components.forEach(c=>getComponentTerminals(c,COMPONENTS[c.type]).forEach(t=>root(endpointKey({component:c.id,terminal:t.id}))));
  doc.wires.forEach(w=>{const a=root(endpointKey(w.from)),b=root(endpointKey(w.to));if(a!==b)parents.set(b,a);});
  const names=new Map<string,string>();
  for(const c of doc.components.filter(c=>/^source3?$/.test(c.type)))for(const t of COMPONENTS[c.type].terminals){
    const k=root(endpointKey({component:c.id,terminal:t.id}));
    names.set(k,names.has(k)?names.get(k)+' / '+t.label:t.label);
  }
  let n=0;
  return new Map([...parents.keys()].map(k=>{const r=root(k);if(!names.has(r))names.set(r,'X'+(++n));return [k, names.get(r)!];}));
}
export function controlElements(doc:CircuitDocument){
  const nets=drawingNets(doc);
  const out:{component:string;kind:'coil'|'no'|'nc'|'load';a:Endpoint;b:Endpoint;left:string;right:string}[]=[];
  for(const c of doc.components){const terms=COMPONENTS[c.type].terminals.map(t=>t.id);
    function add(one:string,two:string,kind:typeof out[number]['kind']){
      if(!terms.includes(one)||!terms.includes(two))return;
      const a={component:c.id,terminal:one},b={component:c.id,terminal:two};
      out.push({component:c.id,kind,a,b,left:nets.get(endpointKey(a))!,right:nets.get(endpointKey(b))!});
    }
    add('A1','A2','coil');add('COM','A','nc');add('COM','B','no');add('COM','NO','no');add('COM','NC','nc');add('COM','OUT','no');add('13','14','no');add('21','22','nc');add('95','96','nc');add('AUXIN','AUXOUT','no');add('IN','OUT',c.type==='overload'?'nc':'no');
    if(['indicator','led','chime','lamp','motor','pump'].includes(c.type))add('L','N','load');
    if(c.type==='floatvalve'){add('OPEN','COM','load');add('CLOSE','COM','load');}
  }
  return out;
}

export function ladderPaths(doc:CircuitDocument){
  const elements=controlElements(doc),nets=drawingNets(doc);
  const feeds=new Set<string>();
  for(const c of doc.components){
    if(!['source','source3','rcbo','mcb','mcb3','rcd','dcsupply','transformer','driver','fuse'].includes(c.type))continue;
    for(const t of COMPONENTS[c.type].terminals.filter(t=>['L','L1','L2','L3','LOUT','L1OUT','OUT','+'].includes(t.id))){
      const key=nets.get(endpointKey({component:c.id,terminal:t.id}));if(key)feeds.add(key);
    }
  }
  const contacts=elements.filter(e=>e.kind==='no'||e.kind==='nc');
  const wired=new Set(doc.wires.flatMap(w=>[endpointKey(w.from),endpointKey(w.to)]));
  const rows:{load:typeof elements[number];path:typeof contacts;feed?:string;returnLabel:string}[]=[];
  let remaining=16000;
  for(const load of elements.filter(e=>e.kind==='coil'||e.kind==='load')){
    const found:{path:typeof contacts;feed:string}[]=[];
    function trace(net:string,path:typeof contacts,seen:Set<string>){
      if(remaining<=0||found.length>=24||path.length>12||seen.has(net))return;
      remaining--;
      if(feeds.has(net)){found.push({feed:net,path:[...path].reverse()});return;}
      const used=new Set([...seen,net]);
      for(const element of contacts){
        if(element.left===net&&element.right!==net)trace(element.right,[...path,element],used);
        else if(element.right===net&&element.left!==net)trace(element.left,[...path,element],used);
      }
    }
    trace(load.left,[],new Set());
    const returnLabel=wired.has(endpointKey(load.b))?load.right:'Open';
    if(found.length)for(const f of found)rows.push({load,...f,returnLabel});else rows.push({load,path:[],returnLabel});
  }
  return rows;
}
