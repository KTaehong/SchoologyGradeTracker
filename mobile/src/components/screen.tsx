import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/theme/colors';

type ScreenProps = {
  title: string;
  /** Optional control shown to the right of the title, such as an Add button. */
  action?: ReactNode;
  children: ReactNode;
};

/** Shared frame for every tab: safe-area padding, a large title, and scrolling content. */
export function Screen({ title, action, children }: ScreenProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="title" accessibilityRole="header" style={styles.title}>
              {title}
            </ThemedText>
            {action}
          </View>
          {children}
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
  },
});
