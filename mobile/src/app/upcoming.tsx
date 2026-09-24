import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

export default function UpcomingScreen() {
  return (
    <Screen title="Upcoming">
      <EmptyState
        title="Nothing due yet"
        message="Assignments from your Schoology calendar will show up here."
      />
    </Screen>
  );
}
