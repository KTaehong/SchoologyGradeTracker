import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  errorMessage,
  isApiConfigured,
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
  type OAuthProvider,
} from '@/api';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, TextField } from '@/components/ui';
import { Spacing } from '@/theme/colors';

const PROVIDERS: { provider: OAuthProvider; label: string }[] = [
  { provider: 'apple', label: 'Continue with Apple' },
  { provider: 'google', label: 'Continue with Google' },
  { provider: 'azure', label: 'Continue with Microsoft' },
];

/** Sign in or create an account for cloud sync (F14). Opened from Settings. */
export default function SignInScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(
    params.mode === 'sign-up' ? 'sign-up' : 'sign-in',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isApiConfigured()) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <EmptyState
            title="Cloud sync is not set up"
            message="This version of the app has no server settings. Your grades still work on this phone."
          />
        </View>
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
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (!email.trim() || !password) {
        throw new Error('Enter your email and password.');
      }
      if (!signingUp) {
        await signInWithEmail(email.trim(), password);
        router.back();
        return;
      }
      if (!fullName.trim()) {
        throw new Error('Enter your name.');
      }
      if (password.length < 6) {
        throw new Error('Use a password with at least 6 characters.');
      }
      const session = await signUpWithEmail({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        username: username.trim().toLowerCase() || undefined,
      });
      if (session) {
        router.back();
      } else {
        setMode('sign-in');
        setNotice('Check your email and tap the link to confirm your account, then sign in here.');
      }
    });

  const continueWith = (provider: OAuthProvider) =>
    run(async () => {
      const session = await signInWithProvider(provider);
      if (session) {
        router.back();
      }
    });

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">{signingUp ? 'Create an account' : 'Sign in'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            An account keeps your grades and forecasts in the cloud. Your Schoology password is
            never needed.
          </ThemedText>

          {PROVIDERS.map(({ provider, label }) => (
            <Button
              key={provider}
              label={label}
              disabled={busy}
              onPress={() => continueWith(provider)}
            />
          ))}

          <ThemedText type="small" themeColor="textSecondary" style={styles.or}>
            or use your email
          </ThemedText>

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
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
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
          <Button
            label={signingUp ? 'I already have an account' : 'Create an account instead'}
            disabled={busy}
            onPress={() => {
              setMode(signingUp ? 'sign-in' : 'sign-up');
              setError(null);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  or: {
    textAlign: 'center',
  },
});
