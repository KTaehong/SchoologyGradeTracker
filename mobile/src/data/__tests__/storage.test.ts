import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  hasSeenWelcome,
  loadThemePreference,
  markWelcomeSeen,
  readLegacyGradebook,
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

describe('welcome screen flag', () => {
  it('is unseen until marked', async () => {
    await expect(hasSeenWelcome()).resolves.toBe(false);
    await markWelcomeSeen();
    await expect(hasSeenWelcome()).resolves.toBe(true);
  });
});

describe('legacy JSON gradebook', () => {
  it('is missing on a new install', async () => {
    await expect(readLegacyGradebook()).resolves.toBe('missing');
  });

  it('remembers that the student had erased everything', async () => {
    await AsyncStorage.setItem('gradebook.v1', JSON.stringify({ schemaVersion: 1, courses: [], upcoming: [] }));
    await expect(readLegacyGradebook()).resolves.toBe('empty');
  });

  it('treats any other save (including damaged JSON) as present, then removes it', async () => {
    await AsyncStorage.setItem('gradebook.v1', '{not json');
    await expect(readLegacyGradebook()).resolves.toBe('present');
    await removeLegacyGradebook();
    await expect(readLegacyGradebook()).resolves.toBe('missing');
  });
});
