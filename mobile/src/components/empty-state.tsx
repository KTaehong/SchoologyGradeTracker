import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/colors';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{message}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.two,
  },
});
