import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(appRoot, 'desktop/assets/THIRD_PARTY_DEPENDENCIES.txt');
const manifest = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const relative = file => path.relative(appRoot, file).split(path.sep).join('/');
const packages = new Map(), flags = [], absentOptional = new Set();
const permissive = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause', '0BSD', 'CC0-1.0', 'Unlicense', 'Zlib', 'BlueOak-1.0.0', 'Python-2.0', 'WTFPL']);
const supplements = JSON.parse(readFileSync(path.join(appRoot, 'vendor/dependency-notices/manifest.json'), 'utf8'));
if (supplements.version !== 1 || !Array.isArray(supplements.notices)) throw new Error('Unsupported dependency-notice manifest.');

function readSupplements(identifier) {
  return supplements.notices.filter(item => item.packages.includes(identifier)).map(item => {
    const file = path.resolve(appRoot, item.file);
    const local = path.relative(appRoot, file);
    if (local.startsWith('..') || path.isAbsolute(local)) throw new Error('A dependency-notice manifest path escapes the app source.');
    const raw = readFileSync(file);
    if (createHash('sha256').update(raw).digest('hex') !== item.sha256) throw new Error(`Cached dependency notice changed: ${item.file}. Review its source and hash before packaging.`);
    return { file: `supplement: ${item.file}`, text: raw.toString('utf8'), source: item.source, coverage: item.coverage, note: item.note };
  });
}

function resolvePackage(name, from) {
  let directory = from;
  while (directory.startsWith(appRoot.slice(0, -1))) {
    const candidate = path.join(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) return path.dirname(candidate);
    if (directory === appRoot.slice(0, -1) || directory === path.dirname(appRoot)) break;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
}

function readNotices(directory) {
  const files = [];
  function walk(folder, depth, licenseDirectory = false) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory() && depth < 6 && !['node_modules', '.git', '.cache'].includes(entry.name)) {
        walk(file, depth + 1, licenseDirectory || /^(?:licenses?|notices?)$/i.test(entry.name));
      } else if (entry.isFile() && (licenseDirectory || /^(?:licen[cs]e|copying|copyright|notice)(?:$|[._-])/i.test(entry.name))) {
        const raw = readFileSync(file);
        if (raw.includes(0)) { flags.push({ package: relative(directory), reason: 'A notice file is binary and needs review.', file: relative(file) }); continue; }
        if (raw.length) files.push({ file: path.relative(directory, file).split(path.sep).join('/'), text: raw.toString('utf8') });
      }
    }
  }
  walk(directory, 0);
  return files.sort((a, b) => a.file.localeCompare(b.file, 'en'));
}

const queue = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).map(name => ({ name, from: appRoot, optional: !(name in (manifest.dependencies ?? {})) }));
for (let index = 0; index < queue.length; index++) {
  const dependency = queue[index], directory = resolvePackage(dependency.name, dependency.from);
  if (!directory) {
    if (dependency.optional) { absentOptional.add(dependency.name); continue; }
    throw new Error(`Required installed dependency is missing: ${dependency.name}. Run npm install before packaging.`);
  }
  if (packages.has(directory)) continue;
  const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const identifier = `${metadata.name}@${metadata.version}`;
  const license = typeof metadata.license === 'string' ? metadata.license : metadata.license?.type ?? JSON.stringify(metadata.licenses ?? null);
  let notices = readNotices(directory);
  if (!notices.length) notices = readSupplements(identifier);
  if (!notices.length) flags.push({ package: identifier, reason: 'No installed LICENSE/COPYING/NOTICE file or version-matched cached upstream notice found.' });
  if (notices.some(notice => ['inline-only', 'declaration-only'].includes(notice.coverage))) {
    flags.push({ package: identifier, reason: 'No package-level LICENSE file was published; available inline notices or declarations are retained. Review the actual distributed code.', license });
  }
  const identifiers = license?.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9.]+)*/g)?.filter(word => !['AND', 'OR', 'WITH'].includes(word)) ?? [];
  if (!identifiers.length || identifiers.some(identifier => !permissive.has(identifier))) {
    flags.push({ package: `${metadata.name}@${metadata.version}`, reason: 'License expression requires review; this collector grants no new permissions.', license });
  }
  packages.set(directory, { name: metadata.name, version: metadata.version, license, location: relative(directory), notices });
  for (const name of Object.keys({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
    queue.push({ name, from: directory, optional: name in (metadata.optionalDependencies ?? {}) });
  }
  // Present peers are part of the installed runtime graph. Optional or absent
  // integration peers are not silently converted into required packages.
  for (const name of Object.keys(metadata.peerDependencies ?? {})) if (resolvePackage(name, directory)) {
    queue.push({ name, from: directory, optional: true });
  }
}

const ordered = [...packages.values()].sort((a, b) => `${a.name}@${a.version}/${a.location}`.localeCompare(`${b.name}@${b.version}/${b.location}`, 'en'));
const header = [
  'Irish Electrical Lab — installed production dependency notices',
  '',
  'Generated from the installed dependencies declared by lab/package.json, their',
  'transitive dependencies, and present peers and optional dependencies.',
  'The list includes packages used only while building the renderer; listing a',
  'package does not assert that its complete code or native binaries are shipped.',
  'Exact installed notice text follows each package. The project MIT license',
  'does not replace these licenses. Version-matched cached upstream notices',
  'supplement npm packages that omitted a license file; their source and hash',
  'are recorded in vendor/dependency-notices/manifest.json. No network access',
  'is required to regenerate this file. Optional packages absent on this platform',
  'contain no installed files and are listed separately.',
  '',
  `Packages: ${ordered.length}`,
  `Notice files: ${ordered.reduce((total, item) => total + item.notices.length, 0)}`,
  `Review flags: ${flags.length}`,
  '',
  'Review flags (must be reviewed against the actual distributed code):',
  ...flags.map(flag => JSON.stringify(flag)),
  ...(flags.length ? [] : ['None.']),
  '',
  'Uninstalled optional packages: ' + [...absentOptional].sort().join(', '),
];
const sections = ordered.flatMap(item => [
  '', '='.repeat(72), `${item.name}@${item.version}`, `Declared license: ${item.license ?? 'not declared'}`, `Package: ${item.location}`,
  ...item.notices.flatMap(notice => ['', `--- ${notice.file} ---`, ...(notice.source ? [`Source: ${notice.source}`, ...(notice.note ? [`Note: ${notice.note}`] : []), ''] : []), notice.text]),
]);
const text = [...header, ...sections, ''].join('\n');
const profilePath = process.env.USERPROFILE ?? process.env.HOME;
if (profilePath && text.includes(profilePath)) throw new Error('An installed notice contains a local profile path; review it before publication.');
if (/(?:[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/[A-Za-z0-9_-]+\/)/.test(text)) throw new Error('An installed notice contains a personal machine path; review it before publication.');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text, 'utf8');
console.log(JSON.stringify({ output: 'desktop/assets/THIRD_PARTY_DEPENDENCIES.txt', packages: ordered.length, noticeFiles: ordered.reduce((total, item) => total + item.notices.length, 0), bytes: statSync(output).size, reviewFlags: flags, absentOptionalPackages: [...absentOptional].sort() }));
