import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { loadThemePreference, saveThemePreference } from '@/data/storage';

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
  const choseThisSession = useRef(false);

  const applyPreference = useCallback((next: ThemePreference) => {
    // On iOS and Android, overriding the app-wide appearance also restyles
    // native UI such as the tab bar. Web has no such override.
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    }
    setPreferenceState(next);
  }, []);

  // Restore the choice saved on the phone.
  useEffect(() => {
    loadThemePreference()
      .then((saved) => {
        // Don't override a choice made while the saved one was still loading.
        if (saved && !choseThisSession.current) {
          applyPreference(saved);
        }
      })
      .catch(() => undefined);
  }, [applyPreference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      choseThisSession.current = true;
      applyPreference(next);
      saveThemePreference(next).catch(() => undefined);
    },
    [applyPreference],
  );

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
