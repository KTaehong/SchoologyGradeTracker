import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { CourseGrades, PeriodGrades, UngradedAssignment } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Loading } from '@/components/loading';
import { PeriodPicker } from '@/components/period-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section } from '@/components/ui';
import { useCourse, useCourseGrades, useGradebook } from '@/data/gradebook-store';
import type { GradeAssignment, GradeCourse } from '@/engine/types';
import { formatGrade, formatNumber, formatPercent, formatPoints } from '@/lib/format-grade';
import { Radius, Spacing } from '@/theme/colors';

/** One course: grades at every level, plus forecasts (F03, F08, F10). Computed on this phone. */
export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useGradebook();
  const course = useCourseGrades(id);
  const raw = useCourse(id);

  if (state.status === 'loading') {
    return <Loading />;
  }
  if (!course || !raw) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Course' }} />
        <View style={styles.content}>
          <EmptyState title="Course not found" message="It may have been deleted on another device." />
        </View>
      </ThemedView>
    );
  }
  return <CourseDetail course={course} raw={raw} />;
}

function CourseDetail({ course, raw }: { course: CourseGrades; raw: GradeCourse }) {
  const [periodIndex, setPeriodIndex] = useState(0);
  const period = course.periods[Math.min(periodIndex, course.periods.length - 1)];
  const editCourse = () =>
    router.push({ pathname: '/course-form', params: { courseId: course.courseId } });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: course.name,
          headerRight: () => <HeaderButton label="Edit" onPress={editCourse} />,
        }}
      />
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

        {course.semesters.some((s) => s.projectedPercent !== null) ? (
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

        {period ? <PeriodDetail course={course} raw={raw} period={period} /> : null}
      </ScrollView>
    </ThemedView>
  );
}

/** One grading period: each category with its assignments, all editable (F06). */
function PeriodDetail({
  course,
  raw,
  period,
}: {
  course: CourseGrades;
  raw: GradeCourse;
  period: PeriodGrades;
}) {
  const categories = raw.periods.find((p) => p.id === period.periodId)?.categories ?? [];
  const courseId = course.courseId;
  const weighted = course.gradingMode === 'weighted';

  return (
    <>
      <ThemedText type="subtitle">
        {period.name} · {formatPercent(period.currentPercent)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Projected {formatPercent(period.projectedPercent)}
      </ThemedText>
      {period.categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          message={
            weighted
              ? 'Add the categories from your syllabus, like Tests 40% and Homework 20%.'
              : 'Add a category (like Tests) to put assignments in.'
          }
        />
      ) : null}
      {period.categories.map((c) => {
        const assignments = categories.find((k) => k.id === c.categoryId)?.assignments ?? [];
        return (
          <Section
            key={c.categoryId}
            title={c.weight === null || !weighted ? c.name : `${c.name} · ${c.weight}%`}>
            <Row
              label={`Average ${formatPercent(c.currentPercent)}`}
              detail={`Projected ${formatPercent(c.projectedPercent)}${
                c.dropLowest ? ` · lowest ${c.dropLowest} dropped` : ''
              } · tap to edit`}
              onPress={() =>
                router.push({
                  pathname: '/category-form',
                  params: { courseId, categoryId: c.categoryId },
                })
              }
            />
            {assignments.map((a) => (
              <Row
                key={a.id}
                label={a.title}
                detail={assignmentDetail(a)}
                right={<ThemedText>{assignmentScore(a)}</ThemedText>}
                onPress={() =>
                  router.push({ pathname: '/assignment-form', params: { courseId, assignmentId: a.id } })
                }
              />
            ))}
            <Row
              label="+ Add assignment"
              onPress={() =>
                router.push({
                  pathname: '/assignment-form',
                  params: { courseId, categoryId: c.categoryId },
                })
              }
            />
          </Section>
        );
      })}
      <Button
        label="+ Add category"
        variant={period.categories.length === 0 ? 'primary' : 'secondary'}
        onPress={() =>
          router.push({ pathname: '/category-form', params: { courseId, periodId: period.periodId } })
        }
      />
    </>
  );
}

function assignmentScore(a: GradeAssignment): string {
  if (a.excused) return 'Excused';
  if (a.actualScore !== null) return formatPoints(a.actualScore, a.maxScore);
  return `— / ${formatNumber(a.maxScore)}`;
}

function assignmentDetail(a: GradeAssignment): string | undefined {
  const parts = [
    a.dueDate ? `due ${a.dueDate}` : null,
    a.extraCredit ? 'extra credit' : null,
    a.actualScore === null && a.forecastScore !== null
      ? `forecast ${formatPoints(a.forecastScore, a.maxScore)}`
      : null,
    a.isPlaceholder ? 'not in Schoology yet' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
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
