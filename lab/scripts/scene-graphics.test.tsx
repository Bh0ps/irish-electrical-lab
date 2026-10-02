import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoot, extend, flushSync } from '@react-three/fiber';
import { BenchStage } from '../components/lab/BenchStage';
import { configureSceneRenderer, createSceneEffectPipeline, withOcclusionSurfaces } from '../components/lab/GraphicEffects';
import { backdropVisible, benchFootprint, DEFAULT_SCENERY, lampIllumination, normaliseScenery, SCENERIES, sceneQualityBudget, selectLampIllumination } from '../lib/scene-settings';
import { createSceneryBatches, createSceneryParts } from '../lib/scenery-geometry';
import { createSurfaceTextures, type SurfacePattern } from '../lib/scene-materials';
import { LESSONS } from '../lib/lessons';
import { simulate } from '../lib/simulation';
import type { CircuitDocument, ComponentInstance, SimulationResult } from '../lib/types';

const bounds = new THREE.Box3(new THREE.Vector3(-3, 0, -2), new THREE.Vector3(3, 1.3, 2));
const lesson = (): CircuitDocument => structuredClone(LESSONS.find(value => value.id === 12)!.circuit);
const light = (id: string, watts = 60): ComponentInstance => ({ id, type: 'lamp', label: id, position: [0, 0, 0], rotation: 0, params: { watts } });
const output = (component: ComponentInstance, watts: number, revision = 1) => ({ revision, deviceStates: { [component.id]: { energized: false, lightOutputPower: watts } } }) as unknown as SimulationResult;

test('global rear access removes opaque room surrounds while near-equipment rear access retains scenery', () => {
  const bench = benchFootprint(bounds), translated = benchFootprint(bounds.clone().translate(new THREE.Vector3(12, 0, -30)));
  assert.equal(backdropVisible([0, 8, 16], bench), true); assert.equal(backdropVisible([0, .8, -1.5], bench), true); assert.equal(backdropVisible([0, 5, -18], bench), false);
  assert.equal(backdropVisible([12, 5, -48], translated), false); assert.equal(backdropVisible([12, .8, -31.5], translated), true);
});

test('four surroundings have distinct modelled equipment and preserve the original bench clearance', () => {
  assert.equal(DEFAULT_SCENERY, 'workshop'); assert.equal(normaliseScenery('__proto__'), 'workshop'); assert.equal(normaliseScenery('courtyard'), 'courtyard');
  const bench = benchFootprint(bounds), before = bounds.clone(), signatures = new Set<string>();
  assert.equal(bench.width, 12); assert.equal(bench.depth, 10); assert.deepEqual(bench.center, [0, 0, 0]);
  const working = new THREE.Box3(new THREE.Vector3(-bench.width / 2, 0, -bench.depth / 2), new THREE.Vector3(bench.width / 2, 10, bench.depth / 2));
  for (const scenery of SCENERIES) {
    const parts = createSceneryParts(scenery.id, bench); assert.ok(parts.length > 35); signatures.add([...new Set(parts.map(part => part.role))].sort().join('|'));
    for (const part of parts) {
      assert.ok([...part.position, ...part.scale, ...part.rotation].every(Number.isFinite)); assert.ok(part.scale.every(value => value > 0));
      const radial = part.shape === 'box' ? .5 : part.shape === 'torus' ? 1.19 : 1;
      const local = new THREE.Box3(new THREE.Vector3(-radial, part.shape === 'cylinder' || part.shape === 'box' ? -.5 : -radial, -radial), new THREE.Vector3(radial, part.shape === 'cylinder' || part.shape === 'box' ? .5 : radial, radial));
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...part.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation)), new THREE.Vector3(...part.scale));
      assert.equal(local.applyMatrix4(matrix).intersectsBox(working), false, scenery.id + ': ' + part.role + ' intrudes on equipment space');
    }
    const groups = createSceneryBatches(scenery.id, bench); assert.equal(groups.reduce((sum, [, values]) => sum + values.length, 0), parts.length); assert.ok(groups.length < 20, 'decorative repetition is batched');
  }
  assert.equal(signatures.size, 4); assert.ok(bounds.equals(before), 'scenery does not alter circuit bounds');
});

test('procedural PBR textures have deterministic nonuniform albedo, roughness and normalized tangent normals', () => {
  for (const pattern of ['rubber', 'timber', 'concrete', 'plaster', 'tiles', 'brick', 'paving', 'brushed'] as SurfacePattern[]) {
    const first = createSurfaceTextures(pattern, 64), second = createSurfaceTextures(pattern, 64);
    try {
      assert.deepEqual(first.color.image.data, second.color.image.data); assert.notEqual(first.color, second.color); assert.equal(first.color.colorSpace, THREE.SRGBColorSpace); assert.equal(first.normal.colorSpace, THREE.NoColorSpace); assert.equal(first.roughness.colorSpace, THREE.NoColorSpace);
      assert.ok(new Set(first.color.image.data.filter((_, i) => i % 4 === 0)).size > 2, pattern + ' has real albedo variation'); assert.ok(new Set(first.roughness.image.data).size > 8);
      const normals = first.normal.image.data;
      for (let i = 0; i < normals.length; i += 4 * 97) { const x = normals[i] / 255 * 2 - 1, y = normals[i + 1] / 255 * 2 - 1, z = normals[i + 2] / 255 * 2 - 1; assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < .015); assert.ok(z > 0); }
      let disposed = 0; for (const texture of [first.color, first.normal, first.roughness]) texture.addEventListener('dispose', () => disposed++); first.dispose(); assert.equal(disposed, 3);
    } finally { second.dispose(); }
  }
});

test('scene illumination follows actual dimmer power continuously through low, high, bypass and open paths', () => {
  const document = lesson(), dimmer = document.components.find(value => value.type === 'dimmer')!, lamp = document.components.find(value => value.type === 'lamp')!, original = JSON.stringify(document), values: number[] = [];
  for (const level of [.001, .25, .65, .9, 1]) { dimmer.params.level = level; const result = simulate(document, {}, 0), emitted = lampIllumination(lamp, result)!; assert.ok(emitted); assert.equal(emitted.power, result.deviceStates[lamp.id].lightOutputPower); assert.ok(emitted.intensity > 0); values.push(emitted.intensity); }
  assert.ok(values.every((value, index) => !index || value > values[index - 1]));
  dimmer.params.level = 0; assert.equal(lampIllumination(lamp, simulate(document, {}, 0)), undefined);
  document.wires.push({ id: 'scene-bypass', from: { component: dimmer.id, terminal: 'COM' }, to: { component: dimmer.id, terminal: 'OUT' }, role: 'L', resistance: .01, bends: [] });
  assert.ok(lampIllumination(lamp, simulate(document, {}, 0))!.power > 59.9);
  document.wires = document.wires.filter(wire => wire.from.component !== lamp.id && wire.to.component !== lamp.id); assert.equal(lampIllumination(lamp, simulate(document, {}, 0)), undefined);
  assert.equal(JSON.stringify(LESSONS.find(value => value.id === 12)!.circuit), original, 'actual example remains unchanged');
});

test('lights require resolved finite emitter power, not energized flags or nearby control settings', () => {
  const component = light('lamp');
  for (const value of [0, -1, NaN, Infinity]) assert.equal(lampIllumination(component, output(component, value)), undefined);
  assert.equal(lampIllumination(component), undefined); assert.equal(lampIllumination({ ...component, type: 'dimmer' }, output(component, 60)), undefined);
  const tiny = lampIllumination(component, output(component, .000001))!, full = lampIllumination(component, output(component, 60))!; assert.ok(tiny.intensity > 0); assert.ok(Math.abs(tiny.intensity / full.intensity - .000001 / 60) < 1e-15);
  const emergency = { ...component, id: 'emergency', type: 'emergency', params: { watts: 8 } }; assert.equal(lampIllumination(emergency, output(emergency, 3))!.power, 3, 'battery-supplied emergency power illuminates without energized AC');
});

test('lighting budgets adapt without changing topology and prioritize the inspected emitting fixture', () => {
  const document = lesson(), lamps = Array.from({ length: 14 }, (_, i) => ({ ...light('lamp-' + i), position: [i, 0, 0] as [number, number, number] })); document.components = lamps;
  const result = { revision: document.revision, deviceStates: Object.fromEntries(lamps.map((value, i) => [value.id, { lightOutputPower: i + 1 }])) } as unknown as SimulationResult, before = JSON.stringify(document);
  for (const quality of ['economy', 'auto', 'high'] as const) { const budget = sceneQualityBudget(quality), picked = selectLampIllumination(document, result, budget, 'lamp-0'); assert.equal(picked.length, budget.lampLights); assert.equal(picked[0].id, 'lamp-0'); assert.ok(picked.slice(1).every((value, index, rest) => !index || value.intensity <= rest[index - 1].intensity)); }
  assert.ok(sceneQualityBudget('auto', .9).lampLights < sceneQualityBudget('auto', 1.5).lampLights); assert.equal(sceneQualityBudget('economy').ambientOcclusion, false); assert.equal(sceneQualityBudget('economy').keyShadowSize, 0);
  assert.deepEqual(selectLampIllumination(document, { ...result, revision: document.revision - 1 }, sceneQualityBudget()), []); assert.equal(JSON.stringify(document), before);
});

test('emitter light anchors follow the real equipment translation and rotation', () => {
  const component = { ...light('rotated'), position: [4, 2, -3] as [number, number, number], rotation: Math.PI / 2 }, emitted = lampIllumination(component, output(component, 15))!;
  assert.ok(Math.abs(emitted.position[0] - 4.04) < 1e-9); assert.ok(Math.abs(emitted.position[2] + 3) < 1e-9); assert.ok(emitted.position[1] > 2);
  assert.ok(lampIllumination({ ...component, variant: 'batten' }, output(component, 15))!.position[1] < emitted.position[1]);
});

test('occlusion pass restores overlays and transparent inspection shells even after a renderer failure', () => {
  const scene = new THREE.Scene(), opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), cover = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: .3 })), label = new THREE.Sprite(), marker = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ depthTest: false })), alreadyHidden = new THREE.Mesh(); alreadyHidden.visible = false; scene.add(opaque, cover, label, marker, alreadyHidden);
  assert.throws(() => withOcclusionSurfaces(scene, () => { assert.equal(opaque.visible, true); assert.equal(cover.visible, false); assert.equal(label.visible, false); assert.equal(marker.visible, false); throw new Error('GPU fixture failure'); }), /GPU fixture failure/);
  assert.equal(cover.visible, true); assert.equal(label.visible, true); assert.equal(marker.visible, true); assert.equal(alreadyHidden.visible, false);
  for (const value of [opaque, cover, marker, alreadyHidden]) { value.geometry.dispose(); const material = value.material as THREE.Material; material.dispose(); } label.material.dispose();
});

test('local composer resizes its AO and AA budgets and disposes every owned target and noise map', () => {
  const renderer = { getPixelRatio: () => 1, getSize: (vector: THREE.Vector2) => vector.set(800, 600), capabilities: { maxSamples: 4 } } as unknown as THREE.WebGLRenderer, pipeline = createSceneEffectPipeline(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), sceneQualityBudget('high'));
  pipeline.resize(1000, 800, 1.5); assert.equal(pipeline.composer.renderTarget1.width, 1500); assert.equal(pipeline.composer.renderTarget1.samples, 4); assert.equal(pipeline.ao!.width, 1050); assert.ok(pipeline.ao!.ssaoMaterial.uniforms.benchStrength.value > 0 && pipeline.ao!.ssaoMaterial.uniforms.benchStrength.value < 1);
  const targets = [pipeline.composer.renderTarget1, pipeline.composer.renderTarget2, pipeline.ao!.normalRenderTarget, pipeline.ao!.ssaoRenderTarget, pipeline.ao!.blurRenderTarget, pipeline.ao!.noiseTexture]; let disposed = 0; for (const target of targets) target.addEventListener('dispose', () => disposed++); pipeline.dispose(); assert.equal(disposed, targets.length);
  const lean = createSceneEffectPipeline(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), sceneQualityBudget('auto', .9)); assert.equal(lean.ao, undefined); assert.ok(lean.passes.includes('restrained emitter bloom')); lean.dispose();
});

test('renderer tone mapping/exposure and aggregate pass metrics restore their original ownership', () => {
  const renderer = { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, info: { autoReset: true } } as unknown as THREE.WebGLRenderer, restore = configureSceneRenderer(renderer, 1.14);
  assert.equal(renderer.toneMapping, THREE.AgXToneMapping); assert.equal(renderer.toneMappingExposure, 1.14); assert.equal(renderer.info.autoReset, false); restore(); assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping); assert.equal(renderer.toneMappingExposure, 1.05); assert.equal(renderer.info.autoReset, true);
});

test('all mounted surroundings keep a single pickable work mat and actual instanced decorative geometry', async () => {
  extend(THREE as unknown as Parameters<typeof extend>[0]);
  const canvas = { width: 800, height: 600, style: {}, addEventListener() {}, removeEventListener() {} }, renderer = { render() {}, setSize() {}, setPixelRatio() {}, getPixelRatio() { return 1; }, domElement: canvas, capabilities: { getMaxAnisotropy() { return 8; } }, shadowMap: { enabled: false, type: 1 }, xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} }, dispose() {}, toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.SRGBColorSpace };
  const root = createRoot(canvas as unknown as HTMLCanvasElement); await root.configure({ gl: renderer as unknown as THREE.WebGLRenderer, frameloop: 'never', size: { width: 800, height: 600, top: 0, left: 0 } });
  try {
    for (const value of SCENERIES) {
      let store: ReturnType<typeof root.render>; flushSync(() => { store = root.render(<BenchStage bounds={bounds} scenery={value.id} quality="economy" grid={false} onClick={() => {}} onPointerMove={() => {}} onPointerOut={() => {}} />); });
      const scene = store!.getState().scene, interactive: THREE.Mesh[] = [], decorative: THREE.InstancedMesh[] = []; scene.updateMatrixWorld(true); scene.traverse(node => { if (node instanceof THREE.Mesh && node.raycast === THREE.Mesh.prototype.raycast) interactive.push(node); if (node instanceof THREE.InstancedMesh) decorative.push(node); });
      assert.equal(interactive.length, 1); assert.equal(interactive[0].userData.workbenchPlacementSurface, true); assert.ok(decorative.length >= 6, value.id + ' has several distinct material/shape batches'); assert.ok(decorative.reduce((sum, node) => sum + node.count, 0) > 35, value.id + ' contains substantial modelled scenery'); assert.ok(decorative.every(node => node.raycast !== THREE.Mesh.prototype.raycast && node.raycast !== THREE.InstancedMesh.prototype.raycast));
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, -1, 0)); assert.equal(ray.intersectObjects(scene.children, true).length, 1); assert.ok(scene.background instanceof THREE.Color); assert.ok(scene.fog instanceof THREE.Fog);
      const mat = interactive[0].material as THREE.MeshStandardMaterial; assert.ok(mat.normalMap instanceof THREE.DataTexture); assert.ok(mat.roughnessMap instanceof THREE.DataTexture);
      const surround = scene.getObjectByName('surround-with-rear-access')!, frame = scene.getObjectByName('bench-underframe')!; surround.visible = false; assert.equal(frame.visible, true); assert.equal(interactive[0].visible, true); assert.notEqual(frame.parent, surround); surround.visible = true;
    }
  } finally { root.unmount(); }
});
