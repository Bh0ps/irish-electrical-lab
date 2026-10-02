'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Equipment } from '../../lib/Equipment';
import type { EquipmentView } from '../../lib/Equipment';
import { COMPONENT_LIST, COMPONENTS } from '../../lib/components.ts';
import { LESSONS } from '../../lib/lessons.ts';
import { equipmentAssetKey } from '../../lib/equipment-assets';
import type { ComponentInstance, DeviceState, Vec3 } from '../../lib/types.ts';

export interface GalleryEntry {
  key: string;
  component: ComponentInstance;
  name: string;
  source: string;
  companions?: ComponentInstance[];
}

/** A stable visual-variant key. Every equipment type is included independently;
 * lesson-specific labels and sensor modes add the distinct geometries used by
 * the procedural Equipment model without duplicating every instance of a lamp. */
export const galleryVariantKey = (component: ComponentInstance) => COMPONENTS[component.type] ? equipmentAssetKey(component, COMPONENTS[component.type]) : `${component.type}:unknown`;

export function createGalleryInventory(): GalleryEntry[] {
  const entries: GalleryEntry[] = COMPONENT_LIST.map(def => {
    const component: ComponentInstance = { id: `gallery-${def.type}`, type: def.type, label: def.name, position: [0, 0, 0], rotation: 0, params: { ...def.defaults } };
    return { key: galleryVariantKey(component), component, name: def.name, source: 'Registry equipment' };
  });
  const seen = new Set(entries.map(entry => entry.key));
  for (const lesson of LESSONS) for (const original of lesson.circuit.components) {
    const key = galleryVariantKey(original);
    if (seen.has(key)) continue;
    seen.add(key);
    const side = original.params.gangModule;
    const companions = (side === 'left' || side === 'right') ? lesson.circuit.components.filter(other => other.id !== original.id && other.params.gangGroup === original.params.gangGroup && other.params.gangModule).map(other => ({ ...other, id: `gallery-${entries.length}-paired-${other.id}`, position: [other.position[0] - original.position[0], other.position[1] - original.position[1], other.position[2] - original.position[2]] as Vec3, rotation: 0, params: { ...COMPONENTS[other.type]?.defaults, ...other.params } })) : undefined;
    entries.push({ key, component: { ...original, id: `gallery-${entries.length}`, position: [0, 0, 0], rotation: 0, params: { ...COMPONENTS[original.type]?.defaults, ...original.params } }, name: side === 'left' || side === 'right' ? `${original.label} · ${side} module` : original.label, source: `Lesson ${String(lesson.id).padStart(2, '0')} · ${lesson.title}`, companions });
  }
  // These authored variations share a logical equipment definition but have
  // separate physical geometry. Include them even before a custom build uses
  // them, and deduplicate against any lesson that already selects that family.
  for (const def of COMPONENT_LIST) for (const form of def.variants ?? []) {
    const component: ComponentInstance = { id: `gallery-${entries.length}`, type:def.type, variant:form.id, label:form.name, position: [0, 0, 0], rotation: 0, params: { ...def.defaults } };
    const key = galleryVariantKey(component);
    if (!seen.has(key)) { seen.add(key); entries.push({ key, component, name:form.name, source: 'Authored equipment variation · choose Equipment form in Inspect' }); }
  }
  return entries;
}

const previewState: DeviceState = { energized: true, closed: true, tripped: false, level: 1, direction: 1, elapsed: 0, resetToken: 0, details: 'Gallery preview · measurements unavailable' };
interface Selection { key: string; part: string; terminal: boolean; componentId?: string }
type CameraSide = 'angle' | 'front' | 'rear';
function CameraPlacement({ entries, side,view }: { entries:GalleryEntry[]; side:CameraSide;view:EquipmentView }) {
  const { camera, invalidate,controls } = useThree();
  useEffect(() => {
    const count=entries.length;
    const single = count === 1;
    const dir = side === 'rear' ? -1 : 1;
    const target=new THREE.Vector3(0,.65,0);
    if(single){
      const definition=COMPONENTS[entries[0].component.type],size=new THREE.Vector3(...definition.size);
      const bounds=new THREE.Box3(new THREE.Vector3(-size.x/2,0,-size.z/2),new THREE.Vector3(size.x/2,size.y,size.z/2));
      for(const companion of entries[0].companions??[]){const dims=COMPONENTS[companion.type].size;bounds.union(new THREE.Box3(new THREE.Vector3(companion.position[0]-dims[0]/2,companion.position[1],companion.position[2]-dims[2]/2),new THREE.Vector3(companion.position[0]+dims[0]/2,companion.position[1]+dims[1],companion.position[2]+dims[2]/2)));}
      if(view==='open'||view==='exploded')bounds.max.add(new THREE.Vector3(view==='exploded'?1:.75,view==='exploded'?.85:.15,view==='exploded'?.85:.5));
      bounds.getCenter(target);bounds.getSize(size);const perspective=camera as THREE.PerspectiveCamera,fov=THREE.MathUtils.degToRad(perspective.fov),distance=Math.max(1.8,Math.max(size.x/(perspective.aspect||1),size.y,size.z)*1.4/(2*Math.tan(fov/2)));
      const offset=side==='angle'?new THREE.Vector3(.6,.4,.95):new THREE.Vector3(0,.04,dir);offset.normalize().multiplyScalar(distance);camera.position.copy(target).add(offset);
    }else camera.position.set(side==='angle'?7:0,side==='angle'?10:9,dir*15);
    camera.lookAt(target);
    const orbit=controls as unknown as {target?:THREE.Vector3;update?:()=>void};orbit?.target?.copy(target);orbit?.update?.();
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera,entries,side,view,invalidate,controls]);
  return null;
}

function GalleryDiagnostics({batch}:{batch:number}){
  const {scene}=useThree();useEffect(()=>{
    if(!('electricalDesktop' in window))return;
    const report=()=>{const models:{key:string;lod:string;meshes:number}[]=[];scene.traverse(node=>{if(node.userData.assetKey){let meshes=0;node.traverse(child=>{if('isMesh' in child&&child.isMesh)meshes++;});models.push({key:String(node.userData.assetKey),lod:String(node.userData.lod),meshes});}});window.dispatchEvent(new CustomEvent('electrical-lab-gallery',{detail:{batch,models}}));};
    window.addEventListener('electrical-lab-gallery-request',report);return()=>window.removeEventListener('electrical-lab-gallery-request',report);
  },[scene,batch]);return null;
}

function GalleryBatch({ entries, index, view, animate, side, selection, onSelect }: {
  entries: GalleryEntry[]; index: number; view: EquipmentView; animate: boolean;
  side: CameraSide;
  selection?: Selection; onSelect: (selection: Selection) => void;
}) {
  const wrapper = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(index === 0);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    // Canvas contexts are only allocated near the viewport. Offscreen batches
    // unmount, avoiding the browser's simultaneous WebGL-context limit.
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <section ref={wrapper} className="mg-batch" data-gallery-batch={index + 1}>
    <div className="mg-batch-heading"><h2>Inventory sheet {index + 1}</h2><span>{entries.length} original models · drag to orbit · scroll to zoom</span></div>
    <div className="mg-scene">
      {visible ? <Canvas dpr={[1, 1.5]} frameloop={animate ? 'always' : 'demand'} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ position: [8.8, 13.6, 16.4], fov: 41, near: .05, far: 100 }}>
        <color attach="background" args={['#15232b']} />
        <ambientLight intensity={1.45} />
        <directionalLight position={[3, 12, 8]} intensity={3.4} />
        <directionalLight position={[-8, 7, -5]} intensity={1.4} color="#a1dce3" />
        <gridHelper args={[18, 36, '#466974', '#29404b']} position={[0, -.01, 0]} />
        <CameraPlacement entries={entries} side={side} view={view}/>
        <GalleryDiagnostics batch={index+1}/>
        {entries.map((entry, i) => {
          const columns = Math.min(4, entries.length), rows = Math.ceil(entries.length / columns);
          const position: Vec3 = [(i % columns - (columns - 1) / 2) * 3.6, 0, (Math.floor(i / columns) - (rows - 1) / 2) * 3.7];
          const def = COMPONENTS[entry.component.type];
          return <group key={entry.key} position={position} rotation={[0, -.13, 0]}>
            <Equipment component={entry.component} definition={def} state={['lamp','led','emergency'].includes(entry.component.type)?{...previewState,lightOutputPower:Number(entry.component.params.watts??def.defaults.watts??8)}:previewState} animate={animate} selected={selection?.key === entry.key && (!selection.componentId || selection.componentId === entry.component.id)} view={view} showLabels={false} lowDetail={false} onPart={part => onSelect({ key: entry.key, part, terminal: false, componentId: entry.component.id })} onTerminal={part => onSelect({ key: entry.key, part, terminal: true, componentId: entry.component.id })} />
            {entry.companions?.map(companion => <group key={companion.id} position={companion.position}><Equipment component={companion} definition={COMPONENTS[companion.type]} state={previewState} animate={animate} selected={selection?.key === entry.key && selection.componentId === companion.id} view={view} showLabels={false} lowDetail={false} onPart={part => onSelect({ key: entry.key, part, terminal: false, componentId: companion.id })} onTerminal={part => onSelect({ key: entry.key, part, terminal: true, componentId: companion.id })} /></group>)}
          </group>;
        })}
        <OrbitControls makeDefault target={[0, .6, 0]} minDistance={entries.length===1?.35:3} maxDistance={30} maxPolarAngle={Math.PI / 2.05} enableDamping />
      </Canvas> : <div className="mg-placeholder">Models load as this sheet enters view.</div>}
    </div>
    <div className="mg-caption-grid">{entries.map((entry, i) => <button key={entry.key} data-gallery-key={entry.key} className={selection?.key === entry.key ? 'selected' : ''} onClick={() => onSelect({ key: entry.key, part: 'body', terminal: false })}>
      <b>{index * 12 + i + 1}. {entry.name}</b><span>{COMPONENTS[entry.component.type].group} · {COMPONENTS[entry.component.type].terminals.length} terminals</span><small>{entry.source}</small>
    </button>)}</div>
  </section>;
}

export default function ModelGallery() {
  const inventory = useMemo(()=>createGalleryInventory(), []);
  const [view, setView] = useState<EquipmentView>('normal');
  const [animate, setAnimate] = useState(false);
  const [side, setSide] = useState<CameraSide>('angle');
  const [selection, setSelection] = useState<Selection>();
  const [filter, setFilter] = useState('');
  const [focusedKey,setFocusedKey]=useState<string>();
  const displayed = useMemo(() => inventory.filter(entry => focusedKey?entry.key===focusedKey:`${entry.name} ${entry.component.type} ${entry.source} ${COMPONENTS[entry.component.type].group}`.toLowerCase().includes(filter.toLowerCase())), [inventory, filter,focusedKey]);
  const batches = useMemo(()=>Array.from({ length: Math.ceil(displayed.length / 12) }, (_, index) => displayed.slice(index * 12, index * 12 + 12)),[displayed]);
  const chosen = inventory.find(entry => entry.key === selection?.key);
  const selectedComponent = chosen?.companions?.find(component => component.id === selection?.componentId) ?? chosen?.component;
  const def = selectedComponent && COMPONENTS[selectedComponent.type];
  const part = selection?.terminal ? def?.terminals.find(item => item.id === selection.part) : def?.parts.find(item => item.id === selection?.part);
  return <main className="mg-shell">
    <style>{`
      .mg-shell{height:100vh;overflow:auto;background:#0d171e;color:#edf4f2;font:14px/1.5 Arial,sans-serif;padding:28px 4vw 60px;box-sizing:border-box}
      .mg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;margin-bottom:22px}
      .mg-top h1{font-size:30px;line-height:1.2;margin:5px 0 10px;color:#eef7f4;letter-spacing:-.6px}.mg-eyebrow{font-size:11px;letter-spacing:2px;color:#78cfb8;text-transform:uppercase;font-weight:bold}
      .mg-top p{color:#a8bdc8;max-width:750px;margin:0}.mg-link{display:inline-block;color:#92e7cd;text-decoration:none;border:1px solid #3a5c63;padding:9px 13px;border-radius:7px;white-space:nowrap}
      .mg-controls{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding:15px 18px;background:#192c35;border:1px solid #35515b;border-radius:10px;position:sticky;top:0;z-index:20;margin-bottom:18px;box-shadow:0 7px 16px #0003}
      .mg-controls label{display:flex;align-items:center;gap:9px;color:#c9d9df}.mg-controls select,.mg-controls input[type=search]{background:#10212a;color:#eef7f4;border:1px solid #4b6c75;padding:8px 10px;border-radius:6px}.mg-controls input[type=search]{min-width:230px}.mg-controls button{background:#203b44;font:inherit;cursor:pointer}.mg-controls button:disabled{opacity:.45;cursor:default}.mg-count{margin-left:auto;font-size:12px;color:#80d5c0}
      .mg-inspector{padding:16px 18px;background:#213641;border-left:3px solid #66d7b8;border-radius:7px;margin-bottom:22px}.mg-inspector p{margin:5px 0;color:#bdd0d8}.mg-inspector strong{color:#8de7cd}.mg-inspector small{display:block;color:#91aab6}
      .mg-batch{border:1px solid #314b57;border-radius:11px;overflow:hidden;margin-bottom:26px;background:#14232d}.mg-batch-heading{display:flex;gap:15px;align-items:center;justify-content:space-between;padding:13px 17px;border-bottom:1px solid #314b57}.mg-batch-heading h2{font-size:15px;font-weight:600;margin:0}.mg-batch-heading span{font-size:12px;color:#94aeba}
      .mg-scene{height:620px;position:relative}.mg-placeholder{height:100%;display:grid;place-items:center;color:#65828f;background:#15232b}.mg-model-label{width:155px;text-align:center;padding:5px 7px;background:#0b1b24e6;border:1px solid #426673;border-radius:5px;line-height:1.3;color:#eef7f4;font-size:10px;box-shadow:0 2px 8px #0005}.mg-model-label b{display:block}.mg-model-label small{display:block;color:#89c5c3;font-size:9px;margin-top:2px}
      .mg-caption-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#314b57}.mg-caption-grid button{text-align:left;padding:11px 13px;background:#172b35;border:0;color:#e7f0ec;font:inherit;cursor:pointer;min-height:90px}.mg-caption-grid button:hover,.mg-caption-grid button.selected{background:#274d54}.mg-caption-grid b{display:block;font-size:12px}.mg-caption-grid span,.mg-caption-grid small{display:block;color:#9eb5c0;font-size:11px;margin-top:4px}.mg-caption-grid small{color:#738f9c;font-size:10px}.mg-empty{padding:60px;text-align:center;color:#a2bdc6}
      @media(max-width:800px){.mg-shell{padding:20px 15px}.mg-top{display:block}.mg-top .mg-link{margin-top:15px}.mg-scene{height:480px}.mg-caption-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mg-batch-heading span{display:none}.mg-count{margin-left:0}}
      @media print{.mg-shell{height:auto;overflow:visible;padding:0}.mg-controls,.mg-link{display:none}.mg-batch{break-inside:avoid}.mg-scene{height:580px}}
    `}</style>
    <header className="mg-top"><div><div className="mg-eyebrow">Irish Electrical Lab · Asset verification</div><h1>Original 3D equipment inventory</h1><p>Inspect every registry object and the distinct variants used by the 64 lessons. Click a physical part or a terminal to read its purpose. These standalone previews have no live circuit simulation.</p></div><button className="mg-link" onClick={()=>window.location.assign(new URL('/',window.location.href).href)}>Return to study workbench</button></header>
    <div className="mg-controls"><label>Inspection view<select aria-label="Gallery inspection view" value={view} onChange={e => setView(e.target.value as EquipmentView)}><option value="normal">Normal assembly</option><option value="open">Covers open</option><option value="exploded">Exploded assembly</option><option value="cutaway">Conceptual cutaway</option></select></label><label>Camera<select aria-label="Gallery camera side" value={side} onChange={e => setSide(e.target.value as CameraSide)}><option value="angle">Angled</option><option value="front">Front controls</option><option value="rear">Rear terminals</option></select></label><label><input type="checkbox" checked={animate} onChange={e => setAnimate(e.target.checked)} />Animate mechanisms</label><input aria-label="Search equipment gallery" type="search" placeholder="Find equipment or lesson…" value={filter} onChange={e => setFilter(e.target.value)} /><button className="mg-link" disabled={!chosen} onClick={()=>{setFocusedKey(chosen?.key);setSide('angle');}}>Focus selected equipment</button><button className="mg-link" onClick={()=>setFocusedKey(undefined)}>Show full inventory</button><span className="mg-count">{displayed.length} / {inventory.length} previews · {COMPONENT_LIST.length} equipment types</span></div>
    <aside className="mg-inspector" aria-live="polite">{chosen && def ? <><strong>{selectedComponent?.params.gangModule ? `${selectedComponent.label} · ${selectedComponent.params.gangModule} module` : chosen.name} · {selection?.terminal ? `terminal ${selection.part}` : 'name' in (part ?? {}) ? (part as { name: string }).name : selection?.part}</strong><p>{part?.purpose ?? def.description}</p><small>{chosen.source}{chosen.companions?.length ? ' · One shared plate; independently selectable left/right modules and rear terminals.' : ''}{def.abstraction ? ` · ${def.abstraction}` : ''}</small></> : <><strong>Select an object, part or terminal</strong><p>All objects use original Blender assets with an offline procedural fallback. Covers and inspection views preserve terminal coordinates. Electronic boards and internal mechanisms are representative learning models.</p></>}</aside>
    {batches.map((entries, index) => <GalleryBatch key={index} entries={entries} index={index} view={view} animate={animate} side={side} selection={selection} onSelect={setSelection} />)}
    {!displayed.length && <div className="mg-empty">No equipment matches that search.</div>}
  </main>;
}
