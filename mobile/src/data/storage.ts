import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small settings kept in AsyncStorage. The gradebook itself lives in SQLite
 * (src/db/).
 */
const THEME_PREFERENCE_KEY = 'settings.themePreference';
const WELCOME_SEEN_KEY = 'settings.welcomeSeen';
/** Where versions before SQLite saved the gradebook, as one JSON blob. */
export const LEGACY_GRADEBOOK_KEY = 'gradebook.v1';

export type StoredTheme = 'system' | 'light' | 'dark';

export async function loadThemePreference(): Promise<StoredTheme | null> {
  const raw = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return raw === 'system' || raw === 'light' || raw === 'dark' ? raw : null;
}

export async function saveThemePreference(preference: StoredTheme): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
}

export async function hasSeenWelcome(): Promise<boolean> {
  return (await AsyncStorage.getItem(WELCOME_SEEN_KEY)) === '1';
}

export async function markWelcomeSeen(): Promise<void> {
  await AsyncStorage.setItem(WELCOME_SEEN_KEY, '1');
}

/**
 * The old JSON gradebook, if this phone has one:
 * `'empty'` when the student had erased everything, `'present'` otherwise.
 * Before SQLite the app could only show the demo, so there is no real data
 * to carry over — only whether the student wanted it empty.
 */
export async function readLegacyGradebook(): Promise<'missing' | 'empty' | 'present'> {
  const raw = await AsyncStorage.getItem(LEGACY_GRADEBOOK_KEY);
  if (raw === null) {
    return 'missing';
  }
  try {
    const parsed = JSON.parse(raw) as { courses?: unknown[] };
    return Array.isArray(parsed.courses) && parsed.courses.length === 0 ? 'empty' : 'present';
  } catch {
    return 'present';
  }
}

export async function removeLegacyGradebook(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_GRADEBOOK_KEY);
}
