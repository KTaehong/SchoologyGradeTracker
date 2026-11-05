import { describe, expect, it } from '@jest/globals';

import { formatRefreshed } from '@/lib/calendar-label';

describe('formatRefreshed', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  it('says how long ago the calendar was read', () => {
    expect(formatRefreshed(null, now)).toBe('Never');
    expect(formatRefreshed('2026-11-04T11:59:45Z', now)).toBe('Just now');
    expect(formatRefreshed('2026-11-04T11:48:00Z', now)).toBe('12 min ago');
    expect(formatRefreshed('2026-11-04T09:00:00Z', now)).toBe('3 hr ago');
    expect(formatRefreshed('2026-11-01T09:00:00Z', now)).not.toMatch(/ago/);
  });
});
