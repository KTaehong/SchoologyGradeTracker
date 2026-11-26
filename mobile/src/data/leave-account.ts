/**
 * Leaving an account on this phone: signing out, and deleting the account.
 * The gradebook store passes in what these need, so the rules can be tested
 * on their own (src/data/__tests__/leave-account.test.ts).
 */

/** Signing out now would lose changes that are only on this phone. */
export class UnsentChangesError extends Error {
  constructor(readonly count: number) {
    super(
      `${count} ${count === 1 ? 'change has' : 'changes have'} not reached the cloud yet. Connect to the internet and try again.`,
    );
    this.name = 'UnsentChangesError';
  }
}

export type LeaveAccountDeps = {
  /** Syncs once more; never rejects. `undefined` when there is no sync engine. */
  sync?: () => Promise<void>;
  /** Changes on this phone not yet in the cloud. `undefined` when there is no gradebook. */
  countUnsent?: () => Promise<number>;
  signOut: (scope: 'global' | 'local') => Promise<void>;
  /** Removes the account's copy from this phone and shows the signed-out app. */
  forgetLocalCopy: () => Promise<void>;
};

/**
 * Signs out on this phone only, after one last try to send its changes.
 * Throws UnsentChangesError when changes are still unsent, unless `discardUnsent`.
 */
export async function signOutHere(deps: LeaveAccountDeps, discardUnsent = false): Promise<void> {
  await deps.sync?.();
  if (deps.countUnsent && !discardUnsent) {
    const unsent = await deps.countUnsent();
    if (unsent > 0) throw new UnsentChangesError(unsent);
  }
  // This phone only: signing out here must not sign the student out on their
  // other devices (which may have their own unsent changes).
  await deps.signOut('local');
  await deps.forgetLocalCopy();
}

/**
 * Deletes the account in the cloud, then everything about it on this phone.
 * If the delete fails, nothing on the phone changes.
 */
export async function deleteAccountHere(
  deps: LeaveAccountDeps & {
    deleteAccount: () => Promise<void>;
    /** Stops a sync that is waiting to start. */
    cancelPendingSync: () => void;
    forgetCalendarLink: () => Promise<void>;
  },
): Promise<void> {
  await deps.deleteAccount();
  deps.cancelPendingSync();
  await deps.forgetCalendarLink().catch(() => undefined);
  // The account is gone, so the server may refuse the sign-out; the phone
  // forgets the session either way. Global: every device's session ends.
  await deps.signOut('global').catch(() => undefined);
  await deps.forgetLocalCopy();
}
