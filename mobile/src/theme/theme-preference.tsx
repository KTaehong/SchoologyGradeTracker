import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { Colors, type ColorScheme } from './colors';

/** What the student picked in Settings. `system` follows the phone's setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  const setPreference = useCallback((next: ThemePreference) => {
    // On iOS and Android, overriding the app-wide appearance also restyles
    // native UI such as the tab bar. Web has no such override.
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    }
    setPreferenceState(next);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  }
  return context;
}

/** The color scheme currently on screen (never `unspecified`). */
export function useResolvedColorScheme(): ColorScheme {
  const systemScheme = useColorScheme();
  const { preference } = useThemePreference();
  if (preference !== 'system') {
    return preference;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/** The color palette for the color scheme currently on screen. */
export function useTheme() {
  return Colors[useResolvedColorScheme()];
}
