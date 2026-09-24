import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Row, Section } from '@/components/ui';
import { comingSoon } from '@/lib/coming-soon';
import { Spacing } from '@/theme/colors';

/** The three ways to get grades into the app. */
export default function AddGradesScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          No password or login needed — your grades stay on this phone.
        </ThemedText>

        <Section title="Import">
          <Row
            label="Scan a screenshot"
            detail="Take or pick a photo of your Schoology grades page."
            onPress={() => comingSoon('Screenshot import')}
          />
          <Row
            label="Import a saved report"
            detail="Open a Schoology Grades page you saved as a file."
            onPress={() => comingSoon('Saved-report import')}
          />
        </Section>

        <Section title="By hand">
          <Row
            label="Add a class"
            detail="Create a class and type in its categories and assignments."
            onPress={() => comingSoon('Adding a class by hand')}
          />
        </Section>
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
    gap: Spacing.four,
  },
});
