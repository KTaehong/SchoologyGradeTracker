import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSession } from '@/api';
import { Loading } from '@/components/loading';
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
  // The app is only for a signed-in student. Signed out, the router shows the
  // sign-in screen instead. The session stays on the phone, so a signed-in
  // student gets straight to their grades, also with no internet.
  const session = useSession();
  const signedIn = session.status === 'signed_in';

  // Reading the saved session takes a moment. Wait, so a link into the app is
  // not sent to the sign-in screen.
  if (session.status === 'loading') {
    return <Loading />;
  }

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Solid headers: from SDK 58, iOS 26 headers are see-through and cover the top of the screen. */}
      <Stack screenOptions={{ headerTransparent: false }}>
        <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        <Stack.Screen name="new-password" options={{ title: 'Password', presentation: 'modal' }} />
        <Stack.Protected guard={signedIn} redirectTo="/sign-in">
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
          <Stack.Screen name="add" options={{ title: 'Add grades', presentation: 'modal' }} />
          <Stack.Screen name="import-screenshot" options={{ title: 'Scan a screenshot' }} />
          <Stack.Screen name="import-report" options={{ title: 'Import a saved report' }} />
          <Stack.Screen name="calendar-feed" options={{ title: 'Schoology calendar', presentation: 'modal' }} />
          <Stack.Screen name="forecast" options={{ title: 'Forecast', presentation: 'modal' }} />
          <Stack.Screen name="final-grade" options={{ title: 'Grade calculator', presentation: 'modal' }} />
          <Stack.Screen name="course-form" options={{ title: 'Class', presentation: 'modal' }} />
          <Stack.Screen name="category-form" options={{ title: 'Category', presentation: 'modal' }} />
          <Stack.Screen name="assignment-form" options={{ title: 'Assignment', presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
