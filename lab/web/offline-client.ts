import { publicAssetUrl } from './asset-url';

export interface OfflineStatus {
  kind: 'electrical-lab-offline-status';
  status: 'available' | 'downloading' | 'ready' | 'error';
  completed: number;
  total: number;
  bytes: number;
  message?: string;
}

export function isHomeScreenBuild(): boolean {
  return typeof document !== 'undefined' && !!document.querySelector('meta[name="electrical-lab-web"]');
}

let registration: Promise<ServiceWorkerRegistration> | undefined;

export function registerOfflineWorker() {
  if (!registration) {
    registration = register().catch(error => {
      registration = undefined;
      throw error;
    });
  }
  return registration;
}

async function register() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    throw new Error('Offline use requires Safari and a secure link.');
  }
  const worker = await navigator.serviceWorker.register(publicAssetUrl('service-worker.js'), {
    scope: publicAssetUrl(''),
    updateViaCache: 'none',
  });
  return worker;
}

export async function requestOfflineStatus(action: 'status' | 'download') {
  const current = await registerOfflineWorker();
  const worker = navigator.serviceWorker.controller ?? current.active;
  if (!worker || worker.state === 'redundant') {
    if (!current.installing || current.installing.state === 'redundant') {
      registration = undefined;
      throw new Error('The offline setup did not finish. Reopen the lab while online to retry.');
    }
    // Install will send controllerchange when the first verified cache is ready.
    if (action === 'status') return;
    throw new Error('Wait for offline setup to finish, then try again.');
  }
  worker.postMessage(`electrical-lab-offline-${action}`);
}
