import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const APP_ORIGIN = 'http://127.0.0.1:4173';
const root = fileURLToPath(new URL('../dist/client/', import.meta.url));

/** The emitted constructors have nested calls and quoted URL strings. */
function workerExpressions(source) {
  const result = [];
  for (const match of source.matchAll(/\bnew\s+Worker\s*\(/g)) {
    let depth = 0, quote, escaped = false;
    const start = match.index;
    for (let index = start + match[0].length - 1; index < source.length; index++) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = undefined;
      } else if (['"', "'", '`'].includes(character)) quote = character;
      else if (character === '(') depth++;
      else if (character === ')' && --depth === 0) {
        const expression = source.slice(start, index + 1);
        // Audit the real emitted constructors for this app's two workers.
        if (/(?:routing|simulation)\.worker(?:[-.]|\.ts)/.test(expression)) result.push(expression);
        break;
      }
    }
  }
  return result;
}

function executeConstructor(expression, scriptUrl) {
  const captured = [];
  class MockWorker {
    constructor(url, options) {
      captured.push({ url: new URL(String(url), scriptUrl).href, options });
    }
  }
  // Optional WorkerOptions use a minified function parameter (e?.name). Supply
  // empty option objects so the actual URL and constructor still execute.
  const parameters = Object.fromEntries('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => [letter, {}]));
  const location = new URL(`${APP_ORIGIN}/`);
  const context = { ...parameters, URL, Worker: MockWorker, location, window: { location }, __moduleUrl: scriptUrl };
  // vm script evaluation lacks import.meta. Its URL is the actual module's
  // HTTP URL here; explicit file:///ROOT strings remain intact and must fail.
  runInNewContext(expression.replace(/\bimport\.meta\.url\b/g, '__moduleUrl'), context, { timeout: 1000 });
  assert.equal(captured.length, 1, 'An emitted constructor must create exactly one worker');
  return captured[0];
}

function assertSameOrigin(worker) {
  const url = new URL(worker.url);
  assert.ok(['http:', 'https:'].includes(url.protocol), `Worker uses ${url.protocol}, expected HTTP: ${worker.url}`);
  assert.equal(url.origin, APP_ORIGIN, `Worker has a different origin: ${worker.url}`);
  assert.equal(worker.options?.type, 'module', 'Worker must retain module execution');
  return url;
}

// The regression itself is checked before inspecting any production files.
// In particular, URL existence by itself did not catch the file-origin defect.
const scriptUrl = `${APP_ORIGIN}/_next/static/chunks/Lab-example.js`;
assertSameOrigin(executeConstructor('new Worker("/_next/static/routing.worker-example.js", {type:"module",name:e?.name})', scriptUrl));
assertSameOrigin(executeConstructor('new Worker(new URL("../routing.worker-example.js", import.meta.url), {type:"module"})', scriptUrl));
assert.throws(() => assertSameOrigin(executeConstructor('new Worker(new URL("/_next/static/routing.worker-example.js", "file:///ROOT/components/lab/Workbench.tsx"), {type:"module"})', scriptUrl)), /file:/);
assert.throws(() => assertSameOrigin(executeConstructor('new Worker("https://example.invalid/routing.worker-example.js", {type:"module"})', scriptUrl)), /different origin/);
assert.equal(workerExpressions('new Worker(new URL(`/routing.worker-example.js`,`file:///ROOT/components/a.tsx`),{type:`module`}); new Worker(`/simulation.worker-example.js`,{type:`module`,name:e?.name})').length, 2);

if (process.argv.includes('--self-test')) {
  console.log('Production worker URL auditor self-tests passed (same-origin, relative URL, file-origin and remote-origin regression controls).');
  process.exit(0);
}

const findings = [], constructors = [], files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (file.endsWith('.js')) files.push(file);
  }
}
if (!existsSync(root)) findings.push('Missing production client output; build the app before this audit.');
else {
  walk(root);
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    for (const expression of workerExpressions(readFileSync(file, 'utf8'))) {
      const entry = { file: relative, expression };
      try {
        const worker = executeConstructor(expression, `${APP_ORIGIN}/${relative}`);
        entry.url = worker.url;
        const url = assertSameOrigin(worker);
        const servedFile = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
        assert.ok(servedFile.startsWith(`${root.replace(/[\\/]$/, '')}${path.sep}`), 'Worker URL escapes the production directory');
        assert.ok(existsSync(servedFile), `Missing emitted worker asset: ${url.pathname}`);
        assert.ok(servedFile.endsWith('.js'), 'Worker asset must use the server JavaScript MIME mapping');
        entry.kind = /routing\.worker/.test(url.pathname) ? 'routing' : 'simulation';
        entry.asset = path.relative(root, servedFile).split(path.sep).join('/');
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
        findings.push(`${relative}: ${entry.error}`);
      }
      constructors.push(entry);
    }
  }
  for (const kind of ['routing', 'simulation']) if (!constructors.some(entry => entry.kind === kind && !entry.error)) findings.push(`No valid emitted ${kind} worker constructor found.`);
}

const report = {
  timestamp: new Date().toISOString(),
  status: findings.length ? 'FAIL' : 'PASS',
  appOrigin: APP_ORIGIN,
  method: 'Execute actual emitted Worker constructor expressions in Node VM with mock Worker, native URL, and HTTP module base; verify same origin and local JavaScript asset existence. No browser or HTTP requests.',
  constructors,
  findings,
};
const verification = fileURLToPath(new URL('../../verification/', import.meta.url));
mkdirSync(verification, { recursive: true });
writeFileSync(path.join(verification, 'worker-url-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
