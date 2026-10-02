'use strict';
const ORIGIN = 'http://127.0.0.1:4187';
const REFERENCE_HOSTS = ['esbnetworks.ie', 'nsai.ie', 'safeelectric.ie', 'hsa.ie', 'theiet.org', 'grant.ie', 'se.com', 'abb.com', 'siemens.com', 'hager.com', 'legrand.com', 'eaton.com', 'danfoss.com', 'honeywellhome.com', 'dimplex.com', 'schneider-electric.com', 'megger.com', 'fluke.com', 'www.varilight.co.uk', 'www.danlers.co.uk', 'kb.shelly.cloud', 'www.aico.co.uk', 'support.myenergi.com', 'docs.tia.siemens.cloud', 'www.pilz.com'];
const MAX_JSON_BYTES = 32 * 1024 * 1024;
function allowedReference(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && REFERENCE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host)); } catch { return false; }
}
function validKind(value) { return value === 'circuit' || value === 'backup'; }
function safeFileName(value, kind) {
  const cleaned = typeof value === 'string' ? value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 160) : '';
  const result = cleaned || (kind === 'backup' ? 'Irish-Electrical-Lab.study-backup.json' : 'My-circuit.electrical.json');
  return result.toLowerCase().endsWith('.json') ? result : result + '.json';
}
module.exports = { ORIGIN, MAX_JSON_BYTES, allowedReference, validKind, safeFileName };
