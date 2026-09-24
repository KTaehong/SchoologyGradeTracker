import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { type Assignment, type Category } from '@/data/types';
import { comingSoon } from '@/lib/coming-soon';
import { Radius, Spacing } from '@/theme/colors';
import { useTheme } from '@/theme/theme-preference';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useGradebook();
  const [periodIndex, setPeriodIndex] = useState(0);

  if (state.status === 'loading') {
    return <Loading />;
  }

  const course = state.gradebook.courses.find((c) => c.id === id);
  if (!course) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Course' }} />
        <View style={styles.content}>
          <EmptyState title="Course not found" message="It may have been erased." />
        </View>
      </ThemedView>
    );
  }

  const period = course.periods[Math.min(periodIndex, course.periods.length - 1)];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: course.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            {course.teacher ?? 'No teacher listed'} ·{' '}
            {course.gradingMode === 'weighted' ? 'Weighted categories' : 'Total points'}
          </ThemedText>
          <ThemedText type="title">—</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Course grade appears once grade calculation is ready.
          </ThemedText>
        </ThemedView>

        <View style={styles.tools}>
          <Button label="What-If" onPress={() => comingSoon('What-If grades')} />
          <Button label="Final grade" onPress={() => comingSoon('The final-grade calculator')} />
          <Button label="Semester" onPress={() => comingSoon('Semester grades')} />
        </View>

        {course.periods.length > 1 ? (
          <PeriodPicker
            names={course.periods.map((p) => p.name)}
            selected={course.periods.indexOf(period)}
            onSelect={setPeriodIndex}
          />
        ) : null}

        {period.categories.map((category) => (
          <CategorySection key={category.id} category={category} />
        ))}

        <Section title="Edit">
          <Row label="Add assignment" onPress={() => comingSoon('Adding an assignment')} />
          <Row label="Add category" onPress={() => comingSoon('Adding a category')} />
          <Row label="Edit course" onPress={() => comingSoon('Editing a course')} />
          <Row label="Delete course" destructive onPress={() => comingSoon('Deleting a course')} />
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function PeriodPicker({
  names,
  selected,
  onSelect,
}: {
  names: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.periods} accessibilityRole="tablist">
      {names.map((name, index) => {
        const isSelected = index === selected;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(index)}
            style={[
              styles.period,
              { backgroundColor: isSelected ? colors.accent : colors.backgroundSelected },
            ]}>
            <ThemedText style={{ color: isSelected ? colors.onAccent : colors.text }}>{name}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function CategorySection({ category }: { category: Category }) {
  const title =
    category.weight === null ? category.name : `${category.name} · ${category.weight}%`;
  const footer = category.dropLowest
    ? `Lowest ${category.dropLowest === 1 ? 'score is' : `${category.dropLowest} scores are`} dropped.`
    : undefined;

  return (
    <Section title={title} footer={footer}>
      {category.assignments.length === 0 ? (
        <Row label="No assignments yet" />
      ) : (
        category.assignments.map((assignment) => (
          <Row
            key={assignment.id}
            label={assignment.title}
            detail={assignment.dueDate ?? undefined}
            right={<ThemedText themeColor="textSecondary">{scoreLabel(assignment)}</ThemedText>}
          />
        ))
      )}
    </Section>
  );
}

function scoreLabel(assignment: Assignment): string {
  if (assignment.excused) return 'Excused';
  if (assignment.score === null) return 'Not graded';
  if (assignment.extraCredit) return `+${assignment.score} extra`;
  return `${assignment.score} / ${assignment.maxScore}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  summary: {
    padding: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
  tools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  periods: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  period: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
  },
});
