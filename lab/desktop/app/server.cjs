/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the CommonJS Electron main entry point. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ORIGIN } = require('./security.cjs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'; frame-ancestors 'none'";
function resolveFile(directory, requestUrl) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(requestUrl, ORIGIN).pathname); } catch { return null; }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  let file = path.resolve(directory, '.' + pathname);
  const relative = path.relative(directory, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && !path.extname(pathname)) {
    const html = file.replace(/[\\/]$/, '') + '.html';
    file = fs.existsSync(html) ? html : path.join(directory, 'index.html');
  }
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : undefined;
}
async function createAppServer(directory, port = 4187) {
  if (!fs.existsSync(path.join(directory, 'index.html'))) throw new Error('Bundled app files are missing. Reinstall Irish Electrical Lab.');
  const server = http.createServer((request, response) => {
    const expectedHost = '127.0.0.1:' + port;
    if (request.headers.host !== expectedHost || (request.headers.origin && request.headers.origin !== 'http://' + expectedHost)) { response.writeHead(403); response.end('Forbidden'); return; }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    const file = resolveFile(directory, request.url);
    if (!file) { response.writeHead(file === null ? 400 : 404); response.end('File unavailable'); return; }
    response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = fs.createReadStream(file); stream.on('error', () => response.destroy()); stream.pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', error => reject(error.code === 'EADDRINUSE' ? new Error('Irish Electrical Lab cannot start because local port 4187 is in use. Close the program using that port and reopen the lab. Your saved work is safe.') : error));
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
module.exports = { createAppServer, resolveFile, CSP };
