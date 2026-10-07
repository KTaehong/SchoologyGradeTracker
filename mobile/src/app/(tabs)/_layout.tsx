import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSession } from '@/api';
import { Loading } from '@/components/loading';
import AppTabs from '@/components/app-tabs';
import { hasSeenWelcome } from '@/data/storage';

/** The tabs, after the welcome screen has been seen once (or the student is already signed in). */
export default function TabsLayout() {
  const session = useSession();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    hasSeenWelcome()
      .catch(() => true)
      .then(setSeen);
  }, []);

  if (seen === null || session.status === 'loading') {
    return <Loading />;
  }
  if (!seen && session.status === 'signed_out') {
    return <Redirect href="/welcome" />;
  }
  return <AppTabs />;
}
