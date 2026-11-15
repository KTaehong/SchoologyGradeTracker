import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage, updatePassword, useSession } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { FormSheet } from '@/components/form-sheet';
import { KeepVisible } from '@/components/keyboard-scroll';
import { Loading } from '@/components/loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, TextField } from '@/components/ui';
import { showMessage } from '@/lib/coming-soon';
import { checkNewPassword } from '@/lib/password-form';
import { accountLabel } from '@/lib/sign-in-form';
import { Spacing } from '@/theme/colors';

/**
 * Choose a new password. Opened by the link in a "reset your password" email
 * (which signs the student in first) and from Settings → Change password.
 */
export default function NewPasswordScreen() {
  const session = useSession();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (session.status === 'loading') {
    return <Loading />;
  }
  if (session.status === 'signed_out') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.content}>
          <EmptyState
            title="Sign in first"
            message="To choose a new password, open the link from your email on this phone, or sign in."
          />
          <Button label="Close" onPress={leave} />
        </View>
      </ThemedView>
    );
  }

  const save = async () => {
    if (busy) return;
    const problem = checkNewPassword(password, again);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      leave();
      showMessage('Password changed', 'Use your new password the next time you sign in.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet>
      <ThemedText type="subtitle">Choose a new password</ThemedText>
      <ThemedText themeColor="textSecondary">
        For {accountLabel(session.session.user)}. Your grades are not changed.
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
        label="New password again"
        value={again}
        onChangeText={setAgain}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={save}
      />
      <KeepVisible>
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
      </KeepVisible>
    </FormSheet>
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
});
