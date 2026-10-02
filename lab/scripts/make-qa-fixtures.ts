import { writeFileSync,mkdirSync } from 'node:fs';
import { COMPONENTS } from '../lib/components.ts';
import { LESSONS } from '../lib/lessons.ts';
import type { CircuitDocument,Wire } from '../lib/types.ts';
const path=new URL('../../verification/fixtures/',import.meta.url);mkdirSync(path,{recursive:true});
const circuit:CircuitDocument={version:1,id:'benchmark-30',name:'30-component performance study',revision:1,supply:{phase:'single',enabled:true,voltage:240,frequency:50,sourceResistance:.12},components:[{id:'s',type:'source',label:'Study supply',position:[-9,0,-4],rotation:0,params:{...COMPONENTS.source.defaults}},{id:'p',type:'rcbo',label:'RCBO 16 A',position:[-6,0,-4],rotation:0,params:{...COMPONENTS.rcbo.defaults}}],wires:[],faults:[]};
function connect(a:string,at:string,b:string,bt:string,role:Wire['role']){circuit.wires.push({id:'wire-'+circuit.wires.length,from:{component:a,terminal:at},to:{component:b,terminal:bt},role,resistance:.01,bends:[]});}
connect('s','L','p','LIN','L');connect('s','N','p','NIN','N');
for(let i=0;i<28;i++){const id='light-'+i;circuit.components.push({id,type:'lamp',label:'Bayonet luminaire '+(i+1),position:[(i%7-3)*2.6,0,Math.floor(i/7)*2.4],rotation:0,params:{...COMPONENTS.lamp.defaults,watts:60}});connect('p','LOUT',id,'L','L');connect('p','NOUT',id,'N','N');connect('s','PE',id,'PE','PE');}
writeFileSync(new URL('30-components.json',path),JSON.stringify(circuit,null,2));
writeFileSync(new URL('sample-circuit.json',path),JSON.stringify(LESSONS[6].circuit,null,2));
writeFileSync(new URL('invalid-circuit.json',path),JSON.stringify({...LESSONS[6].circuit,version:99}));
console.log('Local browser QA fixtures written.');
