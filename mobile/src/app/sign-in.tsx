import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isApiConfigured,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
  useSession,
  type OAuthProvider,
} from '@/api';
import { AppleSignInButton } from '@/components/apple-sign-in-button';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, TextField } from '@/components/ui';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-form';
import { isUsername, signInErrorMessage, toSignInEmail } from '@/lib/sign-in-form';
import { signInProviders } from '@/lib/sign-in-providers';
import { Spacing } from '@/theme/colors';

/**
 * The first screen: the app cannot be used until someone signs in. Demo
 * accounts sign in with a username; accounts made here sign in with an email.
 */
export default function SignInScreen() {
  const session = useSession();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Signed in (here, with Google or Apple, or from an emailed link): open the app.
  const signedIn = session.status === 'signed_in';
  useEffect(() => {
    if (signedIn) {
      router.replace('/');
    }
  }, [signedIn]);

  if (!isApiConfigured()) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <EmptyState
            title="Cloud sync is not set up"
            message="This version of the app has no server settings, so nobody can sign in."
          />
        </View>
      </ThemedView>
    );
  }
  if (session.status !== 'signed_out') {
    return (
      <ThemedView style={styles.container}>
        <Loading />
      </ThemedView>
    );
  }

  const signingUp = mode === 'sign-up';

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(signInErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (!email.trim() || !password) {
        throw new Error(
          signingUp ? 'Enter your email and a password.' : 'Enter your username and password.',
        );
      }
      if (!signingUp) {
        await signInWithEmail(toSignInEmail(email), password);
        return;
      }
      if (isUsername(email)) {
        throw new Error('Enter an email address, such as name@example.com.');
      }
      if (!fullName.trim()) {
        throw new Error('Enter your name.');
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      const created = await signUpWithEmail({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        username: username.trim().toLowerCase() || undefined,
      });
      if (!created) {
        setMode('sign-in');
        setPassword('');
        setNotice('Check your email and tap the link on this phone to confirm your account.');
      }
    });

  const forgotPassword = () =>
    run(async () => {
      if (isUsername(email)) {
        throw new Error('A password can only be reset for an account with an email address.');
      }
      if (!email.trim()) {
        throw new Error('Enter your email above first, then tap "Forgot password?" again.');
      }
      await requestPasswordReset(email.trim());
      setNotice(
        'If an account uses that email, a link to choose a new password is on its way. Open it on this phone.',
      );
    });

  const continueWith = (provider: OAuthProvider | 'apple-native') =>
    run(() => (provider === 'apple-native' ? signInWithApple() : signInWithProvider(provider)));

  const switchMode = () => {
    setMode(signingUp ? 'sign-in' : 'sign-up');
    setError(null);
    setNotice(null);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <ThemedText type="title" accessibilityRole="header">
                Schoology Grade Tracker
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {signingUp
                  ? 'Create an account to keep your grades and forecasts. Your Schoology password is never needed.'
                  : 'Sign in to see your grades. Your Schoology password is never needed.'}
              </ThemedText>
            </View>

            {signingUp ? (
              <>
                <TextField
                  label="Name"
                  value={fullName}
                  onChangeText={setFullName}
                  autoComplete="name"
                  textContentType="name"
                />
                <TextField
                  label="Username (optional)"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="letters, numbers, _ or ."
                />
              </>
            ) : null}
            <TextField
              label={signingUp ? 'Email' : 'Username or email'}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={signingUp ? 'email' : 'username'}
              keyboardType="email-address"
              textContentType={signingUp ? 'emailAddress' : 'username'}
            />
            <TextField
              label={signingUp ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : 'Password'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              textContentType={signingUp ? 'newPassword' : 'password'}
              onSubmitEditing={submit}
            />

            {error ? (
              <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
                {error}
              </ThemedText>
            ) : null}
            {notice ? <ThemedText accessibilityLiveRegion="polite">{notice}</ThemedText> : null}

            <Button
              label={busy ? 'Please wait…' : signingUp ? 'Create account' : 'Sign in'}
              variant="primary"
              disabled={busy}
              onPress={submit}
            />
            {signingUp ? null : (
              <Button label="Forgot password?" disabled={busy} onPress={forgotPassword} />
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.or}>
              or
            </ThemedText>

            <AppleSignInButton
              signUp={signingUp}
              disabled={busy}
              onPress={() => continueWith('apple-native')}
            />
            {signInProviders().map(({ provider, label }) => (
              <Button
                key={provider}
                label={label}
                disabled={busy}
                onPress={() => continueWith(provider)}
              />
            ))}
            <Button
              label={signingUp ? 'I already have an account' : 'Create an account'}
              disabled={busy}
              onPress={switchMode}
            />
            <Button label="Privacy" disabled={busy} onPress={() => router.push('/privacy')} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  or: {
    textAlign: 'center',
  },
});
