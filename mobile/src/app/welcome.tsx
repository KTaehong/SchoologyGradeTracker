import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage, isApiConfigured, signInWithProvider, useSession, type OAuthProvider } from '@/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { markWelcomeSeen } from '@/data/storage';
import { signInProviders } from '@/lib/sign-in-providers';
import { Radius, Spacing } from '@/theme/colors';

const POINTS: { title: string; body: string }[] = [
  { title: 'Every grade at a glance', body: 'Your classes, letters, and percents — computed right on your phone.' },
  { title: 'See where you are heading', body: 'Forecast upcoming tests and watch your projected grade change.' },
  {
    title: 'Works offline',
    body: 'No internet? No problem. Sign in to sync your grades to your other devices.',
  },
];

/** First run (F01): what the app does, then sign in or carry on without an account. */
export default function WelcomeScreen() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = session.status === 'signed_in';
  const cloud = isApiConfigured() && !signedIn;

  // Signing in here (or on the email screen opened from here) goes straight to Home.
  const wasSignedOut = useRef(false);
  useEffect(() => {
    if (session.status === 'signed_out') {
      wasSignedOut.current = true;
    } else if (session.status === 'signed_in' && wasSignedOut.current) {
      markWelcomeSeen().finally(() => router.replace('/'));
    }
  }, [session.status]);

  const continueWith = async (provider: OAuthProvider) => {
    setBusy(true);
    setError(null);
    try {
      await signInWithProvider(provider);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    await markWelcomeSeen();
    router.replace('/');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <ThemedText type="title" accessibilityRole="header">
              Schoology Grade Tracker
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Know your grades, and what you need on the next test. Your Schoology password is never
              needed.
            </ThemedText>
          </View>

          {POINTS.map((point) => (
            <ThemedView key={point.title} type="backgroundElement" style={styles.point}>
              <ThemedText type="subtitle">{point.title}</ThemedText>
              <ThemedText themeColor="textSecondary">{point.body}</ThemedText>
            </ThemedView>
          ))}

          <View style={styles.actions}>
            {cloud ? (
              <>
                {signInProviders(Platform.OS).map(({ provider, label }) => (
                  <Button
                    key={provider}
                    label={label}
                    variant="primary"
                    disabled={busy}
                    onPress={() => continueWith(provider)}
                  />
                ))}
                <Button label="Sign in with email" disabled={busy} onPress={() => router.push('/sign-in')} />
              </>
            ) : null}
            {error ? (
              <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
            ) : null}
            <Button
              label={signedIn ? 'Continue' : cloud ? 'Use without an account' : 'Get started'}
              variant={cloud ? 'secondary' : 'primary'}
              disabled={busy}
              onPress={skip}
            />
            {cloud ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                Without an account, your grades stay on this phone. You can sign in later in Settings.
              </ThemedText>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  hero: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  point: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
  actions: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  note: {
    textAlign: 'center',
  },
});
