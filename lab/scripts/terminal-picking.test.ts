import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, OrthographicCamera, Vector2, Vector3, type Intersection } from 'three';
import { prioritizeTerminalHit } from '../lib/terminal-picking.ts';

test('wiring chooses the closest printed ring through a cover and across overlapping hit areas', () => {
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const hit = (x: number, y: number, marker: boolean): Intersection => {
    const object = new Object3D();
    object.position.set(x, y, 0);
    object.userData.terminalMarker = marker;
    return { object, point: new Vector3(), distance: 1 };
  };
  const housing = hit(0, 0, false), upper = hit(0, .04, true), right = hit(.03, 0, true);
  const size = { width: 1800, height: 600 }, pointer = new Vector2();
  assert.deepEqual(prioritizeTerminalHit([housing, right, upper], pointer, camera, size), [upper, housing, right]);
  pointer.x = .03;
  assert.deepEqual(prioritizeTerminalHit([housing, upper, right], pointer, camera, size), [right, housing, upper]);
  const equipment = [housing, hit(.04, 0, false)];
  assert.equal(prioritizeTerminalHit(equipment, pointer, camera, size), equipment);
});
