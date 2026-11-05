import { router } from 'expo-router';
import { Alert, Platform, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { HeaderButton } from '@/components/header-button';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGradebook } from '@/data/gradebook-store';
import { formatDayLabel, formatDueTime, groupUpcomingByDay } from '@/data/upcoming';
import { formatRefreshed } from '@/lib/calendar-label';
import { Radius, Spacing } from '@/theme/colors';

export default function UpcomingScreen() {
  const { state, syncNow, calendar, refreshCalendar } = useGradebook();

  if (state.status !== 'ready') {
    return (
      <Screen title="Upcoming">
        <Loading />
      </Screen>
    );
  }

  const { courses, upcoming } = state;
  const courseNames = new Map(courses.map((course) => [course.id, course.name]));
  const days = groupUpcomingByDay(upcoming);
  const showError = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    if (Platform.OS === 'web') window.alert(message);
    else Alert.alert('Calendar did not update', message);
  };
  const refresh = () => {
    if (!calendar.connected) {
      router.push('/calendar-feed');
      return;
    }
    refreshCalendar().catch(showError);
  };
  const pullToRefresh = async () => {
    await Promise.all([syncNow(), calendar.connected ? refreshCalendar().catch(showError) : null]);
  };

  return (
    <Screen
      title="Upcoming"
      action={
        <HeaderButton
          label={calendar.connected ? (calendar.refreshing ? 'Updating…' : 'Refresh') : 'Connect'}
          onPress={refresh}
        />
      }
      onRefresh={pullToRefresh}>
      {calendar.connected ? (
        <ThemedText type="small" themeColor={calendar.error ? 'danger' : 'textSecondary'}>
          {calendar.error
            ? `Calendar did not update: ${calendar.error}`
            : `From your Schoology calendar · updated ${formatRefreshed(calendar.refreshedAt).toLowerCase()}`}
        </ThemedText>
      ) : null}
      {days.length === 0 ? (
        <EmptyState
          title="Nothing due"
          message={
            calendar.connected
              ? 'Your Schoology calendar has nothing due right now.'
              : "Connect your Schoology calendar to see what's due."
          }
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
