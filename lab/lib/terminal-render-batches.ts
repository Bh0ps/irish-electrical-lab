import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetPresentation } from './blender-model';

type MeshEntry = AssetPresentation['meshes'][number];
interface TerminalBatch {
  members: number[];
  geometry: THREE.BufferGeometry;
}
interface CachedBatches {
  batches: TerminalBatch[];
  pickingMaterials: Map<THREE.Side, THREE.MeshBasicMaterial>;
}
const cache = new WeakMap<THREE.Group, CachedBatches>();

function staticTerminalMaterial(entry: MeshEntry): THREE.MeshStandardMaterial | undefined {
  const { node, material } = entry;
  if (entry.part !== 'terminals' || entry.light || entry.cutaway || entry.coverAssembly || entry.serviceChamber ||
      entry.conceptualInternal || !(material instanceof THREE.MeshStandardMaterial) || material.transparent ||
      !material.visible || material.opacity !== 1 || material.alphaTest || material.alphaHash || material.polygonOffset ||
      !material.colorWrite || !material.depthWrite || !material.depthTest || material.stencilWrite ||
      material.depthFunc !== THREE.LessEqualDepth || material.blending !== THREE.NormalBlending && material.blending !== THREE.NoBlending ||
      material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) return;
  const geometry = node.geometry;
  if (node.type !== 'Mesh' || node.morphTargetInfluences || geometry.groups.length ||
      geometry.drawRange.start || Number.isFinite(geometry.drawRange.count) || node.matrixWorld.determinant() <= 0) return;
  let terminal = false;
  for (let owner: THREE.Object3D | null = node; owner; owner = owner.parent) {
    const tag = owner.userData;
    if (!owner.visible || owner.renderOrder || owner.layers.mask !== 1 || tag.animation || tag.probeSide ||
        tag.boardDoor || tag.boardShield || tag.benchOnly || tag.contactFlag || tag.partId === 'actuator') return;
    if (tag.terminalId) terminal = true;
  }
  return terminal ? material : undefined;
}

function attributeLayout(geometry: THREE.BufferGeometry): string {
  return JSON.stringify([!!geometry.index, ...Object.keys(geometry.attributes).sort().map(name => {
    const attribute = geometry.attributes[name];
    return [name, attribute.array.constructor.name, attribute.itemSize, attribute.normalized];
  })]);
}

function buildBatches(presentation: AssetPresentation): CachedBatches {
  const { scene, meshes } = presentation;
  scene.updateMatrixWorld(true);
  const groups = new Map<string, number[]>();
  meshes.forEach((entry, index) => {
    const material = staticTerminalMaterial(entry);
    if (!material) return;
    const key = material.uuid + attributeLayout(entry.node.geometry);
    const members = groups.get(key);
    if (members) members.push(index);
    else groups.set(key, [index]);
  });
  const rootInverse = scene.matrixWorld.clone().invert();
  const batches: TerminalBatch[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const parts = members.map(index => {
      const node = meshes[index].node;
      return node.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, node.matrixWorld));
    });
    const geometry = mergeGeometries(parts);
    if (geometry) batches.push({ geometry, members });
  }
  return { batches, pickingMaterials: new Map() };
}

/** Keep exact original pick surfaces and semantic parents. The additional
 * meshes render the same triangles with the original shared material. */
export function attachTerminalBatches(source: THREE.Group, presentation: AssetPresentation): void {
  let cached = cache.get(source);
  if (!cached) { cached = buildBatches(presentation); cache.set(source, cached); }
  for (const { geometry, members } of cached.batches) {
    const first = presentation.meshes[members[0]];
    const material = first.material as THREE.MeshStandardMaterial;
    let picking = cached.pickingMaterials.get(material.side);
    if (!picking) {
      picking = new THREE.MeshBasicMaterial({ side: material.side, visible: false });
      cached.pickingMaterials.set(material.side, picking);
    }
    for (const index of members) {
      const entry = presentation.meshes[index];
      entry.pickingMaterial = picking;
      entry.node.material = picking;
      entry.node.castShadow = false;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.terminalBatch = true;
    mesh.raycast = () => {};
    mesh.castShadow = true;
    mesh.receiveShadow = first.node.receiveShadow;
    presentation.scene.add(mesh);
    presentation.terminalBatches.push(mesh);
  }
}

/** Called when the last lease has expired and the original GLB is evicted. */
export function disposeBlenderTerminalBatches(source: THREE.Group): void {
  const cached = cache.get(source);
  if (!cached) return;
  for (const batch of cached.batches) batch.geometry.dispose();
  for (const material of cached.pickingMaterials.values()) material.dispose();
  cache.delete(source);
}
