import { describe, expect, it } from '@jest/globals';

import { calendarLinkKey } from '../calendar-link';

describe('calendarLinkKey', () => {
  it('gives each account its own key', () => {
    const a = calendarLinkKey('22222222-2222-4222-8222-222222222222');
    const b = calendarLinkKey('44444444-4444-4444-8444-444444444444');
    expect(a).not.toBe(b);
  });

  it('only uses characters secure storage accepts', () => {
    expect(calendarLinkKey('ab:c/d e')).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
