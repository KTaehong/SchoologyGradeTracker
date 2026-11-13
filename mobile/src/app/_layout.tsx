import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSession } from '@/api';
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
  // The app is only for a signed-in student. Signed out (at every launch, and
  // after Sign out) the router shows the sign-in screen instead.
  const signedIn = useSession().status === 'signed_in';

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="new-password" options={{ title: 'Password', presentation: 'modal' }} />
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
          <Stack.Screen name="add" options={{ title: 'Add grades', presentation: 'modal' }} />
          <Stack.Screen name="import-screenshot" options={{ title: 'Scan a screenshot' }} />
          <Stack.Screen name="import-report" options={{ title: 'Import a saved report' }} />
          <Stack.Screen name="calendar-feed" options={{ title: 'Schoology calendar', presentation: 'modal' }} />
          <Stack.Screen name="forecast" options={{ title: 'Forecast', presentation: 'modal' }} />
          <Stack.Screen name="course-form" options={{ title: 'Class', presentation: 'modal' }} />
          <Stack.Screen name="category-form" options={{ title: 'Category', presentation: 'modal' }} />
          <Stack.Screen name="assignment-form" options={{ title: 'Assignment', presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
