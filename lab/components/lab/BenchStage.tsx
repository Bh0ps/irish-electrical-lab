'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Grid } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { createSurfaceTextures, type SurfacePattern } from '../../lib/scene-materials';
import { createSceneryBatches, type SceneryPart, type SceneryShape, type ScenerySurface } from '../../lib/scenery-geometry';
import { backdropVisible, benchFootprint, DEFAULT_SCENERY, SCENERY_PRESETS, sceneQualityBudget, type SceneryId } from '../../lib/scene-settings';
import type { RenderQuality } from '../../lib/workbench-presentation';

const noRaycast: THREE.Mesh['raycast'] = () => {};
function SceneryBatch({ parts, geometry, material }: { parts: SceneryPart[]; geometry: THREE.BufferGeometry; material: THREE.Material }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => { if (!mesh.current) return; const matrix = new THREE.Object3D(); for (let i = 0; i < parts.length; i++) { const part = parts[i]; matrix.position.set(...part.position); matrix.rotation.set(...part.rotation); matrix.scale.set(...part.scale); matrix.updateMatrix(); mesh.current.setMatrixAt(i, matrix.matrix); } mesh.current.instanceMatrix.needsUpdate = true; mesh.current.computeBoundingSphere(); }, [parts]);
  return <instancedMesh ref={mesh} args={[geometry, material, parts.length]} raycast={noRaycast} receiveShadow dispose={null} userData={{ scenery: true, decorative: true, roles: [...new Set(parts.map(part => part.role))] }} />;
}
export interface BenchStageProps {
  bounds: THREE.Box3; onPointerMove: React.ComponentProps<'mesh'>['onPointerMove']; onPointerOut: React.ComponentProps<'mesh'>['onPointerOut']; onClick: React.ComponentProps<'mesh'>['onClick']; grid: boolean;
  scenery?: SceneryId; quality?: RenderQuality;
}

/** Four original modelled surrounds. Only the original work-mat is interactive;
 * scenery is batched, single-sided where appropriate, and below/outside it. */
export function BenchStage({ bounds, onPointerMove, onPointerOut, onClick, grid, scenery = DEFAULT_SCENERY, quality = 'auto' }: BenchStageProps) {
  const { viewport, invalidate, gl } = useThree(), bench = useMemo(() => benchFootprint(bounds), [bounds]), preset = SCENERY_PRESETS[scenery], budget = sceneQualityBudget(quality, viewport.dpr);
  const backdrop = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { if (backdrop.current) backdrop.current.visible = backdropVisible(camera.position.toArray(), bench); });
  const width = bench.width, depth = bench.depth, center = bench.center;
  const surfaces = useMemo(() => {
    const values = Object.fromEntries((['rubber', 'timber', 'concrete', 'plaster', 'tiles', 'brick', 'paving', 'brushed'] as SurfacePattern[]).map(pattern => [pattern, createSurfaceTextures(pattern, budget.textureSize)])) as Record<SurfacePattern, ReturnType<typeof createSurfaceTextures>>;
    for (const surface of Object.values(values)) for (const texture of [surface.color, surface.normal, surface.roughness]) texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    for (const texture of Object.values(values.rubber)) if (texture instanceof THREE.Texture) texture.repeat.set(width * 3, depth * 3);
    for (const texture of Object.values(values.timber)) if (texture instanceof THREE.Texture) texture.repeat.set(width / 3, depth / 3);
    return values;
  }, [budget.textureSize, width, depth, gl]);
  useEffect(() => () => Object.values(surfaces).forEach(surface => surface.dispose()), [surfaces]);
  const resources = useMemo(() => {
    const geometry: Record<SceneryShape, THREE.BufferGeometry> = { box: new RoundedBoxGeometry(1, 1, 1, 2, .025), cylinder: new THREE.CylinderGeometry(1, 1, 1, 18), sphere: new THREE.SphereGeometry(1, 18, 12), torus: new THREE.TorusGeometry(1, .19, 8, 24) };
    const material: Record<ScenerySurface, THREE.Material> = {
      timber: new THREE.MeshStandardMaterial({ color: '#c7b59a', map: surfaces.timber.color, normalMap: surfaces.timber.normal, normalScale: new THREE.Vector2(.16, .16), roughness: .72, roughnessMap: surfaces.timber.roughness }),
      metal: new THREE.MeshStandardMaterial({ color: '#919a9c', metalness: .8, roughness: .38, normalMap: surfaces.brushed.normal, normalScale: new THREE.Vector2(.1, .1), envMapIntensity: .9 }),
      copper: new THREE.MeshStandardMaterial({ color: '#ad734a', metalness: .85, roughness: .32 }),
      paint: new THREE.MeshStandardMaterial({ color: '#65777a', roughness: .53, metalness: .18 }),
      white: new THREE.MeshPhysicalMaterial({ color: '#e5e8dd', roughness: .4, metalness: .04, clearcoat: .15, clearcoatRoughness: .38 }),
      dark: new THREE.MeshStandardMaterial({ color: '#263237', roughness: .7 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#9db9bf', roughness: .12, metalness: .12, clearcoat: 1, clearcoatRoughness: .1 }),
      brick: new THREE.MeshStandardMaterial({ map: surfaces.brick.color, normalMap: surfaces.brick.normal, normalScale: new THREE.Vector2(.65, .65), roughness: .95 }),
      stone: new THREE.MeshStandardMaterial({ color: '#a6aeac', normalMap: surfaces.concrete.normal, normalScale: new THREE.Vector2(.35, .35), roughness: .94 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#546748', roughness: .75 }),
      clay: new THREE.MeshStandardMaterial({ color: '#ad8862', roughness: .8 }),
      yellow: new THREE.MeshStandardMaterial({ color: '#cbaa43', roughness: .72 }),
      red: new THREE.MeshStandardMaterial({ color: '#994940', roughness: .48, metalness: .15 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff4df', emissive: '#ffe8c0', emissiveIntensity: 1.25, roughness: .33 }),
    };
    const edge = new RoundedBoxGeometry(width + .36, .22, depth + .36, 3, .065);
    return { geometry, material, edge };
  }, [surfaces, width, depth]);
  useEffect(() => () => { Object.values(resources.geometry).forEach(value => value.dispose()); Object.values(resources.material).forEach(value => value.dispose()); resources.edge.dispose(); }, [resources]);
  const batches = useMemo(() => createSceneryBatches(scenery, bench, 'surround'), [scenery, bench]);
  const frameBatches = useMemo(() => createSceneryBatches(scenery, bench, 'bench'), [scenery, bench]);
  const floorPattern: SurfacePattern = scenery === 'utility' ? 'tiles' : scenery === 'courtyard' ? 'paving' : 'concrete', wallPattern: SurfacePattern = scenery === 'utility' ? 'tiles' : scenery === 'courtyard' ? 'brick' : scenery === 'industrial' ? 'concrete' : 'plaster';
  const floorMaps = useMemo(() => createSurfaceTextures(floorPattern, budget.textureSize), [floorPattern, budget.textureSize]);
  const wallMaps = useMemo(() => createSurfaceTextures(wallPattern, budget.textureSize), [wallPattern, budget.textureSize]);
  useEffect(() => () => { floorMaps.dispose(); wallMaps.dispose(); }, [floorMaps, wallMaps]);
  useEffect(() => { for (const map of [floorMaps.color, floorMaps.normal, floorMaps.roughness]) map.repeat.set(25, 25); for (const map of [wallMaps.color, wallMaps.normal, wallMaps.roughness]) map.repeat.set((width + 14) / 4, scenery === 'courtyard' ? 1.1 : 2); invalidate(); }, [floorMaps, wallMaps, width, scenery, invalidate]);
  return <>
    <color attach="background" args={[preset.sky]} /><fog attach="fog" args={[preset.sky, 35, 110]} />
    <group name={'scenery:' + scenery} userData={{ scenery, localTextures: true, decorative: true }}>
    <mesh geometry={resources.edge} material={resources.material.timber} position={[center[0], -.132, center[2]]} receiveShadow castShadow raycast={noRaycast} dispose={null} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -.012, center[2]]} receiveShadow onPointerMove={onPointerMove} onPointerOut={onPointerOut} onClick={onClick} userData={{ workbenchPlacementSurface: true }}>
      <planeGeometry args={[width, depth]} /><meshStandardMaterial color={preset.matColor} map={surfaces.rubber.color} normalMap={surfaces.rubber.normal} normalScale={[.22, .22]} roughness={.96} roughnessMap={surfaces.rubber.roughness} />
    </mesh>
    {grid && <Grid position={[center[0], -.0105, center[2]]} args={[width - .15, depth - .15]} cellSize={.25} cellThickness={.3} cellColor="#8b9a96" sectionSize={1} sectionThickness={.5} sectionColor="#a5b9b0" fadeDistance={35} fadeStrength={1.8} infiniteGrid={false} raycast={noRaycast} />}
    <group position={[center[0], 0, center[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bench.floor, 0]} receiveShadow raycast={noRaycast}><planeGeometry args={[120, 120]} /><meshStandardMaterial map={floorMaps.color} normalMap={floorMaps.normal} normalScale={[.5, .5]} roughness={.9} roughnessMap={floorMaps.roughness} /></mesh>
      <group name="bench-underframe">{frameBatches.map(([key, values]) => <SceneryBatch key={key} parts={values} geometry={resources.geometry[values[0].shape]} material={resources.material[values[0].surface]} />)}</group>
      <group ref={backdrop} name="surround-with-rear-access" userData={{ cameraClearance: true }}>
      <mesh position={[0, scenery === 'courtyard' ? .11 : 2.65, bench.rear]} receiveShadow raycast={noRaycast}><planeGeometry args={[width + 14, scenery === 'courtyard' ? 2.92 : 8]} /><meshStandardMaterial color={scenery === 'industrial' ? '#adbbb9' : '#ffffff'} map={wallMaps.color} normalMap={wallMaps.normal} normalScale={[.45, .45]} roughness={.88} roughnessMap={wallMaps.roughness} side={THREE.FrontSide} /></mesh>
      {batches.map(([key, values]) => <SceneryBatch key={key} parts={values} geometry={resources.geometry[values[0].shape]} material={resources.material[values[0].surface]} />)}
      </group>
    </group>
  </group></>;
}
