import AppTabs from '@/components/app-tabs';

/** The tabs. Only a signed-in student gets here (see the guard in ../_layout.tsx). */
export default function TabsLayout() {
  return <AppTabs />;
}
