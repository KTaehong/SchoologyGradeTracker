import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FieldLabel, FormError, FormSheet } from '@/components/form-sheet';
import { Loading } from '@/components/loading';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { useCourse, useGradebook } from '@/data/gradebook-store';
import type { GradingMode } from '@/data/types';
import type { GradeCourse } from '@/engine/types';
import { confirmAction } from '@/lib/coming-soon';
import { PERIOD_PRESETS, validateCourse } from '@/lib/gradebook-form';
import { useSave } from '@/lib/use-save';

const MODES: { mode: GradingMode; label: string }[] = [
  { mode: 'weighted', label: 'Weighted categories' },
  { mode: 'points', label: 'Total points' },
];

/** Back to the tabs, closing this sheet and anything under it (like the class it edits). */
function closeSheets() {
  if (router.canDismiss()) {
    router.dismissAll();
  }
}

/** Add a class by hand (F06), or change or delete one. */
export default function CourseFormScreen() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const { state } = useGradebook();
  const course = useCourse(courseId);

  if (!courseId) {
    return <CourseForm />;
  }
  if (state.status === 'loading') {
    return <Loading />;
  }
  if (!course) {
    return (
      <FormSheet>
        <EmptyState title="Class not found" message="It may have been deleted on another device." />
      </FormSheet>
    );
  }
  return <CourseForm course={course} />;
}

function CourseForm({ course }: { course?: GradeCourse }) {
  const [name, setName] = useState(course?.name ?? '');
  const [teacher, setTeacher] = useState(course?.teacher ?? '');
  const [gradingMode, setGradingMode] = useState<GradingMode>(course?.gradingMode ?? 'weighted');
  const [presetIndex, setPresetIndex] = useState(1);
  const { addCourse, updateCourse, deleteCourse } = useGradebook();
  const { busy, error, setError, save } = useSave();

  const submit = () => {
    const result = validateCourse({ name, teacher, gradingMode });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (course) {
      save(() => updateCourse(course.id, result.value));
    } else {
      save(
        () => addCourse(result.value, PERIOD_PRESETS[presetIndex].periods),
        (id) => {
          // Close the sheets and open the new class, ready for its categories.
          closeSheets();
          router.push({ pathname: '/course/[id]', params: { id } });
        },
      );
    }
  };

  const remove = () => {
    if (!course) return;
    confirmAction(
      `Delete ${course.name}?`,
      'This deletes the class with all its categories, assignments and forecasts' +
        ' — on every device you are signed in on. It cannot be undone.',
      'Delete class',
      () =>
        save(
          () => deleteCourse(course.id),
          () => {
            closeSheets();
            router.replace('/grades');
          },
        ),
    );
  };

  return (
    <FormSheet>
      <Stack.Screen options={{ title: course ? 'Edit class' : 'Add a class' }} />
      <TextField
        label="Class name"
        value={name}
        onChangeText={setName}
        placeholder="AP Biology"
        autoFocus={!course}
      />
      <TextField
        label="Teacher (optional)"
        value={teacher}
        onChangeText={setTeacher}
        placeholder="Ms. Rivera"
      />
      <FieldLabel>How is the grade calculated?</FieldLabel>
      <PeriodPicker
        names={MODES.map((m) => m.label)}
        selected={MODES.findIndex((m) => m.mode === gradingMode)}
        onSelect={(i) => setGradingMode(MODES[i].mode)}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {gradingMode === 'weighted'
          ? 'Each category (like Tests 40%) counts for a set share of the grade. Check the syllabus or Schoology.'
          : 'Every point counts the same: your points earned divided by points possible.'}
      </ThemedText>
      {course ? null : (
        <>
          <FieldLabel>Grading periods</FieldLabel>
          <PeriodPicker
            names={PERIOD_PRESETS.map((p) => p.label)}
            selected={presetIndex}
            onSelect={setPresetIndex}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {PERIOD_PRESETS[presetIndex].periods.map((p) => p.name).join(', ')}
          </ThemedText>
        </>
      )}
      <FormError error={error} />
      <Button
        label={busy ? 'Saving…' : course ? 'Save changes' : 'Add class'}
        variant="primary"
        disabled={busy}
        onPress={submit}
      />
      {course ? <Button label="Delete class" disabled={busy} onPress={remove} /> : null}
    </FormSheet>
  );
}
