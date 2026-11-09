import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { completeEmailLink, errorMessage, isApiConfigured, isProviderSignInRunning } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { markWelcomeSeen } from '@/data/storage';
import { Spacing } from '@/theme/colors';

function leave() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

/**
 * Where sign-in links come back to the app (`gradetracker://auth/callback`):
 *
 * - Google / Apple / Microsoft: signInWithProvider reads the link itself, so
 *   this screen just closes.
 * - The links in Supabase's emails (confirm your account, reset your
 *   password): this screen swaps the link's code for a session. A reset link
 *   then asks for the new password.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [exchangeProblem, setExchangeProblem] = useState<string | null>(null);
  const linkError = params.error_description || params.error;
  const problem = linkError
    ? /expired|invalid/i.test(linkError)
      ? 'This link has expired or was already used. Ask for a new one from the sign-in screen.'
      : linkError
    : exchangeProblem;

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();

    if (linkError) {
      return;
    }
    if (!params.code || isProviderSignInRunning() || !isApiConfigured()) {
      leave();
      return;
    }

    let cancelled = false;
    completeEmailLink(params.code)
      .then(async ({ recovery }) => {
        await markWelcomeSeen();
        if (cancelled) return;
        if (recovery) {
          router.replace({ pathname: '/password', params: { mode: 'reset' } });
        } else {
          router.replace('/');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setExchangeProblem(
            `${errorMessage(e)}\n\nOpen the link on the same phone where you asked for it, or ask for a new one.`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.code, linkError]);

  if (!problem) {
    return <Loading />;
  }
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <EmptyState title="Could not sign you in" message={problem} />
        <Button label="Go to sign in" variant="primary" onPress={() => router.replace('/sign-in')} />
        <Button label="Close" onPress={() => router.replace('/')} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
