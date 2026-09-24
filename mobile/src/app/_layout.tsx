import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import AppTabs from '@/components/app-tabs';
import { GradebookProvider } from '@/data/gradebook-store';
import { ThemePreferenceProvider, useResolvedColorScheme } from '@/theme/theme-preference';

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <GradebookProvider>
        <ThemedNavigation />
      </GradebookProvider>
    </ThemePreferenceProvider>
  );
}

function ThemedNavigation() {
  const scheme = useResolvedColorScheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AppTabs />
    </ThemeProvider>
  );
}
