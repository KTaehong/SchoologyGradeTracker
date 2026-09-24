import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDemoGradebook } from '../demo';
import {
  loadGradebook,
  loadThemePreference,
  saveGradebook,
  saveThemePreference,
} from '../storage';
import { createEmptyGradebook } from '../types';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('gradebook storage', () => {
  it('reports missing on first launch', async () => {
    await expect(loadGradebook()).resolves.toEqual({ kind: 'missing' });
  });

  it('round-trips a saved gradebook unchanged', async () => {
    const gradebook = createDemoGradebook(new Date(2026, 8, 24));
    await saveGradebook(gradebook);
    await expect(loadGradebook()).resolves.toEqual({ kind: 'loaded', gradebook });
  });

  it('keeps an erased (empty) gradebook as loaded, not missing', async () => {
    const empty = createEmptyGradebook(new Date(2026, 8, 24));
    await saveGradebook(empty);
    await expect(loadGradebook()).resolves.toEqual({ kind: 'loaded', gradebook: empty });
  });

  it('reports invalid for damaged JSON', async () => {
    await AsyncStorage.setItem('gradebook.v1', '{not json');
    await expect(loadGradebook()).resolves.toEqual({ kind: 'invalid' });
  });

  it('reports invalid for JSON of the wrong shape', async () => {
    await AsyncStorage.setItem('gradebook.v1', JSON.stringify({ schemaVersion: 99, courses: [] }));
    await expect(loadGradebook()).resolves.toEqual({ kind: 'invalid' });
  });
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
