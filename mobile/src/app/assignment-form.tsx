import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FormError, FormSheet } from '@/components/form-sheet';
import { Loading } from '@/components/loading';
import { ThemedText } from '@/components/themed-text';
import { Button, Section, SwitchRow, TextField } from '@/components/ui';
import { useCourse, useGradebook } from '@/data/gradebook-store';
import type { GradeAssignment, GradeCategory, GradeCourse } from '@/engine/types';
import { confirmAction } from '@/lib/coming-soon';
import { numberText, validateAssignment } from '@/lib/gradebook-form';
import { useSave } from '@/lib/use-save';

type Params = {
  courseId: string;
  /** Set when adding an assignment to this category. */
  categoryId?: string;
  /** Set when editing this assignment. */
  assignmentId?: string;
};

/** Add, change, or delete an assignment and its score (F06). */
export default function AssignmentFormScreen() {
  const { courseId, categoryId, assignmentId } = useLocalSearchParams<Params>();
  const { state } = useGradebook();
  const course = useCourse(courseId);

  if (state.status === 'loading') {
    return <Loading />;
  }
  const category = course?.periods
    .flatMap((p) => p.categories)
    .find((c) =>
      assignmentId ? c.assignments.some((a) => a.id === assignmentId) : c.id === categoryId,
    );
  const assignment = category?.assignments.find((a) => a.id === assignmentId);
  if (!course || !category || (assignmentId && !assignment)) {
    return (
      <FormSheet>
        <EmptyState title="Not found" message="It may have been deleted on another device." />
      </FormSheet>
    );
  }
  return <AssignmentForm course={course} category={category} assignment={assignment} />;
}

function AssignmentForm({
  course,
  category,
  assignment,
}: {
  course: GradeCourse;
  category: GradeCategory;
  assignment?: GradeAssignment;
}) {
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [actualScore, setActualScore] = useState(numberText(assignment?.actualScore));
  const [maxScore, setMaxScore] = useState(numberText(assignment?.maxScore));
  const [dueDate, setDueDate] = useState(assignment?.dueDate ?? '');
  const [excused, setExcused] = useState(assignment?.excused ?? false);
  const [extraCredit, setExtraCredit] = useState(assignment?.extraCredit ?? false);
  const { saveAssignment, deleteAssignment } = useGradebook();
  const { busy, error, setError, save } = useSave();

  const submit = () => {
    const result = validateAssignment({ title, actualScore, maxScore, dueDate, excused, extraCredit });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    save(() =>
      saveAssignment(
        assignment ? { assignmentId: assignment.id } : { categoryId: category.id },
        result.value,
      ),
    );
  };

  const remove = () => {
    if (!assignment) return;
    confirmAction(`Delete ${assignment.title}?`, 'This cannot be undone.', 'Delete assignment', () =>
      save(() => deleteAssignment(assignment.id)),
    );
  };

  return (
    <FormSheet>
      <Stack.Screen options={{ title: assignment ? 'Edit assignment' : 'Add an assignment' }} />
      <ThemedText themeColor="textSecondary">
        {course.name} · {category.name}
      </ThemedText>
      <TextField
        label="Assignment name"
        value={title}
        onChangeText={setTitle}
        placeholder="Lab 3"
        autoFocus={!assignment}
      />
      <TextField
        label="Points you got (empty if not graded yet)"
        value={actualScore}
        onChangeText={setActualScore}
        keyboardType="decimal-pad"
        placeholder="18"
      />
      <TextField
        label="Points possible"
        value={maxScore}
        onChangeText={setMaxScore}
        keyboardType="decimal-pad"
        placeholder="20"
      />
      <TextField
        label="Due date (optional)"
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Section>
        <SwitchRow
          label="Excused"
          detail="Doesn't count toward the grade."
          value={excused}
          onValueChange={setExcused}
        />
        <SwitchRow
          label="Extra credit"
          detail="Adds points you earn without adding points possible."
          value={extraCredit}
          onValueChange={setExtraCredit}
        />
      </Section>
      {assignment?.forecastScore !== null && assignment?.forecastScore !== undefined ? (
        <ThemedText type="small" themeColor="textSecondary">
          Your forecast for this is {assignment.forecastScore}. A real score replaces it in your grade.
        </ThemedText>
      ) : null}
      <FormError error={error} />
      <Button
        label={busy ? 'Saving…' : assignment ? 'Save changes' : 'Add assignment'}
        variant="primary"
        disabled={busy}
        onPress={submit}
      />
      {assignment ? <Button label="Delete assignment" disabled={busy} onPress={remove} /> : null}
    </FormSheet>
  );
}
