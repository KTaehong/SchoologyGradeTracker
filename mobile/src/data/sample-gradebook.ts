/**
 * The sample gradebook (F01/F02): the same courses, grades and forecasts as the
 * server's `load_sample_gradebook()` in
 * supabase/migrations/20260924000400_sample_gradebook.sql, so the phone and the
 * cloud show the same numbers. Dates are relative to `now`.
 */
import type { GradeAssignment, GradeCategory, GradeCourse, GradingMode } from '@/engine/types';

export type SampleUpcoming = { id: string; title: string; courseId: string | null; dueAt: string };

/** [title, actual score, max score, days ago, options] — like the SQL sample. */
type Row = [string, number | null, number, number, { ex?: boolean; ec?: boolean; f?: number }?];

type SampleCourse = {
  name: string;
  teacher: string;
  mode: GradingMode;
  categories: { name: string; weight: number | null; drop?: number; assignments: Row[] }[];
  q2?: Record<string, Row[]>;
  midterm?: Row;
};

const SAMPLE: SampleCourse[] = [
  {
    name: 'AP Calculus BC',
    teacher: 'Ms. Rivera',
    mode: 'weighted',
    categories: [
      {
        name: 'Tests',
        weight: 50,
        assignments: [
          ['Unit 1 Test: Limits', 88, 100, 30],
          ['Unit 2 Test: Derivatives', 92, 100, 9],
        ],
      },
      {
        name: 'Quizzes',
        weight: 30,
        assignments: [
          ['Quiz 1.1', 9, 10, 35],
          ['Quiz 1.2', 8, 10, 26],
          ['Quiz 2.1', 10, 10, 16],
          ['Quiz 2.2', null, 10, 2, { f: 9 }],
        ],
      },
      {
        name: 'Homework',
        weight: 20,
        drop: 1,
        assignments: [
          ['Problem Set 1', 10, 10, 38],
          ['Problem Set 2', 7, 10, 31],
          ['Problem Set 3', 10, 10, 24],
          ['Problem Set 4', 0, 10, 17],
          ['Problem Set 5', 9, 10, 10],
        ],
      },
    ],
    q2: { Tests: [['Unit 3 Test: Integrals', 90, 100, -10]] },
    midterm: ['Semester 1 Midterm Exam', 85, 100, -60],
  },
  {
    name: 'AP Physics C: E&M',
    teacher: 'Mr. Okafor',
    mode: 'weighted',
    categories: [
      { name: 'Tests', weight: 50, assignments: [['Electrostatics Test', 41, 50, 20]] },
      {
        name: 'Labs',
        weight: 25,
        assignments: [
          ["Coulomb's Law Lab", 18, 20, 33],
          ['Electric Field Mapping Lab', 19, 20, 19],
          ['Capacitor Lab', null, 20, 5, { ex: true }],
        ],
      },
      {
        name: 'Problem Sets',
        weight: 25,
        assignments: [
          ['PS 1: Charge & Force', 14, 15, 36],
          ['PS 2: Gauss’s Law', 12, 15, 22],
          ['PS 3: Potential', 15, 15, 8],
        ],
      },
    ],
  },
  {
    name: 'AP English Literature',
    teacher: 'Dr. Chen',
    mode: 'weighted',
    categories: [
      {
        name: 'Essays',
        weight: 50,
        assignments: [
          ['Poetry Analysis Essay', 44, 50, 25],
          ['Prose Timed Write', 7, 9, 11, { f: 8 }],
        ],
      },
      {
        name: 'Reading Quizzes',
        weight: 30,
        assignments: [
          ['Frankenstein Ch. 1–5', 9, 10, 32],
          ['Frankenstein Ch. 6–12', 10, 10, 23],
          ['Frankenstein Ch. 13–24', 8, 10, 14],
          ['Bonus: Author Research', 3, 0, 12, { ec: true }],
        ],
      },
      {
        name: 'Participation',
        weight: 20,
        assignments: [
          ['Seminar 1', 10, 10, 29],
          ['Seminar 2', 9, 10, 15],
        ],
      },
    ],
  },
  {
    name: 'AP Spanish Language',
    teacher: 'Sra. Morales',
    mode: 'points',
    categories: [
      {
        name: 'All work',
        weight: null,
        assignments: [
          ['Vocab Quiz: Familia', 18, 20, 34],
          ['Presentational Speaking', 45, 50, 21],
          ['Email Reply', 24, 25, 13],
          ['Unit 1 Exam', 88, 100, 6],
        ],
      },
    ],
  },
  {
    name: 'AP US Government',
    teacher: 'Mr. Patel',
    mode: 'weighted',
    categories: [
      { name: 'Tests', weight: 60, assignments: [['Unit 1: Foundations', 47, 55, 18, { f: 50 }]] },
      {
        name: 'Classwork',
        weight: 40,
        assignments: [
          ['Federalist 10 Reading Notes', 10, 10, 37],
          ['Constitution Scavenger Hunt', 19, 20, 27],
          ['Court Case Brief', 14, 15, 7],
        ],
      },
    ],
  },
];

/** [title, course name, days from today] */
const UPCOMING: [string, string | null, number][] = [
  ['Problem Set 6', 'AP Calculus BC', 1],
  ['Seminar 3 prep questions', 'AP English Literature', 1],
  ['PS 4: Capacitance', 'AP Physics C: E&M', 3],
  ['Unit 2 Test: Branches of Government', 'AP US Government', 5],
  ['Interpersonal Speaking Practice', 'AP Spanish Language', 6],
  ['College Counseling Survey', null, 8],
  ['Unit 3 Test: Integrals', 'AP Calculus BC', 10],
];

function dateOnly(now: Date, offsetDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Builds the sample. `newId` makes the row ids (the app passes a UUID maker so
 * the rows can later sync to the cloud).
 */
export function createSampleGradebook(
  newId: () => string,
  now: Date = new Date(),
): { courses: GradeCourse[]; upcoming: SampleUpcoming[] } {
  const assignment = (row: Row, position: number, placeholder = false): GradeAssignment => {
    const [title, score, maxScore, daysAgo, options = {}] = row;
    return {
      id: newId(),
      title,
      dueDate: dateOnly(now, -daysAgo),
      maxScore,
      // A Q2 / midterm row's "score" is its forecast: the work is not graded yet.
      actualScore: placeholder ? null : score,
      forecastScore: placeholder ? score : (options.f ?? null),
      excused: options.ex ?? false,
      extraCredit: options.ec ?? false,
      isPlaceholder: placeholder,
      position,
    };
  };

  const courses = SAMPLE.map((sample, courseIndex): GradeCourse => {
    const q1: GradeCategory[] = [];
    const q2: GradeCategory[] = [];
    sample.categories.forEach((cat, catIndex) => {
      const base = { name: cat.name, weight: cat.weight, dropLowest: cat.drop ?? 0, position: catIndex + 1 };
      q1.push({ ...base, id: newId(), assignments: cat.assignments.map((r, i) => assignment(r, i + 1)) });
      q2.push({
        ...base,
        id: newId(),
        assignments: (sample.q2?.[cat.name] ?? []).map((r, i) => assignment(r, i + 1, true)),
      });
    });

    const periods: GradeCourse['periods'] = [
      { id: newId(), name: 'Q1', kind: 'quarter', semester: 1, weight: null, position: 1, categories: q1 },
      { id: newId(), name: 'Q2', kind: 'quarter', semester: 1, weight: null, position: 2, categories: q2 },
    ];
    if (sample.midterm) {
      periods.push({
        id: newId(),
        name: 'Midterm Exam',
        kind: 'semester_exam',
        semester: 1,
        weight: 20,
        position: 3,
        categories: [
          {
            id: newId(),
            name: 'Exam',
            weight: null,
            dropLowest: 0,
            position: 1,
            assignments: [assignment(sample.midterm, 0, true)],
          },
        ],
      });
    }

    return {
      id: newId(),
      name: sample.name,
      teacher: sample.teacher,
      gradingMode: sample.mode,
      position: courseIndex + 1,
      periods,
    };
  });

  const upcoming = UPCOMING.map(([title, courseName, days]) => {
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59);
    return {
      id: newId(),
      title,
      courseId: courses.find((c) => c.name === courseName)?.id ?? null,
      dueAt: due.toISOString(),
    };
  });

  return { courses, upcoming };
}
