'use client';
import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { DEFAULT_SCENERY, SCENERY_PRESETS, sceneQualityBudget, type SceneryId, type SceneQualityBudget } from '../../lib/scene-settings';
import type { RenderQuality } from '../../lib/workbench-presentation';

/** AO considers opaque physical surfaces, never probe rings, floating labels,
 * selection outlines or translucent inspection shells. Visibility is restored
 * even on a render failure; electrical state and picking are untouched. */
export function withOcclusionSurfaces(scene: THREE.Scene, render: () => void): void {
  const hidden: THREE.Object3D[] = [];
  scene.traverse(node => {
    const material = (node as THREE.Mesh).material, materials = Array.isArray(material) ? material : material ? [material] : [];
    if (node.visible && (node instanceof THREE.Sprite || materials.some(value => !value.depthTest || value.transparent && value.opacity < .65))) { hidden.push(node); node.visible = false; }
  });
  try { render(); } finally { for (const node of hidden) node.visible = true; }
}
class BenchSSAOPass extends SSAOPass {
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget, dt: number, mask: boolean): void {
    withOcclusionSurfaces(this.scene, () => super.render(renderer, write, read, dt, mask));
  }
}
export interface SceneEffectPipeline { composer: EffectComposer; ao?: BenchSSAOPass; resize: (width: number, height: number, dpr: number) => void; dispose: () => void; passes: string[] }
export function configureSceneRenderer(renderer: THREE.WebGLRenderer, exposure: number): () => void {
  const previousMapping = renderer.toneMapping, previousExposure = renderer.toneMappingExposure, previousAutoReset = renderer.info.autoReset;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = exposure; renderer.info.autoReset = false;
  return () => { renderer.toneMapping = previousMapping; renderer.toneMappingExposure = previousExposure; renderer.info.autoReset = previousAutoReset; };
}
/** Uses only bundled Three addons. Explicit ownership covers the composer's
 * targets AND each pass's targets, noise texture and quad materials. */
export function createSceneEffectPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, budget: SceneQualityBudget): SceneEffectPipeline {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
  target.samples = Math.min(budget.aaSamples, renderer.capabilities.maxSamples);
  const composer = new EffectComposer(renderer, target), render = new RenderPass(scene, camera), names = ['PBR scene']; composer.addPass(render);
  let ao: BenchSSAOPass | undefined;
  if (budget.ambientOcclusion) {
    ao = new BenchSSAOPass(scene, camera, 1, 1, 12); ao.kernelRadius = 5; ao.minDistance = .0005; ao.maxDistance = .008;
    // Keep fine contact shading subtle rather than darkening the whole lesson.
    ao.ssaoMaterial.uniforms.benchStrength = { value: .42 };
    ao.ssaoMaterial.fragmentShader = 'uniform float benchStrength;\n' + ao.ssaoMaterial.fragmentShader.replace('vec3( 1.0 - occlusion )', 'vec3( 1.0 - occlusion * benchStrength )');
    composer.addPass(ao); names.push('contact ambient occlusion');
  }
  const bloom = budget.bloom ? new UnrealBloomPass(new THREE.Vector2(1, 1), .16, .28, 1.08) : undefined;
  if (bloom) { composer.addPass(bloom); names.push('restrained emitter bloom'); }
  const output = new OutputPass(), fxaa = new FXAAPass(); composer.addPass(output); composer.addPass(fxaa); names.push('AgX tone mapping', 'FXAA');
  const resize = (width: number, height: number, dpr: number) => { composer.setPixelRatio(dpr); composer.setSize(Math.max(1, width), Math.max(1, height)); ao?.setSize(Math.max(1, Math.round(width * dpr * budget.aoScale)), Math.max(1, Math.round(height * dpr * budget.aoScale))); };
  return { composer, ao, resize, passes: names, dispose: () => { for (const pass of composer.passes) pass.dispose(); ao?.noiseTexture.dispose(); composer.dispose(); } };
}

/** Priority 1 runs AFTER camera/model updates and replaces R3F's default render
 * exactly once. It never asks for another frame, so demand-idle stays stopped. */
export function GraphicEffects({ scenery = DEFAULT_SCENERY, quality = 'auto' }: { scenery?: SceneryId; quality?: RenderQuality }) {
  const { gl, scene, camera, size, viewport, invalidate } = useThree(), budget = sceneQualityBudget(quality, viewport.dpr), pipeline = useRef<SceneEffectPipeline | null>(null), failed = useRef(false);
  const preset = SCENERY_PRESETS[scenery], key = [quality, budget.ambientOcclusion, budget.bloom, budget.aaSamples, budget.aoScale].join(':');
  useLayoutEffect(() => {
    const restore = configureSceneRenderer(gl, preset.exposure); invalidate(); return restore;
  }, [gl, preset.exposure, invalidate]);
  useLayoutEffect(() => {
    failed.current = false;
    if (quality !== 'economy') {
      try { pipeline.current = createSceneEffectPipeline(gl, scene, camera, budget); }
      catch (error) { failed.current = true; window.dispatchEvent(new CustomEvent('electrical-lab-graphics-fallback', { detail: { stage: 'post processing', message: String(error) } })); }
    }
    invalidate(); return () => { pipeline.current?.dispose(); pipeline.current = null; };
    // key contains the complete effect budget; resize/exposure update separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, key, invalidate]);
  useLayoutEffect(() => { pipeline.current?.resize(size.width, size.height, gl.getPixelRatio()); invalidate(); }, [size.width, size.height, viewport.dpr, gl, key, invalidate]);
  useLayoutEffect(() => { const report = () => window.dispatchEvent(new CustomEvent('electrical-lab-effects', { detail: { scenery, quality, passes: pipeline.current?.passes ?? ['direct PBR render'], fallback: failed.current, toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure, pixelRatio: gl.getPixelRatio(), demandFrames: true } })); window.addEventListener('electrical-lab-graphics-request', report); return () => window.removeEventListener('electrical-lab-graphics-request', report); }, [gl, scenery, quality]);
  useFrame((_, dt) => {
    gl.info.reset();
    if (pipeline.current && !failed.current) {
      try { pipeline.current.composer.render(dt); return; }
      catch (error) { failed.current = true; pipeline.current.dispose(); pipeline.current = null; gl.setRenderTarget(null); window.dispatchEvent(new CustomEvent('electrical-lab-graphics-fallback', { detail: { stage: 'frame effects', message: String(error) } })); }
    }
    gl.render(scene, camera);
  }, 1);
  return null;
}
