import { StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGradebook } from '@/data/gradebook-store';
import { formatDayLabel, formatDueTime, groupUpcomingByDay } from '@/data/upcoming';
import { Radius, Spacing } from '@/theme/colors';

export default function UpcomingScreen() {
  const { state } = useGradebook();

  if (state.status === 'loading') {
    return (
      <Screen title="Upcoming">
        <Loading />
      </Screen>
    );
  }

  const { courses, upcoming } = state.gradebook;
  const courseNames = new Map(courses.map((course) => [course.id, course.name]));
  const days = groupUpcomingByDay(upcoming);

  return (
    <Screen title="Upcoming">
      {days.length === 0 ? (
        <EmptyState
          title="Nothing due"
          message="Assignments from your Schoology calendar will show up here."
        />
      ) : (
        days.map((day) => (
          <ThemedView key={day.date} style={styles.day}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.dayLabel}>
              {formatDayLabel(day.date)}
            </ThemedText>
            {day.items.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.item}>
                <ThemedText>{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {(item.courseId && courseNames.get(item.courseId)) || 'Unfiled'} · due{' '}
                  {formatDueTime(item.dueAt)}
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  day: {
    gap: Spacing.two,
  },
  dayLabel: {
    textTransform: 'uppercase',
  },
  item: {
    padding: Spacing.three,
    borderRadius: Radius.large,
    gap: Spacing.one,
  },
});
