import { StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGradebook } from '@/data/gradebook-store';
import { type Course } from '@/data/types';
import { Radius, Spacing } from '@/theme/colors';

export default function GradesScreen() {
  const { state } = useGradebook();

  return (
    <Screen title="Grades">
      {state.status === 'loading' ? (
        <Loading />
      ) : state.gradebook.courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          message="Your courses and their current grades will show up here. You can load demo grades from Settings."
        />
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
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="subtitle">{course.name}</ThemedText>
      {course.teacher ? <ThemedText themeColor="textSecondary">{course.teacher}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {graded} graded of {assignments.length} assignments
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
});
