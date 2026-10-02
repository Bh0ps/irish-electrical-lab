import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_UI_PREFERENCES, UI_PREFERENCES_RECORD, loadUiPreferences, normaliseUiPreferences, saveUiPreferences } from '../lib/ui-preferences.ts';
import { readRecord, writeRecord, writeRecordsAtomic } from '../lib/storage.ts';

test('preferences default to beginner depth and live hints, accepting only the versioned display fields', () => {
  for (const value of [undefined, null, [], true, 'text', { version: 2, liveHints: false, courseDepth: 'apprentice' }, new Date()]) assert.deepEqual(normaliseUiPreferences(value), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normaliseUiPreferences({ version: 1, liveHints: false, courseDepth: 'apprentice', extra: 'ignored' }), { version: 1, liveHints: false, courseDepth: 'apprentice' });
  assert.deepEqual(normaliseUiPreferences({ version: 1, liveHints: 'false', courseDepth: 'expert' }), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(normaliseUiPreferences({ version: 1, liveHints: false }), { ...DEFAULT_UI_PREFERENCES, liveHints: false });
  const result = normaliseUiPreferences(undefined); result.liveHints = false; assert.equal(DEFAULT_UI_PREFERENCES.liveHints, true);
});

test('independent preference persistence preserves existing draft, study progress and saved builds', async () => {
  const preserved = { draft: { id: 'existing-circuit', version: 1 }, progress: { lessons: [7], evidence: ['saved-reading'] }, builds: [{ id: 'my-build' }] };
  await writeRecordsAtomic(preserved);
  await saveUiPreferences({ version: 1, liveHints: false, courseDepth: 'apprentice' });
  assert.deepEqual(await loadUiPreferences(), { version: 1, liveHints: false, courseDepth: 'apprentice' });
  for (const [key, value] of Object.entries(preserved)) assert.deepEqual(await readRecord(key), value);
  await writeRecord(UI_PREFERENCES_RECORD, { version: 99, liveHints: false });
  assert.deepEqual(await loadUiPreferences(), DEFAULT_UI_PREFERENCES);
  assert.deepEqual(await readRecord(UI_PREFERENCES_RECORD), { version: 99, liveHints: false });
  for (const [key, value] of Object.entries(preserved)) assert.deepEqual(await readRecord(key), value);
});
