import { equipmentAssetKey } from './equipment-assets.ts';
import { COMPONENTS } from './components.ts';
import { mountVector } from './board-assembly.ts';
import type { ComponentInstance, Vec3 } from './types.ts';

export const CUPBOARD_HINGE: Vec3 = [-5.035, 1.92, -2.34];
export const CUPBOARD_SWING = -1.36;
export const TAPE_SECTION_LENGTH = .1;
export const TAPE_SECTIONS = 5;
export const BATTEN_FILAMENT: Vec3 = [0, .80971, .43571];

export interface FixturePose {
  scale: Vec3;
  tilt?: number;
  roll?: number;
  tape?: boolean;
  batten?: boolean;
  board?: boolean;
  bellPush?: boolean;
  flushPlate?: boolean;
}

export function isStrip(c: ComponentInstance) {
  return c.type === 'cctstrip' || (c.type === 'led' && c.variant === 'strip');
}

/** Full and economy GLBs share these authored component-space dimensions.
 * Actual mounting envelopes and published references are in authoring/site/README.md.
 * No dimensions or rotations here affect the bench's electrical endpoints. */
export function physicalFixture(c: ComponentInstance, backWall: boolean, cupboard: boolean): FixturePose | undefined {
  if (c.mount) return;
  if (backWall && c.variant === 'bell-push') {
    // D723W Pushlite envelope. The model's base is at z=-.220, button face at z=.308.
    return {scale:[.042/.880,.060/1.2825,.019/.528],bellPush:true};
  }
  if (c.type === 'gammaboard' || c.type === 'invictaboard') return { scale: [.05, .05, .05], board:true };
  if (cupboard && c.variant === 'door-contact') {
    // Catalog body height 1.188 and width .474. Roll places the wired half on the fixed right stile.
    return {scale: [.013 / .474, .065 / 1.188, .013 / .368], roll: Math.PI};
  }
  if (backWall && ['socket','fcu','shaveroutlet'].includes(c.type)) return { scale:[.1,.1,.1], flushPlate:true };
  if (backWall && c.type === 'lamp' && equipmentAssetKey(c,COMPONENTS[c.type]) === 'lamp:bulb') {
    // S. Lilley's earthed 45° batten holder has a 48 mm circular flange.
    const flangeScale = .048 / .510;
    return {scale: [flangeScale, flangeScale, flangeScale], batten:true};
  }
  if (isStrip(c)) {
    // A repeated section uses the actual catalog chip packages, copper, insulator and lands.
    const tw = c.type === 'cctstrip';
    return {scale: [TAPE_SECTION_LENGTH / (tw ? 2.058 : .98), (tw ? .010 : .008) / (tw ? .396 : .44), .0012 / (tw ? .125 : .392)], tape: true, tilt: cupboard ? Math.PI / 2 : 0};
  }
  if (backWall && !c.params.gangGroup && !c.variant && ['switch','switch2','intermediate'].includes(c.type)) {
    const one = c.type === 'switch';
    return {scale: [.086/(one ? .876 : .892), .086/(one ? .964 : .981), .052]};
  }
}

/** Translate the exact workbench pin, including the leftmost feed on a run of tape. */
export function fixturePoint(position: Vec3, uniform: number, pose: FixturePose | undefined, component: ComponentInstance, anchor: Vec3, yaw=0): Vec3 {
  const p = mountVector(component, anchor);
  const scale = pose?.scale ?? [uniform, uniform, uniform];
  const x = p[0]*scale[0] - (pose?.tape ? (TAPE_SECTIONS-1)*TAPE_SECTION_LENGTH/2 : 0);
  const y = p[1]*scale[1], z = p[2]*scale[2];
  const roll = pose?.roll ?? 0, tilt = pose?.tilt ?? 0;
  const along = x*Math.cos(roll) - y*Math.sin(roll);
  const up = x*Math.sin(roll) + y*Math.cos(roll);
  const forward=up*Math.sin(tilt)+z*Math.cos(tilt);
  return [position[0]+along*Math.cos(yaw)+forward*Math.sin(yaw), position[1]+up*Math.cos(tilt)-z*Math.sin(tilt),
    position[2]+forward*Math.cos(yaw)-along*Math.sin(yaw)];
}
