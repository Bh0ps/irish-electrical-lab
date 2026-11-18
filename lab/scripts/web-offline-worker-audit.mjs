import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

/** Exercise the emitted service worker against a CacheStorage adapter and the
 * real build served under the actual project path. Browser/device QA is separate. */
export async function auditOfflineWorker({ scope, info, build }) {
  const worker = await readFile(path.join(build, 'service-worker.js'), 'utf8');
  const names = new Map();
  const attempted = [];
  let unavailable = false, denied;
  const fetchAsset = async (input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    attempted.push(url);
    if (unavailable || url === denied) throw new TypeError('Simulated network loss');
    return fetch(url, options);
  };
  const caches = {
    keys: async () => [...names.keys()],
    delete: async name => names.delete(name),
    async open(name) {
      if (!names.has(name)) names.set(name, new Map());
      const entries = names.get(name);
      return {
        keys: async () => [...entries.keys()].map(url => ({ url })),
        match: async url => entries.get(url)?.clone(),
        put: async (url, response) => {
          // Buffer once so a series of Response.clone() calls cannot create a
          // chain of retained ReadableStream branches in the Node adapter.
          const body = await response.arrayBuffer();
          entries.set(url, { clone: () => new Response(body, { status: response.status, headers: response.headers }) });
        },
      };
    },
  };

  function runtime(code) {
    const handlers = {};
    const messages = [];
    const source = { url: scope, postMessage: message => messages.push(message) };
    runInNewContext(code, {
      self: { registration: { scope }, addEventListener: (name, handler) => { handlers[name] = handler; } },
      clients: { claim: async () => {}, matchAll: async () => [source] },
      URL, Response, crypto: webcrypto, AbortController, setTimeout, clearTimeout, caches, fetch: fetchAsset,
    });
    const fire = async (name, data = {}) => {
      let pending;
      handlers[name]({ ...data, waitUntil: task => { pending = task; }, respondWith: task => { pending = task; } });
      return await pending;
    };
    return {
      install: () => fire('install'),
      activate: () => fire('activate'),
      async message(action) {
        await fire('message', { source, data: `electrical-lab-offline-${action}` });
        return messages.at(-1);
      },
      serve: (url, mode = 'cors') => fire('fetch', { request: { method: 'GET', url: new URL(url, scope).href, mode } }),
    };
  }

  const alpha = runtime(worker);
  await alpha.install();
  await alpha.activate();
  assert.equal((await alpha.message('status')).status, 'available');
  assert.equal(attempted.length, info.shell.length, 'First launch must not automatically download the pack');
  const model = info.pack.find(asset => asset.path.endsWith('.low.glb'));
  const unavailableModel = info.pack.findLast(asset => asset.path.endsWith('.low.glb'));
  denied = new URL(unavailableModel.path, scope).href;
  assert.equal((await alpha.message('download')).status, 'error');
  const prior = await alpha.message('status');
  assert.equal(prior.status, 'available');
  assert.ok(prior.completed > 0 && prior.completed < info.pack.length, 'Failed download still keeps verified files');
  denied = undefined;
  assert.equal((await alpha.message('download')).status, 'ready');
  assert.equal(attempted.filter(url => url === new URL(model.path, scope).href).length, 1, 'Retry should not re-download the verified model');
  unavailable = true;
  const page = await alpha.serve('./', 'navigate');
  assert.match(await page.text(), /Irish Electrical Lab/);
  assert.equal((await alpha.serve(model.path)).status, 200);
  for (const asset of info.shell.filter(entry => entry.path.includes('.worker-'))) assert.equal((await alpha.serve(asset.path)).status, 200);
  assert.equal(await alpha.serve('/unrelated/'), undefined);
  assert.equal(await alpha.serve('my-private-study-backup.json'), undefined);
  assert.equal(await alpha.serve(model.path.replace('.low.glb', '.glb')), undefined);

  // Same content would be reusable from release alpha. Change the index digest
  // to force the replacement to fetch, then fail that fetch or verification.
  const source = worker.slice(worker.indexOf('\n') + 1);
  const index = info.shell.find(asset => asset.path === 'index.html');
  const altered = { ...info, version: 'failed-upgrade', shell: info.shell.map(asset => asset === index ? { ...asset, sha256: createHash('sha256').update('unavailable version').digest('hex') } : asset) };
  await assert.rejects(runtime(`const BUILD = ${JSON.stringify(altered)};\n${source}`).install());
  assert.equal(names.size, 1);
  assert.equal((await alpha.message('status')).status, 'ready');
  assert.match(await (await alpha.serve('./', 'navigate')).text(), /Irish Electrical Lab/);

  // Unchanged models and shell remain reusable even with no network. A new
  // verified cache is assembled before activating or removing the older one.
  const beta = runtime(`const BUILD = ${JSON.stringify({ ...info, version: 'verified-upgrade' })};\n${source}`);
  await beta.install();
  assert.equal(names.size, 2);
  assert.equal((await alpha.message('status')).status, 'ready');
  await beta.activate();
  assert.equal(names.size, 1);
  assert.equal((await beta.message('status')).status, 'ready');
  assert.equal((await beta.serve(unavailableModel.path)).status, 200);
  console.log('Offline worker verified: opt-in, retry, offline cold-open assets, isolation, and failed/recoverable updates.');
}
