import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBoundedWireCurve, WIRE_CORNER_RADIUS } from '../lib/Equipment.tsx';
import { WIRE_RADIUS } from '../lib/routing.ts';
import type { Vec3 } from '../lib/types.ts';

function nearestSegment(point: THREE.Vector3, route: Vec3[]): number {
  return Math.min(...route.slice(1).map((end, index) => {
    const a = new THREE.Vector3(...route[index]), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a), lengthSquared = direction.lengthSq();
    const fraction = lengthSquared ? THREE.MathUtils.clamp(point.clone().sub(a).dot(direction) / lengthSquared, 0, 1) : 0;
    return point.distanceTo(a.addScaledVector(direction, fraction));
  }));
}
function close(actual: number[], expected: number[]): void {
  expected.forEach((value, index) => assert.ok(Math.abs(actual[index] - value) < 1e-10));
}

test('bounded wire curves preserve exact endpoints without mutating mandatory route points', () => {
  const points: Vec3[] = [[1, .3, 2], [1, .3, -2], [5, .3, -2], [5, .6, -2]];
  const before = structuredClone(points), curve = createBoundedWireCurve(points);
  close(curve.getPoint(0).toArray(), points[0]);
  close(curve.getPointAt(1).toArray(), points[points.length - 1]);
  assert.deepEqual(points, before);
});

test('dense sampling of straight, acute, obtuse and spatial turns stays within the reserved radius', () => {
  const routes: Vec3[][] = [
    [[0, 0, 0], [2, 0, 0], [2, 2, 0]],
    [[0, 0, 0], [2, 0, 0], [.2, .13, 0]],
    [[0, 0, 0], [2, 0, 0], [4, .4, .2], [4, 3, -.7]],
    [[0, 0, 0], [0, .02, 0], [.01, .02, .01], [0, .025, .02]],
  ];
  for (const route of routes) {
    const curve = createBoundedWireCurve(route);
    for (let index = 0; index <= 3000; index++) assert.ok(nearestSegment(curve.getPoint(index / 3000), route) <= WIRE_CORNER_RADIUS + 1e-10);
  }
});

test('long straight runs retain every corner mesh interval rather than skipping a short rounded bend', () => {
  const points: Vec3[] = [[0, 0, 0], [1000, 0, 0], [1000, 0, 1000]], curve = createBoundedWireCurve(points);
  assert.equal(curve.tubularSegments, 10); // one straight + eight corner intervals + one straight
  const cornerSamples = Array.from({ length: 9 }, (_, index) => curve.getPointAt((index + 1) / curve.tubularSegments));
  cornerSamples.forEach(point => assert.ok(point.distanceTo(new THREE.Vector3(1000, 0, 0)) <= WIRE_CORNER_RADIUS + 1e-10));
  assert.ok(cornerSamples[4].x < 1000 && cornerSamples[4].z > 0);
  const geometry = new THREE.TubeGeometry(curve, curve.tubularSegments, WIRE_RADIUS, 8, false);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, index);
    // Float32 vertex precision grows with world coordinate magnitude.
    assert.ok(nearestSegment(point, points) <= WIRE_CORNER_RADIUS + WIRE_RADIUS + .0002);
  }
  geometry.dispose();
});

test('rendered cable envelopes stay inside corner radius plus the routing cable radius', () => {
  const points: Vec3[] = [[-.8, .4, .6], [-.8, .4, -1.2], [2.4, .4, -1.2], [2.4, .8, -1.2]], curve = createBoundedWireCurve(points);
  const geometry = new THREE.TubeGeometry(curve, curve.tubularSegments, WIRE_RADIUS, 8, false), positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) assert.ok(nearestSegment(new THREE.Vector3().fromBufferAttribute(positions, index), points) <= WIRE_CORNER_RADIUS + WIRE_RADIUS + 1e-6);
  geometry.dispose();
});

test('duplicate, collinear, reversing and tiny routes remain finite and keep their endpoint', () => {
  for (const points of [
    [[0, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]],
    [[0, 0, 0], [1, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [1e-12, 0, 0]],
    [[1, 2, 3], [1, 2, 3]],
  ] as Vec3[][]) {
    const curve = createBoundedWireCurve(points);
    assert.deepEqual(curve.getPointAt(0).toArray(), points[0]);
    assert.deepEqual(curve.getPointAt(1).toArray(), points[points.length - 1]);
    for (let index = 0; index <= 50; index++) {
      assert.ok(curve.getPointAt(index / 50).toArray().every(Number.isFinite));
      assert.ok(curve.getTangentAt(index / 50).toArray().every(Number.isFinite));
    }
  }
});

test('oversized corner requests are bounded and non-finite route input is rejected', () => {
  const points: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0]], curve = createBoundedWireCurve(points, 10);
  for (let index = 0; index <= 1000; index++) assert.ok(nearestSegment(curve.getPoint(index / 1000), points) <= WIRE_CORNER_RADIUS + 1e-10);
  assert.throws(() => createBoundedWireCurve([[0, 0, 0], [1, Infinity, 0]]), /non-finite/);
});
