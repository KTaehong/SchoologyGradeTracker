import { describe, expect, it } from '@jest/globals';
import { createDemoGradebook } from '../demo';
import { resolveInitialGradebook } from '../initial-gradebook';
import { createEmptyGradebook } from '../types';

const NOW = new Date(2026, 8, 24);

describe('resolveInitialGradebook', () => {
  it('seeds the demo gradebook on first launch and saves it', () => {
    const { gradebook, needsSave } = resolveInitialGradebook({ kind: 'missing' }, NOW);
    expect(gradebook).toEqual(createDemoGradebook(NOW));
    expect(needsSave).toBe(true);
  });

  it('keeps an erased gradebook empty instead of re-seeding the demo', () => {
    const empty = createEmptyGradebook(NOW);
    const { gradebook, needsSave } = resolveInitialGradebook({ kind: 'loaded', gradebook: empty }, NOW);
    expect(gradebook).toBe(empty);
    expect(gradebook.courses).toHaveLength(0);
    expect(needsSave).toBe(false);
  });

  it('replaces a damaged save with the demo gradebook', () => {
    const { gradebook, needsSave } = resolveInitialGradebook({ kind: 'invalid' }, NOW);
    expect(gradebook.courses.length).toBeGreaterThan(0);
    expect(needsSave).toBe(true);
  });
});
