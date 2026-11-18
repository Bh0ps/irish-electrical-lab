import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { LESSONS } from '../lib/lessons.ts';
import { WEB_BASE } from '../vite.web.config.ts';
import { auditOfflineWorker } from './web-offline-worker-audit.mjs';

const build = fileURLToPath(new URL('../dist-web/', import.meta.url));
const info = JSON.parse(await readFile(path.join(build, 'offline-manifest.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(build, 'models', 'manifest.json'), 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
const getLocal = pathname => {
  if (!pathname.startsWith(WEB_BASE)) return;
  const local = pathname.slice(WEB_BASE.length) || 'index.html';
  if (local.includes('..') || local.includes('\\') || local.includes('%')) return;
  return path.join(build, local);
};

// Project Pages maps the repository prefix to the artifact root. A local test
// server deliberately refuses unprefixed and missing asset paths.
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = getLocal(pathname);
  try {
    if (!file) throw new Error('Unscoped path');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': data.length });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const scope = `${origin}${WEB_BASE}`;
const sha256 = data => createHash('sha256').update(data).digest('hex');

function messageFromWorker(filename, message) {
  // Run the actual emitted module rather than the source TS implementation.
  const adapter = `
    const { parentPort, workerData } = require('node:worker_threads');
    globalThis.self = { postMessage: data => parentPort.postMessage(data) };
    import(workerData.url).then(() => self.onmessage({ data: workerData.message })).catch(error => { throw error; });
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(adapter, { eval: true, workerData: { url: pathToFileURL(path.join(build, filename)).href, message } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error(`Web worker did not respond: ${filename}`)); }, 10_000);
    const settle = (callback, value) => { clearTimeout(timer); void worker.terminate(); callback(value); };
    worker.once('message', result => settle(resolve, result));
    worker.once('error', error => settle(reject, error));
  });
}

try {
  const response = await fetch(scope);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /viewport-fit=cover/);
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => new URL(match[1], scope));
  assert.ok(references.length >= 5, 'Page must reference its module, CSS, manifest and icons');
  for (const url of references) {
    assert.ok(url.href.startsWith(scope), `Asset escaped the project path: ${url.href}`);
    assert.equal((await fetch(url)).status, 200, `Missing emitted asset: ${url.href}`);
  }
  const appManifestResponse = await fetch(new URL('manifest.webmanifest', scope));
  const appManifest = await appManifestResponse.json();
  for (const key of ['id', 'scope', 'start_url']) assert.equal(new URL(appManifest[key], appManifestResponse.url).href, scope);
  assert.equal(appManifest.display, 'standalone');
  for (const icon of appManifest.icons) assert.ok((await fetch(new URL(icon.src, scope))).ok);
  assert.equal((await fetch(`${origin}/models/manifest.json`)).status, 404, 'Mount test must reject root assets');

  const siteAssets=(await readdir(path.join(build,'site-assets'))).map(file=>'site-assets/'+file);
  assert.ok(siteAssets.includes('site-assets/daylight.hdr') && siteAssets.includes('site-assets/potted-plant.glb'));
  assert.equal(info.pack.length, manifest.length * 2 + 1 + siteAssets.length);
  assert.deepEqual(new Set(info.pack.map(asset => asset.path)), new Set([...siteAssets,'models/manifest.json', ...manifest.flatMap(entry => [entry.lowUrl.slice(1), entry.thumbnailUrl.slice(1)])]));
  assert.equal(info.bytes, [...info.shell, ...info.pack].reduce((total, asset) => total + asset.bytes, 0));
  for (const entry of manifest) assert.ok(await readFile(getLocal(`${WEB_BASE}${entry.url.slice(1)}`)), `Missing full detail ${entry.url}`);
  const assets = [...info.shell, ...info.pack];
  for (let index = 0; index < assets.length; index += 8) {
    await Promise.all(assets.slice(index, index + 8).map(async asset => {
      const file = await fetch(new URL(asset.path, scope));
      assert.equal(file.status, 200, asset.path);
      const bytes = Buffer.from(await file.arrayBuffer());
      assert.equal(bytes.length, asset.bytes, asset.path);
      assert.equal(sha256(bytes), asset.sha256, asset.path);
    }));
  }

  const script = references.find(url => /\/index-.*\.js$/.test(url.pathname));
  assert.ok(script, 'Missing main application bundle');
  const executable = await (await fetch(script)).text();
  const document = structuredClone(LESSONS.find(lesson => lesson.id === 7).circuit);
  const [simulation, routed] = await Promise.all(['simulation', 'routing'].map(async kind => {
    const worker = info.shell.find(asset => asset.path.includes(`${kind}.worker-`));
    assert.ok(worker, `No ${kind} module in shell cache`);
    assert.ok(executable.includes(`${WEB_BASE}${worker.path}`), `Wrong ${kind} worker URL in main bundle`);
    const file = await fetch(new URL(worker.path, scope));
    assert.match(file.headers.get('content-type'), /javascript/);
    return await messageFromWorker(worker.path, { id: 73, key: 'mobile-audit', document, dt: .25, electricalGeneration: 22 });
  }));
  assert.equal(simulation.kind, 'result');
  assert.equal(simulation.electricalGeneration, 22);
  assert.equal(simulation.result.converged, true);
  assert.equal(simulation.result.revision, document.revision);
  assert.equal(routed.key, 'mobile-audit');
  assert.equal(routed.routing.routes.size, document.wires.length);

  await auditOfflineWorker({ scope, info, build });
  console.log(`Verified project path, install manifest, ${manifest.length} equipment variants, ${assets.length} offline assets and both emitted worker round trips.`);
} finally {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
