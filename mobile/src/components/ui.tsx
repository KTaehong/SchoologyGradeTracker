import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/theme/colors';
import { useTheme } from '@/theme/theme-preference';

/** A titled card that groups related rows or content. */
export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      {title ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          {title}
        </ThemedText>
      ) : null}
      <ThemedView type="backgroundElement" style={styles.section}>
        {children}
      </ThemedView>
      {footer ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionFooter}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A tappable row inside a Section, like a line in a phone's Settings app. */
export function Row({
  label,
  detail,
  destructive = false,
  onPress,
  right,
}: {
  label: string;
  detail?: string;
  destructive?: boolean;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const colors = useTheme();
  const content = (
    <>
      <View style={styles.rowText}>
        <ThemedText style={destructive ? { color: colors.danger } : undefined}>{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {right ?? (onPress && !destructive ? <ThemedText themeColor="textSecondary">›</ThemedText> : null)}
    </>
  );

  if (!onPress) {
    // Not tappable: a plain container, so controls inside it (like a Switch) stay usable.
    return <View style={[styles.row, { borderBottomColor: colors.backgroundSelected }]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.backgroundSelected },
        pressed && { backgroundColor: colors.backgroundSelected },
      ]}>
      {content}
    </Pressable>
  );
}

/** A row with an on/off switch. */
export function SwitchRow({
  label,
  detail,
  value,
  onValueChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const colors = useTheme();
  return (
    <Row
      label={label}
      detail={detail}
      right={
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onValueChange}
          trackColor={{ true: colors.accent }}
        />
      }
    />
  );
}

/** A full-width button. `primary` is filled with the accent color. */
export function Button({
  label,
  onPress,
  variant = 'secondary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const colors = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? colors.accent : colors.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={{ color: primary ? colors.onAccent : colors.text }}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.two,
  },
  sectionFooter: {
    paddingHorizontal: Spacing.two,
  },
  section: {
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
  },
  pressed: {
    opacity: 0.7,
  },
});
