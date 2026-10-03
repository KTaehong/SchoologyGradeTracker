import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

import { Loading } from '@/components/loading';

/**
 * Where Google / Apple / Microsoft sign-in sends the student back
 * (`gradetracker://auth/callback`). The sign-in screen reads the link itself
 * (see signInWithProvider); if the app also opens this route, just go back.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, []);

  return <Loading />;
}
