import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadThemePreference,
  removeLegacyGradebook,
  saveThemePreference,
} from '../storage';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('theme preference storage', () => {
  it('is null until something is saved', async () => {
    await expect(loadThemePreference()).resolves.toBeNull();
  });

  it('round-trips a saved preference', async () => {
    await saveThemePreference('dark');
    await expect(loadThemePreference()).resolves.toBe('dark');
  });

  it('ignores unknown saved values', async () => {
    await AsyncStorage.setItem('settings.themePreference', 'purple');
    await expect(loadThemePreference()).resolves.toBeNull();
  });
});

describe('legacy JSON gradebook', () => {
  it('is removed', async () => {
    await AsyncStorage.setItem('gradebook.v1', '{"courses": []}');
    await removeLegacyGradebook();
    await expect(AsyncStorage.getItem('gradebook.v1')).resolves.toBeNull();
  });
});
