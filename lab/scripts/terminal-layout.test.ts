import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, COMPONENT_LIST } from '../lib/components.ts';
import { getComponentTerminals, terminalInspectionDirection } from '../lib/terminal-layout.ts';
import { createGalleryInventory } from '../components/lab/ModelGallery.tsx';
import { LESSONS } from '../lib/lessons.ts';
import { measureResistance } from '../lib/simulation.ts';
import { routeWire, terminalPosition } from '../lib/routing.ts';
import type { ComponentInstance, CircuitDocument, Vec3 } from '../lib/types.ts';

const sample=(type:string,variant?:string):ComponentInstance=>({id:type,type,label:COMPONENTS[type].name,variant,params:{...COMPONENTS[type].defaults},position:[0,0,0],rotation:0});
const layout=(type:string,variant?:string)=>getComponentTerminals(sample(type,variant),COMPONENTS[type]);

test('every registry, lesson and gallery terminal has one finite physical mouth and a unit entry direction',()=>{
  const instances=[...COMPONENT_LIST.map(d=>sample(d.type)),...createGalleryInventory().flatMap(e=>[e.component,...e.companions??[]]),...LESSONS.flatMap(l=>l.circuit.components)];
  for(const c of instances){
    const d=COMPONENTS[c.type],resolved=getComponentTerminals(c,d);
    assert.equal(resolved.length,d.terminals.length,c.id);
    assert.equal(new Set(resolved.map(t=>t.id)).size,resolved.length,c.id);
    assert.deepEqual(resolved.map(t=>[t.id,t.role]),d.terminals.map(t=>[t.id,t.role]));
    if(c.type==='switch' && c.variant==='door-contact') {
      assert.match(resolved.find(t=>t.id==='COM')!.purpose,/door/);
      assert.match(resolved.find(t=>t.id==='OUT')!.purpose,/joins COM/);
    } else if(c.type==='selector' && c.variant==='float-changeover') {
      assert.match(resolved.find(t=>t.id==='COM')!.purpose,/float/);
      for(const id of ['A','B']) assert.match(resolved.find(t=>t.id===id)!.purpose,new RegExp(id+' joins COM'));
    } else {
      assert.deepEqual(resolved.map(t=>t.purpose),d.terminals.map(t=>t.purpose));
    }
    for(const t of resolved){
      assert.ok(t.anchor.every(Number.isFinite),`${c.id}.${t.id} has invalid coordinates`);
      assert.ok(Math.abs(Math.hypot(...t.entryDirection!)-1)<1e-8,`${c.id}.${t.id} invalid access direction`);
      if(c.variant==='float-changeover')assert.ok(t.entryDirection![1]<0&&t.entryDirection![2]<0,'Float contacts are on the downward cable tails');
      else if(['switch','switch2','socket','fcu','dimmer','selector','pushbutton'].includes(c.type))assert.deepEqual(t.entryDirection,[0,0,-1],c.id+' installation terminals behind the faceplate');
      assert.ok(t.group?.length,`${c.id}.${t.id} has no physical bank`);
    }
    for(let i=0;i<resolved.length;i++)for(let j=i+1;j<resolved.length;j++){
      const a=resolved[i].anchor,b=resolved[j].anchor;
      // Full clamp width is .135 and height .11. Separate rows/columns must
      // leave room for complete clamp bodies, not just their central points.
      assert.ok(Math.abs(a[0]-b[0])>=.14*Math.max(resolved[i].scale??1,resolved[j].scale??1)||Math.abs(a[1]-b[1])>=.12*Math.max(resolved[i].scale??1,resolved[j].scale??1)||Math.abs(a[2]-b[2])>=.14,`${c.id}: ${resolved[i].id}/${resolved[j].id} overlap`);
    }
  }
});

test('the camera approaches documented physical access banks and real fixture inscriptions resolve to stable IDs',()=>{
  const sw=sample('switch2'),breaker=sample('rcbo'),motor=sample('motor3');
  assert.ok(terminalInspectionDirection(sw,COMPONENTS.switch2)[2]<-.8);
  assert.ok(terminalInspectionDirection(breaker,COMPONENTS.rcbo,'LIN')[1]>.6);
  assert.ok(terminalInspectionDirection(motor,COMPONENTS.motor3,'U1')[1]>.8);
  assert.deepEqual(layout('switch2').map(t=>[t.id,t.label]),[['COM','COM'],['T1','L1'],['T2','L2']]);
  assert.ok(layout('rcbo').find(t=>t.id==='LOUT')!.entryDirection![1]<0);
});

test('bulb, downlight and batten connectors follow their different housing heights',()=>{
  const bulb=layout('lamp','bulb'),downlight=layout('lamp','downlight'),batten=layout('lamp','batten');
  const sy=COMPONENTS.lamp.size[1]/1.45;
  assert.equal(bulb.find(t=>t.id==='L')!.anchor[1],.269);
  assert.equal(bulb.find(t=>t.id==='PE')!.group,'Mounting-base earth');
  assert.ok(downlight.every(t=>t.anchor[1]===.70*sy-.039));
  assert.ok(batten.every(t=>t.anchor[1]===.72*sy-.039));
  assert.notDeepEqual(bulb.map(t=>t.anchor),downlight.map(t=>t.anchor));
  assert.notDeepEqual(downlight.map(t=>t.anchor),batten.map(t=>t.anchor));
  const emergency=layout('emergency');
  assert.notEqual(emergency.find(t=>t.id==='SL')!.group,emergency.find(t=>t.id==='L')!.group);
});

test('switch, FCU, rose, isolated converter and motor banks keep their electrical identities',()=>{
  const sw=layout('switch2');
  assert.notEqual(sw.find(t=>t.id==='COM')!.group,sw.find(t=>t.id==='T1')!.group);
  assert.equal(sw.find(t=>t.id==='T1')!.group,sw.find(t=>t.id==='T2')!.group);
  const fcu=layout('fcu');
  assert.notEqual(fcu.find(t=>t.id==='LIN')!.group,fcu.find(t=>t.id==='LOUT')!.group);
  const rose=layout('rose');
  for(const [a,b] of [['L','LOUT'],['N','NOUT'],['PE','PEOUT']])assert.equal(rose.find(t=>t.id===a)!.group,rose.find(t=>t.id===b)!.group);
  assert.equal(new Set(rose.map(t=>t.group)).size,4);
  assert.notEqual(layout('driver').find(t=>t.id==='L')!.group,layout('driver').find(t=>t.id==='+')!.group);
  const motor=layout('motor3');
  assert.equal(motor.filter(t=>t.group==='Winding starts').length,3);
  assert.equal(motor.filter(t=>t.group==='Winding ends').length,3);
  assert.equal(motor.find(t=>t.id==='PE')!.group,'Frame earth');
});

test('complete clamp bodies fit compact rose, indicator, batten and lampholder silhouettes',()=>{
  for(const type of ['rose','indicator']){
    const d=COMPONENTS[type],sx=d.size[0]/1.3,sy=d.size[1]/1.45;
    const radiusX=type==='rose'?.439:.29*sx,radiusY=type==='rose'?.439:.29*sy,cy=type==='rose'?.449:.61*sy;
    for(const t of layout(type))for(const signX of [-1,1])for(const signY of [-1,1]){
      const scale=t.scale??1,x=t.anchor[0]+signX*.0675*scale,y=t.anchor[1]+.039*scale+signY*.055*scale;
      assert.ok((x/radiusX)**2+((y-cy)/radiusY)**2<=1.001,`${type}.${t.id} protrudes past the circular fixture`);
    }
  }
  for(const [type,variant] of [['lamp','batten'],['emergency',undefined]] as const){
    const d=COMPONENTS[type],sx=d.size[0]/1.3,sy=d.size[1]/1.45;
    for(const t of layout(type,variant)){
      assert.ok(Math.abs(t.anchor[0])+.0675<=.615*sx);
      assert.ok(Math.abs(t.anchor[1]+.039-.72*sy)+.055<=.135*sy);
    }
  }
  const bulb=layout('lamp','bulb'),sx=COMPONENTS.lamp.size[0]/1.3;
  for(const t of bulb.filter(t=>t.id!=='PE'))assert.ok(Math.abs(t.anchor[0])+.0675<=.235*sx,'lamp clamp wider than holder neck');
});

test('automatic and manual conductors leave the rear at 0, 90 and 180 degrees without changing saved bends',()=>{
  const doc:CircuitDocument={version:1,id:'rear-route',name:'Rear route',revision:0,supply:{enabled:false,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[sample('lamp','batten'),{...sample('switch'),position:[3,0,1]}],wires:[{id:'w',from:{component:'lamp',terminal:'L'},to:{component:'switch',terminal:'OUT'},role:'L',resistance:.01,bends:[]}],faults:[]};
  for(const angle of [0,Math.PI/2,Math.PI])for(const manual of [false,true]){
    doc.components.forEach(c=>c.rotation=angle);
    const bends:Vec3[]=manual?[[2,1,3],[4,1,2]]:[];
    doc.wires[0].bends=structuredClone(bends);
    const before=structuredClone(doc),points=routeWire(doc,doc.wires[0]);
    const normal:Vec3=[-Math.sin(angle),0,-Math.cos(angle)];
    for(const [end,exit] of [[points[0],points[1]],[points.at(-1)!,points.at(-2)!]]){
      const projection=normal.reduce((sum,v,i)=>sum+v*(exit[i]-end[i]),0);
      assert.ok(projection>.2,'conductor starts on the wrong side');
    }
    assert.deepEqual(points[0],terminalPosition(doc,doc.wires[0].from));
    assert.deepEqual(points.at(-1),terminalPosition(doc,doc.wires[0].to));
    if(manual){let previous=-1;for(const bend of bends){const index=points.findIndex((p,i)=>i>previous&&p.every((v,j)=>v===bend[j]));assert.ok(index>previous,'mandatory manual bend was dropped');previous=index;}}
    assert.deepEqual(doc,before);
  }
});

test('fixture-form and inspection changes preserve circuit topology and terminal identities',()=>{
  const c=sample('lamp'),d=COMPONENTS.lamp,before=structuredClone(c),ids=d.terminals.map(t=>t.id);
  for(const variant of ['bulb','batten','downlight'])for(const view of ['normal','open','exploded','cutaway']){
    const presented={...c,variant,params:{...c.params,inspectionView:view}};
    const resolved=getComponentTerminals(presented,d);
    assert.deepEqual(resolved.map(t=>t.id),ids);
    assert.deepEqual(resolved.map(t=>t.anchor),getComponentTerminals({...presented,params:c.params},d).map(t=>t.anchor));
  }
  assert.deepEqual(c,before);
});

test('ceiling rose brass links join only the entries on their own block',()=>{
  const doc:CircuitDocument={version:1,id:'rose-test',name:'Rose',revision:0,supply:{enabled:false,phase:'single',voltage:240,frequency:50,sourceResistance:.12},components:[sample('rose')],wires:[],faults:[]};
  const resistance=(a:string,b:string)=>measureResistance(doc,{component:'rose',terminal:a},{component:'rose',terminal:b});
  for(const [a,b] of [['N','N3'],['NOUT','N3'],['LOOP1','LOOP3'],['LOOP2','LOOP3'],['L','LOUT'],['PE','PEOUT']]) {
    const measured=resistance(a,b);
    assert.ok(measured.value!==null && measured.value < .02,a+' and '+b+' share brass');
  }
  for(const [a,b] of [['LOOP2','N3'],['L','LOOP2'],['PE','N'],['PE','L']])assert.equal(resistance(a,b).reason,'open');
});
