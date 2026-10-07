import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/theme/colors';
import { useTheme } from '@/theme/theme-preference';

type ScreenProps = {
  title: string;
  /** Optional control shown to the right of the title, such as an Add button. */
  action?: ReactNode;
  /** Pull down to run this (for example, sync now). */
  onRefresh?: () => Promise<void>;
  children: ReactNode;
};

/** Shared frame for every tab: safe-area padding, a large title, and scrolling content. */
export function Screen({ title, action, onRefresh, children }: ScreenProps) {
  const colors = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
            ) : undefined
          }>
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
