import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { KeyboardScroll } from '@/components/keyboard-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/theme/colors';

/**
 * The scrolling page of a form sheet, kept clear of the keyboard. Wrap the
 * form's main button in `KeepVisible` to keep it above the keyboard.
 */
export function FormSheet({ children }: { children: ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <KeyboardScroll contentContainerStyle={styles.content}>{children}</KeyboardScroll>
    </ThemedView>
  );
}

/** A small grey label above a control that is not a text field. */
export function FieldLabel({ children }: { children: string }) {
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
}

/** The form's error message, when there is one. */
export function FormError({ error }: { error: string | null }) {
  return error ? <ThemedText themeColor="danger">{error}</ThemedText> : null;
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
