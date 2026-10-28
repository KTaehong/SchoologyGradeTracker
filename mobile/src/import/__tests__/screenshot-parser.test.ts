import { describe, expect, it } from '@jest/globals';

import { matchCategory, matchCourse, parseScreenshot, toLines } from '../screenshot-parser';

describe('parseScreenshot', () => {
  it('reads names and scores that come one after the other (iPhone text reader)', () => {
    const result = parseScreenshot([
      'AP Biology: Section 3',
      'Tests (40%)',
      'Unit 1 Test',
      'Due 9/18/26 11:59pm',
      '45 / 50',
      'Unit 2 Test',
      '38/50 (76%)',
      'Homework (20%)',
      'Cell Organelles Worksheet',
      '10/10',
    ]);

    expect(result.rows).toEqual([
      { title: 'Unit 1 Test', earned: 45, max: 50, status: 'graded', dueDate: '2026-09-18', category: 'Tests' },
      { title: 'Unit 2 Test', earned: 38, max: 50, status: 'graded', dueDate: null, category: 'Tests' },
      {
        title: 'Cell Organelles Worksheet',
        earned: 10,
        max: 10,
        status: 'graded',
        dueDate: null,
        category: 'Homework',
      },
    ]);
    expect(result.categories).toEqual(['Tests', 'Homework']);
    expect(result.header).toEqual(['AP Biology: Section 3']);
    expect(result.needsReview).toBe(false);
  });

  it('pairs a column of names with a column of scores (Android text blocks)', () => {
    const result = parseScreenshot(
      toLines(['Quizzes (30%)\nQuiz 1\nQuiz 2\nQuiz 3', '18 / 20\nMissing\n—']),
    );

    expect(result.rows.map((r) => [r.title, r.earned, r.max, r.status, r.category])).toEqual([
      ['Quiz 1', 18, 20, 'graded', 'Quizzes'],
      ['Quiz 2', null, null, 'missing', 'Quizzes'],
      ['Quiz 3', null, null, 'ungraded', 'Quizzes'],
    ]);
    expect(result.needsReview).toBe(false);
  });

  it('reads a name, date, and score on one line and strips the date', () => {
    const result = parseScreenshot([
      'Form: HW/CW/Part. (10%)',
      'HW: 8.1 Basic Integration Rules 9/01/26 11:59pm 10 / 10',
      'Quiz Sections 8.1-8.3 Sep 9, 2026 18/20',
      'Lab Report 2 excused',
    ]);

    expect(result.categories).toEqual(['Form: HW/CW/Part.']);
    expect(result.rows.map((r) => [r.title, r.earned, r.max, r.dueDate, r.status])).toEqual([
      ['HW: 8.1 Basic Integration Rules', 10, 10, '2026-09-01', 'graded'],
      ['Quiz Sections 8.1-8.3', 18, 20, '2026-09-09', 'graded'],
      ['Lab Report 2', null, null, null, 'excused'],
    ]);
  });

  it('keeps an ungraded row that shows its points possible', () => {
    const [row] = parseScreenshot(['Final Project', '— / 100']).rows;
    expect(row).toMatchObject({ title: 'Final Project', earned: null, max: 100, status: 'ungraded' });
  });

  it('fixes letters the text reader mistakes for digits', () => {
    const [row] = parseScreenshot(['Essay 1', '1O / lO0']).rows;
    expect(row).toMatchObject({ earned: 10, max: 100 });
  });

  it('reads decimal and extra-credit scores', () => {
    const rows = parseScreenshot(['Lab 4', '9.5 / 10', 'Bonus Question', '2 / 0']).rows;
    expect(rows.map((r) => [r.earned, r.max])).toEqual([
      [9.5, 10],
      [2, 0],
    ]);
  });

  it('skips page labels, category grades, and letter grades', () => {
    const result = parseScreenshot([
      'Grades',
      'Course Grade',
      'B+',
      '88.4%',
      'Due',
      'Score',
      'Quiz 1',
      '9/10',
    ]);
    expect(result.rows.map((r) => r.title)).toEqual(['Quiz 1']);
    expect(result.needsReview).toBe(false);
  });

  it('flags names without scores and scores without names for review', () => {
    const extraName = parseScreenshot(['Quiz 1', 'Quiz 2', '9/10']);
    expect(extraName.rows.map((r) => r.title)).toEqual(['Quiz 1']);
    expect(extraName.leftoverTitles).toEqual(['Quiz 2']);
    expect(extraName.needsReview).toBe(true);

    const extraScore = parseScreenshot(['9/10', 'Quiz 1', '8/10']);
    expect(extraScore.leftoverScores).toEqual(['9/10']);
    expect(extraScore.rows.map((r) => [r.title, r.earned])).toEqual([['Quiz 1', 8]]);
    expect(extraScore.needsReview).toBe(true);
  });

  it('does not take words with a slash for a score', () => {
    const result = parseScreenshot(['Read/Il Ch. 3', '5/5']);
    expect(result.rows).toEqual([expect.objectContaining({ title: 'Read/Il Ch. 3', earned: 5, max: 5 })]);
  });

  it('returns nothing for an empty or unrelated picture', () => {
    expect(parseScreenshot([]).rows).toEqual([]);
    expect(parseScreenshot(['Grades', '12:41']).needsReview).toBe(false);
  });
});

describe('toLines', () => {
  it('splits blocks into trimmed, non-empty lines', () => {
    expect(toLines([' Quiz 1 \n\n9/10', 'Quiz 2\r\n8/10'])).toEqual(['Quiz 1', '9/10', 'Quiz 2', '8/10']);
  });
});

describe('matchCourse', () => {
  const courses = [
    { id: 'bio', name: 'AP Biology' },
    { id: 'calc', name: 'Calculus BC AP: P5' },
    { id: 'eng', name: 'English 11' },
  ];

  it('finds the class named on the page', () => {
    expect(matchCourse(['AP Biology: Section 3', 'Quiz 1'], courses)?.id).toBe('bio');
  });

  it('matches the part of the name before the colon', () => {
    expect(matchCourse(['Calculus BC AP', 'Quiz 1'], courses)?.id).toBe('calc');
  });

  it('needs whole words, so "English 1" is not "English 11"', () => {
    expect(matchCourse(['English 1 Honors'], courses)).toBeNull();
  });

  it('returns null when the class name was cut off', () => {
    expect(matchCourse(['Quiz 1', '9/10'], courses)).toBeNull();
  });
});

describe('matchCategory', () => {
  const categories = [
    { id: 't', name: 'Tests' },
    { id: 'hw', name: 'Homework' },
    { id: 'f', name: 'Formative' },
  ];

  it('matches the same name, ignoring case and punctuation', () => {
    expect(matchCategory('tests', categories)?.id).toBe('t');
  });

  it('matches when one name contains the other', () => {
    expect(matchCategory('Formative Assessments', categories)?.id).toBe('f');
    expect(matchCategory('Homework & Classwork', categories)?.id).toBe('hw');
  });

  it('returns null for a heading it cannot place, or no heading', () => {
    expect(matchCategory('Form: HW/CW/Part.', categories)).toBeNull();
    expect(matchCategory(null, categories)).toBeNull();
  });
});
