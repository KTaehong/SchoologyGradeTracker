import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/theme/theme-preference';

export function Loading() {
  const colors = useTheme();
  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator color={colors.accent} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 48,
    alignItems: 'center',
  },
});
