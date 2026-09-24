import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/theme/colors';
import { useTheme } from '@/theme/theme-preference';

/** Small pill button that sits next to a screen title, such as "+ Add". */
export function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accent },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={{ color: colors.onAccent }}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
  },
  pressed: {
    opacity: 0.7,
  },
});
