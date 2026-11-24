/**
 * Test helper: the server's grade API (supabase/migrations/20260929000500_grade_api.sql).
 *
 * The app computes every grade on the phone, so no screen calls this. The tests
 * use it to check that the server's grade engine agrees with the phone's.
 */
import type { RpcCaller } from '@/api/rpc';
import type { GradingMode } from '@/data/types';
import type { CourseGrades, LetterGrade, NewForecast, PeriodKind } from '@/engine/grade-types';

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

type WireUngraded = {
  assignment_id: string;
  period_id: string;
  category_id: string;
  title: string;
  due_date: string | null;
  max_score: number;
  forecast_score: number | null;
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
  ungraded: WireUngraded[];
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
    ungraded: wire.ungraded.map((f) => ({
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

    /**
     * Fills an empty account with the sample gradebook (F01), so there is
     * something to explore. Rejects if the account already has courses.
     */
    async loadSampleGradebook(): Promise<void> {
      await call('load_sample_gradebook');
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
