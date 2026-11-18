import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkbenchTouch } from '../lib/workbench-touch.ts';

const point = (id: number, x: number, y: number) => ({ id, x, y });

test('a control or terminal only receives a single release-confirmed tap', () => {
  const touch = new WorkbenchTouch();
  assert.equal(touch.begin(point(1, 12, 20), false), undefined);
  assert.equal(touch.update(point(1, 16, 22)), undefined);
  assert.deepEqual(touch.end(point(1, 16, 22)), { kind: 'tap' });
  assert.equal(touch.end(point(1, 16, 22)), undefined);
});

test('an orbit gesture cannot become a click by returning to its start', () => {
  const touch = new WorkbenchTouch();
  touch.begin(point(1, 12, 20), false);
  assert.deepEqual(touch.update(point(1, 27, 30)), { kind: 'orbit', dx: 15, dy: 10 });
  touch.update(point(1, 12, 20));
  assert.equal(touch.end(point(1, 12, 20)), undefined);
  touch.begin(point(2, 12, 20), false);
  assert.equal(touch.end(point(2, 32, 20)), undefined);
});

test('touch move remains a preview until its sole contact is released', () => {
  const touch = new WorkbenchTouch();
  touch.begin(point(1, 0, 0), true);
  assert.deepEqual(touch.update(point(1, 9, 0)), { kind: 'preview-move' });
  assert.deepEqual(touch.end(point(1, 11, 0)), { kind: 'commit-move' });
});

test('adding a finger cancels a pending equipment move and blocks either release from tapping', () => {
  const touch = new WorkbenchTouch();
  touch.begin(point(1, 0, 0), true);
  assert.deepEqual(touch.update(point(1, 10, 0)), { kind: 'preview-move' });
  assert.deepEqual(touch.begin(point(2, 20, 0), false), { kind: 'cancel-move' });
  assert.deepEqual(touch.update(point(2, 30, 0)), { kind: 'pan-zoom', dx: 5, dy: 0, scale: 2 });
  assert.equal(touch.end(point(2, 30, 0)), undefined);
  assert.equal(touch.update(point(1, 11, 0)), undefined);
  assert.equal(touch.end(point(1, 11, 0)), undefined);
});

test('losing input focus cancels the move and does not suppress the next intentional tap', () => {
  const touch = new WorkbenchTouch();
  touch.begin(point(1, 0, 0), true);
  touch.update(point(1, 11, 0));
  touch.reset();
  assert.equal(touch.end(point(1, 11, 0)), undefined);
  touch.begin(point(2, 12, 20), false);
  assert.deepEqual(touch.end(point(2, 12, 21)), { kind: 'tap' });
});
