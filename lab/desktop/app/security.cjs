'use strict';
const ORIGIN = 'http://127.0.0.1:4187';
const REFERENCE_HOSTS = ['esbnetworks.ie', 'nsai.ie', 'safeelectric.ie', 'hsa.ie', 'theiet.org', 'grant.ie', 'se.com', 'abb.com', 'siemens.com', 'hager.com', 'legrand.com', 'eaton.com', 'danfoss.com', 'honeywellhome.com', 'dimplex.com', 'schneider-electric.com', 'megger.com', 'fluke.com', 'www.varilight.co.uk', 'www.danlers.co.uk', 'kb.shelly.cloud', 'www.aico.co.uk', 'support.myenergi.com', 'docs.tia.siemens.cloud', 'www.pilz.com',
  'www.mennekes.org', 'www.cesco.ie', 'www.elandcables.com', 'www.phoenixcontact.com',
  'www.bgelectrical.uk', 'www.manrose.co.uk', 's-lilley.co.uk', 'buildings.honeywell.com', 'www.radium.de', 'mkelectric.presti.media', 'customer.resideo.com', 'www.tritonshowers.co.uk', 'www.myenergi.com',
  'api.grundfos.com', 'www.dimplex.co.uk', 'www.lapp.com', 'www.wago.com', 'www.knipex.com', 'led.meanwell.com', 'www.resideo.com', 'www.belimo.com', 'dam.aspenpumps.com', 'media.ifm.com', 'www.findernet.com', 'cdn.findernet.com', 'www.littelfuse.com', 'www.ledvance.com', 'resources.tridonic.com', 'mac3.it', 'web-assets.knipex.com', 'www.wiha.com', 'storage.electrika.com', 'www.assets.signify.com', 'www.vent-axia.com', 'www.beninca.com', 'www.fronius.com', 'cqr.co.uk', 'lightdream.com.au', 'shop.electrolux.ie', 'www.stiebel-eltron.co.uk', 'www.somfy.co.uk', 'ansell-lighting.com', 'www.timeguard.com', 'www.einhell.co.uk'];
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const REFERENCE_FILES = new Set([
  'https://www.switchcomp.com/switches/rocker-switch/RG1-1A-DC-1-B',
  'https://www.switchcomp.com/switches-docs/rocker-switch/RG1-1A-DC-1-B.pdf',
  'https://www.tlc-direct.co.uk/Technical/DataSheets/Friedland/P814.pdf',
  'https://asset.eezybridge.com/nc/ba7b9546-29dd-40c4-87a7-885627281b87/077600.pdf',
  'https://res.cloudinary.com/lu1/fl_attachment:BG_IM_NXPSWIL_K/600854/Original.pdf',
]);
function allowedReference(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  if (REFERENCE_FILES.has(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && REFERENCE_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host)); } catch { return false; }
}
function validKind(value) { return value === 'circuit' || value === 'backup'; }
function safeFileName(value, kind) {
  const cleaned = typeof value === 'string' ? value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 160) : '';
  const result = cleaned || (kind === 'backup' ? 'Irish-Electrical-Lab.study-backup.json' : 'My-circuit.electrical.json');
  return result.toLowerCase().endsWith('.json') ? result : result + '.json';
}
module.exports = { ORIGIN, MAX_JSON_BYTES, allowedReference, validKind, safeFileName };
