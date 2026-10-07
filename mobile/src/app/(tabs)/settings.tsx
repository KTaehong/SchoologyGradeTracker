import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { isApiConfigured, useSession } from '@/api';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Row, Section } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { comingSoon, confirmAction } from '@/lib/coming-soon';
import { syncLabel } from '@/lib/sync-label';
import { Radius, Spacing } from '@/theme/colors';
import { type ThemePreference, useTheme, useThemePreference } from '@/theme/theme-preference';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { loadSample, eraseAll, sync } = useGradebook();

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
        title="Account & sync"
        footer="Signed in, your grades sync to your other devices and are kept if you reinstall. Signed out, they stay on this phone only.">
        <AccountRows />
      </Section>

      <Section title="Data" footer="Your grades are saved on this phone and work without internet.">
        <Row label="Add sample grades" detail="Five example courses to explore." onPress={loadSample} />
        <Row
          label="Erase all data"
          destructive
          onPress={() =>
            confirmAction(
              'Erase all data?',
              sync
                ? 'This removes every course and assignment from your account, on every device.'
                : 'This removes every course and assignment from this phone.',
              'Erase',
              eraseAll,
            )
          }
        />
      </Section>

      <Section title="About">
        <Row label="Show welcome screen" onPress={() => router.push('/welcome')} />
        <Row label="Privacy" onPress={() => comingSoon('The privacy page')} />
        <Row label="Version" right={<ThemedText themeColor="textSecondary">{appVersion()}</ThemedText>} />
      </Section>
    </Screen>
  );
}

function AccountRows() {
  const session = useSession();
  const { sync, online, syncNow, signOut } = useGradebook();

  if (!isApiConfigured()) {
    return <Row label="Account" detail="Not available in this version of the app." />;
  }
  if (session.status === 'loading') {
    return <Row label="Account" detail="Checking…" />;
  }
  if (session.status === 'signed_in') {
    const user = session.session.user;
    return (
      <>
        <Row label="Signed in" detail={user.email ?? user.phone ?? 'Account'} />
        <Row label="Sync now" detail={syncLabel(sync, online)} onPress={syncNow} />
        <Row
          label="Sign out"
          destructive
          onPress={() =>
            confirmAction(
              'Sign out?',
              sync && sync.pending > 0
                ? `${sync.pending} ${sync.pending === 1 ? 'change has' : 'changes have'} not reached the cloud yet. Signing out tries once more, then removes this phone's copy — unsent changes would be lost.`
                : "Your account keeps its grades and forecasts. This phone's copy is removed until you sign in again.",
              'Sign out',
              signOut,
            )
          }
        />
      </>
    );
  }
  return (
    <>
      <Row
        label="Create account"
        onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'sign-up' } })}
      />
      <Row label="Sign in" onPress={() => router.push('/sign-in')} />
    </>
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
