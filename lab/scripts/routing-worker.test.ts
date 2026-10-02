import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingQueue, recoverCircuitRouting } from '../components/lab/useCircuitRouting.ts';
import { LESSONS } from '../lib/lessons.ts';
import { circuitRoutingKey } from '../lib/routing.ts';
import type { RoutingWorkerRequest, RoutingWorkerResponse } from '../lib/routing.worker.ts';
import type { CircuitDocument } from '../lib/types.ts';

const document = { id: 'worker-queue-fixture' } as CircuitDocument;
function fixture() {
  const sent: RoutingWorkerRequest[] = [], published: RoutingWorkerResponse[] = [];
  return { sent, published, queue: createRoutingQueue(request => sent.push(request), response => published.push(response)) };
}
function result(request: RoutingWorkerRequest): RoutingWorkerResponse {
  return { id: request.id, key: request.key, routing: { routes: new Map(), issues: [] } };
}

test('routing worker keeps one active request and only the latest pending geometry', () => {
  const { queue, sent, published } = fixture();
  queue.request(document, 'first');
  queue.request(document, 'intermediate');
  queue.request(document, 'latest');
  assert.deepEqual(sent.map(request => request.key), ['first']);
  queue.receive(result(sent[0]));
  assert.equal(published.length, 0);
  assert.deepEqual(sent.map(request => request.key), ['first', 'latest']);
  queue.receive(result(sent[1]));
  assert.deepEqual(published.map(response => response.key), ['latest']);
});

test('same geometry state updates do not send another planning request', () => {
  const { queue, sent, published } = fixture();
  queue.request(document, 'geometry');
  queue.request({ ...document, revision: 2 }, 'geometry');
  assert.equal(sent.length, 1);
  queue.receive(result(sent[0]));
  queue.request({ ...document, revision: 3 }, 'geometry');
  assert.equal(sent.length, 1);
  assert.equal(published.length, 1);
});

test('returning to the active geometry drops obsolete pending geometry', () => {
  const { queue, sent, published } = fixture();
  queue.request(document, 'original');
  queue.request(document, 'moved');
  queue.request(document, 'original');
  queue.receive(result(sent[0]));
  assert.equal(sent.length, 1);
  assert.deepEqual(published.map(response => response.key), ['original']);
});

test('obsolete and mismatched responses cannot complete a different request', () => {
  const { queue, sent, published } = fixture();
  queue.request(document, 'first');
  queue.request(document, 'latest');
  queue.receive({ ...result(sent[0]), key: 'wrong-key' });
  queue.receive({ ...result(sent[0]), id: 100 });
  assert.equal(sent.length, 1);
  queue.receive(result(sent[0]));
  queue.receive(result(sent[0]));
  assert.equal(published.length, 0);
  assert.equal(sent.length, 2);
  queue.receive(result(sent[1]));
  queue.receive(result(sent[1]));
  assert.equal(published.length, 1);
});

test('worker-reported failures release the queue and preserve latest-request ordering', () => {
  const { queue, sent, published } = fixture();
  queue.request(document, 'first');
  queue.request(document, 'latest');
  queue.receive({ id: sent[0].id, key: 'first', error: 'old failure' });
  assert.equal(published.length, 0);
  queue.receive({ id: sent[1].id, key: 'latest', error: 'current failure' });
  assert.deepEqual(published, [{ id: sent[1].id, key: 'latest', error: 'current failure' }]);
  queue.request(document, 'corrected');
  queue.receive(result(sent[2]));
  assert.deepEqual(published.map(response => response.key), ['latest', 'corrected']);
});

test('blocked or failed workers recover all authored wire paths instead of an empty map', () => {
  for (const lesson of LESSONS) {
    const doc=lesson.circuit,key=circuitRoutingKey(doc),before=structuredClone(doc);
    const response=recoverCircuitRouting(doc,key,'SecurityError: blocked file worker URL');
    assert.ok('routing' in response,JSON.stringify(response));
    if ('routing' in response) { assert.equal(response.routing.routes.size,doc.wires.length);assert.deepEqual(response.routing.issues,[]); }
    assert.equal(response.key,key);assert.deepEqual(doc,before);
  }
});
test('recovery errors preserve the circuit and return a readable diagnostic', () => {
  const doc=structuredClone(LESSONS[0].circuit),before=structuredClone(doc);
  const response=recoverCircuitRouting(doc,'current','worker failed',()=>{throw new Error('planner failure');});
  assert.ok('error' in response);if('error' in response)assert.match(response.error,/planner failure.*worker failed/);
  assert.deepEqual(doc,before);
});
