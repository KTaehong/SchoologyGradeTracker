import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FieldLabel, FormError, FormSheet } from '@/components/form-sheet';
import { Loading } from '@/components/loading';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { Button, Section, SwitchRow, TextField } from '@/components/ui';
import { useCourse, useGradebook } from '@/data/gradebook-store';
import { requiredScore } from '@/engine/grade-engine';
import type { GradeCourse } from '@/engine/types';
import { calculatorItems, describeRequired, parseTarget } from '@/lib/final-grade';

/** "What do I need on the final?" (F09). Computed on this phone as the student types. */
export default function FinalGradeScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { state } = useGradebook();
  const course = useCourse(courseId);

  return (
    <FormSheet>
      {state.status === 'loading' ? (
        <Loading />
      ) : course ? (
        <Calculator course={course} />
      ) : (
        <EmptyState title="Course not found" message="It may have been deleted on another device." />
      )}
    </FormSheet>
  );
}

function Calculator({ course }: { course: GradeCourse }) {
  const items = calculatorItems(course);
  const [itemId, setItemId] = useState<string | null>(null);
  const [target, setTarget] = useState('90');
  const [useForecasts, setUseForecasts] = useState(false);

  if (items.length === 0) {
    return (
      <>
        <EmptyState
          title="Nothing left to grade"
          message="Add the final (or any work that is not graded yet) as a forecast first, then come back."
        />
        <Button
          label="Forecast new work"
          variant="primary"
          onPress={() => router.replace({ pathname: '/forecast', params: { courseId: course.id } })}
        />
      </>
    );
  }

  const item = items.find((i) => i.id === itemId) ?? items[0];
  const parsed = parseTarget(target);
  return (
    <>
      <ThemedText type="subtitle">What do I need?</ThemedText>
      <FieldLabel>On</FieldLabel>
      <PeriodPicker
        names={items.map((i) => i.label)}
        selected={items.indexOf(item)}
        onSelect={(index) => setItemId(items[index].id)}
      />
      <TextField
        label="Target grade (percent)"
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        placeholder="90"
      />
      <Section footer="Off: only real grades count for your other work. On: your forecasts count too.">
        <SwitchRow label="Use my forecasts" value={useForecasts} onValueChange={setUseForecasts} />
      </Section>
      {parsed.ok ? (
        <ThemedText accessibilityLiveRegion="polite">
          {describeRequired(requiredScore(course, item.id, parsed.value, useForecasts), item, parsed.value)}
        </ThemedText>
      ) : (
        <FormError error={parsed.error} />
      )}
    </>
  );
}
