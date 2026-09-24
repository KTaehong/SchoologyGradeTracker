import { describe, expect, it } from '@jest/globals';
import { formatDayLabel, groupUpcomingByDay } from '../upcoming';
import { type UpcomingItem } from '../types';

const NOW = new Date(2026, 8, 24, 10, 0, 0); // Thu Sep 24 2026, 10:00 local

const item = (id: string, due: Date): UpcomingItem => ({
  id,
  title: id,
  courseId: null,
  dueAt: due.toISOString(),
  url: null,
});

describe('groupUpcomingByDay', () => {
  it('groups by local day, soonest first, and drops items before today', () => {
    const items = [
      item('later', new Date(2026, 8, 27, 23, 59)),
      item('yesterday', new Date(2026, 8, 23, 23, 59)),
      item('today-late', new Date(2026, 8, 24, 23, 59)),
      item('today-early', new Date(2026, 8, 24, 8, 0)),
      item('tomorrow', new Date(2026, 8, 25, 12, 0)),
    ];
    const days = groupUpcomingByDay(items, NOW);
    expect(days.map((d) => d.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-27']);
    expect(days[0].items.map((i) => i.id)).toEqual(['today-early', 'today-late']);
  });

  it('returns nothing for an empty agenda', () => {
    expect(groupUpcomingByDay([], NOW)).toEqual([]);
  });
});

describe('formatDayLabel', () => {
  it('names today and tomorrow', () => {
    expect(formatDayLabel('2026-09-24', NOW)).toBe('Today');
    expect(formatDayLabel('2026-09-25', NOW)).toBe('Tomorrow');
  });

  it('uses a short date further out', () => {
    expect(formatDayLabel('2026-09-28', NOW)).toMatch(/28/);
  });
});
