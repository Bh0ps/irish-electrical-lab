import { routeCircuit, type CircuitRoutes } from './routing';
import type { CircuitDocument } from './types';

export interface RoutingWorkerRequest {
  id: number;
  key: string;
  document: CircuitDocument;
}
export type RoutingWorkerResponse =
  | { id: number; key: string; routing: CircuitRoutes }
  | { id: number; key: string; error: string };

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  const { id, key, document } = event.data;
  let response: RoutingWorkerResponse;
  try {
    response = { id, key, routing: routeCircuit(document) };
  } catch (error) {
    response = { id, key, error: error instanceof Error ? error.message : String(error) };
  }
  // Maps and route coordinates are copied by the worker's structured-clone API.
  self.postMessage(response);
};
