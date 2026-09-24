import Constants from 'expo-constants';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Row, Section, SwitchRow } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { comingSoon, confirmAction } from '@/lib/coming-soon';
import { Radius, Spacing } from '@/theme/colors';
import { type ThemePreference, useTheme, useThemePreference } from '@/theme/theme-preference';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { loadDemo, eraseAll } = useGradebook();

  return (
    <Screen title="Settings">
      <Section title="Appearance">
        <ThemePicker />
      </Section>

      <Section
        title="Schoology"
        footer="Your calendar link works like a password. It stays on this phone.">
        <Row
          label="Calendar feed"
          detail="Not connected"
          onPress={() => comingSoon('Connecting your Schoology calendar')}
        />
      </Section>

      <Section
        title="Cloud sync (beta)"
        footer="Off by default. Sync keeps your grades when you reinstall and brings them to your other devices.">
        <SwitchRow
          label="Sync this phone"
          value={false}
          onValueChange={() => comingSoon('Cloud sync')}
        />
        <Row label="Create account" onPress={() => comingSoon('Creating an account')} />
        <Row label="Sign in" onPress={() => comingSoon('Signing in')} />
      </Section>

      <Section title="Data" footer="Your grades are saved on this phone and work without internet.">
        <Row
          label="Load demo grades"
          onPress={() =>
            confirmAction(
              'Load demo grades?',
              'This replaces everything in the app with sample courses and assignments.',
              'Load demo',
              loadDemo,
            )
          }
        />
        <Row
          label="Erase all data"
          destructive
          onPress={() =>
            confirmAction(
              'Erase all data?',
              'This removes every course and assignment from this phone.',
              'Erase',
              eraseAll,
            )
          }
        />
      </Section>

      <Section title="About">
        <Row label="Show welcome screen" onPress={() => comingSoon('The welcome screen')} />
        <Row label="Privacy" onPress={() => comingSoon('The privacy page')} />
        <Row label="Version" right={<ThemedText themeColor="textSecondary">{appVersion()}</ThemedText>} />
      </Section>
    </Screen>
  );
}

function ThemePicker() {
  const { preference, setPreference } = useThemePreference();
  const colors = useTheme();

  return (
    <View style={styles.options} accessibilityRole="radiogroup">
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
    </View>
  );
}

function appVersion() {
  return Constants.expoConfig?.version ?? '—';
}

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
  },
});
