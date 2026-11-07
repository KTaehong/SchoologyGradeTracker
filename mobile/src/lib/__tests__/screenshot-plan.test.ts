import { describe, expect, it } from '@jest/globals';

import { parseScreenshot } from '@/import/screenshot-parser';

import { planScreenshotRows } from '../screenshot-plan';

const categories = [
  { id: 'tests', name: 'Tests' },
  { id: 'hw', name: 'Homework' },
];

describe('planScreenshotRows', () => {
  const parsed = parseScreenshot([
    'AP Biology: Section 3',
    'Tests (60%)',
    'Unit 1 Test 45 / 50',
    'Unit 2 Test — / 50',
    'Homework (40%)',
    'HW 1.1 10 / 10',
    'HW 1.2 Excused',
  ]);

  it('puts each row in the category its heading names', () => {
    const plan = planScreenshotRows(parsed.rows, categories, null);
    expect(plan.unmatched).toBe(0);
    expect(plan.save).toEqual([
      { categoryId: 'tests', title: 'Unit 1 Test', dueDate: null, maxScore: 50, actualScore: 45, excused: false },
      { categoryId: 'tests', title: 'Unit 2 Test', dueDate: null, maxScore: 50, actualScore: null, excused: false },
      { categoryId: 'hw', title: 'HW 1.1', dueDate: null, maxScore: 10, actualScore: 10, excused: false },
    ]);
    // "Excused" alone shows no points possible, so it is skipped with a reason.
    expect(plan.rows[3].skip).toMatch(/No points possible/);
  });

  it('sends rows without a matching heading to the picked category', () => {
    const cutOff = parseScreenshot(['Lab 4 9 / 10', 'Lab 5 8 / 10']);
    expect(planScreenshotRows(cutOff.rows, categories, null)).toMatchObject({
      unmatched: 2,
      save: [],
      rows: [{ skip: 'Pick a category for this row' }, { skip: 'Pick a category for this row' }],
    });
    const plan = planScreenshotRows(cutOff.rows, categories, 'hw');
    expect(plan.save.map((r) => [r.categoryId, r.title, r.actualScore])).toEqual([
      ['hw', 'Lab 4', 9],
      ['hw', 'Lab 5', 8],
    ]);
  });

  it('marks excused rows that show their points possible', () => {
    const plan = planScreenshotRows(
      [{ title: 'Retake', earned: null, max: 20, status: 'excused', dueDate: null, category: 'Tests' }],
      categories,
      null,
    );
    expect(plan.save).toEqual([
      { categoryId: 'tests', title: 'Retake', dueDate: null, maxScore: 20, actualScore: null, excused: true },
    ]);
  });

  it('keeps titles and scores within the cloud limits', () => {
    const plan = planScreenshotRows(
      [{ title: 'x'.repeat(400), earned: 5e9, max: 5e9, status: 'graded', dueDate: null, category: null }],
      categories,
      'tests',
    );
    expect(plan.save[0].title).toHaveLength(300);
    expect([plan.save[0].maxScore, plan.save[0].actualScore]).toEqual([999999.99, 999999.99]);
  });
});
