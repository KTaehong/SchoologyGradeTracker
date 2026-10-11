import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession, type CourseGrades } from '@/api';
import { EmptyState } from '@/components/empty-state';
import { Loading } from '@/components/loading';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row, Section } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import { formatDayLabel, formatDueTime, groupUpcomingByDay } from '@/data/upcoming';
import { formatPercent } from '@/lib/format-grade';
import { greeting, firstName } from '@/lib/greeting';
import { syncLabel } from '@/lib/sync-label';
import { Radius, Spacing } from '@/theme/colors';

/**
 * Home: the landing page after sign-in (or after "use without an account").
 * A glance at every class, what's due next, and what still needs a forecast.
 */
export default function HomeScreen() {
  const { state, sync, online, syncNow, loadSample } = useGradebook();
  const session = useSession();
  const user = session.status === 'signed_in' ? session.session.user : null;
  const name = firstName(user?.user_metadata);

  return (
    <Screen title={name ? `${greeting()}, ${name}` : greeting()} onRefresh={syncNow}>
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
            title="Let's add your classes"
            message="Import your grades from Schoology or type them in. Want to look around first? Load the sample."
          />
          <Button label="Add grades" variant="primary" onPress={() => router.push('/add')} />
          <Button label="Load sample grades" onPress={loadSample} />
        </>
      ) : (
        <>
          <ClassStrip grades={state.grades} />
          <DueSoon
            upcoming={state.upcoming}
            courseNames={new Map(state.grades.map((g) => [g.courseId, g.name]))}
          />
          <NeedsForecast grades={state.grades} />
        </>
      )}
    </Screen>
  );
}

/** Every class as a compact tile: letter and percent. */
function ClassStrip({ grades }: { grades: CourseGrades[] }) {
  return (
    <Section title="Your classes">
      <View style={styles.tiles}>
        {grades.map((g) => (
          <Pressable
            key={g.courseId}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${g.current.letter ?? 'no grade yet'}`}
            onPress={() => router.push({ pathname: '/course/[id]', params: { id: g.courseId } })}
            style={({ pressed }) => [styles.tileWrap, pressed && styles.pressed]}>
            <ThemedView type="backgroundSelected" style={styles.tile}>
              <ThemedText type="subtitle">{g.current.letter ?? 'N/A'}</ThemedText>
              <ThemedText type="small" numberOfLines={1}>
                {g.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatPercent(g.current.percent)}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

function DueSoon({
  upcoming,
  courseNames,
}: {
  upcoming: Parameters<typeof groupUpcomingByDay>[0];
  courseNames: Map<string, string>;
}) {
  const next = groupUpcomingByDay(upcoming)
    .flatMap((day) => day.items.map((item) => ({ day: day.date, item })))
    .slice(0, 3);
  if (next.length === 0) {
    return null;
  }
  return (
    <Section title="Due soon">
      {next.map(({ day, item }) => (
        <Row
          key={item.id}
          label={item.title}
          detail={`${formatDayLabel(day)} ${formatDueTime(item.dueAt)} · ${
            (item.courseId && courseNames.get(item.courseId)) || 'Unfiled'
          }`}
        />
      ))}
      <Row label="See everything due" onPress={() => router.push('/upcoming')} />
    </Section>
  );
}

/** Ungraded work with no forecast yet: forecasting it makes the projection meaningful. */
function NeedsForecast({ grades }: { grades: CourseGrades[] }) {
  const missing = grades
    .map((g) => ({ course: g, count: g.ungraded.filter((u) => u.forecastScore === null).length }))
    .filter((m) => m.count > 0);
  if (missing.length === 0) {
    return null;
  }
  return (
    <Section title="Needs a forecast" footer="Forecast ungraded work to see where your grade is heading.">
      {missing.map(({ course, count }) => (
        <Row
          key={course.courseId}
          label={course.name}
          detail={`${count} ungraded ${count === 1 ? 'item' : 'items'} without a forecast`}
          onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.courseId } })}
        />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.two,
  },
  tileWrap: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  tile: {
    padding: Spacing.three,
    borderRadius: Radius.small,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
