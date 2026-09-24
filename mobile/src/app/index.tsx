import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function GradesScreen() {
  return (
    <Screen title="Grades">
      <EmptyState
        title="No courses yet"
        message="Your courses and their current grades will show up here."
      />
    </Screen>
  );
}
