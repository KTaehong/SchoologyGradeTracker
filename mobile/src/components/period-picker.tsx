import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/theme/colors';
import { useTheme } from '@/theme/theme-preference';

/** A row of pills for choosing a grading period (Q1, Q2, …), or any short list. */
export function PeriodPicker({
  names,
  selected,
  onSelect,
}: {
  names: string[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.periods} accessibilityRole="tablist">
      {names.map((name, index) => {
        const isSelected = index === selected;
        return (
          <Pressable
            key={`${index}-${name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(index)}
            style={[
              styles.period,
              { backgroundColor: isSelected ? colors.accent : colors.backgroundSelected },
            ]}>
            <ThemedText style={{ color: isSelected ? colors.onAccent : colors.text }}>{name}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  periods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  period: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
  },
});
