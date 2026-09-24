import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { type Course } from '@/data/types';
import { Radius, Spacing } from '@/theme/colors';

export default function GradesScreen() {
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
