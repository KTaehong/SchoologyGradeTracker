import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { canReadScreenshots, readScreenshotText } from '@/import/read-screenshot';
import { matchCategory, matchCourse, parseScreenshot, type ParsedRow } from '@/import/screenshot-parser';
import { Spacing } from '@/theme/colors';

type Reading =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'error'; message: string }
  | { status: 'done'; lines: string[] };

function scoreLabel(row: ParsedRow): string {
  if (row.status === 'graded') {
    return `${row.earned} / ${row.max}`;
  }
  const word = { missing: 'Missing', excused: 'Excused', ungraded: 'Not graded' }[row.status];
  return row.max === null ? word : `${word} (out of ${row.max})`;
}

/**
 * Screenshot import (F04), first step: pick or take a photo of a Schoology
 * grades page and see what the phone read from it. Saving the rows into a
 * class comes next (T2.2).
 */
export default function ImportScreenshotScreen() {
  const { state } = useGradebook();
  const [reading, setReading] = useState<Reading>({ status: 'idle' });
  const [showText, setShowText] = useState(false);

  if (!canReadScreenshots()) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState
            title="Not available here"
            message="Reading screenshots needs the full app build. It does not work in Expo Go or on the web."
          />
        </ScrollView>
      </ThemedView>
    );
  }

  async function pick(camera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setReading({ status: 'error', message: 'Allow camera access in Settings to take a photo.' });
        return;
      }
    }
    const picked = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) {
      return;
    }
    setReading({ status: 'reading' });
    try {
      setReading({ status: 'done', lines: await readScreenshotText(picked.assets[0].uri) });
    } catch (e) {
      setReading({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const courses = state.status === 'ready' ? state.courses : [];
  const parsed = reading.status === 'done' ? parseScreenshot(reading.lines) : null;
  const course = reading.status === 'done' ? matchCourse(reading.lines, courses) : null;
  const categories = course?.periods.flatMap((p) => p.categories) ?? [];

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText themeColor="textSecondary">
          Open your class in Schoology, go to Grades, and take a screenshot. The picture is read on
          this phone and never uploaded.
        </ThemedText>
        <Button
          label="Pick a screenshot"
          variant="primary"
          disabled={reading.status === 'reading'}
          onPress={() => pick(false)}
        />
        <Button label="Take a photo" disabled={reading.status === 'reading'} onPress={() => pick(true)} />

        {reading.status === 'reading' ? <ThemedText>Reading the picture…</ThemedText> : null}
        {reading.status === 'error' ? <ThemedText themeColor="danger">{reading.message}</ThemedText> : null}

        {parsed ? (
          <>
            <Section title="Class">
              <Row
                label={course ? course.name : 'Not found'}
                detail={
                  course
                    ? 'Matched from the class name on the screenshot.'
                    : 'The class name was not in the picture. You will pick the class before saving.'
                }
              />
            </Section>

            {parsed.rows.length === 0 ? (
              <EmptyState
                title="No grades found"
                message="Try a screenshot of the Grades page with the scores showing."
              />
            ) : (
              <Section
                title={`${parsed.rows.length} assignments`}
                footer={
                  parsed.needsReview
                    ? 'Some names and scores did not line up. Check them before saving.'
                    : undefined
                }>
                {parsed.rows.map((row, i) => {
                  const category = matchCategory(row.category, categories);
                  const where = category?.name ?? row.category ?? 'No category';
                  return (
                    <Row
                      key={`${i}-${row.title}`}
                      label={row.title}
                      detail={`${scoreLabel(row)} · ${where}${row.dueDate ? ` · due ${row.dueDate}` : ''}`}
                    />
                  );
                })}
              </Section>
            )}

            {parsed.leftoverTitles.length + parsed.leftoverScores.length > 0 ? (
              <Section title="Did not line up">
                {parsed.leftoverTitles.map((t, i) => (
                  <Row key={`t${i}`} label={t} detail="Name with no score" />
                ))}
                {parsed.leftoverScores.map((s, i) => (
                  <Row key={`s${i}`} label={s} detail="Score with no name" />
                ))}
              </Section>
            ) : null}

            <Button
              label={showText ? 'Hide the text the phone read' : 'Show the text the phone read'}
              onPress={() => setShowText(!showText)}
            />
            {showText && reading.status === 'done' ? (
              <ThemedText type="small" selectable style={styles.raw}>
                {reading.lines.join('\n')}
              </ThemedText>
            ) : null}
          </>
        ) : null}
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
  raw: {
    fontFamily: 'monospace',
  },
});
