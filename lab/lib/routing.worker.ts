import { routeCircuit, type CircuitRoutes } from './routing';
import type { CircuitDocument } from './types';

export interface RoutingWorkerRequest {
  id: number;
  key: string;
  document: CircuitDocument;
  reportProgress?: boolean;
}
export type RoutingWorkerResponse =
  | { id: number; key: string; routing: CircuitRoutes }
  | { id: number; key: string; error: string };
export interface RoutingWorkerProgress { kind: 'routing-progress'; id: number; checkpoint: number }
export type RoutingWorkerMessage = RoutingWorkerResponse | RoutingWorkerProgress;

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  const { id, key, document, reportProgress } = event.data;
  let response: RoutingWorkerResponse;
  try {
    let checkpoint = 0, nextReport = 0;
    const report = reportProgress ? () => {
      checkpoint++;
      const now = performance.now();
      if (now < nextReport) return;
      nextReport = now + 750;
      // Request IDs are unique within this worker. Avoid copying the board's
      // entire geometry key and routes for each sign of progress.
      self.postMessage({ kind: 'routing-progress', id, checkpoint } satisfies RoutingWorkerProgress);
    } : undefined;
    response = { id, key, routing: routeCircuit(document, report) };
  } catch (error) {
    response = { id, key, error: error instanceof Error ? error.message : String(error) };
  }
  // Maps and route coordinates are copied by the worker's structured-clone API.
  self.postMessage(response);
};
