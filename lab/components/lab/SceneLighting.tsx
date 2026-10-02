'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { benchFootprint, DEFAULT_SCENERY, SCENERY_PRESETS, sceneQualityBudget, selectLampIllumination, type SceneryId } from '../../lib/scene-settings';
import type { RenderQuality } from '../../lib/workbench-presentation';
import type { CircuitDocument, SimulationResult } from '../../lib/types';

export interface SceneLightingProps { bounds: THREE.Box3; document: CircuitDocument; result?: SimulationResult; selected?: string; scenery?: SceneryId; quality?: RenderQuality }
function bindLocalReflections(gl: THREE.WebGLRenderer, scene: THREE.Scene, scenery: SceneryId, resolution: number): { ready: boolean; dispose: () => void } {
  const previous = scene.environment, previousIntensity = scene.environmentIntensity, generator = new THREE.PMREMGenerator(gl), room = new RoomEnvironment(), preset = SCENERY_PRESETS[scenery];
  let owned: THREE.WebGLRenderTarget | undefined;
  try {
    room.traverse(node => { if (node instanceof THREE.PointLight) node.color.set(preset.keyColor); });
    owned = generator.fromScene(room, .025, .1, 100, { size: resolution });
    owned.texture.name = 'local-procedural-reflections:' + scenery; scene.environment = owned.texture; scene.environmentIntensity = preset.environmentIntensity;
  } finally { generator.dispose(); room.dispose(); }
  return { ready: true, dispose: () => { if (owned && scene.environment === owned.texture) { scene.environment = previous; scene.environmentIntensity = previousIntensity; } owned?.dispose(); } };
}
/** Local neutral-room reflections give PBR plastic/metal surfaces real angular
 * response. PMREM resources are owned here, never by imported model materials. */
export function SceneLighting({ bounds, document, result, selected, scenery = DEFAULT_SCENERY, quality = 'auto' }: SceneLightingProps) {
  const { gl, scene, viewport, invalidate } = useThree(), preset = SCENERY_PRESETS[scenery], budget = sceneQualityBudget(quality, viewport.dpr), bench = useMemo(() => benchFootprint(bounds), [bounds]);
  const centerX = bench.center[0], centerZ = bench.center[2];
  const target = useMemo(() => { const value = new THREE.Object3D(); value.position.set(centerX, .4, centerZ); return value; }, [centerX, centerZ]);
  const lampBudget = budget.lampLights;
  const lamps = useMemo(() => selectLampIllumination(document, result, { ...sceneQualityBudget(quality), lampLights: lampBudget }, selected), [document, result, quality, lampBudget, selected]);
  const reflectionBinding = useRef<ReturnType<typeof bindLocalReflections> | null>(null);
  useEffect(() => {
    let owned: ReturnType<typeof bindLocalReflections> | undefined;
    try {
      owned = bindLocalReflections(gl, scene, scenery, budget.environmentSize); reflectionBinding.current = owned; invalidate();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('electrical-lab-graphics-fallback', { detail: { stage: 'local reflections', message: String(error) } }));
    }
    return () => { owned?.dispose(); reflectionBinding.current = null; };
  }, [gl, scene, scenery, budget.environmentSize, invalidate]);
  useEffect(() => {
    const report = () => window.dispatchEvent(new CustomEvent('electrical-lab-lighting', { detail: { scenery, quality, environmentReady: reflectionBinding.current?.ready ?? false, localEnvironment: scene.environment?.name, budget, lamps, photometricAccuracy: false } }));
    window.addEventListener('electrical-lab-graphics-request', report); return () => window.removeEventListener('electrical-lab-graphics-request', report);
  }, [scenery, quality, budget, lamps, scene]);
  useEffect(() => { invalidate(); }, [lamps, scenery, quality, invalidate]);
  const shadowWidth = bench.width / 2 + 3, shadowDepth = bench.depth / 2 + 3;
  return <group name="scene-lighting" userData={{ scenery, lampLightBudget: budget.lampLights, realEmitterPower: true }}>
    <primitive object={target} />
    <hemisphereLight args={[preset.sky, preset.ground, preset.ambientIntensity]} />
    <directionalLight position={[bench.center[0] - 5, 11, bench.center[2] + 4]} target={target} color={preset.keyColor} intensity={preset.keyIntensity} castShadow={budget.keyShadowSize > 0} shadow-mapSize={[Math.max(256, budget.keyShadowSize), Math.max(256, budget.keyShadowSize)]} shadow-camera-left={-shadowWidth} shadow-camera-right={shadowWidth} shadow-camera-top={shadowDepth} shadow-camera-bottom={-shadowDepth} shadow-camera-near={.1} shadow-camera-far={80} shadow-normalBias={.025} shadow-bias={-.00012} shadow-radius={3} />
    <directionalLight position={[bench.center[0] + 7, 6, bench.center[2] - 8]} target={target} color={preset.fillColor} intensity={preset.fillIntensity} />
    {Array.from({ length: budget.lampLights }, (_, index) => { const lamp = lamps[index], shadows = !!lamp && index < budget.lampShadows && (quality === 'high' || selected === lamp.id); return <pointLight key={index} name={'lamp-light:' + (lamp?.id ?? 'idle-' + index)} position={lamp?.position ?? [bench.center[0], -5, bench.center[2]]} color={lamp?.color ?? '#ffffff'} intensity={lamp?.intensity ?? 0} distance={lamp?.distance ?? 9} decay={2} castShadow={shadows} shadow-mapSize={[Math.max(256, budget.lampShadowSize), Math.max(256, budget.lampShadowSize)]} shadow-camera-near={.03} shadow-camera-far={10} shadow-normalBias={.035} shadow-bias={-.0002} shadow-radius={2} userData={{ componentId: lamp?.id, actualEmitterPower: lamp?.power ?? 0, educationalOpticalProxy: true }} />; })}
  </group>;
}
