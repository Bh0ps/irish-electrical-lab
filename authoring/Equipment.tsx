import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { equipmentVariant, getComponentTerminals } from './terminal-layout';
import { WIRE_RADIUS } from './routing';
import type { ComponentDefinition, ComponentInstance, DeviceState, TerminalDefinition, Vec3 } from './types';

/** Original procedural equipment. All dimensions are metres in the teaching scene,
 * not installation drawings. Internal assemblies are deliberately explanatory. */
export type EquipmentView = 'normal' | 'open' | 'exploded' | 'cutaway';
export interface EquipmentProps {
  component: ComponentInstance;
  definition: ComponentDefinition;
  state?: DeviceState;
  selected: boolean;
  view: EquipmentView;
  onPart: (partId: string) => void;
  onTerminal: (terminalId: string) => void;
  showLabels: boolean;
  lowDetail?: boolean;
}

const palette = {
  white: '#e7e9e5', cream: '#d8d2be', black: '#151b23', grey: '#65737b', dark: '#283844',
  steel: '#a7b2b8', copper: '#bc7949', brass: '#c49e55', red: '#c64039', blue: '#2673bd',
  green: '#237762', yellow: '#e5b747', brown: '#765546', pcb: '#2f6a50', glass: '#9cd4da', ceramic: '#eee8df',
};
const mat = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key,
  new THREE.MeshStandardMaterial({ color, roughness: ['steel', 'copper', 'brass'].includes(key) ? .29 : .6,
    metalness: ['steel', 'copper', 'brass'].includes(key) ? .78 : .08 }),
])) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
const transparent = new THREE.MeshStandardMaterial({ color: '#8ccbd0', transparent: true, opacity: .2, depthWrite: false, roughness: .18, metalness: .05 });
const orangeLight = new THREE.MeshStandardMaterial({ color: '#ffe8a5', emissive: '#ffbc47', emissiveIntensity: 1.5 });
const greenLight = new THREE.MeshStandardMaterial({ color: '#83edb0', emissive: '#43d57d', emissiveIntensity: 1.2 });
const redLight = new THREE.MeshStandardMaterial({ color: '#ff685b', emissive: '#e12624', emissiveIntensity: 1.1 });
const offLight = new THREE.MeshStandardMaterial({ color: '#35434c', roughness: .3 });
const opal = new THREE.MeshStandardMaterial({ color: '#f5f2e9', roughness: .26, metalness: .02 });
const opalLit = new THREE.MeshStandardMaterial({ color: '#fff6e9', emissive: '#ffd394', emissiveIntensity: .7, roughness: .23 });
const bulbGlass = new THREE.MeshStandardMaterial({ color: '#dce6e8', transparent: true, opacity: .27, depthWrite: false, roughness: .07, metalness: .12 });
type MaterialKey = keyof typeof mat;
const geometryPool = new Map<string, THREE.BufferGeometry>();
function geometry(key: string, build: () => THREE.BufferGeometry) {
  let value = geometryPool.get(key);
  if (!value) { value = build(); geometryPool.set(key, value); }
  return value;
}

export const terminalColors: Record<string, string> = { L: '#98634b', L1: '#98634b', L2: '#171d27', L3: '#6c7379', N: '#379ddd', PE: '#ced651', control: '#ae90dd', output: '#ee8854', 'DC+': '#e25955', 'DC-': '#3d4653' };
interface ModelContext {
  props: EquipmentProps; variant: string; detailed: boolean; active: boolean; closed: boolean; internal: boolean;
}
const Context = createContext<ModelContext>(null!);
const useModel = () => useContext(Context);
const PartContext = createContext('');

function Part({ id, children, position, rotation }: { id: string; children: ReactNode; position?: Vec3; rotation?: Vec3 }) {
  const { props } = useModel();
  const aliases: Record<string, string> = { circuitboard: 'electronics', converter: 'electronics', sensingcore: /rcd|rcbo/.test(props.component.type) ? 'toroid' : 'sensing', safetycutout: 'thermal', heater: 'element', lamp: props.definition.parts.some(p => p.id === 'emitter') ? 'emitter' : 'element', indicator: 'display', winding: 'winding', coil: props.definition.parts.some(p => p.id === 'coil') ? 'coil' : 'winding', busbar: 'terminals', cable: 'sheath', gland: 'mounting', plug: 'pins', impeller: 'rotor', capacitor: 'electronics', probes: 'display' };
  const semanticId = aliases[id] ?? id;
  const chosen = props.definition.parts.find(p => p.id === semanticId)?.id
    ?? props.definition.parts.find(p => p.id === 'body')?.id ?? props.definition.parts[0]?.id ?? id;
  return <PartContext.Provider value={id}><group position={position} rotation={rotation} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); props.onPart(chosen); }}>{children}</group></PartContext.Provider>;
}
function B({ p = [0, 0, 0], s = [1, 1, 1], m = 'white', r = [0, 0, 0], material }: { p?: Vec3; s?: Vec3; m?: MaterialKey; r?: Vec3; material?: THREE.Material }) {
  const { internal } = useModel();
  const part = useContext(PartContext);
  return <mesh position={p} rotation={r} material={material ?? (internal && part === 'body' ? transparent : mat[m])} geometry={geometry(`b:${s.join(',')}`, () => new THREE.BoxGeometry(...s))} dispose={null} castShadow receiveShadow />;
}
function RB({ p = [0, 0, 0], s = [1, 1, 1], m = 'white', r = [0, 0, 0], radius = .025, material }: { p?: Vec3; s?: Vec3; m?: MaterialKey; r?: Vec3; radius?: number; material?: THREE.Material }) {
  const { internal } = useModel();
  const part = useContext(PartContext);
  const bevel = Math.min(radius, ...s.map(value => value / 2.1));
  return <mesh position={p} rotation={r} material={material ?? (internal && part === 'body' ? transparent : mat[m])} geometry={geometry(`rb:${s.join(',')}:${bevel}`, () => new RoundedBoxGeometry(...s, 3, bevel))} dispose={null} castShadow receiveShadow />;
}
function FrontPlate({ width = 1.03, height = 1.03, holes = [] }: { width?: number; height?: number; holes?: [number, number, number, number][] }) {
  const key = `plate:${width}:${height}:${JSON.stringify(holes)}`;
  const geom = geometry(key, () => {
    const w = width / 2, h = height / 2, c = .045;
    const shape = new THREE.Shape();
    shape.moveTo(-w + c, -h); shape.lineTo(w - c, -h); shape.quadraticCurveTo(w, -h, w, -h + c);
    shape.lineTo(w, h - c); shape.quadraticCurveTo(w, h, w - c, h);
    shape.lineTo(-w + c, h); shape.quadraticCurveTo(-w, h, -w, h - c);
    shape.lineTo(-w, -h + c); shape.quadraticCurveTo(-w, -h, -w + c, -h);
    for (const [x, y, hw, hh] of holes) {
      const hole = new THREE.Path(); hole.moveTo(x - hw / 2, y - hh / 2); hole.lineTo(x - hw / 2, y + hh / 2); hole.lineTo(x + hw / 2, y + hh / 2); hole.lineTo(x + hw / 2, y - hh / 2); hole.closePath(); shape.holes.push(hole);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelSize: .012, bevelThickness: .009, bevelSegments: 3, steps: 1, curveSegments: 8 });
  });
  return <mesh geometry={geom} material={mat.white} dispose={null} castShadow receiveShadow />;
}
function WallBackbox({ width = .95, height = .95, y = .7 }: { width?: number; height?: number; y?: number }) {
  return <Part id="body"><RB p={[0, y, -.258]} s={[width, height, .045]} m="steel" radius={.014} />
    {[-1, 1].map(side => <group key={side}><B p={[side * (width / 2 - .016), y, -.087]} s={[.032, height, .38]} m="steel" /><B p={[0, y + side * (height / 2 - .016), -.087]} s={[width, .032, .38]} m="steel" /></group>)}
    <C p={[-width / 2 + .09, y, -.276]} radius={.045} length={.014} m="dark" r={[Math.PI / 2, 0, 0]} /><C p={[width / 2 - .09, y, -.276]} radius={.045} length={.014} m="dark" r={[Math.PI / 2, 0, 0]} />
  </Part>;
}
function Rocker({ p = [0, 0, .015], width = .42, height = .61, red = false }: { p?: Vec3; width?: number; height?: number; red?: boolean }) {
  const { closed, props } = useModel();
  const actual = closed && !props.state?.tripped;
  return <Part id="actuator" position={p}><RB s={[width + .045, height + .045, .025]} m="grey" radius={.025} /><group rotation={[actual ? -.105 : .105, 0, 0]}><RB p={[0, 0, .028]} s={[width, height, .064]} radius={.028} m={red ? 'red' : 'white'} /><B p={[0, height * .27, .062]} s={[width * .33, .007, .002]} m={red ? 'white' : 'grey'} /></group></Part>;
}
function FaceLabel({ p, text, color = '#758185', size = 9 }: { p: Vec3; text: string; color?: string; size?: number }) {
  const { props } = useModel();
  return props.selected ? <TextureLabel p={p} text={text} color={color} width={Math.max(.07, text.length * size * .0028)} height={size * .0075} /> : null;
}
/** Offline text is painted to local canvas textures. Physical face text is a
 * flat mesh; annotations are sprites. Neither creates a secondary React DOM
 * root, which keeps scene deletion and undo safe under React 19. */
function TextureLabel({ p, text, width = .5, height = .15, color = '#eef7f2', background = '', sprite = false, font = 'Arial, sans-serif' }: { p: Vec3; text: string; width?: number; height?: number; color?: string; background?: string; sprite?: boolean; font?: string }) {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(256, Math.min(1024, Math.round(256 * width / height)));
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.fillStyle = color;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    let pixels = 80;
    context.font = `600 ${pixels}px ${font}`;
    const measured = context.measureText(text).width;
    pixels = Math.min(pixels, (canvas.width - 28) / Math.max(1, measured) * pixels);
    context.font = `600 ${pixels}px ${font}`;
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const value = new THREE.CanvasTexture(canvas);
    value.colorSpace = THREE.SRGBColorSpace; value.minFilter = THREE.LinearFilter;
    value.magFilter = THREE.LinearFilter; value.generateMipmaps = false;
    return value;
  }, [text, color, background, width, height, font]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return sprite ? <sprite position={p} scale={[width, height, 1]}><spriteMaterial map={texture} transparent toneMapped={false} depthWrite={false} /></sprite> : <mesh position={p}><planeGeometry args={[width, height]} /><meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} /></mesh>;
}
function C({ p = [0, 0, 0], radius = .1, length = .1, m = 'steel', r = [0, 0, 0], material, segments = 24 }: { p?: Vec3; radius?: number; length?: number; m?: MaterialKey; r?: Vec3; material?: THREE.Material; segments?: number }) {
  const { internal } = useModel();
  const part = useContext(PartContext);
  return <mesh position={p} rotation={r} material={material ?? (internal && part === 'body' ? transparent : mat[m])} geometry={geometry(`c:${radius}:${length}:${segments}`, () => new THREE.CylinderGeometry(radius, radius, length, segments))} dispose={null} castShadow receiveShadow />;
}
function S({ p = [0, 0, 0], radius = .1, scale = [1, 1, 1], m = 'white', material }: { p?: Vec3; radius?: number; scale?: Vec3; m?: MaterialKey; material?: THREE.Material }) {
  return <mesh position={p} scale={scale} material={material ?? mat[m]} geometry={geometry(`s:${radius}`, () => new THREE.SphereGeometry(radius, 20, 14))} dispose={null} castShadow />;
}
function T({ p = [0, 0, 0], radius = .2, tube = .025, m = 'steel', r = [0, 0, 0], material }: { p?: Vec3; radius?: number; tube?: number; m?: MaterialKey; r?: Vec3; material?: THREE.Material }) {
  return <mesh position={p} rotation={r} material={material ?? mat[m]} geometry={geometry(`t:${radius}:${tube}`, () => new THREE.TorusGeometry(radius, tube, 8, 28))} dispose={null} castShadow />;
}
function LineTube({ points, radius = .025, m = 'copper', material }: { points: Vec3[]; radius?: number; m?: MaterialKey; material?: THREE.Material }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v)), false, 'centripetal'), [points]);
  return <mesh material={material ?? mat[m]} castShadow><tubeGeometry args={[curve, Math.max(12, points.length * 5), radius, 8, false]} /></mesh>;
}
function Screw({ p }: { p: Vec3 }) {
  const { detailed } = useModel();
  return detailed ? <group position={p}><C radius={.035} length={.022} r={[Math.PI / 2, 0, 0]} /><B p={[0, 0, .013]} s={[.043, .007, .002]} m="dark" /><B p={[0, 0, .014]} s={[.007, .043, .002]} m="dark" /></group> : null;
}
function Fixings({ width = 1, bottom = .2, top = 1.15, z = .29 }: { width?: number; bottom?: number; top?: number; z?: number }) {
  return <Part id="mounting">{[-width / 2 + .065, width / 2 - .065].flatMap(x => [bottom, top].map(y => <Screw key={`${x}-${y}`} p={[x, y, z]} />))}</Part>;
}
function PCB({ p = [0, .72, .17], width = .72, height = .56 }: { p?: Vec3; width?: number; height?: number }) {
  const { detailed } = useModel();
  return <Part id="circuitboard" position={p}><B s={[width, height, .025]} m="pcb" />
    {detailed && <>
      <B p={[-width * .18, .02, .028]} s={[width * .3, .18, .04]} m="black" />
      {[0, 1, 2, 3, 4, 5].map(i => <B key={i} p={[-width * .29 + i * width * .044, .13, .027]} s={[.013, .04, .018]} m="steel" />)}
      {[0, 1, 2].map(i => <C key={i} p={[width * .2, -.16 + i * .15, .06]} radius={.037} length={.09} m="black" r={[Math.PI / 2, 0, 0]} />)}
      <B p={[-width * .32, -.16, .05]} s={[.1, .065, .035]} m="cream" />
      <LineTube points={[[-width * .4, -.05, .018], [0, -.05, .018], [0, .2, .018], [width * .3, .2, .018]]} radius={.004} m="copper" />
      <LineTube points={[[width * .3, -.22, .018], [.05, -.22, .018], [.05, .15, .018]]} radius={.004} m="copper" />
    </>}
  </Part>;
}
function Coil({ p = [0, .55, .12], radius = .15, length = .34, r = [0, 0, 0] }: { p?: Vec3; radius?: number; length?: number; r?: Vec3 }) {
  const { detailed } = useModel();
  const points: Vec3[] = useMemo(() => Array.from({ length: 161 }, (_, i) => { const t = i / 160; const a = t * Math.PI * 2 * 10; return [Math.cos(a) * radius, (t - .5) * length, Math.sin(a) * radius]; }), [radius, length]);
  return <Part id="coil" position={p} rotation={r}><C radius={radius * .7} length={length + .05} m="dark" />
    {detailed ? <LineTube points={points} radius={.012} m="copper" /> : <C radius={radius} length={length} m="copper" />}
    <C p={[0, -length / 2, 0]} radius={radius + .035} length={.025} m="black" /><C p={[0, length / 2, 0]} radius={radius + .035} length={.025} m="black" />
  </Part>;
}
function LED({ p, active, color = 'green' }: { p: Vec3; active?: boolean; color?: 'green' | 'red' | 'orange' }) {
  const ctx = useModel();
  return <Part id="indicator"><C p={p} radius={.028} length={.023} r={[Math.PI / 2, 0, 0]} material={(active ?? ctx.active) ? color === 'red' ? redLight : color === 'orange' ? orangeLight : greenLight : offLight} /></Part>;
}
function Cover({ children, round = false, p = [0, .72, .3], s = [1, 1.1, .065], custom = false }: { children?: ReactNode; round?: boolean; p?: Vec3; s?: Vec3; custom?: boolean }) {
  const { props } = useModel();
  if (props.view === 'cutaway') return null;
  const offset: Vec3 = props.view === 'exploded' ? [p[0] + .5, p[1] + .5, p[2] + .65] : props.view === 'open' ? [p[0] + .55, p[1] + .08, p[2] + .15] : p;
  return <Part id="cover" position={offset} rotation={props.view === 'open' ? [0, Math.PI / 2.5, 0] : [0, 0, 0]}>
    {!custom && (round ? <C radius={s[0] / 2} length={s[2]} r={[Math.PI / 2, 0, 0]} material={props.view === 'normal' ? mat.white : transparent} /> : <B s={s} material={props.view === 'normal' ? mat.white : transparent} />)}
    {children}
  </Part>;
}
function Display({ p = [0, .95, .36], width = .45, height = .2, value }: { p?: Vec3; width?: number; height?: number; value?: string }) {
  const { active } = useModel();
  return <Part id="display" position={p}><B s={[width + .06, height + .05, .028]} m="black" /><B p={[0, 0, .018]} s={[width, height, .01]} m="glass" />
    <TextureLabel p={[0, 0, .029]} text={value ?? (active ? 'RUN' : 'OFF')} width={width * .91} height={height * .83} color="#072b30" font="Consolas, monospace" />
  </Part>;
}
function Rails({ p = [0, .62, -.12], width = 1 }: { p?: Vec3; width?: number }) {
  return <Part id="mounting" position={p}><B s={[width, .12, .055]} m="steel" /><B p={[0, .065, .028]} s={[width, .018, .028]} m="steel" /><B p={[0, -.065, .028]} s={[width, .018, .028]} m="steel" /></Part>;
}
function Toggle({ p = [0, .77, .38], width = .34, color = 'black' }: { p?: Vec3; width?: number; color?: MaterialKey }) {
  const { closed, props } = useModel();
  return <Part id="actuator" position={p}><B s={[width + .09, .3, .055]} m="dark" /><group rotation={[closed && !props.state?.tripped ? -.35 : .35, 0, 0]}><B p={[0, 0, .035]} s={[width, .18, .1]} m={props.state?.tripped ? 'red' : color} /><B p={[0, .02, .094]} s={[width * .68, .018, .01]} m="white" /></group></Part>;
}

function PanelModel() {
  const { variant, detailed, props, internal } = useModel();
  const industrial = /industrial|three|cabinet/.test(variant);
  return <>
    <Part id="body"><B p={[0, .69, -.19]} s={[1.25, 1.34, .16]} m={industrial ? 'grey' : 'white'} /><B p={[-.6, .69, .04]} s={[.08, 1.34, .45]} /><B p={[.6, .69, .04]} s={[.08, 1.34, .45]} /><B p={[0, .06, .04]} s={[1.2, .08, .45]} /><B p={[0, 1.32, .04]} s={[1.2, .08, .45]} /></Part>
    <Rails p={[0, .82, -.08]} width={1.08} /><Rails p={[0, .35, -.08]} width={1.08} />
    {[-.4, -.2, 0, .2, .4].map((x, i) => <group key={x}><B p={[x, .82, .09]} s={[.18, .36, .24]} /><B p={[x, .78, .23]} s={[.13, .08, .035]} m={i === 0 ? 'red' : 'black'} /></group>)}
    {internal && <Part id="busbar"><B p={[0, .58, .05]} s={[.96, .045, .045]} m="copper" />{detailed && [-.4, -.2, 0, .2, .4].map(x => <B key={x} p={[x, .65, .05]} s={[.018, .17, .025]} m="copper" />)}</Part>}
    {internal && detailed && <LineTube points={[[-.45, .98, .06], [-.49, 1.12, .05], [.35, 1.16, .05]]} radius={.018} m="blue" />}
    <Cover p={[0, .7, .31]} s={[1.18, 1.28, .055]}><B p={[0, -.05, .037]} s={[1.04, .5, .018]} material={transparent} /><B p={[.42, .34, .062]} s={[.045, .18, .08]} m="black" /><B p={[-.18, .37, .035]} s={[.55, .11, .008]} m="dark" /></Cover>
    <Fixings width={1.2} bottom={.12} top={1.28} z={.27} />
    {props.selected && industrial && <LED p={[.4, 1.16, .36]} />}
  </>;
}
function SupplyModel() {
  const { variant, internal, detailed, active, props } = useModel();
  const studyVoltage = Number(props.component.params.studyVoltage ?? (props.component.type === 'source3' ? 400 : 240));
  return <>
    <Part id="body"><B p={[0, .76, -.02]} s={[.91, 1.03, .34]} m="cream" /><B p={[0, .22, .03]} s={[.75, .26, .43]} m="black" /></Part>
    <Part id="sensingcore"><C p={[0, .7, .2]} radius={.31} length={.08} r={[Math.PI / 2, 0, 0]} m="steel" /><C p={[0, .7, .25]} radius={.23} length={.012} r={[Math.PI / 2, 0, 0]} m="cream" /></Part>
    <Cover p={[0, .77, .25]} s={[.86, .92, .05]}><Display p={[0, .16, .044]} value={active ? `${Number.isFinite(studyVoltage) ? studyVoltage : 240} V` : 'SUPPLY'} width={.54} height={.16} /><T p={[0, -.11, .04]} radius={.255} tube={.012} m="black" /><LED p={[.28, .16, .062]} /></Cover>
    {internal && <PCB p={[0, 1.02, .12]} width={.68} height={.23} />}
    {detailed && <Part id="fuse"><B p={[-.19, .18, .27]} s={[.12, .17, .06]} m="red" /><B p={[.19, .18, .27]} s={[.12, .17, .06]} m="blue" /></Part>}
    <Fixings width={.9} bottom={.32} top={1.18} z={.21} />
    {/entry|service/.test(variant) && <Part id="cable"><LineTube points={[[0, .1, 0], [0, -.15, 0], [.3, -.3, 0]]} radius={.065} m="black" /></Part>}
  </>;
}
function ProtectionModel() {
  const { variant, internal, detailed, props } = useModel();
  const residual = /rcd|rccb|rcbo|residual/.test(variant);
  const three = /mcb3|rcd3|three-pole|four-pole/.test(variant);
  const fuse = /fuse/.test(variant);
  const wide = residual || three || /changeover|isolator|surge/.test(variant);
  const width = wide ? .8 : .56;
  return <>
    <Part id="body"><B p={[0, .74, -.05]} s={[width, .95, .34]} /><B p={[0, 1.13, .08]} s={[width - .08, .18, .27]} /><B p={[0, .33, .08]} s={[width - .08, .18, .27]} /><B p={[0, .67, -.27]} s={[width - .09, .17, .1]} m="dark" /></Part>
    <Cover p={[0, .72, .22]} s={[width - .04, .63, .035]}><B p={[0, .22, .025]} s={[width - .15, .095, .01]} m="dark" />
      {fuse ? <Part id="fuse"><B p={[0, -.02, .062]} s={[.24, .28, .08]} m="cream" /><B p={[0, -.02, .11]} s={[.13, .19, .018]} m="dark" /></Part> : three ? <Part id="actuator">{[-.23, 0, .23].map(x => <Toggle key={x} p={[x, -.01, .04]} width={.14} />)}<B p={[0, -.01, .147]} s={[.68, .033, .045]} m="black" /></Part> : <Toggle p={[0, -.01, .04]} width={width * .53} color={/isolator|changeover/.test(variant) ? 'red' : 'black'} />}
      {residual && <Part id="test"><C p={[width * .29, -.21, .043]} radius={.047} length={.04} m="blue" r={[Math.PI / 2, 0, 0]} /></Part>}
      {/surge/.test(variant) && <B p={[0, -.19, .036]} s={[width * .5, .08, .02]} material={props.state?.tripped ? redLight : greenLight} />}
    </Cover>
    {internal && <>
      {fuse ? <Part id="fuse"><C p={[0, .76, .07]} radius={.07} length={.36} m="ceramic" /><C p={[0, .95, .07]} radius={.075} length={.055} m="steel" /><C p={[0, .57, .07]} radius={.075} length={.055} m="steel" /><LineTube points={[[0, .58, .15], [0, .94, .15]]} radius={.006} m="copper" /></Part> : residual ? <Part id="sensingcore"><T p={[0, .89, .03]} radius={.14} tube={.055} m="dark" /><LineTube points={[[-.2, .42, .05], [-.09, .89, .09], [-.2, 1.2, .05]]} radius={.018} m="copper" /><LineTube points={[[.2, .42, .05], [.09, .89, .09], [.2, 1.2, .05]]} radius={.018} m="blue" /></Part> : <Coil p={[-.13, .94, .04]} radius={.065} length={.16} />}
      <Part id="contacts"><B p={[-.12, .66, .065]} s={[.04, .21, .035]} m="copper" r={[0, 0, .4]} /><B p={[.06, .63, .065]} s={[.19, .035, .035]} m="copper" /><S p={[.1, .64, .075]} radius={.025} m="steel" /></Part>
      <Part id="safetycutout"><B p={[.18, .98, .06]} s={[.028, .32, .02]} m="copper" /><B p={[.19, .51, .06]} s={[.15, .14, .04]} m="ceramic" /></Part>
      {detailed && Array.from({ length: 6 }, (_, i) => <B key={i} p={[.14, .79 + i * .025, .01]} s={[.17, .012, .12]} m="steel" />)}
    </>}
    <Rails p={[0, .59, -.31]} width={width + .08} />
  </>;
}
function SwitchModel() {
  const { variant, internal, closed, detailed, props } = useModel();
  const moduleSide = props.component.params.gangModule;
  if (moduleSide === 'left' || moduleSide === 'right') {
    const left = moduleSide === 'left';
    // The two logical instances are 0.46 scene units apart. The left instance
    // owns the one physical faceplate/back-box; each instance owns one rocker,
    // contact carrier and its own rear electrical terminal anchors.
    const centre = .23 / (props.definition.size[0] / 1.3);
    return <>
      {left && <group position={[centre, 0, 0]}><WallBackbox width={1.075} height={.95} /></group>}
      <Part id="contacts"><RB p={[0, .7, -.08]} s={[.32, .71, .23]} m="black" radius={.025} /></Part>
      <Cover custom p={[left ? centre : 0, .7, .12]} s={[1.13, 1.03, .05]}>
        {left && <><FrontPlate width={1.13} holes={[[-centre, 0, .275, .645], [centre, 0, .275, .645]]} /><T p={[-.49, 0, .048]} radius={.033} tube={.005} m="grey" /><T p={[.49, 0, .048]} radius={.033} tube={.005} m="grey" /><Screw p={[-.49, 0, .046]} /><Screw p={[.49, 0, .046]} /></>}
        <Rocker p={[left ? -centre : 0, 0, .025]} width={.235} height={.6} />
        <FaceLabel p={[left ? -centre : 0, -.382, .048]} text={left ? 'A' : 'B'} size={7} />
      </Cover>
      {internal && <Part id="contacts"><B p={[0, .71, .082]} s={[.235, .024, .035]} m="brass" r={[0, 0, closed ? -.15 : .24]} /><B p={[-.12, .62, .055]} s={[.045, .19, .08]} m="brass" /><B p={[.12, .76, .055]} s={[.045, .19, .08]} m="brass" /><C p={[0, .72, .087]} radius={.025} length={.033} m="steel" r={[Math.PI / 2, 0, 0]} /></Part>}
    </>;
  }
  const knob = /dimmer|selector/.test(variant);
  const button = /button|start|stop|push|emergency/.test(variant);
  const isolator = /isolator|changeover/.test(variant);
  return <>
    <WallBackbox />
    <Part id="contacts"><RB p={[0, .7, -.08]} s={[.57, .71, .23]} m="black" radius={.03} /></Part>
    <Cover custom p={[0, .7, .12]} s={[1.03, 1.03, .05]}>
      <FrontPlate holes={knob || button ? [] : [[0, 0, .47, .66]]} />
      {knob ? <Part id="actuator"><C p={[0, 0, .05]} radius={.225} length={.032} m="grey" r={[Math.PI / 2, 0, 0]} /><C p={[0, 0, .094]} radius={.19} length={.098} m={/selector/.test(variant) ? 'black' : 'white'} r={[Math.PI / 2, 0, 0]} /><group rotation={[0, 0, /dimmer/.test(variant) ? (Math.max(0,Math.min(1,Number(props.component.params.level ?? .65))) - .5) * 4 : closed ? -.6 : .6]}><B p={[0, .12, .15]} s={[.017, .071, .009]} m="grey" />{detailed && Array.from({ length: 20 }, (_, i) => { const a = i * Math.PI / 10; return <B key={i} p={[Math.sin(a) * .181, Math.cos(a) * .181, .094]} s={[.01, .026, .062]} m="cream" r={[0, 0, -a]} />; })}</group><FaceLabel p={[0, -.31, .05]} text={/selector/.test(variant) ? 'A  •  B' : 'DIMMER'} /></Part> : button ? <Part id="actuator"><T p={[0, 0, .054]} radius={.205} tube={.025} m="steel" /><C p={[0, 0, .055]} radius={.183} length={.042} m="black" r={[Math.PI / 2, 0, 0]} /><C p={[0, 0, closed ? .1 : .135]} radius={/emergency/.test(variant) ? .23 : .164} length={.10} m={/stop|emergency/.test(variant) ? 'red' : 'green'} r={[Math.PI / 2, 0, 0]} /><FaceLabel p={[0, -.33, .05]} text={/stop|emergency/.test(variant) ? 'STOP' : 'START'} /></Part> : <>
        <Rocker p={[0, 0, .025]} width={.425} red={isolator} />
        {isolator && <FaceLabel p={[0, -.4, .05]} text="ISOLATOR" />}
      </>}
      <T p={[-.425, 0, .048]} radius={.036} tube={.006} m="grey" /><T p={[.425, 0, .048]} radius={.036} tube={.006} m="grey" /><Screw p={[-.425, 0, .046]} /><Screw p={[.425, 0, .046]} />
    </Cover>
    {internal && <Part id="contacts"><B p={[0, .71, .082]} s={[.43, .024, .035]} m="brass" r={[0, 0, closed ? -.15 : .24]} /><B p={[-.22, .62, .055]} s={[.055, .19, .08]} m="brass" /><B p={[.22, .76, .055]} s={[.055, .19, .08]} m="brass" /><C p={[0, .72, .087]} radius={.025} length={.033} m="steel" r={[Math.PI / 2, 0, 0]} /><LineTube points={[[-.2, .63, -.1], [-.2, .52, -.13], [.18, .52, -.13]]} radius={.012} m="copper" /></Part>}
    {internal && knob && <PCB p={[0, .69, -.025]} width={.47} height={.54} />}
  </>;
}
function SocketModel() {
  const { variant, internal, detailed, closed } = useModel();
  const industrial = /industrial|three|5pin|cee/.test(variant);
  if (industrial) return <>
    <Part id="body"><B p={[0, .72, -.05]} s={[.66, .92, .25]} m="grey" /><C p={[0, .7, .16]} radius={.31} length={.26} m="red" r={[Math.PI / 2, 0, 0]} /><T p={[0, .7, .31]} radius={.265} tube={.035} m="red" /><C p={[0, .7, .315]} radius={.22} length={.015} m="black" r={[Math.PI / 2, 0, 0]} /></Part>
    <Part id="contacts">{[0, 1, 2, 3, 4].map(i => { const a = i * Math.PI * 2 / 5; return <C key={i} p={[Math.sin(a) * .13, .7 + Math.cos(a) * .13, .332]} radius={.037} length={.025} m="brass" r={[Math.PI / 2, 0, 0]} />; })}</Part>
    <Cover p={[0, .99, .38]} s={[.61, .61, .04]} round><B p={[0, -.06, .04]} s={[.09, .21, .04]} m="red" /></Cover>
    <Fixings width={.64} bottom={.31} top={1.13} z={.1} />
  </>;
  if (/fused|fcu/.test(variant)) return <>
    <WallBackbox /><Part id="contacts"><RB p={[0, .69, -.085]} s={[.7, .66, .24]} m="black" /></Part>
    <Cover custom p={[0, .7, .12]}><FrontPlate holes={[[-.2, .03, .28, .52], [.2, -.02, .26, .32]]} /><Rocker p={[-.2, .03, .026]} width={.235} height={.46} red />
      <Part id="fuse"><RB p={[.2, -.02, .036]} s={[.24, .3, .055]} radius={.013} /><B p={[.2, -.084, .067]} s={[.16, .012, .008]} m="grey" /><Screw p={[.2, .048, .07]} /></Part>
      <FaceLabel p={[.2, -.245, .05]} text="FUSE" /><FaceLabel p={[-.2, -.29, .05]} text="ON / OFF" /><Screw p={[-.425, 0, .046]} /><Screw p={[.425, 0, .046]} />
      <Part id="indicator"><RB p={[.2, .26, .06]} s={[.085, .025, .018]} radius={.005} material={closed ? redLight : mat.red} /></Part>
    </Cover>
    {internal && <Part id="fuse"><C p={[.2, .68, -.045]} radius={.042} length={.28} m="ceramic" /><C p={[.2, .82, -.045]} radius={.047} length={.055} m="steel" /><C p={[.2, .54, -.045]} radius={.047} length={.055} m="steel" /><B p={[.2, .49, -.06]} s={[.1, .05, .06]} m="brass" /><B p={[.2, .88, -.06]} s={[.1, .05, .06]} m="brass" /></Part>}
  </>;
  const slotHoles: [number, number, number, number][] = [-.315, .315].flatMap(x => [[x, .06, .052, .135], [x - .115, -.145, .116, .052], [x + .115, -.145, .116, .052]] as [number, number, number, number][]);
  return <>
    <WallBackbox width={1.15} height={.77} y={.68} />
    <Part id="contacts">{[-.315, .315].map(x => <group key={x}><RB p={[x, .62, -.05]} s={[.45, .5, .25]} m="black" radius={.025} />{internal && <>{[[0, .13], [-.12, -.08], [.12, -.08]].map(([dx, dy], i) => <group key={i}><B p={[x + dx, .62 + dy, .085]} s={i === 0 ? [.045, .135, .05] : [.105, .027, .055]} m="brass" /><B p={[x + dx, .62 + dy, .045]} s={[.026, .09, .08]} m="brass" /></group>)}</>}</group>)}{internal && <B p={[0, .4, -.04]} s={[.89, .025, .035]} m="brass" />}</Part>
    <Cover custom p={[0, .68, .12]} s={[1.23, .86, .045]}>
      <FrontPlate width={1.23} height={.86} holes={slotHoles} />
      {[-.315, .315].map(x => <group key={x}><Rocker p={[x + .13, .285, .027]} width={.14} height={.18} /><FaceLabel p={[x - .118, -.25, .046]} text="N" size={7} /><FaceLabel p={[x + .118, -.25, .046]} text="L" size={7} /><FaceLabel p={[x, .2, .047]} text="⏚" size={8} /></group>)}
      <T p={[-.544, 0, .048]} radius={.035} tube={.006} m="grey" /><T p={[.544, 0, .048]} radius={.035} tube={.006} m="grey" /><Screw p={[-.544, 0, .046]} /><Screw p={[.544, 0, .046]} />
      {detailed && <FaceLabel p={[0, -.335, .05]} text="13 A" size={7} />}
    </Cover>
    {/shaver/.test(variant) && <Coil p={[0, .67, .08]} radius={.12} length={.27} />}
  </>;
}
function PlugModel() {
  const { variant, detailed } = useModel();
  const industrial = /industrial|three|5pin|cee/.test(variant);
  return industrial ? <>
    <Part id="body"><C p={[0, .75, .03]} radius={.29} length={.65} m="red" r={[Math.PI / 2, 0, 0]} /><C p={[0, .75, -.3]} radius={.17} length={.16} m="black" r={[Math.PI / 2, 0, 0]} /><T p={[0, .75, .27]} radius={.26} tube={.055} m="grey" /></Part>
    <Part id="contacts">{[0, 1, 2, 3, 4].map(i => { const a = i * Math.PI * 2 / 5; return <C key={i} p={[Math.sin(a) * .14, .75 + Math.cos(a) * .14, .39]} radius={.026} length={.2} m="brass" r={[Math.PI / 2, 0, 0]} />; })}</Part>
    <Part id="cable"><LineTube points={[[0, .75, -.39], [0, .4, -.55], [.3, .12, -.6]]} radius={.065} m="black" /></Part>
  </> : <>
    <Part id="body"><B p={[0, .71, -.03]} s={[.77, .71, .4]} /><B p={[0, .3, -.04]} s={[.2, .2, .25]} m="black" /></Part>
    <Cover p={[0, .72, .2]} s={[.77, .69, .03]}><Screw p={[0, .05, .04]} /></Cover>
    <Part id="contacts"><B p={[0, .91, .36]} s={[.068, .15, .32]} m="brass" />{[-.2, .2].map(x => <B key={x} p={[x, .64, .31]} s={[.135, .063, .25]} m="brass" />)}</Part>
    <Part id="cable"><LineTube points={[[0, .21, -.03], [0, .06, -.03], [.34, .035, -.03]]} radius={.055} m="black" /></Part>
    {detailed && <Part id="fuse"><C p={[.21, .67, .04]} radius={.043} length={.27} m="ceramic" /><C p={[.21, .8, .04]} radius={.047} length={.035} m="steel" /><C p={[.21, .54, .04]} radius={.047} length={.035} m="steel" /></Part>}
  </>;
}
function LampModel() {
  const { variant, active, internal, detailed } = useModel();
  if (/indicator/.test(variant)) return <><Part id="body"><C p={[0, .61, .02]} radius={.26} length={.34} m="black" r={[Math.PI / 2, 0, 0]} /><C p={[0, .61, .22]} radius={.29} length={.04} m="steel" r={[Math.PI / 2, 0, 0]} /></Part><Part id="indicator"><S p={[0, .61, .29]} radius={.25} scale={[1, 1, .4]} material={active ? greenLight : mat.green} /></Part></>;
  const linear = /emergency|maintained|strip|sign|batten|fluorescent/.test(variant);
  const downlight = !linear && /\bled\b|downlight|spot/.test(variant) && !/bulb/.test(variant);
  // The inspection/workbench front is +Z. Rotate the original horizontal fitting
  // around its finned housing centre so the diffuser faces the viewer, with the
  // heat sink and connection cassette behind it.
  if (downlight) return <group position={[0, .7, 0]} rotation={[Math.PI / 2, 0, 0]}><group position={[0, -.36, 0]}>
    <Part id="body"><C p={[0, .36, 0]} radius={.26} length={.25} m="dark" />{detailed && Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI * 2 / 16; return <B key={i} p={[Math.sin(a) * .25, .36, Math.cos(a) * .25]} s={[.032, .21, .065]} m="steel" r={[0, a, 0]} />; })}<C p={[0, .485, 0]} radius={.29} length={.025} m="steel" /></Part>
    <Part id="lamp"><C p={[0, .46, 0]} radius={.235} length={.016} material={active ? opalLit : opal} /></Part>
    <Cover custom p={[0, .51, 0]}><T radius={.33} tube={.032} r={[Math.PI / 2, 0, 0]} m="white" /><C radius={.3} length={.018} material={active ? opalLit : opal} /></Cover>
    <Part id="mounting">{[-.33, .33].map(x => <group key={x}><B p={[x, .38, 0]} s={[.16, .02, .08]} m="steel" r={[0, 0, x < 0 ? -.28 : .28]} /><C p={[x, .36, 0]} radius={.023} length={.09} m="steel" r={[Math.PI / 2, 0, 0]} /></group>)}</Part>
    {internal && <><PCB p={[0, .39, 0]} width={.36} height={.13} /><Part id="electronics">{[-.12, 0, .12].map(x => <B key={x} p={[x, .46, .08]} s={[.065, .024, .038]} material={active ? orangeLight : mat.ceramic} />)}</Part></>}
  </group></group>;
  if (linear) return <>
    <Part id="body"><RB p={[0, .72, -.04]} s={[1.23, .27, .23]} radius={.044} /><B p={[0, .74, .083]} s={[1.07, .16, .017]} m="steel" />{[-.565, .565].map(x => <RB key={x} p={[x, .73, .105]} s={[.105, .28, .29]} radius={.045} />)}</Part>
    <Part id="electronics">{detailed && Array.from({ length: 16 }, (_, i) => <B key={i} p={[-.48 + i * .064, .74, .1]} s={[.026, .034, .017]} material={active ? orangeLight : mat.ceramic} />)}</Part>
    <Cover custom p={[0, .74, .14]} s={[1.05, .23, .04]}><C radius={.111} length={1.04} r={[0, 0, Math.PI / 2]} material={active ? opalLit : opal} segments={32} />{detailed && Array.from({ length: 7 }, (_, i) => <LineTube key={i} points={[[-.5, -.075 + i * .025, .09], [0, -.075 + i * .025, .1], [.5, -.075 + i * .025, .09]]} radius={.003} m="white" />)}</Cover>
    <Part id="mounting">{[-.38, .38].map(x => <group key={x}><B p={[x, .72, -.17]} s={[.12, .32, .05]} m="steel" /><Screw p={[x, .61, -.133]} /><Screw p={[x, .83, -.133]} /></group>)}</Part>
    {/emergency|maintained/.test(variant) && <><Part id="battery">{[-.03, .05].map(y => <C key={y} p={[0, .56 + y, -.05]} radius={.035} length={.55} m="green" r={[0, 0, Math.PI / 2]} />)}<LineTube points={[[-.29, .58, -.05], [-.37, .64, .03], [-.37, .72, .06]]} radius={.009} m="red" /></Part><LED p={[.56, .73, .256]} active color="green" /></>}
    {internal && <PCB p={[0, .86, -.02]} width={.74} height={.085} />}
  </>;
  const profile = [new THREE.Vector2(.09, 0), new THREE.Vector2(.094, .075), new THREE.Vector2(.14, .14), new THREE.Vector2(.21, .24), new THREE.Vector2(.237, .36), new THREE.Vector2(.21, .49), new THREE.Vector2(.126, .585), new THREE.Vector2(0, .615)];
  return <>
    <Part id="body"><C p={[0, .16, 0]} radius={.29} length={.07} /><C p={[0, .215, 0]} radius={.235} length={.075} m="white" /><C p={[0, .3, 0]} radius={.143} length={.17} m="ceramic" /><T p={[0, .355, 0]} radius={.142} tube={.013} m="white" r={[Math.PI / 2, 0, 0]} /><C p={[0, .41, 0]} radius={.105} length={.13} m="steel" /><T p={[0, .465, 0]} radius={.104} tube={.01} r={[Math.PI / 2, 0, 0]} /></Part>
    <Part id="pins">{[-.108, .108].map(x => <C key={x} p={[x, .42, 0]} radius={.014} length={.034} m="brass" r={[0, 0, Math.PI / 2]} />)}</Part>
    <Part id="lamp"><mesh position={[0, .468, 0]} material={internal ? bulbGlass : active ? opalLit : opal} geometry={geometry('bulb-envelope', () => new THREE.LatheGeometry(profile, 48))} dispose={null} castShadow /></Part>
    <Part id="contacts"><C p={[0, .3, -.06]} radius={.03} length={.11} m="brass" />{detailed && <LineTube points={[[-.035, .45, 0], [-.035, .78, 0], [-.07, .85, 0], [.07, .85, 0], [.035, .78, 0], [.035, .45, 0]]} radius={.005} material={active ? orangeLight : mat.steel} />}</Part>
    <Part id="mounting"><Screw p={[-.2, .18, .09]} /><Screw p={[.2, .18, .09]} /></Part>
    {internal && <Part id="electronics"><B p={[0, .49, 0]} s={[.12, .024, .08]} m="pcb" /><C p={[0, .57, 0]} radius={.025} length={.12} m="black" /></Part>}
  </>;
}
function SensorModel() {
  const { variant, internal, closed, props } = useModel();
  const sensorVariant = `${variant} ${String(props.component.params.mode ?? '').toLowerCase()}`;
  if (/float/.test(sensorVariant)) return <>
    <Part id="body"><B p={[-.25, .96, .03]} s={[.22, .32, .24]} m="black" /></Part>
    <Part id="actuator" position={[-.2, .82, .05]} rotation={[0, 0, closed ? -.35 : .35]}><C p={[.27, 0, 0]} radius={.018} length={.54} m="steel" r={[0, 0, Math.PI / 2]} /><S p={[.56, 0, 0]} radius={.2} scale={[1.4, 1, 1]} m="red" /></Part>
    <Part id="cable"><LineTube points={[[-.28, 1.1, .03], [-.43, 1.28, .03], [-.5, 1.28, .03]]} radius={.025} m="black" /></Part>
  </>;
  if (/pressure/.test(sensorVariant)) return <>
    <Part id="body"><C p={[0, .55, 0]} radius={.055} length={.32} m="brass" /><C p={[0, .87, 0]} radius={.28} length={.16} r={[Math.PI / 2, 0, 0]} m="steel" /><C p={[0, .87, .09]} radius={.24} length={.012} r={[Math.PI / 2, 0, 0]} m="cream" /></Part>
    <Part id="sensingcore"><B p={[closed ? .05 : -.07, .95, .12]} s={[.018, .22, .015]} m="red" r={[0, 0, closed ? -.45 : .7]} /><C p={[0, .87, .13]} radius={.028} length={.016} r={[Math.PI / 2, 0, 0]} m="black" /></Part>
    <T p={[0, .87, .12]} radius={.255} tube={.023} /><Fixings width={.5} bottom={.38} top={1.16} z={.12} />
  </>;
  if (/limit/.test(sensorVariant)) return <>
    <Part id="body"><B p={[0, .63, 0]} s={[.53, .67, .3]} m="grey" /><B p={[0, .9, .05]} s={[.36, .2, .35]} m="black" /></Part>
    <Part id="actuator"><B p={[.1, 1.12, .07]} s={[.07, .32, .055]} m="steel" r={[0, 0, closed ? -.5 : .3]} /><C p={[.13, 1.26, .1]} radius={.09} length={.1} m="black" r={[Math.PI / 2, 0, 0]} /></Part>
    <Fixings width={.5} bottom={.39} top={.83} z={.17} />
  </>;
  return <>
    <Part id="body"><B p={[0, .73, -.02]} s={[.74, .89, .29]} /></Part>
    <Cover p={[0, .74, .22]} s={[.7, .84, .04]}><Part id="sensingcore">
      {/photo/.test(sensorVariant) ? <C p={[0, .12, .07]} radius={.12} length={.07} m="black" r={[Math.PI / 2, 0, 0]} /> : <S p={[0, -.12, .026]} radius={.24} scale={[1.1, .83, .43]} m="white" />}
      {/pir/.test(sensorVariant) && Array.from({ length: 5 }, (_, i) => <B key={i} p={[0, -.27 + i * .07, .125]} s={[.37 - Math.abs(2 - i) * .03, .006, .003]} m="grey" />)}
    </Part><LED p={[0, .25, .055]} /><Screw p={[0, -.35, .05]} /></Cover>
    {internal && <PCB p={[0, .75, .08]} width={.58} height={.6} />}
  </>;
}
function ControllerModel() {
  const { variant, internal, active, closed, props } = useModel();
  if (/cutout|cut-out/.test(variant)) return <><Part id="body"><B p={[0, .71, .02]} s={[.67, .61, .28]} m="black" /><B p={[0, .42, .01]} s={[.8, .055, .36]} m="steel" /></Part><Cover p={[0, .72, .2]} s={[.61, .55, .045]}><Part id="actuator"><C p={[0, .08, .055]} radius={.075} length={.07} m="red" r={[Math.PI / 2, 0, 0]} /></Part><B p={[0, -.12, .028]} s={[.36, .05, .008]} m="dark" /></Cover><Part id="sensingcore"><C p={[.16, 1.12, .02]} radius={.023} length={.39} m="copper" /><LineTube points={[[.16, .93, .02], [.35, .9, .02], [.37, .54, .02], [.21, .51, .02]]} radius={.012} m="copper" /></Part>{internal && <Part id="safetycutout"><B p={[0, .73, .12]} s={[.32, .02, .035]} m="copper" r={[0, 0, closed ? 0 : .3]} /><B p={[-.18, .65, .1]} s={[.045, .16, .035]} m="brass" /><B p={[.18, .8, .1]} s={[.045, .16, .035]} m="brass" /></Part>}</>;
  const thermostat = /thermostat|humid/.test(variant);
  const clock = /timer|timeclock|programmer|boost/.test(variant);
  return <>
    <Part id="body"><B p={[0, .74, 0]} s={[.94, .95, .3]} m="cream" /></Part>
    <Cover p={[0, .73, .21]} s={[.92, .91, .055]}>
      <Display p={[0, .17, .044]} width={.62} height={.22} value={thermostat ? `${Number(props.component.params.temperature ?? 18).toFixed(1)} °C` : clock ? `t+${Number(props.state?.elapsed ?? 0).toFixed(1)} s` : active ? 'OUTPUT ON' : 'STANDBY'} />
      {clock ? <Part id="actuator"><C p={[-.23, -.2, .07]} radius={.13} length={.06} r={[Math.PI / 2, 0, 0]} m="grey" /><B p={[-.23, -.15, .108]} s={[.012, .09, .01]} m="white" />{[0, 1, 2].map(i => <B key={i} p={[.04 + i * .11, -.19, .071]} s={[.08, .065, .04]} m={i === 0 ? 'blue' : 'white'} />)}</Part> : <Part id="actuator"><C p={[0, -.18, .093]} radius={.17} length={.12} r={[Math.PI / 2, 0, 0]} m="white" /><B p={[closed ? -.06 : .06, -.08, .16]} s={[.019, .06, .01]} m="blue" /></Part>}
      <LED p={[.32, -.31, .069]} />
    </Cover>
    {internal && <><PCB p={[0, .74, .06]} width={.77} height={.74} /><Part id="contacts"><B p={[.2, .59, .14]} s={[.18, .2, .12]} m="black" /></Part>{thermostat && <Part id="sensingcore"><C p={[-.24, .46, .18]} radius={.025} length={.15} m="copper" /></Part>}</>}
    <Fixings width={.9} bottom={.34} top={1.13} z={.19} />
  </>;
}
function HeaterModel() {
  const { variant, active, internal, detailed } = useModel();
  if (/mat|underfloor/.test(variant)) return <>
    <Part id="body"><B p={[0, .08, 0]} s={[1.2, .055, .74]} m="cream" />{detailed && Array.from({ length: 16 }, (_, i) => <B key={i} p={[-.56 + i * .074, .113, 0]} s={[.007, .003, .69]} m="grey" />)}</Part>
    <Part id="heater">{[-.28, -.14, 0, .14, .28].map((z, i) => <LineTube key={z} points={i % 2 ? [[.5, .13, z], [-.5, .13, z], [-.52, .13, z + .06]] : [[-.5, .13, z], [.5, .13, z], [.52, .13, z + .06]]} radius={.014} material={active ? orangeLight : mat.red} />)}</Part>
    <Part id="sensingcore"><S p={[.21, .145, -.1]} radius={.027} m="black" /><LineTube points={[[.21, .145, -.1], [.21, .145, -.36], [.6, .15, -.4]]} radius={.011} m="black" /></Part>
  </>;
  if (/immersion/.test(variant)) return <>
    <Part id="body"><C p={[0, .90, 0]} radius={.36} length={.10} m="brass" /><C p={[0, 1.00, 0]} radius={.25} length={.10} m="black" /><C p={[0, 1.145, 0]} radius={.23} length={.30} m="white" /></Part>
    <Part id="mounting">{[.868, .904, .94].map(y => <T key={y} p={[0, y, 0]} radius={.32} tube={.013} m="brass" r={[Math.PI / 2, 0, 0]} />)}</Part>
    <Part id="heater"><LineTube points={[[-.14, .92, 0], [-.15, .46, 0], [-.1, .13, 0], [.1, .13, 0], [.15, .46, 0], [.14, .92, 0]]} radius={.037} material={active ? orangeLight : mat.copper} /></Part>
    <Part id="sensingcore"><C p={[0, .52, 0]} radius={.023} length={.83} m="steel" /></Part>
    {internal && <Part id="safetycutout"><B p={[0, 1.17, .14]} s={[.18, .1, .08]} m="red" /><Screw p={[0, 1.16, .19]} /></Part>}
    <Cover round p={[0, 1.145, .235]} s={[.46, .46, .03]} />
  </>;
  return <>
    <Part id="body"><B p={[0, .69, -.04]} s={[1.12, 1.04, .44]} m="cream" /><B p={[0, .16, -.04]} s={[1.03, .12, .52]} m="dark" /></Part>
    <Cover p={[0, .69, .23]} s={[1.1, 1.02, .05]}>{Array.from({ length: 9 }, (_, i) => <B key={i} p={[0, -.31 + i * .081, .035]} s={[.95, .032, .025]} m="grey" />)}</Cover>
    {internal && <Part id="heater">{[-.32, 0, .32].flatMap(x => [.45, .76, 1.04].map(y => <B key={`${x}${y}`} p={[x, y, .1]} s={[.29, .25, .13]} m="red" />))}<LineTube points={[[-.43, .35, .18], [-.43, 1.1, .18], [0, 1.1, .18], [0, .35, .18], [.43, .35, .18], [.43, 1.1, .18]]} radius={.023} material={active ? orangeLight : mat.steel} /></Part>}
    <Part id="actuator"><C p={[.4, 1.15, .3]} radius={.065} length={.055} m="black" r={[Math.PI / 2, 0, 0]} /></Part>
  </>;
}
function Spin({ children, speed = 6, axis = 'z' }: { children: ReactNode; speed?: number; axis?: 'x' | 'y' | 'z' }) {
  const ref = useRef<THREE.Group>(null);
  const { active, props } = useModel();
  useFrame((_, dt) => { if (ref.current && active) ref.current.rotation[axis] += Math.min(dt, .05) * speed * (props.state?.direction || 1); });
  return <group ref={ref}>{children}</group>;
}
function FanAssembly({ p = [0, .76, .12], radius = .37, guard = true }: { p?: Vec3; radius?: number; guard?: boolean }) {
  const { detailed } = useModel();
  return <group position={p}>
    <Part id="rotor"><Spin>{[0, 1, 2, 3, 4].map(i => <group key={i} rotation={[0, 0, i * Math.PI * 2 / 5]}><B p={[0, radius * .49, .02]} s={[radius * .46, radius * .63, .026]} m="grey" r={[0, .3, .35]} /></group>)}<C radius={radius * .18} length={.1} r={[Math.PI / 2, 0, 0]} m="steel" /></Spin></Part>
    {guard && <Part id="cover"><T p={[0, 0, .1]} radius={radius} tube={.025} m="white" />{detailed && <>{[.3, .5, .7, .9].map(f => <T key={f} p={[0, 0, .11]} radius={radius * f} tube={.009} m="white" />)}{[0, 1, 2, 3].map(i => <B key={i} p={[0, 0, .1]} s={[radius * 2, .015, .015]} m="white" r={[0, 0, i * Math.PI / 4]} />)}</>}</Part>}
  </group>;
}
function FanModel() {
  const { internal } = useModel();
  return <>
    <Part id="body"><B p={[0, .74, -.08]} s={[1, .98, .24]} /><C p={[0, .75, -.12]} radius={.35} length={.36} m="grey" r={[Math.PI / 2, 0, 0]} /></Part>
    <FanAssembly guard={!internal} /><Fixings width={.95} bottom={.32} top={1.15} z={.07} />
    {internal && <><Coil p={[0, .75, -.1]} radius={.07} length={.2} r={[Math.PI / 2, 0, 0]} /><PCB p={[.34, .93, .07]} width={.19} height={.32} /></>}
  </>;
}
function MotorModel({ pump = false }: { pump?: boolean }) {
  const { detailed, internal, variant } = useModel();
  return <>
    <Part id="body"><C p={[-.12, .64, -.02]} radius={.3} length={.74} m="blue" r={[0, 0, Math.PI / 2]} />{detailed && Array.from({ length: 11 }, (_, i) => { const a = i * Math.PI * 2 / 11; return <B key={i} p={[-.12, .64 + Math.sin(a) * .305, -.02 + Math.cos(a) * .305]} s={[.66, .045, .045]} m="blue" r={[a, 0, 0]} />; })}<C p={[-.51, .64, -.02]} radius={.32} length={.09} m="black" r={[0, 0, Math.PI / 2]} /><B p={[-.14, .3, -.02]} s={[.69, .09, .51]} m="blue" /><B p={[-.08, 1.03, -.04]} s={[.34, .18, .29]} m="blue" /></Part>
    <Part id="rotor" position={[.29, .64, -.02]}><Spin axis="x" speed={10}><C p={[.12, 0, 0]} radius={.045} length={.33} m="steel" r={[0, 0, Math.PI / 2]} /><B p={[.21, .047, 0]} s={[.17, .024, .035]} m="steel" />{internal && <C p={[-.35, 0, 0]} radius={.18} length={.54} m="steel" r={[0, 0, Math.PI / 2]} />}</Spin></Part>
    {internal && <>{[-.27, -.08, .11].map(x => <Coil key={x} p={[x, .64, 0]} radius={.22} length={.08} r={[0, 0, Math.PI / 2]} />)}</>}
    {pump && <Part id="impeller"><C p={[.46, .64, -.02]} radius={.31} length={.18} m="green" r={[0, 0, Math.PI / 2]} /><C p={[.47, 1.02, -.02]} radius={.09} length={.28} m="green" /><C p={[.68, .64, -.02]} radius={.11} length={.25} m="green" r={[0, 0, Math.PI / 2]} /><T p={[.81, .64, -.02]} radius={.13} tube={.023} m="brass" r={[0, Math.PI / 2, 0]} /></Part>}
    {/single/.test(variant) && <Part id="capacitor"><C p={[-.25, 1.02, .08]} radius={.075} length={.35} m="black" r={[0, 0, Math.PI / 2]} /></Part>}
    <Screw p={[-.36, .31, .24]} /><Screw p={[.1, .31, .24]} />
  </>;
}
function ValveModel() {
  const { active, props, internal, variant } = useModel();
  const three = /valve3|three-port|mid-position/.test(variant) || props.component.params.mode === 'three-port';
  return <>
    <Part id="body"><C p={[0, .42, 0]} radius={.1} length={1.1} m="brass" r={[0, 0, Math.PI / 2]} />{three && <><C p={[0, .42, .22]} radius={.09} length={.45} m="brass" r={[Math.PI / 2, 0, 0]} /><C p={[0, .42, .43]} radius={.13} length={.08} m="brass" r={[Math.PI / 2, 0, 0]} /></>}<C p={[0, .47, 0]} radius={.2} length={.32} m="brass" />{[-.5, .5].map(x => <C key={x} p={[x, .42, 0]} radius={.14} length={.09} m="brass" r={[0, 0, Math.PI / 2]} />)}</Part>
    <Part id="actuator"><B p={[0, .83, 0]} s={[.56, .39, .45]} m="grey" /><B p={[0, 1.04, .03]} s={[.5, .05, .38]} m="black" /><B p={[active ? .13 : -.13, 1.08, .1]} s={[.2, .045, .06]} m="red" /><LED p={[.15, .9, .238]} /></Part>
    {(internal || props.view === 'cutaway') && <Part id="rotor"><S p={[0, .44, 0]} radius={.15} m="steel" /><C p={[0, .61, 0]} radius={.035} length={.25} m="steel" /><B p={[0, .85, .03]} s={[.27, .025, .08]} m="steel" r={[0, active ? .6 : -.6, 0]} /></Part>}
    {internal && <Coil p={[0, .86, -.07]} radius={.1} length={.13} />}
  </>;
}
function ContactorModel({ overload = false }: { overload?: boolean }) {
  const { internal, active, closed, props, detailed } = useModel();
  return <>
    <Part id="body"><B p={[0, .73, -.04]} s={[.78, .86, .34]} m={overload ? 'grey' : 'white'} /><B p={[0, .73, -.25]} s={[.63, .56, .13]} m="black" /></Part>
    <Cover p={[0, .77, .22]} s={[.72, .52, .035]}><B p={[0, .04, .035]} s={[.46, .17, .015]} m="dark" />{overload ? <><C p={[-.17, -.16, .06]} radius={.065} length={.06} m="red" r={[Math.PI / 2, 0, 0]} /><C p={[.17, -.16, .06]} radius={.065} length={.06} m="blue" r={[Math.PI / 2, 0, 0]} /></> : <B p={[0, -.1, closed ? .023 : .065]} s={[.3, .08, .05]} m="black" />}<LED p={[.27, .1, .05]} active={overload ? !!props.state?.tripped : active} color={overload ? 'red' : 'green'} /></Cover>
    {internal && <>
      {!overload && <Coil p={[0, .57, .02]} radius={.14} length={.29} />}
      {!overload && active && <Part id="coil"><T p={[0, .58, .12]} radius={.105} tube={.009} material={orangeLight} /></Part>}
      <Part id={overload ? 'safetycutout' : 'contacts'}>{[-.22, 0, .22].map(x => <group key={x}><B p={[x, .99, .08]} s={[.065, .27, .042]} m="copper" /><B p={[x, .53, .08]} s={[.065, .18, .042]} m="copper" /><B p={[x, .81, closed ? .08 : .15]} s={[.075, .12, .03]} m="steel" r={[0, 0, overload ? .18 : 0]} />{detailed && overload && <B p={[x + .012, .75, .12]} s={[.018, .35, .014]} m="copper" r={[0, 0, props.state?.tripped ? .3 : 0]} />}</group>)}</Part>
      {!overload && <Part id="actuator"><B p={[0, .78, closed ? .07 : .13]} s={[.64, .035, .1]} m="dark" /><C p={[.27, .6, .07]} radius={.025} length={.2} m="steel" /></Part>}
    </>}
    <Rails p={[0, .46, -.3]} width={.83} />
  </>;
}
function ElectronicModel() {
  const { variant, internal, active, closed, detailed, props } = useModel();
  const frequency = Number(props.component.params.frequency ?? 50);
  const plc = /plc|io|safety/.test(variant);
  const inverter = /inverter|pv|battery|vfd|drive/.test(variant);
  return <>
    <Part id="body"><B p={[0, .73, -.02]} s={[1.02, 1.14, .4]} m={plc ? 'dark' : 'white'} /><B p={[0, .73, -.26]} s={[.95, 1.08, .13]} m="steel" />{detailed && inverter && Array.from({ length: 11 }, (_, i) => <B key={i} p={[-.43 + i * .086, .73, -.36]} s={[.025, 1.01, .13]} m="steel" />)}</Part>
    <Cover p={[0, .76, .24]} s={[.95, 1.05, .055]}>
      <B p={[0, .16, .04]} s={[.7, .56, .04]} m="dark" /><Display p={[0, .25, .072]} width={.54} height={.19} value={plc ? 'I/O ONLINE' : /vfd|drive/.test(variant) ? `${active && closed && Number.isFinite(frequency) ? frequency.toFixed(1) : '0.0'} Hz` : active ? 'AC ONLINE' : 'STANDBY'} />
      {[-.22, 0, .22].map((x, i) => <Part key={x} id="actuator"><B p={[x, -.02, .087]} s={[.13, .09, .035]} m={i === 0 ? 'green' : i === 2 ? 'red' : 'grey'} /></Part>)}
      {plc && [-.26, -.13, 0, .13, .26].map(x => <LED key={x} p={[x, -.29, .065]} />)}
      {detailed && Array.from({ length: 8 }, (_, i) => <B key={i} p={[.36, -.38 + i * .065, .047]} s={[.07, .02, .016]} m="dark" />)}
    </Cover>
    {internal && <><PCB p={[0, .82, .1]} width={.82} height={.77} />{inverter && <Part id="converter"><C p={[-.22, .42, .15]} radius={.09} length={.22} m="black" /><C p={[.02, .42, .15]} radius={.09} length={.22} m="black" /><T p={[.29, .44, .13]} radius={.11} tube={.04} m="copper" /></Part>}</>}
    {/battery/.test(variant) && <Part id="battery"><B p={[0, .22, .01]} s={[.82, .23, .28]} m="black" />{[-.29, 0, .29].map(x => <B key={x} p={[x, .23, .17]} s={[.23, .19, .018]} m="blue" />)}</Part>}
    <Rails p={[0, .39, -.36]} width={1.08} />
  </>;
}
function AlarmModel() {
  const { internal, detailed, active, variant } = useModel();
  if (/chime|doorbell/.test(variant)) return <><Part id="body"><B p={[0, .72, -.03]} s={[1.1, .79, .25]} m="cream" /></Part><Cover p={[0, .72, .16]} s={[1.08, .77, .04]}>{[-.28, -.14, 0, .14, .28].map(x => <B key={x} p={[x, 0, .03]} s={[.025, .49, .015]} m="dark" />)}</Cover>{internal && <><Part id="actuator"><B p={[-.28, .75, .1]} s={[.065, .53, .05]} m="steel" /><B p={[.28, .75, .1]} s={[.065, .53, .05]} m="steel" /><C p={[active ? -.12 : 0, .73, .1]} radius={.035} length={.34} m="steel" r={[0, 0, Math.PI / 2]} /></Part><Coil p={[0, .74, .05]} radius={.075} length={.24} /></>}</>;
  return <>
    <Part id="body"><C p={[0, .73, 0]} radius={.47} length={.2} m="white" r={[Math.PI / 2, 0, 0]} /><C p={[0, .73, .1]} radius={.4} length={.1} m="cream" r={[Math.PI / 2, 0, 0]} /></Part>
    <Cover round p={[0, .73, .19]} s={[.92, .92, .05]}><C p={[0, 0, .049]} radius={.16} length={.06} r={[Math.PI / 2, 0, 0]} m="white" />{detailed && Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI * 2 / 16; return <B key={i} p={[Math.sin(a) * .31, Math.cos(a) * .31, .035]} s={[.027, .1, .01]} m="dark" r={[0, 0, -a]} />; })}<LED p={[0, -.2, .04]} active={active} /></Cover>
    {internal && <><PCB p={[0, .73, .08]} width={.56} height={.48} /><Part id="battery"><B p={[-.22, .54, .16]} s={[.21, .16, .1]} m="yellow" /><B p={[-.3, .63, .17]} s={[.035, .025, .02]} m="steel" /></Part><Part id="sensingcore"><C p={[.19, .86, .13]} radius={.13} length={.14} m="black" r={[Math.PI / 2, 0, 0]} /></Part></>}
  </>;
}
function ChargerModel() {
  const { internal, active } = useModel();
  return <>
    <Part id="body"><B p={[0, .82, -.02]} s={[.72, 1.1, .36]} m="dark" /><B p={[0, .8, .18]} s={[.64, .97, .06]} /><C p={[0, .57, .25]} radius={.105} length={.06} m="black" r={[Math.PI / 2, 0, 0]} /></Part>
    <Cover p={[0, .85, .26]} s={[.6, .75, .03]}><Display p={[0, .17, .026]} width={.43} height={.16} value={active ? 'CHARGING' : 'READY'} /><B p={[0, -.05, .027]} s={[.46, .045, .025]} material={active ? greenLight : offLight} /></Cover>
    <Part id="cable"><LineTube points={[[.26, .42, .12], [.47, .19, .16], [.63, .25, .2], [.62, .87, .14], [.43, .99, .16]]} radius={.037} m="black" /></Part>
    <Part id="plug"><B p={[.44, 1.03, .19]} s={[.14, .28, .16]} m="black" r={[0, 0, .28]} /><C p={[.4, 1.15, .19]} radius={.075} length={.12} m="grey" /><Screw p={[.45, 1, .28]} /></Part>
    {internal && <><PCB p={[0, .89, .1]} width={.5} height={.48} /><Part id="contacts"><B p={[0, .53, .13]} s={[.32, .2, .15]} m="black" /></Part><Part id="sensingcore"><T p={[0, .39, .11]} radius={.085} tube={.032} m="dark" /></Part></>}
  </>;
}
function TransformerModel() {
  const { internal, detailed, variant } = useModel();
  return <>
    <Part id="body"><B p={[0, .26, 0]} s={[.86, .08, .49]} m="steel" /><B p={[-.28, .67, 0]} s={[.16, .73, .33]} m="dark" /><B p={[.28, .67, 0]} s={[.16, .73, .33]} m="dark" /><B p={[0, 1.03, 0]} s={[.72, .16, .33]} m="dark" /><B p={[0, .32, 0]} s={[.72, .16, .33]} m="dark" />{detailed && Array.from({ length: 10 }, (_, i) => <B key={i} p={[0, 1.03, -.15 + i * .033]} s={[.7, .005, .014]} m="steel" />)}</Part>
    <Coil p={[-.14, .68, 0]} radius={.16} length={.5} /><Coil p={[.14, .68, 0]} radius={.15} length={.5} />
    {!internal && /driver|doorbell|shaver/.test(variant) && <Cover p={[0, .73, .24]} s={[.89, .93, .035]} />}
    <Fixings width={.83} bottom={.25} top={1.08} z={.19} />
  </>;
}
function BarModel() {
  const { variant } = useModel();
  const earth = /earth|pe/.test(variant);
  return <>
    <Part id="body"><B p={[0, .44, -.02]} s={[1.16, .23, .2]} m={earth ? 'green' : /neutral/.test(variant) ? 'blue' : 'cream'} /></Part>
    <Rails p={[0, .36, -.15]} width={1.2} />
  </>;
}
function JunctionModel() {
  const { variant, internal } = useModel();
  const round = /rose|round/.test(variant);
  return <>
    <Part id="body">{round ? <C p={[0, .65, -.04]} radius={.42} length={.16} r={[Math.PI / 2, 0, 0]} /> : <B p={[0, .67, -.03]} s={[.91, .8, .22]} />}</Part>
    <Cover round={round} p={[0, .68, .24]} s={round ? [.85, .85, .035] : [.91, .8, .035]}><Screw p={round ? [0, 0, .039] : [-.36, .29, .038]} />{!round && <Screw p={[.36, -.29, .038]} />}</Cover>
    {internal && <Part id="cable"><LineTube points={[[0, .57, .1], [0, .29, .12], [.2, .18, .12]]} radius={.035} m="white" /></Part>}
  </>;
}
function CableModel() {
  const { variant, detailed } = useModel();
  const count = /five|5|threephase|three-phase/.test(variant) ? 5 : 3;
  return <>
    <Part id="body"><C p={[-.31, .6, 0]} radius={.18} length={.72} m="grey" r={[0, 0, Math.PI / 2]} /><C p={[.07, .6, 0]} radius={.165} length={.06} m="cream" r={[0, 0, Math.PI / 2]} /></Part>
    <Part id="cable">{Array.from({ length: count }, (_, i) => { const a = i * Math.PI * 2 / count; const y = .6 + Math.cos(a) * .09; const z = Math.sin(a) * .09; return <group key={i}><C p={[.28, y, z]} radius={.04} length={.43} m={i === 0 ? 'blue' : i === 1 ? 'green' : i === 2 ? 'brown' : i === 3 ? 'black' : 'grey'} r={[0, 0, Math.PI / 2]} />{i === 1 && <B p={[.28, y, z + .039]} s={[.43, .017, .006]} m="yellow" />}<C p={[.52, y, z]} radius={.022} length={.16} m="copper" r={[0, 0, Math.PI / 2]} />{detailed && [0, 1, 2].map(j => <C key={j} p={[.58, y + (j - 1) * .01, z]} radius={.006} length={.075} m="copper" r={[0, 0, Math.PI / 2]} />)}</group>; })}</Part>
    <Part id="gland"><C p={[-.52, .6, 0]} radius={.215} length={.16} m="black" r={[0, 0, Math.PI / 2]} segments={6} /><T p={[-.42, .6, 0]} radius={.19} tube={.015} r={[0, Math.PI / 2, 0]} /></Part>
  </>;
}
function ConduitModel() {
  const { variant, detailed } = useModel();
  if (/trunk/.test(variant)) return <>
    <Part id="body"><B p={[0, .22, 0]} s={[1.18, .035, .34]} m="grey" />{[-.16, .16].map(z => <group key={z}><B p={[0, .26, z]} s={[1.18, .055, .025]} m="grey" />{Array.from({ length: detailed ? 16 : 8 }, (_, i) => <B key={i} p={[-.55 + i * (detailed ? .073 : .157), .35, z]} s={[detailed ? .04 : .08, .17, .025]} m="grey" />)}</group>)}</Part>
    <Cover custom p={[0, .45, 0]}><RB s={[1.21, .043, .36]} m="grey" radius={.012} /><B p={[0, -.029, -.16]} s={[1.2, .02, .023]} m="dark" /><B p={[0, -.029, .16]} s={[1.2, .02, .023]} m="dark" /></Cover>
    <Part id="mounting">{[-.37, .37].map(x => <group key={x} position={[x, .24, 0]} rotation={[-Math.PI / 2, 0, 0]}><Screw p={[0, 0, 0]} /></group>)}</Part>
    <Part id="cable"><LineTube points={[[-.57, .29, -.08], [0, .29, -.08], [.55, .29, -.08]]} radius={.014} m="brown" /><LineTube points={[[-.57, .29, .03], [0, .29, .03], [.55, .29, .03]]} radius={.014} m="blue" /></Part>
  </>;
  return <>
    <Part id="body"><LineTube points={[[-.55, .43, 0], [-.15, .43, 0], [.2, .48, 0], [.3, .82, 0], [.3, 1.18, 0]]} radius={.085} m="grey" /></Part>
    <Part id="mounting">{[-.42, -.05].map(x => <group key={x}><T p={[x, .43, 0]} radius={.092} tube={.018} m="steel" r={[0, Math.PI / 2, 0]} /><B p={[x, .43, -.12]} s={[.09, .27, .025]} m="steel" /><Screw p={[x, .32, -.098]} /></group>)}</Part>
    <Part id="gland"><C p={[.3, 1.13, 0]} radius={.11} length={.18} m="black" segments={6} /></Part>
  </>;
}
function InstrumentModel() {
  const { variant, props, active } = useModel();
  const reading=String(props.component.params.reading ?? '— — —');
  if (/clamp/.test(variant)) return <>
    <Part id="body"><B p={[0, .48, 0]} s={[.48, .67, .25]} m="yellow" /><B p={[0, .46, .15]} s={[.38, .55, .04]} m="black" /></Part>
    <Part id="sensingcore"><T p={[0, 1.02, 0]} radius={.26} tube={.075} m="red" /><B p={[0, 1.31, 0]} s={[.028, .11, .18]} m="black" /></Part>
    <Display p={[0, .61, .19]} width={.3} height={.13} value={reading} /><Part id="actuator"><C p={[0, .34, .18]} radius={.09} length={.05} m="grey" r={[Math.PI / 2, 0, 0]} /></Part>
  </>;
  return <>
    <Part id="body"><B p={[0, .71, 0]} s={[.72, 1.17, .27]} m="yellow" /><B p={[0, .71, .15]} s={[.61, 1.04, .05]} m="black" /></Part>
    <Display p={[0, 1.03, .19]} width={.5} height={.2} value={reading} />
    <Part id="actuator"><C p={[0, .64, .22]} radius={.18} length={.09} m="grey" r={[Math.PI / 2, 0, 0]} /><B p={[.06, .75, .27]} s={[.023, .1, .016]} m="white" /></Part>
    <Part id="probes">{[-.21, 0, .21].map((x, i) => <group key={x}><C p={[x, .28, .2]} radius={.045} length={.04} m={i === 0 ? 'red' : 'black'} r={[Math.PI / 2, 0, 0]} /><C p={[x, .28, .225]} radius={.021} length={.005} m="brass" r={[Math.PI / 2, 0, 0]} /></group>)}</Part>
    <Part id="probes"><LineTube points={[[-.2, .28, .23], [-.43, .12, .19], [-.57, .38, .19], [-.56, .74, .19]]} radius={.012} m="red" /><LineTube points={[[0, .28, .23], [.38, .1, .19], [.56, .33, .19], [.55, .65, .19]]} radius={.012} m="black" /><C p={[-.56, .83, .19]} radius={.025} length={.2} m="red" /><C p={[-.56, 1.01, .19]} radius={.007} length={.16} m="steel" /><C p={[.55, .74, .19]} radius={.025} length={.2} m="black" /><C p={[.55, .91, .19]} radius={.007} length={.16} m="steel" /></Part>
  </>;
}
function ApplianceModel() {
  const { variant, internal, active, detailed } = useModel();
  if (/cooker|hob/.test(variant)) return <>
    <Part id="body"><B p={[0, .57, -.03]} s={[1.09, 1.02, .66]} m="steel" /><B p={[0, 1.1, -.03]} s={[1.1, .06, .72]} m="black" /><B p={[0, .5, .33]} s={[.94, .59, .027]} m="black" /><B p={[0, .75, .37]} s={[.7, .035, .055]} m="steel" /></Part>
    <Part id="heater">{[-.28, .28].flatMap(x => [-.2, .18].map(z => <group key={`${x}${z}`}><T p={[x, 1.138, z]} radius={.14} tube={.016} m="grey" r={[Math.PI / 2, 0, 0]} /><T p={[x, 1.14, z]} radius={.09} tube={.01} r={[Math.PI / 2, 0, 0]} material={active ? orangeLight : mat.grey} /></group>))}</Part>
    <Part id="actuator">{[-.34, -.11, .11, .34].map(x => <C key={x} p={[x, .95, .34]} radius={.05} length={.06} m="black" r={[Math.PI / 2, 0, 0]} />)}</Part>
    {internal && <Part id="heater"><LineTube points={[[-.36, .32, .02], [-.36, .76, .02], [.36, .76, .02], [.36, .32, .02]]} radius={.025} material={active ? orangeLight : mat.steel} /></Part>}
  </>;
  if (/shower/.test(variant)) return <>
    <Part id="body"><B p={[-.15, .81, -.02]} s={[.65, .87, .28]} /></Part>
    <Cover p={[-.15, .81, .18]} s={[.61, .83, .05]}><Part id="actuator"><C p={[0, .13, .07]} radius={.115} length={.07} m="grey" r={[Math.PI / 2, 0, 0]} /><C p={[0, -.15, .07]} radius={.075} length={.06} m="blue" r={[Math.PI / 2, 0, 0]} /></Part></Cover>
    <Part id="pipe"><LineTube points={[[-.15, .4, .1], [-.1, .16, .18], [.5, .21, .18], [.5, .95, .12]]} radius={.025} m="steel" /><C p={[.5, 1.1, .12]} radius={.04} length={.26} m="steel" /><S p={[.5, 1.23, .12]} radius={.115} scale={[1, .45, 1]} m="steel" /></Part>
    {internal && <><Part id="heater"><C p={[-.2, .81, .06]} radius={.12} length={.52} m="copper" /></Part><Part id="safetycutout"><B p={[-.16, 1.11, .09]} s={[.18, .09, .065]} m="red" /></Part></>}
  </>;
  if (/shutter|gate|conveyor/.test(variant)) return <>
    <Part id="body"><B p={[0, .71, -.08]} s={[1.2, .1, .17]} m="steel" /><B p={[-.55, .65, -.08]} s={[.08, 1.19, .17]} m="grey" /><B p={[.55, .65, -.08]} s={[.08, 1.19, .17]} m="grey" /></Part>
    <Part id="actuator"><group position={[0, active ? .44 : .05, 0]}>{Array.from({ length: /gate/.test(variant) ? 8 : 11 }, (_, i) => <B key={i} p={[0, .11 + i * .084, .01]} s={[.99, .067, .035]} m={/gate/.test(variant) ? 'black' : 'steel'} />)}</group><C p={[0, 1.2, -.06]} radius={.075} length={1.12} m="grey" r={[0, 0, Math.PI / 2]} /></Part>
    <Part id="motor"><C p={[.47, 1.2, .08]} radius={.09} length={.25} m="blue" r={[0, 0, Math.PI / 2]} /></Part>
  </>;
  if (/compressor/.test(variant)) return <>
    <Part id="body"><C p={[0, .46, -.03]} radius={.26} length={1.1} m="red" r={[0, 0, Math.PI / 2]} /><S p={[-.53, .46, -.03]} radius={.258} scale={[.3, 1, 1]} m="red" /><S p={[.53, .46, -.03]} radius={.258} scale={[.3, 1, 1]} m="red" /><B p={[0, .72, -.03]} s={[.84, .07, .42]} m="black" /><C p={[-.2, .88, -.03]} radius={.16} length={.36} m="blue" r={[0, 0, Math.PI / 2]} /><B p={[.3, .88, -.03]} s={[.25, .29, .3]} m="steel" /><C p={[.39, 1.04, .05]} radius={.09} length={.06} m="cream" r={[Math.PI / 2, 0, 0]} /></Part>
    <Part id="pipe"><LineTube points={[[.26, .82, .08], [.39, .73, .16], [.4, .46, .18]]} radius={.017} m="copper" /></Part>
    <Part id="mounting">{[-.35, .35].map(x => <C key={x} p={[x, .19, .03]} radius={.11} length={.09} m="black" r={[Math.PI / 2, 0, 0]} />)}</Part>
  </>;
  const heatPump = /heat.?pump/.test(variant);
  const fridge = /refriger/.test(variant);
  return <>
    <Part id="body"><B p={[0, .7, -.04]} s={[1.13, 1.12, .5]} m="white" /><B p={[0, .14, -.04]} s={[1.02, .08, .57]} m="grey" /></Part>
    <Cover p={[0, .72, .27]} s={[1.09, 1.08, .04]}>{heatPump ? <FanAssembly p={[-.18, 0, .06]} radius={.3} /> : <><B p={[fridge ? .37 : 0, fridge ? -.01 : .25, .055]} s={fridge ? [.025, .44, .045] : [.55, .18, .025]} m={fridge ? 'steel' : 'dark'} />{!fridge && <Display p={[0, .25, .075]} width={.4} height={.12} value={active ? 'HEATING' : 'IDLE'} />}</>}{detailed && !fridge && [-.33, -.22, -.11, 0, .11, .22, .33].map(x => <B key={x} p={[x, -.37, .032]} s={[.055, .13, .018]} m="dark" />)}</Cover>
    {internal && <><Part id="pipe"><LineTube points={[[-.31, .2, .13], [-.31, 1.13, .13], [.31, 1.13, .13], [.31, .2, .13]]} radius={.029} m="copper" /></Part><Part id="heater"><C p={[0, .65, .1]} radius={.19} length={.61} m="steel" /></Part><PCB p={[.34, .8, .1]} width={.2} height={.54} /></>}
    <Part id="pipe">{[-.27, .27].map(x => <C key={x} p={[x, .06, -.02]} radius={.045} length={.17} m="brass" />)}</Part>
  </>;
}

function Model() {
  const { props, variant } = useModel();
  if (props.definition.model === 'motor' && /shutter|gate|conveyor/.test(variant)) return <ApplianceModel />;
  if (props.definition.model === 'motor' && /compressor/.test(variant)) return <ApplianceModel />;
  switch (props.definition.model) {
    case 'supply': case 'meter': return <SupplyModel />;
    case 'panel': return <PanelModel />;
    case 'protection': return <ProtectionModel />;
    case 'socket': return <SocketModel />;
    case 'plug': return <PlugModel />;
    case 'switch': return <SwitchModel />;
    case 'lamp': return <LampModel />;
    case 'sensor': return <SensorModel />;
    case 'controller': return <ControllerModel />;
    case 'heater': return <HeaterModel />;
    case 'appliance': return <ApplianceModel />;
    case 'valve': return <ValveModel />;
    case 'pump': return <MotorModel pump />;
    case 'fan': return <FanModel />;
    case 'motor': return <MotorModel />;
    case 'contactor': return <ContactorModel />;
    case 'overload': return <ContactorModel overload />;
    case 'vfd': case 'plc': case 'inverter': return <ElectronicModel />;
    case 'alarm': return <AlarmModel />;
    case 'charger': return <ChargerModel />;
    case 'transformer': return <TransformerModel />;
    case 'bar': return <BarModel />;
    case 'junction': return <JunctionModel />;
    case 'cable': return <CableModel />;
    case 'conduit': return <ConduitModel />;
    case 'instrument': return <InstrumentModel />;
    default: return <ControllerModel />;
  }
}

/** Insulating rear cassettes surround the actual electrical anchors. They add no
 * dummy clamps or screws, and remain fixed when a presentation cover is moved. */
function RearTerminalCarriers({ terminals }: { terminals: TerminalDefinition[] }) {
  const { props, detailed } = useModel();
  const rose = props.component.type === 'rose';
  const indicator = props.component.type === 'indicator';
  const planes = new Map<number, TerminalDefinition[]>();
  for (const terminal of terminals) {
    const plane = planes.get(terminal.anchor[2]) ?? [];
    plane.push(terminal); planes.set(terminal.anchor[2], plane);
  }
  const colour: MaterialKey = props.definition.model === 'bar' ? props.component.type === 'earthbar' ? 'green' : props.component.type === 'neutralbar' ? 'blue' : 'cream' : ['switch', 'socket', 'lamp', 'sensor', 'controller', 'alarm', 'junction'].includes(props.definition.model) ? 'cream' : 'dark';
  return <group>{Array.from(planes, ([z, plane]) => {
    const physicalScale = plane[0].scale ?? 1;
    const maxWidth = indicator ? .58 * props.definition.size[0] / 1.3 : Infinity;
    const fitWidth = (width: number) => Math.min(width, maxWidth);
    const xs = plane.map(terminal => terminal.anchor[0]), ys = plane.map(terminal => terminal.anchor[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const rows = new Map<number, TerminalDefinition[]>(), banks = new Map<string, TerminalDefinition[]>();
    for (const terminal of plane) { const row = rows.get(terminal.anchor[1]) ?? []; row.push(terminal); rows.set(terminal.anchor[1], row); }
    for (const terminal of plane) { const name = terminal.group ?? 'Connections', bank = banks.get(name) ?? []; bank.push(terminal); banks.set(name, bank); }
    return <group key={z}>
      {rose ? <group position={[(minX + maxX) / 2, (minY + maxY) / 2 + .039 * physicalScale, z + .095 * physicalScale]} scale={[props.definition.size[0] / 1.3, props.definition.size[1] / 1.45, 1]}><C radius={.42} length={.025 * physicalScale} m={colour} r={[Math.PI / 2, 0, 0]} /></group>
        : <RB p={[(minX + maxX) / 2, (minY + maxY) / 2 + .039 * physicalScale, z + .095 * physicalScale]} s={[fitWidth(maxX - minX + .17 * physicalScale), maxY - minY + .15 * physicalScale, .025 * physicalScale]} m={colour} radius={.014 * physicalScale} />}
      {Array.from(banks, ([name, bank]) => {
        const bx = bank.map(terminal => terminal.anchor[0]), by = bank.map(terminal => terminal.anchor[1]);
        const left = Math.min(...bx), right = Math.max(...bx), bottom = Math.min(...by), top = Math.max(...by);
        return <group key={name}>
          <RB p={[(left + right) / 2, (bottom + top) / 2 + .039 * physicalScale, z + .07 * physicalScale]} s={[fitWidth(right - left + (rose ? .15 : .17) * physicalScale), top - bottom + (rose ? .13 : .15) * physicalScale, .035 * physicalScale]} m={colour} radius={(rose ? .016 : .012) * physicalScale} />
          {!rose && props.selected && props.showLabels && <group position={[(left + right) / 2, top + .142 * physicalScale, z - .009 * physicalScale]} rotation={[0, Math.PI, 0]}><TextureLabel p={[0, 0, 0]} text={name} color="#e8eee8" background="#26343b" width={Math.max(.3 * physicalScale, Math.min(right - left + .3 * physicalScale, name.length * .046 * physicalScale))} height={.065 * physicalScale} /></group>}
        </group>;
      })}
      {!rose && Array.from(rows, ([y, row]) => {
        const sorted = [...row].sort((a, b) => a.anchor[0] - b.anchor[0]);
        const left = sorted[0].anchor[0], right = sorted[sorted.length - 1].anchor[0];
        return <group key={y}>
          {indicator ? <RB p={[(left + right) / 2, y - .027 * physicalScale, z + .022 * physicalScale]} s={[fitWidth(right - left + .17 * physicalScale), .015 * physicalScale, .09 * physicalScale]} m={colour} radius={.008 * physicalScale} />
            : <B p={[(left + right) / 2, y - .027 * physicalScale, z + .022 * physicalScale]} s={[right - left + .17 * physicalScale, .015 * physicalScale, .09 * physicalScale]} m={colour} />}
          {props.definition.model === 'bar' && <Part id="busbar"><B p={[(left + right) / 2, y + .059 * physicalScale, z + .027 * physicalScale]} s={[right - left + .10 * physicalScale, .02 * physicalScale, .022 * physicalScale]} m="brass" /></Part>}
          {detailed && sorted.slice(0, -1).map((terminal, index) => <B key={terminal.id} p={[(terminal.anchor[0] + sorted[index + 1].anchor[0]) / 2, y + .039 * physicalScale, z + .025 * physicalScale]} s={[.009 * physicalScale, .15 * physicalScale, .09 * physicalScale]} m={colour} />)}
        </group>;
      })}
    </group>;
  })}</group>;
}

function Terminal({ terminal }: { terminal: TerminalDefinition }) {
  const { props, detailed } = useModel();
  const [hover, setHover] = useState(false);
  const color = terminalColors[terminal.role] ?? '#9faeb7';
  return <group position={terminal.anchor} rotation={[0, terminal.anchor[2] < 0 ? Math.PI : 0, 0]} onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); props.onTerminal(terminal.id); }} onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
    <group scale={terminal.scale ?? 1}>
    <RB p={[0, .039, -.079]} s={[.135, .11, .11]} radius={.015} m="cream" />
    <B p={[0, .039, -.039]} s={[.102, .075, .07]} material={mat.brass} /><B p={[0, .039, 0]} s={[.096, .058, .008]} m="brass" />
    <C p={[0, .039, .024]} radius={.028} length={.017} m="steel" r={[Math.PI / 2, 0, 0]} />
    {/* The conductor enters at the exact outer anchor, independently of inspection state. */}
    <C p={[0, 0, 0]} radius={.022} length={.015} m="black" r={[Math.PI / 2, 0, 0]} />
    {detailed && <B p={[0, .039, .034]} s={[.033, .006, .002]} m="dark" />}
    <mesh position={[0, -.031, -.019]}><boxGeometry args={[.14, .024, .03]} /><meshStandardMaterial color={color} emissive={hover ? color : '#000000'} emissiveIntensity={hover ? .75 : 0} /></mesh>
    {terminal.role === 'PE' && <B p={[.035, -.031, -.003]} s={[.05, .024, .004]} m="green" />}
    {hover && <mesh position={[0, .039, .021]} material={greenLight}><torusGeometry args={[.071, .005, 6, 20]} /></mesh>}
    {(hover || props.selected && props.showLabels) && <TextureLabel p={[0, .12, .085]} text={terminal.label} color="#f1f5f2" background="#172a31" sprite width={Math.max(.18, terminal.label.length * .06)} height={.13} font="Consolas, monospace" />}
    </group>
  </group>;
}

export const Equipment = memo(function Equipment(props: EquipmentProps) {
  const group = useRef<THREE.Group>(null);
  const [far, setFar] = useState(false);
  const counter = useRef(0);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }, dt) => {
    counter.current += dt;
    if (counter.current > .7 && group.current) {
      counter.current = 0;
      group.current.getWorldPosition(world);
      const next = camera.position.distanceTo(world) > 13;
      if (next !== far) setFar(next);
    }
  });
  const def = props.definition;
  const terminals = getComponentTerminals(props.component, def);
  const context: ModelContext = {
    props, variant: equipmentVariant(props.component, def),
    detailed: !props.lowDetail && (!far || props.selected), active: !!props.state?.energized,
    closed: props.component.type === 'pushbutton' ? Boolean(props.component.params.on ?? props.component.params.pressed) : ['switch2','intermediate','selector','changeover'].includes(props.component.type) ? Number(props.component.params.position ?? 0) === 0 : props.component.type === 'dimmer' ? props.component.params.closed !== false : props.state?.closed ?? (props.component.params.closed !== false), internal: props.view !== 'normal',
  };
  // Terminal anchors stay outside the presentation scale, so cutaways never alter
  // connection coordinates. Model bodies are fitted to registry dimensions.
  const scale: Vec3 = [def.size[0] / 1.3, def.size[1] / 1.45, def.size[2] / .85];
  return <Context.Provider value={context}><group ref={group}>
    <group scale={scale}><Model /></group>
    <Part id="terminals"><RearTerminalCarriers terminals={terminals} />
      {terminals.map(t => <Terminal key={t.id} terminal={t} />)}
    </Part>
    {props.selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .009, 0]}><ringGeometry args={[Math.max(def.size[0], def.size[2]) * .52, Math.max(def.size[0], def.size[2]) * .52 + .025, 48]} /><meshBasicMaterial color="#5ce5bd" transparent opacity={.8} side={THREE.DoubleSide} /></mesh>}
    {props.showLabels && <TextureLabel p={[0, def.size[1] + .15, 0]} text={props.component.label} color={props.selected ? '#8af1c9' : '#dce7e7'} background="#12202a" sprite width={Math.min(3.6, Math.max(.6, props.component.label.length * .066))} height={.18} />}
  </group></Context.Provider>;
});

/** Rounded corners never leave this distance from the routed line segments. */
export const WIRE_CORNER_RADIUS = .012;
interface WireCurvePiece { curve: THREE.Curve<THREE.Vector3>; start: number; steps: number }

/** Each straight piece has one mesh interval and each rounded corner has eight.
 * Explicit piece sampling prevents long runs from skipping short corners and
 * cutting diagonally through their reserved clearance. No spline extrapolation. */
export class BoundedWireCurve extends THREE.Curve<THREE.Vector3> {
  readonly tubularSegments: number;
  private readonly pieces: WireCurvePiece[] = [];
  private readonly origin: THREE.Vector3;

  constructor(points: Vec3[], requestedRadius = WIRE_CORNER_RADIUS) {
    super();
    if (points.some(point => point.some(value => !Number.isFinite(value)))) throw new RangeError('Wire route contains a non-finite coordinate.');
    const clean = points.map(point => new THREE.Vector3(...point)).filter((point, index, all) => !index || !point.equals(all[index - 1]));
    this.origin = clean[0]?.clone() ?? new THREE.Vector3();
    const radius = Math.max(0, Math.min(WIRE_CORNER_RADIUS, Number.isFinite(requestedRadius) ? requestedRadius : WIRE_CORNER_RADIUS));
    let steps = 0, cursor = this.origin;
    const add = (curve: THREE.Curve<THREE.Vector3>, count: number) => { this.pieces.push({ curve, start: steps, steps: count }); steps += count; };
    const line = (end: THREE.Vector3) => { if (!cursor.equals(end)) add(new THREE.LineCurve3(cursor.clone(), end.clone()), 1); cursor = end; };
    for (let index = 1; index < clean.length - 1; index++) {
      const corner = clean[index], previous = clean[index - 1], next = clean[index + 1];
      const incoming = corner.clone().sub(previous), outgoing = next.clone().sub(corner);
      const trim = Math.min(radius, incoming.length() / 2, outgoing.length() / 2);
      incoming.normalize(); outgoing.normalize();
      if (trim < 1e-9 || Math.abs(incoming.dot(outgoing)) > .99999) { line(corner); continue; }
      const entry = corner.clone().addScaledVector(incoming, -trim), exit = corner.clone().addScaledVector(outgoing, trim);
      line(entry);
      // This quadratic is inside the convex hull of entry/corner/exit. All three
      // are inside the chosen radius of the original corner, which proves the bound.
      add(new THREE.QuadraticBezierCurve3(entry, corner.clone(), exit), 8);
      cursor = exit;
    }
    if (clean.length > 1) line(clean[clean.length - 1]);
    this.tubularSegments = Math.max(1, steps);
  }

  private locate(t: number): { piece: WireCurvePiece; t: number } | null {
    if (!this.pieces.length) return null;
    const position = THREE.MathUtils.clamp(t, 0, 1) * this.tubularSegments;
    let low = 0, high = this.pieces.length - 1;
    while (low < high) { const mid = (low + high) >> 1; const piece = this.pieces[mid]; if (position > piece.start + piece.steps) low = mid + 1; else high = mid; }
    const piece = this.pieces[low];
    return { piece, t: THREE.MathUtils.clamp((position - piece.start) / piece.steps, 0, 1) };
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const at = this.locate(t); return at ? at.piece.curve.getPoint(at.t, target) : target.copy(this.origin);
  }
  // TubeGeometry must sample the explicit piece intervals, rather than resampling
  // by global arc length and losing a small corner on a long straight run.
  override getPointAt(t: number, target = new THREE.Vector3()): THREE.Vector3 { return this.getPoint(t, target); }
  override getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const at = this.locate(t); return at ? at.piece.curve.getTangent(at.t, target) : target.set(0, 0, 1);
  }
  override getTangentAt(t: number, target = new THREE.Vector3()): THREE.Vector3 { return this.getTangent(t, target); }
}
export function createBoundedWireCurve(points: Vec3[], cornerRadius = WIRE_CORNER_RADIUS): BoundedWireCurve {
  return new BoundedWireCurve(points, cornerRadius);
}

/** Routed conductors follow bounded rounded polylines and do not participate in
 * solving. Endpoints and resistance come from CircuitDocument. */
export function Conductor({ points, color, selected = false, onClick }: { points: Vec3[]; color: string; selected?: boolean; onClick?: () => void }) {
  const curve = useMemo(() => createBoundedWireCurve(points), [points]);
  return <mesh onClick={e => { e.stopPropagation(); onClick?.(); }}><tubeGeometry args={[curve, curve.tubularSegments, WIRE_RADIUS, 8, false]} /><meshStandardMaterial color={selected ? '#ffe196' : color} roughness={.4} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? .35 : 0} /></mesh>;
}
