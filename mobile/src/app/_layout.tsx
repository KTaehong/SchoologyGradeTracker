import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
        <Stack.Screen name="add" options={{ title: 'Add grades', presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
