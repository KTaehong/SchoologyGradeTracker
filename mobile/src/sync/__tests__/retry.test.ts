import { describe, expect, it } from '@jest/globals';

import { retryDelayMs } from '../retry';

describe('retryDelayMs', () => {
  it('does not retry a sync that worked or is still running', () => {
    expect(retryDelayMs('idle', 0)).toBeNull();
    expect(retryDelayMs('syncing', 3)).toBeNull();
  });

  it('retries a failed sync soon, then less and less often', () => {
    expect(retryDelayMs('offline', 1)).toBe(5_000);
    expect(retryDelayMs('error', 2)).toBe(15_000);
    expect(retryDelayMs('offline', 3)).toBe(30_000);
    expect(retryDelayMs('offline', 4)).toBe(60_000);
  });

  it('keeps trying once a minute for as long as it takes', () => {
    expect(retryDelayMs('offline', 50)).toBe(60_000);
  });
});
