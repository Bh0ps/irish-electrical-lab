import * as THREE from 'three';
export type SurfacePattern = 'rubber' | 'timber' | 'concrete' | 'plaster' | 'tiles' | 'brick' | 'paving' | 'brushed';
export interface SurfaceTextures { color: THREE.DataTexture; normal: THREE.DataTexture; roughness: THREE.DataTexture; dispose: () => void }
const palette: Record<SurfacePattern, [number, number, number]> = {
  rubber: [144, 149, 143], timber: [171, 129, 81], concrete: [149, 153, 149], plaster: [221, 218, 205],
  tiles: [222, 228, 225], brick: [137, 93, 69], paving: [125, 133, 133], brushed: [183, 189, 192],
};
const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
/** Deterministic original albedo/roughness/tangent normals; generated locally
 * with no DOM, image fetch, canvas, HDR download or shared asset mutation. */
export function createSurfaceTextures(pattern: SurfacePattern, size = 128): SurfaceTextures {
  const dimension = Math.max(32, Math.min(256, Math.round(size))), count = dimension * dimension, relief = new Float32Array(count), random = new Float32Array(count);
  let seed = 8107;
  for (let i = 0; i < count; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; random[i] = (seed & 65535) / 65535; }
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    const i = y * dimension + x, u = x / dimension, v = y / dimension, noise = random[i] - .5;
    let height = .5 + noise * .15;
    if (pattern === 'timber') height = .46 + Math.sin(u * 125 + Math.sin(v * 13) * 2.1) * .055 + Math.sin(u * 310 + v * 4) * .025 + noise * .055;
    if (pattern === 'rubber') height = .5 + noise * .12 + Math.cos(u * Math.PI * 64) * Math.cos(v * Math.PI * 64) * .025;
    if (pattern === 'concrete') height = .48 + noise * .24 + Math.sin(u * 29 + v * 13) * .02;
    if (pattern === 'plaster') height = .54 + noise * .065;
    if (pattern === 'brushed') height = .5 + noise * .04 + Math.sin(v * Math.PI * 256) * .025;
    if (pattern === 'tiles' || pattern === 'paving') { const cells = pattern === 'tiles' ? 4 : 5, edge = Math.min((u * cells) % 1, 1 - (u * cells) % 1, (v * cells) % 1, 1 - (v * cells) % 1); height = edge < .026 ? .17 : .66 + noise * (pattern === 'paving' ? .12 : .025); }
    if (pattern === 'brick') { const row = Math.floor(v * 8), bx = (u * 4 + (row % 2) * .5) % 1, by = (v * 8) % 1, mortar = Math.min(bx, 1 - bx) < .055 || Math.min(by, 1 - by) < .11; height = mortar ? .23 : .64 + noise * .12; }
    relief[i] = height;
  }
  const color = new Uint8Array(count * 4), normal = new Uint8Array(count * 4), roughness = new Uint8Array(count * 4), base = palette[pattern];
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    const i = y * dimension + x, k = i * 4, sample = relief[i], grain = (sample - .5) * (pattern === 'timber' ? 120 : 92), mortar = ['tiles', 'brick', 'paving'].includes(pattern) && sample < .3;
    for (let channel = 0; channel < 3; channel++) color[k + channel] = clampByte((mortar ? pattern === 'brick' ? [151, 147, 130][channel] : [118, 128, 123][channel] : base[channel]) + grain);
    color[k + 3] = normal[k + 3] = roughness[k + 3] = 255;
    const dx = relief[y * dimension + (x + 1) % dimension] - relief[y * dimension + (x + dimension - 1) % dimension], dy = relief[((y + 1) % dimension) * dimension + x] - relief[((y + dimension - 1) % dimension) * dimension + x];
    const vector = new THREE.Vector3(-dx * 1.3, -dy * 1.3, 1).normalize(); normal[k] = clampByte((vector.x * .5 + .5) * 255); normal[k + 1] = clampByte((vector.y * .5 + .5) * 255); normal[k + 2] = clampByte((vector.z * .5 + .5) * 255);
    const rough = clampByte(pattern === 'brushed' ? 120 + random[i] * 20 : pattern === 'tiles' ? mortar ? 240 : 125 + random[i] * 10 : 210 + random[i] * 30);
    roughness[k] = roughness[k + 1] = roughness[k + 2] = rough;
  }
  const texture = (bytes: Uint8Array, colorSpace: THREE.ColorSpace = THREE.NoColorSpace) => { const map = new THREE.DataTexture(bytes, dimension, dimension, THREE.RGBAFormat); map.colorSpace = colorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true; return map; };
  const values = { color: texture(color, THREE.SRGBColorSpace), normal: texture(normal), roughness: texture(roughness) };
  return { ...values, dispose: () => Object.values(values).forEach(map => map.dispose()) };
}
