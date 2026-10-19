import { describe, expect, it } from '@jest/globals';

import { numberText, validateAssignment, validateCategory, validateCourse } from '../gradebook-form';

describe('validateCourse', () => {
  it('trims the fields and treats an empty teacher as none', () => {
    expect(validateCourse({ name: '  AP Biology ', teacher: '  ', gradingMode: 'weighted' })).toEqual({
      ok: true,
      value: { name: 'AP Biology', teacher: null, gradingMode: 'weighted' },
    });
  });

  it('needs a name of at most 200 characters', () => {
    expect(validateCourse({ name: ' ', teacher: '', gradingMode: 'points' }).ok).toBe(false);
    expect(validateCourse({ name: 'x'.repeat(201), teacher: '', gradingMode: 'points' }).ok).toBe(false);
  });
});

describe('validateCategory', () => {
  it('reads the weight and drop-lowest', () => {
    expect(validateCategory({ name: 'Tests', weight: '40%', dropLowest: '1' })).toEqual({
      ok: true,
      value: { name: 'Tests', weight: 40, dropLowest: 1 },
    });
  });

  it('allows an empty weight and drop-lowest', () => {
    expect(validateCategory({ name: 'Tests', weight: '', dropLowest: '' })).toEqual({
      ok: true,
      value: { name: 'Tests', weight: null, dropLowest: 0 },
    });
  });

  it.each([
    [{ name: '', weight: '40', dropLowest: '' }],
    [{ name: 'Tests', weight: 'forty', dropLowest: '' }],
    [{ name: 'Tests', weight: '40', dropLowest: '1.5' }],
    [{ name: 'Tests', weight: '40', dropLowest: '-1' }],
  ])('rejects %p', (form) => {
    expect(validateCategory(form).ok).toBe(false);
  });
});

describe('validateAssignment', () => {
  const form = {
    title: ' Lab 3 ',
    actualScore: '18',
    maxScore: '20',
    dueDate: '',
    excused: false,
    extraCredit: false,
  };

  it('builds the assignment', () => {
    expect(validateAssignment(form)).toEqual({
      ok: true,
      value: {
        title: 'Lab 3',
        actualScore: 18,
        maxScore: 20,
        dueDate: null,
        excused: false,
        extraCredit: false,
      },
    });
  });

  it('treats an empty score as not graded yet', () => {
    const result = validateAssignment({ ...form, actualScore: ' ', dueDate: '2026-10-20' });
    expect(result.ok && result.value).toMatchObject({ actualScore: null, dueDate: '2026-10-20' });
  });

  it('allows 0 points possible only for extra credit (as the server does)', () => {
    expect(validateAssignment({ ...form, maxScore: '0' }).ok).toBe(false);
    expect(validateAssignment({ ...form, maxScore: '0', actualScore: '2', extraCredit: true }).ok).toBe(true);
  });

  it.each([
    [{ title: '' }],
    [{ maxScore: '' }],
    [{ actualScore: 'A' }],
    [{ dueDate: '10/20/2026' }],
    [{ dueDate: '2026-02-30' }],
  ])('rejects %p', (change) => {
    expect(validateAssignment({ ...form, ...change }).ok).toBe(false);
  });
});

describe('numberText', () => {
  it('shows a number, or nothing', () => {
    expect(numberText(40)).toBe('40');
    expect(numberText(null)).toBe('');
    expect(numberText(undefined)).toBe('');
  });
});
