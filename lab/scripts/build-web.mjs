import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const lab = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(lab, 'dist-web');
const web = path.join(lab, 'web');
await build({ configFile: path.join(lab, 'vite.web.config.ts') });

const installFiles = ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
for (const filename of installFiles) {
  const source = filename === 'icon-512.png' ? path.join(lab, 'desktop', 'assets', 'icon.png') : path.join(web, filename);
  await copyFile(source, path.join(directory, filename));
}

async function describe(file) {
  const data = await readFile(path.join(directory, file));
  assert.ok(data.length > 0, `Empty web app asset: ${file}`);
  return { path: file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

const emittedAssets = (await readdir(path.join(directory, 'assets'), { recursive: true, withFileTypes: true }))
  .filter(item => item.isFile())
  .map(item => path.relative(directory, path.join(item.parentPath, item.name)).replaceAll(path.sep, '/'));
const models = JSON.parse(await readFile(path.join(directory, 'models', 'manifest.json'), 'utf8'));
const modelPath = value => {
  assert.match(value, /^\/models\/(?:thumbnails\/)?[\w.-]+\.(?:glb|png)$/);
  return value.slice(1);
};
const packPaths = new Set(['models/manifest.json', ...models.flatMap(model => [modelPath(model.lowUrl), modelPath(model.thumbnailUrl)])]);
assert.equal(packPaths.size, models.length * 2 + 1, 'Every model needs its own simplified geometry and thumbnail');
const shell = await Promise.all(['index.html', 'favicon.svg', ...installFiles, ...emittedAssets].sort().map(describe));
for (const worker of ['routing', 'simulation']) assert.ok(shell.some(asset => asset.path.includes(`${worker}.worker-`)), `Missing ${worker} worker`);
const pack = await Promise.all([...packPaths].sort().map(describe));
const bytes = [...shell, ...pack].reduce((total, asset) => total + asset.bytes, 0);
const worker = await readFile(path.join(web, 'service-worker.template.js'), 'utf8');
const buildInfo = {
  version: createHash('sha256').update(JSON.stringify({ shell, pack })).update(worker).digest('hex').slice(0, 24),
  shell, pack, bytes,
};
await writeFile(path.join(directory, 'offline-manifest.json'), JSON.stringify(buildInfo, null, 2));
await writeFile(path.join(directory, 'service-worker.js'), `const BUILD = ${JSON.stringify(buildInfo)};\n${worker}`);
await writeFile(path.join(directory, '.nojekyll'), '');

// Static redistribution carries the same notices as the Windows and source releases.
const licenseDirectory = path.join(directory, 'licenses');
await mkdir(licenseDirectory, { recursive: true });
for (const filename of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(path.resolve(lab, '..', filename), path.join(licenseDirectory, filename));
}

console.log(`iPhone web build ${buildInfo.version}: ${shell.length} shell files, ${pack.length} offline equipment files, ${(bytes / 1024 ** 2).toFixed(1)} MiB.`);
