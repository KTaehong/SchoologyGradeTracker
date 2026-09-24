import {
  GRADEBOOK_SCHEMA_VERSION,
  type Assignment,
  type Category,
  type Course,
  type Gradebook,
  type GradingMode,
  type UpcomingItem,
} from './types';

/**
 * A realistic sample gradebook so the app has something to show before real grades are
 * imported. Dates are relative to `now`, so graded work is always in the recent past and
 * the agenda is always in the near future.
 */
export function createDemoGradebook(now: Date = new Date()): Gradebook {
  const day = (offset: number) => toDateOnly(addDays(now, offset));

  // [title, score, maxScore, daysAgo, extra flags]
  type Row = [string, number | null, number, number, Pick<Assignment, 'excused' | 'extraCredit'>?];

  const assignments = (prefix: string, rows: Row[]): Assignment[] =>
    rows.map(([title, score, maxScore, daysAgo, flags], index) => ({
      id: `${prefix}-a${index + 1}`,
      title,
      score,
      maxScore,
      dueDate: day(-daysAgo),
      ...flags,
    }));

  const category = (
    id: string,
    name: string,
    weight: number | null,
    rows: Row[],
    dropLowest?: number,
  ): Category => ({
    id,
    name,
    weight,
    ...(dropLowest ? { dropLowest } : {}),
    assignments: assignments(id, rows),
  });

  /** Q1 holds the graded work; Q2 has the same categories with nothing graded yet. */
  const course = (
    id: string,
    name: string,
    teacher: string,
    gradingMode: GradingMode,
    q1: Category[],
  ): Course => ({
    id,
    name,
    teacher,
    gradingMode,
    periods: [
      { id: `${id}-q1`, name: 'Q1', categories: q1 },
      {
        id: `${id}-q2`,
        name: 'Q2',
        categories: q1.map((c) => ({
          id: c.id.replace('-q1-', '-q2-'),
          name: c.name,
          weight: c.weight,
          ...(c.dropLowest ? { dropLowest: c.dropLowest } : {}),
          assignments: [],
        })),
      },
    ],
  });

  const courses: Course[] = [
    course('calc-bc', 'AP Calculus BC', 'Ms. Rivera', 'weighted', [
      category('calc-bc-q1-tests', 'Tests', 50, [
        ['Unit 1 Test: Limits', 88, 100, 30],
        ['Unit 2 Test: Derivatives', 92, 100, 9],
      ]),
      category('calc-bc-q1-quizzes', 'Quizzes', 30, [
        ['Quiz 1.1', 9, 10, 35],
        ['Quiz 1.2', 8, 10, 26],
        ['Quiz 2.1', 10, 10, 16],
        ['Quiz 2.2', null, 10, 2],
      ]),
      category(
        'calc-bc-q1-homework',
        'Homework',
        20,
        [
          ['Problem Set 1', 10, 10, 38],
          ['Problem Set 2', 7, 10, 31],
          ['Problem Set 3', 10, 10, 24],
          ['Problem Set 4', 0, 10, 17],
          ['Problem Set 5', 9, 10, 10],
        ],
        1,
      ),
    ]),
    course('physics-em', 'AP Physics C: E&M', 'Mr. Okafor', 'weighted', [
      category('physics-em-q1-tests', 'Tests', 50, [
        ['Electrostatics Test', 41, 50, 20],
      ]),
      category('physics-em-q1-labs', 'Labs', 25, [
        ["Coulomb's Law Lab", 18, 20, 33],
        ['Electric Field Mapping Lab', 19, 20, 19],
        ['Capacitor Lab', null, 20, 5, { excused: true }],
      ]),
      category('physics-em-q1-problem-sets', 'Problem Sets', 25, [
        ['PS 1: Charge & Force', 14, 15, 36],
        ['PS 2: Gauss’s Law', 12, 15, 22],
        ['PS 3: Potential', 15, 15, 8],
      ]),
    ]),
    course('english-lit', 'AP English Literature', 'Dr. Chen', 'weighted', [
      category('english-lit-q1-essays', 'Essays', 50, [
        ['Poetry Analysis Essay', 44, 50, 25],
        ['Prose Timed Write', 7, 9, 11],
      ]),
      category('english-lit-q1-reading', 'Reading Quizzes', 30, [
        ['Frankenstein Ch. 1–5', 9, 10, 32],
        ['Frankenstein Ch. 6–12', 10, 10, 23],
        ['Frankenstein Ch. 13–24', 8, 10, 14],
        ['Bonus: Author Research', 3, 0, 12, { extraCredit: true }],
      ]),
      category('english-lit-q1-participation', 'Participation', 20, [
        ['Seminar 1', 10, 10, 29],
        ['Seminar 2', 9, 10, 15],
      ]),
    ]),
    course('spanish', 'AP Spanish Language', 'Sra. Morales', 'points', [
      category('spanish-q1-all', 'All work', null, [
        ['Vocab Quiz: Familia', 18, 20, 34],
        ['Presentational Speaking', 45, 50, 21],
        ['Email Reply', 24, 25, 13],
        ['Unit 1 Exam', 88, 100, 6],
      ]),
    ]),
    course('us-gov', 'AP US Government', 'Mr. Patel', 'weighted', [
      category('us-gov-q1-tests', 'Tests', 60, [
        ['Unit 1: Foundations', 47, 55, 18],
      ]),
      category('us-gov-q1-classwork', 'Classwork', 40, [
        ['Federalist 10 Reading Notes', 10, 10, 37],
        ['Constitution Scavenger Hunt', 19, 20, 27],
        ['Court Case Brief', 14, 15, 7],
      ]),
    ]),
  ];

  const dueAt = (daysAhead: number) => {
    const due = addDays(now, daysAhead);
    due.setHours(23, 59, 0, 0);
    return due.toISOString();
  };

  const upcoming: UpcomingItem[] = [
    { id: 'up-1', title: 'Problem Set 6', courseId: 'calc-bc', dueAt: dueAt(1), url: null },
    { id: 'up-2', title: 'Seminar 3 prep questions', courseId: 'english-lit', dueAt: dueAt(1), url: null },
    { id: 'up-3', title: 'PS 4: Capacitance', courseId: 'physics-em', dueAt: dueAt(3), url: null },
    { id: 'up-4', title: 'Unit 2 Test: Branches of Government', courseId: 'us-gov', dueAt: dueAt(5), url: null },
    { id: 'up-5', title: 'Interpersonal Speaking Practice', courseId: 'spanish', dueAt: dueAt(6), url: null },
    { id: 'up-6', title: 'College Counseling Survey', courseId: null, dueAt: dueAt(8), url: null },
    { id: 'up-7', title: 'Unit 3 Test: Integrals', courseId: 'calc-bc', dueAt: dueAt(10), url: null },
  ];

  return {
    schemaVersion: GRADEBOOK_SCHEMA_VERSION,
    courses,
    upcoming,
    updatedAt: now.toISOString(),
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Local calendar date as `YYYY-MM-DD`. */
function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}
