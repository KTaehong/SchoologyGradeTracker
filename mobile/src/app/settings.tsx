import { Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGradebook } from '@/data/gradebook-store';
import { Radius, Spacing } from '@/theme/colors';
import { type ThemePreference, useTheme, useThemePreference } from '@/theme/theme-preference';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { preference, setPreference } = useThemePreference();
  const colors = useTheme();
  const { loadDemo, eraseAll } = useGradebook();

  return (
    <Screen title="Settings">
      <ThemedView type="backgroundElement" style={styles.section}>
        <ThemedText type="subtitle">Appearance</ThemedText>
        <ThemedView type="backgroundElement" style={styles.options} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setPreference(option.value)}
                style={[
                  styles.option,
                  { backgroundColor: selected ? colors.accent : colors.backgroundSelected },
                ]}>
                <ThemedText style={{ color: selected ? colors.onAccent : colors.text }}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.section}>
        <ThemedText type="subtitle">Data</ThemedText>
        <ThemedText themeColor="textSecondary">
          Your grades are saved on this phone and work without internet.
        </ThemedText>
        <ActionButton
          label="Load demo grades"
          onPress={() =>
            confirm(
              'Load demo grades?',
              'This replaces everything in the app with sample courses and assignments.',
              'Load demo',
              loadDemo,
            )
          }
        />
        <ActionButton
          label="Erase all data"
          destructive
          onPress={() =>
            confirm(
              'Erase all data?',
              'This removes every course and assignment from this phone.',
              'Erase',
              eraseAll,
            )
          }
        />
      </ThemedView>
    </Screen>
  );
}

function ActionButton({
  label,
  destructive = false,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, { backgroundColor: colors.backgroundSelected }]}>
      <ThemedText style={{ color: destructive ? colors.danger : colors.text }}>{label}</ThemedText>
    </Pressable>
  );
}

/** Asks before replacing or erasing data. */
function confirm(title: string, message: string, actionLabel: string, action: () => Promise<void>) {
  if (Platform.OS === 'web') {
    // Alert buttons are not supported on web.
    if (window.confirm(`${title}\n\n${message}`)) {
      action().catch(() => undefined);
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: () => action().catch(() => undefined) },
  ]);
}

const styles = StyleSheet.create({
  section: {
    padding: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.three,
  },
  options: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.small,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
});
