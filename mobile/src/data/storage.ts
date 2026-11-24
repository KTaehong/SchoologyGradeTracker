import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small settings kept in AsyncStorage. The gradebook itself lives in SQLite
 * (src/db/).
 */
const THEME_PREFERENCE_KEY = 'settings.themePreference';
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

/** Removes the gradebook older versions kept as JSON; it only ever held the demo. */
export async function removeLegacyGradebook(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_GRADEBOOK_KEY);
}
