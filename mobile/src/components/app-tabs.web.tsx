import { Tabs } from 'expo-router';

import { useTheme } from '@/theme/theme-preference';

/**
 * Web preview only. Native tabs float over the top of the page on web and cover each
 * screen's title row, so the browser gets a regular bottom tab bar instead.
 */
export default function AppTabs() {
  const colors = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.backgroundSelected },
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 14 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Grades' }} />
      <Tabs.Screen name="upcoming" options={{ title: 'Upcoming' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
