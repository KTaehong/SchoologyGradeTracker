import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#60646C',
    background: '#FFFFFF',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    accent: '#208AEF',
    onAccent: '#FFFFFF',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#B0B4BA',
    background: '#0B0B0C',
    backgroundElement: '#1C1D1F',
    backgroundSelected: '#2E3135',
    accent: '#4AA3FF',
    onAccent: '#0B0B0C',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColor = keyof typeof Colors.light;

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;

export const Radius = {
  small: 8,
  large: 16,
} as const;

// Room to leave under scrolling content so the native tab bar never covers it.
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
