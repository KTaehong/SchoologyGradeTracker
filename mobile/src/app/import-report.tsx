import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section, SwitchRow } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { computeCourseGrades } from '@/engine/grade-engine';
import type { GradeCourse } from '@/engine/types';
import { findSameNamedCourses, looksLikeHtml, parseReport } from '@/import/report-parser';
import { formatGrade } from '@/lib/format-grade';
import { useSave } from '@/lib/use-save';
import { Spacing } from '@/theme/colors';

type Picked =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'error'; message: string }
  | { status: 'done'; fileName: string; courses: GradeCourse[]; assignmentCount: number };

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    return asset.file ? asset.file.text() : (await fetch(asset.uri)).text();
  }
  return new File(asset.uri).text();
}

function countOf(course: GradeCourse) {
  const categories = course.periods.flatMap((p) => p.categories);
  return {
    periods: course.periods.length,
    categories: categories.length,
    assignments: categories.reduce((n, k) => n + k.assignments.length, 0),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Saved-report import (F05): pick a Schoology Grades page saved as a file, see
 * what was read, and add it to the gradebook.
 */
export default function ImportReportScreen() {
  const { state, importReport } = useGradebook();
  const [picked, setPicked] = useState<Picked>({ status: 'idle' });
  const [replace, setReplace] = useState(true);
  const { busy, error, save } = useSave();

  async function pick() {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        // Saved pages are often typed oddly (.htm, .html, or no type at all), so
        // accept anything and check the contents instead.
        type: '*/*',
        copyToCacheDirectory: true,
      });
    } catch (e) {
      setPicked({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPicked({ status: 'reading' });
    try {
      const text = await readPickedFile(asset);
      if (!looksLikeHtml(text)) {
        setPicked({
          status: 'error',
          message: 'That file is not a saved web page. Save the Grades page as "Web Page, HTML only" and try again.',
        });
        return;
      }
      const report = parseReport(text, () => Crypto.randomUUID());
      setPicked({ status: 'done', fileName: asset.name, ...report });
    } catch (e) {
      setPicked({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const existing = state.status === 'ready' ? state.courses : [];
  const courses = picked.status === 'done' ? picked.courses : [];
  const sameNamed = findSameNamedCourses(courses, existing);
  const replaceIds = replace ? sameNamed.filter((id): id is string => id !== null) : [];
  const duplicates = sameNamed.filter((id) => id !== null).length;

  const submit = () =>
    save(
      () => importReport(courses, replaceIds),
      () => {
        if (router.canDismiss()) router.dismissAll();
        router.replace('/grades');
      },
    );

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="How to save your grades">
          <ThemedText themeColor="textSecondary">
            1. In a web browser, open Schoology and go to Grades.{'\n'}
            2. Save the page: File → Save Page As… → &quot;Web Page, HTML only&quot; (on a phone, use
            Share → Save to Files).{'\n'}
            3. Get the file onto this phone (AirDrop, email, or Google Drive) and pick it below.
          </ThemedText>
        </Section>
        <ThemedText type="small" themeColor="textSecondary">
          The file is read on this phone. Nothing is sent to Schoology or uploaded.
        </ThemedText>

        <Button
          label={picked.status === 'done' ? 'Choose a different file' : 'Choose the saved file'}
          variant={picked.status === 'done' ? 'secondary' : 'primary'}
          disabled={picked.status === 'reading' || busy}
          onPress={pick}
        />

        {picked.status === 'reading' ? <ThemedText>Reading the file…</ThemedText> : null}
        {picked.status === 'error' ? <ThemedText themeColor="danger">{picked.message}</ThemedText> : null}

        {picked.status === 'done' && courses.length === 0 ? (
          <EmptyState
            title="No grades found"
            message="This page did not have any classes with grades. Open a class's Grades page in Schoology and save that page."
          />
        ) : null}

        {picked.status === 'done' && courses.length > 0 ? (
          <>
            <Section
              title={`Found ${plural(courses.length, 'class', 'classes')} in ${picked.fileName}`}
              footer="Check the grades match Schoology. You can edit anything after importing.">
              {courses.map((course, i) => {
                const n = countOf(course);
                const grade = computeCourseGrades(course).current;
                return (
                  <Row
                    key={course.id}
                    label={course.name}
                    detail={
                      `${plural(n.periods, 'period')} · ${plural(n.categories, 'category', 'categories')}` +
                      ` · ${plural(n.assignments, 'assignment')}` +
                      (sameNamed[i] ? (replace ? ' · replaces your class' : ' · you already have this class') : '')
                    }
                    right={<ThemedText>{formatGrade(grade)}</ThemedText>}
                  />
                );
              })}
            </Section>

            {duplicates > 0 ? (
              <Section footer="Replacing removes the old copy, including any forecasts you added to it.">
                <SwitchRow
                  label={`Replace ${plural(duplicates, 'class', 'classes')} I already have`}
                  value={replace}
                  onValueChange={setReplace}
                />
              </Section>
            ) : null}

            {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
            <Button
              label={busy ? 'Importing…' : `Import ${plural(courses.length, 'class', 'classes')}`}
              variant="primary"
              disabled={busy}
              onPress={submit}
            />
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
});
