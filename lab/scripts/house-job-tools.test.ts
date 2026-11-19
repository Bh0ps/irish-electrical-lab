import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HouseCallPanel } from '../components/lab/HouseCallPanel';
import { HOUSE_CALLS, callActivityId } from '../lib/house-calls';
import { LESSONS } from '../lib/lessons';

test('a tool opened during a house job keeps its instruction and a way back to the same step', () => {
  const call = HOUSE_CALLS.find(job => job.lesson === 9)!;
  const document = LESSONS.find(lesson => lesson.id === call.lesson)!.circuit;
  const noop = () => {};
  const props = {
    call, document, start: callActivityId(call.lesson, 1),
    onActivity: noop, onCredit: async () => {}, operate: noop, locate: noop,
    restart: noop, choose: noop, undo: noop, startFault: noop, closeTools: noop,
  };
  const instruction = call.steps[1].instruction;
  const tool = createElement('output', null, 'Stair light 0 V');
  const toolsOpen = renderToStaticMarkup(createElement(HouseCallPanel, { ...props, context: tool }));
  assert.ok(toolsOpen.includes(instruction));
  assert.ok(toolsOpen.includes('Stair light 0 V'));
  assert.ok(toolsOpen.includes('Back to job'));
  assert.ok(!toolsOpen.includes(call.steps[1].label));

  const toolsClosed = renderToStaticMarkup(createElement(HouseCallPanel, props));
  assert.ok(toolsClosed.includes(instruction));
  assert.ok(toolsClosed.includes(call.steps[1].label));
  assert.ok(!toolsClosed.includes('Back to job'));
});
