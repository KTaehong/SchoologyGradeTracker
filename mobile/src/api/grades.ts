/**
 * Grade engine API (F02, F03, F08, F10): the grades snapshot and manual forecasts.
 *
 * Each call maps to one SQL function in
 * supabase/migrations/20260929000500_grade_api.sql. The server computes the
 * grades with the same rules as the app and returns snake_case JSON; this file
 * turns it into the camelCase types below.
 *
 * Percents are 0–100 rounded to 2 decimals; `null` means nothing is graded yet.
 * "Current" uses actual scores only; "projected" fills ungraded work with forecasts.
 */
import type { GradingMode } from '@/data/types';

import type { RpcCaller } from './rpc';

export type LetterGrade = { percent: number | null; letter: string | null };

export type CategoryGrades = {
  categoryId: string;
  name: string;
  weight: number | null;
  dropLowest: number;
  currentPercent: number | null;
  projectedPercent: number | null;
};

export type PeriodKind = 'quarter' | 'semester_exam' | 'other';

export type PeriodGrades = {
  periodId: string;
  name: string;
  kind: PeriodKind;
  /** 1 or 2, from the period itself or its name (Q1/Q2/Midterm → 1). */
  semester: number | null;
  weight: number | null;
  currentPercent: number | null;
  projectedPercent: number | null;
  categories: CategoryGrades[];
};

export type SemesterGrades = {
  semester: number;
  label: 'Midterm' | 'Final' | null;
  /** The exam's share of the semester grade, in percent. */
  examWeight: number;
  currentPercent: number | null;
  projectedPercent: number | null;
};

/** A forecast that is still waiting for a real grade. */
export type PendingForecast = {
  assignmentId: string;
  periodId: string;
  categoryId: string;
  title: string;
  /** `YYYY-MM-DD`, when known. */
  dueDate: string | null;
  maxScore: number;
  forecastScore: number;
  /** `true` for work that is not in Schoology yet (added with `addForecast`). */
  isPlaceholder: boolean;
};

export type CourseGrades = {
  courseId: string;
  name: string;
  teacher: string | null;
  gradingMode: GradingMode;
  current: LetterGrade;
  projected: LetterGrade;
  periods: PeriodGrades[];
  semesters: SemesterGrades[];
  forecasts: PendingForecast[];
};

export type GradesSnapshot = {
  /** When the server computed these grades (ISO 8601). */
  computedAt: string;
  courses: CourseGrades[];
};

/** The assignment a forecast call changed. */
export type ForecastAssignment = {
  id: string;
  categoryId: string;
  title: string;
  dueDate: string | null;
  maxScore: number;
  actualScore: number | null;
  forecastScore: number | null;
  isPlaceholder: boolean;
};

export type ForecastResult = {
  /** `null` after `removeForecast` deletes a forecast-only item. */
  assignment: ForecastAssignment | null;
  /** The course's grades after the change, ready to show. */
  course: CourseGrades;
};

export type NewForecast = {
  /** The category the work belongs to (from `CourseGrades.periods[].categories[]`). */
  categoryId: string;
  title: string;
  /** Points possible; must be more than 0. */
  maxScore: number;
  /** Points you expect to earn. */
  forecastScore: number;
  /** `YYYY-MM-DD`. */
  dueDate?: string | null;
};

// -----------------------------------------------------------------------------
// Wire format (what the SQL functions return)
// -----------------------------------------------------------------------------

type WireCategory = {
  category_id: string;
  name: string;
  weight: number | null;
  drop_lowest: number;
  current_percent: number | null;
  projected_percent: number | null;
};

type WirePeriod = {
  period_id: string;
  name: string;
  kind: PeriodKind;
  semester: number | null;
  weight: number | null;
  current_percent: number | null;
  projected_percent: number | null;
  categories: WireCategory[];
};

type WireSemester = {
  semester: number;
  label: 'Midterm' | 'Final' | null;
  exam_weight: number;
  current_percent: number | null;
  projected_percent: number | null;
};

type WireForecast = {
  assignment_id: string;
  period_id: string;
  category_id: string;
  title: string;
  due_date: string | null;
  max_score: number;
  forecast_score: number;
  is_placeholder: boolean;
};

type WireCourse = {
  course_id: string;
  name: string;
  teacher: string | null;
  grading_mode: GradingMode;
  current: LetterGrade;
  projected: LetterGrade;
  periods: WirePeriod[];
  semesters: WireSemester[];
  forecasts: WireForecast[];
};

type WireSnapshot = { computed_at: string; courses: WireCourse[] };

type WireAssignment = {
  id: string;
  category_id: string;
  title: string;
  due_date: string | null;
  max_score: number;
  actual_score: number | null;
  forecast_score: number | null;
  is_placeholder: boolean;
};

type WireForecastResult = { assignment: WireAssignment | null; course: WireCourse };

function toCourse(wire: WireCourse): CourseGrades {
  return {
    courseId: wire.course_id,
    name: wire.name,
    teacher: wire.teacher,
    gradingMode: wire.grading_mode,
    current: { percent: wire.current.percent, letter: wire.current.letter },
    projected: { percent: wire.projected.percent, letter: wire.projected.letter },
    periods: wire.periods.map((p) => ({
      periodId: p.period_id,
      name: p.name,
      kind: p.kind,
      semester: p.semester,
      weight: p.weight,
      currentPercent: p.current_percent,
      projectedPercent: p.projected_percent,
      categories: p.categories.map((c) => ({
        categoryId: c.category_id,
        name: c.name,
        weight: c.weight,
        dropLowest: c.drop_lowest,
        currentPercent: c.current_percent,
        projectedPercent: c.projected_percent,
      })),
    })),
    semesters: wire.semesters.map((s) => ({
      semester: s.semester,
      label: s.label,
      examWeight: s.exam_weight,
      currentPercent: s.current_percent,
      projectedPercent: s.projected_percent,
    })),
    forecasts: wire.forecasts.map((f) => ({
      assignmentId: f.assignment_id,
      periodId: f.period_id,
      categoryId: f.category_id,
      title: f.title,
      dueDate: f.due_date,
      maxScore: f.max_score,
      forecastScore: f.forecast_score,
      isPlaceholder: f.is_placeholder,
    })),
  };
}

function toForecastResult(wire: WireForecastResult): ForecastResult {
  const a = wire.assignment;
  return {
    assignment: a && {
      id: a.id,
      categoryId: a.category_id,
      title: a.title,
      dueDate: a.due_date,
      maxScore: a.max_score,
      actualScore: a.actual_score,
      forecastScore: a.forecast_score,
      isPlaceholder: a.is_placeholder,
    },
    course: toCourse(wire.course),
  };
}

// -----------------------------------------------------------------------------
// The API
// -----------------------------------------------------------------------------

export type GradesApi = ReturnType<typeof createGradesApi>;

export function createGradesApi(call: RpcCaller) {
  return {
    /** Current and projected grades for every active course. */
    async getGrades(): Promise<GradesSnapshot> {
      const wire = (await call('get_grades')) as WireSnapshot;
      return { computedAt: wire.computed_at, courses: wire.courses.map(toCourse) };
    },

    /** One course's grades. Rejects with `not_found` if it is not the student's. */
    async getCourseGrades(courseId: string): Promise<CourseGrades> {
      const wire = (await call('get_grades', { p_course_id: courseId })) as WireSnapshot;
      return toCourse(wire.courses[0]);
    },

    /** Forecast work that is not in Schoology yet (saved as a placeholder assignment). */
    async addForecast(forecast: NewForecast): Promise<ForecastResult> {
      const wire = await call('add_forecast', {
        p_category_id: forecast.categoryId,
        p_title: forecast.title,
        p_max_score: forecast.maxScore,
        p_forecast_score: forecast.forecastScore,
        p_due_date: forecast.dueDate ?? null,
      });
      return toForecastResult(wire as WireForecastResult);
    },

    /** Set or change the forecast on an existing assignment. */
    async setForecast(assignmentId: string, forecastScore: number): Promise<ForecastResult> {
      const wire = await call('set_forecast', {
        p_assignment_id: assignmentId,
        p_forecast_score: forecastScore,
      });
      return toForecastResult(wire as WireForecastResult);
    },

    /** Delete a forecast-only item, or clear the forecast on a real assignment. */
    async removeForecast(assignmentId: string): Promise<ForecastResult> {
      const wire = await call('remove_forecast', { p_assignment_id: assignmentId });
      return toForecastResult(wire as WireForecastResult);
    },
  };
}
