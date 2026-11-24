/**
 * Which account the phone's gradebook belongs to.
 *
 * Signed out, the gradebook is the phone's own. On the first sign-in it joins
 * the account: the student's own courses are uploaded (merged with what the
 * account already has), but the untouched sample is dropped so it never
 * clutters the account. Signing in as someone else starts clean, but asks
 * first when the previous account has changes that never reached the cloud.
 */
import { countPendingChanges, eraseGradebook, getMeta, hasOwnCourses, setMeta, wipeLocalData, wipeRows } from '@/db/gradebook-repo';
import type { SqlDb } from '@/db/sql';

import { ACCOUNT_KEY, CURSOR_KEY } from './sync-engine';

export type AttachResult = 'same_account' | 'joined' | 'switched';

/** The student chose to keep the previous account's unsent changes. */
export class AccountSwitchCancelled extends Error {
  constructor() {
    super('This phone still has another account’s unsent changes.');
    this.name = 'AccountSwitchCancelled';
  }
}

/**
 * Makes the gradebook `userId`'s. `confirmDiscard` is asked before another
 * account's unsent changes (how many) are deleted; answering `false` rejects
 * with AccountSwitchCancelled and changes nothing.
 */
export async function attachAccount(
  db: SqlDb,
  userId: string,
  confirmDiscard: (unsent: number) => Promise<boolean> = async () => false,
): Promise<AttachResult> {
  const current = await getMeta(db, ACCOUNT_KEY);
  if (current === userId) {
    return 'same_account';
  }
  if (current !== null) {
    const unsent = await countPendingChanges(db);
    if (unsent > 0 && !(await confirmDiscard(unsent))) {
      throw new AccountSwitchCancelled();
    }
    // One transaction, so no sync can write in between.
    await db.transaction(async () => {
      await wipeRows(db);
      await setMeta(db, ACCOUNT_KEY, userId);
    });
    return 'switched';
  }
  if (!(await hasOwnCourses(db))) {
    await eraseGradebook(db, false);
  }
  await db.transaction(async () => {
    await setMeta(db, CURSOR_KEY, '0');
    await setMeta(db, ACCOUNT_KEY, userId);
  });
  return 'joined';
}

/** Sign-out: the cloud keeps the grades; this phone's copy is removed. */
export async function detachAccount(db: SqlDb): Promise<void> {
  await wipeLocalData(db);
}
