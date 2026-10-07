import { router } from 'expo-router';

import { CourseCard } from '@/components/course-card';
import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { syncLabel } from '@/lib/sync-label';

/** Grades home (F02): every course with its grade, computed on this phone. */
export default function GradesScreen() {
  const { state, sync, online, syncNow, loadSample } = useGradebook();
  const openAdd = () => router.push('/add');

  return (
    <Screen
      title="Grades"
      action={<HeaderButton label="+ Add" onPress={openAdd} />}
      onRefresh={syncNow}>
      <ThemedText type="small" themeColor="textSecondary">
        {syncLabel(sync, online)}
      </ThemedText>
      {state.status === 'loading' ? (
        <Loading />
      ) : state.status === 'error' ? (
        <EmptyState title="Could not open your gradebook" message={state.message} />
      ) : state.grades.length === 0 ? (
        <>
          <EmptyState
            title="No courses yet"
            message="Add your grades from a screenshot, a saved Schoology report, or by hand — or try the sample."
          />
          <Button label="Add grades" variant="primary" onPress={openAdd} />
          <Button label="Load sample grades" onPress={loadSample} />
        </>
      ) : (
        state.grades.map((course) => <CourseCard key={course.courseId} course={course} />)
      )}
    </Screen>
  );
}
