import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { errorMessage, updatePassword, useSession } from '@/api';
import { Loading } from '@/components/loading';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, TextField } from '@/components/ui';
import { showMessage } from '@/lib/coming-soon';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/password-rules';
import { Spacing } from '@/theme/colors';

/**
 * Choose a new password: after tapping a reset link (`mode=reset`), or from
 * Settings → Change password / Set a password.
 */
export default function PasswordScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const resetting = params.mode === 'reset';
  const session = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'loading') {
    return <Loading />;
  }
  if (session.status === 'signed_out') {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState
            title="Sign in first"
            message="Use the link in your email again, or ask for a new one from the sign-in screen."
          />
          <Button label="Go to sign in" variant="primary" onPress={() => router.replace('/sign-in')} />
        </ScrollView>
      </ThemedView>
    );
  }

  const save = async () => {
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      showMessage('Password saved', 'Use your new password the next time you sign in.');
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">{resetting ? 'Choose a new password' : 'Change password'}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {session.session.user.email ? `For ${session.session.user.email}. ` : ''}At least{' '}
            {MIN_PASSWORD_LENGTH} characters, with a letter and a number.
          </ThemedText>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Type it again"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={save}
          />
          {error ? (
            <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
              {error}
            </ThemedText>
          ) : null}
          <Button
            label={busy ? 'Please wait…' : 'Save password'}
            variant="primary"
            disabled={busy}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
});
