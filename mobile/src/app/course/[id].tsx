import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { CourseGrades, UngradedAssignment } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Row, Section } from '@/components/ui';
import { useCourseGrades, useGradebook } from '@/data/gradebook-store';
import { formatGrade, formatPercent, formatPoints } from '@/lib/format-grade';
import { Radius, Spacing } from '@/theme/colors';

/** One course: grades at every level, plus forecasts (F03, F08, F10). Computed on this phone. */
export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useGradebook();
  const course = useCourseGrades(id);

  if (state.status === 'loading') {
    return <Loading />;
  }
  if (!course) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Course' }} />
        <View style={styles.content}>
          <EmptyState title="Course not found" message="It may have been deleted on another device." />
        </View>
      </ThemedView>
    );
  }
  return <CourseDetail course={course} />;
}

function CourseDetail({ course }: { course: CourseGrades }) {
  const [periodIndex, setPeriodIndex] = useState(0);
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
          <ThemedText type="title">{formatGrade(course.current)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Projected with forecasts: {formatGrade(course.projected)}
          </ThemedText>
        </ThemedView>

        <ForecastSection course={course} />

        {course.semesters.length > 0 ? (
          <Section title="Semesters" footer="Quarters count 50/50, blended with the exam by its weight.">
            {course.semesters.map((s) => (
              <Row
                key={s.semester}
                label={s.label ?? `Semester ${s.semester}`}
                detail={`Exam counts ${s.examWeight}% · projected ${formatPercent(s.projectedPercent)}`}
                right={<ThemedText>{formatPercent(s.currentPercent)}</ThemedText>}
              />
            ))}
          </Section>
        ) : null}

        {course.periods.length > 1 ? (
          <PeriodPicker
            names={course.periods.map((p) => p.name)}
            selected={course.periods.indexOf(period)}
            onSelect={setPeriodIndex}
          />
        ) : null}

        {period ? (
          <Section
            title={`${period.name} · ${formatPercent(period.currentPercent)}`}
            footer={`Projected ${formatPercent(period.projectedPercent)}`}>
            {period.categories.length === 0 ? (
              <Row label="No categories" />
            ) : (
              period.categories.map((c) => (
                <Row
                  key={c.categoryId}
                  label={c.weight === null ? c.name : `${c.name} · ${c.weight}%`}
                  detail={`Projected ${formatPercent(c.projectedPercent)}${
                    c.dropLowest ? ` · lowest ${c.dropLowest} dropped` : ''
                  }`}
                  right={<ThemedText>{formatPercent(c.currentPercent)}</ThemedText>}
                />
              ))
            )}
          </Section>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

/** Work with no grade yet, and the forecast for each. Tap one to forecast it. */
function ForecastSection({ course }: { course: CourseGrades }) {
  const where = new Map<string, string>();
  for (const p of course.periods) {
    for (const c of p.categories) {
      where.set(c.categoryId, `${p.name} · ${c.name}`);
    }
  }

  const open = (item: UngradedAssignment) =>
    router.push({
      pathname: '/forecast',
      params: {
        courseId: course.courseId,
        assignmentId: item.assignmentId,
        title: item.title,
        maxScore: String(item.maxScore),
        forecastScore: item.forecastScore === null ? '' : String(item.forecastScore),
        isPlaceholder: item.isPlaceholder ? '1' : '0',
      },
    });

  return (
    <Section
      title="Forecasts"
      footer="Forecasts fill in work that isn't graded yet, so you can see your projected grade. A real grade always replaces the forecast.">
      {course.ungraded.map((item) => (
        <Row
          key={item.assignmentId}
          label={item.title}
          detail={[where.get(item.categoryId), item.dueDate ? `due ${item.dueDate}` : null]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => open(item)}
          right={
            <ThemedText themeColor={item.forecastScore === null ? 'accent' : 'text'}>
              {item.forecastScore === null ? 'Add' : formatPoints(item.forecastScore, item.maxScore)}
            </ThemedText>
          }
        />
      ))}
      <Row
        label="+ Forecast new work"
        detail="For a test or assignment that isn't in Schoology yet."
        onPress={() =>
          router.push({ pathname: '/forecast', params: { courseId: course.courseId } })
        }
      />
    </Section>
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
  summary: {
    padding: Spacing.four,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
});
