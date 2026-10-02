import { readRecord, writeRecord } from './storage';

export interface UiPreferences {
  version: 1;
  liveHints: boolean;
  courseDepth: 'foundation' | 'apprentice';
}

export const UI_PREFERENCES_RECORD = 'ui-preferences';
export const DEFAULT_UI_PREFERENCES: Readonly<UiPreferences> = Object.freeze({ version: 1, liveHints: true, courseDepth: 'foundation' });

/** Invalid UI data falls back without touching circuit, evidence or progress data. */
export function normaliseUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_UI_PREFERENCES };
  const record = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(record);
  if ((prototype !== Object.prototype && prototype !== null) || record.version !== 1) return { ...DEFAULT_UI_PREFERENCES };
  return {
    version: 1,
    liveHints: typeof record.liveHints === 'boolean' ? record.liveHints : DEFAULT_UI_PREFERENCES.liveHints,
    courseDepth: record.courseDepth === 'apprentice' || record.courseDepth === 'foundation' ? record.courseDepth : DEFAULT_UI_PREFERENCES.courseDepth,
  };
}

/** A missing/unavailable preference store must never prevent the lab opening. */
export async function loadUiPreferences(): Promise<UiPreferences> {
  try { return normaliseUiPreferences(await readRecord(UI_PREFERENCES_RECORD)); }
  catch { return { ...DEFAULT_UI_PREFERENCES }; }
}

/** Store only display preferences, independently from study backups and documents. */
export async function saveUiPreferences(preferences: UiPreferences): Promise<void> {
  await writeRecord(UI_PREFERENCES_RECORD, normaliseUiPreferences(preferences));
}
