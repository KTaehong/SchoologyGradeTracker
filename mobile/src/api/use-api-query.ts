import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

/**
 * Loads data from the API whenever the screen comes into view, so a screen
 * shows fresh grades after a forecast is changed on another screen.
 * Data already on screen stays visible while it reloads.
 *
 * `key` names what is loaded (for example `course:<id>`); a new key starts over.
 */
export function useApiQuery<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ key: string; value: QueryState<T> }>({
    key,
    value: { status: 'loading' },
  });
  // The latest `load`, so a screen can pass an inline function without reloading every render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ key, value: { status: 'ready', data } });
    } catch (error) {
      setState({ key, value: { status: 'error', error } });
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const current: QueryState<T> = state.key === key ? state.value : { status: 'loading' };
  return { state: current, reload };
}
