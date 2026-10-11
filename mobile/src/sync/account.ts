/**
 * Which account the phone's gradebook belongs to.
 *
 * Signed out, the gradebook is the phone's own. On the first sign-in it joins
 * the account: the student's own courses are uploaded (merged with what the
 * account already has), but the untouched sample is dropped so it never
 * clutters the account. Signing in as someone else starts clean.
 */
import { getMeta, hasOwnCourses, setMeta, wipeLocalData, eraseGradebook } from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';

import { CURSOR_KEY } from './sync-engine';

export const ACCOUNT_KEY = 'account_id';

export type AttachResult = 'same_account' | 'joined' | 'switched';

export async function attachAccount(db: SqlDb, userId: string): Promise<AttachResult> {
  const current = await getMeta(db, ACCOUNT_KEY);
  if (current === userId) {
    return 'same_account';
  }
  if (current !== null) {
    await wipeLocalData(db);
    await setMeta(db, ACCOUNT_KEY, userId);
    return 'switched';
  }
  if (!(await hasOwnCourses(db))) {
    await eraseGradebook(db, false);
  }
  await setMeta(db, CURSOR_KEY, '0');
  await setMeta(db, ACCOUNT_KEY, userId);
  return 'joined';
}

/** The account the gradebook belongs to, or `null` when it is the phone's own. */
export function attachedAccount(db: SqlDb): Promise<string | null> {
  return getMeta(db, ACCOUNT_KEY);
}

/** Sign-out: the cloud keeps the grades; this phone's copy is removed. */
export async function detachAccount(db: SqlDb): Promise<void> {
  await wipeLocalData(db);
}
