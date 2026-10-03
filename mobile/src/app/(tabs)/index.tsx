import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { errorMessage, gradesApi, useApiQuery, useSession, type CourseGrades } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { type Course } from '@/data/types';
import { formatGrade } from '@/lib/format-grade';
import { Radius, Spacing } from '@/theme/colors';

export default function GradesScreen() {
  const session = useSession();
  if (session.status === 'loading') {
    return (
      <Screen title="Grades">
        <Loading />
      </Screen>
    );
  }
  return session.status === 'signed_in' ? <AccountGrades /> : <PhoneGrades />;
}

/** Signed in: the grades saved in the student's account, computed by the server. */
function AccountGrades() {
  const { state, reload } = useApiQuery(() => gradesApi.getGrades(), 'grades');
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const loadSample = async () => {
    setLoadingSample(true);
    setSampleError(null);
    try {
      await gradesApi.loadSampleGradebook();
      await reload();
    } catch (e) {
      setSampleError(errorMessage(e));
    } finally {
      setLoadingSample(false);
    }
  };

  return (
    <Screen title="Grades">
      <ThemedText type="small" themeColor="textSecondary">
        Showing the grades in your account. Projected grades include your forecasts.
      </ThemedText>
      {state.status === 'loading' ? (
        <Loading />
      ) : state.status === 'error' ? (
        <>
          <EmptyState title="Could not load grades" message={errorMessage(state.error)} />
          <Button label="Try again" onPress={reload} />
        </>
      ) : state.data.courses.length === 0 ? (
        <>
          <EmptyState
            title="No courses in your account yet"
            message="Load the sample grades to try forecasts. Syncing this phone's grades comes in a later update."
          />
          {sampleError ? <ThemedText themeColor="danger">{sampleError}</ThemedText> : null}
          <Button
            label={loadingSample ? 'Loading…' : 'Load sample grades'}
            variant="primary"
            disabled={loadingSample}
            onPress={loadSample}
          />
        </>
      ) : (
        state.data.courses.map((course) => <AccountCourseCard key={course.courseId} course={course} />)
      )}
    </Screen>
  );
}

function AccountCourseCard({ course }: { course: CourseGrades }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/cloud-course/[id]', params: { id: course.courseId } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">{course.name}</ThemedText>
        {course.teacher ? <ThemedText themeColor="textSecondary">{course.teacher}</ThemedText> : null}
        <ThemedText>Current: {formatGrade(course.current)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Projected: {formatGrade(course.projected)}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

/** Signed out: the gradebook saved on this phone (F13). */
function PhoneGrades() {
  const { state } = useGradebook();
  const openAdd = () => router.push('/add');

  return (
    <Screen title="Grades" action={<HeaderButton label="+ Add" onPress={openAdd} />}>
      {state.status === 'loading' ? (
        <Loading />
      ) : state.gradebook.courses.length === 0 ? (
        <>
          <EmptyState
            title="No courses yet"
            message="Add your grades from a screenshot, a saved Schoology report, or by hand."
          />
          <Button label="Add grades" variant="primary" onPress={openAdd} />
        </>
      ) : (
        state.gradebook.courses.map((course) => <CourseCard key={course.id} course={course} />)
      )}
    </Screen>
  );
}

function CourseCard({ course }: { course: Course }) {
  const assignments = course.periods.flatMap((period) =>
    period.categories.flatMap((category) => category.assignments),
  );
  const graded = assignments.filter((a) => a.score !== null && !a.excused).length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">{course.name}</ThemedText>
        {course.teacher ? <ThemedText themeColor="textSecondary">{course.teacher}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">
          {graded} graded of {assignments.length} assignments
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
