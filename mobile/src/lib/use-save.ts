import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/api/errors';

/**
 * For a form sheet: runs a save, shows its error, and closes the sheet when it
 * succeeds (or runs `then` instead, to stay or go somewhere else).
 *
 * A second tap (or the keyboard's Enter key) while a save is running does
 * nothing, so nothing is ever saved twice.
 */
export function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  /** Closes the sheet, unless the student already closed it while the save ran. */
  const close = () => {
    if (open.current && router.canGoBack()) router.back();
  };
  const save = async <T>(action: () => Promise<T>, then: (result: T) => void = close) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      then(await action());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      // Also after a success: a sheet that stays open (the calendar screen)
      // must get its buttons back.
      running.current = false;
      if (open.current) setBusy(false);
    }
  };
  return { busy, error, setError, save };
}
