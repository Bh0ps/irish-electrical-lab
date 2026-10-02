'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { circuitRoutingKey, routeCircuit, type CircuitRoutes } from '../../lib/routing';
import type { RoutingWorkerRequest, RoutingWorkerResponse } from '../../lib/routing.worker';
import type { CircuitDocument } from '../../lib/types';

const EMPTY_ROUTING: CircuitRoutes = { routes: new Map(), issues: [] };

/** A failed worker must not turn an otherwise valid circuit into an empty scene. */
export function recoverCircuitRouting(document: CircuitDocument, key: string, reason: string, plan = routeCircuit): RoutingWorkerResponse {
  try { return { id: -1, key, routing: plan(document) }; }
  catch (error) { return { id: -1, key, error: `Wire display could not recover: ${error instanceof Error ? error.message : String(error)} (${reason})` }; }
}

/** Keep only the newest geometry while a worker is planning the previous one. */
export function createRoutingQueue(
  send: (request: RoutingWorkerRequest) => void,
  publish: (response: RoutingWorkerResponse) => void,
) {
  let nextId = 0;
  let latestKey: string | undefined;
  let active: RoutingWorkerRequest | undefined;
  let pending: { document: CircuitDocument; key: string } | undefined;
  const dispatch = (document: CircuitDocument, key: string) => {
    active = { id: ++nextId, key, document };
    send(active);
  };
  return {
    request(document: CircuitDocument, key: string) {
      if (key === latestKey) return;
      latestKey = key;
      if (active?.key === key) { pending = undefined; return; }
      if (active) pending = { document, key };
      else dispatch(document, key);
    },
    receive(response: RoutingWorkerResponse) {
      if (!active || response.id !== active.id || response.key !== active.key) return;
      active = undefined;
      if (response.key === latestKey) publish(response);
      if (pending) {
        const next = pending;
        pending = undefined;
        dispatch(next.document, next.key);
      }
    },
  };
}

export function useCircuitRouting(document: CircuitDocument, createWorker: () => Worker) {
  const key = useMemo(() => circuitRoutingKey(document), [document]);
  const [completed, setCompleted] = useState<RoutingWorkerResponse>();
  const worker = useRef<Worker | null>(null);
  const queue = useRef<ReturnType<typeof createRoutingQueue> | null>(null);
  const currentRequest = useRef({ document, key });
  const fallback = useRef(false);
  const lastRequestedKey = useRef<string | undefined>(undefined);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    currentRequest.current = { document, key };
    const clearWatchdog = () => { if (watchdog.current) clearTimeout(watchdog.current); watchdog.current = undefined; };
    const recover = (reason: string) => {
      clearWatchdog();
      worker.current?.terminate(); worker.current = null; queue.current = null;
      fallback.current = true;
      const latest = currentRequest.current;
      const response = recoverCircuitRouting(latest.document, latest.key, reason);
      queueMicrotask(() => { if (mounted.current) setCompleted(response); });
    };
    if (fallback.current) {
      if (lastRequestedKey.current !== key) { lastRequestedKey.current = key; recover('Worker unavailable'); }
      return;
    }
    lastRequestedKey.current = key;
    try {
      if (!worker.current) {
        const nextWorker = createWorker();
        const nextQueue = createRoutingQueue(request => {
          clearWatchdog();
          try {
            nextWorker.postMessage(request);
            watchdog.current = setTimeout(() => { if (worker.current === nextWorker) recover('Routing worker timed out'); }, 8000);
          } catch (error) { recover(error instanceof Error ? error.message : String(error)); }
        }, response => {
          clearWatchdog();
          if ('error' in response) recover(response.error);
          else setCompleted(response);
        });
        worker.current = nextWorker;
        queue.current = nextQueue;
        nextWorker.onmessage = (event: MessageEvent<RoutingWorkerResponse>) => { if (worker.current === nextWorker) nextQueue.receive(event.data); };
        nextWorker.onerror = () => {
          if (worker.current === nextWorker) recover('Routing worker failed');
        };
        nextWorker.onmessageerror = () => { if (worker.current === nextWorker) recover('Routing worker response could not be read'); };
      }
      queue.current?.request(document, key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recover(message);
    }
  }, [document, key, createWorker]);

  useEffect(() => () => {
    mounted.current = false;
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = undefined;
    worker.current?.terminate();
    worker.current = null;
    queue.current = null;
    lastRequestedKey.current = undefined;
  }, []);

  const matching = completed?.key === key ? completed : undefined;
  return {
    routing: matching && 'routing' in matching ? matching.routing : EMPTY_ROUTING,
    pending: !matching,
    error: matching && 'error' in matching ? matching.error : undefined,
  };
}
