/**
 * The grade engine on the phone (F07–F10), so grades work with no internet.
 *
 * A line-for-line port of supabase/migrations/20260924000300_grade_engine.sql
 * and the snapshot in 20260929000500_grade_api.sql: given the same rows, the
 * phone and the server show the same numbers. If you change a rule here,
 * change it there too (and the other way round).
 *
 * The rules:
 *   * Category grade = pooled points of its graded items. Excused and ungraded
 *     items are left out. Extra credit adds earned points, not possible points.
 *     `dropLowest` drops that many of the lowest-percent regular items (but
 *     always keeps at least one).
 *   * Period grade: weighted course → weight-normalized average of the
 *     categories that have a grade; points course → pooled points.
 *   * Course grade: no semester exams → weight-normalized average of the graded
 *     periods; semester exams → average of the graded semester grades.
 *   * Semester grade = graded quarters averaged, blended with the exam by the
 *     exam's weight (default 20%). A missing exam drops out.
 *   * When no row at a level has a weight, all rows at that level count equally.
 */
import type {
  CategoryGrades,
  CourseGrades,
  LetterGrade,
  PeriodGrades,
  SemesterGrades,
  UngradedAssignment,
} from '@/api/grades';

import type { GradeAssignment, GradeCategory, GradeCourse, GradePeriod } from './types';

export const DEFAULT_EXAM_WEIGHT = 20;

/** The default US +/- scale (grading_scale_bands in the database), highest first. */
export const DEFAULT_SCALE: readonly { letter: string; minPercent: number }[] = [
  { letter: 'A+', minPercent: 97 },
  { letter: 'A', minPercent: 93 },
  { letter: 'A-', minPercent: 90 },
  { letter: 'B+', minPercent: 87 },
  { letter: 'B', minPercent: 83 },
  { letter: 'B-', minPercent: 80 },
  { letter: 'C+', minPercent: 77 },
  { letter: 'C', minPercent: 73 },
  { letter: 'C-', minPercent: 70 },
  { letter: 'D+', minPercent: 67 },
  { letter: 'D', minPercent: 63 },
  { letter: 'D-', minPercent: 60 },
  { letter: 'F', minPercent: 0 },
];

/** How to score assignments: actual grades only, or forecasts filling the gaps. */
export type GradeOptions = {
  projected?: boolean;
  /** "What if I got X on this?" — replaces one assignment's score (F08, F09). */
  override?: { assignmentId: string; score: number };
};

/** Rounds to 2 decimals, half away from zero, like Postgres `round(numeric, 2)`. */
export function round2(value: number): number;
export function round2(value: number | null): number | null;
export function round2(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return Math.sign(value) * (Math.round(Math.abs(value) * 100 + 1e-9) / 100);
}

export function letterFor(percent: number | null): string | null {
  if (percent === null) {
    return null;
  }
  const rounded = round2(percent);
  return DEFAULT_SCALE.find((band) => band.minPercent <= rounded)?.letter ?? null;
}

function scoreOf(a: GradeAssignment, options: GradeOptions): number | null {
  if (options.override && a.id === options.override.assignmentId) {
    return options.override.score;
  }
  return options.projected ? (a.actualScore ?? a.forecastScore) : a.actualScore;
}

/** Weight-normalized average; rows with no percent drop out. `null` when nothing counts. */
function weightedAverage(rows: { percent: number | null; weight: number }[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const row of rows) {
    if (row.percent !== null) {
      sum += row.percent * row.weight;
      weights += row.weight;
    }
  }
  return weights > 0 ? sum / weights : null;
}

/** Each row's weight; when none at this level has one, every row counts 1. */
function effectiveWeights<T extends { weight: number | null }>(rows: T[]): number[] {
  const anyWeight = rows.some((row) => row.weight !== null);
  return rows.map((row) => (anyWeight ? (row.weight ?? 0) : 1));
}

export type CategoryResult = { earned: number | null; possible: number | null; percent: number | null };

export function categoryGrade(category: GradeCategory, options: GradeOptions = {}): CategoryResult {
  const scored = category.assignments
    .filter((a) => !a.excused)
    .map((a) => ({ a, score: scoreOf(a, options) }))
    .filter((s): s is { a: GradeAssignment; score: number } => s.score !== null);

  const regular = scored
    .filter((s) => !s.a.extraCredit)
    .sort((x, y) => x.score / x.a.maxScore - y.score / y.a.maxScore || compareIds(x.a.id, y.a.id));
  const dropped = Math.min(category.dropLowest, Math.max(regular.length - 1, 0));
  const kept = [...regular.slice(dropped), ...scored.filter((s) => s.a.extraCredit)];

  if (kept.length === 0) {
    return { earned: null, possible: null, percent: null };
  }
  const earned = kept.reduce((sum, s) => sum + s.score, 0);
  const possible = kept.reduce((sum, s) => sum + (s.a.extraCredit ? 0 : s.a.maxScore), 0);
  return { earned, possible, percent: possible > 0 ? (100 * earned) / possible : null };
}

/** Postgres orders uuids by their bytes, which matches comparing lowercase hex strings. */
function compareIds(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function periodGrade(
  period: GradePeriod,
  gradingMode: GradeCourse['gradingMode'],
  options: GradeOptions = {},
): number | null {
  const grades = period.categories.map((c) => categoryGrade(c, options));
  if (gradingMode === 'points') {
    let earned = 0;
    let possible = 0;
    for (const g of grades) {
      earned += g.earned ?? 0;
      possible += g.possible ?? 0;
    }
    return possible > 0 ? (100 * earned) / possible : null;
  }
  const weights = effectiveWeights(period.categories);
  return weightedAverage(grades.map((g, i) => ({ percent: g.percent, weight: weights[i] })));
}

/** Which semester a period belongs to: its own setting, or guessed from its name. */
export function semesterOf(period: Pick<GradePeriod, 'semester' | 'name'>): number | null {
  if (period.semester !== null) {
    return period.semester;
  }
  const name = period.name;
  if (/^\s*q(uarter)?\s*[12]([^0-9]|$)/i.test(name)) return 1;
  if (/^\s*q(uarter)?\s*[34]([^0-9]|$)/i.test(name)) return 2;
  if (/midterm/i.test(name)) return 1;
  if (/final/i.test(name)) return 2;
  return null;
}

export type SemesterResult = {
  semester: number;
  quartersPercent: number | null;
  examPercent: number | null;
  examWeight: number;
  percent: number | null;
};

function byPosition<T extends { position: number; name: string }>(a: T, b: T): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

export function semesterGrades(
  course: GradeCourse,
  options: GradeOptions = {},
  defaultExamWeight: number = DEFAULT_EXAM_WEIGHT,
): SemesterResult[] {
  const periods = [...course.periods].sort(byPosition).map((p) => ({
    period: p,
    sem: semesterOf(p),
    percent: periodGrade(p, course.gradingMode, options),
  }));
  const semesters = [...new Set(periods.map((p) => p.sem).filter((s): s is number => s !== null))].sort(
    (a, b) => a - b,
  );

  return semesters.map((sem) => {
    const quarters = periods.filter(
      (p) => p.period.kind === 'quarter' && p.sem === sem && p.percent !== null,
    );
    const q =
      quarters.length > 0
        ? quarters.reduce((sum, p) => sum + (p.percent as number), 0) / quarters.length
        : null;
    const exam = periods.find((p) => p.period.kind === 'semester_exam' && p.sem === sem);
    const examPercent = exam ? exam.percent : null;
    const w = exam?.period.weight ?? defaultExamWeight;

    let percent: number | null;
    if (q === null) percent = examPercent;
    else if (examPercent === null) percent = q;
    else percent = (q * (100 - w)) / 100 + (examPercent * w) / 100;

    return { semester: sem, quartersPercent: q, examPercent, examWeight: w, percent };
  });
}

export function coursePercent(
  course: GradeCourse,
  options: GradeOptions = {},
  defaultExamWeight: number = DEFAULT_EXAM_WEIGHT,
): number | null {
  if (course.periods.some((p) => p.kind === 'semester_exam')) {
    const graded = semesterGrades(course, options, defaultExamWeight).filter((s) => s.percent !== null);
    return graded.length > 0
      ? graded.reduce((sum, s) => sum + (s.percent as number), 0) / graded.length
      : null;
  }
  const weights = effectiveWeights(course.periods);
  return weightedAverage(
    course.periods.map((p, i) => ({
      percent: periodGrade(p, course.gradingMode, options),
      weight: weights[i],
    })),
  );
}

function letterGrade(percent: number | null): LetterGrade {
  return { percent: round2(percent), letter: letterFor(percent) };
}

/**
 * Everything the grades screens show for one course: the same shape (and the
 * same numbers) as the server's `get_grades` snapshot.
 */
export function computeCourseGrades(
  course: GradeCourse,
  defaultExamWeight: number = DEFAULT_EXAM_WEIGHT,
): CourseGrades {
  const current: GradeOptions = {};
  const projected: GradeOptions = { projected: true };
  const periods = [...course.periods].sort(byPosition);

  const periodGrades: PeriodGrades[] = periods.map((p) => ({
    periodId: p.id,
    name: p.name,
    kind: p.kind,
    semester: semesterOf(p),
    weight: p.weight,
    currentPercent: round2(periodGrade(p, course.gradingMode, current)),
    projectedPercent: round2(periodGrade(p, course.gradingMode, projected)),
    categories: [...p.categories].sort(byPosition).map(
      (c): CategoryGrades => ({
        categoryId: c.id,
        name: c.name,
        weight: c.weight,
        dropLowest: c.dropLowest,
        currentPercent: round2(categoryGrade(c, current).percent),
        projectedPercent: round2(categoryGrade(c, projected).percent),
      }),
    ),
  }));

  const currentSemesters = semesterGrades(course, current, defaultExamWeight);
  const projectedSemesters = semesterGrades(course, projected, defaultExamWeight);
  const semesters: SemesterGrades[] = currentSemesters.map((s) => ({
    semester: s.semester,
    label: s.semester === 1 ? 'Midterm' : s.semester === 2 ? 'Final' : null,
    examWeight: s.examWeight,
    currentPercent: round2(s.percent),
    projectedPercent: round2(projectedSemesters.find((p) => p.semester === s.semester)?.percent ?? null),
  }));

  const ungraded: UngradedAssignment[] = periods
    .flatMap((p) =>
      p.categories.flatMap((c) =>
        c.assignments
          .filter((a) => a.actualScore === null && !a.excused)
          .map((a) => ({
            assignmentId: a.id,
            periodId: p.id,
            categoryId: c.id,
            title: a.title,
            dueDate: a.dueDate,
            maxScore: a.maxScore,
            forecastScore: a.forecastScore,
            isPlaceholder: a.isPlaceholder,
          })),
      ),
    )
    .sort(
      (x, y) =>
        (x.dueDate === null ? 1 : 0) - (y.dueDate === null ? 1 : 0) ||
        (x.dueDate ?? '').localeCompare(y.dueDate ?? '') ||
        x.title.localeCompare(y.title),
    );

  return {
    courseId: course.id,
    name: course.name,
    teacher: course.teacher,
    gradingMode: course.gradingMode,
    current: letterGrade(coursePercent(course, current, defaultExamWeight)),
    projected: letterGrade(coursePercent(course, projected, defaultExamWeight)),
    periods: periodGrades,
    semesters,
    ungraded,
  };
}

export type RequiredScore =
  | { status: 'already_secured' }
  | { status: 'not_possible' }
  | { status: 'needed'; requiredScore: number; requiredPercent: number };

/**
 * "What do I need on this assignment to reach `targetPercent`?" (F09)
 * Other work uses actual grades only, unless `useForecasts` is on.
 * Returns `null` when the assignment is missing, excused, or extra credit.
 */
export function requiredScore(
  course: GradeCourse,
  assignmentId: string,
  targetPercent: number,
  useForecasts = false,
  defaultExamWeight: number = DEFAULT_EXAM_WEIGHT,
): RequiredScore | null {
  const assignment = course.periods
    .flatMap((p) => p.categories.flatMap((c) => c.assignments))
    .find((a) => a.id === assignmentId);
  if (!assignment || assignment.excused || assignment.extraCredit) {
    return null;
  }
  const max = assignment.maxScore;
  const gradeWith = (score: number) =>
    coursePercent(
      course,
      { projected: useForecasts, override: { assignmentId, score } },
      defaultExamWeight,
    );

  const atZero = gradeWith(0);
  if (atZero !== null && atZero >= targetPercent) {
    return { status: 'already_secured' };
  }
  const atMax = gradeWith(max);
  if (atMax === null || atMax < targetPercent) {
    return { status: 'not_possible' };
  }

  // The course grade never goes down when this score goes up, so a binary
  // search finds the smallest score that reaches the target.
  let low = 0;
  let high = max;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if ((gradeWith(mid) ?? -Infinity) >= targetPercent) high = mid;
    else low = mid;
  }
  // Report to the cent: the rounded value if it reaches the target, else round up.
  const rounded = round2(high);
  high =
    (gradeWith(rounded) ?? -Infinity) >= targetPercent ? rounded : Math.min(Math.ceil(high * 100) / 100, max);
  return { status: 'needed', requiredScore: high, requiredPercent: round2((100 * high) / max) };
}
