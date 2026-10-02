import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import TestReport from '../components/lab/TestReport.tsx';
import type { AssessmentCheck, BuildAssessment } from '../lib/assessment.ts';

function render(checks: AssessmentCheck[], stale = false) {
  const assessment: BuildAssessment = { revision: 4, circuitId: 'practice', passed: false, summary: 'Test needs attention.', checks };
  return renderToStaticMarkup(React.createElement(TestReport, { assessment, running: false, stale, recordedAt: 1790906400000, onSelect: () => {} }));
}
const check = (id: string, category: AssessmentCheck['category'], status: AssessmentCheck['status'], target = true): AssessmentCheck => ({ id, category, status, title: id, explanation: `${id} explanation`, ...(target ? { wire: 'wire-1' } : {}) });

test('compact reports show one relevant finding first while retaining every verdict in expandable checks', () => {
  const checks = [check('missing-connection', 'objectives', 'fail'), check('operating', 'operation', 'fail'), check('protection', 'protection', 'fail'), check('unresolved-model', 'model', 'unresolved'), check('stopped-state', 'operation', 'pass'), check('not-run', 'objectives', 'not-run')];
  const html = render(checks);
  const firstCard = html.slice(html.indexOf('aria-label="First test finding"'), html.indexOf('<details'));
  assert.match(firstCard, /UNRESOLVED · unresolved-model/); assert.doesNotMatch(firstCard, /FAIL · protection/);
  assert.match(firstCard, /Show on bench/); assert.match(firstCard, /Next check:/);
  assert.match(html, /All checks \(6\)/);
  for (const item of checks) assert.match(html, new RegExp(item.title));
  assert.match(html, /PASS · stopped-state/); assert.match(html, /NOT RUN · not-run/); assert.match(html, /Last completed test/);
});

test('protection precedes operation and lesson matching when the model is resolved', () => {
  const html = render([check('extra:wire-1', 'objectives', 'fail'), check('light-off', 'operation', 'fail'), check('finding:neutralEarth:load', 'protection', 'fail')]);
  const firstCard = html.slice(html.indexOf('aria-label="First test finding"'), html.indexOf('<details'));
  assert.match(firstCard, /finding:neutralEarth:load/); assert.match(firstCard, /simulated supply off/); assert.doesNotMatch(firstCard, /light-off/);
});

test('historical reports remain readable but cannot target missing geometry as current findings', () => {
  const html = render([check('old-wire', 'protection', 'fail')], true);
  assert.match(html, /Circuit changed/); assert.match(html, /previous edit/); assert.match(html, /Run the test again/);
  assert.match(html, /disabled=""[^>]*>Show on bench/); assert.match(html, /old-wire explanation/);
});
