import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Section } from '@/components/ui';
import { Spacing } from '@/theme/colors';

/**
 * The privacy policy, in the app. Keep it true to what the code does — and in
 * step with docs/privacy-policy.md, which is the copy linked from the App Store.
 */
const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Without an account',
    body:
      'Your classes, grades and forecasts are saved only on this phone. Nothing is sent to us. ' +
      'Deleting the app deletes them.',
  },
  {
    title: 'With an account (optional)',
    body:
      'If you sign in, we keep your name, email address, username and gradebook (classes, ' +
      'categories, assignments, scores, forecasts and upcoming work) on our server (Supabase), so ' +
      'they sync to your other devices. Each account can only read its own data.',
  },
  {
    title: 'Screenshots and saved reports',
    body:
      'Screenshots and saved Schoology pages are read on this phone. The pictures and files are ' +
      'never uploaded; only the grades you choose to save are kept.',
  },
  {
    title: 'Schoology calendar link',
    body:
      'Your calendar link works like a password. It is kept in this phone’s secure storage and is ' +
      'only ever sent to Schoology, to read your calendar. It is not stored on our server.',
  },
  {
    title: 'What we never do',
    body:
      'We never ask for your Schoology password. There are no ads, no tracking, and no analytics, ' +
      'and we never sell or share your data.',
  },
  {
    title: 'Deleting your data',
    body:
      'Settings → Erase all data removes your grades. Signed in, Settings → Delete account ' +
      'permanently deletes your account and everything in it, on every device. If you cannot ' +
      'open the app, email us from your account’s address and we will delete it for you.',
  },
  {
    title: 'Contact',
    body: 'Questions or requests about your data: thkim9989@gmail.com',
  },
];

export default function PrivacyScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {SECTIONS.map((section) => (
          <Section key={section.title} title={section.title}>
            <ThemedText style={styles.body}>{section.body}</ThemedText>
          </Section>
        ))}
      </ScrollView>
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
  body: {
    padding: Spacing.three,
  },
});
