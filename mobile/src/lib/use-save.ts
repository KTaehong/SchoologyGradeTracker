import { router } from 'expo-router';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';

/**
 * For a form sheet: runs a save, shows its error, and closes the sheet when it
 * succeeds (or runs `then` instead, to go somewhere else).
 */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async <T>(action: () => Promise<T>, then: (result: T) => void = () => router.back()) => {
    setBusy(true);
    setError(null);
    try {
      then(await action());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, setError, save };
}
