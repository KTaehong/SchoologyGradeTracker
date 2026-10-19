import { describe, expect, it } from '@jest/globals';

import { tabsGate } from '../tabs-gate';

describe('tabsGate', () => {
  it('waits only for the quick welcome check once Welcome was seen', () => {
    expect(tabsGate(null, 'signed_out')).toBe('wait');
    expect(tabsGate(true, 'loading')).toBe('tabs');
    expect(tabsGate(true, 'signed_out')).toBe('tabs');
  });

  it('sends a new, signed-out student to Welcome', () => {
    expect(tabsGate(false, 'loading')).toBe('wait');
    expect(tabsGate(false, 'signed_out')).toBe('welcome');
    expect(tabsGate(false, 'signed_in')).toBe('tabs');
  });
});
