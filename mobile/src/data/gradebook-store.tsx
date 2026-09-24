import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { createDemoGradebook } from './demo';
import { resolveInitialGradebook } from './initial-gradebook';
import { loadGradebook, saveGradebook } from './storage';
import { createEmptyGradebook, type Gradebook } from './types';

type GradebookState = { status: 'loading' } | { status: 'ready'; gradebook: Gradebook };

type GradebookContextValue = {
  state: GradebookState;
  /** Replace everything with the demo gradebook. */
  loadDemo: () => Promise<void>;
  /** Erase every course and upcoming item. */
  eraseAll: () => Promise<void>;
};

const GradebookContext = createContext<GradebookContextValue | null>(null);

export function GradebookProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GradebookState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadGradebook().catch(() => ({ kind: 'invalid' }) as const);
      const { gradebook, needsSave } = resolveInitialGradebook(result);
      if (needsSave) {
        await saveGradebook(gradebook).catch(() => undefined);
      }
      if (!cancelled) {
        setState({ status: 'ready', gradebook });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Show the new gradebook right away, then save it to the phone. */
  const replace = useCallback(async (gradebook: Gradebook) => {
    setState({ status: 'ready', gradebook });
    await saveGradebook(gradebook);
  }, []);

  const loadDemo = useCallback(() => replace(createDemoGradebook()), [replace]);
  const eraseAll = useCallback(() => replace(createEmptyGradebook()), [replace]);

  const value = useMemo(() => ({ state, loadDemo, eraseAll }), [state, loadDemo, eraseAll]);

  return <GradebookContext.Provider value={value}>{children}</GradebookContext.Provider>;
}

export function useGradebook() {
  const context = useContext(GradebookContext);
  if (!context) {
    throw new Error('useGradebook must be used inside GradebookProvider');
  }
  return context;
}
