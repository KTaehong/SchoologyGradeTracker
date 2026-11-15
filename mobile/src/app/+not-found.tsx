import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/theme/colors';

/** A link that leads nowhere (an old or mistyped one): offer the way back. */
export default function NotFoundScreen() {
  // Signed out, Home is closed: the way back is the sign-in screen.
  const signedIn = useSession().status === 'signed_in';
  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <EmptyState title="Page not found" message="That link does not open anything in the app." />
        <Button
          label={signedIn ? 'Go to Home' : 'Go to sign in'}
          variant="primary"
          onPress={() => router.replace(signedIn ? '/' : '/sign-in')}
        />
      </View>
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
});
