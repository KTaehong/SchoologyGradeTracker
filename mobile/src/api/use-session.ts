import { useEffect, useState } from 'react';

import { getSession, onSessionChange, type Session } from './auth';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; session: Session };

function toState(session: Session | null): SessionState {
  return session ? { status: 'signed_in', session } : { status: 'signed_out' };
}

/** The current sign-in state, kept up to date. Signed out when the API is not configured. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Listen first: an event is always newer than the saved session read below.
    let heard = false;
    const unsubscribe = onSessionChange((session) => {
      heard = true;
      if (!cancelled) setState(toState(session));
    });
    getSession()
      .catch(() => null)
      .then((session) => {
        if (!cancelled && !heard) {
          setState(toState(session));
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
