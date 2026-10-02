import * as THREE from 'three';
import { COMPONENTS } from './components';
import type { RenderQuality } from './workbench-presentation';
import type { CircuitDocument, ComponentInstance, SimulationResult, Vec3 } from './types';

export type SceneryId = 'workshop' | 'utility' | 'industrial' | 'courtyard';
export const DEFAULT_SCENERY: SceneryId = 'workshop';
export interface SceneryPreset {
  id: SceneryId; name: string; description: string;
  sky: string; ground: string; keyColor: string; fillColor: string;
  keyIntensity: number; fillIntensity: number; ambientIntensity: number;
  environmentIntensity: number; exposure: number; matColor: string;
}
export const SCENERY_PRESETS: Readonly<Record<SceneryId, SceneryPreset>> = Object.freeze({
  workshop: { id: 'workshop', name: 'Workshop', description: 'Timber bench, tool board and soft daylight.', sky: '#bdcbd0', ground: '#77776e', keyColor: '#fff1d6', fillColor: '#c7e0f3', keyIntensity: 2.5, fillIntensity: .6, ambientIntensity: .5, environmentIntensity: .42, exposure: 1.06, matColor: '#455b5a' },
  utility: { id: 'utility', name: 'Domestic utility room', description: 'Tiled walls, cabinets and a daylight window.', sky: '#ced9d6', ground: '#888b80', keyColor: '#fff8e9', fillColor: '#d7edfa', keyIntensity: 2.2, fillIntensity: .65, ambientIntensity: .56, environmentIntensity: .48, exposure: 1.03, matColor: '#607075' },
  industrial: { id: 'industrial', name: 'Industrial training bay', description: 'Steelwork, ducting, cabinets and a concrete floor.', sky: '#adbcc6', ground: '#565f61', keyColor: '#e5f2ff', fillColor: '#ffedd3', keyIntensity: 2.6, fillIntensity: .65, ambientIntensity: .46, environmentIntensity: .48, exposure: 1.04, matColor: '#404d55' },
  courtyard: { id: 'courtyard', name: 'Evening courtyard', description: 'Stone paving, brick walls and warm outdoor lighting.', sky: '#25364f', ground: '#151f28', keyColor: '#ffdbab', fillColor: '#8eaee9', keyIntensity: 1.45, fillIntensity: .42, ambientIntensity: .25, environmentIntensity: .22, exposure: 1.14, matColor: '#465153' },
});
export const SCENERIES: readonly { id: SceneryId; label: string; description: string }[] = Object.freeze(Object.values(SCENERY_PRESETS).map(preset => ({ id: preset.id, label: preset.name, description: preset.description })));
export const normaliseScenery = (value: unknown): SceneryId => typeof value === 'string' && Object.hasOwn(SCENERY_PRESETS, value) ? value as SceneryId : DEFAULT_SCENERY;

export interface SceneQualityBudget {
  lampLights: number; lampShadows: number; keyShadowSize: number; lampShadowSize: number;
  ambientOcclusion: boolean; bloom: boolean; aoScale: number; aaSamples: number;
  environmentSize: number; textureSize: number;
}
/** Degrades expensive light/effect work with the same DPR used by the adaptive
 * renderer. It does not remove geometry, change electrical results or run a clock. */
export function sceneQualityBudget(quality: RenderQuality = 'auto', dpr = 1.5): SceneQualityBudget {
  if (quality === 'economy') return { lampLights: 2, lampShadows: 0, keyShadowSize: 0, lampShadowSize: 0, ambientOcclusion: false, bloom: false, aoScale: .5, aaSamples: 0, environmentSize: 64, textureSize: 128 };
  if (quality === 'high') return { lampLights: 8, lampShadows: 1, keyShadowSize: 2048, lampShadowSize: 512, ambientOcclusion: true, bloom: true, aoScale: .7, aaSamples: 4, environmentSize: 256, textureSize: 256 };
  const low = !Number.isFinite(dpr) || dpr < 1.15;
  return { lampLights: low ? 3 : 5, lampShadows: low ? 0 : 1, keyShadowSize: low ? 1024 : 2048, lampShadowSize: 256, ambientOcclusion: !low, bloom: true, aoScale: .5, aaSamples: 2, environmentSize: 128, textureSize: 128 };
}

export interface BenchFootprint { width: number; depth: number; center: Vec3; rear: number; floor: number }
/** These are the original horizontal workbench extents. Equipment, terminals,
 * drag plane, snap positions and routed wires retain their original coordinates. */
export function benchFootprint(bounds: THREE.Box3): BenchFootprint {
  const valid = !bounds.isEmpty(), size = valid ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3(6, 1, 4), center = valid ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const width = Math.max(10, Math.ceil((size.x + 5) / 2) * 2), depth = Math.max(8, Math.ceil((size.z + 5) / 2) * 2);
  return { width, depth, center: [center.x, 0, center.z], rear: -depth / 2 - 4.5, floor: -1.35 };
}
/** Looking back toward the circuit from outside the room removes only the
 * opaque surround. The bench, equipment, wires and floor stay visible. */
export function backdropVisible(cameraPosition: Vec3, bench: BenchFootprint): boolean {
  return cameraPosition[2] - bench.center[2] > bench.rear + 2.7;
}

export interface LampIllumination { id: string; position: Vec3; power: number; intensity: number; distance: number; color: string }
/** Continuous visual light proxy using only the solver's actual emitter power.
 * The lumen-per-watt values are declared scenery parameters, not optical-design
 * predictions. The emergency block supplies its emitter power even without AC. */
export function lampIllumination(component: ComponentInstance, result?: SimulationResult): LampIllumination | undefined {
  if (!['lamp', 'light', 'led', 'emergency'].includes(component.type)) return;
  const state = result?.deviceStates[component.id], power = state?.lightOutputPower;
  if (typeof power !== 'number' || !Number.isFinite(power) || power <= 0) return;
  const size = COMPONENTS[component.type]?.size ?? [1, 1.3, 1], variant = component.variant;
  // The authored bulb's filament is at .79, inside its glass envelope. Using
  // the generic housing height placed the point source above the bulb instead.
  const bulb = component.type === 'lamp' && (!variant || variant === 'bulb');
  const y = bulb ? .79 : component.type === 'emergency' ? size[1] * .7 : variant === 'downlight' ? .86 : variant === 'batten' ? .66 : size[1] * .85;
  const offset = new THREE.Vector3(0, y, .04).applyAxisAngle(new THREE.Vector3(0, 1, 0), component.rotation);
  const position: Vec3 = [component.position[0] + offset.x, component.position[1] + offset.y, component.position[2] + offset.z];
  const efficacy = bulb ? 13 : 70;
  return { id: component.id, position, power, intensity: Math.min(10000, power * (efficacy / (4 * Math.PI))), distance: 9, color: component.type === 'lamp' ? '#ffe4b5' : '#eef5ff' };
}
/** A bounded pool prioritises the inspected light, then the actual output. All
 * other lamps keep their own emissive materials; no pool setting alters wiring. */
export function selectLampIllumination(document: CircuitDocument, result: SimulationResult | undefined, budget: SceneQualityBudget, selected?: string): LampIllumination[] {
  if (!result || result.revision !== document.revision) return [];
  return document.components.map(component => lampIllumination(component, result)).filter((value): value is LampIllumination => !!value)
    .sort((a, b) => a.id === selected ? -1 : b.id === selected ? 1 : b.intensity - a.intensity || a.id.localeCompare(b.id)).slice(0, budget.lampLights);
}
