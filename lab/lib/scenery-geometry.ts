import type { BenchFootprint, SceneryId } from './scene-settings';
import type { Vec3 } from './types';
export type SceneryShape = 'box' | 'cylinder' | 'sphere' | 'torus';
export type ScenerySurface = 'timber' | 'metal' | 'paint' | 'white' | 'dark' | 'glass' | 'brick' | 'stone' | 'leaf' | 'clay' | 'yellow' | 'red' | 'lamp' | 'copper';
export interface SceneryPart { shape: SceneryShape; surface: ScenerySurface; position: Vec3; scale: Vec3; rotation: Vec3; role: string }
export function createSceneryBatches(scenery: SceneryId, bench: BenchFootprint, section: 'all' | 'bench' | 'surround' = 'all'): [string, SceneryPart[]][] {
  const groups = new Map<string, SceneryPart[]>();
  for (const part of createSceneryParts(scenery, bench)) { const frame = part.role.startsWith('bench '); if (section === 'bench' && !frame || section === 'surround' && frame) continue; const key = part.surface + ':' + part.shape; const group = groups.get(key) ?? []; group.push(part); groups.set(key, group); }
  return [...groups.entries()];
}
/** Static surrounding geometry stays below or outside the original bench.
 * Nothing is electrical equipment, an interaction target or a placement plane. */
export function createSceneryParts(scenery: SceneryId, bench: BenchFootprint): SceneryPart[] {
  const parts: SceneryPart[] = [], rear = bench.rear, floor = bench.floor, side = bench.width / 2 + 2.4;
  const add = (surface: ScenerySurface, position: Vec3, scale: Vec3, role: string, shape: SceneryShape = 'box', rotation: Vec3 = [0, 0, 0]) => parts.push({ shape, surface, position, scale, rotation, role });
  const cabinet = (x: number, z: number, width: number, height: number, surface: ScenerySurface = 'paint') => {
    add(surface, [x, floor + height / 2, z], [width, height, 1.12], 'storage cabinet');
    for (const offset of [-.25, .25]) { add('white', [x + width * offset, floor + height / 2, z + .59], [width * .47, height * .94, .05], 'cabinet door'); add('metal', [x + width * offset + width * .16, floor + height * .53, z + .64], [.035, .25, .03], 'cabinet handle'); }
    for (const offset of [-.4, .4]) add('dark', [x + width * offset, floor + .045, z], [.18, .09, .7], 'cabinet foot');
  };
  const window = (x: number, y: number, width: number, height: number) => {
    add('dark', [x, y, rear + .015], [width + .2, height + .2, .1], 'window reveal'); add('glass', [x, y, rear + .09], [width, height, .035], 'daylight window');
    for (const sign of [-1, 1]) { add('white', [x + sign * width / 2, y, rear + .14], [.065, height + .1, .095], 'window frame'); add('white', [x, y + sign * height / 2, rear + .14], [width + .1, .065, .095], 'window frame'); }
    add('white', [x, y, rear + .15], [.04, height, .06], 'window mullion'); add('white', [x, y - height / 2 - .1, rear + .3], [width + .3, .09, .5], 'window sill');
  };
  for (const x of [-bench.width / 2 + .45, bench.width / 2 - .45]) for (const z of [-bench.depth / 2 + .45, bench.depth / 2 - .45]) { add('metal', [x, -.66, z], [.075, 1.02, .075], 'bench leg', 'cylinder'); add('dark', [x, -1.23, z], [.24, .08, .24], 'bench levelling foot'); }
  for (const z of [-bench.depth / 2 + .5, bench.depth / 2 - .5]) add('metal', [0, -.32, z], [bench.width - .7, .15, .09], 'bench frame');
  for (const x of [-bench.width / 2 + .5, bench.width / 2 - .5]) add('metal', [x, -.32, 0], [.09, .15, bench.depth - .7], 'bench frame');
  if (scenery === 'workshop') {
    add('timber', [0, 1.75, rear + .09], [6.8, 2.9, .16], 'oak tool board');
    for (let row = 0; row < 6; row++) for (let col = 0; col < 19; col++) add('dark', [-3.05 + col * .34, .55 + row * .43, rear + .185], [.022, .007, .022], 'peg hole', 'cylinder', [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 7; i++) { const x = -2.65 + i * .62; add(i % 2 ? 'red' : 'dark', [x, 1.14, rear + .27], [.095, .4, .085], 'insulated tool handle', 'cylinder'); add('metal', [x, 1.67, rear + .27], [.018, .68, .018], 'screwdriver shaft', 'cylinder'); }
    for (const x of [-1.4, .6, 2.15]) { add('metal', [x, 2.5, rear + .27], [.16, .6, .03], 'spanner'); add('metal', [x, 2.86, rear + .27], [.18, .11, .14], 'spanner ring', 'torus', [Math.PI / 2, 0, 0]); }
    cabinet(side, rear + 1.2, 2.5, 2.25); window(-side + 1, 2.5, 2.8, 2.35);
    add('metal', [0, 4.55, rear + .65], [5.7, .1, .35], 'suspended task-light housing'); add('lamp', [0, 4.48, rear + .67], [5.45, .025, .28], 'task-light diffuser');
    for (const x of [-2.5, 2.5]) add('metal', [x, 5.15, rear + .65], [.014, 1.15, .014], 'task-light suspension', 'cylinder');
    add('dark', [-side, floor + .65, rear + 1.45], [1.1, 1.3, 1.05], 'tool chest');
    for (let row = 0; row < 4; row++) { add('paint', [-side, floor + .25 + row * .29, rear + 2], [1.02, .23, .06], 'tool drawer'); add('metal', [-side, floor + .25 + row * .29, rear + 2.05], [.65, .025, .035], 'drawer pull'); }
  } else if (scenery === 'utility') {
    cabinet(side, rear + 1, 2.9, 1.7, 'white'); add('timber', [side, floor + 1.77, rear + 1], [3.1, .14, 1.4], 'utility countertop');
    add('white', [-side, floor + .92, rear + 1], [1.6, 1.84, 1.2], 'washing machine');
    add('paint', [-side, floor + 1.6, rear + 1.63], [1.48, .2, .03], 'washing-machine fascia'); add('dark', [-side + .5, floor + 1.6, rear + 1.66], [.08, .045, .08], 'washing-machine dial', 'cylinder', [Math.PI / 2, 0, 0]);
    add('metal', [-side, floor + .86, rear + 1.66], [.58, .1, .58], 'washing-machine door', 'cylinder', [Math.PI / 2, 0, 0]); add('dark', [-side, floor + .86, rear + 1.72], [.47, .07, .47], 'washing-machine drum window', 'cylinder', [Math.PI / 2, 0, 0]);
    window(0, 2.25, 4.4, 2.5); add('white', [side, 2.6, rear + .4], [1.45, 1.85, .7], 'wall boiler'); add('paint', [side, 1.94, rear + .8], [.8, .18, .035], 'boiler fascia');
    for (const x of [side - .32, side + .32]) { add('copper', [x, .64, rear + .48], [.025, 2.05, .025], 'boiler pipe', 'cylinder'); add('metal', [x, .24, rear + .49], [.055, .1, .055], 'pipe fitting', 'cylinder'); }
    add('white', [0, -.37, rear + 1], [3, 1.7, 1.2], 'low utility cabinet'); add('timber', [0, .53, rear + 1], [3.25, .13, 1.4], 'worktop');
    add('clay', [1.02, .8, rear + 1.2], [.22, .48, .22], 'plant pot', 'cylinder'); for (let i = 0; i < 8; i++) add('leaf', [.9 + Math.cos(i * 2.3) * .17, 1.17 + i * .025, rear + 1.2 + Math.sin(i * 2.3) * .17], [.14, .3, .08], 'plant foliage', 'sphere', [0, i, .4]);
  } else if (scenery === 'industrial') {
    for (const x of [-side, side]) { add('metal', [x, 2.65, rear + .5], [.25, 8, .38], 'structural column'); for (const z of [rear + .29, rear + .71]) add('paint', [x, 2.65, z], [.52, 8, .055], 'column flange'); add('yellow', [x, -.48, rear + .84], [.64, 1.7, .22], 'column guard'); }
    add('metal', [0, 5.8, rear + .5], [side * 2 + .3, .3, .42], 'overhead steel beam');
    add('metal', [0, 4.8, rear + 1.05], [.42, side * 2, .42], 'ventilation duct', 'cylinder', [0, 0, Math.PI / 2]);
    for (let x = -side + 1; x < side; x += 1.8) add('dark', [x, 4.8, rear + 1.05], [.44, .045, .44], 'duct band', 'cylinder', [0, 0, Math.PI / 2]);
    for (const x of [-2.7, 0, 2.7]) { cabinet(x, rear + .85, 2.2, 3.15); for (let row = 0; row < 8; row++) add('dark', [x, floor + .6 + row * .1, rear + 1.49], [.72, .025, .018], 'cabinet ventilation'); }
    for (let i = 0; i < 22; i++) add(i % 2 ? 'yellow' : 'dark', [-side + i * side / 11, floor + .016, rear + 2.4], [side / 11 + .01, .02, .58], 'floor hazard boundary');
    for (const x of [-side + 1, side - 1]) { add('metal', [x, 4.1, rear + 1.2], [2.2, .12, .6], 'industrial light fitting'); add('lamp', [x, 4.02, rear + 1.2], [2, .025, .45], 'industrial diffuser'); }
    add('red', [side + 1.1, -.24, rear + 1.2], [.19, 1.6, .19], 'extinguisher body', 'cylinder'); add('dark', [side + 1.1, .62, rear + 1.2], [.08, .16, .08], 'extinguisher handle');
  } else {
    for (const x of [-side, side]) { add('brick', [x, .8, rear + .1], [.8, 4.3, .8], 'brick pier'); add('stone', [x, 2.98, rear + .1], [1, .18, 1], 'pier cap'); }
    add('stone', [0, 1.57, rear + .03], [side * 2, .16, .4], 'wall coping');
    for (const x of [-side + 1, side - 1]) {
      add('brick', [x, -.94, rear + 1.15], [2.5, .8, 1.6], 'planter'); add('dark', [x, -.55, rear + 1.15], [2.25, .03, 1.35], 'planter soil');
      for (let i = 0; i < 28; i++) { const a = i * 2.39996, radius = .55 * Math.sqrt((i + 1) / 28); add('leaf', [x + Math.cos(a) * radius * 1.7, -.33 + (i % 3) * .055, rear + 1.15 + Math.sin(a) * radius], [.07, .45 + (i % 5) * .07, .055], 'grasses', 'sphere', [.2 * Math.sin(a), a, .2 * Math.cos(a)]); }
    }
    for (const x of [-side, side]) { add('dark', [x, 1.25, rear + .65], [.32, .7, .28], 'wall lantern'); add('lamp', [x, 1.26, rear + .79], [.2, .44, .04], 'lantern glass'); add('metal', [x, 1.58, rear + .77], [.4, .08, .4], 'lantern cap'); }
    for (let i = 0; i < 8; i++) { const x = -side + 1 + i * (side * 2 - 2) / 7; add('metal', [x, -.55, rear + 2.3], [.028, 1.6, .028], 'courtyard railing', 'cylinder'); }
    add('metal', [0, .3, rear + 2.3], [.04, side * 2 - 2, .04], 'railing handrail', 'cylinder', [0, 0, Math.PI / 2]);
  }
  return parts;
}
