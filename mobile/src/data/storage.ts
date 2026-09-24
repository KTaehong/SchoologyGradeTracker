import AsyncStorage from '@react-native-async-storage/async-storage';

import { GRADEBOOK_SCHEMA_VERSION, type Gradebook } from './types';

const GRADEBOOK_KEY = 'gradebook.v1';
const THEME_PREFERENCE_KEY = 'settings.themePreference';

export type StoredTheme = 'system' | 'light' | 'dark';

/** Minimal shape check so a damaged save can never crash the app. */
export function isGradebook(value: unknown): value is Gradebook {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Gradebook>;
  return (
    candidate.schemaVersion === GRADEBOOK_SCHEMA_VERSION &&
    Array.isArray(candidate.courses) &&
    Array.isArray(candidate.upcoming) &&
    typeof candidate.updatedAt === 'string'
  );
}

/**
 * Reads the saved gradebook.
 * - `{ kind: 'missing' }` — nothing was ever saved (first launch).
 * - `{ kind: 'invalid' }` — something was saved but can't be read.
 */
export type LoadResult =
  | { kind: 'loaded'; gradebook: Gradebook }
  | { kind: 'missing' }
  | { kind: 'invalid' };

export async function loadGradebook(): Promise<LoadResult> {
  const raw = await AsyncStorage.getItem(GRADEBOOK_KEY);
  if (raw === null) {
    return { kind: 'missing' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isGradebook(parsed) ? { kind: 'loaded', gradebook: parsed } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export async function saveGradebook(gradebook: Gradebook): Promise<void> {
  await AsyncStorage.setItem(GRADEBOOK_KEY, JSON.stringify(gradebook));
}

export async function loadThemePreference(): Promise<StoredTheme | null> {
  const raw = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
}

export async function saveThemePreference(preference: StoredTheme): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}
