import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FormError, FormSheet } from '@/components/form-sheet';
import { Loading } from '@/components/loading';
import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { useCourse, useGradebook } from '@/data/gradebook-store';
import type { GradeCategory, GradeCourse, GradePeriod } from '@/engine/types';
import { confirmAction } from '@/lib/coming-soon';
import { numberText, validateCategory } from '@/lib/gradebook-form';
import { useSave } from '@/lib/use-save';

type Params = {
  courseId: string;
  /** Set when adding a category to this grading period. */
  periodId?: string;
  /** Set when editing this category. */
  categoryId?: string;
};

/** Add, change, or delete a category such as "Tests · 40%" (F06). */
export default function CategoryFormScreen() {
  const { courseId, periodId, categoryId } = useLocalSearchParams<Params>();
  const { state } = useGradebook();
  const course = useCourse(courseId);

  if (state.status === 'loading') {
    return <Loading />;
  }
  const period = course?.periods.find((p) =>
    categoryId ? p.categories.some((c) => c.id === categoryId) : p.id === periodId,
  );
  const category = period?.categories.find((c) => c.id === categoryId);
  if (!course || !period || (categoryId && !category)) {
    return (
      <FormSheet>
        <EmptyState title="Not found" message="It may have been deleted on another device." />
      </FormSheet>
    );
  }
  return <CategoryForm course={course} period={period} category={category} />;
}

function CategoryForm({
  course,
  period,
  category,
}: {
  course: GradeCourse;
  period: GradePeriod;
  category?: GradeCategory;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [weight, setWeight] = useState(numberText(category?.weight));
  const [dropLowest, setDropLowest] = useState(category?.dropLowest ? String(category.dropLowest) : '');
  const { saveCategory, deleteCategory } = useGradebook();
  const { busy, error, setError, save } = useSave();
  const weighted = course.gradingMode === 'weighted';
  const otherWeights = period.categories
    .filter((c) => c.id !== category?.id && c.weight !== null)
    .reduce((sum, c) => sum + (c.weight ?? 0), 0);

  const submit = () => {
    const result = validateCategory({ name, weight: weighted ? weight : '', dropLowest });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    save(() =>
      saveCategory(category ? { categoryId: category.id } : { periodId: period.id }, result.value),
    );
  };

  const remove = () => {
    if (!category) return;
    const count = category.assignments.length;
    confirmAction(
      `Delete ${category.name}?`,
      count > 0
        ? `Its ${count} assignment${count === 1 ? '' : 's'} will be deleted too. This cannot be undone.`
        : 'This cannot be undone.',
      'Delete category',
      () => save(() => deleteCategory(category.id)),
    );
  };

  return (
    <FormSheet>
      <Stack.Screen options={{ title: category ? 'Edit category' : 'Add a category' }} />
      <ThemedText themeColor="textSecondary">
        {course.name} · {period.name}
      </ThemedText>
      <TextField
        label="Category name"
        value={name}
        onChangeText={setName}
        placeholder="Tests"
        autoFocus={!category}
      />
      {weighted ? (
        <>
          <TextField
            label="Weight (% of the grade)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="40"
          />
          <ThemedText type="small" themeColor="textSecondary">
            {otherWeights > 0
              ? `The other categories in ${period.name} add up to ${otherWeights}%.`
              : 'Leave it empty if you don’t know: categories with no weight count equally.'}
          </ThemedText>
        </>
      ) : null}
      <TextField
        label="Drop the lowest (optional)"
        value={dropLowest}
        onChangeText={setDropLowest}
        keyboardType="number-pad"
        placeholder="0"
      />
      <ThemedText type="small" themeColor="textSecondary">
        How many of the lowest scores in this category don’t count, if your teacher drops any.
      </ThemedText>
      <FormError error={error} />
      <Button
        label={busy ? 'Saving…' : category ? 'Save changes' : 'Add category'}
        variant="primary"
        disabled={busy}
        onPress={submit}
      />
      {category ? <Button label="Delete category" disabled={busy} onPress={remove} /> : null}
    </FormSheet>
  );
}
