import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

import { errorMessage, finishAuthLink } from '@/api';
import { Loading } from '@/components/loading';
import { showMessage } from '@/lib/coming-soon';

/**
 * Where sign-in links send the student back (`gradetracker://auth/callback`).
 *
 * - Google sign-in: the sign-in screen reads the link itself (see
 *   signInWithProvider); if the app also opens this route, just go back.
 * - A link from an email: "confirm your account" signs the student in, and
 *   "reset your password" signs them in and opens the new-password screen.
 */
export default function AuthCallbackScreen() {
  const { code, error, error_description } = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
    let cancelled = false;
    const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

    finishAuthLink({ code, error, error_description })
      .then((result) => {
        if (cancelled) return;
        if (result === 'recovery') {
          router.replace('/new-password');
        } else {
          leave();
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        leave();
        showMessage('Could not open that link', errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [code, error, error_description]);

  return <Loading />;
}
