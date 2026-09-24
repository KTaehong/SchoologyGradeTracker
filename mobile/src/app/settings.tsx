import { Pressable, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    </Screen>
  );
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
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
});
