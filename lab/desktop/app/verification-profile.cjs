'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modes = new Set(['--verify-desktop','--verify-guided-build','--verify-lifecycle','--verify-lifecycle-check',
  '--verify-retention-seed','--verify-retention-check','--verify-port-conflict','--verify-secondary-instance','--verify-window']);
const modifiers = new Set(['--verify-ui','--verify-gallery','--verify-graphics','--verify-dimmer']);
function verificationProfile(argv, temporary = os.tmpdir()) {
  const runArgs = argv.filter(arg => arg === '--verify-run' || arg.startsWith('--verify-run='));
  const unknown = argv.find(arg => arg.startsWith('--verify-') && !modes.has(arg) && !modifiers.has(arg) && !runArgs.includes(arg));
  if (unknown) throw new Error('Unknown verification option: ' + unknown);
  const mode = argv.some(arg => modes.has(arg));
  if (!mode && !runArgs.length && !argv.some(arg => modifiers.has(arg))) return;
  if (!mode) throw new Error('Use a verification mode, such as --verify-lifecycle, with the audit options.');
  if (runArgs.length > 1) throw new Error('Specify the verification run label once.');
  const label = runArgs.length ? runArgs[0].slice('--verify-run='.length) : 'default';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(label)) throw new Error('Use 1 to 48 letters, digits, underscores or hyphens for the verification run label.');
  const run = label.toLowerCase();
  return { run, path: path.join(temporary, 'Irish-Electrical-Lab-Audits', 'run-' + run) };
}
function isolateVerification(app, profile) {
  fs.mkdirSync(profile.path, { recursive: true });
  app.setPath('userData', profile.path);
  app.setPath('sessionData', profile.path);
  const crashes = path.join(profile.path, 'Crashpad');
  fs.mkdirSync(crashes, { recursive: true });
  app.setPath('crashDumps', crashes);
  const logs = path.join(profile.path, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  app.setAppLogsPath(logs);
}
function secondaryArguments(app, run, directory) {
  const args = ['--verify-secondary-instance', '--verify-run=' + run];
  return app.isPackaged ? args : [directory, ...args];
}
module.exports = {verificationProfile, isolateVerification, secondaryArguments};
