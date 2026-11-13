import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { canReadScreenshots, readScreenshotText } from '@/import/read-screenshot';
import { matchCategory, matchCourse, parseScreenshot, type ParsedRow } from '@/import/screenshot-parser';
import { formatDueDate } from '@/lib/due-date';
import { planScreenshotRows } from '@/lib/screenshot-plan';
import { useSave } from '@/lib/use-save';
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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Screenshot import (F04): pick or take a photo of a Schoology grades page,
 * check what the phone read from it, choose the class and grading period, and
 * save the rows. Each row goes to the category named by its heading, or to
 * one the student picks.
 */
export default function ImportScreenshotScreen() {
  const { state, importScreenshot } = useGradebook();
  const [reading, setReading] = useState<Reading>({ status: 'idle' });
  const [showText, setShowText] = useState(false);
  /** The student's choices; `undefined` = use the automatic guess. */
  const [pickedCourseId, setPickedCourseId] = useState<string | undefined>();
  const [pickedPeriod, setPickedPeriod] = useState<number | undefined>();
  const [fallbackId, setFallbackId] = useState<string | null>(null);
  const { busy, error, save } = useSave();

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
    let picked: ImagePicker.ImagePickerResult;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setReading({ status: 'error', message: 'Allow camera access in Settings to take a photo.' });
          return;
        }
      }
      // The camera throws on a device without one (such as the iOS Simulator).
      picked = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    } catch (e) {
      setReading({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (picked.canceled || !picked.assets[0]) {
      return;
    }
    setReading({ status: 'reading' });
    setPickedCourseId(undefined);
    setPickedPeriod(undefined);
    setFallbackId(null);
    try {
      setReading({ status: 'done', lines: await readScreenshotText(picked.assets[0].uri) });
    } catch (e) {
      setReading({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const courses = state.status === 'ready' ? state.courses : [];
  const parsed = reading.status === 'done' ? parseScreenshot(reading.lines) : null;
  const guessed = reading.status === 'done' ? matchCourse(reading.lines, courses) : null;
  const course = courses.find((c) => c.id === (pickedCourseId ?? guessed?.id)) ?? null;
  const periods = course?.periods ?? [];
  // By default, the period whose categories match the most headings on the picture.
  const headings = parsed?.rows.map((r) => r.category) ?? [];
  const bestPeriod = periods.reduce(
    (best, p, i) => {
      const hits = headings.filter((h) => matchCategory(h, p.categories)).length;
      return hits > best.hits ? { index: i, hits } : best;
    },
    { index: 0, hits: 0 },
  ).index;
  const periodIndex = Math.min(pickedPeriod ?? bestPeriod, Math.max(periods.length - 1, 0));
  const categories = periods[periodIndex]?.categories ?? [];
  const plan = parsed ? planScreenshotRows(parsed.rows, categories, fallbackId) : null;

  const submit = () => {
    if (!plan || !course) return;
    save(
      () => importScreenshot(plan.save),
      () => router.replace({ pathname: '/course/[id]', params: { id: course.id } }),
    );
  };

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
            <Section
              title="Class"
              footer={
                guessed
                  ? 'Matched from the class name on the screenshot. Tap another to change it.'
                  : courses.length > 0
                    ? 'The class name was not in the picture. Pick the class.'
                    : undefined
              }>
              {courses.length === 0 ? (
                <Row
                  label="No classes yet"
                  detail="Add the class first (Add grades → Add a class), then scan again."
                />
              ) : (
                courses.map((c) => (
                  <Row
                    key={c.id}
                    label={c.name}
                    right={c.id === course?.id ? <ThemedText themeColor="accent">✓</ThemedText> : undefined}
                    onPress={() => {
                      setPickedCourseId(c.id);
                      setPickedPeriod(undefined);
                      setFallbackId(null);
                    }}
                  />
                ))
              )}
            </Section>

            {course && periods.length > 1 ? (
              <PeriodPicker
                names={periods.map((p) => p.name)}
                selected={periodIndex}
                onSelect={(i) => {
                  setPickedPeriod(i);
                  setFallbackId(null);
                }}
              />
            ) : null}

            {course && plan && plan.unmatched > 0 ? (
              <Section
                title="Category for rows without a heading"
                footer={
                  categories.length === 0
                    ? 'This grading period has no categories yet. Add one on the class page first.'
                    : 'The heading above these rows was cut off or did not match a category.'
                }>
                {categories.map((k) => (
                  <Row
                    key={k.id}
                    label={k.name}
                    right={k.id === fallbackId ? <ThemedText themeColor="accent">✓</ThemedText> : undefined}
                    onPress={() => setFallbackId(k.id)}
                  />
                ))}
              </Section>
            ) : null}

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
                {(plan?.rows ?? []).map(({ row, category, skip }, i) => {
                  const where = !course
                    ? (row.category ?? 'No category')
                    : (skip ?? category?.name ?? 'No category');
                  return (
                    <Row
                      key={`${i}-${row.title}`}
                      label={row.title}
                      detail={`${scoreLabel(row)} · ${where}${row.dueDate ? ` · due ${formatDueDate(row.dueDate)}` : ''}`}
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

            {course && plan && plan.save.length > 0 ? (
              <>
                {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
                <Button
                  label={busy ? 'Saving…' : `Save ${plural(plan.save.length, 'assignment')} to ${course.name}`}
                  variant="primary"
                  disabled={busy}
                  onPress={submit}
                />
                <ThemedText type="small" themeColor="textSecondary">
                  {plan.save.length < plan.rows.length
                    ? `${plural(plan.rows.length - plan.save.length, 'row')} will be skipped (see above). `
                    : ''}
                  Assignments already in the category are updated, not added twice.
                </ThemedText>
              </>
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
