import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CourseGrades } from '@/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatGrade } from '@/lib/format-grade';
import { Radius, Spacing } from '@/theme/colors';

/** A course on Grades home: name, teacher, letter, current and projected grade. */
export function CourseCard({ course }: { course: CourseGrades }) {
  const projectedDiffers = course.projected.percent !== course.current.percent;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.courseId } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardText}>
            <ThemedText type="subtitle">{course.name}</ThemedText>
            {course.teacher ? <ThemedText themeColor="textSecondary">{course.teacher}</ThemedText> : null}
          </View>
          <ThemedText type="subtitle" accessibilityLabel={`Letter grade ${course.current.letter ?? 'none yet'}`}>
            {course.current.letter ?? 'N/A'}
          </ThemedText>
        </View>
        <ThemedText>Current: {formatGrade(course.current)}</ThemedText>
        {projectedDiffers ? (
          <ThemedText type="small" themeColor="textSecondary">
            Projected: {formatGrade(course.projected)}
          </ThemedText>
        ) : null}
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  cardText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
