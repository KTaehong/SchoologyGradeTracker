/**
 * Saved-report import (F05, T2.3): reads a Schoology Grades page that the
 * student saved as a file (File → Save Page As… in a browser) and rebuilds the
 * gradebook from it: course → grading period → category → assignment, with
 * weights and scores.
 *
 * It works on the page's visible text, not on Schoology's CSS class names, so
 * a markup change on their side does not break it. Each table row becomes one
 * line of text, and a small grammar sorts those lines:
 *
 *   "AP Biology: Section 3"                       → a class (the line above its first period)
 *   "Quarter 1 (25%)  93.4%  A"                   → a grading period, weight 25
 *   "Tests (40%)  91%"                            → a category, weight 40
 *   "Unit 2 Test  Due 10/02/26 11:59pm  18 / 20"  → an assignment
 *
 * Plain functions with no phone APIs, so all of it is tested in Jest.
 */
import type {
  GradeAssignment,
  GradeCategory,
  GradeCourse,
  GradePeriod,
  PeriodKind,
} from '@/engine/types';

// ---------------------------------------------------------------------------
// HTML → lines
// ---------------------------------------------------------------------------

const BLOCK_TAGS =
  'address|article|aside|blockquote|body|caption|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|tfoot|thead|title|ul';
const DROP_ELEMENTS = /<(script|style|noscript|template|svg|head|select)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TABLE_ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
const BLOCK_TAG = new RegExp(String.raw`<\/?(?:${BLOCK_TAGS})\b[^>]*>|<br\s*\/?>`, 'gi');
const ANY_TAG = /<[^>]+>/g;

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * The page's visible text, one line per table row or block. Every cell of a
 * table row stays on one line, so an assignment's name, due date and score are
 * read together.
 */
export function htmlToLines(html: string): string[] {
  const body = html
    .replace(COMMENTS, ' ')
    .replace(DROP_ELEMENTS, ' ')
    .replace(TABLE_ROW, (_, cells: string) => `\n${cells.replace(ANY_TAG, ' ')}\n`)
    .replace(BLOCK_TAG, '\n')
    .replace(ANY_TAG, ' ');
  return decodeEntities(body)
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s ​]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

// ---------------------------------------------------------------------------
// Lines → gradebook
// ---------------------------------------------------------------------------

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const DATE =
  /(?:due[:\s]*)?\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(?:(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4}))(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*[ap]\.?m\.?)?/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "18 / 20", "— / 20", "18.5/20". The last one on the line is the grade. */
const SCORE = new RegExp(String.raw`(?:(${NUMBER}|[-–—]+)|excused|missing)\s*\/\s*(${NUMBER})`, 'gi');
/** "(40%)" — a weight is always in brackets; a bare "93%" is a grade. */
const WEIGHT = new RegExp(String.raw`\(\s*(?:weight[:\s]*)?(${NUMBER})\s*%\s*\)`, 'i');
const PERIOD_NAME =
  /^(?:quarter|semester|trimester|term|marking period|grading period|q[1-4]|s[12]|t[1-3]|mp\s*\d|midterm|final|mid-term|semester exam)\b/i;
const EXAM_NAME = /\b(?:midterm|mid-term|final)\b(?:\s+exam)?|\bsemester\s+exam\b|\bexam\b/i;
/** A grade summary at the end of a heading: "93.4%", "A-", "93.4% A-", "—". */
const TRAILING_SUMMARY = new RegExp(
  String.raw`(?:\s+(?:${NUMBER}\s*%|[A-F][+-]?|[-–—]+|N\/A))+\s*$`,
  'i',
);
const EXCUSED = /\bexcused\b/i;
const MISSING = /\bmissing\b/i;
const EXTRA_CREDIT = /\bextra credit\b/i;
/** Lines that are page chrome, never a class name. */
const CHROME =
  /^(?:grades?|course grades?|overall|overall grade|course grade|grading period|category|assignment|assignments|score|due|due date|comments?|materials|updates|members|courses|groups|resources|home|recent activity|calendar|messages|print|export|show all|hide|expand all|collapse all|grade report|final grade|letter grade|\d+(?:\.\d+)?\s*%|[A-F][+-]?|[|•·.,:;\-–—_]+)$/i;
/** Class titles on Schoology read "Course name: Section name". */
const COURSE_TITLE = /^.{2,80}:\s*\S.{0,60}$/;

export type ReportSummary = {
  courses: GradeCourse[];
  /** Assignment rows read, across every course. */
  assignmentCount: number;
};

type Draft = {
  course: GradeCourse | null;
  period: GradePeriod | null;
  category: GradeCategory | null;
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The due date on the line, as `YYYY-MM-DD`, and the line without it. */
function takeDate(line: string): { date: string | null; rest: string } {
  const m = DATE.exec(line);
  if (!m) return { date: null, rest: line };
  let date: string | null;
  if (m[1]) {
    const year = Number(m[3]) + (m[3].length === 2 ? 2000 : 0);
    date = isoDate(year, Number(m[1]), Number(m[2]));
  } else {
    date = isoDate(Number(m[6]), MONTHS.indexOf(m[4].toLowerCase()) + 1, Number(m[5]));
  }
  return { date, rest: line.replace(m[0], ' ') };
}

/** The grade on the line; `earned` is `null` for "Excused / 10" or "Missing / 10". */
function lastScore(line: string): { match: string; index: number; earned: string | null; max: string } | null {
  let found: RegExpExecArray | null = null;
  SCORE.lastIndex = 0;
  for (let m = SCORE.exec(line); m; m = SCORE.exec(line)) found = m;
  return found ? { match: found[0], index: found.index, earned: found[1] ?? null, max: found[2] } : null;
}

/** "Quarter 1 (25%) 93.4% A" → { name: "Quarter 1", weight: 25 }. */
function readHeading(line: string): { name: string; weight: number | null } {
  const weight = WEIGHT.exec(line);
  const beforeWeight = weight ? line.slice(0, weight.index) : line;
  const name = beforeWeight.replace(TRAILING_SUMMARY, '').replace(/[:\s]+$/, '').trim();
  return { name, weight: weight ? Number(weight[1]) : null };
}

function periodKind(name: string): PeriodKind {
  if (EXAM_NAME.test(name)) return 'semester_exam';
  if (/^(?:quarter|q[1-4]\b|marking period|mp\s*\d)/i.test(name)) return 'quarter';
  return 'other';
}

function cleanTitle(text: string): string {
  return text
    .replace(/\b(?:missing|excused|late|extra credit|not graded|ungraded)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .trim();
}

/**
 * Builds the gradebook from the page's lines. `newId` makes each row's id.
 * Classes with no assignments (page chrome that looked like a class) are dropped.
 */
export function parseReportLines(lines: string[], newId: () => string): ReportSummary {
  const courses: GradeCourse[] = [];
  const draft: Draft = { course: null, period: null, category: null };
  /** The last line that was not a period, category, or assignment. */
  let lastPlain: string | null = null;
  let assignmentCount = 0;

  const startCourse = (name: string) => {
    draft.course = {
      id: newId(),
      name,
      teacher: null,
      gradingMode: 'points',
      position: courses.length + 1,
      periods: [],
    };
    courses.push(draft.course);
    draft.period = null;
    draft.category = null;
  };
  const ensureCourse = () => {
    if (!draft.course) startCourse(lastPlain ?? 'Imported class');
    return draft.course as GradeCourse;
  };
  const startPeriod = (name: string, weight: number | null) => {
    const course = ensureCourse();
    draft.period = {
      id: newId(),
      name,
      kind: periodKind(name),
      semester: null,
      weight,
      position: course.periods.length + 1,
      categories: [],
    };
    course.periods.push(draft.period);
    draft.category = null;
  };
  const ensurePeriod = () => {
    if (!draft.period) startPeriod('Grades', null);
    return draft.period as GradePeriod;
  };
  const startCategory = (name: string, weight: number | null) => {
    const period = ensurePeriod();
    draft.category = {
      id: newId(),
      name,
      weight,
      dropLowest: 0,
      position: period.categories.length + 1,
      assignments: [],
    };
    period.categories.push(draft.category);
  };
  const ensureCategory = () => {
    if (!draft.category) startCategory('Assignments', null);
    return draft.category as GradeCategory;
  };

  for (const line of lines) {
    const { date, rest } = takeDate(line);
    const score = lastScore(rest);
    const isRow = score !== null || date !== null || EXCUSED.test(rest) || MISSING.test(rest);

    // 1) A grading period heading. A new period after a plain line starts a new
    //    class when the current class already has periods (the next class's title).
    if (!isRow && PERIOD_NAME.test(line)) {
      const { name, weight } = readHeading(line);
      const title = lastPlain;
      if (
        title &&
        (!draft.course || (draft.course.periods.length > 0 && title !== draft.course.name))
      ) {
        startCourse(title);
      }
      startPeriod(name || 'Grading period', weight);
      lastPlain = null;
      continue;
    }

    // 2) A category heading: a name with a weight in brackets, and no score.
    if (!isRow && WEIGHT.test(line)) {
      const { name, weight } = readHeading(line);
      if (name.length > 0 && name.length <= 60) {
        if (lastPlain && draft.course && draft.course.periods.length > 0 && COURSE_TITLE.test(lastPlain)) {
          startCourse(lastPlain);
        }
        startCategory(name, weight);
        lastPlain = null;
        continue;
      }
    }

    // 3) An assignment row.
    if (isRow) {
      const cut = score ? rest.slice(0, score.index) : rest;
      const title = cleanTitle(cut.replace(TRAILING_SUMMARY, ''));
      if (title.length === 0) continue;
      const excused = EXCUSED.test(rest);
      const max = score ? Number(score.max) : 0;
      const earned = score?.earned && !/^[-–—]+$/.test(score.earned) ? Number(score.earned) : null;
      const category = ensureCategory();
      const assignment: GradeAssignment = {
        id: newId(),
        title,
        dueDate: date,
        maxScore: Number.isFinite(max) ? max : 0,
        actualScore: excused ? null : earned,
        forecastScore: null,
        excused,
        extraCredit: EXTRA_CREDIT.test(rest) || (max === 0 && earned !== null && earned > 0),
        isPlaceholder: false,
        position: category.assignments.length + 1,
      };
      category.assignments.push(assignment);
      assignmentCount++;
      lastPlain = null;
      continue;
    }

    // 4) Anything else: maybe the next class's title, which is confirmed when
    //    a period or category heading follows it.
    if (!CHROME.test(line)) {
      lastPlain = line;
    }
  }

  const kept = courses
    .filter((c) => c.periods.some((p) => p.categories.some((k) => k.assignments.length > 0)))
    .map((c, i) => ({
      ...c,
      position: i + 1,
      gradingMode: c.periods.some((p) => p.categories.some((k) => k.weight !== null))
        ? ('weighted' as const)
        : ('points' as const),
      // Empty periods/categories are headings with nothing under them yet; keep
      // categories (so weights are right) but drop periods with no categories.
      periods: c.periods.filter((p) => p.categories.length > 0).map((p, j) => ({ ...p, position: j + 1 })),
    }));
  return { courses: kept, assignmentCount };
}

/** Reads a saved Schoology Grades page (`.html`). */
export function parseReport(html: string, newId: () => string): ReportSummary {
  return parseReportLines(htmlToLines(html), newId);
}

/** True when the text looks like a web page at all (vs. a PDF or image picked by mistake). */
export function looksLikeHtml(text: string): boolean {
  return /<(?:!doctype html|html|body|table|div)\b/i.test(text.slice(0, 20000));
}

/**
 * For each imported class, the id of a class already in the gradebook with the
 * same name (ignoring case and spacing), or `null`. Importing a newer copy of
 * the same report can then replace those classes instead of duplicating them.
 */
export function findSameNamedCourses(
  imported: Pick<GradeCourse, 'name'>[],
  existing: Pick<GradeCourse, 'id' | 'name'>[],
): (string | null)[] {
  const key = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map(existing.map((c) => [key(c.name), c.id]));
  return imported.map((c) => byName.get(key(c.name)) ?? null);
}
