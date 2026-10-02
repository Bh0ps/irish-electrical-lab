import * as THREE from 'three';
import { COMPONENTS } from './components.ts';
import { getComponentTerminals } from './terminal-layout.ts';
import type { CircuitDocument, ComponentInstance, Endpoint, Vec3 } from './types.ts';

export type PathFilter = 'all' | 'L' | 'N' | 'PE' | 'control' | 'none';
export type RenderQuality = 'auto' | 'high' | 'economy';
export const SNAP_STEP = .25;
export const snapWorkbenchPoint = (point: Vec3): Vec3 => [Math.round(point[0] / SNAP_STEP) * SNAP_STEP, 0, Math.round(point[2] / SNAP_STEP) * SNAP_STEP];
export const endpointEquals = (a?: Endpoint, b?: Endpoint) => !!a && !!b && a.component === b.component && a.terminal === b.terminal;

/** Presentation categories follow actual terminal connections, never current or
 * the user's wire colour. A mistaken PE/N join therefore belongs to both paths.
 * Potential contact paths are inspectable even while a switch is open. */
export function tracePresentationPaths(document: CircuitDocument): Map<string, Set<PathFilter>> {
  const adjacency = new Map<string, Set<string>>();
  const seeds = new Map<string, Set<PathFilter>>();
  const key = (component: string, terminal: string) => `${component}.${terminal}`;
  const link = (a: string, b: string) => { (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a)!).add(b); (adjacency.get(b) ?? adjacency.set(b, new Set()).get(b)!).add(a); };
  for (const component of document.components) {
    const definition = COMPONENTS[component.type]; if (!definition) continue;
    const terminals = getComponentTerminals(component, definition);
    for (const terminal of terminals) {
      let category: PathFilter = terminal.role === 'PE' ? 'PE' : terminal.role === 'N' ? 'N' : /^L[123]?$/.test(terminal.role) || terminal.role === 'output' ? 'L' : 'control';
      if (['contactor','overload','relay'].includes(component.type) && /^\d$/.test(terminal.id)) category = 'L';
      if (['vfd','motor3'].includes(component.type) && /^[UVW][12]?$/.test(terminal.id)) category = 'L';
      seeds.set(key(component.id, terminal.id), new Set([category]));
    }
    const connect = (...ids: string[]) => { const present = ids.filter(id => terminals.some(t => t.id === id)); for (let i=1;i<present.length;i++) link(key(component.id,present[0]),key(component.id,present[i])); };
    if (['terminal','neutralbar','earthbar','junction'].includes(component.type)) connect(...terminals.map(t=>t.id));
    if (['panel','meter','plug','rose'].includes(component.type)) { connect('L','LOUT'); connect('N','NOUT'); connect('PE','PEOUT'); }
    if (['mcb','fuse'].includes(component.type)) connect('IN','OUT');
    if (['rcd','rcbo','isolator','fcu'].includes(component.type)) { connect('LIN','LOUT'); connect('NIN','NOUT'); }
    if (['mcb3','rcd3','isolator3','plug3'].includes(component.type)) { for(const phase of ['L1','L2','L3','N']) connect(phase+'IN',phase+'OUT'); connect('PE','PEOUT'); }
    if (['switch','switch2','dimmer','pushbutton','selector'].includes(component.type)) connect('COM','OUT','T1','T2','NO','NC','A','B');
    if (component.type==='intermediate') connect('A','B','C','D');
    if (['thermostat','cutout'].includes(component.type)) connect('COM','OUT');
    if (['timer','smartrelay','sensor'].includes(component.type)) connect('IN','OUT');
    if (['contactor','overload'].includes(component.type)) { connect('1','2'); connect('3','4'); connect('5','6'); connect('13','14'); connect('21','22'); connect('95','96'); }
    if (component.type==='relay') connect('COM','NO','NC');
    if (component.type==='changeover') { connect('A','B','OUT'); connect('AN','BN','NOUT'); }
  }
  for(const wire of document.wires) link(key(wire.from.component,wire.from.terminal),key(wire.to.component,wire.to.terminal));
  const categories = new Map<string,Set<PathFilter>>(), seen = new Set<string>();
  for(const node of adjacency.keys()) {
    if(seen.has(node))continue;
    const queue=[node], group:string[]=[], roles=new Set<PathFilter>(); seen.add(node);
    for(let i=0;i<queue.length;i++){const current=queue[i];group.push(current);for(const role of seeds.get(current)??[])roles.add(role);for(const next of adjacency.get(current)??[])if(!seen.has(next)){seen.add(next);queue.push(next);}}
    for(const current of group)categories.set(current,roles);
  }
  return new Map(document.wires.map(wire=>[wire.id,new Set([...(categories.get(key(wire.from.component,wire.from.terminal))??[]),...(categories.get(key(wire.to.component,wire.to.terminal))??[])])]));
}
export const pathMatches = (categories: Set<PathFilter> | undefined, filter: PathFilter) => filter==='all' || filter!=='none' && !!categories?.has(filter);

export function componentBounds(component: ComponentInstance): THREE.Box3 {
  const size=COMPONENTS[component.type]?.size??[1,1,1];
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...component.position),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),component.rotation),new THREE.Vector3(1,1,1));
  return new THREE.Box3(new THREE.Vector3(-size[0]/2,0,-size[2]/2),new THREE.Vector3(size[0]/2,size[1],size[2]/2)).applyMatrix4(matrix);
}
export function sceneBounds(document:CircuitDocument,routes?:Map<string,Vec3[]>):THREE.Box3 {
  const bounds=new THREE.Box3();for(const c of document.components)bounds.union(componentBounds(c));for(const points of routes?.values()??[])for(const p of points)bounds.expandByPoint(new THREE.Vector3(...p));
  if(bounds.isEmpty())bounds.set(new THREE.Vector3(-3,0,-2),new THREE.Vector3(3,1,2));return bounds;
}
export function selectedPartBounds(component:ComponentInstance,part:string|undefined,root?:THREE.Object3D):THREE.Box3 {
  const definition=COMPONENTS[component.type], semantic=new THREE.Box3();
  root?.updateWorldMatrix(true,true);
  if(root&&part)root.traverse(node=>{if(node.userData.partId===part||node.name===`part:${part}`||node.userData.terminalId===part||node.name===`terminal:${part}`)semantic.union(new THREE.Box3().setFromObject(node));});
  if(!semantic.isEmpty())return semantic;
  if(definition&&part&&(part==='terminals'||definition.terminals.some(t=>t.id===part))){const anchors=getComponentTerminals(component,definition).filter(t=>part==='terminals'||t.id===part);const matrix=new THREE.Matrix4().makeRotationY(component.rotation);matrix.setPosition(...component.position);for(const t of anchors)semantic.expandByPoint(new THREE.Vector3(...t.anchor).applyMatrix4(matrix));if(!semantic.isEmpty())return semantic.expandByScalar(.1);}
  return componentBounds(component);
}
export function placementClear(document:CircuitDocument,type:string,position:Vec3):boolean {
  const definition=COMPONENTS[type];if(!definition)return false;
  const proposed=componentBounds({id:'@ghost',type,label:'',position,rotation:0,params:{}}).expandByScalar(.08);
  return !document.components.some(component=>proposed.intersectsBox(componentBounds(component)));
}
export const hasOperatingAnimation = (document:CircuitDocument,states?:Record<string,{energized:boolean}>) => document.components.some(c=>!!states?.[c.id]?.energized && ['fan','motor','motor3','pump','heatpump'].includes(c.type));
