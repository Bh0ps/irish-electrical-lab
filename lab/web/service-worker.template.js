/* global BUILD, clients */
// BUILD is generated from the actual static output by scripts/build-web.mjs.
const scope = new URL(self.registration.scope);
const prefix = `irish-electrical-lab:${scope.pathname}:`;
const cacheName = prefix + BUILD.version;
const scopedUrl = relative => new URL(relative, scope).href;
const shell = new Set(BUILD.shell.map(asset => scopedUrl(asset.path)));
const pack = new Set(BUILD.pack.map(asset => scopedUrl(asset.path)));
const packReady = scopedUrl('__offline-pack-ready');
const modelPrefix = scopedUrl('models/');
const startPage = scopedUrl('index.html');
let downloadInProgress;

async function verifiedAsset(asset, response) {
  if (!response?.ok) return false;
  const data = await response.clone().arrayBuffer();
  if (data.byteLength !== asset.bytes) return false;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') === asset.sha256;
}

async function placeAsset(cache, asset, olderCaches) {
  const url = scopedUrl(asset.path);
  if (await cache.match(url)) return;
  for (const oldCache of olderCaches) {
    const cached = await oldCache.match(url);
    if (await verifiedAsset(asset, cached)) {
      await cache.put(url, cached);
      return;
    }
  }
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25_000);
  try {
    const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: abort.signal });
    if (!await verifiedAsset(asset, response)) throw new Error(`Download verification failed for ${asset.path}`);
    await cache.put(url, response);
  } finally {
    clearTimeout(timeout);
  }
}

async function fill(cache, assets, olderCaches = [], onProgress = () => {}) {
  const keys = new Set((await cache.keys()).map(request => request.url));
  const todo = assets.filter(asset => !keys.has(scopedUrl(asset.path)));
  let index = 0, completed = assets.length - todo.length, failure;
  await onProgress(completed);
  const consume = async () => {
    while (!failure && index < todo.length) {
      const asset = todo[index++];
      try {
        await placeAsset(cache, asset, olderCaches);
        await onProgress(++completed);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, todo.length) }, consume));
  if (failure) throw failure;
}

async function markReady(cache) {
  const existing = new Set((await cache.keys()).map(request => request.url));
  if (![...shell, ...pack].every(url => existing.has(url))) throw new Error('The offline download is incomplete.');
  await cache.put(packReady, new Response(BUILD.version));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const next = await caches.open(cacheName);
    try {
      const names = (await caches.keys()).filter(name => name.startsWith(prefix) && name !== cacheName);
      const old = await Promise.all(names.map(name => caches.open(name)));
      const ready = (await Promise.all(old.map(async cache => await cache.match(packReady) ? cache : null))).filter(Boolean);
      await fill(next, BUILD.shell, old);
      // A device that already downloaded the lab keeps a complete playable version.
      // A damaged or interrupted replacement never activates over the old worker.
      if (ready.length) {
        await fill(next, BUILD.pack, ready);
        await markReady(next);
      }
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Do not use skipWaiting: open pages continue using their own release's files.
    const obsolete = (await caches.keys()).filter(name => name.startsWith(prefix) && name !== cacheName);
    await Promise.all(obsolete.map(name => caches.delete(name)));
    await clients.claim();
  })());
});

function statusMessage(status, completed, message) {
  return {
    kind: 'electrical-lab-offline-status', status, completed,
    total: BUILD.pack.length, bytes: BUILD.bytes, ...message && { message },
  };
}

async function reportStatus(cache) {
  if (downloadInProgress) return;
  const keys = new Set((await cache.keys()).map(request => request.url));
  const completed = [...pack].filter(url => keys.has(url)).length;
  const ready = completed === pack.size && keys.has(packReady) && [...shell].every(url => keys.has(url));
  return statusMessage(ready ? 'ready' : 'available', completed);
}

async function broadcast(message) {
  for (const client of await clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    if (client.url.startsWith(scope.href)) client.postMessage(message);
  }
}

let currentProgress;
async function startDownload(cache) {
  try {
    await fill(cache, BUILD.shell);
    await fill(cache, BUILD.pack, [], async completed => {
      currentProgress = statusMessage('downloading', completed);
      await broadcast(currentProgress);
    });
    await markReady(cache);
    await broadcast(statusMessage('ready', pack.size));
  } catch (error) {
    const message = error?.name === 'QuotaExceededError'
      ? 'This device is short on storage. Make space, then retry the offline download.'
      : 'A file did not finish downloading. Check your connection and retry. Downloaded files will be kept.';
    await broadcast(statusMessage('error', currentProgress?.completed ?? 0, message));
  } finally {
    currentProgress = undefined;
  }
}

self.addEventListener('message', event => {
  const source = event.source;
  if (!source?.url?.startsWith(scope.href)) return;
  if (!['electrical-lab-offline-status', 'electrical-lab-offline-download'].includes(event.data)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    if (event.data === 'electrical-lab-offline-status') {
      source.postMessage(currentProgress ?? await reportStatus(cache) ?? statusMessage('downloading', 0));
    } else {
      if (!downloadInProgress) {
        downloadInProgress = startDownload(cache).finally(() => { downloadInProgress = undefined; });
      } else {
        source.postMessage(currentProgress ?? statusMessage('downloading', 0));
      }
      await downloadInProgress;
    }
  })().catch(() => {
    source.postMessage(statusMessage('error', 0, 'Offline storage is unavailable. Reopen the installed app and retry.'));
  }));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(scope.href)) return;
  const navigation = request.mode === 'navigate' && [scope.pathname, `${scope.pathname}index.html`].includes(url.pathname);
  // Only cache our own immutable files. Files/backup data and external references
  // never pass through this cache. Browser networking handles full detail on demand.
  const against = navigation ? startPage : url.href;
  if (!navigation && !shell.has(against) && !pack.has(against)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(against) ?? await fetch(request);
  })());
});
