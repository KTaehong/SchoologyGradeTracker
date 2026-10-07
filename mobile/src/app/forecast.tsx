import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { errorMessage, type CourseGrades } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, TextField } from '@/components/ui';
import { useCourseGrades, useGradebook } from '@/data/gradebook-store';
import { validateForecastScore, validateNewForecast } from '@/lib/forecast-form';
import { Spacing } from '@/theme/colors';

type Params = {
  courseId: string;
  /** Set when editing an existing assignment's forecast. */
  assignmentId?: string;
  title?: string;
  maxScore?: string;
  forecastScore?: string;
  /** '1' for work that is only a forecast (deleting the forecast deletes it). */
  isPlaceholder?: string;
};

/** Add, change, or remove a forecast (F08). Saved on this phone, then synced when signed in. */
export default function ForecastScreen() {
  const params = useLocalSearchParams<Params>();
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {params.assignmentId ? (
            <EditForecast params={{ ...params, assignmentId: params.assignmentId }} />
          ) : (
            <NewForecast courseId={params.courseId} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** Use a mutation, show its error, and close the sheet when it succeeds. */
function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, setError, save };
}

function EditForecast({ params }: { params: Params & { assignmentId: string } }) {
  const [score, setScore] = useState(params.forecastScore ?? '');
  const { setForecast, removeForecast } = useGradebook();
  const { busy, error, setError, save } = useSave();
  const hasForecast = Boolean(params.forecastScore);
  const placeholder = params.isPlaceholder === '1';

  const submit = () => {
    const result = validateForecastScore(score);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    save(() => setForecast(params.assignmentId, result.value));
  };

  return (
    <>
      <ThemedText type="subtitle">{params.title}</ThemedText>
      <ThemedText themeColor="textSecondary">
        What score do you expect? It counts toward your projected grade until the real grade
        arrives.
      </ThemedText>
      <TextField
        label={`Forecast (out of ${params.maxScore})`}
        value={score}
        onChangeText={setScore}
        keyboardType="decimal-pad"
        placeholder={params.maxScore}
        autoFocus
        onSubmitEditing={submit}
      />
      {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
      <Button
        label={busy ? 'Saving…' : 'Save forecast'}
        variant="primary"
        disabled={busy}
        onPress={submit}
      />
      {hasForecast ? (
        <Button
          label={placeholder ? 'Delete this forecast' : 'Clear forecast'}
          disabled={busy}
          onPress={() => save(() => removeForecast(params.assignmentId))}
        />
      ) : null}
    </>
  );
}

function NewForecast({ courseId }: { courseId: string }) {
  const { state } = useGradebook();
  const course = useCourseGrades(courseId);

  if (state.status === 'loading') {
    return <Loading />;
  }
  if (!course) {
    return <EmptyState title="Course not found" message="It may have been deleted on another device." />;
  }
  return <NewForecastForm course={course} />;
}

function NewForecastForm({ course }: { course: CourseGrades }) {
  const categories = course.periods.flatMap((p) =>
    p.categories.map((c) => ({ id: c.categoryId, label: `${p.name} · ${c.name}` })),
  );
  const [categoryIndex, setCategoryIndex] = useState<number | null>(
    categories.length === 1 ? 0 : null,
  );
  const [title, setTitle] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [forecastScore, setForecastScore] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { addForecast } = useGradebook();
  const { busy, error, setError, save } = useSave();

  const submit = () => {
    const result = validateNewForecast({
      categoryId: categoryIndex === null ? null : categories[categoryIndex].id,
      title,
      maxScore,
      forecastScore,
      dueDate,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    save(() => addForecast(result.value));
  };

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No categories yet"
        message="This course needs a category (like Tests) before you can forecast work in it."
      />
    );
  }

  return (
    <>
      <ThemedText type="subtitle">Forecast new work</ThemedText>
      <ThemedText themeColor="textSecondary">
        For {course.name}: a test or assignment that isn&apos;t in Schoology yet. When the real
        grade is imported, it replaces this forecast.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Category
      </ThemedText>
      <PeriodPicker
        names={categories.map((c) => c.label)}
        selected={categoryIndex ?? -1}
        onSelect={setCategoryIndex}
      />
      <TextField label="Name" value={title} onChangeText={setTitle} placeholder="Unit 4 Test" />
      <TextField
        label="Points possible"
        value={maxScore}
        onChangeText={setMaxScore}
        keyboardType="decimal-pad"
        placeholder="100"
      />
      <TextField
        label="Points you expect"
        value={forecastScore}
        onChangeText={setForecastScore}
        keyboardType="decimal-pad"
        placeholder="90"
      />
      <TextField
        label="Due date (optional)"
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <ThemedText themeColor="danger">{error}</ThemedText> : null}
      <Button
        label={busy ? 'Saving…' : 'Save forecast'}
        variant="primary"
        disabled={busy}
        onPress={submit}
      />
    </>
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
