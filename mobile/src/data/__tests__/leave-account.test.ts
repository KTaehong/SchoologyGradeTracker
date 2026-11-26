import { describe, expect, it, jest } from '@jest/globals';

import { deleteAccountHere, signOutHere, UnsentChangesError, type LeaveAccountDeps } from '../leave-account';

function deps(unsent = 0) {
  const steps: string[] = [];
  const d = {
    sync: jest.fn(async () => {
      steps.push('sync');
    }),
    countUnsent: jest.fn(async () => unsent),
    signOut: jest.fn(async (scope: 'global' | 'local') => {
      steps.push(`signOut:${scope}`);
    }),
    forgetLocalCopy: jest.fn(async () => {
      steps.push('forget');
    }),
  } satisfies LeaveAccountDeps;
  return { d, steps };
}

describe('signOutHere', () => {
  it('syncs first, then signs out this phone only', async () => {
    const { d, steps } = deps();
    await signOutHere(d);
    expect(steps).toEqual(['sync', 'signOut:local', 'forget']);
  });

  it('stops when changes are still unsent', async () => {
    const { d, steps } = deps(3);
    const error = await signOutHere(d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsentChangesError);
    expect(error).toMatchObject({ count: 3, message: expect.stringContaining('3 changes have not reached') });
    expect(steps).toEqual(['sync']);
  });

  it('signs out anyway when asked to, and still only here', async () => {
    const { d, steps } = deps(1);
    await signOutHere(d, true);
    expect(steps).toEqual(['sync', 'signOut:local', 'forget']);
  });

  it('keeps the phone copy when the sign-out fails', async () => {
    const { d } = deps();
    d.signOut.mockRejectedValue(new Error('offline'));
    await expect(signOutHere(d)).rejects.toThrow('offline');
    expect(d.forgetLocalCopy).not.toHaveBeenCalled();
  });

  it('works with no gradebook open yet', async () => {
    const { d, steps } = deps();
    await signOutHere({ signOut: d.signOut, forgetLocalCopy: d.forgetLocalCopy });
    expect(steps).toEqual(['signOut:local', 'forget']);
  });
});

describe('deleteAccountHere', () => {
  function deleting(fail?: Error) {
    const { d, steps } = deps();
    const all = {
      ...d,
      deleteAccount: jest.fn(async () => {
        if (fail) throw fail;
        steps.push('delete');
      }),
      cancelPendingSync: jest.fn(() => {
        steps.push('cancel');
      }),
      forgetCalendarLink: jest.fn(async () => {
        steps.push('calendar');
      }),
    };
    return { all, steps };
  }

  it('deletes, then forgets the calendar link and the session on every device', async () => {
    const { all, steps } = deleting();
    await deleteAccountHere(all);
    expect(steps).toEqual(['delete', 'cancel', 'calendar', 'signOut:global', 'forget']);
  });

  it('still clears the phone when the server refuses the sign-out of a deleted account', async () => {
    const { all } = deleting();
    all.signOut.mockRejectedValue(new Error('user not found'));
    all.forgetCalendarLink.mockRejectedValue(new Error('storage'));
    await deleteAccountHere(all);
    expect(all.forgetLocalCopy).toHaveBeenCalled();
  });

  it('changes nothing on the phone when the delete fails', async () => {
    const { all, steps } = deleting(new Error('offline'));
    await expect(deleteAccountHere(all)).rejects.toThrow('offline');
    expect(steps).toEqual([]);
  });
});
