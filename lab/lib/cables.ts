import type { CableCore, CableKind, CableRun, CircuitDocument, TerminalRole, Wire } from './types.ts';

export const CABLE_CORES: readonly CableCore[] = ['brown', 'blue', 'green-yellow'];
// The illustrated Irish flat sample places its insulated protective core in the middle.
export const FLAT_CORE_ORDER: readonly CableCore[] = ['brown','green-yellow','blue'];
export const CABLE_CORE_LABEL: Record<CableCore, string> = {red:'Red',white:'White',yellow:'Yellow',black:'Black',brown: 'Brown', blue: 'Blue', 'green-yellow': 'Green/yellow'};
export const CABLE_LABEL: Record<CableKind, string> = {single:'Insulated single', flat:'Flat twin and earth', flex:'Round flex','bell-pair':'Two-core bell cable','led-pair':'Flexible LED pair','multi-strip':'Multichannel strip cable'};
export const CORE_COLOUR:Record<CableCore,string>={red:'#b82927',white:'#f6f1e6',black:'#202126',yellow:'#e0b52b',brown:'#74452d',blue:'#286db0','green-yellow':'#72852f'};
const coreSets:Record<CableKind,readonly CableCore[]>={single:['brown'],flex:CABLE_CORES,flat:FLAT_CORE_ORDER,'bell-pair':['red','white'],'led-pair':['red','black'],'multi-strip':['red','white','yellow','black']};
export const cableCores=(kind:CableKind)=>coreSets[kind];
export const cableKinds=Object.keys(coreSets) as CableKind[];
export const isSheathKind=(value:unknown):value is CableRun['kind']=>typeof value==='string'&&value!=='single'&&Object.hasOwn(coreSets,value);
export interface CableChoice { kind: CableKind; runId?: string; core?: CableCore; newRun?: boolean }

function sameHousings(run: CableRun, wire: Wire) {
  return run.from.component === wire.from.component && run.to.component === wire.to.component
    || run.to.component === wire.from.component && run.from.component === wire.to.component;
}
function nominalCore(role: TerminalRole): CableCore {
  return role === 'PE' ? 'green-yellow' : role === 'N' ? 'blue' : 'brown';
}
export function markedRole(core: CableCore, intended: TerminalRole): TerminalRole {
  if (['red','white','yellow','black'].includes(core))return intended;
  if (core === 'green-yellow') return 'PE';
  if (core === 'blue') return 'N';
  return intended === 'N' || intended === 'PE' ? 'L' : intended;
}

/** Suggestions apply to the pictured teaching sample, never to design or sizing. */
export function suggestedCableChoice(document: CircuitDocument, target?: Wire, example?: CircuitDocument): CableChoice {
  if (!target || !document.lessonId || document.supply.phase !== 'single') return {kind:'single'};
  const source=example?.lessonId===document.lessonId ? example : document;
  const sample=target.cable && source.cableRuns?.find(run=>run.id===target.cable?.runId);
  if(sample && target.cable){
    const belongs=source.wires.filter(w=>w.cable?.runId===sample.id);
    const matches=(a:Wire['from'],b:Wire['from'])=>a.component===b.component&&a.terminal===b.terminal;
    const laid=document.wires.find(w=>w.cable && belongs.some(original=>
      matches(w.from,original.from)&&matches(w.to,original.to)||matches(w.from,original.to)&&matches(w.to,original.from)));
    const current=document.cableRuns?.find(run=>run.id===laid?.cable?.runId && run.kind===sample.kind);
    return {kind:sample.kind, ...(current?{runId:current.id}:{}),core:target.cable.core};
  }
  const other=source.wires.filter(w=>w.from.component===target.from.component && w.to.component===target.to.component ||
    w.from.component===target.to.component && w.to.component===target.from.component);
  if(other.length<2||other.length>3||new Set(other.map(w=>nominalCore(w.role))).size!==other.length)return {kind:'single'};
  const types = [target.from, target.to].map(end => document.components.find(c => c.id === end.component)?.type);
  if(types.some(type=>type==='plug'||type==='valve'||type==='valve3'))return {kind:'flex'};
  if (types.some(type => type && ['socket','lamp','rose','switch','switch2','dimmer','junction'].includes(type))) return {kind:'flat'};
  return {kind:'single'};
}

function suggestedCore(kind: CableKind, wire: Wire): CableCore {
  const markings = [wire.from.terminal, wire.to.terminal];
  if (kind === 'bell-pair') return markings.includes('-') || markings.includes('AC2') ? 'white' : 'red';
  if (kind === 'led-pair' || kind === 'multi-strip') {
    if (wire.role === 'DC-') return 'black';
    if (wire.role === 'control') return kind === 'led-pair' ? 'black' : markings.includes('C') ? 'yellow' : 'white';
    return 'red';
  }
  return nominalCore(wire.role);
}

/** Only terminated cores become wires in the existing simulation graph. An available
 * core has two loose ends, even if the other cores in the same sheath carry current. */
export function addCableConnection(document: CircuitDocument, wire: Wire, choice: CableChoice): {document: CircuitDocument; choice: CableChoice} {
  if (document.wires.length >= 300) throw new Error('This bench already contains 300 connected conductors.');
  if (choice.kind === 'single') {
    const single={...wire};delete single.cable;
    return {document:{...document,wires:[...document.wires,single]},choice};
  }
  const runs = document.cableRuns ?? [];
  const cores=cableCores(choice.kind);
  const core = choice.core ?? suggestedCore(choice.kind, wire);
  if(!cores.includes(core))throw Error('Choose a core present in this cable.');
  const inUse = (run: CableRun) => document.wires.some(w => w.cable?.runId === run.id && w.cable.core === core);
  let run = runs.find(r => r.id === choice.runId && r.kind === choice.kind);
  if (!run && !choice.newRun) run = runs.find(r => r.kind === choice.kind && sameHousings(r,wire) && !inUse(r));
  if (run && inUse(run)) throw new Error(CABLE_CORE_LABEL[core]+' is already connected in this cable. Select an open core or start a new cable.');
  if (!run && runs.length >= 300) throw new Error('This bench already contains 300 cable sheaths.');
  if (!run && wire.from.component === wire.to.component) throw new Error('Use an insulated single for a link inside one piece of equipment.');
  const existing = !!run;
  if (!run) {
    let id = 'cable-'+wire.id;
    for (let suffix = 2; runs.some(existingRun => existingRun.id === id); suffix++) id = 'cable-'+wire.id+'-'+suffix;
    run = {id,kind:choice.kind,from:{...wire.from},to:{...wire.to}};
  }
  const reverse = wire.from.component === run.to.component || wire.to.component === run.from.component;
  const landed: Wire = {...wire, role:markedRole(core,wire.role), cable:{runId:run.id,core,reversed:reverse}};
  // An explicit choice of a particular cable stays pinned. The normal workflow
  // automatically finds the next matching sheath as the learner changes equipment.
  return {document:{...document,cableRuns:existing ? runs : [...runs,run], wires:[...document.wires,landed]},
    choice:{kind:choice.kind,...(choice.runId || choice.newRun ? {runId:run.id} : {})}};
}

export function describeCableCore(document: CircuitDocument, wire: Wire): string {
  const run = wire.cable && document.cableRuns?.find(r => r.id === wire.cable!.runId);
  return run && wire.cable ? CABLE_LABEL[run.kind]+' · '+CABLE_CORE_LABEL[wire.cable.core]+' core' : CABLE_LABEL.single;
}

/** Removing equipment also removes its cable entry. Any surviving electrically
 * connected tails become singles; discarding a physical sheath cannot sever them. */
export function cleanCableRuns(document: CircuitDocument): CircuitDocument {
  if (!document.cableRuns?.length) return document;
  const ids = new Set(document.components.map(c => c.id));
  const cableRuns = document.cableRuns.filter(r => ids.has(r.from.component) && ids.has(r.to.component));
  if (cableRuns.length === document.cableRuns.length) return document;
  const keep = new Set(cableRuns.map(r => r.id));
  return {...document,cableRuns,wires:document.wires.map(wire => {
    if (!wire.cable || keep.has(wire.cable.runId)) return wire;
    const {cable: _removed, ...single} = wire;
    return single;
  })};
}

/** Original socket links and an appliance flex on the teaching bench. Each
 * conductor retains its original terminals, ID, resistance and position in
 * the wire list. Saved examples from earlier versions still load as drawn. */
export function furnishCableExamples(document:CircuitDocument):CircuitDocument {
  const sockets=[17,18,19].includes(document.lessonId??0),flex=document.lessonId===20;
  const id=document.lessonId??0;
  if(id>=65){
    let next:CircuitDocument={...document,wires:[]};
    for(const wire of document.wires){
      const from=wire.from.component,to=wire.to.component;
      const two=(from==='near'&&to==='far')||(from==='pwm'&&to==='strip')||(['pwm','controller'].includes(to)&&from==='driver');
      const multi=from==='controller'&&to==='tape',bell=from==='tx'&&to==='chime';
      if(two||multi||bell) next=addCableConnection(next,wire,{kind:multi?'multi-strip':bell?'bell-pair':'led-pair'}).document;
      else next.wires.push(wire);
    }
    return next;
  }
  if(!sockets&&!flex)return document;
  const fusedSpur=id===19 && document.components.some(c=>c.id==='branch-fuse'&&c.type==='fcu');
  const applianceSwitch=flex && document.components.some(c=>c.id==='fcu-switch'&&c.type==='fcu');
  let next:CircuitDocument={...document,wires:[]},lead:string|undefined,feed:string|undefined;
  for(const wire of document.wires){
    if(applianceSwitch && wire.to.component==='fcu-switch'){
      // Line and neutral leave the breaker. The earth core of the same cable
      // starts on the earth connection at the supply.
      next=addCableConnection(next,wire,{kind:'flat',runId:feed}).document;
      feed=next.wires.at(-1)?.cable?.runId;
    }else if(sockets && wire.from.component.startsWith('socket-') && (wire.to.component.startsWith('socket-') || fusedSpur&&wire.to.component==='branch-fuse')){
      next=addCableConnection(next,wire,{kind:'flat'}).document;
    }else if((flex||fusedSpur)&&wire.to.component==='fixed'){
      next=addCableConnection(next,wire,{kind:'flex',runId:lead}).document;
      lead=next.wires.at(-1)?.cable?.runId;
    }else next.wires.push(wire);
  }
  return next;
}
